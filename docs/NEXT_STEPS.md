# Momento — Next Steps: Agent-Executable Work Plan

> Generated 2026-03-10 after verifying all Phases 1-4 are complete.
> This plan covers ONLY work an AI agent can execute autonomously — no external service accounts, no design assets, no App Store submissions.

---

## Current State Summary

All 7 critical API contract bugs (C1-C7) are fixed. Core features (comments, nearby creators, location sync, post detail fallback, creator application, deep linking, delete account, pull-to-refresh, keyboard handling, types audit) are all implemented and committed.

**What's working:** The mobile app can correctly communicate with the API. All hooks return the right data shapes. Users can view feeds, like posts, follow creators, create posts, write comments, apply as creators, and delete their accounts.

**What's missing:** Developer tooling (linting, testing, CI), API hardening (rate limiting), and several medium-priority features (comment deletion, image compression, offline support, remaining settings screens).

---

## Plan: 5 Phases, Ordered by Impact

### Phase 5: Developer Tooling & Code Quality Foundation
**Why first:** Every subsequent phase benefits from linting, formatting, and a CI pipeline that catches regressions. This is the highest-leverage work an agent can do right now.

### Phase 6: API Hardening & Security
**Why second:** Rate limiting and input validation protect the API before any public traffic hits it. These are prerequisites for production.

### Phase 7: Missing Mobile Features
**Why third:** Comment deletion, image compression, and offline support complete the core UX.

### Phase 8: Settings & Account Management
**Why fourth:** Remaining settings screens (Account Privacy, Device Permissions, Favorites) are lower priority but needed for App Store compliance.

### Phase 9: Waitlist Persistence & Landing Polish
**Why last:** The landing page waitlist uses ephemeral `/tmp` storage on Vercel. Moving it to the database is important but doesn't block mobile development.

---

## Phase 5: Developer Tooling & Code Quality Foundation

### Task 5.1 — ESLint + Prettier Configuration

**Scope:** Configure ESLint and Prettier for the entire monorepo.

**Files to create/modify:**
- `.eslintrc.js` (root) — Shared base config
- `.prettierrc` (root) — Formatting rules
- `apps/api/.eslintrc.js` — Next.js-specific rules
- `apps/mobile/.eslintrc.js` — React Native-specific rules
- `apps/landing/.eslintrc.js` — Next.js-specific rules
- `package.json` (root) — Add `lint` and `format` scripts

**Configuration:**
```
ESLint: @typescript-eslint/parser + @typescript-eslint/eslint-plugin
  + eslint-plugin-react + eslint-plugin-react-hooks (mobile + landing)
  + eslint-config-next (api + landing)
  + eslint-plugin-import (import ordering)
Prettier: single quotes, trailing commas, 100 char line width, 2-space indent
```

**Package installs (root devDependencies):**
```
eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
eslint-plugin-react eslint-plugin-react-hooks eslint-config-next
eslint-plugin-import prettier eslint-config-prettier
```

**Turbo task:** Add `"lint"` to `turbo.json` pipeline.

**Acceptance:** `pnpm lint` runs across all workspaces without crashing. Fix any auto-fixable issues but don't chase down every warning — just get the config in place.

---

### Task 5.2 — TypeScript Strict Mode Verification

**Scope:** Ensure all `tsconfig.json` files have strict mode enabled and verify the codebase compiles.

**Files:**
- `apps/api/tsconfig.json`
- `apps/mobile/tsconfig.json`
- `apps/landing/tsconfig.json`
- `packages/shared/tsconfig.json`

**Actions:**
1. Ensure `"strict": true` in all tsconfigs
2. Run `pnpm tsc --noEmit` in each workspace
3. Fix any type errors that surface (should be minimal given the types audit in Phase 4)

**Acceptance:** `pnpm turbo run type-check` passes across all workspaces.

---

### Task 5.3 — Test Infrastructure Setup

**Scope:** Set up Jest (or Vitest) with React Testing Library. Create initial test files for critical hooks and API routes.

**Files to create:**
- `jest.config.ts` (root or per-workspace)
- `apps/mobile/jest.config.ts`
- `apps/mobile/jest.setup.ts`
- `apps/api/jest.config.ts`

**Priority test files to create:**
1. `apps/mobile/src/services/__tests__/api.test.ts` — Test envelope unwrapping, error handling, auth header injection
2. `apps/mobile/src/hooks/__tests__/useFeed.test.ts` — Test infinite query, auto-expanding radius
3. `apps/mobile/src/hooks/__tests__/useLike.test.ts` — Test optimistic update + rollback
4. `apps/mobile/src/hooks/__tests__/useCreateComment.test.ts` — Test mutation + cache invalidation
5. `apps/api/app/api/feed/__tests__/route.test.ts` — Test feed endpoint response shape
6. `apps/api/app/api/posts/__tests__/route.test.ts` — Test post CRUD
7. `packages/shared/src/__tests__/types.test.ts` — Test enum values, type guards

**Package installs:**
```
jest @types/jest ts-jest
@testing-library/react-native @testing-library/jest-native
jest-expo (for mobile)
```

**Acceptance:** `pnpm test` runs and at least 7 test files pass. Test coverage isn't the goal — having the infrastructure in place is.

---

### Task 5.4 — CI/CD Pipeline (GitHub Actions)

**Scope:** Create GitHub Actions workflow for PR checks.

**File to create:** `.github/workflows/ci.yml`

**Pipeline steps:**
1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (ESLint)
3. `pnpm turbo run type-check` (TypeScript)
4. `pnpm test` (Jest)
5. `pnpm turbo run build` (verify builds succeed — API + landing)

**Triggers:** On push to `main`, on PR to `main`.

**Acceptance:** Workflow file is valid YAML, references correct pnpm version (10.30.0), uses Node 20.x, and caches `node_modules` via `pnpm store`.

---

## Phase 6: API Hardening & Security

### Task 6.1 — Rate Limiting Middleware

**Scope:** Add per-route rate limiting to prevent abuse.

**Approach:** Use Upstash Redis (already configured) with `@upstash/ratelimit`:

**File to create:** `apps/api/lib/ratelimit.ts`
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './redis';

// General API rate limit: 100 requests per 60 seconds
export const generalRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '60 s'),
});

// Write-heavy endpoints: 20 requests per 60 seconds
export const writeRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '60 s'),
});

// Auth-sensitive endpoints: 5 requests per 60 seconds
export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
});
```

**Files to modify:** Apply rate limiting to these routes:
- `apps/api/app/api/feed/route.ts` — `generalRateLimit`
- `apps/api/app/api/posts/route.ts` (POST) — `writeRateLimit`
- `apps/api/app/api/creators/apply/route.ts` — `authRateLimit`
- `apps/api/app/api/uploads/presign/route.ts` — `writeRateLimit`
- `apps/landing/app/api/waitlist/route.ts` — `authRateLimit`

**Package install:** `@upstash/ratelimit`

**Acceptance:** Rate-limited routes return `429 Too Many Requests` with `Retry-After` header when exceeded.

---

### Task 6.2 — Input Validation with Zod

**Scope:** Add runtime validation to API route request bodies. Currently, routes destructure request bodies without validation, which can cause cryptic errors or unexpected behavior.

**File to create:** `apps/api/lib/validation.ts` — Zod schemas for each endpoint's input.

**Schemas to define:**
- `CreatePostSchema` — `{ postType, caption?, mediaUrl?, latitude, longitude }`
- `CreateCommentSchema` — `{ content: string }`
- `CreatorApplySchema` — `{ firstName?, lastName? }`
- `UploadPresignSchema` — `{ fileName, contentType }`
- `LocationUpdateSchema` — `{ latitude: number, longitude: number }`
- `PushTokenSchema` — `{ pushToken: string }`

**Files to modify:** Each API route that accepts a body — add `schema.parse(body)` with a try/catch that returns `400` on `ZodError`.

**Package install:** `zod`

**Acceptance:** Invalid payloads return `400` with structured error messages. Valid payloads continue to work as before.

---

### Task 6.3 — API DELETE User Route

**Scope:** Verify the `DELETE /users/me` route exists and properly handles cascading deletes.

**File:** `apps/api/app/api/users/me/route.ts`

**Check:** The mobile app already calls `apiService.delete('/users/me')` — verify the API route:
1. Exports a `DELETE` handler
2. Requires authentication
3. Cascading deletes: posts, comments, likes, follows, KYC records
4. Returns `{ success: true }` on completion

If the route doesn't exist, create it.

---

## Phase 7: Missing Mobile Features

### Task 7.1 — Comment Deletion (M4)

**Scope:** Add swipe-to-delete for comments on the post detail screen.

**Files to create:**
- `apps/mobile/src/hooks/useDeleteComment.ts`

**Hook:**
```typescript
export function useDeleteComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      apiService.delete(`/comments/${commentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
```

**Files to modify:**
- `apps/mobile/app/post/[id].tsx` — Add swipe-to-delete gesture or long-press menu on own comments
- `apps/mobile/src/hooks/index.ts` — Export new hook

**Acceptance:** Users can delete their own comments. Other users' comments don't show the delete option.

---

### Task 7.2 — Image Compression Before Upload (M9)

**Scope:** Compress images before uploading to reduce bandwidth and storage costs.

**File to modify:** `apps/mobile/src/hooks/useUpload.ts`

**Changes:**
1. Add `expo-image-manipulator` dependency
2. Before calling `uploadWithPresignedUrl`, resize image to max 1200px width and compress to 80% quality
3. Skip compression for non-image content types

```typescript
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

async function compressImage(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.8, format: SaveFormat.JPEG }
  );
  return result.uri;
}
```

**Package install:** `expo-image-manipulator`

**Acceptance:** Uploaded images are resized and compressed. Original quality is preserved for images smaller than 1200px wide.

---

### Task 7.3 — Offline Support with React Query Persistence (M8)

**Scope:** Persist React Query cache to disk so the app shows cached data when offline.

**File to modify:** `apps/mobile/src/providers/QueryProvider.tsx`

**Changes:**
1. Add `@tanstack/react-query-persist-client` and `expo-file-system` dependencies
2. Create an AsyncStorage-based persister (or expo-file-system)
3. Wrap the `QueryClientProvider` with `PersistQueryClientProvider`

**Package installs:** `@tanstack/react-query-persist-client`

**Acceptance:** App shows cached feed/profile data on cold launch before network requests complete. Offline state shows stale data with a visual indicator rather than loading spinners.

---

## Phase 8: Settings & Account Management

### Task 8.1 — Account Privacy Screen

**Scope:** Implement the Account Privacy settings screen.

**File to create:** `apps/mobile/app/settings/privacy.tsx`

**Features:**
- Toggle: "Private Profile" (hide from explore/nearby)
- Toggle: "Show Location on Posts" (default on)
- Toggle: "Allow Direct Messages" (future-proofing, disabled state)

**API:** May need a `PATCH /users/me` extension to store privacy preferences. Check if the User model has fields for these — if not, add them to the Prisma schema and create a migration.

---

### Task 8.2 — Device Permissions Screen

**Scope:** Implement a screen that shows current permission states and links to OS settings.

**File to create:** `apps/mobile/app/settings/permissions.tsx`

**Features:**
- Show status of: Location, Camera, Notifications, Photo Library
- Each row shows current permission state (Granted/Denied/Not Asked)
- "Open Settings" button that calls `Linking.openSettings()`

**No API changes needed** — this is purely client-side using `expo-location`, `expo-camera`, `expo-notifications` permission APIs.

---

### Task 8.3 — Wire Settings Navigation

**Scope:** Replace ComingSoonModal for Account Privacy and Device Permissions with actual navigation.

**File to modify:** `apps/mobile/app/(tabs)/profile.tsx` — Update `handleSettingsNavigate` to route to new screens instead of showing ComingSoonModal.

**File to modify:** `apps/mobile/app/_layout.tsx` — Add `Stack.Screen` entries for new settings screens.

---

## Phase 9: Waitlist Persistence & Landing Polish

### Task 9.1 — Landing Page `.env.local.example`

**Scope:** Create an environment variable template for the landing app.

**File to create:** `apps/landing/.env.local.example`

**Contents:**
```bash
# Currently no required env vars for the landing page.
# The waitlist API uses local /tmp storage on Vercel.
# To persist signups, add database credentials here in the future.
# DATABASE_URL=""
```

---

### Task 9.2 — Landing Page Accessibility (m10)

**Scope:** Add `aria-label` attributes to interactive elements on the landing page.

**Files to modify:**
- `apps/landing/components/Navbar.tsx` — Logo link, menu items
- `apps/landing/components/Hero.tsx` — CTA buttons
- `apps/landing/components/WaitlistForm.tsx` — Form inputs and submit button
- `apps/landing/components/Footer.tsx` — Social links, nav links
- `apps/landing/components/FinalCta.tsx` — CTA buttons

**Acceptance:** All interactive elements have descriptive `aria-label` attributes. Can be verified with an accessibility linter.

---

### Task 9.3 — Persistent Waitlist Storage

**Scope:** Move waitlist signups from `/tmp` file storage to the database.

**Option A (if Supabase is configured):** Add a `WaitlistEntry` model to Prisma schema and update the waitlist API route to insert into the database.

**Option B (no external services):** Use SQLite via `better-sqlite3` as a local file-based database for the landing page. This persists across Vercel deployments if using Vercel KV or a volume.

**Recommended:** Option A — it's simpler and aligns with the existing infrastructure. But this requires Supabase credentials, which means it partially depends on human setup. The code change itself is agent-executable.

**Files to modify:**
- `apps/api/prisma/schema.prisma` — Add `WaitlistEntry` model
- `apps/landing/app/api/waitlist/route.ts` — Replace `/tmp` file I/O with Prisma insert

---

## Execution Summary

| Phase | Tasks | Priority | Effort | Dependencies |
|-------|-------|----------|--------|--------------|
| 5: Dev Tooling | 5.1–5.4 | **HIGH** | Large | None |
| 6: API Hardening | 6.1–6.3 | **HIGH** | Medium | None (parallel with Phase 5) |
| 7: Mobile Features | 7.1–7.3 | **MEDIUM** | Medium | None |
| 8: Settings | 8.1–8.3 | **MEDIUM** | Medium | None |
| 9: Landing | 9.1–9.3 | **LOW** | Small | Phase 6 for Prisma schema |

### Parallelization Strategy

Phases 5 and 6 can run in parallel (different file zones):
- **Agent A:** Phase 5 (ESLint, TypeScript, tests, CI) — touches config files, `__tests__/` dirs
- **Agent B:** Phase 6 (rate limiting, validation, delete user) — touches `apps/api/lib/` and route files

Phases 7 and 8 can run in parallel after 5+6:
- **Agent C:** Phase 7 (comment deletion, image compression, offline) — touches `apps/mobile/src/hooks/`, `apps/mobile/src/providers/`
- **Agent D:** Phase 8 (settings screens) — touches `apps/mobile/app/settings/`, `apps/mobile/app/(tabs)/profile.tsx`

Phase 9 runs last (small scope, low priority).

### Total Scope

- **16 tasks** across 5 phases
- **~10 new files** (configs, tests, new screens, middleware)
- **~20 existing files modified**
- **0 human intervention required**
- **0 external service setup required**

### What Remains Out of Scope (Requires Human)

- External service account creation (Supabase, Privy, Veriff, etc.) — see `docs/SETUP_GUIDE.md`
- Design assets (app icons, splash screen, custom SVG tab icons)
- App Store submissions (Apple, Google Play)
- Phase 2 roadmap features (price oracle, token swaps, creator token minting)
- Sentry/analytics integration (requires account setup)

---

## Future / Nice-to-Have (Beyond Phases 5-9)

These items are lower priority or blocked by external dependencies. An agent can tackle them after the main phases, or they can be deferred to Phase 2.

### Agent-Executable (Low Priority)

| Item | Description | Notes |
|------|-------------|-------|
| React Query Devtools | Add `@tanstack/react-query-devtools` in dev builds | Quick win for debugging |
| Storybook | Document primitives + features in isolated component viewer | Large effort, low urgency |
| Push notification deep links | Wire notification taps to correct screens end-to-end | Partially done — `NotificationProvider` has routing logic, needs testing with real notifications |
| Vault settings screen | Wallet connect/import flow UI | Depends on Solana wallet adapter integration |
| Favorites settings screen | Saved posts/creators UI + API | Needs new `Favorite` model in Prisma, new API routes, new hooks |

### Requires Human / External Services

| Item | Description | Why Human Needed |
|------|-------------|-----------------|
| Placeholder PNGs | `notification-icon.png` and `adaptive-icon.png` are 1x1 transparent | Requires branded design assets |
| App icon + splash screen | Expo defaults, no custom branding | Requires design from Figma |
| Custom SVG tab icons | Currently using Ionicons strings | Requires Figma exports |
| PortfolioChart real data | Hardcoded dummy data | Requires Jupiter/Birdeye price oracle API (Phase 2) |
| SwapModal execution | UI-only, no actual swap | Requires Jupiter aggregator integration (Phase 2) |
| Market screen real data | Dummy token rankings | Requires market data API (Phase 2) |
| Real-time price updates | No WebSocket for live prices | Requires price feed service (Phase 2) |
| Sentry error reporting | No crash/error tracking | Requires Sentry account + DSN |
| Analytics (Mixpanel/Amplitude) | No event tracking | Requires analytics account |
| i18n / Internationalization | English only | Requires translation files + i18n library |
| Prisma client generation | `pnpm approve-builds` then `npx prisma generate` | Must be run manually after DB setup |
| Seed script verification | `prisma/seed.ts` untested | Must be run manually after DB setup |

---

## Completed Work Reference (Phases 1-4)

For historical context, these were all resolved prior to this plan. The original audit doc (`GAPS.md`) has been archived — all remaining items are captured above.

### Critical Gaps — ALL RESOLVED
| ID | Issue | Fix | Commit |
|----|-------|-----|--------|
| C1 | API response envelope not unwrapped | Centralized unwrap in `apiService.request()` | `9e41649` |
| C2 | Upload presigned URL field name mismatch | Changed `presignedUrl` → `uploadUrl`, added `fileName` generation | `9e41649` |
| C3 | Push token wrong path & payload | Fixed path to `/users/me/push-token`, field to `pushToken` | `9e41649` |
| C4 | KYC route doesn't exist | Changed path from `/kyc/apply` to `/creators/apply` | `9e41649` |
| C5 | Follow uses DELETE, API only has POST toggle | Changed to always POST | `9e41649` |
| C6 | Like uses DELETE, API only has POST toggle | Changed to always POST | `9e41649` |
| C7 | Post detail has no direct API fetch | Added `useQuery` fallback for `GET /posts/[id]` | `98a62c2` |

### Major Gaps — RESOLVED
| ID | Issue | Fix | Commit |
|----|-------|-----|--------|
| M1 | Explore screen uses feed data for creators | Created `useNearbyCreators` hook, wired to explore | `98a62c2` |
| M3 | No comment creation | Created `useCreateComment` hook, wired to post detail | `98a62c2` |
| M5 | User location never synced to server | Added sync in `LocationProvider` with 500m threshold | `98a62c2` |
| M6 | Creator application flow incomplete | Opens Veriff URL via `Linking.openURL` on success | `da6993b` |
| M7 | No deep linking / URL scheme | Already configured (`scheme: "momento"` in app.json) | `da6993b` |
| M10 | Shared types don't match API responses | Audited and fixed `PostWithCreator`, `PublicCreator` | `4a56b86` |

### Minor Gaps — RESOLVED
| ID | Issue | Commit |
|----|-------|--------|
| m3 | No pull-to-refresh on explore/market | `4a56b86` |
| m5 | No KeyboardAvoidingView on form screens | `4a56b86` |
| m11 | Landing page social links | Earlier commit |
| m12 | No favicon for landing page | Earlier commit |
| m16 | Post detail shows hardcoded DUMMY_COMMENTS | `98a62c2` |
| M2 (partial) | Delete Account flow | `4a56b86` |
