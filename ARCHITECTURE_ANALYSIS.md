# Momento - Architecture & Pattern Analysis

## Executive Summary

The documentation describes a well-structured location-based creator platform MVP. The overall architecture is sound — Turbo monorepo, Next.js API, Expo mobile, shared types — but there are several patterns that need attention before we build. This document breaks down what works, what doesn't, and what I'd change.

---

## 1. Monorepo Structure — SOLID

```
momento/
├── apps/api/        # Next.js 14
├── apps/mobile/     # Expo React Native
└── packages/shared/ # Shared types
```

**What works:**
- Turbo + pnpm is the right choice for a monorepo with separate deploy targets
- Shared types package prevents drift between API and mobile
- Clear separation of concerns

**Concern:**
- The shared package uses `"main": "./src/index.ts"` which means it's consumed as raw TypeScript. This works in dev but can cause issues with tools that expect compiled JS. For a monorepo with Turbo, this is actually fine — Next.js and Expo both handle TS transpilation. But we should add `"types": "./src/index.ts"` and ensure `tsconfig` paths are set up correctly in both consumers.

**Verdict: Keep as-is.** The pattern is standard for internal packages in a Turbo monorepo.

---

## 2. Database Layer — GOOD with CAVEATS

### Prisma Schema
The schema is well-designed:
- Proper use of `@unique` constraints (e.g., `[userId, postId]` on Like)
- Denormalized counts (`followerCount`, `likeCount`) for read performance
- Cascade deletes on relations
- Spatial indexes on lat/lng

**Issues I've identified:**

1. **PostGIS geography column lives OUTSIDE Prisma.** The docs create a parallel `location geography(Point, 4326)` column via raw SQL + triggers. Prisma doesn't know about this column. This is a common pattern with PostGIS + Prisma, but it means:
   - Prisma migrations won't include the geography column
   - We must run the PostGIS SQL migration separately (via Supabase SQL Editor)
   - The triggers sync `locationLat`/`locationLng` → `location` geography column automatically
   - All spatial queries use `$queryRaw` (not Prisma's query builder)

   **This is the right approach.** Prisma doesn't natively support PostGIS, so raw SQL + triggers is the standard workaround.

2. **`prisma db push` vs migrations.** The docs use `db push` (schema-only, no migration history) plus a manual PostGIS migration. For MVP this is fine, but for production we'd want proper migrations. **Keep for now.**

3. **The `User.socialLinks` is `Json?`.** This is flexible but loses type safety at the DB level. The TypeScript types in shared package cover the app layer. **Acceptable for MVP.**

### Redis Caching
The caching strategy is well-thought-out:
- Feed cached for 60s (location-rounded to ~1km grid)
- Creator profiles cached for 10 minutes
- Wallet balances cached for 30 seconds
- `getOrSetCache` helper with TTL
- `invalidateCache` with pattern matching

**Issue:** `invalidateCache('feed:*')` uses `redis.keys()` which is O(N) and can be slow on large datasets. For MVP volume this is fine. In production, consider using Redis hash sets or a different invalidation strategy.

**Verdict: Keep as-is for MVP.**

---

## 3. Auth Flow — CORRECT but needs one fix

The pattern:
1. Mobile sends Privy auth token in `Authorization: Bearer <token>` header
2. API verifies token via `privy.verifyAuthToken(token)`
3. Finds or creates user in DB
4. Returns user object

**Issue I found:** The `getAuthUser` function in `lib/auth.ts` calls `privy.getUser(privyUserId)` on EVERY request for new users. But it also does a DB lookup first. This means:
- First request: DB miss → Privy API call → DB create → return user ✓
- Subsequent requests: DB hit → return user ✓

**This is correct.** The Privy call only happens once (on first login).

**One concern:** The `requireCreator` function checks `user.role !== UserRole.CREATOR || !user.isAdminApproved`. This is correct for the business logic (creators need both KYC + admin approval), but the error message is generic. Consider returning different errors for "not a creator" vs "pending approval."

---

## 4. API Route Patterns — MOSTLY GOOD

All routes follow a consistent pattern:
```typescript
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);  // or requireAuth
    // ... business logic ...
    return NextResponse.json({ success: true, data: { ... } });
  } catch (error) {
    return NextResponse.json({ success: false, error: '...' }, { status: 500 });
  }
}
```

**What works:**
- Consistent `{ success, data }` / `{ success, error }` response shape
- Proper use of `$queryRaw` for PostGIS spatial queries
- Cursor-based pagination
- Optimistic count updates in transactions
- Cache invalidation after mutations

**Issues:**

1. **Feed route caches the ENTIRE result set (100 posts), then paginates in-memory.** This means:
   - First page: DB query → cache 100 posts → return 20
   - Second page: read cache → return posts 21-40
   - This works but wastes memory caching posts users may never scroll to
   - **Acceptable for MVP volume.**

2. **The feed route's PostGIS query hardcodes `LIMIT 100`.** If the user is in a dense area, they'll never see posts beyond the first 100. The auto-expanding radius on the mobile side won't help if there are 100+ posts within the initial radius.
   - **Acceptable for MVP.** Real usage won't hit this.

3. **No rate limiting on any routes.** Worth noting for production but not MVP.

4. **The Creator Profile route (`/api/creators/[id]`) caches the profile but then does a SEPARATE uncached query for the follow status.** This means the follow status is always fresh (good) but it's an extra DB call every time.

5. **Next.js 14 App Router `params` change:** In recent Next.js versions, `params` in route handlers is a Promise that needs to be awaited: `const { id } = await params`. The docs show the older synchronous pattern. **We should use the newer async pattern.**

---

## 5. Mobile Architecture — WELL-DESIGNED

### Provider Stack
```
GestureHandlerRootView
  └── SafeAreaProvider
      └── QueryProvider
          └── PrivyProvider
              └── LocationProvider
                  └── NotificationProvider
                      └── Stack Navigator
```

**This nesting order is correct:**
- Gesture handler must wrap everything
- SafeArea needed before any layout
- Query provider before any hooks
- Privy before location/notifications (they need auth)
- Location before screens (feed needs coords)

### API Service Class
The singleton `ApiService` with `setTokenGetter` pattern is clean. It:
- Centralizes all API calls
- Lazily injects the auth token getter from Privy
- Handles error response parsing

**Issue:** The `setTokenGetter` is called in the PrivyProvider `onSuccess` callback:
```typescript
<PrivyProvider onSuccess={(user) => {
  api.setTokenGetter(async () => user.getAccessToken());
}}>
```
This pattern has a subtle issue: if the Privy SDK refreshes internally and `user` reference changes, the token getter still references the old user object. In practice, `getAccessToken()` should handle token refresh internally, so this is likely fine. **Worth watching during testing.**

### React Query Hooks
The hooks are well-structured:
- `useFeed`: Infinite query with auto-expanding radius — clever pattern
- `useLike`: Optimistic updates in BOTH the post detail AND the feed — correct but complex
- `useCreatorProfile`: Optimistic follow/unfollow with rollback
- `useWalletBalance`: 30s refetch interval for live balance updates

**Auto-expanding radius in useFeed:**
```typescript
const RADIUS_TIERS = [5000, 10000, 25000, 50000, 100000];
```
This progressively widens the search if fewer than 5 posts are found. Smart for sparse areas.

**Issue with useLike:** The optimistic update modifies `queryClient.setQueriesData({ queryKey: ['feed'] })` — this updates ALL feed query cache entries (all pages). This is correct but could cause a re-render cascade in large feeds. **Fine for MVP.**

### Style System
```
COLORS (design tokens) → TYPOGRAPHY (text styles) → LAYOUTS (common patterns)
         ↓                       ↓                        ↓
    Components import from @/styles, NEVER hardcode values
```

**This is a solid pattern.** The dark theme (`#0D0D0D` background, `#00FF88` primary) is consistent throughout. The mono typography for token prices is a nice touch.

### Component Architecture
```
primitives/ (Text, Button, Avatar, Spacer, Card) — atomic, reusable
features/   (PostCard, TickerBanner, TokenList, etc.) — composed from primitives
```

**This is correct atomic design.** Each component:
- Imports only from `@/styles` for design tokens
- Uses primitives for text/buttons (never raw RN components)
- Stays under 150 lines

---

## 6. Issues & Improvements I'd Make

### HIGH PRIORITY (should fix before building)

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | Next.js `params` is now async in App Router | Build errors | Use `const { id } = await params` pattern |
| 2 | `@privy-io/expo` API may have changed since docs written | Build errors | Verify current Privy Expo SDK API |
| 3 | Expo SDK version not pinned | Compatibility issues | Pin to latest stable (SDK 52+) |
| 4 | `expo-haptics` used in `useLike` but not in dependencies | Import error | Add to mobile dependencies |
| 5 | `react-native-safe-area-context` used but not in dependencies | Import error | Add to mobile dependencies |

### MEDIUM PRIORITY (improve but not blocking)

| # | Issue | Improvement |
|---|-------|-------------|
| 6 | No error boundaries in mobile | Add React error boundary wrapper |
| 7 | No loading skeletons | Feed/explore show blank during load |
| 8 | Settings screen referenced but not implemented | Add placeholder settings screen |
| 9 | No `.gitignore` mentioned | Need proper ignores for node_modules, .env, etc. |
| 10 | The `formatTimeAgo` utility reinvents the wheel | Could use `date-fns` or `dayjs` but keeping custom is fine for bundle size |

### LOW PRIORITY (fine for MVP)

| # | Issue | Note |
|---|-------|------|
| 11 | No offline support | React Query has offline support, could enable later |
| 12 | No image compression before upload | `expo-image-manipulator` could resize |
| 13 | Portfolio chart uses random data on every mount | Should use `useMemo` or stable seed |
| 14 | Explore screen reuses feed data instead of nearby creators API | Should call `/api/creators/nearby` for creators tab |

---

## 7. Data Flow Diagrams

### Authentication Flow
```
User taps "Sign Up" → Privy OAuth (Google/Apple)
  → Privy creates embedded Solana wallet
  → Privy returns auth token
  → App sets token getter on API service
  → App navigates to Home
  → Every API call includes Bearer token
  → API verifies token, finds/creates user in DB
```

### Post Creation Flow
```
Creator taps "New Post"
  → Picks image → Upload presign API → Upload to Supabase Storage
  → Writes caption
  → Device captures GPS coordinates
  → POST /api/posts (with mediaUrl + lat/lng)
  → API creates post, triggers PostGIS sync
  → Invalidates feed cache
  → Notifies followers via push
```

### Feed Discovery Flow
```
App loads → LocationProvider gets GPS coords
  → useFeed queries /api/feed?lat=X&lng=Y&radius=5000
  → API checks Redis cache (1km grid key)
  → Cache miss → PostGIS query: ST_DWithin(location, point, radius)
  → Returns posts sorted by recency
  → If < 5 posts → useFeed auto-expands radius to 10km, 25km, etc.
```

### KYC → Creator Flow
```
User fills Edit Profile → taps "GET VERIFIED"
  → If SKIP_KYC=true → Instant creator status (dev mode)
  → If production → API creates Veriff session
  → Opens Veriff SDK in WebView
  → User scans ID → Veriff webhook fires
  → API updates KYC status
  → Admin approves in Supabase Dashboard
  → User becomes CREATOR role
```

---

## 8. Verdict

**The architecture is well-designed for an MVP.** The documentation is thorough and the patterns are consistent. The main risks are:

1. **Dependency version drift** — The docs reference specific versions that may be outdated. We need to use compatible latest versions.
2. **Privy SDK API changes** — The Privy React Native SDK has evolved. We need to verify the current API.
3. **PostGIS setup** — This requires manual SQL execution in Supabase, not automatable from code alone.

**Recommendation:** Build as documented with the fixes noted above. The architecture doesn't need fundamental changes — it needs careful implementation with current SDK versions.
