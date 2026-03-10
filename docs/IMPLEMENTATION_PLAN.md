# Momento — Implementation Plan: Agent-Executable Code Work

> Generated 2026-03-10 after deep-dive audit of GAPS.md, architecture docs, and source code verification.
> This plan covers ONLY work an AI agent can execute autonomously — no external service setup, no App Store submissions, no design assets.

---

## Verified Gap Status (Source Code Audit)

Before planning, every gap from GAPS.md was verified against the actual source code. Here are the confirmed findings:

| Gap | Status | Verified Details |
|-----|--------|------------------|
| C1 | **CONFIRMED** | `api.ts:118` returns raw `{ success, data }` envelope — never unwrapped |
| C2 | **CONFIRMED** | `api.ts:188` destructures `presignedUrl` but API returns `uploadUrl`. Also missing `fileName` in request body |
| C3 | **CONFIRMED** | `NotificationProvider.tsx:83` POSTs to `/users/push-token` with `{ token }` — API expects `/users/me/push-token` with `{ pushToken }` |
| C4 | **CONFIRMED** | `useKyc.ts:37` POSTs to `/kyc/apply` — API route is `/creators/apply`. Payload shape mismatch too |
| C5 | **CONFIRMED** | `useCreatorProfile.ts:31` uses `apiService.delete()` for unfollow — API only exports POST (toggle) |
| C6 | **CONFIRMED** | `useLike.ts:24` uses `apiService.delete()` for unlike — API only exports POST (toggle) |
| C7 | **CONFIRMED** | `post/[id].tsx` only searches feed cache via `useMemo` — no direct API fetch. `GET /posts/[id]` exists on the API |
| M1 | **CONFIRMED** | `explore.tsx` derives creators from feed posts — `GET /creators/nearby` API exists but is unused |
| M3 | **CONFIRMED** | `post/[id].tsx:96-101` — `handleSendComment` clears input but makes no API call. `POST /posts/[id]/comments` exists |
| M4 | **CONFIRMED** | No comment deletion UI or hook. `DELETE /comments/[id]` API exists |
| M5 | **CONFIRMED** | `LocationProvider.tsx` captures GPS locally, never calls `PATCH /users/me/location` |
| M6 | **CONFIRMED** | `useKyc.ts` gets back response but never opens the `verificationUrl` in browser |
| M7 | **PARTIAL** | `app.json` already has `"scheme": "momento"` — deep link routing config may still need work |
| m16 | **CONFIRMED** | `post/[id].tsx` uses hardcoded `DUMMY_COMMENTS` array. `GET /posts/[id]/comments` API exists |

---

## Plan Overview

The plan is organized into 4 sequential phases, ordered by dependency. Each phase is a self-contained unit of work with no external service or human intervention required.

### Phase 1: API Contract Fixes (Foundation) — COMPLETED 2026-03-10
Fix the data layer so the mobile app can actually communicate with the API. Everything else depends on this.

### Phase 2: Missing Features (Core UX) — COMPLETED 2026-03-10
Wire up features that have API endpoints but no mobile integration: comments, location sync, explore creators.

### Phase 3: Creator Flow & Navigation
Complete the creator application flow and ensure deep link navigation works end-to-end.

### Phase 4: Polish & Hardening
Pull-to-refresh, keyboard handling, delete account stub, type safety audit.

---

## Phase 1: API Contract Fixes — COMPLETED

**Why first:** Every hook receives the wrong data shape. Nothing works until C1 is fixed, and C2-C6 are quick wins in the same pass.

> **Status:** All 6 tasks completed, reviewed, committed (SHA: 9e41649), and pushed. All changes verified against API contracts.

### Task 1.1 — Unwrap API Response Envelope (C1)

**File:** `apps/mobile/src/services/api.ts`
**Line:** 118

**Change:** After `parsed` is obtained and the response is `ok`, unwrap the `{ success, data }` envelope before returning:

```typescript
// Line 114-118, replace:
if (!response.ok) {
  throw new ApiError(response.status, parsed);
}
return parsed as T;

// With:
if (!response.ok) {
  throw new ApiError(response.status, parsed);
}

// Unwrap the { success, data } envelope used by all API routes
const envelope = parsed as { success?: boolean; data?: unknown };
if (
  envelope &&
  typeof envelope === 'object' &&
  'data' in envelope &&
  envelope.success === true
) {
  return envelope.data as T;
}
return parsed as T;
```

**Rationale:** Centralizing the unwrap in `apiService` means zero changes needed in any hook. Every `useQuery`/`useMutation` immediately starts receiving the correct shape.

**Verification:** After this change, `apiService.get<FeedResponse>('/feed', {...})` returns `{ posts, nextCursor, hasMore }` directly instead of `{ success: true, data: { posts, nextCursor, hasMore } }`.

---

### Task 1.2 — Fix Upload Presigned URL Field Names (C2)

**File:** `apps/mobile/src/services/api.ts`
**Lines:** 188-194

**Changes:**
1. Rename destructured field from `presignedUrl` to `uploadUrl` (matching API response)
2. Add `fileName` generation (API requires it in request body)

```typescript
async uploadWithPresignedUrl(
  fileUri: string,
  contentType: string,
): Promise<{ url: string }> {
  const ext = contentType.split('/')[1] || 'bin';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { uploadUrl, publicUrl } = await this.post<{
    uploadUrl: string;
    publicUrl: string;
  }>('/uploads/presign', { fileName, contentType });

  await this.uploadFile(uploadUrl, fileUri, contentType);

  return { url: publicUrl };
}
```

**Note:** After Task 1.1, the `{ success, data }` envelope is already unwrapped, so the destructure reads directly from the API's `data` payload.

---

### Task 1.3 — Fix Push Token Registration (C3)

**File:** `apps/mobile/src/providers/NotificationProvider.tsx`
**Line:** 83

**Changes:**
1. Path: `/users/push-token` → `/users/me/push-token`
2. Field name: `{ token, platform }` → `{ pushToken: token }`

```typescript
await apiService.post('/users/me/push-token', { pushToken: token });
```

---

### Task 1.4 — Fix KYC Endpoint Path (C4)

**File:** `apps/mobile/src/hooks/useKyc.ts`
**Line:** 37

**Changes:**
1. Path: `/kyc/apply` → `/creators/apply`
2. Update `KycApplicationPayload` to include optional `firstName`/`lastName` (API passes these to Veriff)

```typescript
interface KycApplicationPayload {
  firstName?: string;
  lastName?: string;
  tokenSymbol?: string;
  applicationText?: string;
  socialLinks?: { ... };  // keep existing
}
```

Mutation change:
```typescript
mutationFn: (payload) =>
  apiService.post<KycApplicationResponse>('/creators/apply', payload),
```

---

### Task 1.5 — Fix Follow: DELETE → POST (C5)

**File:** `apps/mobile/src/hooks/useCreatorProfile.ts`
**Line:** 31

**Change:** The API is a toggle — always POST. Remove the conditional:

```typescript
mutationFn: ({ creatorId: id }) =>
  apiService.post<FollowResponse>(`/creators/${id}/follow`),
```

The `follow` boolean in the mutation input is still used for the optimistic update — just not for choosing the HTTP method.

---

### Task 1.6 — Fix Like: DELETE → POST (C6)

**File:** `apps/mobile/src/hooks/useLike.ts`
**Lines:** 21-24

**Change:** Same pattern as C5 — always POST:

```typescript
mutationFn: ({ postId }) =>
  apiService.post<LikeResponse>(`/posts/${postId}/like`),
```

The `liked` boolean is still used for optimistic updates, not for HTTP method selection.

---

## Phase 2: Missing Features (Core UX) — COMPLETED

**Why second:** With the data layer fixed, we can now wire up features that have backend API support but no mobile integration.

> **Status:** All 5 tasks completed, reviewed, committed (SHA: 98a62c2), and pushed. 3 new hooks created, 5 existing files updated, CommentsResponse type added.

### Task 2.1 — Post Detail: Direct API Fetch Fallback (C7)

**File:** `apps/mobile/app/post/[id].tsx`

**Changes:**
1. Add a `useQuery` that fetches from `GET /posts/[id]` when the post isn't in the feed cache
2. Show loading skeleton instead of immediately showing "Post not found"

```typescript
import { useQuery } from '@tanstack/react-query';

// Existing: try to find in feed cache
const cachedPost = useMemo(() => { /* existing logic */ }, [feedQuery.data, id]);

// NEW: fallback fetch
const postQuery = useQuery({
  queryKey: ['post', id],
  queryFn: () => apiService.get<PostWithCreator>(`/posts/${id}`),
  enabled: !!id && !cachedPost,
});

const post = cachedPost ?? postQuery.data;
const isLoading = !cachedPost && postQuery.isLoading;
```

Update the "not found" state to check `isLoading` first.

---

### Task 2.2 — Fetch Real Comments (m16)

**New file:** `apps/mobile/src/hooks/useComments.ts`

Create hook calling `GET /posts/[id]/comments` with cursor pagination:

```typescript
export function useComments(postId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['comments', postId],
    queryFn: ({ pageParam }) =>
      apiService.get<CommentsResponse>(`/posts/${postId}/comments`, {
        cursor: pageParam,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!postId,
  });
}
```

**File changes:**
- `apps/mobile/app/post/[id].tsx` — Remove `DUMMY_COMMENTS`, use `useComments(id)` instead
- `apps/mobile/src/hooks/index.ts` — Add export
- `packages/shared/src/types.ts` — Add `CommentsResponse` type if not present

---

### Task 2.3 — Comment Creation (M3)

**New file:** `apps/mobile/src/hooks/useCreateComment.ts`

Create hook calling `POST /posts/[id]/comments`:

```typescript
export function useCreateComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>
      apiService.post(`/posts/${postId}/comments`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      // Also bump commentCount in cached post/feed data
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
```

**File changes:**
- `apps/mobile/app/post/[id].tsx` — Wire `handleSendComment` to call this mutation
- `apps/mobile/src/hooks/index.ts` — Add export

---

### Task 2.4 — Explore: Wire Nearby Creators API (M1)

**New file:** `apps/mobile/src/hooks/useNearbyCreators.ts`

```typescript
export function useNearbyCreators() {
  const { location } = useLocation();
  return useQuery({
    queryKey: ['creators', 'nearby', location?.latitude, location?.longitude],
    queryFn: () =>
      apiService.get<NearbyCreatorsResponse>('/creators/nearby', {
        lat: location?.latitude,
        lng: location?.longitude,
        radius: 50,
      }),
    enabled: !!location,
  });
}
```

**File changes:**
- `apps/mobile/app/(tabs)/explore.tsx` — Replace the `creatorsMap` derivation logic with `useNearbyCreators()` for the CREATORS tab
- `apps/mobile/src/hooks/index.ts` — Add export

---

### Task 2.5 — Sync User Location to Server (M5)

**File:** `apps/mobile/src/providers/LocationProvider.tsx`

Add a `useEffect` that calls `PATCH /users/me/location` when:
- Location is first captured
- Location changes by more than 500m from the last synced position

```typescript
const lastSyncedLocation = useRef<{ lat: number; lng: number } | null>(null);

useEffect(() => {
  if (!location) return;

  const shouldSync =
    !lastSyncedLocation.current ||
    getDistanceMeters(
      lastSyncedLocation.current.lat,
      lastSyncedLocation.current.lng,
      location.latitude,
      location.longitude,
    ) > 500;

  if (shouldSync) {
    apiService
      .patch('/users/me/location', {
        latitude: location.latitude,
        longitude: location.longitude,
      })
      .then(() => {
        lastSyncedLocation.current = {
          lat: location.latitude,
          lng: location.longitude,
        };
      })
      .catch(() => {
        // Non-critical — silently retry on next location change
      });
  }
}, [location]);
```

Include a simple Haversine `getDistanceMeters` helper inline or in utils.

---

## Phase 3: Creator Flow & Navigation

### Task 3.1 — Open Veriff URL After Creator Application (M6)

**File:** `apps/mobile/src/hooks/useKyc.ts`

After the mutation succeeds and returns `{ verificationUrl }`, open it using `expo-web-browser`:

```typescript
import * as WebBrowser from 'expo-web-browser';

// In the mutation's onSuccess:
onSuccess: async (data) => {
  if (data.verificationUrl) {
    await WebBrowser.openBrowserAsync(data.verificationUrl);
  }
},
```

Also update `KycApplicationResponse` to include the `verificationUrl` field:

```typescript
interface KycApplicationResponse {
  status: string;
  verificationUrl?: string;
  sessionId?: string;
  message?: string;
}
```

**Dependency:** Requires `expo-web-browser` to be installed. Check if it's already in `package.json`; if not, add it.

---

### Task 3.2 — Deep Link Routing Configuration (M7 — partial)

**Status:** `app.json` already has `"scheme": "momento"`. The remaining work is ensuring expo-router's linking configuration handles incoming URLs.

**File:** `apps/mobile/app/_layout.tsx`

Verify that the root layout's `<Stack>` navigator handles URL patterns like:
- `momento://post/{id}` → `post/[id].tsx`
- `momento://creator/{id}` → `creator/[id].tsx`

Expo Router handles this automatically via file-based routing when the scheme is set. The main gap is that `NotificationProvider.tsx` already routes on notification tap (lines 112-118), so this should work. Verify and add any missing `Stack.Screen` entries if needed.

---

## Phase 4: Polish & Hardening

### Task 4.1 — Pull-to-Refresh on Explore and Market Screens (m3)

**Files:**
- `apps/mobile/app/(tabs)/explore.tsx`
- `apps/mobile/app/market.tsx`

Add `RefreshControl` to the `ScrollView`/`FlatList` in each screen, matching the pattern already used in `home.tsx`.

---

### Task 4.2 — KeyboardAvoidingView on Form Screens (m5)

**Files:**
- `apps/mobile/app/create-post.tsx`
- `apps/mobile/app/edit-profile.tsx`

Wrap form content in `KeyboardAvoidingView` with `behavior="padding"` (iOS) / `behavior="height"` (Android).

---

### Task 4.3 — Delete Account Screen (M2 — priority item)

**File:** `apps/mobile/app/(tabs)/profile.tsx` (or new screen)

Implement a "Delete Account" flow that:
1. Shows a confirmation dialog
2. Calls `DELETE /users/me` (needs API route — create if missing)
3. Clears local state and redirects to login

This is the **most important** settings sub-screen for App Store compliance.

**API side:** Check if `DELETE /users/me` exists. If not, create it at `apps/api/app/api/users/me/route.ts` — it should soft-delete or fully delete the user record and all associated data.

---

### Task 4.4 — Shared Types Audit (M10)

**File:** `packages/shared/src/types.ts`

Audit each shared type against the actual API response. Key types to verify:
- `FeedResponse` — does it match `GET /feed` response after envelope unwrap?
- `PostWithCreator` — does it include `isLiked`, `distanceMeters`?
- `CommentsResponse` — add if missing (for Task 2.2)
- `NearbyCreatorsResponse` — add if missing (for Task 2.4)

---

## Execution Summary

| Phase | Tasks | Files Modified | Files Created | Depends On |
|-------|-------|---------------|---------------|------------|
| 1 | 1.1–1.6 | 5 existing | 0 | Nothing |
| 2 | 2.1–2.5 | 4 existing | 3 new hooks | Phase 1 (envelope unwrap) |
| 3 | 3.1–3.2 | 2 existing | 0 | Phase 1 (KYC path fix) |
| 4 | 4.1–4.4 | 4-6 existing | 0-1 (delete account API) | Phases 1-2 |

### Total scope:
- **15 tasks** across 4 phases
- **~15 existing files modified**
- **~3 new files created** (hooks)
- **0 human intervention required**
- **0 external service setup required**

### What is explicitly OUT OF SCOPE (requires human):
- External service account creation (Supabase, Privy, Veriff, etc.)
- Design assets (app icons, splash screen, custom SVG icons)
- App Store submissions (Apple, Google Play)
- Domain & DNS configuration
- CI/CD pipeline setup (GitHub Actions, Vercel linking)
- Sentry / analytics integration
- Real price oracle / swap execution (Phase 2 roadmap)
