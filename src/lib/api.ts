import type { GenerateRequest, GenerateResponse } from '@/types';
import { errorCopy } from '@/content/copy';

// Outer cap on the round-trip to /generate. The Netlify function itself kills
// at 10s default / 26s max, so under normal failure the user sees a 5xx well
// before this fires. The signal exists for the rare case where headers arrive
// but the response body never closes (CDN edge weirdness, lambda crash mid-
// stream). 30s gives the lambda + cold-start + DNS budget room to win
// legitimately while capping the worst case so a stuck tab fails into the
// retry copy in errorCopy.generation.unknown rather than hanging forever.
const GENERATE_FETCH_TIMEOUT_MS = 30_000;

export async function callGenerate(
  prompt: string,
  excludePhotoIds: string[],
  excludeCuratedIndices: number[] = []
): Promise<GenerateResponse> {
  try {
    const response = await fetch('/.netlify/functions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, excludePhotoIds, excludeCuratedIndices } satisfies GenerateRequest),
      signal: AbortSignal.timeout(GENERATE_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status >= 500) {
        return { status: 'error', message: errorCopy.generation.anthropicError, retryable: true };
      }
      return { status: 'error', message: errorCopy.generation.unknown, retryable: true };
    }

    return (await response.json()) as GenerateResponse;
  } catch (err) {
    // Surface the cause to the browser console so dev/QA can diagnose without
    // server access (network failure, AbortSignal timeout, JSON parse). Same
    // structured shape as server-side fail-open logs for grep parity.
    console.error(JSON.stringify({ event: 'gen_client_error', error: String(err) }));
    if (!navigator.onLine) {
      return { status: 'error', message: errorCopy.generation.networkOffline, retryable: true };
    }
    return { status: 'error', message: errorCopy.generation.unknown, retryable: true };
  }
}
