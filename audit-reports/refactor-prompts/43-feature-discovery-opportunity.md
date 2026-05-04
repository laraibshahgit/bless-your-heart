# Feature Discovery & Opportunity Audit

Read the entire codebase. Identify features, capabilities, and improvements worth building — grounded purely in what exists, what's partial, and what the architecture supports.

**READ-ONLY. No web search. No code changes.**

---

## Rules

- Every recommendation must reference specific files, models, or patterns.
- Distinguish: **natural extensions** (80%+ done), **logical additions** (users would expect), **ambitious opportunities** (differentiators).
- Quality over quantity. 10 well-reasoned opportunities > 50 shallow ones.
- Be honest about effort and maintenance burden. "Add AI" is not a recommendation — specify data, infrastructure, and minimal viable version.
- Don't recommend features that conflict with the product's design intent.
- Prioritize features leveraging existing data/infrastructure over new systems.
- You have all night. Read everything.

---

## Phase 1: Deep Codebase Understanding

**Product model** — What it does, who it serves, every feature, the full data model (entities, relationships, collected data), user roles/permissions, monetization (free/paid/tiers/gating), integrations.

**Architecture capabilities** — Background jobs, notification systems (email/push/in-app/webhooks), file handling, search (full-text/filtering/faceting), real-time (WebSockets/SSE), API surface & patterns, event/audit tracking.

---

## Phase 2: Unfinished & Abandoned Features

**Partially built features** — Look for:
- DB tables/columns with no UI or API exposure
- Models/types defined but unused in routes/components
- Feature flags permanently off (read the guarded code)
- Routes/endpoints not linked from UI; unreachable components/pages
- TODO/FIXME comments describing planned features
- Migrations adding schema for unfinished features
- Config/env vars for unintegrated services

For each: what was it, how far did it get, what would finish it?

**Vestigial infrastructure** — Libraries barely used, notification infra sending only one type, permission systems more granular than needed, underutilized search/webhook/queue systems. These are sunk investment awaiting ROI.

---

## Phase 3: Data-Driven Opportunities

**Inventory all collected data** — User actions/events, timestamps, entity relationships, stored-but-unsurfaced metadata, computed-but-undisplayed aggregations.

**Underutilized data** — Analytics/insights, personalization signals, automation triggers, collaborative signals, historical trends. For each: what data exists → what feature it enables → existing pipeline support → effort.

**Missing data** — Features that need data not yet collected. What's the minimal collection that unlocks the most value?

---

## Phase 4: Pattern-Based Feature Discovery

**Generalization** — Hardcoded reports → report builder. Single notification type → configurable system. Fixed workflow → customizable engine. Single integration → framework. Manual admin → self-service. Single export → multi-format. Fixed views → customizable dashboards.

**Cross-entity features** — Unified search, activity feeds, bulk operations, broad tagging/categorization, universal comments/notes, import/export gaps.

**Power user features** — Keyboard shortcuts, saved filters/views, bulk editing, templates, API access, advanced search, custom fields, scheduled/recurring actions.

**Admin & ops** — Missing admin views, audit logging gaps, user impersonation, data export, usage analytics, health dashboards.

---

## Phase 5: Automation & Intelligence

**Automate manual processes** — Repetitive action patterns (macros), predictable status transitions, inferable data entry, condition-triggered notifications, manual cleanup tasks.

**Smart defaults** — Fields users fill identically, likely next actions, adaptive settings, context-based pre-population.

**AI-augmentable features** — Text generation/summarization, manual classification, semantic search, auto-tagging, NL summaries of data, answering questions from product data. For each: what's augmented, what data feeds it, what infra exists, minimal viable version.

---

## Phase 6: Platform Opportunities

**API-as-product** — Is the API exposable to third parties? What internal capabilities would externals pay for? Could webhook/event patterns power an integration ecosystem?

**Multi-tenancy / white-label** — Tenant-aware data model? Configurable branding? Partner resale/embedding potential?

**Extensibility** — Custom fields/views/workflows? Plugin architecture potential? Natural integration boundaries?

---

## Output

Save as `audit-reports/43_FEATURE_DISCOVERY_REPORT_[run-number]_[date]_[time in user's local time].md`.

### Report Structure

1. **Executive Summary** — Maturity assessment, opportunity count by category, top 5 highest-value, overall untapped potential.

2. **Unfinished Features** — Table: Feature | Evidence (files/tables) | Completion % | Effort to Finish | Value | Recommendation

3. **Underutilized Infrastructure** — Table: Infrastructure | Current Usage | Potential Usage | Effort | Value

4. **Data Opportunities** — Underutilized: Data Available | Feature Enabled | Pipeline Support | Effort | Impact. Missing: Feature Desired | Data Needed | Collection Effort

5. **Feature Opportunities** (main deliverable) — Per feature: Name/description, Category (natural extension / logical addition / ambitious), Evidence (specific code references), Existing foundation (% estimate), Effort (days/weeks/months with specifics), Impact, Dependencies, Priority (Critical / High / Medium / Nice-to-have)

6. **Automation & Intelligence** — Manual→automated, smart defaults, AI opportunities with data/infra grounding.

7. **Platform Opportunities** — API, multi-tenancy, extensibility assessments.

8. **Recommended Build Order** — Priority sequence by dependencies and effort-to-value. Group: quick wins (days), medium (weeks), strategic (months).

---

## Chat Summary (Required)

Print directly in conversation — don't make the user open the report.

1. **Status** — One sentence: what you did.
2. **Key Findings** — Specific, grounded bullets. Lead with value. (e.g., "The `user_events` table tracks every action but nothing surfaces it — a dashboard is low-effort since `jobs/daily_stats.ts` already aggregates.")
3. **Recommendations** table:

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| | ≤10 words | What improves | Low–Critical | Yes / Probably / Only if time | 1–3 sentences |

Order by value descending. Be honest — not everything is worth the engineering time. If nothing worth building was found, say so.

4. **Report Location** — Full path to the detailed report.

If a phase yielded zero findings, say so in one line.
