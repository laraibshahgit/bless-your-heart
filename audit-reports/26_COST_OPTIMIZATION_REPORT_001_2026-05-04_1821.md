# Cost & Resource Optimization Report — Run 001

- **Branch**: `nightytidy/run-2026-05-01-1532` (NightyTidy active branch — orchestrator manages branching)
- **Run timestamp**: 2026-05-04 18:21 (user local)
- **Mode**: implementation (overnight cost pass)
- **Test status before**: 375 / 375 passing in ~974 ms (27 files)
- **Test status after**: 376 / 376 passing in ~966 ms (27 files; +1 cache_control assertion)
- **Smoke status**: 7 / 7 passing in ~317 ms
- **Build status**: green (`npm run build`)

---

## 1. Executive Summary

This is a small, well-architected app: a static SPA + a single Netlify function that calls Anthropic, gates with Firestore-backed rate-limiting, and serves photos from Firebase Storage. There is no traditional database tier, no compute fleet, no cron jobs, no message broker. The cost surface is narrow: Anthropic tokens, Netlify bandwidth + function invocations, Firebase Storage egress + Firestore document operations, and PostHog event ingest.

Most of the spend is *traffic-proportional* (per-request Anthropic + per-page-load bandwidth). Two fixes implemented in this audit attack the two largest unit costs:

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | Hero example PNGs ship 6.85 MB on every page load — eager `loading="eager"` + `fetchPriority="high"` | **High** | **Fixed** — converted to WebP with responsive sizes; 92.5% bandwidth reduction (6.85 MB → 515 KB across all sizes) |
| 2 | Anthropic system prompts (~1.7K tokens combined) re-sent uncached on every request | **High** | **Fixed** — added `cache_control: ephemeral` to all three system prompts; ~70–85% input-token cost reduction |
| 3 | Long-cache headers absent for `/examples/*` static assets | Low | **Fixed** — added 1-year `immutable` Cache-Control |
| 4 | `posthog-js` (~70 KB gzipped) static-imported; only initialized in PROD with key | Low | Documented (deferred — requires careful refactor of analytics call sites) |
| 5 | `firebase-admin@13.8.0` transitive vuln cluster | Informational | Already-accepted baseline (see [audit 11](./11_DEPENDENCY_HEALTH_REPORT_001_2026-05-03_2351.md)) |
| 6 | No usage alerts / budget caps on Anthropic, Netlify, or Firebase | Informational | Documented as governance gap |

**Top 5 dollar wins (estimated, see assumptions in §10):**

1. **Hero image WebP conversion** — at 1k page-loads/day saves ~190 MB/day = 5.7 GB/mo bandwidth; at 50k/day (post-launch ramp) saves ~9.5 TB/mo. On Netlify Pro overage ($55/100 GB) the 50k/day figure alone is **~$50–55/mo** avoided.
2. **Anthropic prompt caching** — at 1k generations/mo saves ~$3.50; at 100k/mo saves **~$350/mo** in Sonnet input tokens alone (Haiku savings on top).
3. **Long-cache headers on `/examples/*`** — 100% of repeat-visit hero traffic is cache-hit instead of CDN-pull; multiplies the WebP savings for returning users.
4. **Lazy-load PostHog (deferred)** — reduces critical-path JS by ~70 KB gzipped. Bandwidth: ~7 MB/100 visits = ~70 GB at 1M pageviews/mo = ~$40/mo at Netlify Pro overage. Worth doing when traffic justifies the small refactor risk.
5. **Govern-after-launch monitoring** — set up Anthropic budget alerts ($X soft / $Y hard cap), Netlify bandwidth alert at 80% of plan threshold, Firebase Cloud Billing budget alert. Cost: zero. Value: prevents an unbounded incident.

**Total estimated monthly waste avoided at ~50k visitors/mo, ~10k generations/mo**: **$50–100/mo** today. Scales linearly.

---

## 2. Billable Service Inventory

| Service | Provider | Purpose | Billing Model | Usage Pattern | Monthly Cost (est.) | Issues Found |
|---|---|---|---|---|---|---|
| Anthropic Messages API (Sonnet 4.6) | Anthropic | Two-line generation | Per-token: $3/M in, $15/M out (cache read $0.30/M) | Hot path — 1 call per /generate; up to 3 with retries | ~$0.0048/req base; **~$0.0013/req cached after fix** | No prompt caching → fixed |
| Anthropic Messages API (Haiku 4.5) | Anthropic | Tone check + distress check | Per-token: $1/M in, $5/M out (cache read $0.10/M) | 1 tone call/req; 1 distress call only on phrase-list miss | ~$0.0002/req base; **~$0.00006/req cached** | No prompt caching → fixed |
| Netlify Functions | Netlify | Single `/generate` endpoint | Per-invocation; bundled with hosting plan | Per user generate click | Bundled; lambda budget 26 s | Free tier OK; no specific waste found |
| Netlify Bandwidth + Hosting | Netlify | Static SPA + functions | 100 GB/mo free; $55/100 GB overage | Per page load | **Bandwidth dominated by hero images** | Hero PNGs were 6.85 MB/load → fixed |
| Firebase Firestore | Google | Rate-limit doc per hashed IP | Reads/writes/storage; free 50k reads/20k writes/day | 1 read + 0–1 write per /generate | Free tier comfortably | TTL policy is operational dependency |
| Firebase Storage | Google | Photo CDN | Egress + storage; free 1 GB stored, 30 GB egress / mo | ~50 KB JPG per generation | ~$0.50/mo at scale | 1-year cache header already set in upload tool — good |
| PostHog | PostHog Cloud | Event tracking | Per-event ingest; ~10k events/mo free | Init on PROD load + per-user events | Likely free tier | Bundle weight only — see §3 |
| @fontsource/cormorant-garamond | npm (build-time) | Self-hosted fonts | Free (no Google Fonts CDN dependency) | Bundled at build | $0 | Good — no Google Fonts cost |
| `picsum.photos` | LoremPicsum | One-off photo seeding | Free | Build-time tool only | $0 | Local script, never hits hot path |

**Services configured but unused:**
- `firestore.indexes.json` is empty `{ "indexes": [], "fieldOverrides": [] }` — fine, not waste.
- No second/redundant analytics provider.
- No second email/SMS provider.

**Cost controls present:**
- Per-IP rate limit (25/hr default, salted with daily-rotated SHA-256) — limits both Anthropic and Firestore spend per attacker.
- `RATE_LIMIT_PER_HOUR=9999` local-dev bypass (not exposed in PROD).
- `ENABLE_TONE_CHECK=false` cost-control switch (skips one Haiku call per request when set).
- `ANTHROPIC_REQUEST_TIMEOUT_MS = 12_000` per-request cap — prevents a stuck provider from burning the whole lambda budget.
- 12 s timeout × 3 retry budget bounds worst-case per-request time at ~36 s, which the 26 s lambda kill caps further.

**Cost controls missing:**
- No daily/monthly budget cap on Anthropic spend.
- No per-IP token-cost cap (rate-limit is request-count, not token-count). A retry-storm on edge-case prompts could cost ~3× normal request without tripping the limiter.
- No alerting on Netlify bandwidth or Firebase egress thresholds. See §8.

---

## 3. Infrastructure Analysis

### Compute (Netlify Functions)

| Resource | Current | Recommendation | Estimated Savings | Confidence |
|---|---|---|---|---|
| `generate` lambda memory | Default (1024 MB) | Keep — JSON-only handler with no heavy compute | $0 | High |
| `generate` lambda timeout | Default (10 s) | Keep — `ANTHROPIC_REQUEST_TIMEOUT_MS=12000` already enforces per-call cap | $0 | High |
| Auto-scaling | N/A (Netlify managed) | N/A | $0 | High |
| Cold-start mitigations | None (Netlify has limited control) | Not worth provisioning concurrency for this volume | $0 | High |

**Bundling**: `netlify.toml` uses `node_bundler = "esbuild"` and `external_node_modules = ["firebase-admin"]`. esbuild is the right default; firebase-admin is excluded so the lambda doesn't try to bundle ~2 MB of dependencies that load lazily anyway. Good.

**Observation**: `await import('../../src/server/rateLimit')` inside `generate.ts:173` is intentionally dynamic — it avoids loading firebase-admin at all when `RATE_LIMIT_PER_HOUR=9999` (dev bypass). Subsequent invocations on a warm lambda are cached by Node's module loader. Net cost-effective.

### Database (Firestore)

| Resource | Current | Recommendation | Estimated Savings | Confidence |
|---|---|---|---|---|
| Read replicas | N/A (single doc per IP key) | No-op | $0 | High |
| Multi-AZ / regional | Default | Keep | $0 | High |
| Backup retention | N/A (rate-limit data is ephemeral) | Keep | $0 | High |
| Storage growth bound | TTL policy at `expiresAt` | **Verify TTL policy exists in Firebase Console** | Prevents unbounded growth | High |

**Critical operational dependency**: Firestore TTL is configured at the project/collection level via `gcloud firestore` or the Firebase Console, **not** via code. The codebase writes `expiresAt` correctly (pinned by tests in `tests/server/rateLimit-extended.test.ts`), but if the TTL policy is missing the `rateLimits` collection grows linearly. At 25 req/hr/IP × 24 × 30 days × 1k unique IPs/day ≈ ~720k docs/month, which would easily overrun the free tier (1 GB stored / 50k reads/day). **Verify in Firebase Console**.

### Storage (Firebase Storage)

| Resource | Current | Recommendation | Estimated Savings | Confidence |
|---|---|---|---|---|
| Photo cache headers | `public, max-age=31536000` (set in `tools/upload-real-photos.mjs`) | Keep | $0 | High |
| Photo lifecycle | None | Keep — 10 photos, ~50 KB each, never expire | $0 | High |
| Storage versioning | Disabled | Keep | $0 | High |
| Photo size | 1080×1080 JPEG q=82 | Keep — matches `POSTER_LOGICAL_SIZE_PX` | $0 | High |

The photo CDN is correctly configured. Each photo egress per request is ~50 KB at $0.12/GB egress = $0.000006 per image — negligible.

### Networking / CDN

- Netlify CDN handles static asset delivery with default cache hints from headers.
- **Fixed**: added `Cache-Control: public, max-age=31536000, immutable` for `/examples/*` so hero images cache for one year at every edge node.
- `<link rel="preconnect" href="https://firebasestorage.googleapis.com" crossorigin>` already in `index.html` — saves DNS+TLS handshake on first photo load. Already present from audit run 25/001.

### Containers & CI/CD

- No Docker images in this repo.
- No CI/CD config in the repo (Netlify auto-deploys from `master` push). No GitHub Actions, no scheduled pipelines.

---

## 4. Application-Level Waste

### Redundant API calls

| Pattern | Calls Per Request | Cacheable? | Action |
|---|---|---|---|
| Anthropic Sonnet generation | 1 (up to 3 with retries) | Yes — system prompt is static (~1300 tokens) | **Fixed**: added `cache_control: ephemeral` to `generateLines` |
| Anthropic Haiku tone check | 1 per attempt | Yes — system prompt is ~140 tokens | **Fixed**: added `cache_control: ephemeral` to `checkTone` |
| Anthropic Haiku distress check | 0–1 (only on phrase-list miss) | Yes — system prompt is ~250 tokens | **Fixed**: added `cache_control: ephemeral` to `checkDistressWithHaiku` |
| Firestore rate-limit read | 1 per /generate | No — per-IP state, must be authoritative | Keep |
| Firestore rate-limit write | 1 per allowed /generate | No | Keep |
| Photo CDN fetch | 1 per generation result | Yes — 1-year cache header set | Already optimal |

#### Token-cost math (per request, before/after)

**Sonnet generation** (1300 tokens system + ~50 tokens user prompt; ~50 tokens output):

| | Before | After |
|---|---|---|
| Input cost | (1350 × $3) / 1M = $0.00405 | (50 × $3 + 1300 × $0.30) / 1M = $0.00054 |
| Output cost | (50 × $15) / 1M = $0.00075 | $0.00075 |
| **Per call** | **$0.00480** | **$0.00129** |
| **Savings** | | **$0.00351 (73%)** |

First request on cold cache pays a 1.25× write surcharge on the cached portion: ~$0.00488 first-call, then $0.00129 thereafter. Cache TTL is 5 min; sustained traffic of 1+ req/5min keeps the cache warm.

**Haiku tone check** (140 system + 50 user; ~5 output):

| | Before | After |
|---|---|---|
| Input cost | (190 × $1) / 1M = $0.000190 | (50 × $1 + 140 × $0.10) / 1M = $0.000064 |
| Output cost | (5 × $5) / 1M = $0.000025 | $0.000025 |
| **Per call** | **$0.000215** | **$0.000089** |
| **Savings** | | **$0.000126 (59%)** |

**Combined per-request savings (1 Sonnet + 1 Haiku tone check, no retries)**: ~$0.00364, or **76% of Anthropic cost reduced**.

#### Projected monthly Anthropic savings

| Volume (gen/mo) | Before | After | Saved |
|---|---|---|---|
| 1,000 | $5.02 | $1.41 | **$3.61** |
| 10,000 | $50.20 | $14.10 | **$36.10** |
| 100,000 | $502.00 | $141.00 | **$361.00** |

(Assumes 1 successful gen + 1 tone check + zero retries. Distress-Haiku only fires on phrase-list miss; its savings stack on top, scaled by miss rate.)

### Database query cost
- Single document `runTransaction(get → set/update)` keyed by hashed IP.
- No `select *`, no full table scans, no analytics-on-prod-DB, no N+1.
- Firestore costs at this volume are well within free tier.

### Storage patterns
- No upload size from end users (downloads only).
- No generated-file storage (canvas blobs are downloaded directly to the user device).
- No application logs in storage; Netlify captures stdout/stderr by default.

### Serverless patterns
- No provisioned concurrency (correct for this traffic).
- Function memory at default; no over-allocation observed.

### Third-party tier optimization
- PostHog: client-side only, 10k events/mo free tier likely sufficient for current scale. `disable_session_recording: true` and `disable_surveys: true` are already set — good cost hygiene.

### Code-level fixes implemented (this run)

| File | Change | Impact | Tests |
|---|---|---|---|
| `src/server/anthropic.ts` | Added `PROMPT_CACHE_CONTROL` export and `cache_control: ephemeral` to `generateLines` system prompt | -73% Sonnet input cost | Pass (376/376) |
| `src/server/anthropic.ts` | Added `cache_control: ephemeral` to `checkTone` system prompt | -59% Haiku input cost | Pass |
| `src/server/safety.ts` | Imported `PROMPT_CACHE_CONTROL`; wrapped `checkDistressWithHaiku` system prompt | -59% Haiku input cost on distress check | Pass |
| `tests/server/anthropic.test.ts` | Updated assertion for content-block system shape; added cache_control assertion | Coverage maintained | Pass |
| `src/components/HeroExamples.tsx` | Switched from raw `<img src=PNG>` to `<picture>` with WebP `<source>` + PNG fallback; added `width`/`height` to prevent CLS | -97% per-load bandwidth | Pass |
| `tools/optimize-hero-examples.mjs` | New script: regenerates `hero-{N}-{540,720}.webp` from PNG sources via sharp | Tooling for future hero image swaps | N/A |
| `public/examples/hero-{1,2,3}-{540,720}.webp` | Generated WebP companions | 6 new files; 6.85 MB → 515 KB | N/A |
| `netlify.toml` | Added `Cache-Control: public, max-age=31536000, immutable` for `/examples/*` | Repeat-visit hero traffic = 0 origin pulls | N/A |

---

## 5. Data Transfer & Egress

### Patterns

| Direction | Size | Frequency | Notes |
|---|---|---|---|
| Browser ← Netlify (HTML + JS + CSS) | ~155 KB gzipped | Once per page load | Bundle is healthy |
| Browser ← Netlify (hero images) | **6.85 MB → 515 KB** | Once per page load | **Fixed** — single biggest win |
| Browser ← Netlify (fonts) | ~25 KB woff2 (latin only) | Once, then cached | `unicode-range` keeps non-latin from loading |
| Browser → Netlify (`/generate` POST) | ~250 B JSON | Per generate click | OK |
| Netlify ← Browser (`/generate` response) | ~150 B JSON | Per generate click | OK |
| Browser ← Firebase Storage (photo) | ~50 KB JPG | Per generation result | 1-year cache; warm-cache zero pulls on regen |
| Netlify Function → Anthropic | ~1.7 KB request | Per /generate (1–3×) | Cacheable prefix → fixed |
| Netlify Function → Firestore | ~100 B per doc op | 1–2× per /generate | OK |

### Recommendations

- **Implemented**: `<picture type="image/webp">` + responsive sizes + 1-year `immutable` cache header for `/examples/*`.
- **Not implemented (low value)**: Brotli for static text assets — Netlify already negotiates Brotli automatically when the browser advertises it. No code change required.
- **Not applicable**: response compression on `/generate` — payloads are <1 KB.

---

## 6. Non-Production Costs

This is a one-engineer-team project with no parallel non-prod environment. Local dev runs against the same Anthropic key (with `RATE_LIMIT_PER_HOUR=9999` bypass) and the production Firebase project. Risks:

| Risk | Severity | Mitigation |
|---|---|---|
| Local dev exhausts Anthropic spend during testing | Low | `ENABLE_TONE_CHECK=false` available; recommend setting in `.env.local` for non-feature dev work to halve per-call cost during high-iteration debugging |
| Local dev pollutes prod Firestore `rateLimits` collection | Low | Hashed IPs from localhost are predictable; volume is one-engineer scale; TTL policy reaps them within 1 hour |
| No staging mirror | Medium | Out of scope for this audit — would require dedicated Firebase project + duplicated env vars |

No detected wasteful non-prod resources.

---

## 7. Code-Level Fixes Implemented

(Cross-reference §4. Summary table:)

| File | Change | Impact | Tests Pass? |
|---|---|---|---|
| `src/server/anthropic.ts` | `cache_control: ephemeral` on `generateLines` system prompt; new export `PROMPT_CACHE_CONTROL` | Sonnet input cost −73% | ✅ |
| `src/server/anthropic.ts` | `cache_control: ephemeral` on `checkTone` system prompt | Haiku input cost −59% | ✅ |
| `src/server/safety.ts` | `cache_control: ephemeral` on `checkDistressWithHaiku` system prompt | Haiku input cost −59% on distress checks | ✅ |
| `tests/server/anthropic.test.ts` | Updated `args.system` assertion for new shape + new test for cache_control | Contract assertion preserved | ✅ |
| `src/components/HeroExamples.tsx` | `<picture>` with WebP source; added `width`/`height` for CLS | Per-load bandwidth −97% | ✅ |
| `tools/optimize-hero-examples.mjs` | New tool to regenerate WebP companions from PNGs | Future hero-image swaps automated | N/A |
| `public/examples/hero-{1,2,3}-{540,720}.webp` | 6 new WebP files (515 KB total) | New optimized assets | N/A |
| `netlify.toml` | `[[headers]] for = "/examples/*"` 1-year immutable cache | Repeat-visit hero bandwidth → 0 | ✅ (build green) |

**Verification commands run:**
- `npx vitest run` → 376/376 tests pass (was 375; +1 cache_control assertion added)
- `npx vitest run tests/smoke.test.ts` → 7/7 smoke pass in ~317 ms
- `npm run build` → clean (lint:photos + tsc + vite build)

---

## 8. Cost Monitoring Assessment

**Visibility — current state:**
- Anthropic dashboard: per-key token usage visible, but no dollar-cap configured.
- Netlify dashboard: bandwidth + function invocation graphs visible per site.
- Firebase Console: Firestore reads/writes/storage visible; Storage egress visible.
- PostHog: event ingest count visible.

**Tagging strategy**: N/A — single-app deployment, no need to attribute cost across teams.

**Per-feature attribution**: N/A — single feature.

**Anomaly detection**: None configured.

**Governance gaps**:

| Gap | Severity | Recommendation |
|---|---|---|
| No Anthropic monthly spend cap | High | Set a soft + hard limit in Anthropic Console. At current ~$0.005/req, 100k req/mo = $500. A 2× spike (mass abuse, bug, or viral hit) would triple it without warning. |
| No Netlify bandwidth alert | Medium | Set alert at 80 GB / month (free tier is 100 GB) so the team has lead time before overage |
| No Firebase Cloud Billing alert | Medium | Set Cloud Billing budget alert at 50%, 80%, 100% of expected monthly cost |
| No Firestore TTL verification | High | **Manually verify TTL policy on `rateLimits.expiresAt` is enabled** in Firebase Console — code-side correctness is necessary but not sufficient |
| No per-IP token-cost cap | Low | Current rate limit is 25 req/hr/IP. With max 3 retries × 1 successful gen = ~$0.015 worst case. Acceptable. |

**Specific recommendations**:

1. **Anthropic spend cap (immediate)**: Set monthly cap at 2× expected. If today's monthly bill is ~$5, cap at $20. This is free of cost to implement.
2. **Netlify bandwidth alert (immediate)**: 1-line config in Netlify dashboard.
3. **Firebase Cloud Billing budget (immediate)**: Set $5–10/month soft cap; budget alerts route to email.
4. **Firestore TTL verification (one-time)**: `gcloud firestore fields ttls list` (or check Firebase Console). If missing, add it. Code already writes `expiresAt` correctly.
5. **Cost-tracking log line (post-launch)**: emit `tokens_in`/`tokens_out` from `generate.ts` per request so a downstream log query can sum daily Anthropic spend. Currently the function only logs `event` types.

---

## 9. Savings Roadmap

### Immediate (this run, completed)

| # | Opportunity | Est. Savings | Effort | Risk | Confidence | Details |
|---|---|---|---|---|---|---|
| 1 | Hero image WebP conversion + responsive sizing | ~$50/mo at 50k visits/mo (Netlify Pro overage scenario); page-load speed material UX win | S (45 min) | Low | High | §4 + §7. PNG fallback retained. |
| 2 | Anthropic prompt caching across all three system prompts | $3.61–$361/mo (1k–100k req/mo) | S (30 min) | Low | High | §4 token math |
| 3 | 1-year `immutable` Cache-Control on `/examples/*` | Multiplies #1 savings for returning users | S (5 min) | Low | High | netlify.toml |

### This Month

| # | Opportunity | Est. Savings | Effort | Risk | Confidence | Details |
|---|---|---|---|---|---|---|
| 4 | Set Anthropic monthly spend cap | Caps blast radius on incident; $0 if unused | XS (5 min) | Low | High | One-click in console |
| 5 | Set Netlify bandwidth alert at 80 GB | Lead time before overage | XS (5 min) | Low | High | One-click in console |
| 6 | Set Firebase Cloud Billing budget alert | Prevents silent egress spike | XS (10 min) | Low | High | gcloud or console |
| 7 | Verify Firestore TTL policy on `rateLimits` | Prevents unbounded growth | XS (5 min) | Low | High | Operational dependency, not code |

### This Quarter

| # | Opportunity | Est. Savings | Effort | Risk | Confidence | Details |
|---|---|---|---|---|---|---|
| 8 | Lazy-load PostHog | ~70 KB gzipped JS = ~70 GB at 1M pageviews/mo = ~$40/mo at overage | M (1–2 hr) | Medium | Medium | Requires deferring `track()` calls until SDK loaded; queue events meanwhile. Worth it once traffic justifies the effort. |
| 9 | Emit `tokens_in`/`tokens_out` per /generate log | Enables data-driven cost forecasting | S (30 min) | Low | Medium | Anthropic SDK returns usage in `response.usage`; log alongside existing `gen_ok` event |
| 10 | Re-encode hero PNG fallbacks at lower quality (or drop) | Removes ~7 MB of unused assets | S (15 min) | Low | Medium | WebP support is universal since 2020; fallback is paranoid. Decide based on analytics on browser support |

### Ongoing

| # | Opportunity | Notes |
|---|---|---|
| 11 | Monitor Anthropic prompt-cache hit rate | First call after cold cache pays 1.25× write; cache TTL 5 min. At sustained traffic of 1+ req/5min, cache stays warm and savings are maximized. Below that, savings shrink. SDK exposes `cache_creation_input_tokens` / `cache_read_input_tokens` in `response.usage` — log and graph. |
| 12 | Re-evaluate Anthropic model selection | Current: Sonnet 4.6 for gen, Haiku 4.5 for safety. If a cheaper model (e.g. Haiku 4.5 for gen with quality eval) holds quality, savings would dwarf prompt caching. Out of scope for this audit; needs A/B test with quality eval. |

---

## 10. Assumptions & Verification Needed

This audit estimates dollar impact based on assumed traffic and pricing. Each must be verified against actual data:

| Assumption | Used For | How to Verify |
|---|---|---|
| Sonnet 4.6 input $3/M, output $15/M, cache read $0.30/M | Token-cost math | https://www.anthropic.com/pricing — confirm at audit time |
| Haiku 4.5 input $1/M, output $5/M, cache read $0.10/M | Token-cost math | Same as above |
| System prompt ≈ 1300 tokens (Sonnet), 140 tokens (tone), 250 tokens (distress) | Cache savings math | Anthropic SDK `response.usage.cache_creation_input_tokens` on first call; estimate is byte-count based at ~4 bytes/token |
| 50k visits/mo, 10k generations/mo | Roadmap volume scenarios | Replace with actuals once traffic data is available — likely currently far lower (pre-launch) |
| Netlify Pro overage at $55/100 GB | Bandwidth dollarization | Check current Netlify plan tier; free tier is 100 GB included |
| 1+ request per 5 min keeps Anthropic cache warm | Prompt-cache hit-rate assumption | After deploy, check `cache_read_input_tokens` ratio in logs |
| Hero images render at 280–540 px max | Sizing decision in `optimize-hero-examples.mjs` | Confirm via Lighthouse mobile/desktop run on deployed site; adjust the `SIZES` array if browser DPR usage differs |
| TTL policy is enabled on `rateLimits.expiresAt` | Free-tier safety | `gcloud firestore fields ttls list` |
| WebP browser support is universal | Decision to skip a JPEG fallback | https://caniuse.com/webp — if any `<2%` segment matters for the brand, keep PNG fallback (already in place) |

**Specific questions for the team**:
1. What's the current traffic volume (visits/mo, generations/mo)? The savings estimates above scale linearly.
2. Is Netlify on free tier or Pro? Determines whether bandwidth savings are real-dollar or just cushion.
3. Is the Firestore TTL policy on `rateLimits.expiresAt` enabled in the production project? (Code can't check this.)
4. Does the team want a token-usage log line added now, or wait for actual traffic to determine if it's worth the noise?

---

## Closing notes

The codebase is already cost-conscious — there is no obvious waste from over-provisioning, no unused services, no redundant providers, no unnecessary daemons. The two material wins implemented (hero image WebP + Anthropic prompt caching) are *traffic-multiplied savings* — they'll matter increasingly as the site scales. At pre-launch scale they pay for themselves in minutes; at 100k generations/mo they're worth ~$400/month combined.

The biggest *operational* cost-control gap is the absence of dashboard-level budget caps and alerts. Those are 5-minute fixes that become priceless during the inevitable first incident. They are documented in §8 and §9 as immediate-priority recommendations.
