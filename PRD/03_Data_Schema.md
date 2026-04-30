# Data Schema

## Overview

The product is intentionally close to "no database." The only persisted data is per-IP rate-limit counters in Firestore. The other "data" is photo metadata, which lives as a static JSON file in the repo. This file documents both shapes and the TypeScript interfaces that consume them.

## Dependencies
- `01_Tech_Stack.md` — Firebase + Firestore versions
- `02_Project_Setup.md` — Where these files live in the repo
- `12_Photo_Metadata.md` — Field-by-field semantics of the photo metadata
- `19_Rate_Limiting.md` — How the rate-limit counter is read and written

## Firestore: `rateLimits` Collection

**Purpose**: Per-IP request counter with an automatic expiry, used to soft-cap generations at 25/hour. This is the only Firestore collection in the entire system.

**Document ID**: a hash of the client IP (use SHA-256 of `clientIp + DAILY_SALT`; never store raw IPs). The salt rotates daily so even the hashed values can't be cross-referenced across days.

| Field | Type | Notes |
|-------|------|-------|
| `count` | number | Generations attempted in the current window |
| `windowStart` | Timestamp | When the current window started (used for re-init logic) |
| `expiresAt` | Timestamp | TTL field; Firestore deletes this doc after this time |

**TTL**: Configured on the `expiresAt` field via the Firestore TTL feature (Firestore console → TTL → add policy). Once set, no manual cleanup is needed; expired docs are deleted in the background.

**Indexes**: None required. All reads are by document ID (the hashed IP), and Firestore indexes those automatically.

**TypeScript interface**:

```ts
interface RateLimitDoc {
  count: number;
  windowStart: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
}
```

**Read/write pattern**: A transactional read-modify-write on each generation request. See `19_Rate_Limiting.md` for the exact logic, including how a stale window (windowStart > 1 hour old) triggers a reset rather than blocking the user.

## Static JSON: `photos.json`

**Purpose**: Authoritative metadata for every photo in the curated library. The frontend imports this file at build time; the photo file itself is fetched at generation time from Firebase Storage using the `id` field.

**Location**: `src/data/photos.json`

**Top-level shape**: an array of `Photo` objects. ~75 entries at launch.

**Photo object**:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable kebab-case identifier (e.g., `misty-fjord-01`); becomes the filename in Storage |
| `width` | number | Pixel width of the source image (always ≥ 1080) |
| `height` | number | Pixel height of the source image |
| `textZone` | object | Bounding box in normalized 0–1 coordinates; see below |
| `capacity` | object | Max characters per line that fits at canonical typography; see below |
| `textColor` | `'white' \| 'dark'` | Which text color works against this photo's text-zone region |
| `watermarkPosition` | enum | One of `'lower-left' \| 'lower-right' \| 'upper-left' \| 'upper-right'` |
| `tier` | `'standard' \| 'high-capacity'` | High-capacity photos act as the fitting pipeline's guaranteed fallback |
| `credit` | string | Photographer credit + license note (for footer or about page) |

**`textZone` shape** (normalized — multiply by `width`/`height` to get pixels):

```ts
interface TextZone {
  x: number;       // 0–1, left edge of text box
  y: number;       // 0–1, top edge of text box
  width: number;   // 0–1, box width
  height: number;  // 0–1, box height
}
```

**`capacity` shape**:

```ts
interface Capacity {
  line1: number;   // Max chars on line 1 that fit the zone width at line-1 typography
  line2: number;   // Max chars on line 2 (smaller font, italic — fits more)
}
```

The `capacity` values are computed once at curation time using Cormorant Garamond's average advance width with a 10% safety margin. The curation tool computes these automatically; manual override is allowed for irregular zones (e.g., a horizontal sliver between mountains and sky). See `13_Photo_Curation_Tool.md`.

**Full TypeScript interface**:

```ts
type WatermarkPosition =
  | 'lower-left'
  | 'lower-right'
  | 'upper-left'
  | 'upper-right';

type TextColor = 'white' | 'dark';
type PhotoTier = 'standard' | 'high-capacity';

interface Photo {
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
```

**Tier distribution**: ~10–15% of the library is curated as `high-capacity`. These are the wide, central, simple-background photos that fit any text within the schema's hard maximums. They are the fallback rung in the fitting pipeline (`14_Text_Fitting_Pipeline.md`).

**Lookup helpers** (in `src/lib/photos.ts`):

- `getEligiblePhotos(line1Length, line2Length, excludeIds)` — returns photos whose `capacity` fits the given text and whose `id` is not in `excludeIds` (for in-session deduplication)
- `getRandomPhoto(eligible)` — uniform random pick from the eligible subset
- `getHighCapacityPhoto(excludeIds)` — used when standard selection fails

**Photo URL construction**: The frontend builds the URL as `${VITE_FIREBASE_STORAGE_BASE_URL}/photos/${id}.jpg`. No SDK call required.

## Generation Request/Response Shape (Function Boundary)

While not "data" in the persistence sense, the request/response shape between frontend and the `generate` function is also a schema and lives here for one-stop reference.

**Request body** (validated server-side with Zod):

```ts
interface GenerateRequest {
  prompt: string;       // Trimmed input from the user; max 200 chars
  excludePhotoIds: string[];  // Photo ids to skip this turn (in-session dedup)
}
```

**Response body — success**:

```ts
interface GenerateResponseSuccess {
  status: 'ok';
  line1: string;        // Reverent setup
  line2: string;        // Savage pivot
  photoId: string;      // Selected photo (frontend builds the URL)
  fittingRung: 1 | 2 | 3 | 4;  // For analytics/logging only
}
```

**Response body — distress refusal** (per `10_Safety_Guardrails.md`):

```ts
interface GenerateResponseDistress {
  status: 'distress';
  hotline: {
    countryCode: string;
    name: string;
    phone: string;
    url?: string;
  };
}
```

**Response body — soft refuse / rate limit / safe fallback**:

```ts
interface GenerateResponseSoftFail {
  status: 'rate_limited' | 'blocked' | 'safe_fallback';
  message: string;        // In-voice copy
  // safe_fallback only: the canned poster content
  line1?: string;
  line2?: string;
  photoId?: string;
}
```

**Response body — hard error**:

```ts
interface GenerateResponseError {
  status: 'error';
  message: string;        // In-voice error copy
  retryable: boolean;
}
```

The frontend's response handler is a discriminated union on `status`. See `08_Generation_API.md` and `20_Error_Handling.md`.

## Why Not Persist Generations?

Two reasons:

1. **Vision constraint**. The PRD explicitly forbids storing user prompts or generated content. The product is one-shot; storage of any kind betrays the ethos.
2. **Privacy by absence**. If we don't store it, we can't lose it, can't subpoena-respond with it, can't accidentally surface it. This makes the product cheap to operate and legally simple.

The only exception — rate-limit counters — stores no prompts and no PII. The hashed-IP-only design is deliberate.

## Gaps & Assumptions

- **Daily salt for IP hashing**: Generated server-side from a fixed seed + `YYYY-MM-DD`. Can be a constant in code; rotation isn't security-critical, just hygiene.
- **`credit` field format**: Free-form string for v1 (e.g., `"Jane Doe / Unsplash+"`). If we add an about page, switch to a structured `{ name, url, license }` shape.
- **Photo `id` collision**: Enforced unique by the curation tool's CI lint (`13_Photo_Curation_Tool.md`).
- **Schema versioning**: `photos.json` has no `schemaVersion` field at v1. If the metadata shape evolves later, add one and run a migration pass.
- **Maximum prompt length**: 200 characters, enforced both client-side (HTML `maxLength` + Zod) and server-side (Zod). Server-side is the security boundary; client is convenience.
