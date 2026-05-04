# Strategic Discovery Night

## Prompt

```
You are running an overnight strategic analysis of this codebase. You have several hours. Unlike the other overnight runs, this one is less about fixing things and more about discovering opportunities — competitive gaps, feature ideas, and architectural possibilities the team may not have considered.

This is a read-only analysis. Do not create a branch or modify any code.

## Your Mission

### Phase 1: Product Understanding

Before you can identify opportunities, you need to deeply understand what this product does and who it serves.

**Step 1: Reverse-engineer the product**
By reading the codebase, answer:
- What is this product? What problem does it solve?
- Who are the target users? (Infer from UI copy, feature set, data models, onboarding flows)
- What are the core features? List every distinct capability.
- What is the current user journey? (Sign up → onboarding → core usage → retention/engagement loops)
- What data does the product collect and how is it used?
- What integrations exist? (Third-party services, APIs, webhooks)
- What is the monetization model? (Infer from billing code, subscription logic, feature gating)
- What features are gated behind plans/tiers? What's free vs. paid?

**Step 2: Identify the product's strengths**
Based on the codebase:
- What features appear most mature and well-built?
- Where has the most engineering investment gone?
- What seems to be the core differentiator?

**Step 3: Identify the product's weaknesses**
Based on the codebase:
- What features feel half-built or abandoned? (Incomplete code, unused models, feature flags that are off)
- Where is the UX weakest?
- What capabilities are missing that users would likely expect?
- What data is collected but not used to provide value back to users?

### Phase 2: Competitive & Market Research

**Step 1: Identify competitors**
Based on your understanding of the product:
- Search the web for direct competitors (products solving the same problem)
- Search for indirect competitors (different approaches to the same underlying need)
- Search for adjacent products (solve a related problem, might expand into this space)

**Step 2: Analyze competitor features**
For the top 5-8 competitors:
- What features do they offer that this product doesn't?
- What features does this product have that they don't?
- How do they position themselves? (Read their marketing pages, pricing pages)
- What do their users complain about? (Search for reviews, Reddit threads, G2/Capterra reviews, Twitter complaints)
- What are they charging? How does their pricing model compare?
- What recent features have they launched? (Check their changelogs, blogs, social media)

**Step 3: Identify market trends**
- Search for recent industry analysis, trend reports, or thought leadership in this product's space
- What capabilities are becoming table stakes?
- What emerging technologies are competitors adopting?
- What are users in this space increasingly expecting?

### Phase 3: Feature Opportunity Analysis

**Step 1: Gap analysis**
Based on Phases 1 and 2, identify features this product is missing:

For each missing feature:
- What is it?
- Which competitors have it?
- How important is it to users? (Based on competitor reviews, user complaints, market trends)
- How hard would it be to build? (Based on the existing codebase architecture — is the foundation there, or would it require significant new infrastructure?)
- Priority recommendation: critical / high / medium / nice-to-have

**Step 2: Untapped data opportunities**
Look at the data the product already collects:
- What analytics or insights could be derived from existing data that aren't being surfaced to users?
- What personalization opportunities exist based on user behavior data?
- What automation could be triggered by patterns in the data?
- What reporting/dashboards could be built from existing data?

**Step 3: Integration opportunities**
- What third-party services would complement this product?
- What integration points exist in the codebase that aren't being used to their full potential?
- What workflows would benefit from connecting to other tools (Slack, email, calendar, CRM, etc.)?

**Step 4: UX improvement opportunities**
Based on your codebase analysis:
- Where are users likely experiencing friction? (Complex forms, multi-step processes, confusing navigation)
- What tasks take too many steps that could be simplified?
- Where could AI/automation reduce manual work for users?
- What onboarding improvements would help new users get value faster?

### Phase 4: Architectural Opportunity Analysis

**Step 1: Scalability assessment**
- What would break first if the user base 10x'd?
- Are there architectural bottlenecks that would need to be addressed?
- What's the current approach to background jobs, queuing, caching?
- Is the database schema ready for growth? (Missing indexes, inefficient queries, tables that would get too large)

**Step 2: Platform/extensibility opportunities**
- Could this product benefit from a plugin/extension system?
- Could parts of this product be exposed as an API for third-party developers?
- Is there a marketplace or ecosystem opportunity?
- Could the product support white-labeling or multi-tenancy?

**Step 3: AI integration opportunities**
Look at the codebase through an AI lens:
- What manual processes could be augmented or automated with AI?
- Where could AI improve the user experience? (Smart defaults, auto-categorization, natural language search, recommendations, content generation)
- What data does the product have that could train useful models?
- What would an "AI-first" version of this product look like?

## Output Requirements

Create the `audit-reports/` directory in the project root if it doesn't already exist. Save the report as `audit-reports/44_STRATEGIC_DISCOVERY_REPORT_[run-number]_[date]_[time in user's local time].md` (e.g., `44_STRATEGIC_DISCOVERY_REPORT_01_2026-02-16_2129.md`). Increment the run number based on any existing reports with the same name prefix in that folder.

### Report Structure

1. **Product Profile**
- What the product is and does (as understood from the codebase)
- Target users
- Core features inventory
- Strengths and weaknesses
- Current monetization model

2. **Competitive Landscape**
- Competitor matrix: table with | Competitor | Overlap | Unique Strengths | Weaknesses | Pricing |
- What competitors are doing that this product isn't
- What this product does better than competitors
- Market trends affecting this space

3. **Feature Opportunities**
Prioritized list, for each:
- Feature description
- User need it addresses
- Competitive context (who has it, is it table stakes?)
- Implementation complexity (based on current architecture)
- Priority: Critical / High / Medium / Nice-to-have
- Estimated effort: Small (days) / Medium (weeks) / Large (months)

4. **Untapped Data & Intelligence**
- Data currently collected but underutilized
- Analytics/insights that could be surfaced
- Personalization opportunities
- Automation triggers

5. **Integration & Ecosystem Opportunities**
- Third-party integrations worth building
- API/platform possibilities
- Ecosystem plays

6. **AI Integration Roadmap**
- AI opportunities ranked by impact and feasibility
- What data assets exist to support AI features
- Quick AI wins vs. larger AI initiatives

7. **Architectural Recommendations**
- Scalability concerns and suggested remediation
- Platform/extensibility opportunities
- Technical investments that would unlock future product capabilities

8. **Recommended Roadmap**
- Synthesize all findings into a suggested priority order
- Group into: This quarter / Next quarter / Future
- Note dependencies between items

## Rules
- This is READ-ONLY. Do not modify any code.
- Use web search to research competitors, market trends, and user feedback
- Be honest about uncertainty — mark items as "needs validation" when you're inferring rather than knowing
- Don't just list every possible feature — prioritize ruthlessly based on user impact and implementation feasibility
- When assessing implementation complexity, be specific about what exists in the codebase vs. what would need to be built
- Ground your recommendations in evidence (competitor data, user feedback, market trends, codebase analysis) — not just opinions
- Consider both quick wins and strategic bets
- Think like a product manager AND an engineer — the best opportunities are at the intersection of user value and technical feasibility
- You have all night. Do thorough research.
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
