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

### ✅ #001 — Media re-downloads on every view (Supabase `Cache-Control: no-cache`)

**Status**: `done` · P0 · `[backend]` · `[ota]` · Shipped 2026-05-23 (OTA update group `ac1142e5-62fe-4196-8c37-25cb0a1c6985`)

**Resolution**: The bucket-level cache-control setting + SQL backfill approach didn't work because **Supabase's `/object/public/` gateway hard-codes `cache-control: no-cache` regardless of metadata**. Discovered after extensive testing:

1. SQL `UPDATE storage.objects SET metadata.cacheControl = ...` updates origin metadata but `/object/public/` ignores it
2. SDK `.update()` with `cacheControl: 'max-age=...'` pre-wraps with `max-age=` producing `max-age=max-age=...` (use just the directive without prefix)
3. Identical-bytes re-upload gets deduped by Supabase (returns 200 but no new version → no CF invalidation)

**Working fix** (shipped):
- **Mobile URL rewriter** (`apps/mobile/src/utils/media.ts`): `transformMediaUrl()` rewrites `/storage/v1/object/public/` → `/storage/v1/render/image/public/` for image extensions. The `/render/image/` endpoint **respects metadata.cacheControl** AND auto-compresses images (~40% smaller payloads). Videos stay on `/object/public/` (no `/render/video/` equivalent exists).
- **Mobile XHR upload** (`apps/mobile/src/hooks/useUpload.ts:46-50`): adds `Cache-Control: max-age=31536000, immutable` header on upload PUT. Every new upload arrives with the right metadata.
- **Backfill of 31 existing image files** via `apps/api/scripts/fix-cache-control.ts` — appends a single null byte (safe for all image decoders, ignored after EOI/IEND markers) to force a new etag → CF cache invalidates → next request gets `max-age=31536000, immutable`. Originals backed up to `/tmp/momento-cache-fix-backup-*/`. Script is idempotent and re-runnable.

**Known limitation**: 6 video files still serve `no-cache` from `/object/public/`. Supabase doesn't expose a video equivalent of `/render/image/`. Solution: migrate video to Cloudflare Stream — see `docs/video-platform-decision.md`.

---

### ✅ #002 — Vercel function cold starts add 700 ms to first request

**Status**: `done` · P1 · `[backend]` · Shipped 2026-05-23 (vercel.json crons added — `/api/health` hit every 5 min)

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

### 🟦 #003 — Upload size limit (50 MB hardcoded in mobile)

**Status**: `in-progress` · P1 · `[native]` · Code shipped 2026-05-23 (commit `e85ec57`), awaiting `eas build` + `eas submit` to deliver to TestFlight users.

**Resolution**: Bundled with #012 Step 1. `react-native-compressor` added for client-side video compression; `MAX_FILE_SIZE` raised from 50MB → 250MB in `useUpload.ts:34`. Triggers native rebuild because the compressor lib includes native modules. To ship: `cd apps/mobile && eas build --profile production --platform ios && eas submit --platform ios --latest`. After TestFlight pushes the new build, this issue can be marked done.



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

### 🟦 #005 — Search keyboard has no back/dismiss button on iOS

**Status**: `in-progress` · P1 · `[ota]` · Code shipped 2026-05-23 (Cancel button + keyboardDismissMode added); ships with the in-flight TestFlight build (compressor build).

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

### 🟦 #009 — Notifications icon missing from Home tab

**Status**: `in-progress` · P1 · `[ota]` · Code shipped 2026-05-23 (bell icon + unreadCount badge in home header); ships with the in-flight TestFlight build.

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

### ✅ #010 — No admin endpoint to promote creators (manual DB updates required)

**Status**: `done` · P1 · `[backend]` · Shipped 2026-05-23 (`POST /api/admin/users/[id]/promote-creator`). Requires one-time SQL to flip operator's `isAdmin=true` before use.

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

### 🟡 #012 — Migrate video to Cloudflare Stream (HLS adaptive bitrate + faster uploads)

**Status**: `open` · P1 · `[backend]` + `[ota]` · See full brief at [`docs/video-platform-decision.md`](./video-platform-decision.md)

**Symptoms**: 6 beta users reported slow video uploads (20MB iPhone QuickTime captures over LTE = 30+ seconds with no progress feedback). 50MB cap blocks longer/higher-quality clips. Video playback re-downloads full MP4 every view because Supabase `/object/public/` returns `cache-control: no-cache` regardless of metadata (see #001 resolution notes).

**Root cause**: Supabase Storage is object storage. No transcoding, no adaptive bitrate, single-region ingest, gateway hard-codes `no-cache` on public path. Pro tier removes per-file/storage caps but doesn't add any of the missing video infrastructure.

**Proposed fix** (3-step ladder, see decision doc for full rationale):
1. **Step 1 — this week**: Ship client-side compression via `react-native-compressor`. Cuts 20MB → 3-5MB. Solves upload-speed complaint independently of vendor choice. Native rebuild required.
2. **Step 2 — within 2 weeks**: Add Cloudflare Stream for new video uploads. ~$13-22/mo at projected scale. HLS adaptive bitrate, edge caching, tus resumable uploads, basic analytics.
3. **Step 3 — same release as Step 2**: Idempotent migration script for the 6 legacy Supabase videos.

**Why not Mux or Bunny**: Mux is best-in-class but 30-50% more expensive than CF Stream — analytics ROI doesn't justify premium until ~1k creators. Bunny is cheaper but smaller community + weaker DX. See decision doc §3 for full comparison.

**Why keep Supabase Pro**: $25/mo still pays for DB + image storage + avatars + 100GB capacity + daily backups + no DB auto-pause. Net new spend for CF Stream is only $15-25/mo on top.

**Affected files** (when Step 2 ships):
- `apps/api/app/api/uploads/video-presign/route.ts` — NEW
- `apps/api/lib/cloudflare.ts` — NEW
- `apps/mobile/src/hooks/useUpload.ts` — branch on mime type
- `apps/mobile/src/components/features/PostCard.tsx` — derive HLS thumbnail URL
- `apps/mobile/src/utils/media.ts` — already pass-through for non-Supabase URLs ✓
- Vercel env: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`

**Effort**: Step 1 = 1 day code + Apple review. Step 2 = 2-3 days. Step 3 = 1 hour.

**Decision deadline**: 2026-06-15. Re-evaluate based on whether Step 1 ends video complaints on its own.

**Linked**: closes #003 (50MB cap moot), partially overlaps #008 (compression is part of media-editor scope).

---

### ✅ #011 — Apply-to-creator flow lacks visibility of pending state to admins

**Status**: `done` · P2 · `[backend]` · Shipped 2026-05-23 (`GET /api/admin/users/pending-creators`). Use with #010 to see-then-promote in a single cURL loop.

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
- ✅ **#001 Image cache-control via `/render/image/`** — shipped 2026-05-23, OTA update group `ac1142e5-62fe-4196-8c37-25cb0a1c6985`. Mobile `transformMediaUrl()` rewrites to the cached endpoint; XHR upload sets `Cache-Control` header; 31 legacy image files re-uploaded via byte-append. Videos still uncached pending #012.
- ✅ **#002 Vercel keep-warm cron** — shipped 2026-05-23 in `apps/api/vercel.json`. Hits `/api/health` every 5 min via Vercel's cron (Hobby tier allows it). Eliminates 700ms cold-start penalty.
- ✅ **#010 Admin promote-creator endpoint** — shipped 2026-05-23. `POST /api/admin/users/[id]/promote-creator`. Requires `requireAdmin` (already in `lib/auth.ts`). One-time SQL bootstrap to flip operator's `isAdmin=true`.
- ✅ **#011 Admin pending-creators list** — shipped 2026-05-23. `GET /api/admin/users/pending-creators`. Pairs with #010 for see-then-promote cURL loop.

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
