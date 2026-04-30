import type { GenerateRequest, GenerateResponse } from '@/types';
import { errorCopy } from '@/content/copy';

export async function callGenerate(
  prompt: string,
  excludePhotoIds: string[]
): Promise<GenerateResponse> {
  try {
    const response = await fetch('/.netlify/functions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, excludePhotoIds } satisfies GenerateRequest),
    });

    if (!response.ok) {
      if (response.status >= 500) {
        return { status: 'error', message: errorCopy.generation.anthropicError, retryable: true };
      }
      return { status: 'error', message: errorCopy.generation.unknown, retryable: true };
    }

    return (await response.json()) as GenerateResponse;
  } catch {
    if (!navigator.onLine) {
      return { status: 'error', message: errorCopy.generation.networkOffline, retryable: true };
    }
    return { status: 'error', message: errorCopy.generation.unknown, retryable: true };
  }
}
