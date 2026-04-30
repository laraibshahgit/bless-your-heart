# Analytics

## Overview

PostHog tracks the events that signal whether the product is working — generations, downloads, regenerate depth, fitting-pipeline rung — without collecting PII or content. Volume of `poster_downloaded` is the truest leading indicator of share intent (per `bless-your-heart-journey-qa.md`'s success metrics) and the single most important number to watch.

This file specifies the SDK setup, the tracked event list, what NOT to track, and the dashboards worth building.

## Dependencies
- `01_Tech_Stack.md` — PostHog dependency and env vars
- `bless-your-heart-journey-qa.md` (source PRD) — Success metrics this analytics layer measures

## Setup

```ts
// src/lib/analytics.ts
import posthog from 'posthog-js';

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  if (!import.meta.env.PROD) return;          // Skip in dev
  if (!import.meta.env.VITE_POSTHOG_KEY) return;

  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    autocapture: false,                       // Critical — see below
    capture_pageview: true,                   // One pageview per landing
    capture_pageleave: false,
    persistence: 'sessionStorage',            // No long-term cookies
    disable_session_recording: true,
    disable_surveys: true,
    loaded: () => { initialized = true; },
  });
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, props);
}
```

Call `initAnalytics()` once in `main.tsx` after React mounts.

### Why `autocapture: false`

PostHog's autocapture records every click, input change, and form submit by default. For this product, that's both privacy-overreach (input field text might be captured incidentally) and noise (the only events that matter are the half-dozen listed below). Explicit tracking only.

### Why `persistence: 'sessionStorage'`

The default `localStorage` persists a `distinct_id` across sessions, which would let PostHog correlate a returning user across visits even though the product has no user accounts. SessionStorage scopes the ID to the current tab/session, which matches the product's "no retention" ethos.

### Why session recording is off

Even with input-masking, session recording captures the surface of an emotional product where users describe bad days. Not appropriate.

## Tracked Events

| Event | When | Properties | Rationale |
|-------|------|-----------|-----------|
| `$pageview` (auto) | Landing | (default) | Funnel top |
| `prompt_submitted` | User clicks Generate (or presses Enter) | `source: 'preset' \| 'freeform' \| 'edited_preset'`, `length: number` | Funnel entry |
| `generation_completed` | Function returned `status: ok` after load floor | `fittingRung: 1\|2\|3\|4` | Generation success rate |
| `generation_blocked` | Function returned `blocked` | `reason: 'slur' \| 'real_person'` | Rate of safety triggers (no content) |
| `generation_distress` | Function returned `distress` | (none) | Rate of distress flow (no content, no IP) |
| `generation_rate_limited` | Function returned `rate_limited` | (none) | Cap utilization |
| `generation_error` | Function returned `error` or fetch failed | `kind: 'anthropic' \| 'timeout' \| 'network' \| 'unknown'` | Error rate |
| `generation_safe_fallback` | Function returned `safe_fallback` | (none) | Health alarm — should be < 1% |
| `regenerate_clicked` | User clicked Regenerate | `regenDepth: number` (1-indexed) | Regen depth distribution |
| `poster_downloaded` | After successful download | `fittingRung` | The most important metric |
| `distress_dismissed` | User closed the distress modal | (none) | False-positive signal for tuning |

### Property naming

snake_case for event names; camelCase for properties (PostHog convention).

### What's NOT in any property

| Field | Why excluded |
|-------|-------------|
| User prompt | Privacy — input contents never leave the function |
| Generated text | Same |
| Photo ID | Could de-anonymize (a unique sequence of photos identifies a session) |
| IP address (raw or hashed) | PostHog's GeoIP is enough for country signals; hashed IP correlation across events is correlation we shouldn't build |
| User agent details | PostHog captures basic device info automatically; no need to enrich |

If a developer is tempted to add a property to "make analytics richer," ask: *would I be comfortable showing this to the user as part of a "data we have on you" dialog?* If no, don't track it.

## Funnels and Insights

Configure these in PostHog after first deploy:

### Generation funnel

```
$pageview
  → prompt_submitted
    → generation_completed
      → poster_downloaded
```

The drop-off between each stage is the leading indicator the journey doc cares about:

| Stage | Healthy rate | Per source PRD |
|-------|-------------|----------------|
| Pageview → prompt_submitted | ≥ 60% | Land-to-generate |
| Prompt → generation_completed | ≥ 95% | Generation success |
| Completion → download | ≥ 35% | Download intent — the truest output-quality signal |

### Regeneration depth distribution

A histogram of `regenerate_clicked` events grouped by `regenDepth`. Healthy:

- Mean: 1–3
- < 10% of sessions go above 5

A right-shifted distribution (lots of high-depth regens) means nothing is landing. A left-shifted one (mostly first-try downloads) means quality is hitting on first generation.

### Fitting rung distribution

`generation_completed` grouped by `fittingRung`. Healthy:

- Rung 1: ≥ 95%
- Rung 2: < 4%
- Rung 3: < 1%
- Rung 4: < 1%

Sustained Rung 2+ above 5% is the prompt-drift alarm (per `14_Text_Fitting_Pipeline.md`).

### Block reason breakdown

`generation_blocked` grouped by `reason`. Both should be rare. If `slur` rate is meaningfully higher than `real_person`, the slur list might be too aggressive (false positives); review.

### Geographic distribution

PostHog's automatic GeoIP gives country-level signals. Useful for:

- Knowing which hotline regions to prioritize verifying
- Spotting geographic concentration (a Reddit thread in one country pushes traffic; the data shows up here)

## Dashboards to Build

Three dashboards cover the product's needs:

### 1. Health dashboard

| Tile | Source |
|------|--------|
| Pageviews / day | `$pageview` |
| Downloads / day | `poster_downloaded` |
| Generation success rate | `generation_completed` ÷ `prompt_submitted` |
| Error rate by kind | `generation_error` grouped by `kind` |
| Rate-limit hits / day | `generation_rate_limited` |
| Safe-fallback rate | `generation_safe_fallback` ÷ `generation_completed` |

Glance at this weekly. Anything red sits in this tile until fixed.

### 2. Quality dashboard

| Tile | Source |
|------|--------|
| Download rate (per generation) | `poster_downloaded` ÷ `generation_completed` |
| Mean regen depth per session | `regenerate_clicked` per session |
| Fitting rung distribution | `generation_completed` grouped by `fittingRung` |
| Distress trigger rate | `generation_distress` ÷ `prompt_submitted` |
| Distress dismissal rate | `distress_dismissed` ÷ `generation_distress` (false-positive proxy) |

Review monthly. A drift in any of these is the early signal of voice/photo/safety regressions.

### 3. Discovery dashboard

| Tile | Source |
|------|--------|
| Direct traffic ratio | PostHog default referrer breakdown |
| Top referrers | Same |
| Country breakdown | Auto |
| New vs returning sessions | Auto |

Per the journey doc, "direct traffic ratio" (URL typed, word of mouth, watermark trace) is the truest signal of organic spread. High direct % means the product is traveling.

## Anti-Metrics (deliberately not tracked)

Listed because they tempt and shouldn't:

| Anti-metric | Why not |
|------------|---------|
| Daily Active Users | Per `00_README.md`'s anti-features — chasing this corrupts the product |
| Session duration | Short is good; long is bad; the metric is meaningless here |
| Account signups | There are none |
| Notification engagement | There are none |
| Streak retention | Anti-feature |
| Per-prompt content analysis | Privacy violation |

## Privacy Posture

A user landing on the site:

- Sees no cookie banner (no cookies set; `sessionStorage` doesn't trigger most regulations)
- Has anonymous, session-scoped tracking (no cross-visit correlation)
- Is never identified beyond the PostHog auto-generated session ID
- Has no PII recorded ever
- Generates events that, even in aggregate, don't expose what they typed or what they made

A "what we collect" line in the footer's content-notice surface (per `06_Landing_Page.md`) is the only acknowledgment the user needs.

## EU/GDPR Considerations

The product's analytics posture is permissive enough to fit within most jurisdictions' lighter-touch regulations:

- No cross-site tracking
- No personal identifiers
- Session-scoped only
- No legitimate-interest creep

A short footer note ("This site uses anonymous analytics") plus PostHog's own EU-hosted ingestion endpoint (set `VITE_POSTHOG_HOST` to PostHog's EU host if EU traffic is significant) covers most of what's needed. A formal cookie banner is out of scope for v1; revisit if European traffic concentrates and legal posture sharpens.

## Gaps & Assumptions

- **PostHog free tier limits**: 1M events/month. At ~5 events per session × ~5,000 sessions/month at moderate traffic, that's 25,000 events/month — 2.5% of the cap. Comfortable headroom.
- **Self-hosted PostHog**: not pursued at v1. The hosted free tier is enough; self-hosting adds infra burden without value at this scale.
- **Custom segmentation by traffic source**: PostHog handles this automatically via referrer; no manual instrumentation required.
- **A/B testing**: not used at v1. The product is small and opinionated; experimenting is premature. Available in PostHog if needed later.
- **PostHog feature flags**: similarly available but unused at v1. The `ENABLE_TONE_CHECK` env-var flag in `09_Output_Validation_And_Retries.md` could be migrated to a feature flag if dynamic toggling proves useful.
- **Conversion tracking from share to recipient visit**: only via referrer when a recipient pastes the URL. No client-side instrumentation possible — the watermark on the PNG is the only "tracking" mechanism for image-borne discovery, and it's a typed brand-name lookup, not a tracked link.
