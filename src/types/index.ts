// ── Limits shared by client + server ──

// Max user-prompt length. Enforced server-side by the Zod request schema in
// `netlify/functions/generate.ts` (security boundary) and mirrored client-side
// as the `<input maxLength>` in `src/components/PromptInput.tsx` (UX). Drift
// between the two would let the input accept characters the API will then 400.
// Pinned by the boundary tests in `tests/server/generate-contract.test.ts`
// ("accepts prompt at exactly 200 chars" / "rejects 201").
export const MAX_PROMPT_LENGTH = 200;

// Max array length on `GenerateRequest.excludePhotoIds`. Enforced server-side
// by the Zod request schema (security boundary; bounds attacker-controlled
// payload size) and mirrored client-side in `App.tsx` so the regenerate
// accumulator can never grow past what the server will accept. Drift would let
// a user who regenerates >50 times silently fail with a 400 because the
// accumulator outgrew the contract — see audit run 24/001.
export const MAX_EXCLUDE_PHOTO_IDS = 50;

// Max length of a single `excludePhotoIds` element. Photo IDs in the library
// follow the slug pattern `^[a-z]+(-[a-z]+)*-\d{2,}$` (≤30 chars in practice);
// 64 is generous headroom that still bounds attacker-controlled string size.
// Without this bound, an attacker could send 50 strings of 1MB each (50MB total
// payload) — within Netlify's 6MB body cap they could still get under the cap
// but cause expensive Zod validation work. Pinned per-element in
// `tests/server/generate-contract.test.ts`.
export const MAX_EXCLUDE_PHOTO_ID_LENGTH = 64;

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
  // Optional on the wire — the server's Zod schema applies `.default([])` so a
  // request without `excludePhotoIds` is valid. The browser client always sends
  // an array (see `src/lib/api.ts`); making this optional in the type pins the
  // wire-format contract for any future server-to-server caller without a cast.
  // Pinned by `accepts a request omitting excludePhotoIds` in
  // `tests/server/generate-contract.test.ts`.
  excludePhotoIds?: string[];
  excludeCuratedIndices?: number[];
}

export interface Hotline {
  countryCode: string;
  name: string;
  phone: string;
  url?: string;
}

export type GenerateResponse =
  | { status: 'ok'; line1: string; line2: string; photoId: string; fittingRung: 1 | 2 | 3 | 4; curatedIndex?: number }
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
  | { phase: 'settled'; line1: string; line2: string; photoId: string; fittingRung: 1 | 2 | 3 | 4 }
  | { phase: 'error'; message: string; retryable: boolean };

// ── Fallback ──

export interface SafeFallback {
  line1: string;
  line2: string;
  photoId: string;
}
