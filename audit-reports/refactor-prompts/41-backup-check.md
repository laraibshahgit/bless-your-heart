You are running an overnight backup and disaster recovery audit. Your job: answer "If the worst happened right now, could we recover — and how much would we lose?"

This is a READ-ONLY analysis. Do not create branches or modify code/infrastructure/data. Produce a comprehensive recovery posture assessment and generate the recovery documentation the team would desperately wish they had at 3am during an outage.

## Phase 1: Data Asset Inventory

**Step 1: Identify every data store** — search the codebase for every place data lives:
- Primary database(s) — engine, data, access patterns
- Cache layers (Redis, Memcached) — reconstructable from primary sources, or used as a primary store?
- File/object storage (S3, GCS, local filesystem) — uploads, generated docs, media
- Search indexes (Elasticsearch, Algolia, Typesense) — rebuildable from primary DB?
- Message queues — messages in-flight representing uncommitted state?
- Session storage — in-memory, database, or Redis?
- Logs and audit trails — survive infrastructure failure?
- Configuration and secrets — vault, env vars, config files, or hardcoded?
- Third-party service data (Stripe, SendGrid, Auth0, etc.) — is local DB or the third-party the source of truth?

**Step 2: Classify by criticality**
- **Irreplaceable**: Cannot be reconstructed (user data, transactions, uploads, audit logs)
- **Reconstructable**: Rebuildable at significant cost/time (search indexes, caches, derived analytics)
- **Ephemeral**: Loss acceptable (sessions, temp files, rate limit counters)

**Step 3: Assess volume and growth** — for each critical store: approximate size, growth pattern, unbounded growth risks, largest table/collection.

## Phase 2: Backup Coverage Assessment

**Step 1: Find existing backup configurations** — search for:
- DB backup scripts, cron jobs, IaC backup config (Terraform, CloudFormation — RDS snapshots, S3 versioning)
- Docker volume backups, backup-related env vars/config/dependencies (pg_dump, restic, velero, etc.)
- CI/CD backup jobs, backup documentation, cloud provider backup settings

**Step 2: Assess backup coverage per data store**
For each: Is it backed up? Method? Frequency? Storage location (same server/region/different)? Encrypted? Retention/rotation policy? Ever tested/restored? Point-in-time recovery capability (WAL, binlog, oplog)?

**Step 3: Identify backup gaps** — flag critical stores with:
- No backup — **CRITICAL**
- Backups on same infrastructure (doesn't survive infra failure) — **HIGH**
- Backups never tested — **HIGH**
- Infrequent backups relative to data change rate — **MEDIUM**
- No PITR despite high-frequency writes — **MEDIUM**
- Unencrypted backups containing PII — **MEDIUM**

## Phase 3: Recovery Capability Assessment

**Step 1: RPO analysis** — for each critical store, determine theoretical RPO:
- Daily backups, no WAL/binlog → up to 24h loss
- Hourly snapshots → up to 1h
- Continuous replication/WAL → near-zero
- No backups → everything since inception (catastrophic)

Flag mismatches against likely business tolerance (e.g., payment system with 24h RPO = unacceptable).

**Step 2: RTO analysis** — estimate total recovery time:
- New infrastructure provisioning (IaC vs. manual?)
- DB restoration time (size-dependent)
- File storage restoration
- Secrets/env reconfiguration
- Search index / cache rebuilding
- Post-restoration verification
- Total: "everything gone" → "users can use the product"

**Step 3: Single points of failure** — trace critical paths:
- Single DB instance (no replica), single server/AZ, single file storage location
- Secrets stored in only one place
- Bus factor = 1 for ops knowledge
- Single third-party dependency with no fallback
- DNS with no redundancy

**Step 4: Infrastructure reproducibility**
- What's defined as code vs. manual-only?
- What can be recreated from the repo alone?
- What requires manual setup (cloud console configs, DNS, SSL, third-party services)?

## Phase 4: Disaster Scenario Analysis

For each scenario below, assess: recovery path, data loss, time to operational, manual steps required, and what info the on-call engineer would need but might not have.

1. **Primary database destroyed** (server failure, accidental deletion, ransomware)
2. **Application servers destroyed** (redeploy from scratch — can repo alone suffice? What secrets/config/stateful components?)
3. **File storage destroyed/corrupted** (backups? Reproducible assets? What functionality breaks?)
4. **Third-party service permanently unavailable** (for each critical dependency: impact, local data sufficiency, coupling level)
5. **Credential compromise** (rotation without downtime? Process per credential type? Documented procedure?)
6. **Accidental data corruption / bad migration** (rollback capability? PITR? How to identify affected data? Audit trail?)

## Phase 5: Recovery Documentation

**Generate `docs/DISASTER_RECOVERY.md`** containing:
1. **Data Store Inventory** — table: | Data Store | Type | Criticality | Backup Method | Frequency | Location | RPO | RTO |
2. **Recovery Procedures** — per critical store: prerequisites, locating backups, restore commands, verification, failure fallbacks
3. **Infrastructure Recreation** — from-code vs. manual, env vars/secrets to re-provision
4. **Credential Rotation Procedures** — per credential: location, generation, dependent services, expected downtime
5. **Disaster Response Playbooks** — per scenario: detection, triage, recovery, verification, post-incident
6. **Emergency Contacts & Access** — template for team to fill in; mark gaps with `⚠️ TEAM INPUT NEEDED: [what's missing]`

**Generate `docs/BACKUP_RECOMMENDATIONS.md`** — specific recommendations: what to implement (with tooling), backup testing schedules, monitoring, redundancy additions, estimated effort per item.

## Output

Save report as `audit-reports/41_BACKUP_DISASTER_RECOVERY_REPORT_[run-number]_[date]_[time in user's local time].md`. Increment run number based on existing reports.

### Report Structure
1. **Executive Summary** — readiness rating (unprepared/minimal/partial/solid/robust), one-sentence worst-case impact statement, top 3 gaps
2. **Data Asset Inventory** — | Data Store | Engine | Criticality | Size Estimate | Growth Pattern | Backed Up? |
3. **Backup Coverage** — coverage matrix, critical gaps
4. **Recovery Capability** — RPO/RTO tables, total system RTO, single points of failure
5. **Infrastructure Reproducibility** — code vs. manual matrix
6. **Disaster Scenario Analysis** — summary table + detailed analysis per scenario
7. **Documentation Generated** — references to generated docs, list of all `⚠️ TEAM INPUT NEEDED` items
8. **Recommendations** — priority-ordered: what, why, effort, tooling

## Rules
- Be honest about uncertainty. "No DB backup config found in codebase — could be configured at infrastructure level outside this repo — verify with the team" is better than "There are no backups."
- When estimating RPO/RTO, state your assumptions clearly.
- Write recovery docs for someone stressed, tired, and unfamiliar with the system. Step-by-step. No assumed knowledge.
- Mark everything you can't determine from the codebase with `⚠️ TEAM INPUT NEEDED`.
- Use web search to research best practices for the specific databases and services the project uses.
- You have all night. Be thorough.

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
