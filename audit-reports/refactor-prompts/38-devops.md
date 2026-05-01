You are running an overnight DevOps and infrastructure audit. Analyze the CI/CD pipeline, environment configuration, logging, and migration safety. Fix what's safe, document the rest.

Work on branch `devops-audit-[date]`.

## Your Mission

### Phase 1: CI/CD Pipeline Optimization

**Step 1: Map the current pipeline**
Read all CI/CD configs (GitHub Actions, GitLab CI, CircleCI, Jenkins, etc.) and map every workflow: triggers, steps, order, dependencies, approximate durations, and caching.

**Step 2: Identify optimization opportunities**
- **Parallelization**: Sequential steps with no dependency on each other
- **Caching**: Dependencies re-downloaded every run (node_modules, pip, Docker layers, build artifacts)
- **Unnecessary work**: Full test suite on docs-only changes, building all targets when one changed
- **Slow steps**: Disproportionately long steps — investigate why
- **Redundant steps**: Same work across multiple pipelines
- **Conditional execution**: Missing path filters
- **Resource sizing**: Over- or under-provisioned runners

**Step 3: Implement safe improvements**
Add/improve caching, path filters, parallelization; remove redundant steps. Commit: `ci: [description]`

**Step 4: Document larger improvements**
Changes requiring pipeline restructuring, with estimated time savings.

### Phase 2: Environment Configuration Audit

**Step 1: Inventory all configuration**
Catalog every config mechanism: `.env` files and variants, env var references in code, config files, Docker Compose env sections, K8s ConfigMaps/Secrets, IaC files, CI/CD variable definitions.

**Step 2: Check for issues**
- Missing documentation (vars used but not in `.env.example` or README)
- Missing defaults causing silent failures
- No type validation for non-string env vars
- Dev/prod inconsistency
- Hardcoded values that should be configurable (URLs, endpoints, flags, timeouts)
- Secret management problems (plaintext, committed to repo, shared across environments)
- Stale configuration no longer referenced in code
- No startup validation for required vars

**Step 3: Kill switch & operational toggle inventory**
Catalog every mechanism to change behavior without deploying: env var toggles, feature flags (LaunchDarkly, Flagsmith, etc.), DB-driven config, runtime-reloadable config.

For each, document: what it controls, change latency (immediate / restart / deploy), whether it's documented, incident history.

Assess **missing kill switches**: critical features or external integrations that cannot be disabled without a deploy. Recommend additions.

**Step 4: Production safety checks**
- **Dev/prod divergence**: Verify each difference is intentional
- **Dangerous defaults**: Debug mode, verbose logging, permissive CORS, mock providers, relaxed rate limits defaulting to dev-friendly values
- **Missing production config**: Error reporting, monitoring keys, backup config not validated
- **Secret rotation readiness**: Can secrets be rotated without downtime?

**Step 5: Fix what's safe**
- Update `.env.example` with all required vars and descriptions
- Add startup validation that fails fast with clear messages
- Remove stale env var references
- Add type parsing/validation
- Add comments to kill switches explaining purpose and usage
- Create `docs/CONFIGURATION.md` if missing, documenting the full config surface area
- Run tests. Commit: `config: [description]`

### Phase 3: Log Quality Audit

**Step 1: Assess logging infrastructure**
Identify: logging library, log levels and usage, structured vs string logging, log destinations, correlation/request ID system.

**Step 2: Find logging problems**

- **Missing logging**: Empty catch blocks, critical operations (payments, user creation, data deletion), external API calls, auth events, startup/shutdown
- **Excessive logging**: Debug logs in production paths, logging in tight loops, verbose large-object logging, redundant multi-layer logging
- **Dangerous logging** ⚠️: Passwords/tokens/API keys, PII without redaction, credit card data, session tokens, full request bodies
- **Low-quality logging**: Contextless messages ("Error occurred"), missing timestamps, inconsistent log levels, no correlation IDs, no operational vs programmer error distinction

**Step 3: Fix what's safe**
Add logging to unlogged critical ops, redact sensitive data, improve contextless messages, fix log levels, remove debug logging from hot paths. Run tests. Commit: `logging: [description]`

### Phase 4: Migration Safety Check

**Step 1: Inventory all migrations**
Find all migration files, map history and order, identify current state.

**Step 2: Analyze each migration for safety**
- **Reversibility**: Down/rollback exists and would work?
- **Data loss risk**: Drops columns/tables, irreversible data modifications?
- **Downtime risk**: NOT NULL without default, column type changes, index on large table without CONCURRENTLY, long-running backfills?
- **Backward compatibility**: Old code works with new schema and vice versa after partial rollback?
- **Ordering issues**: Unenforceable execution order dependencies?

**Step 3: Check for pending issues**
Unrun migrations, abandoned-feature migrations, conflicting migrations on same tables, schema drift.

## Output Requirements

Save to `audit-reports/38_DEVOPS_AUDIT_REPORT_[run-number]_[date]_[time in user's local time].md`, incrementing run number based on existing reports.

### Report Structure

1. **Executive Summary** — Overall health, top 5 improvements, quick wins implemented

2. **CI/CD Pipeline** — Pipeline diagram (mermaid), optimizations implemented, estimated savings, larger recommendations

3. **Environment Configuration**
- Variable inventory: | Variable | Used In | Default | Required | Description | Issues |
- Issues found/fixed and issues remaining
- Secret management assessment
- Kill switch inventory: | Toggle | Controls | Change Mechanism | Latency | Documented? |
- Missing kill switches: | Feature/Dependency | Risk if Unavailable | Recommendation |
- Production safety: | Config | Issue | Risk | Recommendation |
- Reference to `docs/CONFIGURATION.md` if created

4. **Logging** — Maturity assessment (poor/fair/good/excellent), sensitive data findings (CRITICAL if any), coverage gaps, quality fixes, infrastructure recommendations

5. **Database Migrations** — Inventory with safety assessment, high-risk flags, reversibility per migration, practice recommendations

6. **Recommendations** — Priority-ordered, quick wins vs larger projects, suggested monitoring/alerting

## Rules
- Branch: `devops-audit-[date]`
- Run tests after every code change
- DO NOT modify, run, or reorder database migrations — analyze only
- DO NOT modify production configuration or secrets
- DO NOT change deploy-affecting pipeline behavior — only add optimizations (caching, parallelization)
- Credentials logged or exposed = CRITICAL flag at top of report
- When unsure about infrastructure specifics, document assumptions and flag for verification
- Be thorough.

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
