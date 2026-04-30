import type { Handler, HandlerEvent } from '@netlify/functions';
import { z } from 'zod';
import { hashIp, checkAndIncrementRateLimit } from '../../src/server/rateLimit';
import { checkSlurFilter, checkRealPersonFilter, checkDistressPhraseList, checkDistressWithHaiku } from '../../src/server/safety';
import { getAnthropicClient, generateLines } from '../../src/server/anthropic';
import { validateFormat, validateGeneration } from '../../src/server/validation';
import { selectPhoto } from '../../src/server/photoSelection';
import { getHotlineForCountry } from '../../src/server/hotlines';
import { safeFallbacks } from '../../src/server/fallbacks';
import { errorCopy } from '../../src/content/copy';

const RequestSchema = z.object({
  prompt: z.string().trim().min(1).max(200),
  excludePhotoIds: z.array(z.string()).default([]),
});

const MAX_RETRIES = 2;

function resolveIp(event: HandlerEvent): string {
  return (
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json({ status: 'error', message: 'Method not allowed', retryable: false }, 405);
  }

  let parsed;
  try {
    parsed = RequestSchema.parse(JSON.parse(event.body || '{}'));
  } catch {
    return json({ status: 'error', message: 'Invalid request', retryable: false }, 400);
  }

  const { prompt, excludePhotoIds } = parsed;
  const rawIp = resolveIp(event);
  const hashedIp = hashIp(rawIp);

  // 1. Rate limit
  const rateResult = await checkAndIncrementRateLimit(hashedIp);
  if (!rateResult.allowed) {
    console.log(JSON.stringify({ event: 'gen_rate_limited', hashedIp }));
    return json({ status: 'rate_limited', message: errorCopy.rateLimit });
  }

  // 2. Slur filter
  if (checkSlurFilter(prompt)) {
    console.log(JSON.stringify({ event: 'gen_block', reason: 'slur' }));
    return json({ status: 'blocked', message: errorCopy.slurBlock });
  }

  // 3. Real-person filter
  if (checkRealPersonFilter(prompt)) {
    console.log(JSON.stringify({ event: 'gen_block', reason: 'real-person' }));
    return json({ status: 'blocked', message: errorCopy.realPersonBlock });
  }

  // 4. Distress check (phrase list first, then Haiku)
  const client = getAnthropicClient();
  const isDistress = checkDistressPhraseList(prompt) || await checkDistressWithHaiku(client, prompt);
  if (isDistress) {
    console.log(JSON.stringify({ event: 'gen_distress' }));
    const country = (event.headers['x-country'] || '').toUpperCase() || 'XX';
    const hotline = getHotlineForCountry(country);
    return json({ status: 'distress', hotline });
  }

  // 5. Generation loop with retries
  let retries = 0;
  while (retries <= MAX_RETRIES) {
    try {
      const raw = await generateLines(client, prompt);
      const output = JSON.parse(
        raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
      );

      const formatResult = validateFormat(output);
      if (!formatResult.valid) {
        console.log(JSON.stringify({ event: 'gen_retry', reason: 'format' }));
        retries++;
        continue;
      }

      const validResult = await validateGeneration(formatResult.data, prompt);
      if (!validResult.valid) {
        console.log(JSON.stringify({ event: 'gen_retry', reason: validResult.reason }));
        retries++;
        continue;
      }

      const { line1, line2 } = formatResult.data;

      // 6. Photo selection
      const photoResult = selectPhoto(line1, line2, excludePhotoIds);
      if (!photoResult) {
        console.log(JSON.stringify({ event: 'gen_safe_fallback' }));
        const fb = safeFallbacks[Math.floor(Math.random() * safeFallbacks.length)];
        return json({ status: 'safe_fallback', line1: fb.line1, line2: fb.line2, photoId: fb.photoId });
      }

      console.log(JSON.stringify({ event: 'gen_ok', fittingRung: photoResult.fittingRung, retries, model: process.env.ANTHROPIC_MODEL_GEN }));
      return json({
        status: 'ok',
        line1,
        line2,
        photoId: photoResult.photoId,
        fittingRung: photoResult.fittingRung,
      });
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && retries < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 250 * (retries + 1)));
        retries++;
        continue;
      }
      if (status && status >= 500 && retries < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 250 * (retries + 1)));
        retries++;
        continue;
      }

      console.error(JSON.stringify({ event: 'gen_anthropic_error', status }));
      retries++;
    }
  }

  // All retries exhausted — safe fallback
  console.log(JSON.stringify({ event: 'gen_safe_fallback' }));
  const fb = safeFallbacks[Math.floor(Math.random() * safeFallbacks.length)];
  return json({ status: 'safe_fallback', line1: fb.line1, line2: fb.line2, photoId: fb.photoId });
};
