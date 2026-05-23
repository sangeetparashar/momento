# Agent Handoff: Momento iOS Enablement

> Generated: 2026-04-17
> Session focus: Got iOS local Xcode build working end-to-end, fixed broken video URLs in feed, migrated expo-av → expo-video, hardened iOS launch path (splash race, pre-auth gating, Podfile sandbox plugin)

## 1. Project Overview

Momento is a location-based creator platform — creators post geotagged content, users discover nearby, embedded Solana wallets via Privy, KYC required for creators. Monorepo at `/Users/sangeet/Desktop/momento`. Stack: Next.js 14 API on Vercel (PostgreSQL + PostGIS via Supabase + Prisma), Expo SDK 54 mobile app (TypeScript + expo-router), React Native landing site, shared TS package.

## 2. Current State

### Working
- **iOS simulator build** — verified `expo prebuild --clean → pod install → xcodebuild` returns exit 0, `Momento.app` produced for iPhone 17 sim. Last live run also launched the app, logged into Privy with Google, fetched feed/creators/post detail/comments at HTTP 200.
- **Android EAS dev build** — Privy Google OAuth, feed, full app flow.
- **Privy auth** — Google works on iOS sim now that `com.momento.network` is allowlisted in Privy dashboard (Settings → Clients → iOS bundle IDs). DID issued: `did:privy:cmmybj7nm00u40bl5yu8wjomv` for the test login.
- **Feed videos** — 150 broken posts repaired in production DB on 2026-04-15. New URLs use `samplelib.com` / `w3schools.com` / Pexels (verified 200).
- **expo-video** — fully migrated from expo-av. SDK 55 ready.
- **Pre-auth API hygiene** — `/users/me/push-token` and `/users/me/location` no longer fire before login.
- **Splash → login transition** — race fixed.
- **Config plugin for iOS sandboxing** — `ENABLE_USER_SCRIPT_SANDBOXING=NO` survives `expo prebuild` so clean clones build.

### Not Yet Working / Untouched
- **Phase 4 of iOS workflow doc** — APNs key needs to be uploaded to EAS (see `docs/ios-enablement-workflow.html`). Has Key ID `7PA9M865VN`, file at `apps/mobile/AuthKey_7PA9M865VN.p8`. Blocks push on real device.
- **Phase 7** — physical iPhone build (`eas build --profile development-device --platform ios`). Requires plugged-in iPhone for UDID registration. User mentioned they're acquiring a device.
- **Phase 8** — TestFlight production build + add testers.
- **Push notifications on Android** — requires `google-services.json` in EAS build config (per existing memory).
- **Onboarding "setup profile" loops** across login/logout cycles.
- **Login screen flashes** briefly after auth before loading screen shows.
- **Bottom tab buttons** sometimes need multiple clicks.
- **Follow/Buy button** on `creator/[id].tsx` cramped — needs 50/50 split.

## 3. What Was Done This Session

1. Resumed iOS workflow at Phase 6 — generated native iOS project via `npx expo prebuild --platform ios` (creates `apps/mobile/ios/`).
2. Hit CocoaPods Ruby Unicode crash; fixed with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`. Pod install: 117 pods integrated.
3. First xcodebuild surfaced `BUILD FAILED` buried under 3,420 warnings. Diagnosed real error: `Sandbox: bash deny(1) file-write-create .../resources-to-copy-Momento.txt` from `ENABLE_USER_SCRIPT_SANDBOXING=YES`.
4. Added Podfile `post_install` hook setting flag to `NO` on Pods + user project. Re-pod-installed. Re-built — `BUILD SUCCEEDED`.
5. User confirmed Xcode build worked. Ran `npx expo run:ios --device "iPhone 17"` in background — full build + boot + install + launch. Metro on `localhost:8081`.
6. App froze on splash screen. Diagnosed: `onLayout` callback ran once before `fontsLoaded` flipped true, so the `if (fontsLoaded) SplashScreen.hideAsync()` guard skipped, and `onLayout` doesn't re-fire. Fix: add `useEffect` keyed on `fontsLoaded` in `apps/mobile/app/_layout.tsx` lines 86–101.
7. Login screen rendered. Google sign-in errored with "Native app ID com.momento.network has not been set as an allowed app identifier". User added it in Privy dashboard. Login then succeeded (DID issued).
8. User reported videos not showing. Tested `storage.googleapis.com/gtv-videos-bucket/sample/*` URLs in seed.ts — all return 403 (Google deprecated the bucket).
9. Replaced `SAMPLE_VIDEO_URLS` array in `apps/api/prisma/seed.ts` with 7 verified-live URLs.
10. Wrote `apps/api/scripts/fix-broken-video-urls.ts` — idempotent script that updates posts whose `mediaUrl` contains `storage.googleapis.com/gtv-videos-bucket`. Ran via `dotenv-cli` against `.env.local` DB — **150 posts updated**.
11. Migrated 3 files from `expo-av`'s `Video` + `ResizeMode` to `expo-video`'s `VideoView` + `useVideoPlayer`:
    - `apps/mobile/app/(tabs)/home.tsx` (feed card — also removed manual stopAsync/unloadAsync/loadAsync lifecycle)
    - `apps/mobile/app/post/[id].tsx` (post detail)
    - `apps/mobile/src/components/features/PostCard.tsx`
    Player play/pause/mute now driven from `useEffect` against the player instance, not JSX props. Installed `expo-video ~3.0.16`, removed `expo-av`, registered `expo-video` plugin in `app.json`.
12. Gated push token POST in `apps/mobile/src/providers/NotificationProvider.tsx` on `authUser?.id`. Added second `useEffect` that re-registers post-login.
13. Gated location POST in `apps/mobile/src/providers/LocationProvider.tsx` on `authUser?.id` (added `useAuth` import).
14. Changed `console.error` → `console.warn` at `apps/mobile/src/services/api.ts:131` so 401s don't trigger the RN red-box overlay.
15. Built Expo config plugin `apps/mobile/plugins/with-ios-script-sandboxing.js` that injects the `ENABLE_USER_SCRIPT_SANDBOXING=NO` post_install snippet into the generated Podfile. Registered it in `apps/mobile/app.json` plugins array. This is **critical** because `ios/` is gitignored — without the plugin, prebuild wipes the manual Podfile fix.
16. Verified clean-build path: `rm -rf ios/ && expo prebuild --platform ios --clean && cd ios && pod install && xcodebuild ... build` → exit 0.
17. Committed in 3 logical chunks and pushed to `origin/main`:
    - `23c903d` fix(api): replace deprecated Google sample video URLs
    - `c5e7d48` feat(mobile): migrate expo-av to expo-video
    - `62806a9` fix(mobile): iOS launch hardening — splash, auth gating, sandbox plugin

## 4. Key Decisions & Rationale

| Decision | Why | Alternatives Considered |
|----------|-----|------------------------|
| Local Xcode build instead of EAS cloud for first iOS build | User explicitly asked, faster iteration, owns the Mac | EAS cloud (cold-start each time, costs build minutes) |
| Expo config plugin (not hand-edited Podfile) for sandbox fix | `ios/` is in root `.gitignore` (Expo managed workflow). Hand edits to Podfile are wiped on next prebuild — including on EAS cloud builds | Bare workflow with committed `ios/` (loses Expo abstractions); xcconfig file (clunkier); patch-package |
| Surgical DB fix script (not full re-seed) for broken video URLs | Re-seed wipes ALL data including legitimate user posts | Full seed reset (destructive); manual SQL (less reproducible) |
| Mobile-side auth gating (not server change) for pre-auth 401s | Server is correct — it MUST 401 unauthenticated. Mobile is what should stop firing prematurely | Toast/banner UI for 401s (still spams logs); ignore (RedBox issue) |
| iPhone 17 simulator | Xcode 26.4 doesn't ship iPhone 16 family. iPhone 17 lineup is what's available | Older Xcode (would mean downgrading) |
| Keep `ENABLE_USER_SCRIPT_SANDBOXING=NO` permanently | App Store / TestFlight don't reject for it; standard RN-on-Xcode-15+ workaround | Refactor RN build scripts to be sandbox-clean (not feasible, upstream RN issue) |
| `useVideoPlayer` driven by `useEffect` for play/pause/mute | expo-video's player state lives on the hook instance, not on JSX props — props approach doesn't exist anymore | Refs to VideoView (deprecated pattern); state through context (overkill) |

## 5. Bugs, Failures & Lessons Learned

This is the highest-value section. Read in full before touching iOS or videos.

- **CocoaPods 1.16.2 + Ruby 4.0 Unicode crash**: `pod install` errored with `UnicodeNormalize.normalize: Unicode Normalization not appropriate for ASCII-8BIT (Encoding::CompatibilityError)`. **Fix**: `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` before any pod command. Already added to memory; add to your shell rc if you're new to this Mac.

- **Build log noise vs signal**: Initial xcodebuild output showed 3,420 warnings + "BUILD FAILED". 99.9% of warnings are third-party pods (Reanimated, Worklets, SDWebImage nullability specifiers, deprecated header comments). They are not blockers. **Find the real error with**: `gunzip -c <log>.xcactivitylog | strings | grep -E 'error:' | head -20`. The DB-locked error from parallel builds is also a red herring — close Xcode while running CLI builds.

- **Xcode auto-picks "My Mac (Designed for iPad)" destination**: produces `CURRENT_ARCH=undefined_arch` and link failures with `SUPPORTS_MACCATALYST=NO`. **Fix**: always manually pick an iPhone simulator in Xcode top bar before ⌘B/⌘R.

- **xcodebuild build is not a launch**: It compiles only. No simulator boot, no install, no app launch. User initially thought their build succeeded but nothing appeared. **For full flow on local**: `npx expo run:ios --device "iPhone 17"`. For CI: separate `xcrun simctl boot/install/launch` calls.

- **Splash screen frozen at boot**: Caused by an `onLayout` callback guarded on `fontsLoaded`. `onLayout` fires once on initial render before fonts load, sees `fontsLoaded=false`, returns. When fonts finish, `onLayout` doesn't re-fire — so the splash never hides. **Fix**: add a redundant `useEffect` on `[fontsLoaded]` that also calls `SplashScreen.hideAsync()`. Both paths now guarantee splash dismissal. Pattern lives at `app/_layout.tsx` lines 92–101 — replicate elsewhere if needed.

- **Privy "Native app ID not allowed" error**: Means the iOS bundle ID isn't in the Privy dashboard's allowlist. Fix is purely dashboard config (Settings → Clients → iOS bundle identifiers). Add `com.momento.network`. No rebuild required. Symptom: native error popup at login, no underlying code bug.

- **`storage.googleapis.com/gtv-videos-bucket/*` is dead**: Google's old free public sample video bucket now returns 403 to public GETs. Affects any test/seed code that uses these URLs. **Replacements that work as of 2026-04-15**: `download.samplelib.com/mp4/sample-{5,10,15,20,30}s.mp4`, `www.w3schools.com/html/mov_bbb.mp4`, and specific Pexels CDN URLs (most Pexels URLs 403, so test individually).

- **expo-av → expo-video API is breaking**: No prop-based controls. `useVideoPlayer(source, init)` returns a player instance; you call `player.play()`, `player.pause()`, set `player.muted = bool`. `<VideoView>` only takes `player`, `contentFit` (replaces `resizeMode`), and `nativeControls`. Refs to VideoView are not useful for control. Migration pattern: see `home.tsx` lines 68–87 for the full structure with viewport-aware play/pause.

- **Pre-auth API spam**: Hooks fire on mount before Privy's access token is wired through `AuthBridge`. Every cold start logged dozens of 401s on `/users/me/push-token` and `/users/me/location`. **Fix pattern**: `if (!authUser?.id) return` at the call site, plus a separate `useEffect` keyed on `authUser?.id` for retry-on-login behavior. Mobile-side concern only — the API server is correct to 401.

- **iOS simulator console noise**: `patternForKey`, `ImageIO createImageAtIndex`, `TextInputUI accumulator timeout`, `CoreFoundation AddInstanceForFactory`, `BrowserEngineKit Failed to terminate`, `libapp_launch_measurement`, `ExtensionFoundation`, `Unexpected devicectl JSON`, `failed to create image [-62]`. All Apple framework noise from the simulator runtime, present in every RN/native app. **Ignore forever**. Add to log filters.

- **Production logs in dev vs release**: `console.error` triggers React Native RedBox overlay in `__DEV__` mode but is invisible in production. Users never see RedBox or YellowBox in release builds. Most of what looks scary in dev logs is invisible in TestFlight/App Store.

- **`ios/` is gitignored**: This is the **single most important fact about the iOS build pipeline**. Any change to `ios/Podfile`, `ios/Momento.xcodeproj/project.pbxproj`, or `ios/Pods/` is non-persistent. Persistent iOS modifications MUST live in: (a) `app.json` config, (b) Expo config plugins under `apps/mobile/plugins/`, or (c) `eas.json`.

## 6. Codebase Map

```
momento/
├── docs/
│   ├── ios-enablement-workflow.html ── 8-phase iOS launch workflow (Phases 1–6 done)
│   └── handoff-ios-enablement-2026-04-17.md ── this file
│
├── apps/
│   ├── api/
│   │   ├── prisma/seed.ts ── post seed data; SAMPLE_VIDEO_URLS at line 56
│   │   └── scripts/
│   │       ├── apply-postgis.ts ── PostGIS migration (run once)
│   │       ├── promote-to-creator.ts ── manual user → creator
│   │       └── fix-broken-video-urls.ts ── NEW: idempotent video URL repair (run if more posts get bad URLs)
│   │
│   └── mobile/
│       ├── app.json ── Expo config; plugins list incl. expo-video + ./plugins/with-ios-script-sandboxing
│       ├── eas.json ── EAS build profiles (incl. development-device for physical iOS)
│       ├── package.json ── expo-av REMOVED, expo-video ~3.0.16 ADDED
│       ├── AuthKey_7PA9M865VN.p8 ── APNs key (gitignored), needs EAS upload
│       │
│       ├── plugins/
│       │   └── with-ios-script-sandboxing.js ── NEW: injects ENABLE_USER_SCRIPT_SANDBOXING=NO into generated Podfile
│       │
│       ├── ios/  ── GITIGNORED. Regenerated by `expo prebuild`. DO NOT hand-edit.
│       │
│       ├── app/
│       │   ├── _layout.tsx ── splash hide fix (useEffect on fontsLoaded, lines 92–101)
│       │   ├── (tabs)/home.tsx ── feed card; expo-video migration
│       │   └── post/[id].tsx ── post detail; expo-video migration
│       │
│       └── src/
│           ├── components/features/PostCard.tsx ── expo-video migration
│           ├── providers/
│           │   ├── NotificationProvider.tsx ── push token gated on authUser.id; post-login retry effect
│           │   └── LocationProvider.tsx ── location POST gated on authUser.id (added useAuth import)
│           ├── services/api.ts ── line 131 console.error → console.warn (RedBox killer)
│           └── hooks/useAuth.ts ── exposes { user, isReady, ... }
│
└── packages/shared/ ── consumed as raw TS via "main": "./src/index.ts"
```

## 7. Remaining Work

### High Priority

- [ ] **Phase 7: Physical iPhone build** — User is acquiring a device. Once available:
  ```
  cd apps/mobile && eas build --profile development-device --platform ios
  ```
  EAS shows a QR code; scan on iPhone to register UDID. After build completes, install via Expo dashboard or `eas device:create`. Then run the full device smoke test from `docs/ios-enablement-workflow.html` Phase 7.2.

- [ ] **Phase 4: APNs key upload to EAS** — required for push to work on real iOS devices. Not blocking sim or Android.
  ```
  cd apps/mobile && eas credentials --platform ios
  ```
  Select "Push Notifications: Manage your Apple Push Notifications Key" → "Upload a Push Notifications Key". Path: `./AuthKey_7PA9M865VN.p8`, Key ID `7PA9M865VN`, Team ID `9BJL3C9DHA`.

### Medium Priority

- [ ] **Onboarding "setup profile" loop bug** — old issue from prior session, still present. State is not persisting per-user across login/logout cycles. Investigate AsyncStorage key namespacing in onboarding flow.
- [ ] **Login screen flash after auth** — brief flicker of login screen between Privy success and the loading state. Likely an auth state transition issue in `_layout.tsx` or `PrivyGuard`.
- [ ] **FCM `google-services.json`** for Android push — copy from Firebase console and reference in `eas.json` Android build.

### Low Priority / Nice to Have

- [ ] **Bottom tab buttons multi-click** — instrument with tap logging to find the swallowed event.
- [ ] **Follow/Buy button layout** on `creator/[id].tsx` — 80/20 currently, want 50/50.
- [ ] **Phase 8: TestFlight production build + testers** — only after Phase 7 is solid.
- [ ] **Verify Pexels video URL** in seed.ts works long-term — only 1 of 7 Pexels URLs we tested returned 200, so this one might rot. Consider removing from the sample pool if it breaks.

## 8. Environment & Setup Notes

### Required for iOS local build (Mac)
- Xcode 26.4 (installed; ships iPhone 17 family sims)
- CocoaPods 1.16.2 — **must export UTF-8 locale before use**:
  ```
  export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
  ```
- Node 22+, pnpm 10+, Ruby 4.0 (system)

### Apple Developer
- Account: `brian@mylz.run`
- Team ID: `9BJL3C9DHA`
- Bundle ID: `com.momento.network`
- App Store Connect App ID: `6762237065` ("Momento Network")
- APNs Key ID: `7PA9M865VN` (file at `apps/mobile/AuthKey_7PA9M865VN.p8`, gitignored)

### Privy
- App ID: `cmjbzyj4q00twlb0d1uc5w0sb`
- Client ID: `client-WY6UDfFofojZafsbGzmGDGYExCP86xeQuKCcUvoyGmpqZ`
- iOS bundle `com.momento.network` is in the allowlist (added 2026-04-15 by user via dashboard)
- Android bundle was already allowlisted in prior session

### Deployment
- API: Vercel project `momento-api` → https://momento-api-ten.vercel.app
- Mobile: EAS project `@sangeetparashar24/momento`

### To build/run locally from a clean checkout
```
git clone <repo> && cd momento
pnpm install
cd apps/mobile
# generates ios/ folder; config plugin injects Podfile fix automatically
npx expo prebuild --platform ios --clean
cd ios
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
pod install
cd ..
# builds, boots iPhone 17 sim, installs, launches, starts Metro
npx expo run:ios --device "iPhone 17"
```

### DB scripts
Run from `apps/api/`:
```
pnpm dlx dotenv-cli@latest -e .env.local -- npx tsx scripts/fix-broken-video-urls.ts
```

### Known port conflict
Metro on `8081` conflicts with OrbStack if running. Workaround uses `.claude/launch.json` to set port 8082 — currently only configured for Android side, may need iOS treatment if OrbStack is up.

## 9. Reference Links

- iOS enablement workflow (8-phase HTML doc): `docs/ios-enablement-workflow.html`
- Current memory: `/Users/sangeet/.claude/projects/-Users-sangeet-Desktop-momento/memory/MEMORY.md`
- Project memory (other files): `architecture.md`, `decisions.md`, `patterns.md`, `runtime_issues.md`, `env_reference.md`
- expo-video docs: https://docs.expo.dev/versions/latest/sdk/video/
- Expo config plugins: https://docs.expo.dev/config-plugins/introduction/
- Apple Developer console: https://developer.apple.com/
- Privy dashboard: https://dashboard.privy.io/
- Recent commits this session: `23c903d`, `c5e7d48`, `62806a9` (all on `main`)
