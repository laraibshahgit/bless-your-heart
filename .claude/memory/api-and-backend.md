# API & Backend

## Endpoint

`POST /.netlify/functions/generate` (Netlify Functions, Node 20 LTS)

## Request/Response

```ts
// Request
interface GenerateRequest {
  prompt: string;              // ≤ 200 chars, trimmed
  excludePhotoIds: string[];   // session deduplication
}

// Response — discriminated union on status
type GenerateResponse =
  | { status: 'ok'; line1: string; line2: string; photoId: string; credit: string }
  | { status: 'distress'; hotline: { countryCode: string; name: string; phone: string; url?: string } }
  | { status: 'blocked'; message: string }
  | { status: 'rate_limited'; message: string }
  | { status: 'safe_fallback'; line1: string; line2: string; photoId: string; credit: string }
  | { status: 'error'; retryable: boolean; message: string }
```

## Function Flow (Top-Level)

1. Parse + validate request (Zod)
2. Resolve client IP (Netlify-injected header)
3. Rate-limit check (Firestore transaction)
4. Slur filter (word-list, free)
5. Real-person filter (list + regex, free)
6. Distress check (phrase list → Haiku classifier)
7. Generation loop: Sonnet call → format validate → specificity check → tone check
8. Photo selection (filter by capacity, exclude session IDs)
9. Build response

## Sonnet Call

```ts
const response = await anthropic.messages.create({
  model: env.ANTHROPIC_MODEL_GEN,
  max_tokens: 200,
  temperature: 0.9,
  system: VOICE_SYSTEM_PROMPT,
  messages: [{ role: "user", content: normalizedPrompt }],
});
```

## Rate Limiting

- **Cap**: 25 generations / rolling hour per IP
- **IP hashing**: SHA-256 of `clientIp + dailySalt` (never store raw IP)
- **Storage**: Firestore `rateLimits/{hashedIp}` with TTL auto-delete on `expiresAt`
- **Local dev bypass**: `RATE_LIMIT_PER_HOUR=9999` or skip if `NODE_ENV !== 'production'`
- **Cost**: ~0.3% of Firestore Spark free tier at 167 gen/day; can grow ~30x before paid

## Error Handling

| Status | Action |
|--------|--------|
| 429 (rate limit) | 1 retry with backoff, then `{ status: 'error', retryable: true }` |
| 5xx | 2 retries with exponential backoff, then `{ status: 'error', retryable: true }` |
| 4xx (non-429) | No retry, `{ status: 'error', retryable: false }` |

## Logging Rules

**Never log prompt or output content.** Event types only:
- `gen_ok` (includes `fittingRung`, `retries`)
- `gen_distress` (no content)
- `gen_block` (reason: `slur` | `real-person`)
- `gen_rate_limited`
- `gen_retry` (reason: `format` | `specificity` | `tone`)
- `gen_safe_fallback`

## Cost Budget

~$0.006 per generation average → ~4,000 generations for $25/month budget.
