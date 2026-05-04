You are running an overnight function centralization analysis. Your job: find every place in the codebase where similar logic exists in multiple callable units — functions, methods, handlers, middleware, hooks, inline blocks — and produce a consolidation map that shows exactly what could merge, what differs, and how many callers would be affected.

This is a READ-ONLY analysis. Do not create a branch or modify any code. Consolidation decisions require human judgment about naming, API boundaries, and acceptable coupling. Your job is to surface the duplication, quantify it, and propose specific unifications with clear signatures.

Codebase Cleanup (Prompt 12) removes dead code and fixes obvious copy-paste duplication as one phase of a broader cleanup. Code Elegance (Prompt 16) notices "the same pattern repeated 12 times" while refactoring for readability. Neither does what this prompt does: a dedicated, systematic, cross-codebase function similarity analysis that catches functions which evolved independently to serve similar purposes, live in different modules with different names, and would never be found by a grep for duplicated lines.

The cost of unconsolidated functions is invisible until it isn't. Two validation functions that mostly overlap will drift apart over time — one gets a bug fix, the other doesn't. Three data-fetching helpers with slightly different signatures mean three places to update when the API changes. The codebase gets larger without getting more capable.

Build a catalog of every callable unit in the codebase. This is the dataset you'll analyze in later phases.
Scan every source file and catalog:

For each, record:

Scan for repeated inline logic that isn't a function but should be. These are consolidation candidates of a different kind — not "merge two functions" but "extract one function from multiple inline blocks."

Look for:

For each, record:

Group the inventory by what the functions DO, not where they LIVE. Create purpose categories such as:

This grouping is critical — functions that could consolidate will almost always share a purpose category, even if they live in completely different modules.

Find functions that are structurally near-identical. These are the easy wins — the cases where someone clearly copied a function and tweaked it.
Compare function bodies across the inventory. Flag pairs/groups where:

Find functions that follow the same algorithmic pattern even if the specifics differ:

Find cases where multiple thin wrappers exist around the same underlying operation:

| Field | Description | |-------|-------------| | Functions | Names with file:line for each | | Callers | Count of call sites per function | | What's identical | The shared logic, specifically | | What differs | The exact parameters, values, or branches that differ | | Unified signature | A proposed single function signature that could replace all of them | | Confidence | High (this is Phase 2 — all findings here should be high confidence) |

Find functions that serve the same purpose and could be consolidated, even though their implementations aren't copy-paste similar. This is where the hard-to-find consolidation opportunities live.
Within each purpose category from Phase 1, compare functions that:

Find functions where the responsibility boundaries overlap:

Check git history where feasible to find functions that:

| Field | Description | |-------|-------------| | Functions | Names with file:line for each | | Callers | Count of call sites per function | | Shared purpose | What both functions are trying to accomplish | | Implementation differences | How they differ in approach, not just parameters | | Unified signature | A proposed single function signature, if consolidation makes sense | | Consolidation approach | How you'd unify them (parameterize? extract shared core? generalize with type params?) | | Confidence | Medium — explain why you believe these are consolidation candidates despite the differences |

Specifically hunt for logic that's been duplicated across architectural boundaries.
This is one of the most common and most dangerous forms of duplication. Look for:

If the codebase has multiple services, packages, or modules that could share code but don't:

Look for logic duplicated between test helpers and production code:

| Field | Description | |-------|-------------| | Locations | Both sides with file:line | | Boundary crossed | Frontend↔Backend / Service↔Service / Test↔Production | | What's duplicated | The specific logic, rules, or data | | Drift risk | How likely these are to fall out of sync (and what breaks when they do) | | Sharing strategy | How this could be unified (shared package, generated types, single source of truth with build-time sync, etc.) | | Confidence | High / Medium / Low |

Synthesize all findings into actionable consolidation groups.
Multiple findings from Phases 2-4 may point to the same consolidation opportunity. Group them:

Consolidation Opportunity Card:
## [CG-NN] Title (e.g., "Unify email validation across API and UI")

**Functions involved:**
- functionA (src/path:line) — 12 callers
- functionB (src/other:line) — 8 callers
- inline block at (src/another:line) — 1 occurrence

**Total callers affected:** 21
**Total lines that could be replaced:** ~85 → ~30

**What they share:** [specific shared logic]
**What differs:** [specific differences and how they'd be parameterized]

**Proposed unified function:**
functionName(params): returnType
[brief explanation of how the unified function handles the differences]

**Ripple effect:**
- [list of files/modules that would need import changes]
- [any behavioral subtleties callers depend on]

**Confidence:** High / Medium / Low
**Recommended prompt for execution:** Prompt 12 (Cleanup) / Prompt 16 (Elegance) / Manual team review
Rank all consolidation groups by:

| Factor | Weight | Description | |--------|--------|-------------| | Caller count | High | More callers = more value from a single source of truth | | Drift risk | High | Logic that's already diverging is urgent to unify | | Confidence | High | High-confidence consolidations should be done first | | Lines saved | Medium | Net reduction in codebase size | | Cross-boundary | Medium | Frontend↔Backend duplication carries higher long-term risk | | Complexity of merge | Negative | Hard merges lower the priority despite high value |

For each major cluster of findings, identify WHY the duplication exists:

Based on the root causes, recommend structural changes that would prevent future duplication:

Be conservative with structural recommendations. Only suggest what the evidence supports. "Add a shared utils folder" is easy to say; it's only worth recommending if you found 10+ functions that clearly belong there.

Create the audit-reports/ directory in the project root if it doesn't already exist. Save the report as audit-reports/17_FUNCTION_CENTRALIZATION_REPORT_[run-number]_[date]_[time in user's local time].md (e.g., 17_FUNCTION_CENTRALIZATION_REPORT_01_2026-04-05_0230.md). Increment the run number based on any existing reports with the same name prefix in that folder.

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish. Do not make the user open the report to get the highlights. The chat summary should include:
One sentence: what you analyzed, how many functions inventoried, how many consolidation opportunities found, and what confidence tier the best findings are.
The most important consolidation opportunities discovered. Each bullet should be specific and actionable, not vague. Lead with the value (caller count, lines saved, drift risk).

Good: "21 callers across 3 modules use near-identical email validation (validateUserEmail, validateProfileEmail, inline check in webhook handler) — unifiable into a single validateEmail(input, options) saving ~55 lines and eliminating known drift where the webhook handler is missing the RFC 5322 check added to the other two last month." Bad: "Found some duplicated validation functions."
If there are legitimately beneficial recommendations worth pursuing, present them in a table. Do not force recommendations — if the audit surfaced no actionable consolidation opportunities, simply state that and move on.

When recommendations exist, use this table format:

| # | Consolidation Group | Functions | Callers | Lines Saved | Confidence | Recommended Action | |---|---|---|---|---|---|---| | Sequential number | Short title (≤10 words) | Count of functions involved | Total caller count | Net lines reducible | High / Medium / Low | Which prompt handles it, or "team review" |

Order rows by caller count descending. Be honest about confidence — not every similarity is worth consolidating.
State the full path to the detailed report file for deeper review.

Formatting rules for chat output:
