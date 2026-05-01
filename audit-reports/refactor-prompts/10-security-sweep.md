You are running an overnight security audit of this codebase. Be thorough, not fast. Systematically find security vulnerabilities, fix the ones that are safe to fix, and document everything else.

Work on a branch called `security-audit-[date]`.

## General Principles (apply to all phases)
- Each phase builds on findings from previous phases. Don't re-run tools or re-investigate issues already covered.
- Run automated tools BEFORE starting manual analysis. Their output informs where to focus.
- DO NOT install new security tools unless trivial (pip install into existing venv, npx one-off). Document missing tools as recommendations instead.
- When automated tools disagree on severity, use the higher rating and verify manually.
- Track false positives explicitly — they're useful for future runs and tool configuration.

## Phase 0: Automated Security Tooling Scan

Run every available SAST tool, dependency scanner, and secret detector first so manual analysis in Phases 1-4 can focus on what tools miss.

**Step 1: Discover available security tooling**
Search for SAST tools, dependency scanners, secret detectors, container scanners, IaC scanners, and pre-commit hooks — whether installed, configured in CI/CD, referenced in docs, or standard for the project's language/framework. Check pipeline configs, IDE configs, `.pre-commit-config.yaml`, `.husky/`, etc. Document everything found.

**Step 2: Run every available tool**
For each installed/configured tool, run it against the entire codebase. Capture: tool name, version, number of findings, severity breakdown.

For built-in tools that require no installation (`npm audit`, `yarn audit`, `pnpm audit`, `pip audit` if available), always run them. For tools requiring installation, note the gap and recommend them.

If Gitleaks or TruffleHog is installed, run against full git history. If Dockerfiles exist, run Hadolint if available.

**Step 3: Triage automated findings**
For each finding:
- **Verify it's real**: Check for false positives in context (e.g., SQL injection warning on already-parameterized queries)
- **Classify severity**: Adjust based on reachability from user input, production vs test code, and compensating controls
- **Deduplicate** across tools
- **Map** each finding to the relevant manual audit phase (1-4)

**Step 4: Document tool coverage gaps**
Identify what's NOT covered (no secret scanning, no SAST, no dependency scanning, no IaC scanning, no container scanning). These gaps dictate where to focus manual effort.

**Step 5: Assess security tooling posture**
Document: Is there security scanning in CI/CD? Are results blocking merges or just informational? Are there documented exception allowlists? When was tooling config last reviewed?

### Phase 1: Secrets & Sensitive Data Scan
Search the entire codebase (config files, scripts, test fixtures, git history) for:
- Hardcoded API keys, tokens, passwords, credentials, AWS access keys, database connection strings
- Private keys or certificates committed to the repo
- PII patterns in test data that look like real data
- `.env` files or similar that shouldn't be committed
- Check `.gitignore` for proper exclusion of sensitive file patterns

### Phase 2: Auth & Permissions Audit
Map every route/endpoint and verify for each:
- Is authentication required? Should it be?
- Is authorization/role checking applied at the right level?
- Any IDOR vulnerabilities (accepting user/resource IDs without access verification)?

Check for: inconsistent auth middleware application, underprotected admin endpoints, JWT/session config issues (expiration, signing algorithm, secret strength), password hashing (bcrypt/argon2 vs MD5/SHA).

### Phase 3: Common Vulnerability Scan
Search the codebase systematically for each pattern:

- **Injection**: SQL (string concatenation in queries), NoSQL, command (exec/spawn with user input), LDAP
- **XSS**: dangerouslySetInnerHTML, unescaped template outputs, innerHTML assignments
- **CSRF**: Missing tokens on state-changing endpoints, SameSite cookie config
- **Insecure Deserialization**: Unvalidated JSON.parse on user input, YAML.load with untrusted data, pickle/eval
- **SSRF**: User-controlled URLs fetched server-side without validation
- **Path Traversal**: File operations with user-supplied paths unsanitized
- **CORS**: Wildcard origins with credentials
- **Rate Limiting**: Auth endpoints without rate limiting
- **Security Headers**: Missing CSP, X-Frame-Options, HSTS, etc.
- **File Upload**: Missing type validation, size limits, executable uploads
- **Error Handling**: Stack traces or internal details in error responses

### Phase 4A: Dependency Vulnerabilities
- Review dependency manifests (package.json, requirements.txt, Cargo.toml, go.mod, etc.)
- Run audit tools if not already run in Phase 0
- For each CVE: note severity, check if vulnerable code path is actually used, attempt upgrade on a branch, run tests, document results

### Phase 4B: Supply Chain Attack Pattern Scan

Look for attack patterns that won't show up in `npm audit` — the things supply chain compromises actually use.

**Step 1: Post-install script audit**
Check every direct dependency for lifecycle scripts (preinstall, install, postinstall, prepare). For each: read the script, flag any that make network requests, read env vars, access filesystem broadly, or execute dynamic code. Check if install script restrictions are configured (e.g., `.npmrc` with `ignore-scripts=true`).

**Step 2: Typosquatting risk assessment**
Check each dependency name for typosquatting risk against well-known packages (character substitutions, misspellings, hyphen/underscore/scope variations). Verify legitimacy via web search and download counts.

**Step 3: Scope and namespace risks**
Check for: unscoped internal packages published publicly, references to scopes the team doesn't own, internal monorepo package names not registered on the public registry (dependency confusion risk), `.npmrc` or registry config mixing public and private registries.

**Step 4: Lock file integrity**
Verify: lock file is committed and current, all resolved URLs point to expected registries, no packages resolving to unexpected URLs/IPs, no missing integrity hashes. If git history available, check for lock file modifications without manifest changes.

**Step 5: Maintainer transfer and takeover signals**
For critical dependencies: check for recent ownership transfers, sudden releases after long inactivity, security advisories about compromised maintainer accounts. Use web search.

**Step 6: Transitive dependency risk**
Identify full dependency tree depth. Flag transitive deps with: extremely low download counts, single unmaintained maintainer, 3+ years stale, permissions beyond stated purpose.

### Phase 5: Safe Fixes

Fix issues that are mechanical, well-understood, and verifiable. After EVERY fix, run the test suite. If tests break, revert immediately and move to "document only."

**Fix these (mechanical, low-risk):**
- **Hardcoded secrets** → environment variable references (add to `.env.example` with placeholders, don't rotate actual credentials)
- **SQL/NoSQL injection** → parameterized queries using existing DB library
- **XSS** → safe alternatives to dangerouslySetInnerHTML, output encoding/escaping
- **Missing CSRF tokens** → add via existing CSRF library/middleware (if none exists, document only)
- **CORS misconfiguration** → explicit allowed origins if determinable from codebase (otherwise document only)
- **Missing security headers** → CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy via existing middleware
- **Rate limiting on auth endpoints** → add if rate limiting library already exists (otherwise document only)
- **Error information leakage** → generic error messages in production, keep detailed logging server-side
- **Missing `.gitignore` entries** → add patterns for .env, private keys, credentials files
- **Insecure deserialization** → safe alternatives (JSON.parse, YAML.safeLoad, schema-validated)
- **Path traversal** → sanitize paths (strip `..`, resolve to allowed directory)
- **Install script restrictions** → add `.npmrc` config, document which packages need scripts and why
- **Lock file hygiene** → regenerate from clean state if integrity issues found
- **Dependency confusion prevention** → add scoping rules for private registry resolution
- **Security tool misconfigurations** → fix outdated rulesets, re-enable disabled rules, add to CI/CD

Commit each category separately: `security: fix [vulnerability type] in [module/scope]`

**Document only — do NOT fix:**
Auth flow changes, permission model changes, session/JWT configuration, password policy changes, encryption changes, architecture-level security changes, dependency replacements for supply chain risk, or anything where you're not confident in the correct behavior. **When in doubt, document rather than fix.** A documented vulnerability is inconvenient; a broken auth system at 3am is a disaster.

### Phase 6: Report

Save as `audit-reports/10_SECURITY_AUDIT_REPORT_[run-number]_[date]_[time in user's local time].md` (create directory if needed, increment run number based on existing reports).

### Report Structure
1. **Executive Summary** — 3-5 sentences on overall security posture, including what was found AND fixed

2. **Automated Security Scan Results**
- Tools discovered and run: | Tool | Version | Findings | Critical | High | Medium | Low | False Positives |
- Tools recommended but unavailable: | Tool | What It Catches | Effort to Add | Priority |
- Key verified findings: | Finding | Tool | Severity | File | Verified? | Addressed In Phase |
- Notable false positives (for future runs)
- Security CI/CD assessment: what runs automatically vs. what should

3. **Fixes Applied** — everything fixed in Phase 5
- | Issue | Severity | Location | Fix Applied | Tests Pass? | Detected By |

4. **Critical Findings (Unfixed)**
5. **High Findings (Unfixed)**
6. **Medium Findings (Unfixed)**
7. **Low Findings (Unfixed)**
8. **Informational**

9. **Supply Chain Risk Assessment**
- Post-install scripts: | Package | Script Type | Behavior | Risk Level | Recommendation |
- Typosquatting risks: | Package | Similar To | Confidence | Evidence |
- Namespace/scope risks: | Package | Risk Type | Detail | Recommendation |
- Lock file integrity: pass/fail with anomaly details
- Maintainer risk: | Package | Concern | Evidence | Risk Level |
- Transitive dependency stats: total count, max depth, flagged packages

### Finding Template (all findings, fixed and unfixed)
- **Title**, **Severity** (Critical/High/Medium/Low/Info), **Location** (file + line), **Description**, **Impact**, **Proof** (code snippet), **Recommendation** (with code example), **Detected By** (manual / [tool name] / both)

Additional fields for **unfixed** findings: **Why It Wasn't Fixed**, **Effort** (Quick fix / Moderate / Significant refactor)
Additional fields for **fixed** findings: **What was changed**, **Tests passing** (confirmation)

## Rules
- Work on branch `security-audit-[date]`. DO NOT push to main.
- Run full test suite after EVERY fix. If tests fail, revert IMMEDIATELY.
- If you find compromised credentials, flag as CRITICAL at the top regardless of everything else.
- Phase 5 fixes must be mechanical and verifiable. Judgment calls belong in the report.
- Security header defaults should be noted for team review (especially CSP).
- Don't pad the report — quality over quantity.
- When in doubt about severity, err higher. When in doubt about a fix, document instead.
- For supply chain findings: use web search to verify package legitimacy, check download counts, review maintainer history.
- Be thorough. Check every file. You have all night.

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
