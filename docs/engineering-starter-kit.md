# Engineering Starter Kit

> **For future agents or engineers working on any issue in `improvements-backlog.md`.**
> Covers: where to start, recommended libraries, patterns to mirror in this codebase, and external open-source references.

**Last updated**: 2026-05-23
**Companion to**: [`improvements-backlog.md`](./improvements-backlog.md) (issue tracker), [`distribution.html`](./distribution.html) (release process), [`design/DESIGN_REFERENCE.md`](./design/DESIGN_REFERENCE.md) (design specs)

---

## 0. First 10 minutes (read this if you're brand new)

If you've just been assigned to this repo:

1. **Read `MEMORY.md`** at `/Users/sangeet/.claude/projects/-Users-sangeet-Desktop-momento/memory/MEMORY.md` — single best summary of where the project is. Includes user preferences, gotchas, and what's already shipped.
2. **Read `improvements-backlog.md`** — what's broken / pending. Pick an issue number to work on.
3. **Read the relevant section of this doc below** — implementation guidance for that issue.
4. **Verify infra is up** before debugging anything that looks like "the API is broken":
   ```bash
   curl -s https://momento-api-ten.vercel.app/api/health
   # Should return: {"success":true,"data":{"status":"healthy","db":true,...}}
   ```
   If `db:false`, see `infrastructure.md` — Supabase free-tier auto-pauses.
5. **Skim `architecture.md`** in the memory folder for the full file structure.

---

## 1. Stack inventory — what's already in use

### Mobile (Expo SDK 54, React Native 0.81+)

| Concern | Library | Notes |
|---|---|---|
| Framework | `expo` SDK 54 | Managed workflow + config plugins under `apps/mobile/plugins/` |
| Router | `expo-router` | File-based, see `apps/mobile/app/` |
| Auth | `@privy-io/expo` + `@privy-io/expo-native-extensions` | Embedded Solana wallets via Privy |
| Data fetching | `@tanstack/react-query` v5 | Keys MUST include `authUser?.id` for per-user isolation |
| Images | `expo-image` | Use this, NOT React Native's `<Image>` |
| Video | `expo-video` v3.0+ (`VideoView` + `useVideoPlayer`) | Migrated from deprecated `expo-av` in commit `c5e7d48` |
| Lists | `@shopify/flash-list` | `onEndReachedThreshold` is a multiplier of visible length — use `0.5` not `10` |
| Notifications | `expo-notifications` | APNs key uploaded to EAS, FCM still pending for Android |
| Storage (KV) | `@react-native-async-storage/async-storage` | Namespace keys by userId — AsyncStorage is device-global |
| Forms / Picker | `expo-image-picker` + `expo-image-manipulator` | Currently no camera capture, no crop UI |
| Icons | `@expo/vector-icons` (Ionicons mostly) | Available everywhere via `import { Ionicons } from '@expo/vector-icons'` |
| Animation | `react-native-reanimated` v4 (worklets) + plain Animated API | Some files use Reanimated, some use built-in Animated |
| Gesture | `react-native-gesture-handler` | Provider nesting matters — see #patterns |

### API (Next.js 14 App Router, deployed on Vercel)

| Concern | Library | Notes |
|---|---|---|
| Framework | `next` 14 + App Router | Routes under `apps/api/app/api/` |
| ORM | `@prisma/client` v5 | Schema at `apps/api/prisma/schema.prisma` |
| DB | Supabase Postgres + PostGIS 3.3 | PostGIS GIST index on `posts.location` |
| Storage | `@supabase/supabase-js` v2 | Bucket: `momento-uploads`, presigned upload pattern |
| Cache + rate limit | `@upstash/redis` + `@upstash/ratelimit` v2 | 5-min TTL default, see `lib/redis.ts` |
| Validation | `zod` | Schemas in `apps/api/lib/validation.ts` |
| Auth verify | Privy JWT verify | See `apps/api/lib/auth.ts:requireAuth` |
| KYC | Veriff | `apps/api/lib/veriff.ts` + webhook |
| Solana | `@solana/web3.js` + Helius RPC | `lib/solana.ts` |

### Landing (Next.js 15, separate Vercel project)

| Concern | Library |
|---|---|
| Framework | `next` 15 + App Router |
| Styling | Tailwind v3.4 |
| Animation | `animejs` v4 |
| Fonts | Inter, JetBrains Mono, Cormorant Garamond (Google Fonts) |

---

## 2. Code patterns in this codebase (mirror these)

Before writing new code, look at how similar things are done already. These are the patterns to follow.

### 2.1 Authenticated API route (must read before writing any new route)

Reference: `apps/api/app/api/creators/apply/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { invalidateCache, cacheKeys } from '@/lib/redis';

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limit
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    // 2. Auth
    const authUser = await requireAuth(request);

    // 3. Validate body if needed (see lib/validation.ts for zod schemas)

    // 4. Do the work
    const result = await prisma.thing.update({ ... });

    // 5. Invalidate cache
    await invalidateCache(cacheKeys.userProfile(authUser.id));

    // 6. Always return { success, data } envelope (mobile unwraps .data)
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Endpoint name error:', error);
    return NextResponse.json(
      { success: false, error: 'User-facing error message' },
      { status: 500 }
    );
  }
}
```

**Critical conventions**:
- All responses use `{ success, data }` or `{ success, error }`. Mobile's `apiService` unwraps `.data` — breaking this shape breaks the app.
- Errors that should propagate (e.g. unauthorized from `requireAuth`) come as `Response` instances. Re-throw with `if (error instanceof Response) return error;`.
- Next.js 14 dynamic route params must be awaited: `const { id } = await params;`.

### 2.2 Cache invalidation after mutation

Reference: `apps/api/lib/redis.ts`

```ts
import { invalidateCache, cacheKeys } from '@/lib/redis';

await invalidateCache(
  cacheKeys.userProfile(userId),
  cacheKeys.creatorProfile(userId)
);
```

Cache key format: `user:${id}`, `creator:${id}`. TTLs are 5 min (`userProfile`, `creatorProfile`).

For direct manipulation via Upstash REST (e.g. ops scripts):
```bash
curl -X POST "$UPSTASH_REDIS_REST_URL/del/user:<id>/creator:<id>" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
```

### 2.3 Mobile API call (always gate on `authUser?.id`)

Reference: `apps/mobile/src/providers/NotificationProvider.tsx`

```ts
const { user: authUser } = useAuth();

useEffect(() => {
  if (!authUser?.id) return;  // CRITICAL: gate on auth state
  apiService.post('/users/me/push-token', { pushToken });
}, [authUser?.id, pushToken]);
```

Without the gate, hooks fire on mount before Privy's token is wired through AuthBridge and every cold start spams 401s.

### 2.4 React Query keys

Always include user ID for per-user cache isolation:

```ts
useQuery({
  queryKey: ['userProfile', authUser?.id],  // ← include userId
  queryFn: () => apiService.get<UserProfile>('/users/me'),
  enabled: !!authUser?.id,
});
```

**Anti-pattern**: don't call `queryClient.removeQueries` or `queryClient.cancelQueries` on logout — causes `CancelledError` in dehydration. Per-user query keys handle isolation naturally.

### 2.5 Provider nesting order (in `apps/mobile/app/_layout.tsx`)

DO NOT REORDER without understanding why:
```
GestureHandlerRootView
  └── SafeAreaProvider
      └── QueryClientProvider
          └── PrivyProvider
              └── AuthBridge        ← wires Privy token into apiService
                  └── LocationProvider
                      └── NotificationProvider
                          └── <App />
```

`AuthBridge` is the linchpin — it wires Privy's `getAccessToken` into the `apiService`. Without it, every API call gets 401.

### 2.6 Console logging in dev mode

`console.error` triggers the React Native RedBox overlay in `__DEV__`. Use `console.warn` for expected/transient errors. Pattern:

```ts
catch (error) {
  console.warn('Auth refresh failed (will retry):', error);  // not .error
}
```

Already applied at `apps/mobile/src/services/api.ts:131` and `apps/mobile/src/hooks/useAuth.ts:120`.

### 2.7 Image compression before upload

Reference: `apps/mobile/src/hooks/useUpload.ts:85-97`

```ts
if (mimeType.startsWith('image/')) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  processedUri = result.uri;
  processedMimeType = 'image/jpeg';
}
```

**Gap**: no equivalent for video. See backlog #008.

---

## 3. Library recommendations for upcoming work

For each capability we'll likely need from the backlog, here's the recommended library, alternatives considered, and rationale.

### 3.1 Camera capture (for #008)

| Lib | Pick? | Why |
|---|---|---|
| `expo-camera` | ✅ **Recommended** | Already Expo-supported, no need to eject. Handles photo + video out of the box. Permission handling is built in. |
| `react-native-vision-camera` | Alternative | More power-user features (custom frame processors, ML overlays, code scanners). Requires `[native]` build. Use only if Expo Camera proves insufficient. |
| `expo-image-picker` | Already in use | For library picking, NOT capture. Keep for "Choose from library" path. |

**Where to start**: replace/augment the picker call in `apps/mobile/src/hooks/useUpload.ts:152-186` (`pickAndUpload`) with a route that lets users tap "Take photo/video" → opens `expo-camera`.

### 3.2 Crop UI (for #008)

| Lib | Pick? | Why |
|---|---|---|
| `react-native-image-crop-picker` | ✅ **Recommended** | Combined picker + cropper with native UI. 50k weekly downloads. Returns cropped URI. Drop-in for current `expo-image-picker` usage. Requires `[native]` build. |
| `expo-image-manipulator` | Already in use | Has crop primitives but **no built-in UI**. You'd build the drag-handle UI yourself with PanResponder. Higher effort. |
| `react-native-image-editor` (`@react-native-community`) | Alternative | iOS-only image editor. Avoid. |

**Where to start**: after capture/pick, route through a crop screen. Easiest: replace `pickAndUpload` to use `react-native-image-crop-picker`'s `ImagePicker.openCropper` which gives native iOS/Android crop UI.

### 3.3 Video trim (for #008)

| Lib | Pick? | Why |
|---|---|---|
| `react-native-video-trim` | ✅ **Recommended** | Native iOS/Android video trim UI. Reasonable maintenance (~3k weekly). Returns trimmed file URI. Requires `[native]` build. |
| `ffmpeg-kit-react-native` | Alternative | Full FFmpeg in RN. Powerful but heavy (adds 30+ MB to bundle) and the official package was archived in 2025. Maintained fork exists but risk-heavy. |
| Server-side via Mux/Cloudflare Stream | Alternative | $0.005/min processing. Eliminates client transcoding. Good if you want adaptive bitrate too. Separate integration work. |

**Where to start**: after `expo-camera` captures video, send through a trim screen using `react-native-video-trim`. Result URI feeds into existing upload flow.

### 3.4 Video compression (for #003 and #008)

| Lib | Pick? | Why |
|---|---|---|
| `react-native-compressor` | ✅ **Recommended** | Handles both image AND video compression in one library. Active maintenance. Returns compressed file URI. Compresses 20 MB → 3-5 MB typically. Requires `[native]` build. |
| `ffmpeg-kit-react-native` | Alternative | More control over codec/bitrate/resolution. Heavier. See above. |
| Mux Direct Uploads | Alternative | Skip client compression entirely, upload raw to Mux, they handle transcoding + adaptive delivery. Best long-term but introduces dependency + cost. |

**Where to start**: in `apps/mobile/src/hooks/useUpload.ts`, add a video branch parallel to the existing image branch (line 85-97):
```ts
if (mimeType.startsWith('video/')) {
  const result = await Video.compress(uri, {
    compressionMethod: 'auto',
    minimumFileSizeForCompress: 5,  // MB
  });
  processedUri = result;
}
```

### 3.5 Filters (for #008)

| Lib | Pick? | Why |
|---|---|---|
| `@shopify/react-native-skia` | ✅ **Recommended** | Modern, fast, GPU-accelerated 2D graphics. Skia is what Chrome/Flutter use. Good docs, growing ecosystem. Requires `[native]` build. |
| `gl-react-expo` | Alternative | GLSL shaders. More raw power but more work to wire up. |
| `react-native-image-filter-kit` | Alternative | Pre-built filters. Less maintained. Limited filter set. |

**Where to start**: build a `MediaEditor` component (`apps/mobile/src/components/features/MediaEditor.tsx`) that uses Skia's `<Canvas>` + image filters. ~1 day of work for ~10 Instagram-style presets.

### 3.6 Theme management (for #007)

| Lib | Pick? | Why |
|---|---|---|
| **Custom Context + AsyncStorage** | ✅ **Recommended for this codebase** | Match the existing pattern (LocationProvider, NotificationProvider). Lightweight. Total control. |
| `@shopify/restyle` | Alternative | Typed theming, restyled components, themed `<Box>` and `<Text>`. Powerful but requires migrating all `StyleSheet.create` calls — too invasive for retrofit. |
| `react-native-paper` | Alternative | Comes with Material Design components + theming. Wrong design language (we're not Material). |
| `tamagui` | Alternative | High-performance theming + compiler. Steeper learning curve. Consider for a future rewrite, not now. |

**Where to start**:
1. Refactor `apps/mobile/src/styles/theme.ts` to export `darkTheme` + `lightTheme` objects matching the same shape.
2. New `apps/mobile/src/providers/ThemeProvider.tsx` exposing `useTheme()` hook + `setTheme(name)` function. Persists choice to AsyncStorage keyed by user.
3. Replace `import { COLORS } from '@/styles/theme'` with `const { colors } = useTheme()` across the codebase. Use a codemod to make the refactor mechanical.
4. Update `StatusBar` to switch barStyle based on theme.

### 3.7 Floating Action Button (for #006)

| Lib | Pick? | Why |
|---|---|---|
| **Custom with Pressable + Animated** | ✅ **Recommended** | Single FAB is ~30 lines of code. No new dependency. Easy to brand-match. See pattern below. |
| `react-native-floating-action` | Alternative | Multi-action FAB with expand-on-tap. Useful if we add many actions. Otherwise overkill. |
| `react-native-paper` FAB | Alternative | Brings in entire Material library. Don't. |

**Pattern**:
```tsx
<Pressable
  onPress={() => router.push('/create-post')}
  style={[
    styles.fab,
    pressed && styles.fabPressed
  ]}
>
  <Ionicons name="add" size={28} color="#000" />
</Pressable>

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 80,  // above tab bar
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
});
```

---

## 4. Per-issue implementation guidance

Quick-start guide for each backlog issue. Pair this with the issue's full description in `improvements-backlog.md`.

### #001 — Media cache-control [backend + dashboard]

**Start here**: `apps/api/lib/storage.ts`

1. Open Supabase dashboard → Storage → `momento-uploads` → bucket settings. Set File cache TTL to `31536000` (1 year). This handles NEW uploads.
2. Backfill existing files:
   ```sql
   UPDATE storage.objects
   SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{cacheControl}', '"max-age=31536000, immutable"')
   WHERE bucket_id = 'momento-uploads';
   ```
3. **Verify** with `curl -I` against any media URL — should now show `cache-control: max-age=31536000, immutable`.
4. **Also update the API** to be explicit: in `storage.ts createPresignedUpload`, pass `cacheControl` option to `.createSignedUploadUrl()`. This is belt-and-suspenders.

**External ref**: [Supabase Storage cache-control docs](https://supabase.com/docs/guides/storage/serving/cache-control)

---

### #002 — Vercel cold starts [backend]

**Start here**: `apps/api/vercel.json`

1. Add a cron entry hitting `/api/feed`:
   ```json
   {
     "crons": [
       { "path": "/api/feed?lat=43.6532&lng=-79.3832&radius=10", "schedule": "*/5 * * * *" }
     ]
   }
   ```
2. Commit + push. Vercel auto-deploys.
3. Verify in Vercel Dashboard → Settings → Cron Jobs that it's running.

**Trade-off note**: this keeps ONE function warm. If `/api/creators/leaderboard` etc. are also cold-sensitive, add them to the cron list or migrate to Edge Runtime.

**External ref**: [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs), [Next.js Edge Runtime](https://nextjs.org/docs/app/api-reference/edge)

---

### #003 — Upload size limit [ota + dashboard]

**Start here**: `apps/mobile/src/hooks/useUpload.ts:28` (the hardcoded `MAX_FILE_SIZE`)

**See #008 as a prerequisite**: if you ship video compression first, files naturally fit under the existing 50 MB cap and you don't need to raise it. Recommend doing #008 first if possible.

If raising the cap directly:
1. Decide ceiling (250 MB? 500 MB?)
2. Upgrade Supabase to Pro (`[dashboard]`, ~$25/mo, also helps #002 and Q1 in backlog)
3. Set bucket `file_size_limit` in Supabase dashboard
4. Update mobile constant
5. Push OTA: `cd apps/mobile && eas update --branch production --message "raise upload limit to 250MB"`

**Refactor opportunity** (do this even if not raising the cap): have the API return `maxFileSize` from `/uploads/presign`. Mobile reads it from response. Future raises = pure backend change.

---

### #004 — No path to "Apply to be a Creator" [ota]

**Start here**: open the iOS build in TestFlight, navigate around. Verify the gap. Probably also test on Android.

Files to investigate:
- `apps/mobile/app/(tabs)/profile.tsx` (most likely the right place to add CTA)
- `apps/mobile/app/edit-profile.tsx` (where the apply call currently lives)

**Suggested approach**:
1. On the Profile tab, if `currentUser.role === 'USER'`, render a prominent card at the top:
   ```
   ┌────────────────────────────────────────┐
   │ 🟢 Become a Creator                    │
   │ Apply to start posting and earn from   │
   │ your community.                        │
   │              [ Apply Now → ]           │
   └────────────────────────────────────────┘
   ```
2. Tap → triggers `apiService.post('/creators/apply', { firstName, lastName })`.
3. After successful response, show a "You're approved!" toast (in SKIP_KYC mode) or "Verification in progress" with Veriff URL.

**Reference**: Instagram's "Switch to Professional Account" flow is the canonical pattern. Note their progressive disclosure: tease the benefits before asking for action.

---

### #005 — Search keyboard has no dismiss [ota]

**Start here**: `apps/mobile/app/(tabs)/explore.tsx` around line 256 (the `TextInput`)

**Pattern to follow** (iOS-native search bar):

```tsx
<View style={styles.searchHeader}>
  <View style={styles.searchInputWrapper}>
    <Ionicons name="search" size={18} color={COLORS.textSecondary} />
    <TextInput
      ref={inputRef}
      value={searchText}
      onChangeText={setSearchText}
      onFocus={() => setSearchFocused(true)}
      returnKeyType="search"
      placeholder="Search creators or posts"
      style={styles.searchInput}
    />
  </View>
  {searchFocused && (
    <Pressable
      onPress={() => {
        inputRef.current?.blur();
        setSearchText('');
        setSearchFocused(false);
      }}
      style={styles.cancelBtn}
    >
      <Text style={styles.cancelText}>Cancel</Text>
    </Pressable>
  )}
</View>
```

Also add `keyboardDismissMode="on-drag"` to the FlatList of search results so scrolling dismisses the keyboard.

**External ref**: React Native [Keyboard API docs](https://reactnative.dev/docs/keyboard), iOS native search pattern in [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/search-fields).

---

### #006 — Action icons not vibrant enough [ota + design]

**Start here**: `apps/mobile/app/(tabs)/_layout.tsx`

Quick wins:
1. Bump inactive tab icon color from `COLORS.textTertiary` (#555) to `COLORS.textSecondary` (#888) or even `#AAA`.
2. Active tab keeps `COLORS.primary` (#00FF88) — already vibrant.

For Create Post discoverability, add the FAB pattern (see §3.7 above). Place on Home tab, position `bottom: 80` (above tab bar).

**Design dependency**: any color/size tweak should match the Figma design language at `docs/design/`. Confirm with the design system before shipping.

---

### #007 — Light theme [ota + design]

**Start here**: see §3.6 above (theme management library section).

This is a multi-day refactor. Order:
1. Design the light palette (in Figma, not in code) — needs design pass first.
2. Refactor `theme.ts` into `darkTheme` + `lightTheme` exports.
3. Build `ThemeProvider` + `useTheme` hook.
4. Run a codemod to replace `COLORS.x` → `useTheme().colors.x` across the codebase (~60 files).
5. Add a settings toggle.
6. Test thoroughly — every screen, both themes, status bar, modal backdrops.

**Codemod hint**: use `jscodeshift` or just a careful `sed` with manual review for the ~60 file refactor.

---

### #008 — Photo/video editing [native]

**Start here**: see §3.1-§3.5 above for full library breakdown.

Suggested MVP order:
1. **Phase 1**: replace `expo-image-picker` with `react-native-image-crop-picker` for the existing image upload flow (gives free crop UI). `[native]`
2. **Phase 2**: add `expo-camera` for direct capture. New screen `apps/mobile/app/capture.tsx`. `[native]`
3. **Phase 3**: add `react-native-compressor` to the upload pipeline for videos. Eliminates 50MB issue. `[native]`
4. **Phase 4**: add `react-native-video-trim` for video trim UI. `[native]`
5. **Phase 5** (stretch): Skia filters for photos. `[native]`

Each phase ships as a single TestFlight build. Don't try to do all 5 at once.

**External refs**:
- [Expo Camera example](https://docs.expo.dev/versions/latest/sdk/camera/)
- [react-native-image-crop-picker examples](https://github.com/ivpusic/react-native-image-crop-picker#examples)
- [Skia image filter cookbook](https://shopify.github.io/react-native-skia/docs/image/) — sepia, blur, contrast, etc.
- [Instagram's open-source-ish editor](https://github.com/instagram-clone) — search GitHub for "instagram clone react native" for reference architectures.

---

### #009 — Notifications icon missing from Home [ota]

**Start here**: `apps/mobile/app/(tabs)/home.tsx` — the home header area (likely a `<View>` near the top, alongside any "FOR YOU"/"CREATORS TO WATCH" tabs).

**Drop-in pattern**:
```tsx
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '@/providers/NotificationProvider';

// inside home header:
const router = useRouter();
const { unreadCount } = useNotifications();

<Pressable
  onPress={() => router.push('/notifications')}
  hitSlop={10}
  style={styles.bellWrapper}
>
  <Ionicons name="notifications-outline" size={24} color={COLORS.text} />
  {unreadCount > 0 && (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
    </View>
  )}
</Pressable>
```

**External ref**: Check git log for when the bell was removed — `git log --all -S "notifications-outline" -- apps/mobile/app/(tabs)/home.tsx` might show the regression.

---

### #010 — Admin promote-creator endpoint [backend]

**Start here**: `apps/api/lib/auth.ts` (add `requireAdmin` helper)

**Step 1**: Add `requireAdmin`:
```ts
export async function requireAdmin(request: NextRequest) {
  const user = await requireAuth(request);
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isAdmin: true },
  });
  if (!dbUser?.isAdmin) {
    throw NextResponse.json(
      { success: false, error: 'Admin access required' },
      { status: 403 }
    );
  }
  return user;
}
```

**Step 2**: Create `apps/api/app/api/admin/users/[id]/promote-creator/route.ts`:
```ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await requireAdmin(request);
  const updated = await prisma.user.update({
    where: { id },
    data: { role: 'CREATOR', kycStatus: 'VERIFIED', isAdminApproved: true },
  });
  await invalidateCache(cacheKeys.userProfile(id), cacheKeys.creatorProfile(id));
  return NextResponse.json({ success: true, data: updated });
}
```

**Step 3**: Flip your own user to admin once:
```sql
UPDATE users SET "isAdmin" = true WHERE email = 'sangeet@momento.network';
```

**Step 4**: cURL pattern:
```bash
curl -X POST https://momento-api-ten.vercel.app/api/admin/users/<user-id>/promote-creator \
  -H "Authorization: Bearer <your-privy-token>"
```

To get your Privy bearer token for cURL: in mobile app, log a console line from `apiService.ts` showing the JWT, copy it. Tokens expire ~1h.

---

### #011 — Pending creator applications list [backend]

**Start here**: copy `apps/api/app/api/creators/leaderboard/route.ts` and modify the query.

```ts
// apps/api/app/api/admin/users/pending-creators/route.ts
export async function GET(request: NextRequest) {
  await requireAdmin(request);
  const pending = await prisma.user.findMany({
    where: {
      role: 'USER',
      OR: [{ kycStatus: 'PENDING' }, { kycStatus: 'NONE' }],
    },
    select: { id: true, email: true, username: true, kycStatus: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ success: true, data: pending });
}
```

For an admin web UI later, the lightest path is a new Next.js page at `apps/landing/app/admin/page.tsx` with HTTP basic auth via middleware. Or build a separate `apps/admin/` workspace.

---

## 5. External open-source references

Curated list of repos and articles useful when working on Momento.

### Architecture / patterns

- [Expo Router examples](https://github.com/expo/router/tree/main/apps/playground) — file-based routing patterns
- [Next.js App Router docs](https://nextjs.org/docs/app) — every API route in this project uses App Router
- [Prisma + Next.js best practices](https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices) — connection pooling on serverless
- [Privy Expo SDK docs](https://docs.privy.io/guide/expo) — auth + wallet flows we use

### Mobile UI references

- [Instagram clone in RN (multiple)](https://github.com/search?q=instagram+clone+react+native&type=repositories&s=stars) — reference architectures for our missing features
- [TikTok-style feed in RN](https://github.com/dohooo/react-native-reanimated-carousel) — for vertical-feed UX inspiration
- [BeReal-style camera UI](https://github.com/birdwingo/react-native-instagram-stories) — camera + capture overlay patterns

### Media handling

- [react-native-vision-camera examples](https://github.com/mrousavy/react-native-vision-camera/tree/main/package/example) — modern camera patterns
- [Skia image filter cookbook](https://shopify.github.io/react-native-skia/docs/image/) — for #008 filters
- [Mux Direct Uploads](https://docs.mux.com/guides/upload-files-directly) — alternative to client-side transcoding

### Performance

- [Vercel Edge Runtime examples](https://vercel.com/templates?type=edge-functions)
- [React Native performance checklist](https://reactnative.dev/docs/performance)
- [FlashList migration guide](https://shopify.github.io/flash-list/docs/usage) — already using this; useful when adding new lists
- [Supabase Storage caching best practices](https://supabase.com/blog/storage-image-resizing-smart-cdn)

### Testing TestFlight builds

- [`ios-launch-playbook.html`](../apps/landing/public/ios-launch-playbook.html) (also live at /ios-launch-playbook.html on Vercel) — battle-tested step-by-step for building, submitting, and getting approval
- [Apple TestFlight docs](https://developer.apple.com/testflight/) — official

---

## 6. Useful commands cheatsheet

```bash
# Health check
curl -s https://momento-api-ten.vercel.app/api/health

# Tail prod logs (Vercel)
cd apps/api && vercel logs --follow

# Connect to prod DB
cd apps/api && source .env.local && psql "${DATABASE_URL%%\?*}"

# Clear a user's cache
source apps/api/.env.local && curl -X POST \
  "$UPSTASH_REDIS_REST_URL/del/user:<id>/creator:<id>" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"

# Push OTA update (mobile JS-only change)
cd apps/mobile && eas update --branch production --message "<msg>"

# Build new iOS TestFlight build (native change)
cd apps/mobile && eas build --profile production --platform ios

# Submit latest build to ASC
cd apps/mobile && eas submit --platform ios --latest

# Promote user to creator (until #010 ships)
psql "$DATABASE_URL_CLEAN" -c "UPDATE users SET role='CREATOR', \"kycStatus\"='VERIFIED', \"isAdminApproved\"=true, \"updatedAt\"=NOW() WHERE email='<email>' RETURNING id;"
# Then invalidate cache (replace <id> with the returned id)

# Check current backlog
cat docs/improvements-backlog.md | grep -E '^### .#[0-9]'
```

---

## 7. When in doubt — agent decision tree

```
Is the issue blocking users right now?
├── Yes → Open improvements-backlog.md, find or add as P0
└── No → Open improvements-backlog.md, find or add as P1-P3

Does the fix touch mobile code?
├── Yes, JS/TS only → [ota] tag, ship via `eas update`
├── Yes, native libs → [native] tag, requires new TestFlight build
└── No → [backend] or [dashboard] tag

Have I run the typecheck before pushing?
├── apps/api/ → `cd apps/api && pnpm tsc --noEmit`
├── apps/mobile/ → `cd apps/mobile && pnpm tsc --noEmit`
└── apps/landing/ → `cd apps/landing && pnpm tsc --noEmit`

Have I added the entry to improvements-backlog.md?
├── No → Add it (even if you're shipping the fix in the same PR)
└── Yes → Cross-reference the commit hash in the entry

Does the fix change anything user-visible?
├── Yes → Add a one-line entry to MEMORY.md "Recently Resolved" section
└── No → No memory update needed
```
