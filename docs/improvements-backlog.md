# Momento — Improvements Backlog

> **Living document** capturing every known issue, gap, and improvement opportunity discovered post-beta launch.
> Agents and engineers: read this before starting any change to the app, API, or infra.

**Companion docs**:
- [`engineering-starter-kit.md`](./engineering-starter-kit.md) — implementation guidance, recommended libraries, code patterns to mirror per issue
- [`distribution.html`](./distribution.html) — release process / TestFlight workflow

**Last updated**: 2026-05-23
**Beta status**: iOS TestFlight live ([testflight.apple.com/join/3cPn24S8](https://testflight.apple.com/join/3cPn24S8)) · External review approved · 4 organic signups in last 24h
**Health**: API up · DB up · Cache up · Vercel deployments green

---

## How to use this document

1. **Before opening any PR or making any change**: search this doc for the relevant area. The fix may already be planned or partially scoped.
2. **When you find a new issue or gap**: add a new entry below. Use the schema in [#schema](#issue-schema).
3. **When you complete an issue**: change status from `open` → `done`, add the commit hash + date in the resolution line. Don't delete entries — they're institutional memory.
4. **When in doubt about priority**: P0 = users blocked, P1 = users frustrated, P2 = quality of life, P3 = polish.

### Status legend

| Symbol | Status | Meaning |
|---|---|---|
| 🔴 | `open` | Not started, P0 (blocking) |
| 🟡 | `open` | Not started, P1 (high) |
| 🟢 | `open` | Not started, P2 (medium) |
| ⚪ | `open` | Not started, P3 (low) |
| 🟦 | `in-progress` | Someone is on it |
| ✅ | `done` | Shipped (note the commit) |
| ⛔ | `wontfix` | Decided not to do; rationale below |

### Deploy type tags

| Tag | Meaning |
|---|---|
| `[backend]` | API / DB / Supabase / Vercel config — no app changes |
| `[ota]` | Pure JS/TS mobile change — ships via `eas update`, no TestFlight rebuild |
| `[native]` | Native iOS/Android change — requires `eas build` + TestFlight resubmission |
| `[dashboard]` | Supabase / Vercel / Apple / Privy dashboard config only |
| `[design]` | Figma / design decision — no code |

---

## Critical Performance Cluster

These three are interrelated and should be tackled together. The combined fix reduces "post feels slow" perception by an estimated 5-10×.

---

### 🔴 #001 — Media re-downloads on every view (Supabase `Cache-Control: no-cache`)

**Status**: `open` · P0 · `[backend]` · `[dashboard]`

**Symptoms**: Videos and images "load slowly" or appear to re-load when scrolling back through the feed. Even the same post viewed twice in a row triggers a full re-download.

**Root cause**: Supabase Storage serves all objects in the `momento-uploads` bucket with `Cache-Control: no-cache`. Verified via:
```
$ curl -sI https://phlkstaghvbwacmzuihr.supabase.co/storage/v1/object/public/momento-uploads/.../foo.quicktime
content-length: 19572196
cache-control: no-cache    ← problem
```
`no-cache` forces revalidation with the origin before any cached copy can be used. Combined with 20 MB video files, this means a near-full re-download every view.

**Proposed fix**:
1. **One-time backfill of existing files** — update `storage.objects.metadata` for the ~30 files already uploaded:
   ```sql
   UPDATE storage.objects
   SET metadata = jsonb_set(metadata, '{cacheControl}', '"max-age=31536000, immutable"')
   WHERE bucket_id = 'momento-uploads';
   ```
2. **New uploads** — change `apps/api/lib/storage.ts:createPresignedUpload` to embed cache-control in the upload options OR add a post-upload hook that sets it via Supabase admin API.
3. **Bucket default** — Supabase Dashboard → Storage → `momento-uploads` → Settings → File cache TTL → set to `31536000` (1 year).

**Affected files**:
- `apps/api/lib/storage.ts` (presign generator)
- Supabase Dashboard for bucket defaults
- One-time SQL backfill

**Effort**: ~30 min total (10 min backfill SQL, 15 min API change, 5 min dashboard click)

**Expected impact**: 5-10× perceived speedup on repeat-view of media-heavy feeds. Eliminates re-download on scroll-back. CDN edge caching becomes effective.

---

### 🟡 #002 — Vercel function cold starts add 700 ms to first request

**Status**: `open` · P1 · `[backend]`

**Symptoms**: First feed load after the app sat idle for ~10 min takes ~800 ms. Subsequent calls take ~100 ms.

**Root cause**: Vercel Hobby tier spins down idle Node functions aggressively. Each cold start re-initializes Prisma client + Supabase client + opens a DB connection. Verified:
```
Round 1 (cold):  811 ms total
Round 2 (warm): 100 ms total
Round 3 (warm):  99 ms total
```

**Proposed fix** (pick one or combine):

| Option | Cost | Effort | Impact |
|---|---|---|---|
| **A. Keep-warm cron** | $0 | 5 min | Hits `/api/feed` every 5 min via `vercel.json` crons. Adds to `apps/api/vercel.json`:<br>`{ "crons": [{ "path": "/api/feed?lat=43.6532&lng=-79.3832&radius=10", "schedule": "*/5 * * * *" }] }` |
| **B. Vercel Pro upgrade** | $20/mo | 1 min | Less aggressive spin-down, faster cold starts when they do happen |
| **C. Migrate hot endpoints to Edge Runtime** | $0 | ~2 hrs | Edge functions cold-start in ~50 ms vs Node's ~500 ms. Requires Prisma Data Proxy or Supabase JS client (no native pg lib in Edge) |

**Recommendation**: A first (free + fast). B later if you upgrade Supabase to Pro anyway. C only if A doesn't deliver and traffic stays high.

**Affected files**: `apps/api/vercel.json`

---

### 🟡 #003 — Upload size limit (50 MB hardcoded in mobile)

**Status**: `open` · P1 · `[ota]` + `[dashboard]`

**Symptoms**: Users uploading large videos see error: *"File is too large (XX MB). Maximum size is 50MB. Try a shorter video or lower resolution."*

**Root cause**: Mobile pre-check at `apps/mobile/src/hooks/useUpload.ts:28` hardcodes `MAX_FILE_SIZE = 50 * 1024 * 1024`. Fires client-side before the upload even leaves the device. The API has a 100 MB constant in its presign route but it's dead code (never enforced).

**Three layers of limits**:
1. Mobile pre-check: 50 MB hardcoded ← **the actual blocker**
2. API check (declared but unused): 100 MB
3. Supabase plan cap: 50 MB on Free, up to 50 GB on Pro

**Proposed fix sequence**:
1. **Decide ceiling**: 250 MB? 500 MB? 2 GB? (Tradeoff: bigger = slower uploads on cell)
2. **Upgrade Supabase to Pro** (required if going above 50 MB) — `[dashboard]`
3. **Set bucket `file_size_limit`** in Supabase Dashboard — `[dashboard]`
4. **Update `useUpload.ts:28`** to new ceiling — `[ota]`
5. **Push via** `eas update --branch production --message "raise upload limit"` — `[ota]`
6. **Optional long-term**: refactor so limit comes from `/uploads/presign` response. Then future changes are pure `[backend]`.

**Affected files**:
- `apps/mobile/src/hooks/useUpload.ts` (line 28 constant, line 126 check, line 128 error message)
- `apps/api/app/api/uploads/presign/route.ts` (line 17 dead constant — remove or actually enforce)

**Linked**: #001 (cache-control), #008 (video compression) — fixing video compression would let smaller files still feel "high quality" and dodge this whole problem.

---

## Navigation & Discoverability

---

### 🟡 #004 — No path to "Apply to be a Creator" screen on iOS (likely Android too)

**Status**: `open` · P1 · `[ota]` or `[native]` depending on fix scope

**Symptoms**: Reported during beta — users sign up but cannot find how to apply to become a creator. New signups (lotanna27, chaisullivan, gracie) all started as `role=USER, kycStatus=NONE` and required manual admin promotion via DB update.

**Root cause** (needs verification): The KYC apply trigger likely exists only inside `apps/mobile/app/edit-profile.tsx` — accessed only after a user opens their profile → taps Edit. There may not be a discoverable entry point from the home/profile tab landing screen.

**Investigation needed**:
1. Open the iOS build and trace: Home → Profile tab → can you find an obvious "Become a Creator" CTA? Document the path or lack thereof.
2. Check `apps/mobile/app/(tabs)/profile.tsx` for any creator-apply CTA.
3. Check `apps/mobile/app/edit-profile.tsx` — confirm the apply call lives there.
4. Check `apps/mobile/app/(tabs)/home.tsx` — does it surface a CTA for non-creators?

**Proposed fix** (after investigation):
- Add a prominent "Become a Creator" card on the Profile tab for users with `role=USER`
- Or a top-of-feed banner on Home for non-creator viewers
- Both: tapping triggers the `POST /api/creators/apply` call (already wired)

**Affected files**:
- `apps/mobile/app/(tabs)/profile.tsx` — add CTA
- `apps/mobile/app/(tabs)/home.tsx` — optional banner for non-creators

**Effort**: Investigation ~15 min · CTA implementation ~1 hr · Deploy via OTA

**Related ops note**: While this is broken, admins can promote users via direct DB update:
```sql
UPDATE users
SET role='CREATOR', "kycStatus"='VERIFIED', "isAdminApproved"=true, "updatedAt"=NOW()
WHERE email='<email>';
```
Then invalidate cache:
```bash
curl -X POST "$UPSTASH_REDIS_REST_URL/del/user:<id>/creator:<id>" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
```
This pattern is being used in lieu of a proper `[backend]` admin endpoint (see #010).

---

### 🟡 #005 — Search keyboard has no back/dismiss button on iOS

**Status**: `open` · P1 · `[ota]`

**Symptoms**: User taps search input on Explore tab → keyboard appears → no visible way to dismiss the keyboard or exit search mode. Trapped state.

**Root cause**: The search input in `apps/mobile/app/(tabs)/explore.tsx` (line ~256, `TextInput` with `searchFocused` state) doesn't render a Cancel/back button when focused. On iOS, the keyboard's `Done` key may not exist depending on `returnKeyType`. Users have no escape hatch.

**Proposed fix**:
1. When `searchFocused === true`, render a **Cancel** text button to the right of the search bar (iOS pattern, like native iOS search).
2. Tapping Cancel: `inputRef.current?.blur()` + clear `searchText` + reset `searchFocused`.
3. Also set `returnKeyType="search"` so the keyboard's return key shows "Search" instead of generic Return.
4. Consider adding `keyboardDismissMode="on-drag"` to the search results list so scrolling dismisses keyboard.

**Affected files**:
- `apps/mobile/app/(tabs)/explore.tsx` (lines ~256-258, ~256-400)

**Effort**: ~1 hr · OTA deployable

---

### 🟢 #006 — Action icons (create post, wallet) need more vibrant treatment

**Status**: `open` · P2 · `[ota]` + `[design]`

**Symptoms**: Users don't immediately see how to access create-post / wallet / etc. The current icons are likely too subtle (`COLORS.textTertiary` or similar).

**Root cause**: The icons in the tab bar use stock Ionicons in muted colors. The brand's "vibrant green `#00FF88`" is currently only used as active-state.

**Proposed fix**:
1. Make tab icons **brighter** in their inactive state — bump from `#666` to `#888` or `#AAA`.
2. Or add a subtle green tint for action-oriented icons (create post, wallet).
3. Consider a **floating action button (FAB)** in the bottom-right of the Home feed for "Create Post" — much more discoverable than buried in a tab.
4. Audit `apps/mobile/app/(tabs)/_layout.tsx` for icon definitions.

**Affected files**:
- `apps/mobile/app/(tabs)/_layout.tsx` (Tabs config, icons)
- `apps/mobile/src/styles/theme.ts` (if we add new color tokens)

**Linked**: needs a design pass — see Figma design system at `docs/design/`

**Effort**: ~2-3 hrs incl. design alignment · OTA

---

### 🟡 #009 — Notifications icon missing from Home tab

**Status**: `open` · P1 · `[ota]`

**Symptoms**: User reported no bell/notifications icon on the Home page. `app/notifications.tsx` route exists and works, but there's nothing in the Home tab to navigate to it.

**Root cause**: `apps/mobile/app/(tabs)/home.tsx` imports `Ionicons` and `useNotifications` but doesn't render a bell. Verified via grep — no `bell`/`notifications-outline` icon component in the home header.

**Proposed fix**:
1. Add a bell icon in the top-right of the Home header.
2. Show a small red dot/badge when `useNotifications().unreadCount > 0`.
3. Tap → `router.push('/notifications')`.

**Affected files**:
- `apps/mobile/app/(tabs)/home.tsx` (add to header area)

**Effort**: ~30 min · OTA

**History note**: This may have been a regression — design specs at `docs/design/` show a bell icon in early mockups. Worth checking git log for when it was removed.

---

## UX / Feature Gaps

---

### 🟢 #007 — Theme variant: light background option

**Status**: `open` · P2 · `[ota]` + `[design]`

**Symptoms**: User feedback — currently all-black background feels intense. Want option to switch to a light background with alternate text styling (e.g. green text with black borders).

**Root cause**: Only one theme exists. `apps/mobile/src/styles/theme.ts` defines a single `COLORS` const with hardcoded dark values. No theme provider, no settings toggle.

**Proposed fix** (large scope):
1. **Build a theme provider**: refactor `COLORS` into `darkTheme` + `lightTheme` objects.
2. **Add a theme context**: `ThemeProvider` wraps app, exposes `useTheme()` hook returning current palette.
3. **User setting**: add a toggle in `app/settings/` (new screen or in existing) — persists to AsyncStorage by user ID.
4. **Replace direct `COLORS.X` references**: every `import { COLORS } from '@/styles/theme'` becomes `const { colors } = useTheme()`. **This is a 60+ file refactor.**
5. **Design two palettes**:
   - Dark (current): `bg #000`, `primary #00FF88`, `text #FFF`
   - Light (new): `bg #FFFFFF` or `#F5F5F5`, `primary #00CC6A` (darker for contrast), `text #1A1A1A`, accent borders `#000`

**Affected files** (estimate):
- `apps/mobile/src/styles/theme.ts` — define palettes
- `apps/mobile/src/providers/ThemeProvider.tsx` — NEW
- `apps/mobile/app/_layout.tsx` — wrap app in ThemeProvider
- ~60 files using COLORS directly — replace with `useTheme()`

**Effort**: ~1-2 days · OTA-deployable but invasive

**Design dependency**: Light theme mockups don't exist yet. **Requires a design pass first.** See `docs/design/`.

---

### 🟢 #008 — Photo/video editing tools (crop, trim, filters, direct capture)

**Status**: `open` · P2 · `[native]` (some libs need native modules)

**Symptoms**: Users expect Instagram-like editing on capture/upload — crop photos, trim videos, apply filters, take photo/video directly without leaving the app.

**Current state**: `apps/mobile/src/hooks/useUpload.ts` uses `expo-image-picker` (library only, no camera) and `expo-image-manipulator` (resize + compress only — no crop UI, no filters, no video trim). Capture is `mediaTypes: ['images']` only.

**Proposed fix** (multi-part):

| Capability | Library | Deploy |
|---|---|---|
| **Direct camera capture (photo + video)** | `expo-camera` (already Expo-supported) or `react-native-vision-camera` (more powerful) | `[native]` |
| **Crop photos** | `expo-image-manipulator` has crop primitives; need custom UI with drag/pinch | `[ota]` (UI work) |
| **Trim videos** | `react-native-video-trim` or custom with `expo-video` + `ffmpeg-kit-react-native` | `[native]` |
| **Basic filters** | `gl-react-expo` + filter shaders, or skia-based filters via `@shopify/react-native-skia` | `[native]` |

**Affected files** (new components):
- `apps/mobile/app/create-post.tsx` — augment with editor
- `apps/mobile/src/components/features/MediaEditor.tsx` — NEW
- `apps/mobile/src/hooks/useUpload.ts` — handle pre-edited media

**Effort**: ~3-5 days for MVP (camera + crop + simple trim). ~2 weeks for parity with Instagram.

**Linked**: #003 (file size) — video trim would let users stay under 50 MB without compromising. #001 (cache) — smaller videos = less to download.

---

## Infrastructure & Engineering Debt

---

### 🟡 #010 — No admin endpoint to promote creators (manual DB updates required)

**Status**: `open` · P1 · `[backend]`

**Symptoms**: Every time a new user signs up and is supposed to become a creator, we run a manual SQL update + Redis invalidation. Not scalable.

**Root cause**: Architecture has self-apply (`POST /api/creators/apply`) and Veriff webhook for automated approval, but **no admin override endpoint**. No user in the DB has `isAdmin=true` either.

**Proposed fix**:
1. **One-time**: flip `isAdmin=true` for primary operator(s):
   ```sql
   UPDATE users SET "isAdmin" = true WHERE email = 'sangeet@momento.network';
   ```
2. **Build new endpoint**: `POST /api/admin/users/[id]/promote-creator`
   - Requires authenticated user with `isAdmin=true`
   - Updates target's `role`, `kycStatus`, `isAdminApproved`
   - Calls `invalidateCache` on user + creator profile keys
   - Returns updated user object
3. **Optionally**: add `POST /api/admin/users/[id]/demote` for reversal.

**Affected files** (new):
- `apps/api/app/api/admin/users/[id]/promote-creator/route.ts`
- `apps/api/lib/auth.ts` — add `requireAdmin(request)` helper

**Effort**: ~30 min · deploys via Vercel push

**Recurring manual workaround until done**:
```sql
-- Promote one user
UPDATE users SET role='CREATOR', "kycStatus"='VERIFIED', "isAdminApproved"=true, "updatedAt"=NOW()
WHERE email='<email>' RETURNING id;

-- Invalidate cache (replace <id> with the returned id)
-- curl -X POST "$UPSTASH_REDIS_REST_URL/del/user:<id>/creator:<id>" \
--   -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
```

---

### 🟢 #011 — Apply-to-creator flow lacks visibility of pending state to admins

**Status**: `open` · P2 · `[backend]` + `[ota]`

**Symptoms**: No admin UI or queue to see who applied and is waiting. We have to query `WHERE kycStatus = 'PENDING'` to find them.

**Proposed fix**:
- **Short-term**: build a simple admin endpoint `GET /api/admin/users/pending-creators` that returns list of `kycStatus IN ('PENDING','NONE') AND role='USER'` users.
- **Long-term**: build a tiny admin web UI (separate route on the landing site? Or new admin app?) for this and #010.

**Affected files** (new):
- `apps/api/app/api/admin/users/pending-creators/route.ts`

**Effort**: 1 hr backend · ~half a day if building admin UI

---

## Resolved (do not re-do)

Move issues here when shipped, with commit hash + date. Acts as institutional memory.

- ✅ **iOS TestFlight pipeline** — shipped 2026-05-19 to 2026-05-21. See `docs/handoff-ios-enablement-2026-04-17.md` and Apple approval on 2026-05-21.
- ✅ **Beta App Review approved** — 2026-05-21
- ✅ **Modal scroll bug on hero** — fixed `86c549c` (2026-05-22), createPortal pattern
- ✅ **Landing page Join Beta CTA + modal** — shipped `801050b` (2026-05-22)
- ✅ **Privacy policy + distribution playbook hosted** — shipped earlier in week
- ✅ **expo-av → expo-video migration** — shipped `c5e7d48`

---

## Issue Schema

When adding a new issue, copy this template:

```markdown
### [emoji] #NNN — Short title

**Status**: `open|in-progress|done|wontfix` · P0/P1/P2/P3 · `[deploy-tag]`

**Symptoms**: What does the user see / report?

**Root cause**: Investigation findings. Reference files with line numbers.

**Proposed fix**: Concrete steps.

**Affected files**:
- `path/to/file.tsx` (line refs)

**Effort**: Estimate

**Linked**: #NNN, #NNN (if related to other entries)
```

Increment the issue number. Don't reuse closed numbers.

---

## Open questions / decisions needed from the founder

- **Q1**: Acceptable cost ceiling for media performance? Vercel Pro ($20/mo) + Supabase Pro ($25/mo) = $45/mo, would resolve cold starts + free-tier auto-pause + 50 MB cap simultaneously.
- **Q2**: Light theme — is it actually wanted, or just "the all-black feels intense" feedback? Could solve with a less-aggressive dark theme (off-black `#0A0A0A`) before committing to full light theme refactor.
- **Q3**: Camera/edit functionality scope for v1 — MVP (camera + crop only) vs full Instagram-parity? Affects #008 effort 5× either way.
- **Q4**: Admin tooling — build admin endpoints (#010, #011) and use cURL for ops? Or invest in a small admin web UI?

---

## File path quick-reference

When fixing a reported issue, you usually start from one of these:

| Concern | File |
|---|---|
| Tab bar / nav | `apps/mobile/app/(tabs)/_layout.tsx` |
| Home feed | `apps/mobile/app/(tabs)/home.tsx` |
| Explore + Search | `apps/mobile/app/(tabs)/explore.tsx` |
| Profile tab | `apps/mobile/app/(tabs)/profile.tsx` |
| Wallet tab | `apps/mobile/app/(tabs)/wallet.tsx` |
| Edit profile / KYC apply | `apps/mobile/app/edit-profile.tsx` |
| Create post | `apps/mobile/app/create-post.tsx` |
| Notifications screen | `apps/mobile/app/notifications.tsx` |
| Upload hook | `apps/mobile/src/hooks/useUpload.ts` |
| Colors / theme | `apps/mobile/src/styles/theme.ts` |
| API: creator apply | `apps/api/app/api/creators/apply/route.ts` |
| API: KYC webhook | `apps/api/app/api/kyc/webhook/route.ts` |
| API: presigned upload | `apps/api/app/api/uploads/presign/route.ts` |
| Storage helper | `apps/api/lib/storage.ts` |
| Redis cache keys | `apps/api/lib/redis.ts` |
| Feed query | `apps/api/app/api/feed/route.ts` |
| Vercel cron config | `apps/api/vercel.json` |
