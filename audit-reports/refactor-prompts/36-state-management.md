# State Management Audit

Branch: `state-audit-[date]`. Map everything before fixing anything. Run tests after every change. Commit format: `fix: [state issue] in [module]`.

**Do NOT**: change business logic/API contracts, introduce new state libraries, refactor working patterns, or combine fixes into single commits.

---

## Phase 1: State Source Inventory

### Catalog every state container

Search the entire codebase for where state lives:

- **Global stores** — Redux, Zustand, MobX, Vuex/Pinia, Recoil/Jotai, Context, Svelte stores, signals. Document: what data, subscribers, update mechanism, navigation persistence.
- **Server cache** — React Query, SWR, Apollo, RTK Query, urql. Document: cache keys, TTLs, invalidation strategy, whether mutations update cache or just refetch.
- **Component-local state** — `useState`, `useReducer`, `this.state`, Vue `ref()`/`reactive()`. Focus on state that *shouldn't* be local: shared data, state lost on unmount that shouldn't be, duplicates of global/server state.
- **URL state** — Query params, path params, hash. What's encoded? What *should* be (filters, pagination, tabs, search, sort)?
- **Browser storage** — localStorage, sessionStorage, IndexedDB, cookies. Document: data, read/write timing, TTL, unbounded growth, encryption for sensitive data.
- **Form state** — Controlled vs uncontrolled, form library config, multi-step persistence, draft preservation on navigation.
- **Derived/computed state** — Computed on read (selectors, `useMemo`) vs eagerly stored (duplication in disguise)?
- **Implicit state** — Untracked DOM state: scroll position, focus, `<details>` open/closed, caret position.

### Build a state map

For every meaningful piece of data, document:

| Data | Canonical Source | Other Copies | Sync Mechanism | Stale Window | Survives Refresh? | Should Survive? |
|------|-----------------|--------------|----------------|-------------|-------------------|-----------------|

### Classify state by lifecycle

Label each piece of state: **Session** (survives nav, not tab close), **Page** (resets on nav away), **Transient** (resets after interaction), **Persistent** (survives sessions), **Shared** (consistent across components/routes). Flag every mismatch between actual and correct lifecycle.

---

## Phase 2: Duplicated State

Duplicated state is the #1 source of "sometimes shows wrong data" bugs.

### Find duplicates

**Exact**: same data in server cache + global store, parent props + child fetch, URL params + component state, localStorage + store, overlapping store slices, form library + component state, server cache + manual loading/error state.

**Semantic**: list cache + individual item cache, normalized + denormalized copies, aggregates stored separately from source data (cart total vs cart items), permissions in auth token + separate endpoint.

### Fix safe duplications

Delete the copy; have consumers read from the canonical source. If the copy exists for performance, use a memoized selector. If for access, lift access via context/hooks. If server cache vs global store: server data → server cache library, client-only data → global store.

For complex cases requiring architectural decisions: document only, don't fix overnight.

---

## Phase 3: Stale State

### Identify stale vectors

- **Server cache**: Missing mutation → invalidation links? Appropriate `staleTime`/refetch settings? Multi-tab consistency? Optimistic update rollback on failure?
- **Global store**: Updated on every relevant API response or only initial fetch? State cleared on logout? Session expiry awareness?
- **URL state**: Back/forward sync? Deep link initialization? Bidirectional URL ↔ UI sync?
- **Browser storage**: Missing TTL/version key? Stale auth tokens? Schema mismatches after app updates?

### Find specific bugs

Construct exact reproduction scenarios with numbered steps ending in the bug. Rate each: likelihood × visibility × impact.

### Fix

Add missing query invalidations, store updates, URL sync, staleTime config, logout cleanup, storage version keys. Err toward correctness over performance.

---

## Phase 4: Missing State Handling

Every async operation has four states: **idle, loading, error, success (data or empty)**.

### Audit each

**Loading**: Indicator exists? Right granularity (not full-page spinner for sidebar)? Grace period before showing? Independent per fetch? Stale-while-revalidate on refetch? Timeout for hung requests?

**Error**: Error state exists (not infinite loading)? Helpful message? Retry mechanism? Right scope (failed sidebar ≠ full page error)? App still usable? Auto-recovery? Error boundaries at appropriate levels?

**Empty**: Message shown? "No data yet" vs "no results for filter" distinguished? Loading vs empty distinguished (no flash of "No items" before data)?

**Optimistic rollback**: Server rejection reverts UI? User notified? Exact prior state restored? Handles navigation-away before error?

### Fix

Add missing loading/error/empty states matching existing patterns. Fix error boundaries. Fix optimistic rollback bugs.

---

## Phase 5: State Lifecycle Bugs

### Doesn't survive when it should

- **Refresh**: Long form inputs, filters/pagination (→ URL params), auth token.
- **Navigation**: Back button restoring scroll, accordions, filters.
- **Tab switch**: Mobile app suspension, `visibilitychange` refetches resetting state.

### Survives when it shouldn't

- **Logout**: ALL user-specific state cleared? (stores, cache, storage, cookies, service worker, singletons). Common bug: User B sees User A's data briefly.
- **Navigation**: `/entity/123` → `/entity/456` shows old data (missing `key` prop or query invalidation).
- **Deletion**: Removed from every list, count, cache, derived state?
- **Permission change**: How long until UI reflects server-side changes?

### Hydration mismatches (SSR only)

Server/client render differences from: missing user context, timezone/locale, browser APIs, random/time values. Check for `typeof window` guards causing different output, `useEffect`-only state flashes, `suppressHydrationWarning` hiding real problems. Fix without changing final rendered output.

### Fix

Add route `key` props, unmount/logout cleanup, URL state sync, hydration fixes, sessionStorage for form drafts.

---

## Phase 6: Architecture Assessment (Document only, don't rewrite)

- **Server vs client state separation**: Flag server data manually managed in Redux/Zustand with loading/error/success actions instead of living in a server cache library. Document migration path.
- **State proximity**: Flag over-globalized state (global but used by 1-2 components), under-globalized (prop drilling 4+ levels), over-scoped context providers.
- **Re-render hot spots**: Inline object/array context values, non-granular store subscriptions, missing memo, unmemoized derived state. Focus on lists, expensive components, interactive paths.

---

## Phase 7: Edge Cases (Document, don't fix unless trivial)

**Multi-tab**: Login/logout sync, data edits visible across tabs, concurrent edits (conflict detection?).

**Network interruption**: Mid-mutation offline, offline navigation with cached pages, online recovery/retry.

**Session expiry**: Mid-session token expiry handling, token refresh race deduplication, post-reauth state restoration.

Document: scenario, current behavior, expected behavior, user impact, fix complexity.

---

## Output

Save as `audit-reports/36_STATE_MANAGEMENT_REPORT_[run-number]_[date]_[time in user's local time].md`.

### Report sections

1. **Executive Summary** — Health rating (chaotic/fragile/adequate/solid/excellent), counts of findings and fixes.
2. **State Source Map** — Complete inventory table.
3. **Duplicated State** — Each duplication with divergence risk, fix status.
4. **Stale State Bugs** — Each with trigger, duration, impact, fix status.
5. **Missing UI States** — Gaps in loading/error/empty handling.
6. **Lifecycle Bugs** — State persisting/vanishing incorrectly.
7. **Hydration Mismatches** (SSR only).
8. **Edge Cases** — Multi-tab, offline, session expiry behavior.
9. **Re-render Hot Spots**.
10. **Architecture Assessment**.
11. **Fixes Applied** — File, issue, fix, tests pass, commit.
12. **Recommendations** — Priority-ordered.

### Chat summary (always print)

1. **Status**: One sentence — what you did, duration, tests passing.
2. **Key Findings**: Specific, actionable bullets with severity. Lead with impact, not vagueness.
3. **Changes Made** (if any).
4. **Recommendations** table (only if warranted):

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|

Ordered by risk descending. Be honest about marginal recommendations.

5. **Report Location**: Full path.
