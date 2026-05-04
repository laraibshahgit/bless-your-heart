# Cost & Resource Optimization

Overnight audit to find every place the product wastes money — over-provisioned infra, unused services, redundant API calls, unbounded storage, and missing cost controls.

**READ-ONLY for infrastructure.** Code-level fixes (redundant calls, missing caching, wasteful queries) go on branch `cost-optimization-[date]`. Run tests after every change.

---

## Global Rules

- Be specific: "$50-150/month based on [reasoning]", not "this could save money." State assumptions.
- Distinguish **high-confidence savings** (unused resources, redundant calls) from **verify-with-metrics savings** (right-sizing, reserved instances).
- Never recommend cost cuts that sacrifice reliability without calling out the tradeoff.
- When you find waste, look for the same pattern elsewhere. Waste clusters.
- Use web search to verify current pricing. Don't nickel-and-dime — focus on material waste.
- You have all night. Be thorough.

---

## Phase 1: Billable Service Inventory

### Map every external service
Search the entire codebase (source, config, IaC, Docker, CI/CD, `.env.example`, docs) for every billable service. For each, document: service name/provider, purpose (read the code), billing model, usage pattern (hot path vs. batch vs. rare), config location, SDK client initialization (shared vs. multiple instances), and tier/plan indicators.

### Identify unused or underused services
- Services in config but never called in code
- Services only in dead/commented-out code or behind permanently-off feature flags
- SDK initialized but only a fraction of capabilities used
- Overlapping services (two email providers, two analytics platforms)
- Dev/test services still configured in production

### Identify missing cost controls
For each service: rate limits? Budget caps? Usage alerts? Quota monitoring? Free-tier threshold awareness?

---

## Phase 2: Infrastructure Resource Analysis

### Infrastructure-as-Code (Terraform, CloudFormation, Pulumi, K8s, Docker Compose)

Analyze every provisioned resource across these categories:

- **Compute**: Instance sizing vs. workload, auto-scaling min/max, Lambda memory/timeout over-provisioning, container resource requests vs. actual needs, always-on resources that could be scheduled
- **Database**: Instance size, unused read replicas (provisioned but not referenced in code), unnecessary Multi-AZ, provisioned IOPS vs. GP3, excessive backup retention, unbounded storage auto-scaling
- **Storage**: Missing lifecycle policies, versioning without cleanup, no multipart upload abort policy, unbounded log buckets, CDN cache effectiveness
- **Networking**: NAT Gateway costs ($0.045/GB), unnecessary cross-AZ/region transfer, unneeded load balancers, unattached Elastic IPs
- **Cache/Search**: Instance sizing vs. dataset size, unused cache nodes, cluster mode vs. standalone, search index lifecycle management
- **CDN**: Cache-control headers set correctly? Price class matches user geography?

### Docker
Base image bloat, missing multi-stage builds, dev dependencies in production images.

### CI/CD
Oversized runners for simple tasks, poor build caching, artifact retention policies, test execution efficiency, over-frequent scheduled pipelines.

---

## Phase 3: Application-Level Cost Patterns

### Redundant API calls
Trace every external call: duplicate calls per request? Cacheable data re-fetched every time? Batch endpoints available but not used? Polling instead of webhooks? Data discarded and re-fetched instead of passed through?

**Calculate**: calls_per_request × requests_per_day × cost_per_call = daily waste.

### Database query cost
Full table scans vs. indexed lookups, `SELECT *` fetching unneeded blobs, reads hitting primary instead of replicas, analytics on production DB, expensive aggregations recomputed per-request, N+1 queries, full-text search hitting DB when search index exists.

### Storage patterns
Unlimited upload sizes, permanently stored generated files that could expire, unclean temp files, logs on expensive tiers, blobs in DB instead of object storage.

### Serverless patterns
Unnecessary provisioned concurrency, long-running functions better suited to containers, memory over-allocation, function chaining costs, DynamoDB on-demand vs. provisioned mismatch, API Gateway where Lambda URLs suffice.

### Third-party tier optimization
Usage near tier thresholds? Premium features paid but unused? Cheaper alternatives for features actually used? Annual billing discounts missed? Non-prod on paid tiers unnecessarily?

### Fix code-level waste (on branch)
Cache repeated identical API calls, replace individual calls with batch calls, add `Cache-Control` headers, remove duplicate calls, add early returns before expensive operations, pass fetched data through call chains. Run tests, commit each batch.

---

## Phase 4: Data Transfer & Egress

Map data movement (client↔server, service↔service, server→third-party, DB→app). Then identify reduction opportunities: response compression (gzip/brotli), pagination on list endpoints, GraphQL depth limiting, CDN caching, production log verbosity, metrics cardinality.

---

## Phase 5: Environment & Development Cost

- Non-prod environments running production-scale infra? Always-on when used only business hours? Cleaned up after merge?
- Paid tool seats for departed team members? Expensive tools used by one person billed to the whole team?

---

## Phase 6: Cost Monitoring & Governance

Assess: budget alerts, cost tagging strategy, per-feature cost attribution, anomaly detection, governance (can any dev provision expensive resources without review?), auto-scaling spending limits, third-party usage spike alerts. Recommend specific monitoring based on services found.

---

## Output

Save to `audit-reports/26_COST_OPTIMIZATION_REPORT_[run-number]_[date]_[time in user's local time].md`.

### Report Structure

1. **Executive Summary** — Total estimated monthly waste (range), confidence, top 5 savings, fixes implemented
2. **Billable Service Inventory** — Table: Service | Provider | Purpose | Billing Model | Usage Pattern | Est. Monthly Cost | Issues
3. **Infrastructure Analysis** — Tables per category (Compute, Database, Storage, Networking, Cache/Search, CDN, Containers, CI/CD) with current config, recommendation, estimated savings, confidence
4. **Application-Level Waste** — Redundant API calls, DB cost patterns, storage patterns, serverless, third-party tier optimization
5. **Data Transfer & Egress** — Patterns, volumes, recommendations
6. **Non-Production Costs** — Environment inventory with parity/always-on/cleanup assessment
7. **Code-Level Fixes Implemented** — File | Change | Impact | Tests Pass?
8. **Cost Monitoring Assessment** — Visibility, tagging, alerts, governance gaps
9. **Savings Roadmap** — Priority-ordered table: Opportunity | Est. Savings | Effort | Risk | Confidence | Details. Grouped into Immediate / This Month / This Quarter / Ongoing
10. **Assumptions & Verification Needed** — Every estimate depending on unseen data, specific questions for the team

### Chat Summary (always print in conversation)

1. **Status** — One sentence: what you did, tests passing?
2. **Key Findings** — Biggest savings with dollar estimates and confidence
3. **Changes Made** — Code fixes applied (skip if none)
4. **Recommendations** — Table if warranted: # | Recommendation | Est. Savings | Effort | Risk | Worth Doing? | Details. If total waste < $50/month, say so.
5. **Verification Checklist** — Metrics/billing data the team should check
6. **Report Location** — File path

---

## Rules Summary

- Branch for code changes only. Run tests after every change.
- DO NOT modify infrastructure, cloud resources, env vars, or provisioning configs.
- DO NOT downgrade tiers or remove resources — only recommend.
- Always include dollar estimates with stated assumptions.
- Never compromise reliability without explicit tradeoff disclosure.
- When in doubt, document rather than change.
