# Bless Your Heart — API Design Guide

This guide codifies the dominant patterns observed in the existing API surface. Use it when adding new endpoints, request/response fields, or error variants. The aim is to keep the surface coherent — not to prescribe a "best" REST style.

The current surface has exactly one endpoint (`POST /.netlify/functions/generate`, also reachable at `/api/generate` via the redirect in `netlify.toml`). All conventions below were extracted from that endpoint and the supporting types in `src/types/index.ts`.

---

## URL Naming

| Rule | Convention | Notes |
|---|---|---|
| Casing | `lowercase` | Single words (`generate`). Multi-word would be `lowercase-hyphenated` (`text-completion`), never camelCase or snake_case. |
| Pluralization | Action endpoints use the verb (e.g. `generate`); resource collections use the plural noun (`photos`). | We have no resource collections today. When introducing one, use the plural. |
| Aliasing | `/api/*` redirects to `/.netlify/functions/*`. | Both forms must continue to work — clients may use either. The redirect is rewritten to `200`, not `301`, so clients see no redirect. |
| Versioning | Unversioned today. | If a breaking change is ever needed, introduce `/api/v1/<path>` and keep the existing path live until the SPA cuts over. |

---

## HTTP Methods

| Method | Use for | Used today |
|---|---|---|
| `POST` | Generation, mutations, anything with side effects (rate-limit increment), and computational endpoints whose response depends on randomness. | `POST /generate` |
| `GET` | Read-only fetches with no side effects. Safe to cache. | None today. |
| `PUT` | Full replacement of a resource. | None today. |
| `PATCH` | Partial update. | None today. |
| `DELETE` | Remove a resource. Must be idempotent. | None today. |

`POST /generate` is correct: each call mutates rate-limit state (Firestore transaction) and returns a freshly-generated payload.

Any non-`POST` request on the existing endpoint MUST return `405 Method Not Allowed` with the `Allow: POST` header (RFC 7231 §6.5.5). The handler enforces this.

---

## Status Codes

This API follows a **wrapper pattern**: every JSON response uses HTTP `200` and embeds the outcome in a `status` discriminator inside the body. The single exception is HTTP-level errors (malformed JSON, wrong method) that return `400` / `405` because the handler never reached the business logic.

| Status code | When it's returned | Body shape |
|---|---|---|
| `200` | Every business-logic outcome — success, blocked, distress, rate-limited, safe-fallback. | `GenerateResponse` discriminated union. |
| `400` | Malformed JSON, Zod validation failure. | `{ status: 'error', message, retryable: false }` |
| `405` | Any HTTP method other than POST. | `{ status: 'error', message, retryable: false }`. Headers MUST include `Allow: POST`. |

**Do not** introduce `4xx` codes for business outcomes (e.g. don't return `429` for rate-limit, `403` for blocked). Clients only inspect `body.status`. Mixing the two patterns would force them to inspect both.

**Do not** introduce `5xx` codes. The product contract is "user always gets a poster" — handler-level errors fall through to `safe_fallback` (200). The only `5xx` clients would ever see is from infrastructure (Netlify), not from handler code.

---

## Field Naming

| Domain | Convention | Examples |
|---|---|---|
| Request body fields | `camelCase` | `prompt`, `excludePhotoIds` |
| Response body fields | `camelCase` | `line1`, `line2`, `photoId`, `fittingRung`, `countryCode`, `retryAfterSec`, `resetAt` |
| Booleans | bare adjective, no `is_` / `has_` prefix | `allowed`, `retryable`, `exists` |
| Status discriminator values | `lowercase_snake_case` | `'ok'`, `'distress'`, `'blocked'`, `'rate_limited'`, `'safe_fallback'`, `'error'` |
| Internal Firestore docs | `camelCase` | `count`, `windowStart`, `expiresAt`, `hashedIp` |
| Custom HTTP headers (request) | `kebab-case`, lowercase | `x-country` (Netlify normalizes header keys) |
| Standard HTTP headers (response) | Title-Case | `Content-Type`, `Cache-Control`, `Allow`, `Retry-After`, `X-RateLimit-Limit` |

`status` is the only response field with snake_case **values**. The KEYS are still camelCase. Don't introduce snake_case keys.

**Why two casings on response?** Status values are an enum — they read more clearly as `safe_fallback` than `safeFallback`. Object keys read more clearly as `retryAfterSec` than `retry_after_sec`. The two cases never appear in the same naming role.

---

## Request Validation

- **Library**: [Zod](https://zod.dev). All input parsing happens in the handler entry, before any business logic.
- **Schema location**: declared at the top of the handler file (`netlify/functions/generate.ts`). Don't sprinkle Zod schemas through helper modules.
- **Failure mode**: fail-fast on the first validation issue (Zod default). Return `400` with a body that names the failing field path: `"Invalid request: <path> is too long."`. Don't dump the full Zod issue list — clients don't need it.
- **Sensitive content**: never echo the input back in the error message. Names of fields are safe; values are not.

```ts
const RequestSchema = z.object({
  prompt: z.string().trim().min(1).max(200),
  excludePhotoIds: z.array(z.string()).default([]),
});
```

When adding a new request field:
1. Add it to `RequestSchema` with explicit length / shape constraints.
2. Update `GenerateRequest` in `src/types/index.ts` so client and server types stay aligned.
3. Add a contract test in `tests/server/generate-contract.test.ts` covering at least one accept and one reject case.

---

## Response Format

Every response is JSON with these baseline headers:

```
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
```

Add response-specific headers as needed:

| Header | When | Value |
|---|---|---|
| `Allow: POST` | On `405` responses. | `POST` (the only allowed method). |
| `X-RateLimit-Limit` | On any response where the rate-limit module ran. | Configured per-hour limit. |
| `X-RateLimit-Remaining` | Same — only on allowed responses. | Calls remaining in the current window. |
| `X-RateLimit-Reset` | Same. | Epoch seconds when the current window expires. |
| `Retry-After` | On `rate_limited` responses. | Seconds until the window resets. |

Body shape uses the discriminated union in `src/types/index.ts:GenerateResponse`. Adding a new variant requires:
1. Add the variant to `GenerateResponse`.
2. Add a Zod sub-schema in `tests/server/generate-contract.test.ts` and include it in `GenerateResponseSchema`.
3. Add at least one contract test that proves the handler can emit that variant.

**Never** introduce a response body without a `status` field — every consumer narrows on it.

---

## Error Format

Single canonical error shape:

```json
{ "status": "error", "message": "<human-readable>", "retryable": <boolean> }
```

- `retryable: true` means the client may retry without changing the request (network error, model error, infra error).
- `retryable: false` means the client must change the request (validation error, method error).
- `message` is human-readable but should not leak internals (no SQL errors, no stack traces, no internal paths).

`blocked`, `rate_limited`, and `distress` are NOT errors — they're business outcomes. They have their own variants in the union with their own helpful copy. Don't fold them into `status: 'error'`.

---

## Pagination

No list endpoints today. When introducing one:

1. **Default to cursor-based pagination** for unbounded result sets (e.g. user-generated content). Use `?cursor=<opaque>&limit=<n>`, return `{ items, nextCursor }`.
2. **Use offset/limit only** for bounded resources (small lookup tables) where total count matters. Use `?offset=<n>&limit=<n>`, return `{ items, total }`.
3. **Always set a default limit** (suggest `25`) and a hard maximum (suggest `100`). Reject requests exceeding the max with `400`.
4. **Param naming**: `limit` (not `pageSize`, `per_page`), `cursor` (not `next`, `after`), `offset` (not `start`).
5. Wrap items under a key (`items`), not at the top level — leaves room for metadata without a breaking change.

---

## Rate Limiting

- **Identifier**: SHA-256 hash of `IP:salt:date`, truncated to 32 chars. Daily-rotated salt prevents long-term IP tracking.
- **Storage**: Firestore document at `rateLimits/{hashedIp}` with TTL via `expiresAt`.
- **Default limit**: 25/hour per IP. Override via `RATE_LIMIT_PER_HOUR` env var. Set to `9999` to bypass entirely (local dev).
- **Failure mode**: fail open. If Firestore stalls past 3s OR rejects, log `rate_limit_check_failed` and serve the request anyway. Product contract ("user always gets a poster") wins over strict limiting.
- **Headers**: emit `X-RateLimit-Limit/Remaining/Reset` whenever the limiter actually ran, plus `Retry-After` on denied responses.
- **Body field**: `rate_limited` responses include `retryAfterSec` and `resetAt` so JSON-only consumers don't have to read headers.

When adding rate-limited endpoints, reuse `checkAndIncrementRateLimit` and the same header pattern. Don't invent a separate scheme.

---

## Idempotency

The single endpoint is **non-idempotent by design** — every call generates fresh content and increments the rate-limit counter. Idempotency keys would conflict with the product (the user would get the same poster on a retry).

If a future endpoint is destructive (`DELETE`, irreversible mutation), follow the standard `Idempotency-Key` header convention: client supplies a UUID, server caches the result keyed by `(hashedIp, key)` for 24h.

---

## Observability

Every code path emits a JSON log line with an `event` field. Never log prompt content or generated output — only event types and minimal context.

Established events:

```
gen_ok, gen_block, gen_distress, gen_rate_limited, gen_retry, gen_safe_fallback,
gen_anthropic_error, rate_limit_check_failed, tone_check_failed, distress_check_failed
```

When adding a new code path, add a new `event` value and document it here. Reuse existing values where the semantics match.

**Fail-open / fail-closed catches**: any `console.error` in a `try/catch` that *swallows* the error (returns a default and continues) MUST capture the cause:

```ts
} catch (err) {
  console.error(JSON.stringify({ event: 'foo_failed', error: String(err) }));
  return defaultValue;
}
```

Without `error: String(err)` the on-call has only the event name and no way to distinguish a Firestore timeout from a credential error from a SDK bug. The four existing fail-open events (`gen_anthropic_error`, `rate_limit_check_failed`, `tone_check_failed`, `distress_check_failed`) all follow this pattern. New fail-open paths must too. (Reinforced by audit run 13/001, which closed two gaps where the catch had been written without binding `err`.)

---

## Security

- `ANTHROPIC_API_KEY` lives only in Netlify env vars — NEVER expose to the browser.
- Anything imported into `src/server/*` must NEVER be imported by client code. The bundler honours the boundary; broken imports leak the moderation list to the browser.
- Inbound headers from Netlify (`x-nf-client-connection-ip`, `x-forwarded-for`) are trusted. User-supplied headers (`x-country`) are sanitised by uppercase + map lookup.
- Validation is the only authorization layer for the public endpoint. There are no authenticated endpoints today.

---

## Versioning Policy

- **Breaking change** = removing or renaming a field, narrowing a value enum, changing a status code for an existing response variant.
- Until a breaking change is needed, the API stays unversioned.
- When breaking, introduce `/api/v2/<path>`, keep `/api/v1/<path>` live for at least 90 days, log calls to v1 with an `api_v1_call` event for visibility, and migrate the SPA to v2 first.

---

## Recipe: Adding a New Field to the Generate Response

1. Add the field to the relevant variant in `src/types/index.ts:GenerateResponse`. Use `?` for additive optional fields.
2. Update the corresponding Zod schema in `tests/server/generate-contract.test.ts:GenerateResponseSchema`.
3. Add a contract test asserting the field appears (or is absent) for the variants where it's expected.
4. Update the handler in `netlify/functions/generate.ts` to populate the field.
5. If the field is consumer-facing, update the SPA's consumer (`src/lib/api.ts` or callers).

## Recipe: Adding a New Endpoint

1. Create `netlify/functions/<name>.ts` with the same baseline structure: Zod request schema → method check → rate-limit (if applicable) → business logic → JSON response.
2. Use `baseHeaders` and the same header conventions.
3. If non-trivial, add an integration test (`tests/server/<name>-integration.test.ts`) and a contract test (`tests/server/<name>-contract.test.ts`).
4. Reuse `getClientIp` / `hashIp` for rate-limit identification — don't roll your own IP extraction.
5. Add the endpoint to this guide's surface table at the top.
