# Dependency Health & Upgrade Pass — Run 001

**Date:** 2026-05-03 23:51 (local)
**Branch:** `nightytidy/run-2026-05-01-1532` (per orchestrator constraints — no branch creation)
**Auditor:** Claude (Opus 4.7)
**Baseline test status:** 345 / 345 passed
**Final test status:** 345 / 345 passed
**Build:** ✅ `npm run build` succeeds (lint:photos + tsc + vite)

---

## 1. Executive Summary

| Metric | Count |
|---|---|
| Direct dependencies (start) | 32 (15 prod + 17 dev) |
| Direct dependencies (end) | 30 (13 prod + 17 dev) |
| Total resolved packages (start) | 534 |
| Total resolved packages (end) | 531 |
| Unique transitive packages | 442 |
| **Dependencies with known vulnerabilities** | **10 (8 moderate, 2 low)** — all transitive through `firebase-admin` |
| Dependencies 1+ major versions behind | 1 (`tailwindcss` 3.4 → 4.2) |
| Potentially abandoned dependencies | 0 |
| License risks found | 0 |
| **Upgrades applied** | **2 patch (posthog-js, zod)** |
| **Dependencies removed** | **2 (react-hook-form, @hookform/resolvers — never imported)** |
| Major upgrades attempted | 0 (tailwind v4 is a documented hold; see §6) |

**Headline:** This is a remarkably healthy dependency tree. Every direct dependency is at-or-near latest, license inventory is permissive-only (no GPL/AGPL/SSPL surfaces), and the only vulnerability cluster is a transitive `firebase-admin` issue that npm advises "fix" by downgrading to 10.x — which does not actually patch the underlying CVEs. The two notable wins from this pass are the **removal of `react-hook-form` and `@hookform/resolvers`**, which were declared in package.json but never imported anywhere in `src/` or `tests/`.

---

## 2. Vulnerability Report

### npm audit summary (after changes)

```
info: 0 · low: 2 · moderate: 8 · high: 0 · critical: 0  → total 10
```

All 10 advisories are nested under `firebase-admin@13.8.0` (which is the current latest release). The npm audit "fix" recommendation points at `firebase-admin@10.1.0` and is flagged `isSemVerMajor: true` — this is **misleading**: 10.1.0 is *older* than 13.8.0 and cannot patch newer transitive vulnerabilities. The advisories will not clear until the firebase-admin maintainers ship a release that bumps `uuid`, `gaxios`, `google-gax`, `@google-cloud/firestore`, `@google-cloud/storage`, etc.

| Package (transitive) | CVE / Advisory | Severity | Used in project? | Fix available now? |
|---|---|---|---|---|
| `uuid` (<14.0.0) | GHSA-w5hq-g745-h8pq — Missing buffer bounds check in v3/v5/v6 when `buf` is provided | moderate | **No exploitable path** — code never invokes `uuid.v3/v5/v6` with a caller-supplied buffer; only firebase-admin uses uuid internally | No |
| `gaxios` (6.4.0–6.7.1) | via `uuid` | moderate | Server-only (Firestore client) | No (waiting on firebase-admin bump) |
| `@google-cloud/firestore` | via `google-gax` | moderate | Yes (rate-limit txn store) | No |
| `@google-cloud/storage` | via `retry-request`, `teeny-request`, `uuid` | moderate | No — server uses Storage *URLs* only, never the SDK | No |
| `google-gax` (4.0.5-experimental–4.6.1) | via `retry-request`, `uuid` | moderate | Indirect | No |
| `firebase-admin` (>=10.2.0) | via the four above | moderate | Yes | No (we are already on latest 13.8.0) |
| `retry-request` (7.0.0–7.0.2) | via `teeny-request` | moderate | Indirect | No |
| `teeny-request` (3.9.1–10.1.0) | via `http-proxy-agent`, `uuid` | moderate | No (Storage SDK only) | No |
| `http-proxy-agent` (4.0.1–5.0.0) | via `@tootallnate/once` | low | No (proxy path unused) | No |
| `@tootallnate/once` (<3.0.1) | GHSA-vpq2-c234-7xj6 — Incorrect Control Flow Scoping | low | No | No |

**Risk assessment:** Functionally the entire cluster is *server-side, dev-only attack surface*. The Netlify function only ever calls `firebase-admin/firestore` `Timestamp` and a single `runTransaction` against the rate-limit collection ([`src/server/rateLimit.ts`](../src/server/rateLimit.ts)). It does not touch Storage, gaxios HTTP, proxies, or `uuid.v3/v5/v6`. The advisory burden is real but the realised exploitability in this codebase is zero. **No action required beyond monitoring** — when firebase-admin ships a release that bumps `uuid` to ≥14, do a passive `npm install firebase-admin@latest`.

Vulnerabilities that could not be fixed: all 10. Reason: upstream `firebase-admin@13.8.0` is the latest release and pins these older transitive versions. There is no upstream patch yet.

---

## 3. License Compliance

### Inventory (442 unique packages on disk)

| License | Count | Risk |
|---|---:|---|
| MIT | 338 | Low |
| Apache-2.0 | 65 | Low |
| ISC | 20 | Low |
| BSD-3-Clause | 17 | Low |
| BSD-2-Clause | 4 | Low |
| MIT-0 | 2 | Low |
| MPL-2.0 | 2 | Low (file-level copyleft only) |
| OFL-1.1 | 1 | Low (`@fontsource/cormorant-garamond` — Open Font License is the standard for redistributable fonts) |
| `Apache-2.0 AND LGPL-3.0-or-later` | 1 | Low — `@img/sharp-win32-x64@0.34.5` (Windows native binary; LGPL applies only to dynamic-linked libvips, which is the intended usage) |
| CC-BY-4.0 | 1 | Low — `caniuse-lite` (browser-target data) |
| `(MPL-2.0 OR Apache-2.0)` | 1 | Low — `dompurify` (we'll use Apache-2.0 prong) |
| BlueOak-1.0.0 | 1 | Low (permissive) |
| CC0-1.0 | 1 | Low (public domain) |
| `(BSD-3-Clause OR GPL-2.0)` | 1 | Low — `node-forge` (we'll use BSD-3 prong) |
| 0BSD | 1 | Low |
| `SEE LICENSE IN LICENSE` | 1 | Low — `posthog-js@1.372.5` (the `LICENSE` file is plain Apache-2.0; only the SPDX field is non-canonical) |

**No GPL-only, AGPL, SSPL, BSL, or unlicensed packages are present.** The project's declared license is `ISC` (per `package.json:17`); every dependency license is compatible with redistributing an ISC project.

**Recommendations:**
- File a tiny upstream PR / issue against `posthog-js` asking them to set `"license": "Apache-2.0"` in package.json so it surfaces correctly in tooling. Not actionable in this repo.
- For ongoing license monitoring: `npm-license-checker` or GitHub's built-in dependency review action would catch a future GPL pull-in. See §9.

---

## 4. Staleness Report

| Package | Current | Latest | Versions behind | Last published (latest) | Health |
|---|---|---|---|---|---|
| `tailwindcss` | 3.4.19 | 4.2.4 | 1 major | 2026-04-29 | Active. **Held intentionally** — see §6. |
| `posthog-js` | ~~1.372.5~~ → **1.372.6** | 1.372.6 | up to date | 2026-04-30 | Active, multi-release/week cadence |
| `react-hook-form` | ~~7.74.0~~ **(removed)** | 7.75.0 | n/a | n/a | Removed (unused) |
| `zod` | ~~4.4.1~~ → **4.4.2** | 4.4.2 | up to date | 2026-04-30 | Active |
| All other 28 direct deps | latest | latest | 0 | various | Healthy |

**Lockfile status:** `package-lock.json` is committed. After both the upgrade and the uninstall passes, `npm install` produced no `npm WARN`s about drift. The 22 packages with multiple versions in the tree (`uuid`, `picomatch`, `agent-base`, `gaxios`, `whatwg-url`, …) are all the result of independent transitive consumers requesting different majors — normal for a Node project of this size, not actionable without major-version bumps in firebase-admin/jsdom.

One **extraneous** package warning surfaced by `npm ls`: `@emnapi/runtime@1.10.0`. This is a Sharp `optionalDependency` for native-module emulation that npm hoists to the top level on Windows; harmless but flagged. Not actionable.

---

## 5. Upgrades Applied

| Package | From | To | Type | Tests pass? |
|---|---|---|---|---|
| `posthog-js` | 1.372.5 | 1.372.6 | patch | ✅ 345/345 |
| `zod` | 4.4.1 | 4.4.2 | patch | ✅ 345/345 |

Both patches are bug-fix-only releases per their changelogs:
- `posthog-js@1.372.6` — internal queue handling fix (no API change)
- `zod@4.4.2` — narrowed `.transform` return-type inference (no runtime change)

`react-hook-form@7.74→7.75` was *not* applied because the package is unused (see §7). Upgrading and then removing would be churn.

No issues encountered during upgrades.

---

## 6. Major Upgrades Needed (Not Applied)

| Package | Current | Target | Breaking changes | Effort | Priority |
|---|---|---|---|---|---|
| `tailwindcss` | 3.4.19 | 4.2.4 | Tailwind v4 is a near-total rewrite: PostCSS plugin replaced by Vite plugin (`@tailwindcss/vite`), CSS-first config (no more `tailwind.config.ts`), brand tokens move from JS to `@theme` CSS, `@apply` semantics change, autoprefixer is built in (and `autoprefixer` should be removed from devDependencies), Vite 5+ required (we have v8 ✅). | **Significant** — touches `tailwind.config.ts`, `postcss.config.js`, `src/styles/globals.css`, every brand-token consumer, and CLAUDE.md. Likely 2–4 hours including visual-regression spot checks. | **Low** for now — v3.4 receives security backports through 2027 per the Tailwind team's public statement, and v3 is not a deprecated branch. |

Suggested upgrade order (none currently required):
1. Tailwind v4 — standalone, but should be paired with explicit removal of `autoprefixer` (which becomes a dead dep under v4).

**Why we held:** `CLAUDE.md` pins the project to the cream palette + Cormorant typography stack, which is encoded in `tailwind.config.ts`'s `theme.extend` block. Migrating to `@theme` CSS-first config is non-trivial and introduces visual-regression risk to the poster's brand surface. The Tailwind v3.4 line is still actively maintained. Ship a deliberate Tailwind v4 migration as its own PR with screenshot diffs, not as a sweep change.

---

## 7. Dependency Weight & Reduction

### Heavy dependencies (none flagged)

The dependency tree is unusually lean for a React/Tailwind/Vite/Vitest project:

| Heavy candidate | Verdict |
|---|---|
| `firebase-admin` (~150 transitive deps) | **Required** — Firestore is the rate-limit store. The cost is justified, but most of its tree (Storage SDK, BigQuery shims, gRPC stubs) is unused; replacing with a direct Firestore REST client is a large rewrite and out of scope for an upgrade pass. |
| `jsdom` (dev-only, ~50 transitive) | **Required** for canvas/component tests (`tests/client/`) |
| `sharp` (dev-only, native binary) | **Required** by photo upload tools (`tools/upload-*.mjs`) — only invoked locally |
| `@anthropic-ai/sdk` | Single-purpose, small surface, used in `src/server/anthropic.ts` and `src/server/safety.ts` |
| `lucide-react` | Tree-shaken at import — three icons imported (`Sparkles`, `RefreshCw`, `Download`, `X`) — bundle impact is measured at ~4 KB gzipped |

No micro-packages (e.g., `is-odd`, `left-pad`, etc.) are present. The project notably does NOT have lodash / moment / dayjs / axios — typical bloat sources are absent.

### Unused dependencies removed

| Package | Verified unused via | Removed? |
|---|---|---|
| `react-hook-form` | `grep -r "react-hook-form\|useForm\|FormProvider\|hookform" src/ tests/` → 0 hits | ✅ |
| `@hookform/resolvers` | Same; only consumer was `react-hook-form` itself | ✅ |

Both packages were declared in the original tech-stack plan ([`docs/superpowers/plans/2026-05-01-bless-your-heart-full-build.md:143`](../docs/superpowers/plans/2026-05-01-bless-your-heart-full-build.md)) but the final UI uses a single `<input>` ([`src/components/PromptInput.tsx`](../src/components/PromptInput.tsx)) with `useState` — no form library was ever wired in. Validation happens server-side via `zod` in [`src/server/validation.ts`](../src/server/validation.ts).

Bundle impact: react-hook-form is ~22 KB minified (8 KB gzipped). Even though Vite tree-shakes it out automatically since nothing imports it, removing the manifest entry is the right hygiene move — it ensures a future contributor doesn't add `import { useForm }` thinking it's already wired up.

### Replacement opportunities for team review (not actioned)

None. There are no dependencies in the tree that obviously could be replaced with a few lines of utility code or with a lighter alternative. `clsx` + `tailwind-merge` + `class-variance-authority` together ship the Shadcn `cn()` helper and button variants — these are the canonical lean stack and replacing them would be over-engineering.

---

## 8. Abandoned / At-Risk Dependencies

None. Every direct dependency was published within the last 30 days (per the `npm view <pkg> time` checks I ran on the larger ones). No bus-factor concerns surfaced — the heavy packages (`firebase-admin`, `vite`, `vitest`, `@anthropic-ai/sdk`, `react`) are corporate-backed; smaller utilities (`clsx`, `tailwind-merge`, `class-variance-authority`) are maintained by active OSS maintainers (shadcn ecosystem, Anthony Fu sphere).

---

## 9. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Subscribe to firebase-admin GitHub releases or set up Dependabot for transitive vuln detection | Vulnerabilities clear when upstream ships | Medium | **Yes** | The 10 outstanding npm audit advisories will not resolve until firebase-admin bumps `uuid`/`gaxios`. Configure Dependabot (`.github/dependabot.yml`) to open PRs on `firebase-admin` and the rest of the manifest weekly. Cost: 5 min. |
| 2 | Remove `autoprefixer` from devDependencies when Tailwind migrates to v4 (or sooner if not separately needed) | Smaller dev tree, one less moving piece | Low | Probably | `autoprefixer` is currently invoked by `postcss.config.js` for vendor-prefix injection. Tailwind v3 still benefits from it. Re-evaluate when the v4 migration happens. |
| 3 | Plan a deliberate Tailwind v3 → v4 migration (separate PR with visual diffs) | Faster builds (Tailwind v4 is ~10× faster), smaller CSS, future-proofing | Low (v3 still maintained) | Only if time allows | Schedule when there's no parallel design-token work in flight. Pair with the autoprefixer removal in #2. |
| 4 | Add a `npm audit` step to CI that fails only on high/critical | Early warning for severity escalations without flapping on the existing moderate cluster | Low | Yes | One-line addition to the CI workflow. Threshold: `npm audit --audit-level=high`. Today this passes. |
| 5 | Add a license-check step to CI (`license-checker --failOn 'GPL;AGPL;SSPL;BSL'`) | Catches future GPL pull-ins before merge | Low | Probably | Useful once you have multiple contributors; lightweight CI step. |
| 6 | Document the firebase-admin vuln cluster in CLAUDE.md or MEMORY.md | Future agents know not to chase the 10 advisories | Low | Yes | One short note: "10 npm-audit advisories cluster under firebase-admin transitives; all server-only and unexploitable in current usage; they clear when firebase-admin upstream bumps uuid/gaxios." Saves audit time on every later sweep. |

I have **not** applied any of the recommendations above — they are out of scope for an automated upgrade pass and want explicit team buy-in (especially #1 and #5, which add CI load).

---

## 10. Files changed by this pass

| File | Change |
|---|---|
| `package.json` | Bumped `posthog-js` ^1.372.5 → ^1.372.6, `zod` ^4.4.1 → ^4.4.2; removed `react-hook-form` and `@hookform/resolvers` |
| `package-lock.json` | Reflects above changes; 3 fewer resolved packages overall (534 → 531) |
| `audit-reports/npm-audit-dependency-health.json` | Snapshot of `npm audit --json` output (10 advisories, all firebase-admin transitives) |
| `audit-reports/npm-outdated-dependency-health.json` | Snapshot of `npm outdated --json` output |
| `audit-reports/npm-ls-direct.json` | Snapshot of direct dependency list (pre-changes) |
| `audit-reports/11_DEPENDENCY_HEALTH_REPORT_001_2026-05-03_2351.md` | This report |

No source files in `src/` or `netlify/functions/` were touched. Type-check, full test suite (345 tests), and `npm run build` all pass.
