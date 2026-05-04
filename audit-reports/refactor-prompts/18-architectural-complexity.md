# Architectural Complexity Audit

You are running an overnight architectural complexity audit. Your job: find where the system is more complex than it needs to be — unnecessary indirection, over-abstracted boundaries, convoluted data flows, and astronaut architecture — and produce a prioritized simplification roadmap the team can act on.

This is a READ-ONLY analysis. Do not create a branch or modify any code. Architectural simplification requires human judgment about tradeoffs — your job is to surface the complexity, quantify it, and propose specific simplifications with clear risk assessments.

---

## Why This Exists

Code Elegance handles function-level complexity: long functions, deep nesting, bad names, mixed abstraction levels within a file. This prompt handles **system-level complexity**: the kind that makes a new developer ask "why does a button click go through 7 files before it reaches the database?" The kind where every feature takes 3x longer to build because you're fighting the architecture instead of using it.

Unnecessary complexity is a silent tax. It doesn't show up in bug reports or crash logs. It shows up in slower velocity, harder onboarding, more bugs per feature, and engineers quietly dreading certain parts of the codebase.

---

## Global Rules

- This is READ-ONLY. Do not modify any code or create branches.
- Be honest about the difference between **unnecessary complexity** (should be simplified) and **essential complexity** (the problem is genuinely hard). Not every abstraction is over-engineering. Some systems are complex because they need to be.
- When recommending simplification, always state: what you'd remove, what replaces it (or nothing), what capability would be lost (if any), and what would break during the transition.
- Ground every finding in specifics — file paths, call chains, data flow traces. Not "the auth system is over-engineered" but "a login request passes through 6 files (AuthController → AuthService → AuthProvider → TokenManager → SessionFactory → UserRepository) when AuthController → AuthService → UserRepository would preserve all current behavior."
- Distinguish between complexity that's hurting the team NOW vs. complexity that was built for future needs that MAY arrive. The latter deserves a lighter touch — flag it, but acknowledge the team may have context you don't.
- You have all night. Be thorough.

---

## Phase 1: Structural Complexity Mapping

### Step 1: Dependency graph analysis

Map the import/dependency graph of the entire codebase. Identify:

- **Hub modules**: Files imported by 20+ other files. Are they genuine shared utilities, or have they become junk drawers?
- **Deep dependency chains**: Trace the longest import chains from entry point to leaf module. How many layers does a request pass through? How many are doing meaningful work vs. just forwarding?
- **Circular dependencies**: Files or modules that import each other, directly or transitively. These almost always indicate confused boundaries.
- **Orphaned modules**: Files that import from the rest of the codebase but nothing imports them (except possibly tests). Are they dead, or are they entry points?

### Step 2: Layer count analysis

For each major operation in the system (the core 5-10 user actions), trace the full call path from entry point to data store and back. For each layer traversed, note:

- File and function name
- What meaningful work this layer does (validation? transformation? orchestration? logging? nothing?)
- Whether removing this layer would change behavior

**What you're looking for**: layers that exist for "architectural purity" but don't do meaningful work. A controller that calls a service that calls a repository is fine if each layer has a distinct job. A controller that calls a service that calls a manager that calls a provider that calls a repository — where three of those layers just forward the call — is not.

### Step 3: Abstraction inventory

Catalog every abstraction mechanism in the codebase:

- **Interfaces/abstract classes with one implementation**: These add indirection without flexibility. Flag every one. Note whether tests use an alternate implementation (if yes, the abstraction earns its keep).
- **Factories that create one type**: A factory that returns `new Thing()` is a function call wearing a hat.
- **Strategy/plugin patterns with one strategy**: The cost of the pattern isn't justified by one case.
- **Event/observer systems**: Map every event emitter and every listener. Are events crossing module boundaries (useful) or being used within a single module as a roundabout function call (unnecessary)?
- **Dependency injection containers**: Is DI used for testability (good) or because "that's how you do it" even where there's nothing to inject and no tests? Map what's injected and whether alternate implementations exist.
- **Generic/parameterized types with one instantiation**: Generics that are only ever used with one concrete type add cognitive overhead for no flexibility.
- **Wrapper/adapter classes that don't adapt anything**: Classes that wrap a library with an identical API "in case we switch libraries."
- **Configuration for things that never change**: Options, settings, and parameters that have had the same value since they were introduced.

For each: name it, location, what it abstracts, how many concrete implementations/usages exist, whether removing it would require changing behavior.

### Step 4: Directory structure vs. actual architecture

- Does the directory structure reflect how the code actually works, or has it drifted?
- Are related files co-located, or scattered across directories by technical type (all controllers in `/controllers`, all services in `/services`) when they'd be better grouped by feature?
- Are there directories that have become catch-alls (`/utils`, `/helpers`, `/common`, `/shared`) with 30+ files that have nothing to do with each other?
- Does the nesting depth of directories match the actual depth of the architecture, or are there 4 levels of folders containing one file each?

---

## Phase 2: Data Flow Complexity

### Step 1: Trace data transformations

For the core data types in the system (users, orders, whatever the domain objects are), trace every transformation from input to storage and from storage to output:

- How many times is the data reshaped between API input and database write? (Request DTO → domain model → ORM model → database, for example)
- How many of those transformations are doing meaningful work (validation, business rules, format conversion) vs. just copying fields between nearly identical shapes?
- Is the same data serialized and deserialized multiple times unnecessarily?
- Are there mapping layers that exist only because two adjacent layers chose different field names for the same thing?

### Step 2: State management complexity

- How many sources of truth exist for key data? (Database, cache, local state, derived state, global store, URL params — how many of these hold the same information?)
- Where is state duplicated and kept in sync manually? (This is where bugs live.)
- Is global state used where local state would suffice? (A global store holding form input that's only used in one component.)
- Are there derived values stored and manually kept in sync instead of computed on demand?
- Is there a state management library/pattern that's more powerful than what the application needs? (Redux for an app with 3 pages and no shared state.)

### Step 3: Configuration complexity

- How many configuration layers exist? (Env vars → config files → runtime config → feature flags → database-driven settings → hardcoded defaults scattered through the code)
- Can you determine what configuration a running instance is actually using without reading 5 files?
- Are there configurations that override other configurations that override other configurations?
- Is the same setting configurable in multiple places with unclear precedence?

---

## Phase 3: Pattern Complexity

### Step 1: Premature generalization

Find code built for flexibility that was never used:

- Multi-tenant infrastructure in a single-tenant app
- Plugin systems with no plugins
- Configurable pipelines with one pipeline
- Abstract base classes designed for "future" subclasses that never arrived
- Schema versioning for schemas that have never changed
- Internationalization infrastructure wrapping hardcoded English strings
- Multi-provider abstractions wrapping a single provider (one payment processor behind a "payment provider" interface, one email service behind an "email provider" interface)

For each: when was it introduced (git history)? Has the generalization EVER been used? What's the ongoing maintenance cost?

### Step 2: Unnecessary indirection patterns

- **Event buses used as function calls**: Module A emits an event that only Module B listens to, and Module A needs to wait for the result. This is a function call with extra steps and lost type safety.
- **Message queues for synchronous work**: Jobs that are enqueued and then immediately awaited, gaining no benefit from async processing.
- **HTTP calls between co-located services**: Services that could be function calls but communicate over the network because "they might be separate services someday."
- **Database as a message broker**: Polling tables for state changes instead of direct communication.
- **Over-normalized data**: Joins across 6 tables to answer a question that could be a single read if the data were structured differently.
- **Over-denormalized data**: The same information stored in 4 places, manually kept in sync, leading to inconsistency bugs.

### Step 3: Cargo-culted patterns

Patterns adopted because they're "best practice" without the context that makes them valuable:

- **CQRS without a read/write asymmetry problem**: Separate read and write models doubling the code for a system where reads and writes are similar.
- **Domain-Driven Design ceremony in a CRUD app**: Aggregates, value objects, domain events, and bounded contexts for an app that reads from a database and shows it on a screen.
- **Microservice patterns in a monolith**: Service discovery, circuit breakers, and API gateways between modules that run in the same process.
- **Repository pattern wrapping an ORM**: A repository that exposes `findById`, `findAll`, `save`, `delete` — the exact same interface the ORM already provides, adding a layer that contributes nothing.
- **Clean Architecture / Hexagonal Architecture over-applied**: Ports, adapters, use cases, and domain layers for a 10-endpoint CRUD API where every "use case" is a one-line call to the repository.

For each: what pattern, where it's applied, what problem it's solving (if any), and what the simpler alternative looks like.

### Step 4: Accidental complexity from organic growth

- Features bolted on that don't fit the original architecture, requiring workarounds
- Multiple approaches to the same problem coexisting (old way and new way, both maintained)
- Temporary solutions that became permanent (the `// temporary` comment from 2 years ago)
- Code that routes around the official architecture because the architecture made the task too hard

---

## Phase 4: Complexity Quantification

### Step 1: Indirection score per operation

For each of the core 5-10 user operations, calculate:

- **Files touched**: How many files does a request pass through?
- **Meaningful layers**: How many of those files do meaningful work?
- **Indirection ratio**: files touched ÷ meaningful layers. An indirection ratio of 1.0 is perfect (every file earns its place). Above 2.0 is a yellow flag. Above 3.0 is a red flag.
- **Lines of glue code**: Lines that exist only to connect layers (forwarding calls, mapping identical fields, re-exporting).

### Step 2: Abstraction overhead inventory

Total count of:
- Interfaces with one implementation
- Factories creating one type
- Wrapper classes that don't transform behavior
- Generic types instantiated with one concrete type
- Event emissions with one listener
- Configuration options that have never varied

Multiply each by estimated lines of code. This is the **abstraction tax** — code that exists for flexibility that was never used.

### Step 3: Onboarding complexity estimate

For a new developer to understand enough to make a change in each major area:
- How many files must they read?
- How many layers must they understand?
- How many patterns must they recognize?
- How many "you just have to know" conventions exist that aren't enforced by the code?

Rate each area: **Simple** (read 1-3 files, obvious flow), **Moderate** (5-10 files, patterns to learn), **Complex** (10+ files, significant tribal knowledge), **Labyrinthine** (requires a guide, multiple failed attempts expected).

---

## Phase 5: Simplification Roadmap

### Step 1: Categorize every finding

- **Remove**: Abstraction that adds nothing and can be deleted. (Interface with one implementation where no tests use a mock → inline the implementation, delete the interface.)
- **Collapse**: Multiple layers that can become fewer. (Controller → Service → Manager → Repository where Service and Manager do nothing → Controller → Service → Repository.)
- **Replace**: Complex pattern that can be swapped for a simpler one. (Event bus between two modules → direct function call.)
- **Restructure**: Architectural change that would simplify multiple things at once. (Move from technical-layer directories to feature-based directories.)
- **Accept**: Complexity that's justified by the problem domain or a real future need. Explicitly call these out so the team doesn't waste time re-evaluating them.

### Step 2: Risk and effort assessment

For each non-Accept finding:
- **Effort**: Trivial (< 1 hour) / Small (< 1 day) / Medium (< 1 week) / Large (1+ weeks)
- **Risk**: Low (mechanical, type-safe refactor) / Medium (behavioral edge cases possible) / High (cross-cutting, affects many features)
- **Impact**: How much simpler does the codebase get? (Lines removed, layers eliminated, onboarding time reduced)
- **Dependencies**: Does this simplification depend on another simplification happening first?
- **Test coverage**: Is the area well-tested enough to refactor safely?

### Step 3: Prioritized simplification plan

Order by: (Impact × Confidence) ÷ (Effort × Risk)

Group into:
- **This week**: Trivial removals with high confidence and good test coverage. Can be done in the next Code Elegance run.
- **This month**: Small-to-medium simplifications that need planning but not architectural discussion.
- **This quarter**: Larger restructuring that needs team alignment and incremental execution.
- **Backlog**: Good ideas that aren't worth doing until something else forces the issue.

---

## Output

Create `audit-reports/` in project root if needed. Save as `audit-reports/18_ARCHITECTURAL_COMPLEXITY_REPORT_[run-number]_[date]_[time in user's local time].md`, incrementing run number based on existing reports.

### Report Structure

1. **Executive Summary** — Overall complexity assessment (lean / reasonable / heavy / over-engineered), the single biggest complexity tax the codebase is paying, top 3 simplification opportunities with estimated impact.

2. **Structural Complexity Map**
- Dependency graph summary: hub modules, deepest chains, circular dependencies
- Layer analysis per operation: | Operation | Files Touched | Meaningful Layers | Indirection Ratio | Glue Code Lines |
- Abstraction inventory: | Abstraction | Type | Location | Implementations | Justification | Verdict |
- Directory structure assessment

3. **Data Flow Complexity**
- Transformation chains per core data type: diagram or table showing each reshape and whether it does meaningful work
- State management assessment: sources of truth, duplication, global vs. local
- Configuration layer map

4. **Pattern Complexity**
- Premature generalizations: | Pattern | Location | Introduced | Ever Used? | Maintenance Cost | Recommendation |
- Unnecessary indirection: | Pattern | Location | Simpler Alternative | Risk of Change |
- Cargo-culted patterns: | Pattern | Location | Problem It Solves Here | Simpler Alternative |
- Organic growth tangles: locations where the architecture has been routed around

5. **Complexity Quantification**
- Indirection scores per operation (table + red/yellow/green)
- Abstraction overhead: total line count, percentage of codebase
- Onboarding complexity per area: | Area | Files to Read | Layers | Patterns | Rating |

6. **Simplification Roadmap**
- Full finding list: | Finding | Category (Remove/Collapse/Replace/Restructure/Accept) | Effort | Risk | Impact | Priority |
- This week: trivial removals, feed into next Code Elegance or Codebase Cleanup run
- This month: planned simplifications with suggested approach
- This quarter: larger restructuring with milestones
- Backlog: good ideas, low urgency
- Dependency graph between simplifications (what enables what)

7. **Accepted Complexity**
- Complexity that's justified, with explicit reasoning. This section exists so the team doesn't re-litigate these decisions.

8. **Recommendations**
- Priority-ordered next steps
- Which existing overnight prompts (Code Elegance, File Decomposition, Codebase Cleanup) should run next and what they should target based on these findings
- Conventions to adopt to prevent new unnecessary complexity
- How to evaluate "should we add this abstraction?" going forward (a decision framework)

## Rules
- READ-ONLY. Do not modify any code.
- Be specific. Every finding must include file paths, call chains, or data flow traces — not just categories.
- Distinguish essential complexity from accidental complexity. Complex domain logic is not over-engineering.
- Respect that you may lack context. The team may have plans that justify abstractions you'd flag. Frame recommendations as "based on what I can see in the codebase" and mark assumptions.
- Don't recommend simplification that would sacrifice testability. If an abstraction exists solely to enable testing, that's a valid reason to keep it — note it as such.
- Don't conflate "I'd write it differently" with "this is unnecessarily complex." The bar is: does this complexity serve a purpose that justifies its cost?
- Use git history when available to understand whether abstractions were built for growth that materialized or growth that didn't.
- You have all night. Trace every major code path. Check every abstraction.

## Chat Output Requirement

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish. Do not make the user open the report to get the highlights. The chat summary should include:

### 1. Status Line
One sentence: what you did and how long it took.

### 2. Key Findings
The most important complexity hotspots discovered. Each bullet should be specific and actionable, not vague. Lead with impact.

**Good:** "The order creation flow passes through 9 files (OrderController → OrderValidator → OrderService → OrderOrchestrator → InventoryManager → PricingEngine → PaymentProvider → OrderRepository → AuditLogger) but only 4 do meaningful work — the other 5 are pure forwarding layers. Collapsing to 4 layers would remove ~600 lines of glue code and cut onboarding time for this flow in half."
**Bad:** "Found some unnecessary abstraction layers."

### 3. Simplification Roadmap
The full prioritized list of simplification opportunities from the report, grouped by timeframe (this week / this month / this quarter / backlog). Each item should include: what to simplify, category (Remove/Collapse/Replace/Restructure), risk level, and expected impact. Do not truncate — the user should be able to act on this list without opening the report.

### 4. Accepted Complexity
Briefly list any complexity you evaluated and determined is justified, so the team doesn't re-investigate it.

### 5. Report Location
State the full path to the detailed report file for deeper review.

---

**Formatting rules for chat output:**
- Use markdown headers, bold for severity labels, and bullet points for scannability.
- Do not duplicate the full report contents — just the highlights and top recommendations.
- If you made zero findings in a phase, say so in one line rather than omitting it silently.
