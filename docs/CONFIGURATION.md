# Configuration Reference

Single source of truth for every environment variable, kill switch, and
operational toggle. New env vars MUST be added here when introduced.

The canonical template for `.env.local` is [`.env.example`](../.env.example).
This document explains the *why* and the *operational consequence* — the
template explains the *what*.

---

## Loading order

| Surface | Source | Loaded by |
|---|---|---|
| Local dev frontend | `.env.local` (Vite reads `VITE_*` only) | `vite dev` |
| Local dev backend | `.env.local` | `netlify dev` (loads `.env.local` automatically) |
| Production frontend | Netlify dashboard (build-time bake into the bundle) | `vite build` |
| Production backend | Netlify dashboard (runtime injection into the lambda) | Lambda cold-start |

`VITE_*` env vars are inlined into the client bundle at build time. Treat
them as **public** — never put a secret behind a `VITE_*` name.

Backend env vars are read at lambda cold-start. The lambda is bundled by
Netlify's esbuild bundler with `external_node_modules: ["firebase-admin"]`
(see [`netlify.toml`](../netlify.toml)).

---

## Required-in-production variables

These are checked by `validateProdEnv()` at lambda cold-start
([`src/server/configValidation.ts`](../src/server/configValidation.ts)).
When `process.env.CONTEXT === 'production'` and any are missing/empty,
a single structured log line is emitted:

```json
{ "event": "config_validation_failed", "missing": [...], "context": "production" }
```

The lambda still serves traffic — see *Why we don't throw* below — so the
failure mode is "loud log + degraded behavior," not "user-visible 502."

| Variable | Used in | Consequence if missing in prod |
|---|---|---|
| `IP_SALT_BASE` | [`src/server/rateLimit.ts:39`](../src/server/rateLimit.ts) | IP-hash salt falls back to the published literal `'byh-default-salt'`. Daily date still rotates, but the salt is no longer per-deploy. Not a critical bypass; rate-limit windows still apply. |
| `ALLOWED_ORIGINS` | [`netlify/functions/generate.ts:107`](../netlify/functions/generate.ts) | `isOriginAllowed()` becomes a no-op. ANY origin can POST `/generate` — opens cross-origin Anthropic-spend abuse. Server-to-server clients are unaffected. |
| `ANTHROPIC_API_KEY` | [`src/server/anthropic.ts:63`](../src/server/anthropic.ts) | Every `messages.create` call returns 401. The retry loop exhausts and the user always sees `safe_fallback`. Cost: zero (auth fails before billing). |
| `FIREBASE_PROJECT_ID` | [`src/server/firebaseAdmin.ts:13`](../src/server/firebaseAdmin.ts) | Firestore client init throws → rate-limit `try/catch` falls open → limiter is silently disabled. |
| `FIREBASE_CLIENT_EMAIL` | Same as above | Same as above. |
| `FIREBASE_PRIVATE_KEY` | Same as above (PEM with `\n`-escaped newlines) | Same as above. |

### Why we don't throw

Throwing at module load crashes the lambda container and produces a 502
to every user request during the fix window. Loud-but-non-fatal logging
gets the same signal to ops within seconds of the next cold-start, while
the in-flight requests continue serving with degraded behavior (e.g. the
CSRF shield is open but the rate-limiter still works). The right
operational response is "fix the env var, redeploy" — not "the lambda is
permanently broken."

---

## Optional / always-defaulted variables

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_MODEL_GEN` | `claude-sonnet-4-6` | Generation model. Override for A/B testing or model-version pins. |
| `ANTHROPIC_MODEL_SAFETY` | `claude-haiku-4-5` | Tone + distress classifier model. |
| `RATE_LIMIT_PER_HOUR` | `25` (incl. on misconfig) | Per-IP per-hour cap. `parseRateLimit()` falls back to 25 on `NaN`/`<=0`/`undefined`. |
| `ENABLE_TONE_CHECK` | enabled | Set to literal `'false'` to skip the Haiku tone classifier. |
| `VITE_POSTHOG_KEY` | unset = disabled | When unset, no PostHog SDK is loaded (lazy import never fires). |
| `VITE_POSTHOG_HOST` | unset = disabled | PostHog ingest host. Only meaningful when `VITE_POSTHOG_KEY` is set. |
| `FIREBASE_STORAGE_BUCKET` | undefined | Required by `firebase-admin` `initializeApp` config; the photo-fetch path itself uses `VITE_FIREBASE_STORAGE_BASE_URL` from the client. |

---

## Kill switches and operational toggles

Every mechanism that changes runtime behavior without a code deploy. All
require a Netlify env-var change + a brief lambda re-cold-start (effective
on the next request — typically <1s).

| Toggle | Controls | Change mechanism | Latency | Documented? | Notes |
|---|---|---|---|---|---|
| `RATE_LIMIT_PER_HOUR=9999` | Bypasses the entire rate-limit block in `generate.ts:170`. | Netlify env update | Next cold-start | Yes (CLAUDE.md) | Local dev convenience; can serve as an emergency "drop the limiter" lever in a Firestore outage. |
| `ENABLE_TONE_CHECK=false` | Skips the Haiku tone classifier; `checkTone()` returns `true` unconditionally. | Netlify env update | Next cold-start | Yes (CLAUDE.md) | Cost lever and Anthropic-degradation lever. The tone check is the single most expensive call in the safety pipeline. |
| `ALLOWED_ORIGINS` | Comma-separated allowlist for the CSRF shield. Empty = pass-through. | Netlify env update | Next cold-start | Yes (CLAUDE.md) | Adding/removing a domain doesn't require a code change. |
| `ANTHROPIC_MODEL_GEN` / `ANTHROPIC_MODEL_SAFETY` | Swap to a different Claude model without code changes. | Netlify env update | Next cold-start | Yes (CLAUDE.md) | Useful for emergency rollback if a new model regresses. |
| `IP_SALT_BASE` rotation | Invalidates all in-flight rate-limit windows (every IP gets a fresh hash). | Netlify env update | Next cold-start | Yes (PRD/19) | Use only if a salt leak is suspected — every active user gets a fresh window. |
| Firestore TTL policy | Drives auto-cleanup of `rateLimits` documents past `expiresAt`. | Firebase console / `gcloud firestore` | Variable (within a few hours) | Operational dependency | NOT enforced by code — the `expiresAt` field is written, but the policy itself is project-config. Verify on every new Firebase environment. |

### Missing kill switches

| Capability | Risk if needed | Recommendation |
|---|---|---|
| Disable `/generate` entirely without a deploy | During an Anthropic outage or a sudden cost spike, the only lever is `ENABLE_TONE_CHECK=false` (still calls Sonnet) or pulling the deploy. | Add an `ENABLE_GENERATION` env var that short-circuits to `safe_fallback` at the top of the handler when set to `'false'`. Cost: ~5 lines, one log event. |
| Disable distress classifier independently | If Haiku regresses on distress detection (false positives), there's no toggle that skips just that path while leaving tone-check on. | Add an `ENABLE_DISTRESS_CHECK` env var modeled on `ENABLE_TONE_CHECK`. Phrase-list still runs. |
| Force `safe_fallback` for canary | No way to verify the safe-fallback rendering path under live traffic without breaking real generation. | Add a `FORCE_SAFE_FALLBACK_PERCENT` env var (default 0). Useful for monitoring + canary deploys. |

None of these are blockers; today's two switches cover the most likely
outages (rate-limit pressure, tone-check pressure). Add when traffic /
cost surface area grows.

---

## Frontend storage keys (not env vars, but operational state)

Documented here for completeness — these aren't configurable but they
ARE operational state that survives across page loads and can be cleared
manually for diagnostics.

| Key | Storage | Purpose | TTL |
|---|---|---|---|
| `byh:lastPrompt` | `sessionStorage` | Restore the prompt input across reloads. Truncated to `MAX_PROMPT_LENGTH` on read (defense against tampering). | Tab session |

---

## Where to find more

- **Rate-limit window math + TTL contract**: [`PRD/19_Rate_Limiting.md`](../PRD/19_Rate_Limiting.md), [`audit-reports/24_DATA_INTEGRITY_REPORT_001_*.md`](../audit-reports/)
- **Daily-salt rotation rationale + UTC anchoring**: [`audit-reports/14_DATETIME_HANDLING_REPORT_001_*.md`](../audit-reports/)
- **Cost-control levers**: [`audit-reports/26_COST_OPTIMIZATION_REPORT_001_*.md`](../audit-reports/)
- **Why CSRF shield is needed**: [`netlify/functions/generate.ts`](../netlify/functions/generate.ts) (`isOriginAllowed` doc-block)
- **Why we cap retries at 2**: [`audit-reports/33_EXTERNAL_INTEGRATION_REPORT_001_*.md`](../audit-reports/)
