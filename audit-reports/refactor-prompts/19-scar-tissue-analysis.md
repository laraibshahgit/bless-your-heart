You are running an overnight scar tissue analysis. Your job: find areas of the codebase where problems keep recurring — files changed over and over, band-aids stacked on band-aids, edge cases layered on edge cases — and determine where a first-principles redesign would permanently solve what patches cannot.

This is a READ-ONLY analysis. Do not create a branch or modify any code.

Other prompts analyze what the code looks like right now. This one asks what the code has been through. A function might look reasonable in a snapshot, but git history reveals it's been patched 40 times in 6 months — each patch adding another edge case, another defensive check, another "just in case" guard. That's scar tissue: the codebase equivalent of fixing a leaky pipe with more tape instead of replacing the pipe.

Scar tissue hides in plain sight. The code "works." Tests pass. But velocity in that area is slow, bugs keep reappearing in the same neighborhood, and every developer who touches it adds another layer of protection instead of addressing the root cause.

This prompt finds those areas, quantifies the evidence, and sketches what a clean redesign would look like.

Identify the most frequently modified files in the repository:

What you're looking for: Files that keep getting touched for fixes, not features. A file that changed 50 times for 50 different features is healthy growth. A file that changed 50 times and 30 of those commits start with "fix" is scar tissue.
Scan commit messages for recurring problem signals:

Search for code where defensive checks have been stacked over time:

Find files or functions with unusually high comment-to-code ratios. Heavy commenting often means the code is too complex to understand without explanation — the comments are themselves scar tissue.

Look specifically for:

If audit-reports/ exists, scan all existing audit reports for:

If audit-reports/ does not exist, skip this phase and note it in the report.

For every candidate area identified in Phases 1-4, calculate a scar tissue score based on:

| Dimension | 0 | 1 | 2 | 3 | |-----------|---|---|---|---| | Churn velocity | Normal change rate | Above average | High (weekly) | Extreme (multiple times/week) | | Fix ratio | Mostly features | Mixed | Mostly fixes | Almost exclusively fixes | | Complexity | Clean, linear code | Some branching | High cyclomatic complexity | Deeply nested, incomprehensible | | Annotation density | No TODOs/FIXMEs | A few scattered | Noticeable cluster | Littered with warnings | | Audit recurrence | Never flagged | Flagged by 1 audit | Flagged by 2 audits | Flagged by 3+ different audits | | Author spread | One person's domain | 2-3 contributors fixing | 4-5 contributors fixing | Whole team has patched it |

Total score 0-18. Rank all candidates.
For each area scoring 8+:

For each area scoring 8+, write a one-paragraph redesign sketch:

Good example: "The order validation in checkout/validate.ts has accumulated 23 edge-case guards over 18 months because each payment provider has slightly different requirements and they're all handled in one 200-line function. Replace with a validation pipeline: define a PaymentValidator interface with one method, implement one per provider, and run them in sequence. Each provider's quirks are isolated in their own validator. Adding a new provider means adding a new class, not another if branch in a function nobody wants to touch."

Bad example: "This code is messy and should be refactored."

Create audit-reports/ in project root if needed. Save as audit-reports/19_SCAR_TISSUE_ANALYSIS_REPORT_[run-number]_[date]_[time in user's local time].md, incrementing run number based on existing reports.

| Rank | File/Module | Score (0-18) | Churn | Fix Ratio | Complexity | Annotations | Audit Recurrence | Author Spread | Top Signal |

For each area scoring 8+:    | Area | Score | Root Cause | Current Design Failure | Proposed Redesign (one paragraph) | Behavior to Preserve |

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish. Do not make the user open the report to get the highlights.
One sentence: what you did, how long it took, repository history depth analyzed.
The top findings, ranked by scar tissue score. For each:

Good: "payments/processor.ts — Score: 14/18. This file has been modified 87 times in 12 months, 52 of those commits containing 'fix' in the message. Six different developers have patched it. The function processPayment() has grown from 40 lines to 230 lines, with 19 edge-case guards added one at a time. Root cause: all payment providers are handled in a single code path with provider-specific branches. Replace with a strategy pattern — one PaymentProcessor interface, one implementation per provider, dispatched by provider type. Each provider's quirks are isolated. Adding a new provider means a new class, not another branch in a function nobody wants to touch."

Bad: "payments/processor.ts has high churn."
Recurring themes across the hot spots:

If there are legitimately beneficial recommendations worth pursuing right now, present them in a table. Do not force recommendations — if the audit surfaced no actionable improvements, simply state that no recommendations are warranted at this time and move on.

When recommendations exist, use this table format:

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details | |---|---|---|---|---|---| | Sequential number | Short description (<=10 words) | What improves if addressed | Low / Medium / High / Critical | Yes / Probably / Only if time allows | 1-3 sentences explaining the reasoning, context, or implementation guidance |

Order rows by risk descending (Critical -> High -> Medium -> Low). Be honest in the "Worth Doing?" column — not everything flagged is worth the engineering time. If a recommendation is marginal, say so.
Full path to the detailed report file.

Formatting rules for chat output:
