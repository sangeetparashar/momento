# Momento - Decisions Log

## Build Process Decisions

### 1. Three-Agent Parallel Build
**Decision:** Split the build into 3 parallel agents with isolated file zones.
**Rationale:** Prevents merge conflicts, maximizes throughput, each agent has full context of its zone.
**Agent zones:**
- Agent A: `apps/api/` (backend)
- Agent B: `apps/mobile/src/` foundation (config, providers, styles, hooks, services, utils)
- Agent C: `apps/mobile/src/components/features/` + `apps/mobile/app/` (UI)
**Result:** All 3 agents produced compatible output. Agent C proactively read Agent B's files to align APIs.

### 2. Scaffold-First Approach
**Decision:** Build everything with placeholder env vars, no services configured.
**Rationale:** User hasn't set up any external services yet. Code should be structurally complete and ready to wire up when services are provisioned.
**Impact:** All lib modules gracefully handle missing credentials at import time.

### 3. Open to Improvements
**Decision:** Deviate from docs where modern best practices dictate.
**Changes made:**
- Used `const { id } = await params` (Next.js 14 async params)
- Pinned Expo SDK 52 with React Native 0.76.9
- Added `react-native-svg` for chart rendering (not in original docs)
- Used `expo-image` consistently (original docs mixed it with RN Image)
- Added `uploadWithPresignedUrl` convenience method on API service

### 4. Shared Package as Raw TypeScript
**Decision:** `"main": "./src/index.ts"` - consumed as raw TS, no build step.
**Rationale:** Both Next.js and Expo transpile TS natively. Avoids build coordination.
**Tradeoff:** Won't work with tools expecting compiled JS. Fine for internal monorepo.

### 5. PostGIS Outside Prisma
**Decision:** Geography column, indexes, and triggers live in raw SQL migration, not Prisma schema.
**Rationale:** Prisma doesn't support PostGIS natively. Raw SQL + triggers syncing lat/lng to geography is the standard workaround.
**Impact:** All spatial queries use `$queryRaw`. Prisma schema has `locationLat`/`locationLng` Float columns that triggers sync to the geography column.

### 6. Cursor-Based Pagination Everywhere
**Decision:** All list endpoints use `{ cursor, limit }` params, return `{ items, nextCursor, hasMore }`.
**Rationale:** More performant than offset pagination for infinite scroll. No skipped/duplicate items when data changes.

### 7. Denormalized Counts
**Decision:** `followerCount`, `likeCount`, `commentCount`, `postCount` stored directly on models, updated in transactions.
**Rationale:** Avoids COUNT queries on every read. Transactional updates ensure consistency.
**Tradeoff:** Slightly more complex write logic, but dramatically better read performance.

### 8. Optimistic Updates with Rollback
**Decision:** All mutation hooks (like, follow, profile update) apply optimistic updates and rollback on error.
**Rationale:** Instant UI feedback. If the API call fails, the UI reverts to the previous state automatically via React Query's `onMutate`/`onError` pattern.

### 9. Auto-Expanding Feed Radius
**Decision:** `useFeed` hook tries 5km, then 10km, 25km, 50km, 100km if fewer than 3 posts found.
**Rationale:** Sparse areas would show empty feeds. Auto-expansion ensures content is always shown.
**Tradeoff:** Multiple API calls in sparse areas. Mitigated by stopping expansion on subsequent pages (cursor-based).

### 10. Dark Theme Only
**Decision:** No light theme. All styles use dark tokens directly.
**Rationale:** The app's brand identity is dark-mode (crypto/finance aesthetic). Simplifies the style system.

### 11. Dummy Data Strategy
**Decision:** Token prices, market caps, portfolio charts, trending rankings all use dummy data.
**Real data:** Auth, wallets, token holdings list, posts, profiles, location, KYC, push notifications.
**Phase 2 will add:** Price oracle (Jupiter/Birdeye), real-time charts, swap execution.

### 12. No Admin Dashboard
**Decision:** Use Supabase Dashboard for admin operations (approve creators, review KYC).
**Rationale:** Building an admin UI adds significant scope with no user-facing benefit.

### 13. SKIP_KYC Dev Mode
**Decision:** `SKIP_KYC=true` env var instantly grants creator status without Veriff.
**Rationale:** Veriff costs $2/verification. Dev iteration shouldn't incur costs.

## Technical Tradeoffs Accepted

| Tradeoff | Accepted Risk | Mitigation |
|----------|---------------|------------|
| Feed caches 100 posts, paginates in-memory | Memory waste for deep pages | MVP volume is low |
| `redis.keys('feed:*')` for cache invalidation | O(N) at scale | Use hash sets in production |
| No rate limiting | Abuse risk | Add before public launch |
| No error boundaries | Crash on unhandled errors | Add React error boundary in Phase 2 |
| No loading skeletons | Blank screen during load | Add shimmer placeholders later |
| Explore uses feed data, not nearby API | Doesn't show all nearby creators | Wire up `/creators/nearby` endpoint |
| No offline support | App unusable without internet | React Query has offline capability |
| No image compression | Large uploads | Add `expo-image-manipulator` later |
| Portfolio chart uses deterministic random data | Not real prices | Phase 2 price oracle |
