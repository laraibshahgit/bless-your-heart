# Generation API

## Overview

A single Netlify Function — `netlify/functions/generate.ts` — handles every generation. It receives the user's prompt, runs the safety + rate-limit checks, calls Sonnet, validates the output, picks a photo, and returns a structured response. The frontend then composites the poster client-side.

This file specifies the function's request handling, the Sonnet call shape, and the photo-selection logic. Output validation and retry behavior live in `09_Output_Validation_And_Retries.md`; the system prompt itself lives in `05_Voice_And_System_Prompt.md`.

## Dependencies
- `01_Tech_Stack.md` — Anthropic SDK, Firebase Admin, Zod versions
- `03_Data_Schema.md` — Request/response shapes
- `05_Voice_And_System_Prompt.md` — The system prompt and call parameters
- `09_Output_Validation_And_Retries.md` — Validation and retry logic invoked by this function
- `10_Safety_Guardrails.md` — Distress, slur, and real-person checks invoked before generation
- `12_Photo_Metadata.md` — Photo selection criteria
- `14_Text_Fitting_Pipeline.md` — Stage 3 photo selection logic this function implements
- `19_Rate_Limiting.md` — Rate-limit transactional logic invoked by this function

## Endpoint

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/generate` (rewrites to `/.netlify/functions/generate`) | None — public, rate-limited per IP |

## Request

```ts
interface GenerateRequest {
  prompt: string;             // Trimmed, ≤ 200 chars
  excludePhotoIds: string[];  // For in-session photo dedup
}
```

Validated with Zod at function entry. Reject with `400` and an in-voice error message if the schema fails. Normalize the prompt: trim whitespace, strip newlines, collapse internal multi-space to single. Do not lowercase — case can carry meaning.

## Response

A discriminated union on `status`. Full shapes in `03_Data_Schema.md`:

| Status | When |
|--------|------|
| `ok` | Generation succeeded, validated, and a photo was placed |
| `distress` | Distress signal detected; returns a hotline payload, no generation |
| `blocked` | Slur or real-person target detected; soft refuse, no generation |
| `rate_limited` | Per-IP cap hit; in-voice soft-fail, no generation |
| `safe_fallback` | All retries exhausted; canned poster delivered to keep the contract |
| `error` | Uncaught upstream failure (Anthropic 5xx, etc.); retryable |

Always return HTTP `200` for the first six (these are not HTTP-level failures — they're product responses). Return `5xx` only for genuine infrastructure errors that can't be wrapped into an in-voice response.

## Top-Level Flow

The function executes the following sequence; each step can short-circuit and return early.

```
1. Parse + validate request body (Zod)
   └─ on fail → 400
2. Resolve client IP
   └─ Read `x-nf-client-connection-ip` (Netlify-injected) or `x-forwarded-for`
   └─ Hash with daily salt (per 03_Data_Schema.md)
3. Rate-limit transaction (19_Rate_Limiting.md)
   └─ on cap hit → return { status: 'rate_limited', message: '...' }
4. Slur / hate-speech filter (10_Safety_Guardrails.md)
   └─ on hit → return { status: 'blocked', message: '...' }
5. Real-person target filter (10_Safety_Guardrails.md)
   └─ on hit → return { status: 'blocked', message: '...' }
6. Distress check (10_Safety_Guardrails.md)
   └─ on hit → return { status: 'distress', hotline: ... }
7. Generation loop (with retries; see 09_Output_Validation_And_Retries.md)
   ├─ Call Sonnet
   ├─ Validate format (Zod)
   ├─ Validate specificity
   ├─ Tone check (Haiku)
   └─ Pass → break loop
8. Photo selection (Stage 3 of 14_Text_Fitting_Pipeline.md)
   └─ Eligible photos by capacity, exclude session ids, random pick
9. Width verification handled client-side (Stage 4 of fitting pipeline)
   └─ Function trusts capacity metadata; client is final arbiter
10. Build response { status: 'ok', line1, line2, photoId, fittingRung }
```

Steps 4–6 run *after* rate-limit but *before* generation. Each is cheap — the safety stages 4 and 5 are list-based (no API call). Distress (step 6) is a Haiku call and the only one of the three pre-generation safety stages that costs money. Cost is bounded by the rate-limit step running first.

## The Sonnet Call

```ts
const response = await anthropic.messages.create({
  model: env.ANTHROPIC_MODEL_GEN,
  max_tokens: 200,
  temperature: 0.9,
  system: VOICE_SYSTEM_PROMPT,         // From 05
  messages: [
    { role: "user", content: normalizedPrompt },
  ],
});

const text = response.content
  .filter(b => b.type === "text")
  .map(b => b.text)
  .join("");
```

The output is expected to be a JSON object per the system prompt's contract. The text might include leading/trailing whitespace or, occasionally, code-fence markers despite the prompt's instruction. Strip these before parsing:

```ts
const cleaned = text
  .replace(/^```json\s*/i, "")
  .replace(/^```\s*/i, "")
  .replace(/\s*```$/i, "")
  .trim();
```

Parse with `JSON.parse`, validate with Zod (`09_Output_Validation_And_Retries.md`). Failed parse → counts as a retry.

### Streaming

V1 does not stream the Sonnet response. The total generated tokens are small (~200), and the frontend's loading-state design wants a discrete reveal, not a typed-out animation. Streaming is a P3 nice-to-have and out of scope.

## Photo Selection

Photo selection runs after a validated text payload exists. Logic:

```
const line1Len = line1.length;
const line2Len = line2.length;

let candidates = photos.filter(p =>
  p.capacity.line1 >= line1Len &&
  p.capacity.line2 >= line2Len &&
  !excludePhotoIds.includes(p.id)
);

if (candidates.length === 0) {
  // Fallback rung: high-capacity tier
  candidates = photos.filter(p =>
    p.tier === 'high-capacity' &&
    !excludePhotoIds.includes(p.id)
  );
}

if (candidates.length === 0) {
  // Session has cycled through every high-capacity photo too;
  // allow repeats from the high-capacity tier
  candidates = photos.filter(p => p.tier === 'high-capacity');
}

const selected = candidates[Math.floor(Math.random() * candidates.length)];
return { photoId: selected.id, fittingRung: ... };
```

`fittingRung` is `1` if the first filter matched (standard selection succeeded), `2` if the high-capacity fallback engaged, `3` if the session-dedup-bypassing fallback engaged, `4` if even that fails (then the safe canned response triggers — see `09_Output_Validation_And_Retries.md`). Logged for analytics; rate of rung-2-or-higher above 5% is a signal that prompt drift is happening (line 2 lengths are creeping toward the cap).

The function loads `photos.json` at cold-start (require it as a static import). The metadata file is small (~75 entries × ~250 bytes ≈ 20 KB) — fits in memory trivially.

## In-Session Dedup

The frontend tracks photo IDs the user has already seen in this session in client memory and posts the array as `excludePhotoIds` on each request. Server-side, the function honors the array as a hard exclusion (Stage 1 only — Stage 2 fallback and beyond may revisit excluded IDs since otherwise the session can run dry).

This avoids server-side session state — the client is the arbiter of what it has seen.

## Logging (Server-Side)

Use `console.log` / `console.error` — Netlify captures these into function logs accessible from the dashboard. No external logging service for v1.

| Event | Log shape |
|-------|-----------|
| Successful generation | `{ event: 'gen_ok', fittingRung, retries, model }` |
| Distress trigger | `{ event: 'gen_distress' }` (no prompt content logged — privacy) |
| Block trigger | `{ event: 'gen_block', reason: 'slur' \| 'real-person' }` |
| Rate-limit trigger | `{ event: 'gen_rate_limited', hashedIp }` |
| Validation retry | `{ event: 'gen_retry', reason: 'format' \| 'specificity' \| 'tone' }` |
| Safe fallback | `{ event: 'gen_safe_fallback' }` |
| Anthropic error | `{ event: 'gen_anthropic_error', status, message }` |

**Never log the user's prompt, never log the generated text content.** The product's privacy posture rests on not retaining input or output. Counts and reasons are fine; content is not.

## Error Handling — Anthropic-Side Failures

| Scenario | Response |
|----------|----------|
| Anthropic 429 (rate limit) | After one retry with backoff, return `{ status: 'error', message: in-voice copy, retryable: true }` |
| Anthropic 5xx | One retry with exponential backoff (250ms, 750ms), then return `{ status: 'error', retryable: true }` |
| Anthropic 4xx (non-429) | No retry, return `{ status: 'error', retryable: false }` |
| Network timeout (function-level) | Function timeout is Netlify's default (~10s); if Anthropic hangs, function exits with `error` status |
| All retries exhausted on validation | `{ status: 'safe_fallback', ... }` — see `09` |

In-voice copy lives in `src/content/copy.ts` per `02_Project_Setup.md` (or imported into the function from a shared module). Examples:

```
"Even the universe is buffering. Try again."
"The cosmos is having one of those days. Give it a moment."
```

## CORS and Security Headers

The function and frontend share a domain, so CORS isn't strictly required. But:

- Set `Access-Control-Allow-Origin` to the production origin only (not `*`) as a hygiene measure.
- Set `Cache-Control: no-store` — every generation is unique; never cache.
- Set `Content-Type: application/json; charset=utf-8`.

## Idempotency

The function is **not** idempotent. Two identical requests produce two different generations and two rate-limit increments. This is intended behavior — the user's regenerate action depends on it.

## Function Cold-Start Considerations

Netlify Functions run on AWS Lambda. Cold starts add ~300–700ms when traffic is sparse. Mitigations:

1. Keep the bundle small. The Anthropic SDK and Firebase Admin are the only heavy deps; both are necessary.
2. Don't lazy-load — initialize the Anthropic client and Firebase Admin app at module level so warm invocations skip setup.
3. Don't worry about cold starts being noticeable — the 800ms minimum loading state (`04_UI_Design_System.md`) absorbs them.

## Gaps & Assumptions

- **Function timeout**: Netlify default (10s) is sufficient. If retries plus tone check ever push close to that, log and revisit; don't preemptively raise.
- **What if the IP header is missing**: Treat as a single shared bucket (e.g., document ID `unknown-client`). This is degraded but doesn't break the app. Real Netlify deployments always populate `x-nf-client-connection-ip`.
- **Region affinity for Firebase Admin**: Init uses default app credentials; latency from `us-east-1` (Netlify default) to `us-central1` (Firebase default) is ~30–50ms per Firestore call. Acceptable for v1.
- **Daily IP-hash salt rotation**: Implemented as a simple `process.env.IP_SALT_BASE + new Date().toISOString().slice(0,10)`. Rotates without ceremony.
- **Anthropic SDK version pinning**: Pin to a minor version (e.g., `^0.30.0`); the SDK's surface is stable but breaking changes have happened. Lockfile-only is insufficient.
