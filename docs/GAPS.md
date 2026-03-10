# Momento — Comprehensive Gap Audit & Next-Agent Playbook

> Generated 2026-03-06 after Phase 4 completion (7 commits on main).
> **Updated 2026-03-10**: All critical (C1-C7) and most major gaps resolved. See status markers below.
> This document is the single source of truth for what's broken, what's missing, and exactly how to fix it.

---

## Table of Contents

1. [Critical Gaps (7) — ~~Blocks Core Functionality~~ ALL RESOLVED](#critical)
2. [Major Gaps (10) — Significant Feature Holes](#major)
3. [Minor Gaps (16) — Polish & Quality](#minor)
4. [Nice-to-Have (10) — Future Improvements](#nice-to-have)
5. [Remaining Work — What an Agent Can Tackle Next](#remaining-work)

---

<a id="critical"></a>
## 🔴 CRITICAL GAPS — ~~Blocks Core Functionality~~ ALL RESOLVED (2026-03-10)

All 7 critical issues have been fixed. See commits `9e41649` (Phase 1), `98a62c2` (Phase 2), `da6993b` (Phase 3), `4a56b86` (Phase 4).

---

### C1. API Response Envelope Not Unwrapped

**Impact:** Every hook receives `{ success: true, data: {...} }` instead of the actual data. The entire app's data layer is broken.

**Root Cause:** Every API route wraps responses in `{ success, data }`:
```typescript
// API routes all do this:
return NextResponse.json({ success: true, data: feedData });
```

But `apiService.request()` returns the raw parsed body:
```typescript
// apps/mobile/src/services/api.ts, line 118
return parsed as T;  // Returns { success, data } — NOT unwrapped
```

**Fix — Option A (Recommended): Unwrap in apiService**
```typescript
// apps/mobile/src/services/api.ts, line 114-118
if (!response.ok) {
  throw new ApiError(response.status, parsed);
}

// Unwrap the { success, data } envelope
const envelope = parsed as { success?: boolean; data?: unknown };
if (envelope && typeof envelope === 'object' && 'data' in envelope) {
  return envelope.data as T;
}
return parsed as T;
```

**Fix — Option B: Update every hook to expect the envelope**
This is worse because it spreads the concern across 8+ hooks. Option A centralizes it.

**Files:** `apps/mobile/src/services/api.ts` (line 118)

**Test:** After fixing, `apiService.get<FeedResponse>('/feed', {...})` should return `{ posts, nextCursor, hasMore }` directly, NOT `{ success: true, data: { posts, nextCursor, hasMore } }`.

---

### C2. Upload Presigned URL Field Name Mismatch

**Impact:** File uploads (avatar, banner, post media) silently fail. The mobile client tries to PUT to `undefined` URL.

**Root Cause:**
```typescript
// Mobile expects (api.ts line 188):
const { presignedUrl, publicUrl } = await this.post<{
  presignedUrl: string;
  publicUrl: string;
}>('/uploads/presign', { contentType });
```

```typescript
// API actually returns (uploads/presign/route.ts line 46-53):
return NextResponse.json({
  success: true,
  data: {
    uploadUrl: result.uploadUrl,    // ← "uploadUrl" not "presignedUrl"
    publicUrl: result.publicUrl,
    path: result.path,
  },
});
```

Two issues compound: (1) field is `uploadUrl` not `presignedUrl`, (2) it's wrapped in `data` (see C1).

**Fix:** After C1 is fixed (envelope unwrapped), update the mobile destructure:
```typescript
// apps/mobile/src/services/api.ts, line 188
const { uploadUrl, publicUrl } = await this.post<{
  uploadUrl: string;    // ← changed from presignedUrl
  publicUrl: string;
}>('/uploads/presign', { contentType });

await this.uploadFile(uploadUrl, fileUri, contentType);  // ← changed
```

Also, the API expects `{ fileName, contentType, folder }` but mobile sends `{ contentType }` only. Need to add `fileName`:
```typescript
// Generate a filename from the URI or use a UUID
const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${contentType.split('/')[1]}`;
const { uploadUrl, publicUrl } = await this.post<{...}>('/uploads/presign', { fileName, contentType });
```

**Files:** `apps/mobile/src/services/api.ts` (lines 183-198), `apps/api/app/api/uploads/presign/route.ts`

---

### C3. Push Token Registration — Wrong Path & Payload

**Impact:** Push notifications never register. The mobile client POSTs to a path that doesn't exist with the wrong field name.

**Root Cause:**
```typescript
// Mobile sends (NotificationProvider.tsx line 83):
await apiService.post('/users/push-token', { token, platform: Platform.OS });
//                     ^^^^^^^^^^^^^^^^^^    ^^^^^
//                     wrong path            wrong field name
```

```typescript
// API expects (users/me/push-token/route.ts line 10):
const { pushToken } = body;
//      ^^^^^^^^^
//      expects "pushToken" not "token"
// Route path is: /users/me/push-token (not /users/push-token)
```

**Fix:**
```typescript
// apps/mobile/src/providers/NotificationProvider.tsx, line 83
await apiService.post('/users/me/push-token', { pushToken: token });
```

**Files:** `apps/mobile/src/providers/NotificationProvider.tsx` (line 83)

---

### C4. KYC Route Does Not Exist

**Impact:** Creator application flow is completely broken. Hook calls a non-existent endpoint.

**Root Cause:**
```typescript
// Mobile calls (useKyc.ts line 37):
apiService.post<KycApplicationResponse>('/kyc/apply', payload);
//                                       ^^^^^^^^^^
//                                       this route doesn't exist
```

The actual API route is `/creators/apply` (at `apps/api/app/api/creators/apply/route.ts`).

Also, the payload shape doesn't match. Mobile sends `{ tokenSymbol, applicationText, socialLinks }` but API expects `{ firstName, lastName }` (optional).

**Fix:**
```typescript
// apps/mobile/src/hooks/useKyc.ts, line 36-37
mutationFn: (payload) =>
  apiService.post<KycApplicationResponse>('/creators/apply', payload),
```

Also update `KycApplicationPayload` to include `firstName`/`lastName` since the API passes those to Veriff:
```typescript
interface KycApplicationPayload {
  firstName?: string;
  lastName?: string;
  tokenSymbol?: string;      // optional for now, not used by API yet
  applicationText?: string;  // optional for now, not used by API yet
}
```

**Files:** `apps/mobile/src/hooks/useKyc.ts` (lines 6-21, 36-37)

---

### C5. Follow/Unfollow HTTP Method Mismatch

**Impact:** Unfollowing a creator causes a 405 Method Not Allowed error.

**Root Cause:** Mobile sends `DELETE` for unfollow:
```typescript
// useCreatorProfile.ts line 31:
apiService.delete<FollowResponse>(`/creators/${id}/follow`)
```

But the API route at `creators/[id]/follow/route.ts` only exports `POST` (which toggles follow/unfollow internally). There is no `DELETE` export.

**Fix — Option A (Recommended): Change mobile to always POST**
```typescript
// apps/mobile/src/hooks/useCreatorProfile.ts, lines 28-31
mutationFn: ({ creatorId: id }) =>
  apiService.post<FollowResponse>(`/creators/${id}/follow`),
```

Since the API is a toggle, the mobile side doesn't need to tell it "follow" vs "unfollow" — just POST and the API figures it out. The optimistic update on the mobile side still works because it uses local state.

**Fix — Option B: Add DELETE handler to API**
Export a `DELETE` function from the route that only unfollows. This is more RESTful but requires more API changes.

**Files:** `apps/mobile/src/hooks/useCreatorProfile.ts` (lines 28-31)

---

### C6. Like/Unlike HTTP Method Mismatch

**Impact:** Unliking a post causes a 405 Method Not Allowed error. Same pattern as C5.

**Root Cause:**
```typescript
// useLike.ts line 24:
apiService.delete<LikeResponse>(`/posts/${postId}/like`)
```

API only exports `POST` (toggle). No `DELETE` handler.

**Fix — Same as C5, change mobile to always POST:**
```typescript
// apps/mobile/src/hooks/useLike.ts, lines 22-24
mutationFn: ({ postId }) =>
  apiService.post<LikeResponse>(`/posts/${postId}/like`),
```

The API toggles internally. The optimistic update still works.

**Files:** `apps/mobile/src/hooks/useLike.ts` (lines 22-24)

---

### C7. Post Detail Has No Direct API Fetch

**Impact:** If a user navigates to a post via deep link, notification tap, or shared URL, the screen shows "Post not found" because it only reads from the in-memory feed cache.

**Root Cause:**
```typescript
// post/[id].tsx, lines 77-84:
const post = useMemo(() => {
  if (!feedQuery.data?.pages) return undefined;
  for (const page of feedQuery.data.pages) {
    const found = page.posts.find((p) => p.id === id);
    if (found) return found;
  }
  return undefined;
}, [feedQuery.data, id]);
```

If the feed hasn't been loaded yet (cold launch → notification tap), `feedQuery.data` is empty.

**Fix:** Add a dedicated `useQuery` that fetches from `GET /posts/[id]` as a fallback:
```typescript
import { useQuery } from '@tanstack/react-query';

// First try to find in feed cache
const cachedPost = useMemo(() => { /* existing logic */ }, [feedQuery.data, id]);

// Fallback: fetch directly if not in cache
const postQuery = useQuery({
  queryKey: ['post', id],
  queryFn: () => apiService.get<PostWithCreator>(`/posts/${id}`),
  enabled: !!id && !cachedPost,
});

const post = cachedPost ?? postQuery.data;
const isLoading = !cachedPost && postQuery.isLoading;
```

Also the "Post not found" state should show a loading skeleton first, not immediately say "not found."

**Files:** `apps/mobile/app/post/[id].tsx` (lines 69-84, 103-119)

---

<a id="major"></a>
## 🟠 MAJOR GAPS — Significant Feature Holes

> **Status Update (2026-03-10):** M1, M3, M5, M6, M7, M10 resolved. M2 partially resolved (Delete Account done). M4, M8, M9 still open.

---

### ~~M1. Explore Screen Uses Feed Data for CREATORS Tab~~ ✅ RESOLVED

**What:** The CREATORS tab on explore.tsx derives unique creators by deduplicating feed posts (lines 58-78). It should call `GET /creators/nearby` which already exists.

**Current Code:**
```typescript
// explore.tsx lines 58-64
const creatorsMap = new Map<string, PublicCreator>();
posts.forEach((post: PostWithCreator) => {
  if (!creatorsMap.has(post.creator.id)) {
    creatorsMap.set(post.creator.id, post.creator);
  }
});
```

**Fix:** Create a `useNearbyCreators` hook:
```typescript
export function useNearbyCreators() {
  const { location } = useLocation();
  return useQuery({
    queryKey: ['creators', 'nearby', location?.latitude, location?.longitude],
    queryFn: () => apiService.get('/creators/nearby', {
      lat: location?.latitude,
      lng: location?.longitude,
      radius: 50,
    }),
    enabled: !!location,
  });
}
```

Wire into explore.tsx's CREATORS tab.

**Files:** `apps/mobile/app/(tabs)/explore.tsx`, new hook `apps/mobile/src/hooks/useNearbyCreators.ts`

---

### M2. Settings Sub-Screens All Show ComingSoonModal — ⚠️ PARTIAL (Delete Account done)

**What:** The SettingsSheet has 5 menu items (Favorites, Account Privacy, Device Permissions, Vault, Delete Account) but all just trigger ComingSoonModal.

**Priority Screens to Implement:**
1. **Delete Account** — most important for App Store compliance
2. **Account Privacy** — visibility settings
3. **Vault** — wallet connect/import flow
4. **Favorites** — saved posts/creators
5. **Device Permissions** — links to OS settings

**Files:** `apps/mobile/app/(tabs)/profile.tsx` (handleSettingsNavigate callback)

---

### ~~M3. No Comment Creation~~ ✅ RESOLVED

**What:** `post/[id].tsx` has a TextInput and send button but `handleSendComment` (line 96) just clears the input. No API call.

**Current Code:**
```typescript
// post/[id].tsx lines 96-101
const handleSendComment = useCallback(() => {
  if (!commentText.trim()) return;
  // In production this would call an API
  setCommentText('');
  inputRef.current?.blur();
}, [commentText]);
```

**Fix:** Create `useCreateComment` hook calling `POST /posts/[id]/comments`.

**Files:** `apps/mobile/app/post/[id].tsx`, new hook `apps/mobile/src/hooks/useCreateComment.ts`

---

### M4. No Comment Deletion — 🔴 OPEN

**What:** API has `DELETE /comments/[id]/route.ts` but no mobile hook or UI swipe-to-delete.

---

### ~~M5. User Location Never Synced to Server~~ ✅ RESOLVED

**What:** `LocationProvider` captures GPS locally but never calls `PATCH /users/me/location` to sync location to the database. The API route exists and updates the PostGIS geography column.

**Fix:** Add a `useEffect` in LocationProvider that calls the API when location changes significantly (>500m or first capture).

**Files:** `apps/mobile/src/providers/LocationProvider.tsx`

---

### ~~M6. Creator Application Flow Incomplete~~ ✅ RESOLVED (uses Linking.openURL)

**What:** Beyond C4 (wrong endpoint), the Veriff redirect URL returned by the API isn't handled. The mobile hook gets back a `verificationUrl` but nothing opens it in a WebView or browser.

**Fix:** After `apiService.post('/creators/apply')` returns `{ verificationUrl }`, open it with `expo-linking` or `expo-web-browser`.

**Files:** `apps/mobile/src/hooks/useKyc.ts`, `apps/mobile/app/edit-profile.tsx`

---

### ~~M7. No Deep Linking / URL Scheme~~ ✅ RESOLVED (scheme already configured)

**What:** `expo-linking` is installed but no URL scheme is configured in `app.json`. Notifications that push routes like `/post/123` won't work from cold launch.

**Fix:** Add linking config to `app.json`:
```json
{
  "expo": {
    "scheme": "momento",
    "plugins": [["expo-router", { "root": "app" }]]
  }
}
```

**Files:** `apps/mobile/app.json`

---

### M8. No Offline Support — 🔴 OPEN

**What:** React Query has no persistence layer. If the app loses network, all screens show loading forever.

**Fix:** Add `@tanstack/react-query-persist-client` with `expo-file-system` storage adapter.

---

### M9. No Image Compression Before Upload — 🔴 OPEN

**What:** `useUpload.ts` sends images at full resolution (only `quality: 0.8` via ImagePicker). Large photos can be 5-10MB.

**Fix:** Add `expo-image-manipulator` to resize before upload:
```typescript
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
const compressed = await manipulateAsync(uri, [{ resize: { width: 1200 } }], {
  compress: 0.8,
  format: SaveFormat.JPEG,
});
```

**Files:** `apps/mobile/src/hooks/useUpload.ts`

---

### ~~M10. Shared Types May Not Match API Responses~~ ✅ RESOLVED

**What:** `PostWithCreator`, `FeedResponse`, `PublicCreator`, etc. in `packages/shared/src/types.ts` are hand-written. They may drift from what the API actually returns (e.g., the Prisma query in feed/route.ts adds `distanceMeters`, the raw SQL column names may differ).

**Risk:** TypeScript "compiles" but runtime data doesn't match the type.

**Fix:** Audit each type against the actual API response shape. Consider generating types from Prisma schema or using zod for runtime validation.

---

<a id="minor"></a>
## 🟡 MINOR GAPS — Polish & Quality

| # | Gap | Files | Fix |
|---|-----|-------|-----|
| m1 | Placeholder PNGs (1x1 transparent) for notification-icon.png and adaptive-icon.png | `apps/mobile/assets/` | Replace with real branded assets |
| m2 | No app icon or splash screen (Expo defaults) | `apps/mobile/app.json`, `assets/` | Design and add proper assets |
| m3 | No pull-to-refresh on explore or market screens | `explore.tsx`, `market.tsx` | Add `RefreshControl` like home.tsx |
| m4 | Tab icons use Ionicons strings, not custom SVGs from Figma | `(tabs)/_layout.tsx` | Replace with custom SVG icons |
| m5 | No KeyboardAvoidingView on `create-post.tsx` or `edit-profile.tsx` | Modal screens | Wrap forms in `KeyboardAvoidingView` |
| m6 | `pnpm approve-builds` never run — Prisma client not generated | Root | Must run before first `dev` or `build` |
| m7 | No `.env.local.example` for landing app | `apps/landing/` | Create with placeholder vars |
| m8 | API seed script (`prisma/seed.ts`) untested | `apps/api/prisma/seed.ts` | Run and verify after DB setup |
| m9 | No rate limiting on API routes (including `/api/waitlist`) | All API routes | Add middleware or per-route rate limits |
| m10 | Missing `aria-label` on landing page interactive elements | Landing components | Add for accessibility |
| m11 | ~~Landing page social links~~ | ~~`FinalCta.tsx`, `Footer.tsx`~~ | ✅ FIXED — X and Instagram links updated |
| m12 | ~~No favicon for landing page~~ | ~~`apps/landing/public/`~~ | ✅ FIXED — favicon.svg + logo SVGs added |
| m13 | PortfolioChart uses hardcoded dummy data | `PortfolioChart.tsx` | Wire to real wallet history API |
| m14 | SwapModal is UI-only — no swap execution | `SwapModal.tsx` | Integrate Jupiter aggregator |
| m15 | Market screen uses dummy data — no API for token rankings | `market.tsx` | Build market data API route |
| m16 | Post detail shows hardcoded DUMMY_COMMENTS | `post/[id].tsx` lines 27-67 | Fetch real comments from `GET /posts/[id]/comments` |

---

<a id="nice-to-have"></a>
## 🔵 NICE-TO-HAVE — Future Improvements

| # | Improvement | Notes |
|---|-------------|-------|
| n1 | Test suite (zero test files exist) | Jest + React Testing Library for hooks, Playwright for API |
| n2 | CI/CD pipeline | GitHub Actions for lint/type-check/test, Vercel for API+landing, EAS for mobile |
| n3 | Sentry error reporting | `@sentry/react-native` + `@sentry/nextjs` |
| n4 | Analytics (Mixpanel/Amplitude) | Track key events: signup, first buy, post creation |
| n5 | React Query devtools | `@tanstack/react-query-devtools` in dev builds |
| n6 | Storybook for component library | Document primitives + features in isolation |
| n7 | ESLint + Prettier config | Referenced in scripts but not configured |
| n8 | Real-time price updates (WebSocket) | For live token price movement on market screen |
| n9 | Push notification deep link handling | Wire notification taps to correct screens (partially done) |
| n10 | i18n/Internationalization | For global launch |

---

<a id="remaining-work"></a>
## Remaining Work — What an Agent Can Tackle Next

> All critical gaps (C1-C7) and most major gaps are resolved as of 2026-03-10.
> See `docs/NEXT_STEPS.md` for the detailed, phased execution plan.

### Still Open (Agent-Executable)

| # | Gap | Priority | Effort |
|---|-----|----------|--------|
| M2 | Settings sub-screens (Account Privacy, Device Permissions, Favorites) | Medium | Medium |
| M4 | Comment deletion (swipe-to-delete UI + hook) | Medium | Small |
| M8 | Offline support (React Query persistence) | Medium | Medium |
| M9 | Image compression before upload | Medium | Small |
| m7 | Landing page `.env.local.example` | Low | Trivial |
| m9 | API rate limiting middleware | High | Medium |
| m10 | Landing page `aria-label` accessibility | Low | Small |
| n1 | Test suite (zero tests exist) | High | Large |
| n2 | CI/CD pipeline (GitHub Actions) | High | Medium |
| n7 | ESLint + Prettier configuration | Medium | Small |

### Still Open (Requires Human Intervention)

| # | Gap | Why Human Needed |
|---|-----|-----------------|
| m1 | Placeholder PNGs | Requires branded design assets |
| m2 | App icon + splash screen | Requires branded design assets |
| m4 | Custom SVG tab icons | Requires Figma exports |
| m13 | PortfolioChart real data | Requires price oracle API (Phase 2 roadmap) |
| m14 | SwapModal execution | Requires Jupiter aggregator integration (Phase 2) |
| m15 | Market screen real data | Requires market data API (Phase 2) |
| n3 | Sentry error reporting | Requires Sentry account + DSN |
| n4 | Analytics (Mixpanel/Amplitude) | Requires analytics account |

### Completed (Phases 1-4)

All critical gaps C1-C7, plus M1, M3, M5, M6, M7, M10, m3, m5, m11, m12, m16, and Delete Account (from M2).
