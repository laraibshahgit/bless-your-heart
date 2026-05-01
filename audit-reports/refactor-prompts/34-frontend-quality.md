# Frontend Quality Pass

## Prompt

```
You are running an overnight frontend quality audit and improvement pass. You have several hours. Your job is to improve accessibility, UX consistency, bundle efficiency, and internationalization readiness across the frontend codebase.

Work on a branch called `frontend-quality-[date]`.

## Your Mission

### Phase 1: Accessibility Audit & Fixes

Accessibility isn't optional — it's both a legal requirement and good engineering. Scan every component and page.

**Step 1: Automated checks**
Scan all component/template files for:

- **Images**: Missing `alt` attributes, empty `alt` on non-decorative images, decorative images missing `alt=""`
- **Forms**: Inputs without associated `<label>` elements (or `aria-label`/`aria-labelledby`), missing form validation announcements, submit buttons that don't indicate their purpose
- **Interactive elements**: Click handlers on non-interactive elements (`div`, `span`) without `role`, `tabIndex`, and keyboard event handlers. Buttons that are actually `<div>`s or `<a>`s without proper roles.
- **Heading hierarchy**: Skipped heading levels (h1 → h3), multiple h1s per page, headings used for styling rather than structure
- **Color and contrast**: Hardcoded colors that might fail WCAG AA contrast ratios (especially light gray text on white backgrounds, placeholder text)
- **Focus management**: Missing focus styles (`:focus` or `:focus-visible`), focus traps in modals that don't exist, modals that don't return focus on close
- **Dynamic content**: ARIA live regions missing for content that updates dynamically (notifications, loading states, error messages), screen reader announcements for route changes in SPAs
- **Keyboard navigation**: Interactive elements not reachable via Tab, custom components that don't respond to Enter/Space, dropdown menus that don't support arrow keys, escape key not closing modals/popups
- **Semantic HTML**: `<div>` and `<span>` used where semantic elements should be (`<nav>`, `<main>`, `<aside>`, `<article>`, `<section>`, `<header>`, `<footer>`, `<button>`, `<time>`)
- **ARIA usage**: `aria-*` attributes used incorrectly (wrong values, missing required companion attributes, ARIA roles on elements that already have that role natively)

**Step 2: Fix what's safe**
For each issue found:
- Low-risk fixes (adding alt text, adding labels, adding semantic elements, adding ARIA attributes): implement immediately, run tests, commit
- Medium-risk fixes (refactoring div-buttons to real buttons, adding keyboard handlers): implement carefully, test thoroughly
- High-risk fixes (focus management overhauls, major structural changes): document in report only
- Commit: `a11y: [description] in [component]`

### Phase 2: UX Consistency Audit

**Step 1: Component inventory**
Catalog every UI pattern used in the app:
- Buttons: How many visual styles exist? Are they consistent? Do similar actions use similar button styles?
- Form inputs: Consistent styling, error states, placeholder text approach, validation feedback
- Loading states: Spinners, skeletons, progress bars — are they consistent? Do all async operations show loading?
- Empty states: What happens when a list has no items? Is it always handled? Is the messaging consistent?
- Error states: How are errors displayed? Consistent format? Red text, toasts, inline, modal?
- Spacing: Consistent use of spacing scale or are padding/margin values random?
- Typography: How many font sizes are actually used? Do they follow a consistent scale?
- Colors: Are colors from a design system / theme, or hardcoded hex values scattered everywhere?
- Icons: Consistent icon library? Mixed icon sources? Missing icons where they'd help?
- Responsive behavior: Do components work at mobile sizes? Tablet? Are breakpoints consistent?

**Step 2: Document inconsistencies**
Create a detailed inventory of every inconsistency pattern found:
- Categorize by severity (confusing to users vs. just messy)
- Group related issues (all button inconsistencies together, all spacing issues together)
- Screenshot descriptions or specific file/line references for each

**Step 3: Fix what's safe**
- If there's a clear design system or component library: fix deviations back to the standard
- Consolidate obviously duplicate component variants (3 different button components that do the same thing)
- Standardize spacing to the nearest consistent value
- Ensure all lists have empty states
- Ensure all async operations have loading states
- Run tests after each batch of changes
- Commit: `ui: standardize [pattern] across [scope]`

### Phase 3: Bundle Size Analysis & Optimization

**Step 1: Analyze the bundle**
- If build tooling supports it, generate a bundle analysis (webpack-bundle-analyzer, source-map-explorer, or equivalent)
- Identify:
- The largest dependencies by size
- Dependencies that are imported but only partially used (e.g., importing all of lodash for one function)
- Dependencies with lighter alternatives (moment.js → date-fns, lodash → native methods)
- Code that's bundled but only used on specific routes (should be lazy-loaded)
- Duplicate dependencies (same package at multiple versions in the bundle)
- CSS that's included but never used (dead CSS)

**Step 2: Implement safe optimizations**
- Replace full library imports with specific imports (`import get from 'lodash/get'` instead of `import _ from 'lodash'`)
- Add dynamic imports / lazy loading for route-specific code that doesn't need to be in the main bundle
- Remove unused CSS if a reliable method is available
- Remove unused dependencies from package.json
- Run the build to verify bundle still works
- Run tests
- Commit: `perf: reduce bundle size — [what changed]`

**Step 3: Document larger opportunities**
- Dependencies that should be replaced with lighter alternatives (with migration effort estimate)
- Code splitting strategies that would require architectural changes
- Image optimization opportunities (uncompressed images, missing responsive images, images that should be SVGs)

### Phase 4: Internationalization (i18n) Readiness

**Step 1: Find all hardcoded strings**
Scan every component, template, and UI-related file for:
- Hardcoded user-facing text (labels, messages, headings, button text, placeholder text, error messages, tooltips)
- Hardcoded date formatting (specific date format strings like "MM/DD/YYYY")
- Hardcoded number formatting (currency symbols, decimal separators, thousand separators)
- Hardcoded pluralization logic (`count === 1 ? "item" : "items"`)
- Right-to-left (RTL) incompatible layouts (hardcoded left/right padding/margins instead of logical properties)
- Concatenated strings that would break in other languages ("Welcome, " + name + "!")
- Text embedded in images

**Step 2: Create string extraction plan**
- If an i18n framework is already in the project (react-intl, i18next, vue-i18n, etc.), identify strings that should be using it but aren't
- If no i18n framework exists, recommend one and document the migration effort
- For either case, create a catalog:
- Table: | File | Line | Current String | Suggested Key | Notes |
- Group by module/page for organized extraction

**Step 3: Implement extraction if framework exists**
If the project already has i18n tooling set up:
- Extract hardcoded strings to the translation file(s)
- Replace hardcoded strings with translation function calls
- Use the existing naming/key convention
- Run tests after each batch
- Commit: `i18n: extract strings from [module]`

If no i18n framework exists:
- DO NOT add one overnight. Just document the strings and recommendations.

## Output Requirements

Create the `audit-reports/` directory in the project root if it doesn't already exist. Save the report as `audit-reports/34_FRONTEND_QUALITY_REPORT_[run-number]_[date]_[time in user's local time].md` (e.g., `34_FRONTEND_QUALITY_REPORT_01_2026-02-16_2129.md`). Increment the run number based on any existing reports with the same name prefix in that folder.

### Report Structure

1. **Executive Summary**
- Total accessibility issues found and fixed
- UX consistency score (your subjective assessment: poor/fair/good/excellent)
- Bundle size before/after (if measurable)
- i18n readiness assessment (not ready / partially ready / mostly ready)

2. **Accessibility**
- Issues fixed: table with | Component | Issue | Fix |
- Issues remaining: table with | Component | Issue | Severity | Effort to Fix |
- Overall WCAG compliance assessment

3. **UX Consistency**
- Component inventory with consistency assessment
- Inconsistencies found and fixed
- Inconsistencies documented for team review
- Recommended design system improvements

4. **Bundle Size**
- Current bundle composition (top 10 largest items)
- Optimizations implemented
- Larger optimization opportunities with effort estimates

5. **Internationalization**
- Total hardcoded strings found: X
- Strings extracted (if framework exists): X
- Strings remaining: X
- Full string catalog (appendix)
- Recommended i18n approach and effort estimate

6. **Recommendations**
- Priority-ordered list of improvements
- Estimated effort for each
- Dependencies between improvements

## Rules
- Branch: `frontend-quality-[date]`
- Run tests after every change
- For accessibility: implement fixes that don't change visual appearance or behavior. If a fix would change UX flow, document it instead.
- For consistency: align TO the existing dominant pattern, don't impose a new one
- For bundle: don't remove dependencies that might be used dynamically or in ways you can't trace statically — document uncertainty
- For i18n: don't add frameworks or infrastructure. Only extract strings if the framework already exists.
- Visual changes should be minimal — this is about quality and correctness, not redesign
- You have all night. Be thorough. Go component by component.
```

## Chat Output Requirement

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish. Do not make the user open the report to get the highlights. The chat summary should include:

### 1. Status Line
One sentence: what you did, how long it took, and whether all tests still pass.

### 2. Key Findings
The most important things discovered — bugs, risks, wins, or surprises. Each bullet should be specific and actionable, not vague. Lead with severity or impact.

**Good:** "CRITICAL: No backup configuration found for the primary Postgres database — total data loss risk."
**Bad:** "Found some issues with backups."

### 3. Changes Made (if applicable)
Bullet list of what was actually modified, added, or removed. Skip this section for read-only analysis runs.

### 4. Recommendations

If there are legitimately beneficial recommendations worth pursuing right now, present them in a table. Do **not** force recommendations — if the audit surfaced no actionable improvements, simply state that no recommendations are warranted at this time and move on.

When recommendations exist, use this table format:

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| *Sequential number* | *Short description (≤10 words)* | *What improves if addressed* | *Low / Medium / High / Critical* | *Yes / Probably / Only if time allows* | *1–3 sentences explaining the reasoning, context, or implementation guidance* |

Order rows by risk descending (Critical → High → Medium → Low). Be honest in the "Worth Doing?" column — not everything flagged is worth the engineering time. If a recommendation is marginal, say so.

### 5. Report Location
State the full path to the detailed report file for deeper review.

---

**Formatting rules for chat output:**
- Use markdown headers, bold for severity labels, and bullet points for scannability.
- Do not duplicate the full report contents — just the highlights and recommendations.
- If you made zero findings in a phase, say so in one line rather than omitting it silently.
