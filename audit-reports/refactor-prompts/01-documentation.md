# Universal Documentation Generation — Three-Tier System for AI Agents

You are running a documentation generation or refresh pass on this codebase. Your job is to produce a token-efficient, three-tier documentation system that lets an AI agent wake up knowing nothing and navigate to exactly the information it needs for the task at hand.

Work on branch `documentation-[YYYY-MM-DD]` unless the user specified otherwise.

## Primary Directive

**Information completeness beats line counts.** A 400-line CLAUDE.md that prevents every known incident is more valuable than a 250-line CLAUDE.md that misses three critical rules. Line targets trigger splits — they do not cap documentation. **Never sacrifice an incident-proven rule to hit a line count.**

The cost of reloading a rule the agent deleted is ~5 incidents. The cost of carrying an unused rule is ~10 tokens. Err towards completeness.

## The Three-Tier System

AI agents pay a token cost for every line loaded — whether relevant or not. A 1,000-line guide burns ~31K tokens (~15% of a 200K window) on every conversation. The fix: tiered loading.

- **Tier 1 — Always Loaded.** Rules preventing mistakes on ANY task. Target: 250-400 lines.
- **Tier 2 — On-Demand.** Per-topic implementation details. Loaded only when relevant. Target: 40-150 lines per file.
- **Tier 3 — Deep Reference.** Human-facing docs, ADRs, API reference, postmortems. Never auto-loaded.

| Tier                         | Lines       | Tokens     | % of 200K |
|------------------------------|-------------|------------|-----------|
| Always (Tier 1)              | 300-500     | 10-16K     | 5-8%      |
| Per-task (Tier 2, 1-2 files) | 60-200      | 2-6K       | 1-3%      |
| **Typical total**            | **360-700** | **12-22K** | **6-11%** |

Primary deliverable: Tier 1 + Tier 2. Tier 3 is secondary.

## Progressive Disclosure Philosophy

Every conversation starts cold. The agent has no memory of previous sessions. Every line loaded displaces working memory for the actual task.

**Navigation chain**:
1. Agent wakes with CLAUDE.md + MEMORY.md already loaded
2. MEMORY.md contains a topic index with "when to load" triggers
3. Agent reads a trigger matching its task and loads exactly one topic file
4. If the topic file has been split into a hub, it contains a sub-topics table; agent loads the specific sub-file
5. **Maximum depth: two hops below MEMORY.md.** Three levels wastes more navigational overhead than it saves.

**Design principles driving every structural decision**:

- **Trigger-based loading.** Every file in the index has a "when to load" description written from the agent's task perspective — "Writing or fixing tests", not "Testing documentation"
- **Hub files over bloated files.** When a topic file outgrows its target AND content clusters into distinct concerns, promote to a hub. Keep the 20% that covers 80% of tasks inline; split specialized detail into sub-files
- **No orphan files.** Every file must be reachable from MEMORY.md within two hops. Unlinked files are invisible to the agent
- **Scale with the codebase.** A 5-file CLI tool needs 3-5 memory files. A 30-service project with thousands of tests needs 20-30. File count follows complexity
- **Postmortem references are load-bearing.** Every `See [X postmortem]` link connects past pain to future prevention. Preserve them verbatim during refresh passes — never delete a postmortem reference just to hit a line count

## Mode Selection (determine BEFORE Phase 0)

**Cold Start**: No existing `CLAUDE.md`, `MEMORY.md`, or `.claude/memory/` directory. Run all phases sequentially.

**Refresh**: Existing documentation system. DIFFERENT workflow — see Refresh Mode section below. Do NOT wipe and rewrite. Audit, consolidate, delete waste, expand coverage gaps.

To determine mode, check for:
- `CLAUDE.md` at project root
- `.claude/memory/MEMORY.md`
- Any files under `.claude/memory/*.md`

Any one present = Refresh. All absent = Cold Start.

---

## Phase 0: Check Existing Standards

Read every pre-existing documentation source:

- **Project root**: `CLAUDE.md`, `.cursorrules`, `CONTRIBUTING.md`, `README.md`, `AGENTS.md`, `.github/copilot-instructions.md`
- **Global**: `~/.claude/CLAUDE.md` (user-level Claude Code rules) — many rules live here and must NOT be duplicated in the project CLAUDE.md
- **Project memory**: `.claude/memory/*.md`, `docs/*.md`

**If conflicts with three-tier system → STOP and ask user** with: what you found, what conflicts, 2-3 options with tradeoffs.

**Record for later use**:
- Which rules already live in the global CLAUDE.md (don't duplicate them)
- Existing memory file structure (for Refresh mode)
- Line counts of existing files (identify bloat)

No conflicts → proceed.

## Phase 1: Codebase Discovery

Read and map everything. No files produced — only understanding.

**Map**:
- App identity, tech stack, target audience
- Directory responsibilities (top-level + key second-level)
- Request/data flow (entry → routing → middleware → handlers → data → response)
- External dependencies and their roles
- Module dependency graph
- Architectural patterns

**Conventions** (observe the code, don't guess):
- Naming (files, variables, functions, components, DB objects)
- Imports, error handling, testing, state management
- Lint/format configs
- Build/test/deploy commands
- Types as self-documentation

**Pitfalls** (the highest-value content):
- Non-obvious side effects
- Library workarounds (why we don't use library X's default Y)
- Magic values and their meanings
- Unexplained constants
- Non-obvious business logic
- Silent failures and their workarounds
- Postmortem evidence (comments referencing incidents, git commits with "fix:", etc.)

**Cluster** learnings into topic areas → these become Tier 2 files.

**Coverage map (critical — do not skip)**: Build an explicit mapping of every significant codebase module → the documentation file responsible for it. Every service, store, hook, feature, engine, handler group, and reusable system must appear in at least one memory file.

This map is your completeness checklist for Phase 3.

## Phase 2: CLAUDE.md (Tier 1)

Create or update `CLAUDE.md` at project root. **Target: 250-400 lines. Soft target — adjust for incident-proven rules.**

### Inclusion Checklist (every Tier 1 rule must pass ALL)

For each candidate, ask:

1. **Mistake prevention test**: If I removed this, would an AI agent write incorrect code on an unrelated task? (No → Tier 2)
2. **Global duplication test**: Is this already covered by `~/.claude/CLAUDE.md`? (Yes → delete)
3. **Derivation test**: Is this derivable from reading `package.json`, directory listing, or the code itself? (Yes → delete)
4. **Rule test**: Is this a rule (imperative: "Never do X", "Always use Y") or a gotcha (declarative: "Z is silent — use W instead")? (Description of how things work → Tier 2)
5. **Scope test**: Does this apply across multiple features, or only within one? (One feature → Tier 2)

### Delete Triggers — content that commonly bloats Tier 1

Refresh passes often find these. Delete on sight:

- **Tech Stack tables** ("React 18.3, TypeScript 5.5, Vite 6.4..."). Derivable from `package.json`. DELETE.
- **File counts and directory stats** ("25 feature folders, 42 stores"). Decay immediately. Not a rule. DELETE.
- **Stub sections** pointing to memory files ("Environment Variables: see build-infrastructure.md"). Waste tokens without enforcing anything. MEMORY.md's index is the discovery path.
- **Historical timelines** ("Deprecated pattern X was replaced with Y in 2024"). Not a rule. DELETE.
- **Feature descriptions** ("Core Workflow: user adds project, launches session, ..."). User manual, not agent rules. DELETE.
- **Generic workflow rules** ("Run tests before deploy"). DELETE unless project-specific with exact command ("Run `npm run test:e2e:workflow` before merge").
- **Rules duplicated from global CLAUDE.md**. DELETE.
- **Build command lists** where only 3-4 are actually used daily. Keep daily ones, delete the rest.
- **Directory tree diagrams** exceeding ~20 lines. Replace with a pointer to `project-structure.md`.

### Required Sections (adapt to project shape)

- **Project Identity** — One paragraph: what, who, why
- **Multi-Agent Safety** — ONLY if multiple agents work on the repo simultaneously. Project-specific rules for shared-workspace discipline
- **Workflow Rules** — Non-negotiable project-specific process (not generic "write tests")
- **Tech Stack** — ONLY if the project uses a non-obvious tech combination that affects every task. Otherwise DELETE
- **Project Structure** — Condensed tree, ~20 lines max. NO file counts
- **Architectural Rules** — Imperatives, not explanations. NEVER/ALWAYS framing preferred
- **Security Rules** — Every unique security invariant (SQL injection, shell safety, auth boundaries)
- **Conventions** — Only those consistently followed in code AND frequently violated
- **Design System Rules** — ONLY if affecting every UI task; otherwise Tier 2
- **Common Recipes** — Multi-step procedures for "add new X" (IPC channel, settings field, migration). These prevent costly mistakes and earn their line cost
- **Documentation Hierarchy** — Table telling agents where knowledge lives and how to navigate

### Documentation Hierarchy Section (use verbatim)

```markdown
## Documentation

Tiered system: CLAUDE.md → [MEMORY.md](.claude/memory/MEMORY.md) → topic files (`.claude/memory/*.md`) → sub-topic files. Max 2 hops from cold start.

**Placement rule**: Prevents mistakes on ANY task → CLAUDE.md. Spans features → MEMORY.md. One feature → topic file. Narrow subtopic → sub-topic file.

**Updating docs**: When code changes affect a rule in CLAUDE.md, update CLAUDE.md. When code changes affect a feature covered by a memory file, update that file. Topic files target 40-150 lines — split into hub + sub-topic files when content clusters into distinct concerns.
```

### Format Rules (Tier 1)

- **Terse, imperative.** Tables and bullets, not paragraphs
- **Bolded rule prefix.** Every bullet starts with a **Bold rule**, then `—`, then context
- **Inline code for exact names.** `functionName()`, `module-path.ts`
- **Markdown links for ALL file references.** `[filename](relative/path)`. Never bare paths. Never broken
- **NEVER/ALWAYS capitalized for emphasis.** These trigger the agent's hard-rule detection
- **Postmortem references stay verbatim.** Never delete a `See [X postmortem]` link during refresh
- **Breadcrumb pattern**: at the end of a section, consolidate Tier 2 pointers into ONE line: `Cross-cutting rules X, Y, Z: [topic-file.md](.claude/memory/topic-file.md)`. Do NOT point to the same topic file from every bullet

### What Does NOT Belong in CLAUDE.md

- Feature implementation details → topic file
- API response shapes → `ipc-contracts.md` or `api-providers.md`
- Field-level schemas → `data-model.md`
- Testing patterns beyond "tests are required" → `testing.md`
- Debugging notes → postmortem or `troubleshooting.md`
- Security findings (fix details) → `security.md`
- Historical context ("we used to do X, switched to Y") → ADR or postmortem

## Phase 3: Tier 2 Memory Files

Create files under `.claude/memory/`. Loaded on-demand when the agent's task matches a trigger.

### Two-Level Structure

- **Topic files**: Linked directly from MEMORY.md. One topic per file
- **Sub-topic files**: Linked from a topic file that has become a hub. One narrow subtopic per file

**Maximum depth: 2 levels below MEMORY.md.** Path is always `MEMORY.md → topic file → sub-topic file`. Never deeper. If a sub-topic outgrows its target, promote it to a topic file — don't nest.

### Sizing

**Soft target: 40-80 lines per file.** Files between 80-150 lines are fine if content is cohesive. Some files ARE supposed to be long — a `gotchas-frontend.md` that accumulates every frontend rule over time is more valuable as one searchable file than split into five.

**Split indicators** (any one sufficient):
- Exceeds ~150 lines AND content has distinct sub-clusters
- Covers 3+ distinct workflows or systems that rarely co-occur in a task
- Agents loading the file waste >50% of its content on most tasks
- A module within the file has 30+ lines of documentable detail AND is independently useful

**Over-splitting indicators**:
- Multiple sub-files under 20 lines
- Agents need 3+ sub-files to complete a single task
- Hub files have more links than inline content
- Two sub-files could merge without exceeding 100 lines

### Hub File Pattern

A topic file that has been split becomes a hub. It still contains the most critical content inline — NOT a bare index. An agent loading only the hub should get what it needs for 80% of tasks involving that topic.

```markdown
# Testing — Tier 2 Reference

## Infrastructure
[Always-needed: framework, config, helpers — 15-20 lines]

## Critical Anti-Patterns
[Always-needed: mistakes that break tests — 10-15 lines]

## Mock Patterns
[Most common patterns — 10-15 lines]

## Sub-Topics

| File               | When to load                                 |
|--------------------|----------------------------------------------|
| testing-mocks.md   | Complex mock patterns for IPC, DB, or CJS    |
| testing-e2e.md     | Running or writing E2E / Playwright tests    |
| testing-quality.md | Mutation testing, coverage, assertion audits |
```

### Coverage Verification (before Phase 4)

For each module in the Phase 1 coverage map:

1. **Find its documentation home.** Grep the memory files for the module name or file path
2. **Read the actual content.** One-line mention or real documentation?
3. **Depth test**: Could an agent (a) modify this correctly, (b) debug issues, (c) add features, (d) avoid known pitfalls — based on this doc alone? If any answer is no, the doc is incomplete
4. **Gap action**: Expand the relevant topic file OR create a new sub-file. Do not advance to Phase 4 with known coverage gaps

A one-line mention is NOT documentation — it is an inventory entry. Inventory entries are fine in `feature-inventory.md` for minor utilities, but anything with state, side effects, IPC channels, or decision logic needs real depth.

### Content Rules

- Terse reference format. Tables, bullets, code snippets — NOT prose
- Don't repeat CLAUDE.md. Assume reader has it loaded
- Name by topic (`testing.md`), not area (`backend-stuff.md`). Sub-files use parent prefix (`testing-mocks.md`)
- Each file covers: patterns/conventions, config details, correct-pattern snippets, common mistakes, external API quirks

**Good** — tells you what to do:
```markdown
## Firestore Mock Routing
Callables using `loadPromptForPhase()` + `recordUsage()` need collection routing:
- `"prompts"` → return `{ doc: vi.fn(() => ({ get: async () => ({ exists: false }) })) }`
- `"_rateLimits"` → return safe no-op mock
```

**Bad** — teaches background knowledge (that's Tier 3):
```markdown
## About Firestore Mock Routing
When writing tests for callable functions, you need to be aware...
```

### File Count Scaling

| Codebase Size           | Topic Files | Sub-Topic Files | Total |
|-------------------------|-------------|-----------------|-------|
| Small (< 20 files)      | 3-5         | 0-2             | 3-7   |
| Medium (20-100 files)   | 5-10        | 2-5             | 7-15  |
| Large (100-500 files)   | 8-15        | 5-15            | 13-30 |
| Very large (500+ files) | 12-25       | 10-30           | 22-55 |

### Suggested Topic Files (create only what's relevant)

| File                    | Covers                                            |
|-------------------------|---------------------------------------------------|
| testing.md              | Framework config, mocks, pitfalls                 |
| data-model.md           | Field schemas, indexes, storage paths, migrations |
| api-providers.md        | External endpoints, auth, rate limits, quirks     |
| frontend-patterns.md    | Component patterns, stores, animations, theme     |
| process-management.md   | Backend process lifecycle, spawn flow, guards     |
| feature-inventory.md    | Features, shared components, reusable systems     |
| security.md             | Auth details, vulnerabilities, audit findings     |
| build-infrastructure.md | Build pipeline, CI/CD, packaging                  |
| ipc-contracts.md        | IPC channels, schemas, handler conventions        |
| account-management.md   | Auth flows, credential management                 |
| gotchas-[area].md       | Accumulated operational rules per area            |

Split/merge by project shape. Not every project needs every file.

## Phase 4: Verification

Before writing MEMORY.md, verify the documentation you just created actually works.

### Reference Integrity

Grep every `[name](path)` link in CLAUDE.md and every memory file. For each:
- Does the target file/directory exist?
- For source-code references, does the file path resolve (not renamed, not deleted)?
- For postmortem references, does the postmortem file exist?
- For fragment references (`file.md#section`), does the section exist in the target?

**Any broken reference → fix immediately.** Do NOT leave dangling links.

### Duplication Check

For each rule in CLAUDE.md, grep for similar wording in Tier 2 files. If duplicated:
- If Tier 1 has the correct placement (prevents mistakes everywhere), delete from Tier 2
- If Tier 2 has the correct placement (feature-specific), delete from Tier 1
- Never have the same rule in both tiers

### Global CLAUDE.md Check

For each rule in the project CLAUDE.md, check if `~/.claude/CLAUDE.md` already covers it. If yes, delete from project CLAUDE.md — global rules apply automatically.

### Coverage Spot-Check

Pick 3 random modules from the Phase 1 coverage map. For each, simulate an agent loading only the documented memory files and ask: "Can I work on this module correctly?" If no, expand the documentation before proceeding.

### Line Count Sanity Check

- CLAUDE.md: expected 250-400. If over, re-run Delete Triggers. If under 200, suspicious — check for gaps
- Topic files: expected 40-150. If over 200, consider splitting
- MEMORY.md: expected 40-100. If over, move cross-cutting patterns into topic files

## Phase 5: MEMORY.md (Tier 1 Navigation Index)

Create `.claude/memory/MEMORY.md`. **Target: 40-100 lines.**

Three roles:
1. **Orient** — Current project state (metrics, known debt, recent changes)
2. **Navigate** — Topic index with trigger-based descriptions
3. **Remind** — Cross-cutting patterns too specific for CLAUDE.md but spanning multiple features

### Required Structure

```markdown
# Project Memory — Index

[One-line description]. See CLAUDE.md for rules.

## Quick Rules (most frequently triggered)

- **NEVER** [most-violated rule #1]
- **NEVER** [most-violated rule #2]
- [critical invariant]
- [critical invariant]

## Topic Files

| File                   | When to load                                        |
|------------------------|-----------------------------------------------------|
| `testing.md`           | Writing or fixing tests, mock patterns, E2E         |
| `data-model.md`        | Database schema, queries, migrations, new tables    |
| `frontend-patterns.md` | React components, stores, animations, design system|
| `security.md`          | Auth flows, input validation, spawn security        |

## Cross-Cutting Patterns

- [Pattern]: [terse description of when/how to apply]

## Current State

- [Key metrics: test count, schema version, deploy URL]
- [Known debt: 1-3 bullets]
```

### Writing Good "When to Load" Triggers

Task-oriented, specific — NOT content-oriented, vague:

**Good**:
| File | When to load |
|------|--------------|
| `testing.md` | Writing or fixing tests, mock patterns, E2E |
| `security.md` | Auth flows, input validation, spawn security |
| `data-model.md` | Database schema, queries, migrations, new tables |

**Bad**:
| File | When to load |
|------|--------------|
| `testing.md` | Testing documentation |
| `security.md` | Security details |

The agent should read a trigger and immediately decide: "yes, this is my task" or "no, skip it."

### Cross-Cutting Patterns — inclusion criteria

Include patterns meeting ALL THREE:
1. Too specific for CLAUDE.md (not every task needs them)
2. Span multiple features (not one-file-only knowledge)
3. High mistake frequency (agents get this wrong without the reminder)

Examples: IPC envelope shapes, error-handling helper pattern, state-management gotchas. Keep to 10-15 bullets max.

### Scaling MEMORY.md

The index table can grow as long as needed — each row is ~1 line and saves the agent from loading the wrong file. Cross-cutting patterns stay compact. If cross-cutting patterns exceed ~15 items, move the lowest-frequency ones into the most relevant topic file.

## Phase 6: Version Control

Memory files SHOULD be git-tracked — they are shared working documentation. Do NOT add them to `.gitignore`.

```
# NOT gitignored — these are project working docs
!.claude/memory/
!CLAUDE.md
```

---

## Refresh Mode Workflow

If existing documentation was detected in Phase 0, replace Phases 2-3 with this workflow:

### Step 1: Inventory

- Read every existing file (CLAUDE.md, MEMORY.md, all memory files)
- Record: line counts, last-modified dates, coverage
- Compare against Phase 1 coverage map

### Step 2: Identify Waste

For CLAUDE.md, run the Delete Triggers checklist. Mark for deletion:
- Tech Stack tables
- File counts
- Stub sections pointing to memory files
- Duplicated rules from global CLAUDE.md
- Historical timelines
- Feature descriptions
- Self-documenting workflow rules

For memory files, identify:
- Files with <20 lines (candidates for merging)
- Files with >200 lines and unclear splits (candidates for hub promotion)
- Files covering topics that no longer exist in the code
- Orphan files not linked from MEMORY.md

### Step 3: Identify Gaps

For each significant code module added since the last refresh:
- Check `git log --since="last refresh date"` to understand recent additions
- For each new module, find its documentation home
- If no home exists, plan new documentation

### Step 4: Consolidate, Delete, Expand

In order:
1. **Delete** identified waste (reduces noise immediately)
2. **Consolidate** duplicated content (single source of truth)
3. **Expand** coverage gaps (add new rules for new modules)
4. **Verify** via Phase 4 verification

**Refresh mode discipline**:
- **Preserve postmortem references verbatim.** These are load-bearing — they connect past incidents to future prevention
- **Preserve incident-proven rules** even if they bloat line counts
- **Never rewrite from scratch** — edit surgically
- **Prefer "delete + add new"** over "rewrite existing" for cleaner diffs
- **Never merge `gotchas-*.md` files** "because they were similar" — gotchas accumulate per area

---

## Red Flags — Stop and Reconsider If...

- CLAUDE.md grew past 500 lines during a cold-start pass → too much Tier 2 content leaked up
- A topic file has more links than content → wrong split decision
- Three-hop navigation required for a common task → wrong hub structure
- An agent would need 4+ files to complete a single task → over-splitting
- You deleted a postmortem reference "because it was long" → WRONG, restore it
- You merged `gotchas-*.md` files "because they were similar" → WRONG, gotchas accumulate per area
- You replaced a specific rule with "see postmortem" → WRONG, the rule IS the documentation
- You deleted critical rules to hit a line target → WRONG, expand the line target

---

## Multi-Agent Repos

If the project has multiple AI agents working concurrently (typical for active Claude Code workspaces):

- CLAUDE.md MUST contain a "Multi-Agent Safety" section with explicit git rules
- Memory files must be git-tracked (not in user's auto-memory path)
- Every file reference MUST be a clickable markdown link — broken references compound across agents
- Refresh mode workflow applies per-agent; coordinate via branch discipline, not file locking

If the project is single-agent, skip multi-agent safety sections entirely. They bloat CLAUDE.md for solo developers.

---

## Chat Output Requirement

In addition to writing the report file, you MUST print a summary in the conversation when finished. Do not make the user open the report to get the highlights.

### 1. Status Line
One sentence: what you did, whether all references verify, whether tests still pass.

### 2. Key Findings
Most important discoveries — bugs, risks, wins, surprises. Specific and actionable, not vague. Lead with severity.

**Good**: "CRITICAL: 14 broken file references in memory files — agents following these will hit 404s."
**Bad**: "Found some issues with references."

### 3. Changes Made (if applicable)
Bullet list of what was modified, added, removed. Include line-count deltas (`CLAUDE.md 394 → 202`). Skip for read-only analysis runs.

### 4. Recommendations
If there are legitimately beneficial recommendations worth pursuing, present in a table. Do NOT force recommendations — if the audit surfaced none, say so.

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|----------------|--------|-----------------|--------------|---------|
| 1 | Short desc ≤10 words | What improves | Low/Med/High/Critical | Yes/Probably/Only if time allows | 1-3 sentences |

Order by risk descending (Critical → High → Medium → Low). Be honest in "Worth Doing?" — not everything flagged is worth the time.

### 5. Report Location
State the full path to the detailed report file.

Create `audit-reports/` in project root if needed. Save as:
`audit-reports/01_DOCUMENTATION_COVERAGE_REPORT_[run-number]_[YYYY-MM-DD]_[HH-MM].md`

Increment run number based on existing reports.

### Formatting rules for chat output

- Use markdown headers, bold for severity labels, bullet points for scannability
- Do not duplicate full report contents — just highlights and recommendations
- If zero findings in a phase, say so in one line rather than omitting silently

---

**Remember**: The goal is not pretty documentation. The goal is an AI agent, cold-started, navigating to exactly the information it needs in 2 hops or fewer — without wasting a context window on irrelevant bulk. **Information completeness beats line counts. Postmortem references are load-bearing. Never rewrite, always edit surgically.**
