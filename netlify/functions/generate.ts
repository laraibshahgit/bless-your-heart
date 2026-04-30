import type { Handler, HandlerEvent } from '@netlify/functions';
import { z } from 'zod';
import { getAnthropicClient, generateLines, checkTone } from '../../src/server/anthropic';
import { hashIp, getClientIp, checkAndIncrementRateLimit } from '../../src/server/rateLimit';
import { checkSlurFilter, checkRealPersonFilter, checkDistressPhraseList, checkDistressWithHaiku } from '../../src/server/safety';
import { parseGenerationOutput, checkSpecificity } from '../../src/server/validation';
import { selectPhoto } from '../../src/server/photoSelection';
import { getHotlineForCountry } from '../../src/server/hotlines';
import { safeFallbacks } from '../../src/server/fallbacks';
import photos from '../../src/data/photos.json';
import type { Photo, GenerateResponse } from '../../src/types';

const RequestSchema = z.object({
  prompt: z.string().trim().min(1).max(200),
  excludePhotoIds: z.array(z.string()).default([]),
});

const typedPhotos = photos as Photo[];
const anthropic = getAnthropicClient();

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function jsonResponse(body: GenerateResponse, statusCode = 200) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function normalizePrompt(raw: string): string {
  return raw.trim().replace(/\n/g, ' ').replace(/\s{2,}/g, ' ');
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let parsed;
  try {
    parsed = RequestSchema.parse(JSON.parse(event.body ?? '{}'));
  } catch {
    return jsonResponse(
      { status: 'error', message: 'Invalid request.', retryable: false },
      400
    );
  }

  const prompt = normalizePrompt(parsed.prompt);
  const { excludePhotoIds } = parsed;

  const rawIp = getClientIp(event.headers);
  const hashedIp = hashIp(rawIp);

  if (process.env.NODE_ENV === 'production' || process.env.RATE_LIMIT_PER_HOUR !== '9999') {
    try {
      const rateResult = await checkAndIncrementRateLimit(hashedIp);
      if (!rateResult.allowed) {
        console.log(JSON.stringify({ event: 'gen_rate_limited', hashedIp }));
        return jsonResponse({
          status: 'rate_limited',
          message: 'Even the universe has a daily limit. Try again in a bit.',
        });
      }
    } catch (err) {
      console.error(JSON.stringify({ event: 'rate_limit_check_failed', error: String(err) }));
    }
  }

  if (checkSlurFilter(prompt)) {
    console.log(JSON.stringify({ event: 'gen_block', reason: 'slur' }));
    return jsonResponse({ status: 'blocked', message: "Let's try a different one." });
  }

  if (checkRealPersonFilter(prompt)) {
    console.log(JSON.stringify({ event: 'gen_block', reason: 'real-person' }));
    return jsonResponse({
      status: 'blocked',
      message: "The voice doesn't punch at people. Try a situation instead.",
    });
  }

  const distressPhrase = checkDistressPhraseList(prompt);
  const distressHaiku = distressPhrase ? true : await checkDistressWithHaiku(anthropic, prompt);

  if (distressPhrase || distressHaiku) {
    console.log(JSON.stringify({ event: 'gen_distress' }));
    const country = (event.headers['x-country'] ?? '').toUpperCase();
    return jsonResponse({
      status: 'distress',
      hotline: getHotlineForCountry(country),
    });
  }

  const MAX_RETRIES = 2;
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
    console.log(JSON.stringify({ event: 'gen_safe_fallback' }));
    const fallback = safeFallbacks[Math.floor(Math.random() * safeFallbacks.length)];
    return jsonResponse({
      status: 'safe_fallback',
      line1: fallback.line1,
      line2: fallback.line2,
      photoId: fallback.photoId,
    });
  }

  const photoResult = selectPhoto(
    typedPhotos,
    lastOutput.line1.length,
    lastOutput.line2.length,
    excludePhotoIds
  );

  if (!photoResult) {
    console.log(JSON.stringify({ event: 'gen_safe_fallback' }));
    const fallback = safeFallbacks[Math.floor(Math.random() * safeFallbacks.length)];
    return jsonResponse({
      status: 'safe_fallback',
      line1: fallback.line1,
      line2: fallback.line2,
      photoId: fallback.photoId,
    });
  }

  const fittingRung = photoResult.rung === 3 ? 3 : photoResult.rung;
  console.log(JSON.stringify({
    event: 'gen_ok',
    fittingRung,
    retries,
    model: process.env.ANTHROPIC_MODEL_GEN,
  }));

  return jsonResponse({
    status: 'ok',
    line1: lastOutput.line1,
    line2: lastOutput.line2,
    photoId: photoResult.photoId,
    fittingRung: fittingRung as 1 | 2 | 3 | 4,
  });
};

export { handler };
