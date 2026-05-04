// ── Limits shared by client + server ──

// Max user-prompt length. Enforced server-side by the Zod request schema in
// `netlify/functions/generate.ts` (security boundary) and mirrored client-side
// as the `<input maxLength>` in `src/components/PromptInput.tsx` (UX). Drift
// between the two would let the input accept characters the API will then 400.
// Pinned by the boundary tests in `tests/server/generate-contract.test.ts`
// ("accepts prompt at exactly 200 chars" / "rejects 201").
export const MAX_PROMPT_LENGTH = 200;

// ── Photo Metadata ──

export interface TextZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Capacity {
  line1: number;
  line2: number;
}

export type WatermarkPosition = 'lower-left' | 'lower-right' | 'upper-left' | 'upper-right';
export type TextColor = 'white' | 'dark';
export type PhotoTier = 'standard' | 'high-capacity';

export interface Photo {
  id: string;
  width: number;
  height: number;
  textZone: TextZone;
  capacity: Capacity;
  textColor: TextColor;
  watermarkPosition: WatermarkPosition;
  tier: PhotoTier;
  credit: string;
}

// ── API Request/Response ──

export interface GenerateRequest {
  prompt: string;
  excludePhotoIds: string[];
}

export interface Hotline {
  countryCode: string;
  name: string;
  phone: string;
  url?: string;
}

export type GenerateResponse =
  | { status: 'ok'; line1: string; line2: string; photoId: string; fittingRung: 1 | 2 | 3 | 4 }
  | { status: 'distress'; hotline: Hotline }
  | { status: 'blocked'; message: string }
  | { status: 'rate_limited'; message: string; retryAfterSec?: number; resetAt?: number }
  | { status: 'safe_fallback'; line1: string; line2: string; photoId: string }
  | { status: 'error'; message: string; retryable: boolean };

// ── Rate Limiting ──

export interface RateLimitDoc {
  count: number;
  windowStart: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
  retryAfterSec?: number;
  // Epoch seconds when the current rate-limit window expires.
  // Surfaced as `X-RateLimit-Reset` (allowed) and inside the rate_limited body (denied).
  resetAt?: number;
  limit?: number;
}

// ── Generation Internal ──

export interface GenerationOutput {
  line1: string;
  line2: string;
}

export type FitResult =
  | { ok: true; scale: number }
  | { ok: false; reason: 'overflow' };

// ── UI State ──

export type PosterPhase =
  | { phase: 'idle' }
  | { phase: 'loading'; phrase: string }
  | { phase: 'revealing' }
  | { phase: 'settled'; line1: string; line2: string; photoId: string; fittingRung: 1 | 2 | 3 | 4 }
  | { phase: 'error'; message: string; retryable: boolean };

// ── Fallback ──

export interface SafeFallback {
  line1: string;
  line2: string;
  photoId: string;
}
