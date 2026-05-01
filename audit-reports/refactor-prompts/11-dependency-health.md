# Dependency Health & Upgrade Pass

## Prompt

```
You are running an overnight dependency health audit and upgrade pass. You have several hours. Your job is to assess the health, risk, and maintainability of every external dependency in the project — then upgrade what's safe and document the rest.

Work on a branch called `dependency-health-[date]`.

## Your Mission

### Phase 1: Dependency Inventory

**Step 1: Catalog every dependency**
Read all dependency manifests (package.json, requirements.txt, Cargo.toml, go.mod, Gemfile, pom.xml, etc.) and create a complete inventory:

For each dependency:
- Name and current version
- Latest available version
- How far behind the project is (patch / minor / major versions behind)
- What it's used for in this project (read the code, don't guess)
- How widely it's imported (used in 1 file or 50?)
- Whether it's a direct dependency or transitive
- Whether it's a runtime dependency or dev-only

**Step 2: Catalog lock file status**
- Is there a lock file (package-lock.json, yarn.lock, poetry.lock, Cargo.lock, etc.)?
- Is it committed to the repo?
- Is it consistent with the manifest? (Run install and check for drift)
- Are there duplicate packages at different versions in the dependency tree?

### Phase 2: Health Assessment

**Step 1: Identify abandoned or risky dependencies**
For each dependency, assess its health:

- **Last published**: When was the last release? Dependencies with no release in 2+ years are a risk.
- **Maintenance signals**: Open issue count, unmerged PRs, maintainer activity (use web search to check npm/PyPI/crates.io pages and GitHub repos)
- **Known vulnerabilities**: Run `npm audit` / `pip audit` / `cargo audit` / equivalent. For each CVE:
- Severity (critical/high/medium/low)
- Is the vulnerable code path actually used in this project?
- Is there a patched version available?
- Is the fix a simple version bump or a breaking change?
- **Bus factor**: Is this maintained by one person? Is it a critical dependency maintained by an unfunded individual? (This is a real supply chain risk)

**Step 2: License compliance scan**
For every dependency (including transitive dependencies):
- What license does it use?
- Flag any that are:
- **GPL/AGPL** in a proprietary or non-GPL project (potential copyleft risk)
- **SSPL** or **BSL** (may restrict commercial use)
- **No license specified** (legally risky — no license means no permission to use)
- **Custom or unusual licenses** that need legal review
- Generate a complete license inventory table
- If the project has a declared license, flag any dependency license that's incompatible with it

**Step 3: Dependency weight analysis**
Identify dependencies that are disproportionately heavy:
- Packages that pull in massive transitive dependency trees for minimal functionality
- Packages where only a small fraction of the library is actually used (e.g., importing all of lodash for `_.get`)
- Multiple packages that do similar things (two date libraries, two HTTP clients, two validation libraries)
- Packages that could be replaced with native language features (e.g., `is-odd`, `left-pad` style micro-packages, or libraries superseded by modern language features)

For each heavy/redundant dependency:
- What is it and what's it used for?
- How much of it is actually used?
- What's the lighter alternative? (native feature, smaller package, or inline implementation)
- Estimated effort to replace it

### Phase 3: Safe Upgrades

**Step 1: Upgrade patch versions**
- Bump all dependencies to their latest patch version (X.Y.Z → X.Y.latest)
- Run the full test suite after each batch of upgrades
- These should be safe — patch versions are supposed to be backward compatible
- If any tests fail, revert that specific upgrade and document the failure
- Commit: `chore: bump patch versions for [scope]`

**Step 2: Upgrade minor versions**
- Bump dependencies to their latest minor version one at a time (X.Y → X.latest.latest)
- Run tests after each upgrade
- Minor versions may introduce new features but should be backward compatible
- If tests fail, revert and document
- Commit: `chore: bump [package] to [version]`

**Step 3: Document major version upgrades**
Major version upgrades are too risky for an overnight pass. For each dependency that's one or more major versions behind:
- What breaking changes were introduced? (Read the changelog/migration guide)
- What code in this project would need to change?
- Estimated effort: trivial / moderate / significant
- Priority: how important is this upgrade? (Security fix? Performance improvement? Just new features?)
- Dependencies on other upgrades (does upgrading X require also upgrading Y?)

**Step 4: Attempt low-risk major upgrades**
If any major upgrades look trivial (changelog says "renamed one function" or "dropped Node 12 support"):
- Attempt the upgrade
- Run tests
- If they pass, commit: `chore: upgrade [package] from [old] to [new]`
- If they fail, revert and add to the documentation with notes on what broke

### Phase 4: Dependency Reduction Opportunities

**Step 1: Find removable dependencies**
- Scan for dependencies that are imported in the manifest but never actually used in the source code
- Scan for dependencies that are only used in commented-out or dead code
- Check for dependencies that duplicate built-in functionality (e.g., a polyfill for something the minimum supported runtime already supports)

**Step 2: Find replaceable dependencies**
- Identify packages that can be replaced with a few lines of utility code (especially micro-packages)
- Identify packages where only one function/feature is used and that function could be inlined
- Identify packages with lighter, actively maintained alternatives

**Step 3: Implement safe removals**
- Remove clearly unused dependencies
- Run tests
- Commit: `chore: remove unused dependency [package]`

DO NOT replace or inline dependencies in this pass unless it's trivially simple. Document replacement opportunities for the team.

## Output Requirements

Create the `audit-reports/` directory in the project root if it doesn't already exist. Save the report as `audit-reports/11_DEPENDENCY_HEALTH_REPORT_[run-number]_[date]_[time in user's local time].md` (e.g., `11_DEPENDENCY_HEALTH_REPORT_01_2026-02-16_2129.md`). Increment the run number based on any existing reports with the same name prefix in that folder.

### Report Structure

1. **Executive Summary**
- Total dependencies: X (Y direct, Z transitive)
- Dependencies with known vulnerabilities: X
- Dependencies 1+ major versions behind: X
- Potentially abandoned dependencies: X
- License risks found: X
- Upgrades applied: X
- Dependencies removed: X

2. **Vulnerability Report**
- Table: | Package | CVE | Severity | Used in Project? | Fix Available? | Fix Applied? |
- Vulnerabilities that couldn't be fixed and why

3. **License Compliance**
- Complete license inventory: table with | Package | License | Risk Level | Notes |
- Flagged licenses that need legal review
- Recommendation for ongoing license monitoring

4. **Staleness Report**
- Table: | Package | Current | Latest | Versions Behind | Last Published | Health |
- Sorted by risk (most behind + least maintained first)

5. **Upgrades Applied**
- Table: | Package | From | To | Tests Pass? |
- Any issues encountered during upgrades

6. **Major Upgrades Needed (Not Applied)**
- Table: | Package | Current | Target | Breaking Changes | Effort | Priority |
- Suggested upgrade order (accounting for dependencies between upgrades)

7. **Dependency Weight & Reduction**
- Heavy dependencies: table with | Package | Size/Impact | Usage | Alternative | Effort |
- Unused dependencies removed
- Replacement opportunities for team review

8. **Abandoned/At-Risk Dependencies**
- Table: | Package | Last Release | Maintainer Activity | Risk | Recommendation |

9. **Recommendations**
- Priority-ordered action items
- Suggested tooling for ongoing dependency health (Dependabot, Renovate, Snyk, etc.)
- Suggested policy for dependency additions (criteria for adopting new dependencies)

## Rules
- Branch: `dependency-health-[date]`
- Run full test suite after every upgrade attempt
- If tests fail after an upgrade, revert IMMEDIATELY — don't debug the upgrade, just document it
- DO NOT attempt major version upgrades unless the changelog clearly indicates the change is trivial for this project
- DO NOT replace or rewrite dependencies overnight — only remove unused ones
- For license assessment: flag risks, don't make legal determinations. The team needs to decide acceptable license policy.
- Use web search to check dependency health (npm page, GitHub repo, last release date, open issues)
- Be conservative. A working codebase with old dependencies is better than a broken codebase with new ones.
- You have all night. Be thorough. Check every dependency.
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
