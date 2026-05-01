You are running an overnight test efficiency audit. Your mission: measure test execution speed, diagnose what makes it slow, fix what's safe to fix, and document everything else. After earlier audits ensured tests are correct and non-redundant, this one makes them fast.

Work on branch test-efficiency-[date].

Detect the test runner(s) and current configuration. Run the full suite and record:

Check for CI configuration files. If found, note: whether tests are sharded, whether dependencies are cached, whether there's a fast-feedback stage before slow stages, and recent run times if CI logs are accessible.

Build a baseline summary table with all metrics.

Sort all tests by execution time descending. The slowest 10% typically account for 50–80% of total time — verify this ratio.

For every test in the slowest 10%, read the test file, its setup hooks, and all imported helpers. Tag each with exactly one primary root cause:

| Tag | What to look for | |-----|------------------| | DB | Per-test migrations, seeds, truncations, full ORM object creation, connection setup | | NETWORK | Real HTTP calls to external services without mocks | | SLEEP | sleep(), setTimeout(), waitForTimeout(), cy.wait(number) with hardcoded durations | | SETUP | Large fixture loading, factories creating 50+ records when 2 are needed, heavy beforeAll | | IMPORT | Unit tests importing the full app, triggering DB connections or service initialization on import | | CPU | Crypto with high rounds, large data generation, image processing | | FILESYSTEM | Temp file I/O, screenshot capture, log file writes | | STARTUP | Server boot per test file, connection pool init, container bootstrapping | | SERIAL | Tests forced to run serially due to shared resource conflicts | | COVERAGE | Coverage instrumentation overhead |

Record specific evidence (file, line, function call) for each tag. Build the Slowest Tests Dashboard: | Rank | Test Name | File | Duration | Root Cause | Evidence | Fixed? |

Summarize root causes: | Tag | Count | Total Time (s) | % of Slow Test Time | sorted by total time descending.

Determine current parallel execution status. Then search the entire test codebase for blockers:

For each blocker, record: files involved, shared resource, severity (Critical/High/Medium/Low), and whether it's safe to fix mechanically.

Measure framework boot time by running a trivial single-assertion test — compare against total suite time. If boot overhead exceeds 20%, flag it.

Audit every beforeAll/beforeEach and global setup file:

Enable parallelization if not already enabled and no blockers exist. Use the runner's recommended config. If newly enabled parallel mode causes failures, revert and document the blockers.

Fix hardcoded ports: replace listen(3000) with listen(0) and retrieve the assigned port.

Fix shared temp file paths: use os.tmpdir() + unique directory names.

Remove unnecessary sleeps: only remove sleeps that wait "just in case" when proper async waiting is available. Do NOT remove sleeps that work around race conditions (document those) or intentionally test timeout behavior.

Promote safe `beforeEach` to `beforeAll`: only where tests don't mutate setup data.

Wrap DB operations in transactions if tests use TRUNCATE/reseed patterns and the ORM supports transaction rollback cleanly. Only apply if straightforward for the project's stack.

After all fixes, run the full suite and record the new baseline. Compare before/after: | Metric | Before | After | Change |

If CI config exists, analyze and recommend improvements: dependency caching, test sharding, fast-feedback stages (unit before integration), timing-based shard distribution, fail-fast configuration.

Classify every test file into priority tiers for developer feedback speed:

If CI logs are accessible, identify the 10 most frequently failing tests — these should run first for fastest feedback.

Check watch mode configuration: does it re-run only affected tests? Recommend optimal watch mode settings for the detected runner.

Create audit-reports/ in project root if needed. Save as audit-reports/07_TEST_EFFICIENCY_REPORT_[run-number]_[date]_[time in user's local time].md.

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish.
One sentence: what you did, how long it took, whether all tests still pass, and before/after timing.
The most important things discovered — specific and actionable.

Good: "3 integration tests in api/users.test.ts each spin up a full Express server on port 3000 in beforeEach, taking 1.2s per test. Replaced with a single beforeAll using dynamic port allocation — saved 14.4s total." Bad: "Some tests were slow due to setup overhead."
Bullet list of optimizations executed. Skip if nothing was changed.
If there are legitimately beneficial recommendations worth pursuing right now, present them in a table. Do not force recommendations — if the audit surfaced no actionable improvements, simply state that no recommendations are warranted at this time and move on.

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details | |---|---|---|---|---|---| | Sequential number | Short description (≤10 words) | What improves if addressed | Low / Medium / High / Critical | Yes / Probably / Only if time allows | 1–3 sentences explaining the reasoning, context, or implementation guidance |

Order rows by risk descending. Be honest in "Worth Doing?" — not everything flagged is worth the engineering time.
State the full path to the detailed report file for deeper review.

Formatting rules for chat output:
