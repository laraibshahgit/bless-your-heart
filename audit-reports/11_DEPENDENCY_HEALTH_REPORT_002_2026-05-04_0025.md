# Dependency Health & Upgrade Pass — Run 002

**Date:** 2026-05-04 00:25 (local)
**Branch:** `nightytidy/run-2026-05-01-1532` (per orchestrator constraints — no branch creation)
**Auditor:** Claude (Opus 4.7)
**Prior run:** [`11_DEPENDENCY_HEALTH_REPORT_001_2026-05-03_2351.md`](./11_DEPENDENCY_HEALTH_REPORT_001_2026-05-03_2351.md)
**Baseline test status:** 345 / 345 passed
**Final test status:** 345 / 345 passed
**Build:** ✅ `npm run build` succeeds (lint:photos + tsc + vite)

---

## 1. Executive Summary

| Metric | Run 001 end | Run 002 start | Run 002 end |
|---|---:|---:|---:|
| Direct dependencies | 30 | 30 | **28** (13 prod + 15 dev) |
| Total resolved packages | 531 | 531 | **511** |
| Known vulnerabilities | 10 (8 mod, 2 low) | 10 | 10 *(unchanged — same firebase-admin transitive cluster)* |
| Direct deps not at npm-tag latest | 1 (`tailwindcss`) | 1 | 1 *(`tailwindcss` 3 → 4 — held intentionally)* |
| Potentially abandoned dependencies | 0 *(but see §8)* | — | 1 flagged *(`file-saver`, last published 2020-11)* |
| Upgrades applied this pass | 2 (Run 001) | — | 0 *(everything is already at latest)* |
| Dependencies removed this pass | 2 (Run 001) | — | **2 (`@testing-library/react`, `@testing-library/jest-dom` — never imported)** |

**Headline:** Run 001 left the tree in excellent health — every direct dep at-or-near the latest npm tag, license inventory permissive-only, and the remaining vulnerability cluster is a documented `firebase-admin` upstream issue. Run 002's only new win is removing **`@testing-library/react`** and **`@testing-library/jest-dom`**, which were declared in `devDependencies` but never imported anywhere in `src/` or `tests/` — Run 001 missed them. Trimming the two packages dropped 20 resolved packages from the tree (531 → 511) and removed 248 lines from `package-lock.json`. Tests: 345/345 still passing. Build: clean.

This is the second consecutive sweep that has found a "declared but never imported" dev dependency. After Run 001 removed `react-hook-form` + `@hookform/resolvers`, this run found two more from the same plan-doc origin ([`docs/superpowers/plans/2026-05-01-bless-your-heart-full-build.md:149`](../docs/superpowers/plans/2026-05-01-bless-your-heart-full-build.md)) that were also `npm install`'d but never wired in. **A `depcheck`/`knip` step in CI would catch this class going forward** — see §9.

---

## 2. Vulnerability Report

### npm audit summary (after changes)

```
info: 0 · low: 2 · moderate: 8 · high: 0 · critical: 0  → total 10
```

Identical to Run 001 (snapshot in [`audit-reports/npm-audit-run002.json`](./npm-audit-run002.json)). All 10 advisories are still nested under `firebase-admin@13.8.0`. Confirmed via `npm view firebase-admin version time.modified` that no new release has shipped since Run 001 — last upstream publish is `2026-04-09T20:46:11Z`. The cluster will only clear when firebase-admin upstream bumps `uuid` ≥ 14, `gaxios` ≥ 7, `@google-cloud/firestore`, `google-gax`, `retry-request`, `teeny-request`, `http-proxy-agent`, and `@tootallnate/once`.

| Package (transitive) | CVE / Advisory | Severity | Used in project? | Fix available now? |
|---|---|---|---|---|
| `uuid` (<14.0.0) | GHSA-w5hq-g745-h8pq — Missing buffer bounds check in v3/v5/v6 when `buf` is provided | moderate | **No exploitable path** — code never invokes `uuid.v3/v5/v6` with a caller-supplied buffer | No |
| `gaxios` (6.4.0–6.7.1) | via `uuid` | moderate | Server-only (Firestore client) | No (waiting on firebase-admin bump) |
| `@google-cloud/firestore` | via `google-gax` | moderate | Yes (rate-limit txn store) | No |
| `@google-cloud/storage` | via `retry-request`, `teeny-request`, `uuid` | moderate | No — server uses Storage *URLs* only, never the SDK | No |
| `google-gax` | via `retry-request`, `uuid` | moderate | Indirect | No |
| `firebase-admin` (>=10.2.0) | via the four above | moderate | Yes | No (we are already on latest 13.8.0) |
| `retry-request` (7.0.0–7.0.2) | via `teeny-request` | moderate | Indirect | No |
| `teeny-request` (3.9.1–10.1.0) | via `http-proxy-agent`, `uuid` | moderate | No (Storage SDK only) | No |
| `http-proxy-agent` (4.0.1–5.0.0) | via `@tootallnate/once` | low | No (proxy path unused) | No |
| `@tootallnate/once` (<3.0.1) | GHSA-vpq2-c234-7xj6 — Incorrect Control Flow Scoping | low | No | No |

**Risk re-assessment unchanged from Run 001:** the entire cluster is server-side, and our handler only calls `firebase-admin/firestore` `Timestamp` plus one `runTransaction`. No Storage SDK, no proxy paths, no `uuid.v3/v5/v6` with caller buffers. Realised exploitability remains zero. The CLAUDE.md baseline note added by Run 001 still applies.

Vulnerabilities that could not be fixed: all 10. Reason: identical to Run 001 — upstream `firebase-admin@13.8.0` is the latest release and pins these older transitive versions.

---

## 3. License Compliance

License inventory was a full sweep in Run 001. Run 002 verified that the **two packages removed this pass** (`@testing-library/react@16.3.2` MIT; `@testing-library/jest-dom@6.9.1` MIT) and **all transitives they pulled** were MIT-licensed — no risk class changed. Notable transitives that left the tree with the testing-library removal: `aria-query`, `dom-accessibility-api`, `@adobe/css-tools`, `chalk` (5.x), `lz-string`, `redent`, `min-indent`, `strip-indent`, `pretty-format` (a copy specifically for testing-library; vitest carries its own), `react-is`, `mute-stream`, plus a handful of lodash micro-packages (`lodash.merge`, `lodash.includes`, etc.) — all MIT.

The full Run 001 inventory of 442 unique packages collapses to ~430 unique packages now, all in the same MIT / Apache-2.0 / ISC / BSD permissive bucket. **No GPL-only, AGPL, SSPL, BSL, or unlicensed packages are present.** The project's declared license (`ISC`) remains compatible with every pulled-in license.

No license risks found in this pass.

---

## 4. Staleness Report

| Package | Current | Latest (npm tag) | Versions behind | Last published | Health |
|---|---|---|---|---|---|
| `tailwindcss` | 3.4.19 | 4.2.4 | 1 major | 2026-04-29 | Active. **Held intentionally** — see §6, identical reasoning to Run 001. |
| All other 27 direct deps | latest | latest | 0 | various | Healthy |

`npm outdated` snapshot stored in [`audit-reports/npm-outdated-run002.json`](./npm-outdated-run002.json). Verified each direct dep against `npm view <pkg> version` individually — every one matches the manifest (Run 001's posthog-js → 1.372.6 and zod → 4.4.2 patches still pin to current latest; no new patches have shipped in the 26-hour gap between runs).

**Lockfile health:** `package-lock.json` is committed and consistent with the manifest. After the testing-library removal, `npm install` produced no `npm WARN`s about drift. There are now 21 packages with multiple resolved versions in the tree (one fewer than Run 001's 22, since the testing-library subtree dropped a `dom-accessibility-api` duplicate). All remaining duplicates (`uuid` at 8.3.2/9.0.1/11.1.1, `gaxios` at 6.7.1/7.1.4, `whatwg-url` at 5.0.0/16.0.1, etc.) are upstream-driven and not actionable without a firebase-admin/jsdom major bump.

**`npm dedupe --dry-run`** suggests collapsing 5 packages within posthog-js's `@opentelemetry` subtree (would change `@opentelemetry/resources` 2.7.1 → 2.2.0). This is *upstream churn within posthog-js*: posthog directly requires `@opentelemetry/resources@^2.7.1` while its transitive `@opentelemetry/otlp-transformer@0.208.0` requires `@opentelemetry/resources@~2.2.0`. Running `npm dedupe` would *downgrade* the one posthog-js directly imports. **Not applied** — unsafe without an explicit posthog-js compatibility check, and the 5-package gain is marginal.

The single `extraneous` warning (`@emnapi/runtime@1.10.0` — Sharp's Windows native-module emulation, hoisted by npm) is unchanged from Run 001 and not actionable.

---

## 5. Upgrades Applied (this pass)

| Package | From | To | Type | Tests pass? |
|---|---|---|---|---|
| *(none)* | — | — | — | — |

No patch or minor upgrades were available in the gap between Run 001 and Run 002 (every direct dep is already at the latest published version). Run 002 made one *removal* (§7), zero version bumps.

---

## 6. Major Upgrades Needed (Not Applied)

Identical conclusion to Run 001 — the only major-behind dep is `tailwindcss`.

| Package | Current | Target | Breaking changes | Effort | Priority |
|---|---|---|---|---|---|
| `tailwindcss` | 3.4.19 | 4.2.4 | Tailwind v4 is a near-total rewrite: PostCSS plugin replaced by Vite plugin (`@tailwindcss/vite`), CSS-first config (no more `tailwind.config.ts`), brand tokens move to `@theme` CSS, `@apply` semantics change, autoprefixer is built in (and `autoprefixer` should then be removed). Vite 5+ required (we have v8 ✅). | **Significant** — touches `tailwind.config.ts`, `postcss.config.js`, `src/styles/globals.css`, every brand-token consumer, and CLAUDE.md. 2–4 hours including visual-regression spot checks. | **Low** for now — v3.4 receives security backports through 2027 per the Tailwind team's public statement. |

**Why we're holding:** unchanged from Run 001. `tailwind.config.ts` encodes the cream palette + Cormorant typography brand stack. Migrating to `@theme` CSS-first config is non-trivial and introduces visual-regression risk to the poster's brand surface. Ship as a deliberate dedicated PR with screenshot diffs, not as a sweep change. Pair with the autoprefixer removal at that time.

---

## 7. Dependency Weight & Reduction

### Heavy dependencies (none flagged that weren't already noted)

Same picture as Run 001 — `firebase-admin` (~150 transitive deps, server-only, unavoidable for the rate-limit Firestore txn), `jsdom` (dev-only canvas tests), `sharp` (dev-only photo upload tooling), `@anthropic-ai/sdk` (single-purpose, small surface). The dependency tree is unusually lean for a React/Tailwind/Vite/Vitest project. No micro-packages of the `is-odd`/`left-pad` class are present.

### Unused dependencies removed (this pass)

| Package | Verified unused via | Removed? |
|---|---|---|
| `@testing-library/react` | `grep -rn "@testing-library\|testing-library/jest-dom\|render(\|screen\." src/ tests/ vite.config.ts → 0 hits` | ✅ |
| `@testing-library/jest-dom` | Same — no `setupFiles` entry in `vite.config.ts:20-24`, no jest-dom imports anywhere | ✅ |

**Why they were never wired in:**

- `tests/` files use Vitest's auto-imported `describe`/`it`/`expect` (`globals: true` in `vite.config.ts:22`).
- jsdom is invoked via `// @vitest-environment jsdom` comments at the top of client tests, *not* via `@testing-library/jest-dom`.
- No React-component-render tests exist in the suite. The closest tests work directly against the canvas mock or against pure utility functions.

Both packages were declared in the original tech-stack plan ([`docs/superpowers/plans/2026-05-01-bless-your-heart-full-build.md:149`](../docs/superpowers/plans/2026-05-01-bless-your-heart-full-build.md)) as part of a `npm install -D` line that included testing-library by default — but the final test architecture (canvas-mock-based, not component-render-based) made them unnecessary. Audit report 02 noted this in May 2026 ("`@testing-library/react` and `@testing-library/jest-dom` already in devDependencies (unused so far)") but Run 001 missed it.

**Bundle / tree impact:** these are dev-only, so production bundle is unaffected. The `node_modules` tree shrank by 20 resolved packages (`531 → 511`) and `package-lock.json` shrank by 248 lines. Faster `npm ci` cold installs by a small amount.

### Replacement opportunities for team review (not actioned)

| Package | Why a candidate | Effort to replace |
|---|---|---|
| `file-saver` (^2.0.5) | **Last published 2020-11-19** — 5+ years stale (per `npm view file-saver time`). Used in exactly one file ([`src/lib/download.ts:25`](../src/lib/download.ts)) for one call: `saveAs(blob, filename)`. The library mostly handles legacy IE9-11 + iOS Safari fallback. We don't support IE; we DO need the iOS Safari fallback (the "Long-press the image after the new tab opens" hint in [`DownloadButton.tsx:51`](../src/components/DownloadButton.tsx) implies file-saver's FileReader/window.open fallback is what's making downloads work on iOS Safari). | **Moderate** — ~30 lines for a native replacement (`URL.createObjectURL` + `<a download>` for desktop; `FileReader` + `window.open` for iOS Safari). Requires a manual iOS Safari smoke test on a real device, which CLAUDE.md flags as a pre-launch step ([`CLAUDE.md:34`](../CLAUDE.md)). Skipped here because "DO NOT replace or rewrite dependencies overnight — only remove unused ones" and iOS Safari is the riskiest browser to break. |
| `autoprefixer` (^10.5.0) | Tailwind v4 will include this functionality natively, making it dead weight at that point. Already noted in Run 001 §9 #2. | Trivial — single PostCSS plugin removal once Tailwind v4 lands. |

Both kept for now. **No replacements actioned in this pass.**

---

## 8. Abandoned / At-Risk Dependencies

One new flag this pass that Run 001 did not surface explicitly:

| Package | Last release | Maintainer activity | Risk | Recommendation |
|---|---|---|---|---|
| `file-saver` | 2.0.5 — 2020-11-19 (5.5 years ago) | Effectively dormant. GitHub repo (eligrey/FileSaver.js) shows no commits in years; open issue and PR queues are large with no triage. Maintainer (eligrey) is the same single individual since 2014. | **Low-Medium** — Functionally simple library, currently working in all supported browsers. Bus-factor concern (single maintainer, no successor). Not a security risk in itself: the surface area is tiny (one function, no network, no parsing, no eval). Risk is more about "if a future browser quirk breaks downloads, no patch is coming." | Plan a native-API replacement for the next download-flow change (see §7). Not urgent — current behavior works. |

All other direct dependencies were re-checked and confirm Run 001's "no abandoned packages" finding. Top corporate-backed/active maintainers haul (`firebase-admin`, `vite`, `vitest`, `@anthropic-ai/sdk`, `react`, all `@radix-ui/*`); active OSS maintainers for `clsx` / `tailwind-merge` / `class-variance-authority` (shadcn ecosystem, Anthony Fu sphere); recent Lucide migration to v1.x signals continued maintenance.

---

## 9. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | **Add `depcheck` (or `knip`) to CI to catch declared-but-never-imported dependencies** | Two consecutive sweeps now have found unused devDependencies missed during initial setup; the pattern is recurring. A 1-min CI check would catch this class. | Low (waste, not breakage) | **Yes** | Recommended addition: `npx knip --include dependencies` as a CI step (or `npx depcheck`). Knip integrates with TS/Vite cleanly. Both `react-hook-form`+`@hookform/resolvers` (Run 001) and `@testing-library/*` (Run 002) would have been flagged immediately. |
| 2 | Subscribe to firebase-admin GitHub releases or set up Dependabot for transitive vuln detection | Vulnerabilities clear when upstream ships | Medium | **Yes** | Carried forward from Run 001 #1 — still not done. Configure Dependabot (`.github/dependabot.yml`) to open PRs on `firebase-admin` and the rest of the manifest weekly. The repo currently has no `.github/` directory at all, so `dependabot.yml` would need creating from scratch. Cost: 5 min. |
| 3 | Replace `file-saver` with a native `URL.createObjectURL` + iOS Safari fallback when next touching the download flow | Removes a 5-year-stale dependency; eliminates one bus-factor risk; saves ~5 KB minified from the bundle | Low — file-saver still works and the fallback case is iOS-only | Probably | New finding in Run 002 §7. ~30 lines of native code replaces the library. Don't do this as part of an audit sweep — pair it with the next genuine download-flow change so the iOS Safari smoke test is already on the critical path. |
| 4 | Add a `npm audit` step to CI that fails only on `high`/`critical` | Early warning for severity escalations without flapping on the existing moderate cluster | Low | Yes | Carried forward from Run 001 #4. One-line addition: `npm audit --audit-level=high`. Today this passes. Would fail loudly if a `high` lands in a transitive without anyone noticing. |
| 5 | Plan a deliberate Tailwind v3 → v4 migration (separate PR with visual diffs) | Faster builds (Tailwind v4 ~10× faster), smaller CSS, future-proofing. Pair with `autoprefixer` removal. | Low (v3 still maintained through 2027) | Only if time allows | Carried forward from Run 001 #3. Schedule when there's no parallel design-token work in flight. |
| 6 | Add a license-check step to CI (`license-checker --failOn 'GPL;AGPL;SSPL;BSL'`) | Catches future GPL pull-ins before merge | Low | Probably | Carried forward from Run 001 #5. Useful once you have multiple contributors. |
| 7 | Document the firebase-admin vuln cluster in CLAUDE.md or MEMORY.md | Future agents know not to chase the 10 advisories | Low | **Done** | ✅ Already added to CLAUDE.md by Run 001 (the `firebase-admin transitive-vuln baseline (do not chase)` block). Removed from open recommendations. |

I have **not** applied any of recommendations 1–6 in this pass — same reasoning as Run 001: out of scope for an automated upgrade sweep, want explicit team buy-in for CI policy changes.

---

## 10. Files changed by this pass

| File | Change |
|---|---|
| `package.json` | Removed `@testing-library/react` and `@testing-library/jest-dom` from `devDependencies` |
| `package-lock.json` | Reflects the removal — 20 fewer resolved packages, 248 fewer lines |
| `audit-reports/npm-audit-run002.json` | Snapshot of `npm audit --json` output post-removal (10 advisories, all firebase-admin transitives — same shape as Run 001) |
| `audit-reports/npm-outdated-run002.json` | Snapshot of `npm outdated --json` (only `tailwindcss` 3 → 4 still listed) |
| `audit-reports/npm-ls-full-run002.json` | Full deep dependency tree snapshot used to compute duplicate-version count |
| `audit-reports/11_DEPENDENCY_HEALTH_REPORT_002_2026-05-04_0025.md` | This report |

No source files in `src/` or `netlify/functions/` were touched. Type-check, full test suite (345 tests), and `npm run build` all pass after the removal.

---

## 11. Comparison to Run 001

| Aspect | Run 001 | Run 002 |
|---|---|---|
| Time spent | Several hours (overnight sweep) | ~25 min (verification + one new finding) |
| Patch upgrades applied | 2 (`posthog-js`, `zod`) | 0 (none available) |
| Dependencies removed | 2 (`react-hook-form`, `@hookform/resolvers`) | **2 (`@testing-library/react`, `@testing-library/jest-dom`)** |
| Vulnerabilities cleared | 0 (transitive cluster is upstream-blocked) | 0 (same cluster, no upstream movement) |
| Documentation produced | Full audit report + CLAUDE.md baseline notes | This delta report; no CLAUDE.md changes needed (the in-flight CLAUDE.md edits from Run 001 are committed in the same sweep as this run) |
| Headline finding | The tree was already healthy; pruned 2 unused packages | The tree is *still* healthy; pruned 2 more unused packages — pattern suggests a `depcheck`/`knip` CI step is worth the 5 min |

The audit budget is now genuinely close to flat. A future Run 003 should: re-check `npm audit` (only meaningful if `firebase-admin` has shipped), confirm no new direct-dep majors have been adopted into the manifest, and re-run `knip`/`depcheck` if recommendation #1 has been applied. There is no further dependency-pruning reservoir to draw from in this codebase as it stands today.
