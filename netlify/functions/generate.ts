import type { Handler, HandlerEvent } from '@netlify/functions';
import { z } from 'zod';
import { getAnthropicClient, generateLines, checkTone, getApiErrorStatus } from '../../src/server/anthropic';
import { hashIp, getClientIp } from '../../src/server/rateLimit';
import { checkSlurFilter, checkRealPersonFilter, checkDistressPhraseList, checkDistressWithHaiku } from '../../src/server/safety';
import { parseGenerationOutput, checkSpecificity } from '../../src/server/validation';
import { selectPhoto } from '../../src/server/photoSelection';
import { getHotlineForCountry } from '../../src/server/hotlines';
import { safeFallbacks } from '../../src/server/fallbacks';
import photos from '../../src/data/photos.json';
import {
  MAX_PROMPT_LENGTH,
  MAX_EXCLUDE_PHOTO_IDS,
  MAX_EXCLUDE_PHOTO_ID_LENGTH,
  type Photo,
  type GenerateResponse,
  type RateLimitResult,
} from '../../src/types';
// User-facing wire-format copy lives in `src/content/copy.ts` — the canonical
// source of truth for in-voice messaging. The server imports the strings here
// so a single edit to `errorCopy` updates both the client palette and the API
// response body, eliminating the silent drift that hardcoded duplicates create.
// `copy.ts` has no client-only deps (pure data), so it is safe to bundle into
// the lambda. Pinned by the `errorCopy parity` block in
// `tests/server/generate-contract.test.ts`.
import { errorCopy } from '../../src/content/copy';
import { validateProdEnv } from '../../src/server/configValidation';
import { resolveRequestId, runWithRequestContext, logEvent, logError } from '../../src/server/log';

// Production environment validation. Runs once at lambda cold-start. When
// CONTEXT === 'production' AND a required env var is missing/empty, emits a
// structured `config_validation_failed` log line with the variable list.
// Non-fatal by design — see `src/server/configValidation.ts` for rationale
// (throwing at module load would 502 every user request during the fix
// window; loud logging gets the same signal to ops without that side-effect).
// In dev / deploy-preview / branch-deploy this is a no-op.
validateProdEnv();

// Photo library is currently 10 entries (src/data/photos.json). 50 is generous
// for any session and bounds attacker-controlled array length — without it,
// a malicious client could send a multi-MB array of strings and force the
// function to JSON-parse + Zod-validate the whole payload before hitting
// any business logic. Netlify caps the request body at 6MB, so this is a
// belt-and-suspenders defense, but cheaper to enforce than to argue about.
// Per-element length is also bounded (MAX_EXCLUDE_PHOTO_ID_LENGTH) — without
// it, an attacker could fit ~50 large strings under 6MB and push expensive
// Zod work even though every element is trivially out-of-library on the
// downstream filter. Both bounds live in `src/types/index.ts` so the client
// `App.tsx` accumulator stays aligned with the server contract.
const RequestSchema = z.object({
  prompt: z.string().trim().min(1).max(MAX_PROMPT_LENGTH),
  excludePhotoIds: z
    .array(z.string().min(1).max(MAX_EXCLUDE_PHOTO_ID_LENGTH))
    .max(MAX_EXCLUDE_PHOTO_IDS)
    .default([]),
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

// X-Request-Id is returned on every successful response so the consumer can
// quote it back to support / on-call when reporting an issue. The same ID is
// the `request_id` field on every server log line (see `src/server/log.ts`),
// so a customer-supplied ID is searchable end-to-end.
function withRequestId(
  headers: Record<string, string>,
  requestId: string
): Record<string, string> {
  return { ...headers, 'X-Request-Id': requestId };
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
  logEvent('gen_safe_fallback');
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
  // Resolve the request ID before anything else. Netlify provides
  // `x-nf-request-id` on every invocation; honoring it lets ops correlate
  // application logs with Netlify's own function-invocation logs (cold-
  // start timing, edge cache hits/misses) end-to-end. If the header is
  // missing (server-to-server clients, local netlify dev), generate one.
  // The ID is echoed back as `X-Request-Id` on every response so the
  // browser can quote it back to support, and is automatically attached
  // to every `logEvent` / `logError` call inside `runWithRequestContext`.
  // Audit run 40/001.
  const requestId = resolveRequestId(event.headers);

  return runWithRequestContext({ requestId }, async () => {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { ...baseHeaders, Allow: 'POST', 'X-Request-Id': requestId },
        body: JSON.stringify({
          status: 'error',
          message: 'Method not allowed. Use POST.',
          retryable: false,
        } satisfies GenerateResponse),
      };
    }

    if (!isOriginAllowed(event.headers.origin ?? event.headers.Origin)) {
      logEvent('gen_block', { reason: 'origin' });
      return jsonResponse(
        { status: 'error', message: 'Forbidden.', retryable: false },
        403,
        withRequestId({}, requestId)
      );
    }

    let parsed;
    try {
      parsed = RequestSchema.parse(JSON.parse(event.body ?? '{}'));
    } catch (err) {
      const message =
        err instanceof z.ZodError ? describeZodIssue(err) : 'Invalid request.';
      return jsonResponse(
        { status: 'error', message, retryable: false },
        400,
        withRequestId({}, requestId)
      );
    }

    const prompt = normalizePrompt(parsed.prompt);
    const { excludePhotoIds } = parsed;

    const rawIp = getClientIp(event.headers);
    const hashedIp = hashIp(rawIp);

    let rateResult: RateLimitResult | null = null;
    if (process.env.RATE_LIMIT_PER_HOUR !== '9999') {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const { checkAndIncrementRateLimit } = await import('../../src/server/rateLimit');
        // Lambda runtime caveat: a setTimeout that never fires keeps the event
        // loop alive between invocations on a warm container. The previous shape
        // armed a 3s timer and never cleared it on the success path, leaving a
        // pending callback in the queue after the response was returned. Capture
        // the handle so the finally block can drop it the moment the rate-limit
        // call wins the race; clean exit, no zombie timers.
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error('rate limit timeout')), RATE_LIMIT_TIMEOUT_MS);
        });
        rateResult = await Promise.race([
          checkAndIncrementRateLimit(hashedIp),
          timeoutPromise,
        ]);
        if (!rateResult.allowed) {
          logEvent('gen_rate_limited', { hashedIp });
          const denyHeaders = withRequestId(rateLimitHeaders(rateResult), requestId);
          if (rateResult.retryAfterSec !== undefined) {
            denyHeaders['Retry-After'] = String(rateResult.retryAfterSec);
          }
          return jsonResponse(
            {
              status: 'rate_limited',
              message: errorCopy.rateLimit,
              retryAfterSec: rateResult.retryAfterSec,
              resetAt: rateResult.resetAt,
            },
            200,
            denyHeaders
          );
        }
      } catch (err) {
        logError('rate_limit_check_failed', { error: String(err) });
        rateResult = null;
      } finally {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      }
    }
    const successRateHeaders = withRequestId(rateLimitHeaders(rateResult), requestId);

    if (checkSlurFilter(prompt)) {
      logEvent('gen_block', { reason: 'slur' });
      return jsonResponse(
        { status: 'blocked', message: errorCopy.slurBlock },
        200,
        successRateHeaders
      );
    }

    if (checkRealPersonFilter(prompt)) {
      logEvent('gen_block', { reason: 'real-person' });
      return jsonResponse(
        { status: 'blocked', message: errorCopy.realPersonBlock },
        200,
        successRateHeaders
      );
    }

    // Short-circuit: phrase list is free; only call Haiku if the phrase list misses.
    const isDistress =
      checkDistressPhraseList(prompt) || (await checkDistressWithHaiku(anthropic, prompt));

    if (isDistress) {
      logEvent('gen_distress');
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
    // Track the cumulative wall time spent on the Anthropic retry loop. Surfaced
    // in the gen_ok / gen_safe_fallback log so ops can distinguish "Anthropic
    // was slow" from "Anthropic returned the wrong shape" without correlating
    // multiple log lines. Captured at loop entry so timing covers all attempts.
    // Audit run 33/001.
    const generationStart = Date.now();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await generateLines(anthropic, prompt);
        const output = parseGenerationOutput(raw);

        if (!output) {
          logEvent('gen_retry', { reason: 'format' });
          retries++;
          continue;
        }

        if (!checkSpecificity(prompt, output.line2)) {
          logEvent('gen_retry', { reason: 'specificity' });
          retries++;
          continue;
        }

        const tonePassed = await checkTone(anthropic, prompt, output.line2);
        if (!tonePassed) {
          logEvent('gen_retry', { reason: 'tone' });
          retries++;
          continue;
        }

        lastOutput = output;
        break;
      } catch (err) {
        const status = getApiErrorStatus(err);
        logError('gen_anthropic_error', {
          error: String(err),
          status,
          attempt,
        });
        retries++;
        // Bail early on 4xx (any 400-499). These are never transient:
        //   - 400 BadRequest: malformed request — won't succeed on retry.
        //   - 401 Authentication: missing/invalid API key — won't succeed.
        //   - 403 PermissionDenied: account / scope issue — won't succeed.
        //   - 404 NotFound: invalid model name — won't succeed.
        //   - 422 UnprocessableEntity: prompt rejected — retrying with the
        //     same prompt won't help.
        //   - 429 RateLimit: provider throttled us; the lambda budget (~26s)
        //     can't honor a Retry-After of 30+ seconds, so retrying inside
        //     the same invocation just burns budget and slams a stressed
        //     provider. Better to serve safe_fallback now and let the next
        //     user's lambda hit a fresh window.
        // 5xx and network-level errors (status === undefined: connection
        // timeout, DNS failure, socket drop) remain in the retry loop — those
        // ARE often transient and worth a second attempt within the lambda
        // budget. Pre-fix every error type retried 2× = up to 36s wasted on a
        // misconfigured API key before the user saw safe_fallback.
        // Audit run 33/001.
        if (status !== undefined && status >= 400 && status < 500) {
          break;
        }
      }
    }

    const generationDurationMs = Date.now() - generationStart;

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
    logEvent('gen_ok', {
      fittingRung,
      retries,
      // Wall time across all attempts (generation + tone check + retries).
      // Together with `retries` this lets ops chart "how long is each
      // generation taking" and "is Anthropic getting slower" without
      // instrumenting an APM. Audit run 33/001.
      duration_ms: generationDurationMs,
      model: process.env.ANTHROPIC_MODEL_GEN,
    });

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
  });
};

export { handler };
