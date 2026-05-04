# UI Design Quality Audit — Run 35/001

- **Date (local)**: 2026-05-04 20:29
- **Branch**: `nightytidy/run-2026-05-01-1532` (orchestrator-managed)
- **Commit before audit**: `cda0850`
- **Test status after fixes**: 27 files, 392 tests, all passing (1.14s)
- **Typecheck after fixes**: clean (`tsc -b --noEmit` exits 0)
- **Audited surfaces**: single-page app + two dialogs (distress, photo credits)
- **Viewports tested**: 375, 768, 1280, 1440 (CSS pixels)

---

## 1. Executive Summary

**Design quality rating**: **competent**, with a tightly-scoped and internally consistent system. The brand has an unmistakable point of view (cream + serif italics + reverent typography) and the visual system supports it. With the three fixes applied here the quality moves toward **polished** — the remaining items in the report are design judgment calls, not defects.

**Critical issue count by severity (as found, before fixes)**:
- 🔴 **Critical**: 3 — visible scrollbar under preset row, missing focus rings on header/footer text-links, preset buttons defaulting to `type="submit"` inside a form.
- 🟠 **High**: 4 — discussed below.
- 🟡 **Medium**: 6 — design judgment calls.
- ⚪ **Low**: 3 — polish.

All 3 critical issues are now **fixed** in this run (mechanical, unambiguous changes verified with Playwright in the running dev server). High/Medium/Low items are documented for follow-up.

**Does a coherent design system exist?** Yes. Tokens are centralized in `tailwind.config.ts`, exhaustively used (no raw hex outside two single-purpose `text-poster-*` utilities), and the CVA recipe in `button.tsx` is the only component variant system. Drift is near-zero. The design system is small, consistent, and readable. Full inventory: `docs/DESIGN_SYSTEM.md`.

**Top 5 highest-impact improvements** (after applying the 3 mechanical fixes):
1. **Make `Button` default to `type="button"`** instead of patching at every call site. The fix here adds `type="button"` to the preset chip; the systemic fix is to set the default in `Button.tsx` so any future button-in-form doesn't have to think about it.
2. **Decide whether `feedback-quiet` (#D9D4C8) on cream is acceptable for error copy**. CLAUDE.md documents this as intentional, but error states are the one place where readability ≥ aesthetic. Consider routing critical errors through `text-ink-soft` or `text-accent-rust` (which is currently unused in any rendered DOM but available in the palette).
3. **Tap-target size on preset chips**. The `sm` button variant is 36px tall — under the 44×44 iOS recommendation. Bump `sm` to `h-11` (44px), or accept it because the chip is wider than tall and horizontally scrollable. Either is defensible; current choice should be made deliberate.
4. **Audit `accent-rust` (#B47855) and `headline-lg` (40px)** — both are declared in `tailwind.config.ts` but have zero references in `src/`. Either remove them or document them as reserved for a planned use. Stale tokens silently expand the design surface.
5. **Hide the unused shadcn primitives** (`Input`, `Textarea`) or surface them. Both are in `src/components/ui/` but have no usage in the rendered app. Pattern matches the prior `react-hook-form` / `@testing-library/react` "declared-but-unused" cleanup (CLAUDE.md mentions this is an established class of bug here).

---

## 2. Screen-by-Screen Findings

The app has **one route** (`/`) plus two dialog overlays (Photo Credits, Distress Interstitial). All findings below are framed against the `idle` state of the homepage at the four viewports unless noted.

### Homepage `/` — All Viewports

✅ **No issues** with: max-width container (`max-w-2xl` ≈ 672px on h1+form, `max-w-lg` ≈ 512px on input/presets, both well under the 75ch readability ceiling). Page has good vertical rhythm via `space-y-breathe` (28px). Color palette is restrained and on-brand. Typography scale is clean (5 sizes used out of 8 declared). Hover states exist on every interactive element. Focus rings are present and consistent on all *buttons* (the gap was on links — see below).

### Homepage `/` — Desktop 1440px

- 🔴 **CRITICAL** *(FIXED)*: Visible horizontal scrollbar under the preset chip row. `PresetButtons.tsx` applies `scrollbar-none` to a `overflow-x-auto` container, but Tailwind has no built-in `scrollbar-none` utility — the class is silently dropped and the scrollbar renders. **Fix applied**: added `.scrollbar-none` definition to `src/styles/globals.css` (`scrollbar-width: none` + `-webkit-scrollbar { display: none }`).
- 🟡 **MEDIUM**: Three hero example tiles are 213×213px each — at 1440px the page has substantial whitespace on either side of the 672px content column. The layout reads as "centered narrow column on a vast cream backdrop" which is intentional but feels sparse on widescreens. → Consider widening `max-w-2xl` to `max-w-3xl` (768px) on `xl:` only, or leaning into the whitespace as a deliberate aesthetic choice. *Don't* add a sidebar or fill the whitespace with content.
- ⚪ **LOW**: The third preset chip ("Money") and beyond visibly overflow the right edge of the input ("M…"). Now that the scrollbar is hidden, the affordance to scroll horizontally is unmistakable on touch but invisible on desktop (mouse can't drag-scroll without modifier). → Add a subtle gradient fade at the right edge of the preset row, or add explicit horizontal arrow buttons. Or accept it: anyone arriving from a touch device will know to swipe.

### Homepage `/` — Laptop 1280px

- Same as 1440px — same scrollbar fix applies (now done), same whitespace observation.

### Homepage `/` — Tablet 768px

- 🟡 **MEDIUM**: At 768px the layout still uses the *mobile* hero (single 280×280 image, `lg:hidden`) because `lg` breakpoint is 1024px. The 488px of empty horizontal space around the 280px hero feels wasted on a tablet. → Consider raising the 3-up grid to `md:grid` (768px+) instead of `lg:grid`. Each tile would be ~215px which is still readable. Or render a 2-up grid in the `md`–`lg` band.
- 🟡 **MEDIUM**: The h1 ("What's going on?") at 48px (`text-display`) feels appropriate for the viewport but the cm of empty space above the hero example feels a touch generous. *Not* a fix — flagging as a layout-rhythm note.

### Homepage `/` — Mobile 375px

- 🟠 **HIGH**: Footer wraps awkwardly. "988 (US) · findahelpline.com (worldwide)" wraps mid-link — at 375px the screenshot shows "98" alone on one line and "(US) · findahelpline.com (worldwide)" on the next. Line-break inside link text is a polish gap; the wrapping is determined by hyphenation rules and won't always land badly, but at 375 it's visibly broken. → Wrap the entire `988 (US)` cluster in a `<span class="whitespace-nowrap">`, same for `findahelpline.com (worldwide)`. Mechanical, low-risk fix — flagged but not auto-applied because the right balance depends on whether you want the line to wrap before or after `(US)` when it can't fit at all. Eyes on it required.
- 🟡 **MEDIUM**: Preset chip vertical hit area is 36px (the `sm` button size). Below the 44×44 iOS guideline. Horizontal width (96–155px per chip, full chip-width is hit) is fine, but a fast-tap user on iOS can mis-target. → Either bump `sm` to `h-11` (44px) — design impact is real, the chips will feel chunkier — or accept it. Document the decision either way.
- ✅ Input is 18px font-size — meets iOS auto-zoom threshold (≥16px). Input height 59px, well above 44px tap minimum.
- ✅ Generate button is 48px tall, meets tap-target.
- ✅ All content has `px-4` (16px) gutter — no element touches the viewport edge.

### Homepage `/` — Focus States (Keyboard Tab)

- 🔴 **CRITICAL** *(FIXED)*: The header brand link (`<a href="/">Bless Your Heart</a>`) had no focus-visible styles. Tabbing to it produced either the browser default outline (Chrome/Firefox) or **nothing visible** depending on UA — a WCAG 2.4.7 violation. **Fix applied**: added `focus-visible:ring-2 focus-visible:ring-accent-sage/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream rounded-sm` to the link. Verified visible at viewport 1440 in Playwright.
- 🔴 **CRITICAL** *(FIXED)*: Footer phone link `<a href="tel:988">` and external link `<a href="https://findahelpline.com">` had no focus-visible styles. Same fix pattern, ring-offset matched to the footer's `bg-paper`.
- ✅ All buttons (primary, secondary, preset, ghost) and the prompt input have correctly-wired `focus-visible:ring-2 ring-accent-sage/50 ring-offset-2`. Confirmed in `button.tsx`, `input.tsx`, `textarea.tsx`, `dialog.tsx`, and the bespoke `PromptInput`.
- ✅ Tab order is logical: brand link → input → preset 1..8 → Generate → footer 988 → footer findahelpline → see-credits.

### Homepage `/` — Form Submit Behavior

- 🔴 **CRITICAL** *(FIXED)*: All preset chip buttons reported `type="submit"` in the rendered DOM. The `Button` component (`src/components/ui/button.tsx`) renders a vanilla `<button>` and spreads props after className. No call site of preset chips passed `type="button"`, so HTML's default rule kicks in: a `<button>` inside a `<form>` defaults to `type="submit"`. Clicking a preset would fire the form's `onSubmit` alongside `onClick` — same vector that audit run 29/001 closed for the Generate button itself. The closure-captured `prompt` in `handleGenerate` would still be the pre-click value, so depending on user state a click could either silently no-op (canGenerate=false) or generate with stale text. **Fix applied**: added explicit `type="button"` to the `<Button>` element inside `PresetButtons.tsx` map, with an inline comment pointing to the rule. **Systemic follow-up recommended**: change the Button component default to `type="button"` and have call-sites opt into `type="submit"` for the actual submit button — this is the safer default for a form-friendly button library.

### Photo Credits Dialog (footer "see credits" → opens)

- 🟡 **MEDIUM**: Title sits hard against the credits list with no divider or extra spacing — `space-y-1` (4px) inside the `<ul>` gives a tight rhythm that feels OK *between* items, but the gap *between the title and the first item* is also dictated by the dialog's outer `gap-4`. There's no visual separation. → Add a 1px `border-b border-border-mist` under `DialogTitle` plus a small `pt-2` on the `<ul>`, or increase the dialog outer gap to `gap-6`. Hairline rule is the more conservative choice.
- 🟡 **MEDIUM**: Every credit currently reads "Placeholder / Unsplash" because the photo library data hasn't been finalized. Not a design issue per se, but a stakeholder reading the modal sees a wall of identical text. → Out of design audit scope — flag for content team.
- ⚪ **LOW**: The X close button `text-ink-soft opacity-70` on `bg-paper` is functional but visually quiet. Hover bumps to opacity-100. → Consider increasing default opacity to 100 and using color (`text-ink-faint` → `hover:text-ink-deep`) for the affordance, or leave as-is for the brand's intentional restraint. Judgment call.
- ✅ `DialogTitle` is wired correctly (Radix a11y requirement met). `DialogContent` has `bg-paper`, `border-border-mist`, max-w-lg, p-6, max-h-[60vh] overflow-y-auto. Animations: in/out with fade + zoom + slide, ~200ms — feels well-paced.

### Distress Interstitial Dialog (triggered when prompt classified as distress)

- ✅ Excellent a11y (audit run 34/001 wired this up): `DialogTitle` + `DialogDescription` both present, `aria-modal="true"` set, focus trap via Radix. Voice intentionally sincere, distinct from the rest of the product.
- 🟡 **MEDIUM**: Hotline phone link `text-ink-deep` on `bg-paper` reads with strong contrast (✓ WCAG-AA), but the inline `findahelpline.com` link uses `text-accent-sage underline` which is the same low-contrast token flagged in `feedback-quiet` family. In the *one* dialog where the user might genuinely be in crisis, this readability cost is harder to justify. → Consider either bumping the link weight to `font-medium` (still on-brand, slightly more visible) or routing this specific link through `text-ink-deep underline` for max readability. Brand purity vs. accessibility is the tradeoff — design call.
- ⚪ **LOW**: The "Take me back" close button uses `variant="secondary"` which is correct for the supportive-not-urgent voice, but the variant has subtle visual weight (border-mist, paper bg). On the cream-page scenario where this dialog overlays a sparse layout it's fine; if the dialog ever overlays a populated scene the button might lose prominence. Defensive not actionable.

---

## 3. Cross-Cutting Patterns

The system is small enough that *most* findings are screen-specific. Two patterns repeat:

### Pattern A: Missing focus-visible on text-style links

- **What**: `<a>` elements styled as inline text links (header brand, footer 988, footer findahelpline) lacked focus-visible styles.
- **Where**: `Header.tsx` (1 link), `Footer.tsx` (2 links). The credits trigger button in `CreditsDialog.tsx` *did* have it correctly wired (added in audit run 34/001).
- **Fix**: Apply the same pattern from CreditsDialog: `rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-sage/50 focus-visible:ring-offset-2 focus-visible:ring-offset-{cream|paper}` (offset color matches parent surface).
- **Effort**: Hours (6 lines of className edits + verification). **Done in this run.**
- **Systemic prevention**: Add a lint rule or convention note: "every `<a>` in the rendered app must carry focus-visible styles; the `Button` CVA covers `<button>` automatically." Could be enforced via a custom ESLint rule if ESLint is ever added to this project (it isn't today).

### Pattern B: Scrollbar utility was Tailwind-defaulted

- **What**: Author wrote `className="... scrollbar-none ..."` expecting the scrollbar to hide. No such Tailwind utility exists; the class was silently ignored.
- **Where**: `PresetButtons.tsx` (1 site).
- **Fix**: Define the utility in `globals.css` with cross-browser support. **Done in this run.**
- **Systemic prevention**: When adding visual utilities not in Tailwind (`scrollbar-none`, custom animations, shadows), add them to `globals.css` `@layer utilities` with a short comment referencing where they're used. Audit run 25/001 already established this pattern for `text-poster-light`/`text-poster-dark` — the precedent was there, just not followed.

---

## 4. Fixes Applied

Three mechanical fixes verified in browser via Playwright:

1. **`src/styles/globals.css`** — Added `.scrollbar-none` cross-browser utility. Preset row no longer shows a horizontal scrollbar.
2. **`src/components/Header.tsx`** — Added focus-visible ring to the brand link. Verified by Tab in Playwright.
3. **`src/components/Footer.tsx`** — Added focus-visible rings to both `tel:988` and `findahelpline.com` links. Pattern matches CreditsDialog.
4. **`src/components/PresetButtons.tsx`** — Added `type="button"` to the chip buttons to prevent accidental form submission when a user clicks a preset.

All edits are documented inline with a comment referencing audit run 35/001 so future readers understand the fix's origin (matching the pattern established by prior audit runs). 392 tests still pass; typecheck clean.

---

## 5. Priority Remediation Plan

Items below are documented but **not** auto-applied — each requires either visual judgment or scoping decisions beyond the audit's safe-fix mandate.

| # | Recommendation | Screens Affected | Effort | Impact | Worth Doing? | How To Fix |
|---|---|---|---|---|---|---|
| 1 | Default `Button` to `type="button"` | All forms (1 today, future) | Hours | High | Yes | In `src/components/ui/button.tsx`, add `type` prop default to `"button"` in the spread. Then change `GenerateButton.tsx` to keep its explicit `type="submit"`, and remove the now-redundant `type="button"` from `PresetButtons.tsx`. |
| 2 | Decide on `feedback-quiet` for error text | Inline error, Download error caption, character counter | Hours | High | Probably | Either re-route critical errors (rate-limit, blocked) through `text-ink-soft` for AA contrast, or accept the brand's quiet treatment as-is and document the WCAG gap formally. |
| 3 | Bump `Button size="sm"` from h-9 (36px) to h-11 (44px) for tap targets | Preset chips on mobile | Hours | Medium | Probably | Edit `button.tsx` CVA: change `sm: 'h-9 px-4 rounded-pill'` → `sm: 'h-11 px-4 rounded-pill'`. Visual impact: chips become chunkier; verify the rhythm still works at desktop. |
| 4 | Footer link wrapping at narrow viewports | Footer, mobile 375px | Hours | Medium | Yes | Wrap `988 (US)` and `findahelpline.com (worldwide)` in `<span class="whitespace-nowrap">` so wrapping happens at clean breaks, not mid-link. |
| 5 | Hero examples: 2-up at md, 3-up at lg | Tablet 768–1024 band | Hours | Medium | Yes | In `HeroExamples.tsx`: change `hidden lg:grid grid-cols-3` to `hidden md:grid md:grid-cols-2 lg:grid-cols-3`. Mobile fallback still applies on `<md`. |
| 6 | Add gradient mask to right edge of preset row | Desktop 1280+ | Hours | Low | Probably | Wrap the preset container in a relative div, add an `::after` pseudo-element with `bg-gradient-to-l from-cream to-transparent w-12 absolute right-0 top-0 bottom-0 pointer-events-none` to hint that the row scrolls. |
| 7 | Remove unused tokens: `accent-rust`, `headline-lg`, `duration-anticipation` | Tailwind config | Hours | Low | Yes | Delete from `tailwind.config.ts`. Verify no references in src (none today). Pattern matches previous "declared-but-unused" cleanups. |
| 8 | Remove or use shadcn `Input` & `Textarea` primitives | `src/components/ui/` | Hours | Low | Yes | They have no rendered consumers. Either delete (orchestrator-managed branch — flag instead of acting) or document as available primitives. |
| 9 | Increase Photo Credits dialog title-to-list separation | Credits dialog | Hours | Low | Probably | Add `border-b border-border-mist pb-2` to `DialogTitle` inside CreditsDialog, or change the outer dialog gap to `gap-6`. |
| 10 | Improve dialog X-close affordance | All dialogs | Hours | Low | Only if time | Bump default opacity 70 → 100, change rest color from `text-ink-soft` to `text-ink-faint`, hover to `text-ink-deep`. Keeps the restraint, increases discoverability. |
| 11 | Distress dialog `findahelpline.com` link contrast | Distress dialog | Hours | Medium | Probably | This is the one place where readability beats brand. Add `font-medium` to the link, or route through `text-ink-deep` for max contrast. |
| 12 | Document the 1440px+ whitespace as deliberate or fill it | Desktop 1440+ | Days | Low | Only if time | Either add a deliberate wide-screen layer (a side annotation, a faint repeating texture) or formally state in `CLAUDE.md` that the cream sea is the brand. |
| 13 | Replace `setupCanvas`/`composite` poster preview-time skeleton (currently no skeleton, just blank canvas while loading) | Loading state | Days | Medium | Probably | Add a low-opacity rectangle at canvas dimensions while the image decodes — gives the user a sense of the impending poster shape. The 800ms `LOAD_FLOOR_MS` makes this less urgent than it would be otherwise. |

Order is impact-descending. #1 (Button default) is the systemic win that prevents the regression we just fixed from reappearing on the next form-button added to the codebase.

---

## 6. Design System Recommendations

The system is in good shape. Specific actions:

**Tokens to remove** (declared but never referenced in the rendered DOM):
- `colors.accent-rust` (#B47855)
- `fontSize.headline-lg` (40px)
- `transitionDuration.anticipation` (800ms — superseded by `LOAD_FLOOR_MS` JS const)

**Tokens to standardize** — none. The system has no drift.

**Components to remove or formalize**:
- `src/components/ui/input.tsx` — no consumers
- `src/components/ui/textarea.tsx` — no consumers

If they're meant to be available primitives, document them in `docs/DESIGN_SYSTEM.md` (already noted there) and add a story / example. If not, follow the precedent in CLAUDE.md (audit step 11) for unused declared dependencies and remove them. The orchestrator constraint ("never delete files") means the agent flags them; the human deletes.

**Establishing a proper system vs continuing ad hoc**: It's already a proper system. This audit found no fragmentation. The only gaps are (a) silently-failing CSS classes (now fixed) and (b) declared-but-unused tokens (above). Effort to maintain: hours per audit cycle, not days.

---

## 7. Report & Design System Docs Location

- **This report**: `audit-reports/35_UI_DESIGN_QUALITY_REPORT_001_2026-05-04_2029.md`
- **Design system inventory**: `docs/DESIGN_SYSTEM.md`
- **Screenshots**: `audit-screens/01-desktop-1440-idle.png` through `audit-screens/10-after-fixes-header-focus.png`
- **Files modified by safe-fix phase**:
  - `src/styles/globals.css`
  - `src/components/Header.tsx`
  - `src/components/Footer.tsx`
  - `src/components/PresetButtons.tsx`
