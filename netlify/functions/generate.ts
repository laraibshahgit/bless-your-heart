import type { Handler, HandlerEvent } from '@netlify/functions';
import { z } from 'zod';
import { getAnthropicClient, generateLines, checkTone } from '../../src/server/anthropic';
import { hashIp, getClientIp } from '../../src/server/rateLimit';
import { checkSlurFilter, checkRealPersonFilter, checkDistressPhraseList, checkDistressWithHaiku } from '../../src/server/safety';
import { parseGenerationOutput, checkSpecificity } from '../../src/server/validation';
import { selectPhoto } from '../../src/server/photoSelection';
import { getHotlineForCountry } from '../../src/server/hotlines';
import { safeFallbacks } from '../../src/server/fallbacks';
import photos from '../../src/data/photos.json';
import type { Photo, GenerateResponse, RateLimitResult } from '../../src/types';

// Photo library is currently 10 entries (src/data/photos.json). 50 is generous
// for any session and bounds attacker-controlled array length — without it,
// a malicious client could send a multi-MB array of strings and force the
// function to JSON-parse + Zod-validate the whole payload before hitting
// any business logic. Netlify caps the request body at 6MB, so this is a
// belt-and-suspenders defense, but cheaper to enforce than to argue about.
const MAX_EXCLUDE_PHOTO_IDS = 50;

const RequestSchema = z.object({
  prompt: z.string().trim().min(1).max(200),
  excludePhotoIds: z.array(z.string()).max(MAX_EXCLUDE_PHOTO_IDS).default([]),
});

const typedPhotos = photos as Photo[];
const anthropic = getAnthropicClient();

const RATE_LIMIT_TIMEOUT_MS = 3000;
const MAX_RETRIES = 2;

const baseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function jsonResponse(
  body: GenerateResponse,
  statusCode = 200,
  extraHeaders: Record<string, string> = {}
) {
  return {
    statusCode,
    headers: { ...baseHeaders, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function rateLimitHeaders(rate: RateLimitResult | null): Record<string, string> {
  if (!rate) return {};
  const out: Record<string, string> = {};
  if (rate.limit !== undefined) out['X-RateLimit-Limit'] = String(rate.limit);
  if (rate.remaining !== undefined) out['X-RateLimit-Remaining'] = String(rate.remaining);
  if (rate.resetAt !== undefined) out['X-RateLimit-Reset'] = String(rate.resetAt);
  return out;
}

function respondWithSafeFallback(rateHeaders: Record<string, string>) {
  console.log(JSON.stringify({ event: 'gen_safe_fallback' }));
  const fallback = safeFallbacks[Math.floor(Math.random() * safeFallbacks.length)];
  return jsonResponse(
    {
      status: 'safe_fallback',
      line1: fallback.line1,
      line2: fallback.line2,
      photoId: fallback.photoId,
    },
    200,
    rateHeaders
  );
}

function normalizePrompt(raw: string): string {
  return raw.trim().replace(/\n/g, ' ').replace(/\s{2,}/g, ' ');
}

// CSRF / cross-origin cost-amplification defense.
// When ALLOWED_ORIGINS is set (comma-separated list of origins), reject
// browser-originated POSTs whose Origin header is not in the allowlist.
// Server-to-server clients (curl, monitors, function-to-function) typically
// omit Origin and are passed through untouched. Unset env var = no-op,
// preserving backward-compatible behavior. Origin spoofing is impossible
// from a browser context, so this is a meaningful CSRF shield.
function isOriginAllowed(originHeader: string | undefined): boolean {
  if (!originHeader) return true;
  const allowList = (process.env.ALLOWED_ORIGINS ?? '').trim();
  if (!allowList) return true;
  const allowed = allowList.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(originHeader.toLowerCase());
}

// Translate a Zod issue into a short, consumer-safe message: just the failing
// path and the kind of failure. Avoids leaking internal schema shape.
function describeZodIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid request.';
  const path = issue.path.length > 0 ? issue.path.join('.') : 'body';
  switch (issue.code) {
    case 'invalid_type':
      return `Invalid request: ${path} has the wrong type.`;
    case 'too_small':
      return `Invalid request: ${path} is too short.`;
    case 'too_big':
      return `Invalid request: ${path} is too long.`;
    case 'unrecognized_keys':
      return `Invalid request: unexpected fields in ${path}.`;
    default:
      return `Invalid request: ${path} is invalid.`;
  }
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...baseHeaders, Allow: 'POST' },
      body: JSON.stringify({
        status: 'error',
        message: 'Method not allowed. Use POST.',
        retryable: false,
      } satisfies GenerateResponse),
    };
  }

  if (!isOriginAllowed(event.headers.origin ?? event.headers.Origin)) {
    console.log(JSON.stringify({ event: 'gen_block', reason: 'origin' }));
    return jsonResponse(
      { status: 'error', message: 'Forbidden.', retryable: false },
      403
    );
  }

  let parsed;
  try {
    parsed = RequestSchema.parse(JSON.parse(event.body ?? '{}'));
  } catch (err) {
    const message =
      err instanceof z.ZodError ? describeZodIssue(err) : 'Invalid request.';
    return jsonResponse({ status: 'error', message, retryable: false }, 400);
  }

  const prompt = normalizePrompt(parsed.prompt);
  const { excludePhotoIds } = parsed;

  const rawIp = getClientIp(event.headers);
  const hashedIp = hashIp(rawIp);

  let rateResult: RateLimitResult | null = null;
  if (process.env.RATE_LIMIT_PER_HOUR !== '9999') {
    try {
      const { checkAndIncrementRateLimit } = await import('../../src/server/rateLimit');
      rateResult = await Promise.race([
        checkAndIncrementRateLimit(hashedIp),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('rate limit timeout')), RATE_LIMIT_TIMEOUT_MS)),
      ]);
      if (!rateResult.allowed) {
        console.log(JSON.stringify({ event: 'gen_rate_limited', hashedIp }));
        const denyHeaders = rateLimitHeaders(rateResult);
        if (rateResult.retryAfterSec !== undefined) {
          denyHeaders['Retry-After'] = String(rateResult.retryAfterSec);
        }
        return jsonResponse(
          {
            status: 'rate_limited',
            message: 'Even the universe has a daily limit. Try again in a bit.',
            retryAfterSec: rateResult.retryAfterSec,
            resetAt: rateResult.resetAt,
          },
          200,
          denyHeaders
        );
      }
    } catch (err) {
      console.error(JSON.stringify({ event: 'rate_limit_check_failed', error: String(err) }));
      rateResult = null;
    }
  }
  const successRateHeaders = rateLimitHeaders(rateResult);

  if (checkSlurFilter(prompt)) {
    console.log(JSON.stringify({ event: 'gen_block', reason: 'slur' }));
    return jsonResponse(
      { status: 'blocked', message: "Let's try a different one." },
      200,
      successRateHeaders
    );
  }

  if (checkRealPersonFilter(prompt)) {
    console.log(JSON.stringify({ event: 'gen_block', reason: 'real-person' }));
    return jsonResponse(
      {
        status: 'blocked',
        message: "The voice doesn't punch at people. Try a situation instead.",
      },
      200,
      successRateHeaders
    );
  }

  // Short-circuit: phrase list is free; only call Haiku if the phrase list misses.
  const isDistress =
    checkDistressPhraseList(prompt) || (await checkDistressWithHaiku(anthropic, prompt));

  if (isDistress) {
    console.log(JSON.stringify({ event: 'gen_distress' }));
    const country = (event.headers['x-country'] ?? '').toUpperCase();
    return jsonResponse(
      {
        status: 'distress',
        hotline: getHotlineForCountry(country),
      },
      200,
      successRateHeaders
    );
  }

  let lastOutput = null;
  let retries = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await generateLines(anthropic, prompt);
      const output = parseGenerationOutput(raw);

      if (!output) {
        console.log(JSON.stringify({ event: 'gen_retry', reason: 'format' }));
        retries++;
        continue;
      }

      if (!checkSpecificity(prompt, output.line2)) {
        console.log(JSON.stringify({ event: 'gen_retry', reason: 'specificity' }));
        retries++;
        continue;
      }

      const tonePassed = await checkTone(anthropic, prompt, output.line2);
      if (!tonePassed) {
        console.log(JSON.stringify({ event: 'gen_retry', reason: 'tone' }));
        retries++;
        continue;
      }

      lastOutput = output;
      break;
    } catch (err) {
      console.error(JSON.stringify({ event: 'gen_anthropic_error', error: String(err) }));
      retries++;
    }
  }

  if (!lastOutput) {
    return respondWithSafeFallback(successRateHeaders);
  }

  const photoResult = selectPhoto(
    typedPhotos,
    lastOutput.line1.length,
    lastOutput.line2.length,
    excludePhotoIds
  );

  if (!photoResult) {
    return respondWithSafeFallback(successRateHeaders);
  }

  const fittingRung = photoResult.rung;
  console.log(JSON.stringify({
    event: 'gen_ok',
    fittingRung,
    retries,
    model: process.env.ANTHROPIC_MODEL_GEN,
  }));

  return jsonResponse(
    {
      status: 'ok',
      line1: lastOutput.line1,
      line2: lastOutput.line2,
      photoId: photoResult.photoId,
      fittingRung,
    },
    200,
    successRateHeaders
  );
};

export { handler };
