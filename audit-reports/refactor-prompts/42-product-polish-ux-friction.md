# Product Polish & UX Friction Audit

READ-ONLY analysis. Do not modify any code.

## Ground Rules

- Evaluate as a **user**, not a developer. "The code handles this correctly" is irrelevant if the user can't tell.
- Be specific: not "onboarding could be better" but "after signup, user lands on an empty dashboard with no guidance."
- Classify every issue: **broken** / **confusing** / **incomplete** / **missing**.
- Severity = frequency × pain. Trace every flow.

---

## Phase 1: User Journey Mapping

**Entry points** — Trace each: signup, login, invite link, OAuth, magic link, public pages, shared links, API, CLI, deep links.

**Core journeys per user role:**
- First use: signup → onboarding → first meaningful action → "aha moment"
- Core loop: the daily/weekly workflow
- Configuration: settings, profile, team/org management
- Edge cases: account recovery, plan changes, data export, deletion
- Exit points: dead ends, confusing branches, flows that just stop

**Secondary flows** — Notifications, search, filtering, sorting, bulk actions, imports/exports, integrations, billing, admin.

---

## Phase 2: First-Use & Onboarding

**Signup:** Step count, field necessity, email verification clarity (cross-device?), OAuth permission scope & failure fallback, error specificity (duplicate email, weak password, etc.).

**First experience:** What appears post-signup — empty state, tutorial, or sample data? Clear path to first action? Blocking setup steps? Skippable onboarding? Progress saved if user leaves?

**Empty states:** For every list/dashboard/feed — what shows with zero data? Does it guide the user toward populating it?

---

## Phase 3: Core Workflow

**Primary workflow:** Click/step count for common actions. Unnecessary confirmations? Missing confirmations on destructive actions? Undo support? Save clarity (auto vs. manual, feedback)?

**Forms & inputs:** Required/optional marking, inline vs. submit-only validation, sensible defaults, helpful placeholders, error display (all vs. first), input preservation on failure, progress for long forms, timezone/date format clarity.

**Navigation:** Location awareness (breadcrumbs, active states, titles), back-navigation (browser + in-app), information architecture logic, deep link shareability & permissions.

**Feedback & loading:** Immediate feedback on every action? Click-and-nothing-happens cases? Progress for long operations? Safe to navigate away? Retry without re-entry on failure?

---

## Phase 4: Edge Cases & Errors

**Destructive actions:** Confirmation with consequences explained? Undo available & obvious? Cascade effects communicated? Bulk action extra confirmation with count?

**Common error states:** Network offline, session expired (unsaved work?), permission denied (actionable message?), not found (helpful or generic 404?), rate limited (wait guidance?), file upload failures (size/type/network — all communicated?).

**Concurrency:** Two users editing same resource — conflict handling? Multi-tab state sync? Stale data refresh?

**Boundaries:** Long text (truncation/overflow/layout break?), special characters/emoji/RTL, large datasets (1000+ items — pagination/virtualization/performance?), minimum-input functionality.

---

## Phase 5: Settings & Configuration

**Every setting:** Discoverable? Explained? Immediate or requires save? Resettable to default? Dangerous settings guarded?

**Missing settings users would expect:** Notification preferences, display prefs, timezone, language, default views, keyboard shortcuts, data export.

**Account management:** Change email/password/name? Delete account (clear, complete process)? Team invite/role/removal flows? Data fate on leave/deletion?

---

## Phase 6: Notifications

**Inventory all** emails, in-app, push, webhooks: trigger, content quality, user control (opt-out, frequency, channel).

**Transactional:** Welcome email usefulness, password reset clarity & expiry, invite context, billing transparency.

---

## Phase 7: Accessibility Quick Scan

Flag obvious issues only (defer full audit): keyboard-only core flow completion, color-only information, screen reader labels on interactive elements, mobile responsiveness.

---

## Output

Save as `audit-reports/42_PRODUCT_POLISH_REPORT_[run-number]_[date]_[time in user's local time].md`.

### Report Sections

1. **Executive Summary** — Overall polish level (rough/fair/good/polished), worst friction, journey health.
2. **User Journey Map** — All flows traced, health per flow (smooth / some friction / significant friction / broken).
3. **Critical Friction Points** — Table: Flow | Location (file/component) | Issue | Severity | Type
4. **First-Use & Onboarding** — Signup friction, onboarding gaps, empty states.
5. **Core Workflow** — Step-by-step assessment, friction, feedback, form quality.
6. **Edge Cases & Errors** — Destructive action safety, error quality, boundaries.
7. **Settings & Account** — Gaps, account management, configuration polish.
8. **Notifications** — Inventory, quality, missing notifications, user control.
9. **Accessibility Notes** — Obvious issues only.
10. **Recommendations** — Priority-ordered by effort: quick fixes (hours) / medium (days) / larger (weeks).

**Report rules:** Don't pad — if a flow is smooth, say so in one line. Note items requiring a running app as "verify in running app."

---

## Chat Summary (Required)

Print directly in conversation — don't make the user open the file.

1. **Status Line** — One sentence: what you did.
2. **Key Findings** — Most important friction points, specific and actionable.
3. **Recommendations** (only if warranted):

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| *#* | *≤10 words* | *What improves* | *Low/Med/High/Critical* | *Yes/Probably/Only if time* | *1–3 sentences* |

Order by risk descending. Be honest in "Worth Doing?" — if marginal, say so.

4. **Report Location** — Full file path.
