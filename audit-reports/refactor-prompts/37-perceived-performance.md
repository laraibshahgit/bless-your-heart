# Perceived Performance Optimization

Run an overnight pass to make the app *feel* instant. Real speed gains are ideal, but perceived speed is the goal. A 500ms operation that feels instant beats a 200ms one the user waits for.

Branch: `snappy-[date]`. Commit format: `perf: [what] in [where]`

## Global Rules

- Run tests after every change.
- DO NOT change business logic — only *when/how* data loads and how the UI responds.
- DO NOT add dependencies unless the project has equivalents; document as recommendations instead.
- DO NOT ship optimistic updates that can't be safely rolled back on error.
- Be honest about real vs. perceived speed gains in the report.
- Prioritize by frequency × impact. Critical path > settings page.

---

## Phase 1: Critical Path Mapping

### 1. Identify top 5–10 user journeys
App startup, auth, main dashboard, core CRUD workflow, navigation between sections, search/filtering, write actions.

### 2. Trace the loading waterfall for each
For each journey document: trigger → requests (order, serial vs. parallel) → what blocks rendering → what user sees while waiting → total time to interactive.

### 3. Rank waits by impact
**Priority = Duration × Frequency × Emptiness × Intent.** Blank screen + high frequency + user just clicked = fix first.

---

## Phase 2: Prefetching & Preloading

### Route-level prefetching
- **Hover/focus**: Start fetching destination data on link hover (~200ms head start).
- **Predictive**: After login → prefetch dashboard. After create → prefetch detail view. After list → prefetch top item. Paginated lists → prefetch next page.
- **Router-level**: Fetch data in parallel with code-splitting chunk load (loader pattern > useEffect pattern).
- Check if data-fetching library prefetch utilities (React Query, SWR, Apollo) exist but aren't used.

### Asset preloading
- Images below fold / next screen: `<link rel="preload">` or `new Image().src`
- Fonts: preload in `<head>` to avoid FOIT/FOUT
- Code chunks: `<link rel="prefetch">` or idle `import()` for likely-next routes
- Configs/feature flags: fetch early in boot, not lazily on first use

### Cache warming
- Warm caches on startup for commonly accessed data.
- After writes, update cache immediately (or invalidate + refetch).
- Use stale-while-revalidate where appropriate.

---

## Phase 3: Optimistic UI & Instant Feedback

### Audit every mutation
For each create/update/delete/toggle: Is the outcome predictable? What's the failure rate? Can it roll back cleanly?

### Good candidates for optimistic updates
Toggles, list adds/removes, text field saves, reordering, simple status transitions.

### Bad candidates
Payments, complex server validation, actions with unpredictable side effects (emails, webhooks).

### Pattern
```
// Optimistic: update UI instantly, rollback on error
const prev = item.isFavorite;
setItem({ ...item, isFavorite: !prev });
try { await api.toggleFavorite(id); }
catch { setItem({ ...item, isFavorite: prev }); showErrorToast(); }
```

Check if the data-fetching library's built-in optimistic mechanisms are being used.

### Instant feedback even without optimistic updates
Every click/tap should produce immediate visual response: button pressed state, skeleton appearance, item fade-out on delete, shell render on navigation.

---

## Phase 4: Waterfall Elimination

### Find sequential chains that should be parallel
```
// BAD: 650ms serial
const user = await fetchUser();
const prefs = await fetchPreferences(user.id);
const dashboard = await fetchDashboard(user.id);

// GOOD: 300ms parallel (prefs + dashboard don't depend on each other)
const user = await fetchUser();
const [prefs, dashboard] = await Promise.all([
fetchPreferences(user.id), fetchDashboard(user.id)
]);
```

**Common waterfalls**: nested component fetches, config → user → data chains, list → per-item detail fetches, auth → route data → component data.

### Fix
- Lift fetching to route level and fire in parallel.
- Use `Promise.all`/`Promise.allSettled` for independent requests.
- Render partially with early data; show skeletons for slow data.
- Backend: parallelize independent DB/API calls; split slow sub-queries into separate lazy endpoints.

---

## Phase 5: Rendering & Visual Continuity

### Loading state hierarchy (worst → best)
Blank screen → full-page spinner → skeleton screen → stale-while-revalidate

**Fix**: Every page renders its shell instantly. Replace spinners with skeletons or stale content.

### Progressive rendering
Don't gate entire pages on slowest data. Render fast sections immediately, skeleton the rest.

### Transitions
- Fix layout shifts: skeleton dimensions must match real content.
- Route transitions: show destination shell immediately, not blank screen.
- List mutations: animate add/remove, don't pop.
- Above-the-fold first; lazy-load below-fold with intersection observer.
- Large lists (50+ items): consider virtual scrolling.

---

## Phase 6: Caching & Network

- **HTTP caching**: Proper `Cache-Control` headers? Static assets with content-hash + long TTL?
- **Client caching**: `staleTime`/`cacheTime` configured? (Default 0 = always refetch.) Set appropriately: user profile ~5min, catalog ~1min, live feed ~10s.
- **Deduplication**: Multiple components requesting same data → one request or many?
- **Batching**: Can many small requests become one batch request?
- **Cache invalidation**: Do writes update all views displaying that resource?

---

## Phase 7: Startup Speed

### Audit boot sequence
HTML → CSS (render-blocking?) → JS (bundle size?) → framework hydration → data fetches → first paint → interactive.

### Common blockers
Render-blocking scripts (missing `async`/`defer`), large unsplit bundles, sequential boot chains (auth → config → data → render), eager non-critical init (analytics, chat widgets).

### Fix
- Defer non-critical scripts until after first interactive render.
- Inline critical CSS.
- Parallelize boot: session + config + page data simultaneously.
- Consider rendering app shell before auth completes.

---

## Phase 8: Micro-Interactions

- **Click/tap feedback**: Eliminate delays. All interactive elements need `:active`/`:hover` states. 150ms ease-out transitions on state changes.
- **Animation as perception**: Fade/slide content in after load. Animate modals/drawers open (~200ms). Prefer determinate progress bars over indeterminate spinners.
- **Debounce/throttle**: Search: 150–300ms debounce (not 500ms+). Scroll/resize handlers: throttled/rAF. Auto-save: debounced, no conflict with manual save.
- **Forms**: Instant confirmation after submit (toast). Inline validation as user types. Re-enable on failure. Prefetch next step in multi-step forms.

---

## Output

Save to `audit-reports/37_PERCEIVED_PERFORMANCE_REPORT_[run-number]_[date]_[time in user's local time].md`.

### Report Sections
1. **Executive Summary** — Snappiness rating (sluggish → instant-feeling), worst waits, changes made.
2. **Critical Path Analysis** — Waterfall diagrams, per-journey wait times, ranked by impact.
3. **Prefetching** — Opportunities, implementations, estimated time saved.
4. **Optimistic UI** — Mutations audited, which got optimistic treatment, which were too risky.
5. **Waterfall Elimination** — Before/after for parallelized chains, time saved.
6. **Rendering** — Loading state upgrades, progressive rendering, layout shift fixes.
7. **Caching** — Strategy per endpoint, deduplication fixes, header improvements.
8. **Startup** — Boot timeline before/after, blockers removed.
9. **Micro-Interactions** — Responsiveness, animation, debounce, form UX fixes.
10. **Measurements** — Before/after per journey; distinguish real vs. perceived gains.
11. **Recommendations** — Priority-ordered remaining work.

### Chat Summary (required)
Print directly in conversation:

1. **Status** — One sentence: what you did, test status.
2. **Key Findings** — Specific, actionable bullets with user impact. (e.g., "Dashboard loads 4 API calls sequentially = 1.2s. Parallelizing → ~400ms.")
3. **Changes Made** — What was modified. Skip if read-only run.
4. **Recommendations** (if any) — Table:

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| | ≤10 words | What improves | Low–Critical | Yes/Probably/If time | 1–3 sentences |

Order by risk descending. Be honest — not everything is worth the engineering time.

5. **Report Location** — Full file path.
