# Momento — Current State Audit & Bug Report

> Generated 2026-03-18 after full codebase review.

---

## Table of Contents

1. [Original Critical Bugs — Verification Status](#original-critical)
2. [New API Bugs Discovered](#api-bugs)
3. [New Mobile Bugs Discovered](#mobile-bugs)
4. [Type Contract Mismatches](#type-mismatches)
5. [What's Missing](#whats-missing)
6. [Environment Files Created](#env-files)
7. [Recommended Fix Priority](#fix-priority)

---

<a id="original-critical"></a>
## 1. Original Critical Bugs (GAPS.md C1-C7) — Verification Status

| Bug | Status | Evidence |
|-----|--------|----------|
| **C1: API envelope not unwrapped** | **FIXED** | `api.ts:124-131` now unwraps `{ success, data }` envelope automatically |
| **C2: Upload field `presignedUrl` vs `uploadUrl`** | **FIXED** | `api.ts:213` and `useUpload.ts:81` both use `uploadUrl`. `fileName` is now generated and sent. |
| **C3: Push token wrong path/payload** | **FIXED** | `NotificationProvider.tsx:89` now calls `/users/me/push-token` with `{ pushToken: token }` |
| **C4: KYC route `/kyc/apply` vs `/creators/apply`** | **FIXED** | `useKyc.ts:43` now calls `/creators/apply` |
| **C5: Follow uses DELETE instead of POST** | **FIXED** | `useCreatorProfile.ts:30` now uses `apiService.post()` (toggle) |
| **C6: Like uses DELETE instead of POST** | **FIXED** | `useLike.ts:23` now uses `apiService.post()` (toggle) |
| **C7: Post detail has no direct API fetch** | **FIXED** | `post/[id].tsx:48-52` has `useQuery` fallback when post not in feed cache |

**All 7 original critical bugs have been fixed.** The "fixes" and "fixes v2" commits resolved these.

---

<a id="api-bugs"></a>
## 2. New API Bugs Discovered

### CRITICAL

#### A1. Feed lat/lng validation allows partial coordinates
- **File:** `apps/api/app/api/feed/route.ts:20`
- **Bug:** `if (!lat && !lng)` only rejects when BOTH are falsy. A request with `?lat=43.6` (no lng) passes validation with `lng=0`.
- **Impact:** Wrong query results — searches centered on longitude 0 (off the coast of Africa).
- **Fix:** `if (!searchParams.has('lat') || !searchParams.has('lng'))` or `if (isNaN(lat) || isNaN(lng))`

#### A2. Same validation bug in nearby creators
- **File:** `apps/api/app/api/creators/nearby/route.ts:25`
- **Bug:** Identical to A1.

#### A3. Path traversal in upload presign (SECURITY)
- **File:** `apps/api/app/api/uploads/presign/route.ts:42`
- **Bug:** Sanitization `.replace(/\.\.\//g, '')` is bypassable with `....//` (becomes `../` after one regex pass).
- **Impact:** Attacker can write files outside intended directory.
- **Fix:** Reject if folder contains `..` at all: `if (safeFolder.includes('..')) return 400`

#### A4. Like toggle race condition on unlike
- **File:** `apps/api/app/api/posts/[id]/like/route.ts:44-54`
- **Bug:** Two concurrent unlike requests both see `existingLike`, both try to delete. Second one fails with unhandled P2025.
- **Impact:** 500 error on concurrent unlike. likeCount can go negative in DB.
- **Fix:** Catch P2025 on delete, or use `deleteMany` + check count.

#### A5. Follow toggle same race condition on unfollow
- **File:** `apps/api/app/api/creators/[id]/follow/route.ts:52-66`
- **Bug:** Same pattern as A4.
- **Impact:** 500 error, followerCount/followingCount can go negative.

#### A6. Redis `getOrSetCache` double-serializes JSON (BREAKS ALL CACHING)
- **File:** `apps/api/lib/redis.ts:72`
- **Bug:** `JSON.stringify(data)` is called before `redis.set()`, but `@upstash/redis` already JSON-serializes automatically. Data is double-serialized. On `get<T>()`, Upstash parses once → returns a JSON *string* instead of an object.
- **Impact:** All cache reads return raw strings instead of objects. Downstream code calling `.posts` on a string gets `undefined`. Caching is fundamentally broken across the entire API.
- **Fix:** Remove `JSON.stringify()`: just `await getRedis().set(key, data, { ex: ttlSeconds })`

#### A7. PostGIS geography column not updated on location change
- **File:** `apps/api/app/api/users/me/location/route.ts:19-25`
- **Bug:** Route updates `locationLat`/`locationLng` (Prisma scalar fields) but NOT the `location` geography column used by PostGIS queries. Unless a DB trigger syncs these, spatial queries use stale/null data.
- **Impact:** Users who update location don't appear in nearby creators. Feed shows wrong results.
- **Fix:** Add raw SQL: `UPDATE users SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography WHERE id = $1`

#### A8. New posts don't get PostGIS geography column set
- **File:** `apps/api/app/api/posts/route.ts:37-47`
- **Bug:** Post created with `latitude`/`longitude` Prisma fields but feed query filters on `p."location"` (PostGIS geography). Without a trigger, `location IS NULL` and post is excluded from feed (line 89: `WHERE p."location" IS NOT NULL`).
- **Impact:** Newly created posts NEVER appear in the location-based feed.
- **Fix:** Execute raw SQL after creation, or ensure DB trigger syncs lat/lng → geography.

### HIGH

#### A9. Post delete not in transaction
- **File:** `apps/api/app/api/posts/[id]/route.ts:122-128`
- **Bug:** `prisma.post.delete` and `prisma.user.update` (decrement postCount) are separate awaits, not `$transaction`.
- **Impact:** postCount drift if second operation fails.

#### A10. Denormalized counts can go negative in database
- **Files:** Like route:52, Follow route:59-64, Comment delete:51
- **Bug:** Prisma `{ decrement: 1 }` has no floor. Response uses `Math.max(0,...)` but DB stores negatives.
- **Impact:** Subsequent reads from DB show negative counts.
- **Fix:** Use raw SQL `GREATEST("count" - 1, 0)` or DB CHECK constraints.

#### A11. Feed `isLiked` may return string `'false'` → `Boolean('false')` = `true`
- **File:** `apps/api/app/api/feed/route.ts:42,120`
- **Bug:** SQL `FALSE as "isLiked"` may return string `'false'` in some PG drivers. `Boolean('false')` evaluates to `true`.
- **Impact:** Unauthenticated users may see all posts as "liked."
- **Fix:** Use `false::boolean` in SQL, or compare: `isLiked: p.isLiked === true`

#### A12. KYC rejected users permanently locked out
- **File:** `apps/api/app/api/creators/apply/route.ts:68-71`
- **Bug:** Apply route only allows `kycStatus: 'NONE'`. Rejected users can never re-apply.
- **Impact:** Permanent lockout from creator status.
- **Fix:** Allow `kycStatus: { in: ['NONE', 'REJECTED'] }`

#### A13. Username uniqueness TOCTOU → 500 instead of 409
- **File:** `apps/api/app/api/users/me/route.ts:98-114`
- **Bug:** Check-then-update for username. P2002 error unhandled in catch.
- **Impact:** Race condition returns confusing 500.

#### A14. Rate limiter identifier resets on token refresh
- **File:** `apps/api/lib/ratelimit.ts:46-53`
- **Bug:** Uses first 32 chars of JWT as identifier. JWT changes on refresh → rate limit resets.
- **Impact:** Rate limiting ineffective for authenticated users.
- **Fix:** Decode JWT, use `sub` (user ID) as identifier.

#### A15. Wallet balance route missing rate limiting
- **File:** `apps/api/app/api/wallet/balance/route.ts`
- **Bug:** No `applyRateLimit` call. Makes external Helius API calls.
- **Impact:** Can burn through Helius API rate limits via spam.

#### A16. Creator profile endpoint doesn't filter by role
- **File:** `apps/api/app/api/creators/[id]/route.ts:18`
- **Bug:** `/creators/[id]` fetches any user without checking `role === 'CREATOR'`.
- **Impact:** Non-creator profiles exposed through creators API.

### MEDIUM

#### A17. Feed cache per-user → memory explosion
- **File:** `apps/api/app/api/feed/route.ts:34`
- **Bug:** Each user gets a unique cache key. Cache grows linearly per user × per location grid.
- **Impact:** Redis memory bloat in production.

#### A18. Nearby creators cursor pagination lossy
- **File:** `apps/api/app/api/creators/nearby/route.ts:99-100`
- **Bug:** Cursor is `Math.round(distanceMeters)`. Creators at same rounded distance get skipped.
- **Impact:** Creators silently disappear during pagination.

---

<a id="mobile-bugs"></a>
## 3. New Mobile Bugs Discovered

### CRITICAL

#### M1. `useAuth` conditionally calls `usePrivy()` hook
- **File:** `apps/mobile/src/hooks/useAuth.ts:45-55`
- **Bug:** `usePrivy()` is called conditionally based on `isPrivyAvailable`, violating React's Rules of Hooks.
- **Impact:** Potential crash: "Rendered more hooks than during the previous render."

#### M2. AuthBridge missing in Expo Go mode
- **File:** `apps/mobile/app/_layout.tsx` + PrivyGuard
- **Bug:** When running in Expo Go, PrivyGuard renders children without `AuthBridge`. `apiService.setTokenGetter()` is never called.
- **Impact:** Every API call goes out without Authorization header → all authenticated endpoints return 401.

#### M3. `useFeed` can send `undefined` lat/lng
- **File:** `apps/mobile/src/hooks/useFeed.ts:49-51`
- **Bug:** No null guard inside `queryFn`. If location becomes null between `enabled` check and execution, API gets `lat=undefined`.
- **Impact:** API error or wrong results.

#### M4. `useNearbyCreators` uses non-null assertion on location
- **File:** `apps/mobile/src/hooks/useNearbyCreators.ts:17-18`
- **Bug:** `location!.latitude` — if location is null when queryFn executes, runtime crash.

### HIGH

#### M5. LikeButton local state drifts from server state
- **File:** `apps/mobile/src/components/features/LikeButton.tsx:23-24`
- **Bug:** Uses `useState(initialLiked)` set once from props. Optimistic rollback updates React Query cache but NOT the local state.
- **Impact:** After failed like, heart icon stays in wrong state until navigation.

#### M6. `create-post.tsx` navigates back before mutation completes
- **File:** `apps/mobile/app/create-post.tsx:89-95`
- **Bug:** `mutate()` then `router.back()` immediately. If mutation fails, error toast shows on wrong screen. Also state update on unmounted component.

#### M7. `edit-profile.tsx` navigates back before mutation completes
- **File:** `apps/mobile/app/edit-profile.tsx:94-101`
- **Bug:** Same pattern as M6.

#### M8. Context guards in LocationProvider and NotificationProvider never throw
- **Files:** `LocationProvider.tsx:177-183`, `NotificationProvider.tsx:171-179`
- **Bug:** Default context value is a valid object, so `if (!ctx)` never triggers. Using hooks outside their providers silently returns stale defaults.

#### M9. FlashList missing `estimatedItemSize`
- **File:** `apps/mobile/app/(tabs)/home.tsx:106`
- **Bug:** FlashList requires `estimatedItemSize` for efficient rendering.
- **Impact:** Performance degradation, console warnings.

#### M10. `useWalletBalance` calls nonexistent `/wallet/balance` endpoint
- **File:** `apps/mobile/src/hooks/useWalletBalance.ts:22`
- **Bug:** No `/wallet/balance` route exists in the API. Always returns 404.
- **Impact:** Profile wallet stats (24H change, earnings, portfolio) always show `$0.00`.

#### M11. Text-only posts have no visual content in feed or detail
- **Files:** `PostCard.tsx:77-87`, `post/[id].tsx:162-176`
- **Bug:** Only `post.mediaUrl` (image) and `post.caption` are rendered. `post.content` (text body) is never displayed.
- **Impact:** TEXT type posts appear blank in feed and detail view.

#### M12. Explore empty state never shows
- **File:** `apps/mobile/app/(tabs)/explore.tsx:190-213`
- **Bug:** FlatList has `data={[{ key: 'masonry' }]}` — always one item, so `ListEmptyComponent` never renders.
- **Impact:** Users see empty columns instead of "No creators nearby" message.

#### M13. `formatPercentage` double plus sign in TokenList
- **File:** `apps/mobile/src/components/features/TokenList.tsx:63-64`
- **Bug:** Manual `+` prefix + `formatPercentage` (which already prepends `+`) = `++12.5%`.

#### M14. QueryProvider persistence keys don't match actual query keys
- **File:** `apps/mobile/src/providers/QueryProvider.tsx:40-43`
- **Bug:** Filter checks for `'creatorProfile'` and `'nearbyCreators'` but actual keys are `'creator'` and `['creators', 'nearby', ...]`.
- **Impact:** Offline cache not working for creator profiles or nearby creators.

#### M15. Notification tap routes to nonexistent `/wallet` screen
- **File:** `apps/mobile/src/providers/NotificationProvider.tsx:123`
- **Bug:** `router.push('/wallet')` but no `wallet.tsx` screen exists.
- **Impact:** Navigation error on wallet notification tap.

### MEDIUM

#### M16. `Dimensions.get('window')` called at module level
- **Files:** `explore.tsx:21`, `post/[id].tsx:27`, `PostCard.tsx:17`, `PortfolioChart.tsx:20`, `SettingsSheet.tsx:32`, `FeedSkeleton.tsx:6`
- **Bug:** Screen dimensions captured once at import time. Stale on rotation or foldable devices.
- **Fix:** Use `useWindowDimensions()` hook.

#### M17. Feed query key changes on every GPS update → cache thrashing
- **File:** `apps/mobile/src/hooks/useFeed.ts:34-39`
- **Bug:** Query key includes raw `location?.latitude`/`longitude`. GPS changes by tiny amounts every 15 min → new query key → cache invalidated.
- **Fix:** Round coordinates to 2 decimal places in the query key.

#### M18. Veriff redirect URL not handled after KYC apply
- **File:** `apps/mobile/src/hooks/useKyc.ts`
- **Bug:** API returns `verificationUrl` but nothing opens it in a WebView or browser.
- **Impact:** Creator KYC flow dead-ends.

#### M19. No deep linking / URL scheme configured
- **File:** `apps/mobile/app.json`
- **Bug:** No `scheme` property. Push notification deep links won't work from cold launch.

#### M20. PostCard share button does nothing
- **File:** `apps/mobile/src/components/features/PostCard.tsx:108-114`
- **Bug:** Share Pressable has no `onPress` handler. Looks tappable but does nothing.

#### M21. Preview mode → all API calls fail with 401
- **File:** `apps/mobile/app/login.tsx:49-51`
- **Bug:** "Preview Mode" navigates to tabs without auth. All authenticated API calls fail.
- **Impact:** Preview mode shows nothing but error states.

#### M22. Explore POSTS tab has no loading indicator
- **File:** `apps/mobile/app/(tabs)/explore.tsx:185`
- **Bug:** Loading spinner only shows for CREATORS tab. POSTS tab shows empty masonry during load.

#### M23. `edit-profile.tsx` missing KeyboardAvoidingView
- **File:** `apps/mobile/app/edit-profile.tsx`
- **Bug:** Multiple TextInputs but no KeyboardAvoidingView. Keyboard covers lower form fields on iOS.

#### M24. SettingsSheet exit animation never plays
- **File:** `apps/mobile/src/components/features/SettingsSheet.tsx:48-76`
- **Bug:** Uses `animationType="none"` on Modal with custom animations, but Modal unmounts before exit animation runs.

---

<a id="type-mismatches"></a>
## 4. Type Contract Mismatches (Shared ↔ API ↔ Mobile)

| # | Mismatch | Impact |
|---|----------|--------|
| **T1** | Feed posts include `distanceMeters` but `PostWithCreator` has no such field | TS error if mobile tries to display distance |
| **T2** | Creator profile returns `followingCount`, `role`, `createdAt`, `isFollowing` — not in `PublicCreator` | Can't display following count or member-since |
| **T3** | Nearby creators API returns `nextCursor`/`hasMore` — not in mobile's type | Can't paginate nearby creators |
| **T4** | `Post.mediaUrls` is `string[]` in shared types but `Json?` (nullable) from Prisma | `post.mediaUrls.length` crashes when null |
| **T5** | No shared `CommentsResponse` type — mobile defines its own locally | Works but no compile-time contract |
| **T6** | Create post returns `PostWithCreator` but `useCreatePost` expects bare `Post` | Creator data in response invisible to TS |
| **T7** | KYC dev-mode response includes `user` sub-object not in mobile's type | Can't read updated role from dev response |
| **T8** | KYC payload has `tokenSymbol`/`applicationText`/`socialLinks` that API ignores | Dead fields sent to server |
| **T9** | No shared types for upload presign response | Duplicate inline types in two places |
| **T10** | `User` shared type missing `pushToken` field | Intentional (not exposed) but undocumented |
| **T11** | Feed route `createdAt` not `.toISOString()`'d — raw Date on first fetch, string from cache | Mobile date formatting inconsistent between cached/uncached |
| **T12** | `socialLinks` is `Json?` in Prisma but typed `SocialLinks` in shared — no runtime validation | Malformed DB data crashes mobile |
| **T13** | KYC payload sends `tokenSymbol`/`applicationText`/`socialLinks` that API silently ignores | Data loss — user fills form fields that are never saved |
| **T14** | `PublicCreator.distanceMeters?` is on the creator type but API puts it on the post object | Field on wrong type |

---

<a id="whats-missing"></a>
## 5. What's Missing

### Infrastructure
- [ ] Prisma client not generated (`pnpm approve-builds` + `npx prisma generate` needed)
- [ ] PostGIS migration not run (raw SQL migration at `prisma/migrations/00_postgis_setup/`)
- [ ] Database seed not run
- [ ] No CI/CD pipeline (no GitHub Actions)
- [ ] No test files anywhere (zero tests)
- [ ] No ESLint/Prettier config (referenced in scripts but not present)
- [ ] No Sentry error reporting

### Mobile Features
- [ ] Settings sub-screens all show ComingSoonModal (Favorites, Account Privacy, Device Permissions, Vault, Delete Account)
- [ ] Delete Account — **required for App Store compliance**
- [ ] No offline support (React Query has no persistence layer)
- [ ] No image compression before upload (images sent at full resolution, 5-10MB)
- [ ] No loading skeletons (blank screens during load)
- [ ] No React error boundary wrapping screens
- [ ] No pull-to-refresh on explore or market screens
- [ ] Placeholder PNG assets (1x1 transparent PNGs for icons)
- [ ] No app icon or splash screen (Expo defaults)
- [ ] No KeyboardAvoidingView on several modal screens
- [ ] SwapModal is UI-only (no swap execution)
- [ ] PortfolioChart uses hardcoded dummy data
- [ ] Market screen uses dummy data (no API for token rankings)

### API Features
- [ ] No admin dashboard (using Supabase Dashboard)
- [ ] No auth sync cron (Privy users not periodically synced)
- [ ] Wallet balance endpoint untested
- [ ] No webhook signature verification for all Veriff events

### Assets & Branding
- [ ] Placeholder notification-icon.png (1x1 transparent)
- [ ] Placeholder adaptive-icon.png (1x1 transparent)
- [ ] No favicon for landing page
- [ ] Landing page social links are `#` placeholders
- [ ] Tab icons use Ionicons, not custom SVGs

---

<a id="env-files"></a>
## 6. Environment Files Created

| File | Purpose |
|------|---------|
| `apps/api/.env.development` | API local dev template (empty placeholders) |
| `apps/api/.env.production` | API production template (docs for Vercel vars) |
| `apps/mobile/.env.development` | Mobile local dev template with device/emulator notes |
| `apps/mobile/.env.production` | Mobile production template (EAS Build secrets) |
| `apps/landing/.env.development` | Landing dev (no required vars) |
| `apps/landing/.env.production` | Landing production template |

**Existing files with real credentials** (gitignored):
- `apps/api/.env.local` — has real Supabase, Privy, Upstash, Helius, Veriff keys
- `apps/api/.env` — duplicate of `.env.local` (both have identical credentials)
- `apps/mobile/.env` — has real Privy app ID, Helius-backed devnet RPC

**Security note:** `apps/api/.env` and `apps/api/.env.local` both contain real database passwords, API secrets, and service keys. The `.gitignore` covers `.env`, `.env.local`, and `.env.*.local` — the new `.env.development` and `.env.production` files are safe to commit (they contain only empty placeholders).

---

<a id="fix-priority"></a>
## 7. Recommended Fix Priority

### P0 — Fix Now (Security + Data Integrity + Crashes)

| # | Bug | Effort |
|---|-----|--------|
| A3 | Path traversal in upload presign (SECURITY) | 5 min |
| A6 | Redis double-serialization breaks ALL caching | 5 min |
| A7 | PostGIS geography not updated on location change | 15 min |
| A8 | New posts don't get PostGIS geography → never appear in feed | 15 min |
| M1 | useAuth conditional hook call (crash) | 15 min |
| M2 | AuthBridge missing in Expo Go (all API calls fail) | 10 min |
| A4 | Like toggle race condition (unlike → 500) | 10 min |
| A5 | Follow toggle race condition (unfollow → 500) | 10 min |

### P1 — Fix Before Testing (Broken Features)

| # | Bug | Effort |
|---|-----|--------|
| A1 | Feed lat/lng validation | 5 min |
| A2 | Nearby creators lat/lng validation | 5 min |
| A11 | Feed `isLiked` string 'false' → Boolean true | 5 min |
| M3 | useFeed null guard in queryFn | 5 min |
| M4 | useNearbyCreators null guard | 5 min |
| M5 | LikeButton state drift | 20 min |
| M6 | create-post navigate before mutation | 10 min |
| M7 | edit-profile navigate before mutation | 10 min |
| A9 | Post delete not in transaction | 5 min |
| A10 | Denormalized counts going negative | 20 min |
| A12 | KYC rejected users locked out forever | 5 min |
| A14 | Rate limiter resets on token refresh | 15 min |
| M10 | useWalletBalance calls nonexistent endpoint | 10 min |
| M11 | Text-only posts invisible in feed/detail | 15 min |
| M12 | Explore empty state never renders | 5 min |
| M14 | QueryProvider persistence keys wrong | 5 min |
| M17 | Feed cache thrashing on GPS updates | 5 min |
| M18 | Veriff redirect URL not handled | 15 min |

### P2 — Fix Before Launch

| # | Bug | Effort |
|---|-----|--------|
| T1-T14 | Type contract mismatches | 45 min |
| M8 | Context guard patterns | 10 min |
| M9 | FlashList estimatedItemSize | 2 min |
| M13 | Double plus sign in TokenList | 2 min |
| M15 | Notification tap → nonexistent /wallet screen | 5 min |
| M16 | Dimensions at module level | 20 min |
| M19 | Deep linking URL scheme | 10 min |
| M20 | PostCard share button does nothing | 10 min |
| M21 | Preview mode all API calls fail | 20 min |
| M22 | Explore POSTS tab no loading indicator | 5 min |
| M23 | edit-profile missing KeyboardAvoidingView | 10 min |
| M24 | SettingsSheet exit animation broken | 15 min |
| A13 | Username uniqueness race → 500 | 10 min |
| A15 | Wallet balance missing rate limit | 5 min |
| A16 | Creator profile doesn't filter by role | 5 min |
| A17 | Feed cache per-user memory explosion | 30 min |
| A18 | Nearby creators cursor pagination lossy | 15 min |

### P3 — Missing Features (Pre-Launch)

Delete Account, offline support, image compression, loading skeletons, error boundaries, CI/CD, tests, real assets.

---

**Total new bugs found: 18 API + 24 mobile + 14 type mismatches = 56 issues**
**Original 7 critical bugs: ALL FIXED**
