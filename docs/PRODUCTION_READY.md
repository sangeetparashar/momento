# Momento — Production Readiness & Scalability Audit

## Context

The Momento API and mobile app are functionally complete (Phase 4) with 15 seeded Toronto creators and 450 posts. Before going live with real users, we need to address **critical gaps in concurrency safety, rate limiting, caching efficiency, mobile bandwidth, offline handling, and deployment configuration**. This audit documents every issue found across the API backend and mobile app, with industry-standard fixes and exact file locations.

---

## PART 1: API Backend Issues

### 1.1 CRITICAL — Race Condition: User Creation on First Login

**File:** `apps/api/lib/auth.ts` (lines 59-95)

**Problem:** Two concurrent requests with the same `privyUserId` both pass the `findUnique()` check, both call Privy API, and the second `create()` fails with a unique constraint violation → 500 error to user.

**Industry standard fix:** Use Prisma's `upsert` instead of check-then-create:
```ts
const user = await prisma.user.upsert({
  where: { privyUserId },
  update: {},  // no-op if exists
  create: { privyUserId, walletAddress, email },
  select: { id, privyUserId, walletAddress, role, isAdmin },
});
```
This is atomic at the database level — PostgreSQL handles the race.

---

### 1.2 CRITICAL — Post Creation: Count Not in Transaction

**File:** `apps/api/app/api/posts/route.ts` (lines 45 & 74-77)

**Problem:** Post is created at line 45, then `postCount` is incremented separately at line 74. If the increment fails, post exists but count is wrong. Notification fires before count is confirmed.

**Fix:** Wrap in `prisma.$transaction()`:
```ts
const [post] = await prisma.$transaction([
  prisma.post.create({ data: { ... }, include: { creator: {...} } }),
  prisma.user.update({ where: { id: user.id }, data: { postCount: { increment: 1 } } }),
]);
```
Move notification call AFTER transaction succeeds.

---

### 1.3 CRITICAL — No Rate Limiting on Any Endpoint

**Problem:** Zero rate limiting detected across all 17 endpoints. An authenticated user can:
- Like/unlike the same post 1000x/second
- Create posts, comments, KYC applications without throttle
- Exhaust Veriff API quota ($2/verification)

**Industry standard fix:** Add rate limiting middleware using Upstash Ratelimit (already have Upstash Redis):
```
pnpm add @upstash/ratelimit
```

Recommended limits:
| Endpoint Group | Limit | Window |
|---------------|-------|--------|
| Auth (user creation) | 5 req | per minute |
| Feed / Read endpoints | 60 req | per minute |
| Like / Follow toggles | 30 req | per minute |
| Post creation | 5 req | per hour |
| Comment creation | 20 req | per minute |
| KYC application | 1 req | per hour |
| Upload presign | 10 req | per minute |
| Location update | 12 req | per hour |

**Implementation:** Create `apps/api/lib/ratelimit.ts` with per-endpoint limiters, apply in each route's handler before business logic.

---

### 1.4 HIGH — Like/Follow TOCTOU Race Conditions

**Files:**
- `apps/api/app/api/posts/[id]/like/route.ts` (lines 27-67)
- `apps/api/app/api/creators/[id]/follow/route.ts` (lines 36-83)

**Problem:** Check for existing record happens OUTSIDE the transaction. Two concurrent toggles both pass the check, both try to create → one fails with unique constraint → 500 error.

**Fix:** Catch the unique constraint violation and handle gracefully:
```ts
try {
  await prisma.$transaction([...]);
} catch (e) {
  if (e.code === 'P2002') { // Prisma unique constraint violation
    // Re-read current state and return it
    const current = await prisma.like.findUnique({ where: { userId_postId: {...} } });
    return NextResponse.json({ success: true, data: { liked: !!current, likeCount: post.likeCount } });
  }
  throw e;
}
```

---

### 1.5 HIGH — Counter Loss Under Concurrent Writes

**Problem:** PostgreSQL READ_COMMITTED isolation allows lost updates when two transactions concurrently increment the same counter. Prisma's `increment(1)` compiles to `SET column = column + 1` which IS atomic at the row level (row-level lock), but if the transactions also read the count to return it, the returned value may be stale.

**Fix:** After transaction, re-read the post/user to get the actual count:
```ts
const updatedPost = await prisma.post.findUnique({ where: { id: postId }, select: { likeCount: true } });
return NextResponse.json({ success: true, data: { liked: true, likeCount: updatedPost.likeCount } });
```

---

### 1.6 HIGH — Feed N+1 Query for User Likes

**File:** `apps/api/app/api/feed/route.ts` (lines 131-137)

**Problem:** After fetching 20 posts via raw SQL, a SEPARATE Prisma query fetches likes for all postIds. This is 2 DB round-trips per feed request.

**Fix:** Join likes into the main raw SQL query:
```sql
LEFT JOIN "likes" l ON l."postId" = p."id" AND l."userId" = $userId
```
Add `l."id" IS NOT NULL as "isLiked"` to the SELECT. Eliminates the second query entirely.

---

### 1.7 HIGH — KYC Application Double-Submit

**File:** `apps/api/app/api/creators/apply/route.ts` (lines 32-43, 88-104)

**Problem:** TOCTOU window allows two concurrent requests to both create Veriff sessions ($2 each) and duplicate KYC records.

**Fix:** Use `prisma.user.update()` with a WHERE clause that includes the current status:
```ts
const updated = await prisma.user.updateMany({
  where: { id: user.id, kycStatus: 'NONE' },
  data: { kycStatus: 'PENDING' },
});
if (updated.count === 0) return NextResponse.json({ error: 'Already applied' }, { status: 400 });
// THEN create Veriff session
```
This is atomic — only one request can flip NONE→PENDING.

---

### 1.8 MEDIUM — Missing Database Index

**File:** `apps/api/prisma/schema.prisma`

**Problem:** Creator posts pagination queries filter by `creatorId` and order by `createdAt DESC`, but there's no composite index. Two separate indexes are used, forcing the query planner to do an index intersection.

**Fix:** Add to schema:
```prisma
@@index([creatorId, createdAt])  // Add this line to the Post model
```

---

### 1.9 MEDIUM — Nearby Creators Has No Pagination

**File:** `apps/api/app/api/creators/nearby/route.ts`

**Problem:** Hard-capped at 100 results with no cursor. If a city has 500+ creators, most are never discoverable.

**Fix:** Add cursor-based pagination using `distanceMeters` as the keyset:
```
?lat=43.65&lng=-79.38&radius=50&cursor=1234.5&limit=20
```
WHERE clause adds: `AND ST_Distance(...) > $cursor`.

---

### 1.10 MEDIUM — Input Validation Gaps

**Problem:** Several endpoints lack validation:
- Post `content` / `caption`: No length limit (could be 1MB string)
- `username`: No format/length validation, no reserved word check
- `bio`: No length limit
- `socialLinks`: No URL format validation

**Fix:** Add validation at the top of each route handler. Industry standard: use `zod` schemas.

---

### 1.11 LOW — Cache Invalidation Uses SCAN

**File:** `apps/api/lib/redis.ts` (lines 84-93)

**Problem:** `invalidateCache('feed:*')` uses Redis SCAN to find matching keys, which is O(N) on the keyspace. At scale (100K+ cache keys), this blocks Redis for seconds.

**Fix:** Use Redis hash sets or tag-based invalidation. Store feed entries under a hash key, then delete the entire hash.

---

## PART 2: Mobile App Issues

### 2.1 CRITICAL — No Request Timeout

**File:** `apps/mobile/src/services/api.ts` (line 99)

**Problem:** `fetch()` has no timeout. On 2G/slow networks, requests hang indefinitely. Users see infinite loading.

**Fix:** Add AbortController with 15-second timeout:
```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15000);
const response = await fetch(url, { ...options, signal: controller.signal });
clearTimeout(timeout);
```

---

### 2.2 CRITICAL — Wallet Polling Never Pauses

**File:** `apps/mobile/src/hooks/useWalletBalance.ts` (line 13)

**Problem:** Polls every 30 seconds unconditionally — even when app is backgrounded. Burns battery and mobile data (120 requests/hour).

**Fix:** Use Expo's `useAppState` to pause polling when backgrounded:
```ts
const appState = useAppState();
refetchInterval: appState === 'active' ? 30000 : false,
```

---

### 2.3 HIGH — No Offline Support

**Problem:** All hooks fail silently when offline. Users can't view cached posts, profiles, or their own profile.

**Fix:** Implement React Query's `persistQueryClient` with `@tanstack/query-async-storage-persister` + Expo `AsyncStorage`. Critical queries (feed, userProfile) persist across sessions.

---

### 2.4 HIGH — Feed Auto-Expanding Radius Over-Fetches

**File:** `apps/mobile/src/hooks/useFeed.ts` (lines 49-63)

**Problem:** First page may fire up to 5 sequential API calls (5km → 10km → 25km → 50km → 100km) before returning any data. On slow networks: 5 × 2s RTT = 10 seconds of loading.

**Fix:** Cache the "winning" radius tier and use it as default for subsequent fetches. Only re-expand if user pulls to refresh from scratch.

---

### 2.5 HIGH — Cache Invalidation Too Broad

**Files:**
- `apps/mobile/src/hooks/useLike.ts` (lines 96-98)
- `apps/mobile/src/hooks/useComments.ts` (lines 30-33)

**Problem:** Liking one post invalidates ALL feed pages. Creating one comment invalidates the entire feed. With 50 cached pages, this triggers massive refetches.

**Fix:** Use `queryClient.setQueryData` to surgically update the specific post within the feed pages, instead of invalidating all `['feed']` queries. Only invalidate the specific post detail query.

---

### 2.6 HIGH — No Error Feedback to Users

**Problem:** All mutation failures (like, follow, comment, post creation) silently revert optimistic updates. Users see a count go up then back down with no explanation.

**Fix:** Add a toast notification system (e.g., `react-native-toast-message`). In each mutation's `onError`, show: "Failed to like post. Check your connection."

---

### 2.7 MEDIUM — Location Polling Too Frequent

**File:** `apps/mobile/src/providers/LocationProvider.tsx` (line 13)

**Problem:** Polls GPS every 5 minutes = 288 location requests/day. Each change >500m triggers feed refetch + API location sync.

**Fix:** Increase to 15 minutes for background polling. Use Expo's `startLocationUpdatesAsync` with `deferredUpdatesDistance: 500` for significant-change monitoring instead.

---

### 2.8 MEDIUM — No Garbage Collection for Infinite Queries

**File:** `apps/mobile/src/providers/QueryProvider.tsx`

**Problem:** No `gcTime` set. Default is 5 minutes. Infinite scroll feed with 50 pages = ~500 KB of cached data in memory.

**Fix:** Set `gcTime: 2 * 60 * 1000` (2 minutes) to aggressively reclaim memory on mobile.

---

### 2.9 MEDIUM — Upload Blocks on Large Files

**File:** `apps/mobile/src/hooks/useUpload.ts` (line 170)

**Problem:** `response.blob()` loads entire file into memory. No chunked upload. >50 MB files crash low-end Android. Progress indicators are fake (hardcoded 0.2 → 1.0).

**Fix:** Use `XMLHttpRequest` with `upload.onprogress` for real progress tracking. Consider compressing images with `expo-image-manipulator` before upload (resize to max 2048px).

---

## PART 3: Production Deployment Checklist

### 3.1 API Deployment (Vercel)

| Step | Action | Status |
|------|--------|--------|
| 1 | Push code to GitHub | Required |
| 2 | Import `apps/api` as Vercel project (root dir: `apps/api`) | Required |
| 3 | Add all 14 env vars to Vercel project settings | Required |
| 4 | Set `SKIP_KYC=false` for production | Required |
| 5 | Set `NEXT_PUBLIC_API_URL` to production domain | Required |
| 6 | Run `prisma db push` against production DB | Required |
| 7 | Run PostGIS migration SQL in Supabase SQL Editor | Required |
| 8 | Configure Veriff webhook URL to `https://api.yourdomain.com/api/kyc/webhook` | Required |
| 9 | Add production domain to Privy allowed domains | Required |
| 10 | Verify CORS headers in `vercel.json` allow mobile app origin | Required |

### 3.2 Database (Supabase)

| Step | Action |
|------|--------|
| 1 | Enable PostGIS extension |
| 2 | Run `prisma db push` to create tables |
| 3 | Run PostGIS migration SQL (geography columns + triggers) |
| 4 | Create `momento-uploads` storage bucket (public) |
| 5 | Set storage policies (authenticated INSERT, anon SELECT) |
| 6 | Enable Row Level Security on all tables |
| 7 | Set up connection pooling (pgBouncer transaction mode, port 6543) |
| 8 | Enable database backups (Supabase Pro plan) |
| 9 | Set up database monitoring alerts |

### 3.3 Redis Cache (Upstash)

| Step | Action |
|------|--------|
| 1 | Create production Redis database (same region as Supabase) |
| 2 | Enable TLS/SSL |
| 3 | Set maxmemory policy to `allkeys-lru` |
| 4 | Configure alerts for memory usage >80% |

### 3.4 Mobile App

| Step | Action |
|------|--------|
| 1 | Set `EXPO_PUBLIC_API_URL` to production API URL |
| 2 | Set `EXPO_PUBLIC_SOLANA_NETWORK` to `mainnet-beta` |
| 3 | Set `EXPO_PUBLIC_SOLANA_RPC_URL` to Helius mainnet endpoint |
| 4 | Build production APK/AAB via `eas build --profile production` |
| 5 | Submit to Google Play / App Store (see `docs/APP_DISTRIBUTION_GUIDE.md`) |

### 3.5 Monitoring & Observability (New — Not Yet Implemented)

| Tool | Purpose | Cost |
|------|---------|------|
| Vercel Analytics | API performance, error rates | Free (included) |
| Sentry | Error tracking (API + mobile) | Free (10K events/mo) |
| Upstash Redis dashboard | Cache hit rates, memory usage | Free (included) |
| Supabase dashboard | DB query performance, connection counts | Free (included) |
| Expo crash reports | Mobile app crash tracking | Free (included) |

---

## PART 4: Priority Order for Fixes

### Phase 1 — Must Fix Before Launch (Blockers)
1. User creation race condition → upsert (auth.ts)
2. Post creation transaction (posts/route.ts)
3. Rate limiting on all endpoints (new lib/ratelimit.ts)
4. Request timeout on mobile (api.ts)
5. Wallet polling pause on background (useWalletBalance.ts)
6. Like/Follow constraint violation handling (like/route.ts, follow/route.ts)

### Phase 2 — Should Fix Before Scale (1K+ Users)
7. Feed N+1 query elimination (feed/route.ts)
8. Composite index on (creatorId, createdAt) (schema.prisma)
9. KYC double-submit prevention (creators/apply/route.ts)
10. Error toasts on mobile (all mutation hooks)
11. Offline cache with AsyncStorage (QueryProvider.tsx)
12. Feed auto-radius caching (useFeed.ts)

### Phase 3 — Nice to Have (10K+ Users)
13. Granular cache invalidation on mobile (useLike.ts, useComments.ts)
14. Nearby creators pagination (creators/nearby/route.ts)
15. Input validation with zod (all write endpoints)
16. Upload progress + compression (useUpload.ts)
17. Location polling frequency reduction (LocationProvider.tsx)
18. React Query gcTime tuning (QueryProvider.tsx)
19. Redis SCAN replacement with hash-based invalidation (redis.ts)
20. Sentry integration for error monitoring (new)

---

## Verification Plan

After implementing each phase:

1. **Race conditions:** Use `ab` or `autocannon` to send 50 concurrent requests to `/api/feed`, like toggle, follow toggle, and user creation. Verify no 500 errors and counts are accurate.
2. **Rate limiting:** Send 100 rapid requests to a rate-limited endpoint. Verify 429 responses after limit is hit.
3. **Mobile timeout:** Simulate slow network in Android emulator (Network settings → 2G). Verify requests timeout after 15 seconds with user-facing error.
4. **Offline support:** Enable airplane mode. Verify cached feed is still viewable. Re-enable network, verify sync.
5. **Production deploy:** Hit each endpoint via curl against the Vercel URL. Verify 200 responses with correct data shapes.
