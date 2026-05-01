# UI Design Quality & Visual Polish

You are running an overnight UI design quality audit. Your job: assess this app against professional design standards and produce a comprehensive visual quality report that a developer can act on immediately. You are not a designer making subjective taste calls — you are an engineer identifying specific, measurable deviations from established best practices.

**This is primarily a documentation run.** Fix only issues that are unambiguously broken (e.g., a button with zero padding, text with no contrast, a layout with no max-width at all). Everything else — even things that clearly should be fixed — goes in the report with a specific recommendation. A thorough written report is more valuable than aggressive changes that might require reverting.

Work on branch `ui-polish-[date]`.

---

## Global Rules

- Run tests after every change. Commit format: `design: [what] in [component/page]`
- **Fix only**: issues that are objectively broken, have a single obvious correct solution, and carry near-zero risk of unintended visual side effects. If you have any doubt, document it.
- **Document everything else** — with enough specificity that a developer can execute the fix without guessing.
- DO NOT change business logic, routing, or data fetching.
- DO NOT introduce new UI libraries or dependencies.
- DO NOT redesign the visual identity. Identify and reinforce the best version of what's already there.
- Use Playwright MCP for screenshotting and interaction verification where available.
- You have all night. Go screen by screen, component by component.

---

## Phase 1: Visual Audit with Playwright

### Step 0: Setup — a mandatory pre-flight checklist before any visual auditing:

Install the Playwright browser via browser_install MCP tool (this was the likely cause of your hang — without it, Playwright tries to use a missing browser and gets stuck)
Find the dev server command from package.json scripts or README
Start the dev server in the background (don't block waiting for it to exit)
Verify the app is reachable — try the URL, try alternative ports, bail after 3 attempts
Discover all routes from the codebase before screenshotting

Plus two fallback guardrails:

If there's no web UI at all (CLI tool, library), skip Phases 1 & 3 entirely
Page load resilience — 15-second timeout per page, note failures and move on instead of hanging

### Step 1: Screenshot every screen
Use Playwright MCP to navigate to every route and capture full-page screenshots.

**Handling authentication:** Before navigating to any protected route, attempt to reach it and check whether you land on a login page or are redirected to auth. If auth is required and no test credentials are available in the codebase (check `.env.example`, seed scripts, test fixtures, and README for any documented test accounts):
1. Open the browser to the login page via Playwright
2. **Pause and print a clear message in the chat:** "⏸️ WAITING FOR LOGIN — The app requires authentication and no test credentials were found. Please log in manually in the Playwright browser window, then type 'continue' to proceed with the audit."
3. Wait for the user to confirm before proceeding
4. Once confirmed, resume screenshotting all authenticated routes

Capture at:
- Desktop (1440px), laptop (1280px), tablet (768px), mobile (375px)
- Key interactive states: hover, focus, loading, empty, error
- Modal/drawer open states
- Form validation states (both valid and error)

### Step 2: Assess each screenshot against the antipattern checklist

For every screen, flag every instance of the following. Be exhaustive — these are the specific failure modes that separate amateur from professional UI work.

**Layout:**
- Content spanning full viewport width with no max-width container (the #1 developer default crime)
- Text lines exceeding ~75 characters (measure a representative line; above 75ch is a readability problem)
- Asymmetric or inconsistent page margins across different routes
- Elements touching the viewport edge with no gutters
- Cards or panels that expand to fill without a sensible max-width, creating wide flat boxes on large screens
- Sidebar or panel widths that seem arbitrary vs. sized to their content

**Spacing:**
- Inconsistent gap between similar repeating elements (e.g., some cards 12px apart, others 24px — measure them)
- No discernible vertical rhythm — sections that feel crowded or randomly spaced
- Form fields with no visual grouping between sections
- Buttons or inputs with padding that makes them feel cramped or bloated
- Content that appears to "float" with no clear belonging to a section

**Typography:**
- Body text below 14px or above 18px (note the exact px value found)
- Line-height below 1.4 on paragraph text (note the exact value)
- Heading hierarchy that doesn't feel meaningfully different from body text
- Multiple competing type scales with no apparent system
- Paragraphs exceeding 65-70ch in a reading-focused layout
- Letter-spacing applied to lowercase body text (almost always wrong)
- ALL CAPS blocks of body text

**Color:**
- Interactive elements (buttons, links, toggles) that don't look interactive — no visual affordance
- Disabled states visually identical to enabled states
- Multiple competing accent colors with no hierarchy (note each color used)
- Saturated colors used for large background areas creating visual fatigue
- Status colors (red/green/yellow) used decoratively rather than semantically
- Text or icon colors that appear low-contrast (flag for manual contrast ratio check)

**Components:**
- Buttons with visibly insufficient padding (note the component)
- Buttons that are full-width in desktop contexts where they shouldn't be
- Inputs that appear unstyled or browser-default
- Missing focus ring on interactive elements (test with Tab key in Playwright)
- Tables with no row hover state, no clear header differentiation
- Empty states showing only raw "No data" or nothing at all
- Loading states missing entirely, or a massive spinner where a skeleton would be appropriate
- Modals without a visible close button or with no backdrop

**Responsiveness:**
- Desktop nav that simply overflows or disappears on mobile — no mobile nav pattern
- Tables that overflow without horizontal scroll or card collapse
- Inputs below 44px height on mobile (iOS/Android tap target minimum)
- Modals that remain desktop-sized on mobile instead of going full-screen or near-full-screen
- Font sizes below 16px on inputs on mobile (triggers iOS auto-zoom)

Document every finding with: **Screen | Component | Issue | Specific Measurement (if applicable) | Severity**

Severity:
- **Critical** — Looks broken, unusable, or actively hurts the user (missing contrast, no mobile nav)
- **High** — Clearly amateurish, would cause a user or stakeholder to question quality
- **Medium** — A polish gap a professional designer would flag
- **Low** — Nice-to-have refinement

---

## Phase 2: Design System Audit

### Step 1: Inventory every design decision currently in the codebase
Extract and catalog:
- Every distinct color value used (hex/hsl/variable) and where
- Every distinct font size used and where
- Every distinct spacing value used (padding, margin, gap) and the range
- Every distinct border-radius value used
- Every distinct box-shadow value used
- Every distinct transition duration used
- Every breakpoint used

### Step 2: Assess systematically

**Color system:**
- Is there a defined color palette, or are colors scattered ad hoc throughout component files?
- How many distinct "primary" or "brand" colors are there? (More than 2-3 main colors suggests no system)
- Are neutral grays on a scale, or random values?
- Are semantic colors (success, warning, error, info) consistent across the app, or does every component pick its own red?
- Are colors defined as CSS variables or theme tokens, or hardcoded throughout?

**Spacing system:**
- Is spacing on a consistent scale (multiples of 4px or 8px), or are values arbitrary?
- Count how many distinct spacing values exist. More than 10-12 unique values suggests drift.
- Are spacing values defined centrally or hardcoded per component?

**Typography system:**
- How many distinct font sizes exist? More than 6-8 distinct sizes suggests no scale.
- Is there a clear heading hierarchy (h1 through h4) with visually distinct sizes?
- Are font sizes defined centrally or scattered?

**Component consistency:**
- Do all buttons of the same type (primary, secondary, etc.) share the same height?
- Do all text inputs share the same height and padding?
- Is border-radius consistent across same-type components (e.g., all cards have the same radius)?

### Step 3: Identify the dominant pattern
For each dimension, the most common value is the de-facto standard. Document what it is, and list all deviations from it.

### Step 4: Generate `docs/DESIGN_SYSTEM.md`
Write a design system documentation file based purely on what currently exists in the codebase — not what should exist, but what IS. Sections:
- Color palette (every used value, organized by role)
- Spacing scale (actual values used, which is the base unit)
- Type scale (actual values used, which are headings vs. body vs. labels)
- Component patterns (button sizes/styles, input sizes, card patterns)
- Deviations: values that exist in the codebase but don't fit the dominant system

This document is the baseline. It answers the question: "What does our design system actually look like right now?"

---

## Phase 3: Interaction & Animation Audit

Use Playwright to test every interactive element. Tab through every page. Hover every interactive element. Focus every input.

**Hover states:**
- Does every button have a visible hover state (color change, shadow, brightness shift)?
- Do links have hover states?
- Do table rows have hover states?
- Do clickable cards have hover states?
- Note any interactive element with no visible hover feedback.

**Focus states:**
- Does every interactive element show a visible focus ring when focused via keyboard?
- Is the focus ring distinct from the hover state?
- Note any interactive element where focus is invisible (this is also an accessibility issue).

**Transitions:**
- Do hover/focus state changes happen instantly (jarring) or with a brief transition (polished)?
- Note any state change that would benefit from a transition but has none.
- Note any transition that is too slow (above 300ms for hover states) or has the wrong easing.

**Feedback:**
- Is there immediate visual feedback on every button click? (Brief active/pressed state)
- Do form submissions provide feedback while in-flight?
- Do any interactive elements produce "nothing happened" moments — click with no response?

---

## Phase 4: Safe Fixes Only

Execute fixes only for issues that meet ALL of these criteria:
1. The correct solution is unambiguous (not a design judgment call)
2. The change is mechanical (adding a property, changing a value)
3. There's no risk of cascading visual side effects across the codebase
4. You're confident it's wrong, not just different from your preference

**Examples of safe fixes:**
- A button or input with literally `padding: 0` — add a sensible default
- A page with no max-width container at all — wrap in a container with an appropriate max-width
- A focus state with `outline: none` and no replacement — restore a visible outline
- A transition duration of `0ms` on hover states that clearly should animate — add 150ms ease
- A color variable that's used in one place but defined differently than everywhere else — align to the dominant value
- A missing `cursor: pointer` on a clearly clickable element

**Do NOT fix:**
- Anything where reasonable designers could disagree
- Anything that requires visual judgment about proportions, sizing, or color relationships
- Anything that would change the visual layout in ways that might surprise the team
- Spacing and sizing that feels off but isn't zero — document it

---

## Output

Create `audit-reports/` in project root if needed. Save as `audit-reports/35_UI_DESIGN_QUALITY_REPORT_[run-number]_[date]_[time in user's local time].md`, incrementing run number based on existing reports.

### Report Structure

1. **Executive Summary** — Design quality rating (rough / developing / competent / polished / excellent), critical issue count by severity, whether a coherent design system exists, top 5 highest-impact improvements.
2. **Screen-by-Screen Audit** — Full findings table organized by screen/route.
3. **Design System State** — Token inventory, system coherence assessment, link to `docs/DESIGN_SYSTEM.md`.
4. **Interaction Audit** — Hover/focus/transition findings per component.
5. **Fixes Applied** — Everything changed, with before/after. (Expected to be a short section.)
6. **Priority Remediation Plan** — All documented issues organized by effort and impact.

---

## Chat Output Requirement

The chat summary IS the primary deliverable. Write it comprehensively enough that the developer never needs to open the report file unless they want full detail. Do not truncate findings — if there are 30 issues, list all 30.

### 1. Status Line
One sentence: what you audited, how long it took, whether all tests still pass.

### 2. Design System Assessment
A clear paragraph describing the current state: Does a coherent system exist? What's working? What's fragmented? What's the single biggest structural problem?

### 3. Screen-by-Screen Findings
For every screen audited, list all findings grouped by screen. Use this format:

**[Screen Name / Route]**
- 🔴 CRITICAL: [specific issue with measurement where applicable] → [specific fix recommendation]
- 🟠 HIGH: [specific issue] → [specific fix recommendation]
- 🟡 MEDIUM: [specific issue] → [specific fix recommendation]
- ⚪ LOW: [specific issue] → [specific fix recommendation]

If a screen has no issues, say so in one line: "✅ [Screen] — No significant issues found."

### 4. Cross-Cutting Patterns
Issues that appear on multiple screens (the systemic problems, not one-offs). These are the highest-leverage fixes because solving them once fixes everywhere.

For each pattern:
- **What:** Specific description of the pattern
- **Where:** Every screen/component it appears on
- **Fix:** Exactly what to change and where to change it
- **Effort:** Hours / Days

### 5. Fixes Applied
Short bullet list of what was actually changed. If nothing was changed, say so.

### 6. Priority Recommendations Table

| # | Recommendation | Screens Affected | Effort | Impact | Worth Doing? | How To Fix |
|---|---|---|---|---|---|---|
| *#* | *≤10 words* | *count or list* | *Hours / Days / Weeks* | *Low / Medium / High / Critical* | *Yes / Probably / Only if time* | *1–3 sentences of specific implementation guidance* |

Order by impact descending. Be honest about effort — "add max-width to one wrapper class" is hours, not days.

### 7. Design System Recommendations
Specific, actionable list of design system improvements:
- What tokens/variables to create
- What values to standardize
- What deviations to eliminate
- Estimated effort to establish a proper system vs. continuing ad hoc

### 8. Report & Design System Docs Location
Full paths to the report file and `docs/DESIGN_SYSTEM.md`.
