# Momento: App Improvements & Deployment Plan

## Part 1: Feed & App Loading Improvements

### Current State Assessment

**Architecture**: Expo SDK 54 + React Native 0.81 (New Arch enabled), Expo Router file-based navigation, TanStack Query with AsyncStorage persistence, Privy auth, PostGIS-powered geo feed, Redis caching on the API.

**What's already good:**
- `expo-image` with disk caching, blurhash placeholders, and recyclingKey
- Image prefetching in `useFeed` (next 5 images)
- TanStack Query persistence to AsyncStorage (profile, wallet, creator data survives restarts)
- Skeleton screens for feed, profile, explore, etc.
- `FlatList` with `getItemLayout`, `removeClippedSubviews`, `initialNumToRender: 2`, `windowSize: 5`
- Redis-cached feed pool on the backend (sort-agnostic)
- Auto-expanding radius tiers with cached last-successful radius

---

### A. Feed Performance Improvements

#### 1. Switch from `FlatList` to `FlashList` (already a dependency)
**Priority: HIGH** | **Effort: Low**

`@shopify/flash-list` is already in `package.json` but the home feed still uses `FlatList`. FlashList provides:
- Recycling of item views (significant memory reduction)
- Faster scroll performance with large lists
- Built-in blank area tracking to measure performance

**Changes:**
- `apps/mobile/app/(tabs)/home.tsx`: Replace `FlatList` import and usage with `FlashList`
- Add `estimatedItemSize={screenHeight}` prop
- Remove `getItemLayout` (FlashList handles this internally)

#### 2. Video Autoplay Management — Only Play Visible Videos
**Priority: HIGH** | **Effort: Medium**

Currently every `FeedPage` mounts a `<Video>` component that uses `shouldPlay={isVisible && isPlaying}`, where `isVisible` is derived from `currentIndex`. This is correct but:
- Offscreen videos still hold memory-mapped buffers
- No explicit `unloadAsync()` when scrolling away

**Changes:**
- Call `videoRef.current?.unloadAsync()` when `isVisible` flips to `false`
- Preload the next video with `Video.createAudioPlayerAsync` for seamless transition
- Consider `expo-video` (newer API) for better lifecycle control

#### 3. Feed Data: Prefetch Next Page Earlier
**Priority: MEDIUM** | **Effort: Low**

Current `onEndReachedThreshold` is `0.5` which triggers when 50% away from end. For a horizontal paging feed this means it fires at the second-to-last item. Adjustments:
- Lower threshold to `0.3` or manually trigger when `currentIndex >= posts.length - 3`
- This ensures next page is ready before the user reaches the end

#### 4. Optimize Image Prefetching
**Priority: MEDIUM** | **Effort: Low**

Current prefetch runs in a `useEffect` on `query.data?.pages` which runs every time pages change. Improvements:
- Prefetch images for the next 3 posts relative to `currentIndex` (not just first 5 of all pages)
- Use `Image.prefetch` with priority parameter when available
- Skip prefetch on low-bandwidth connections using `NetInfo`

#### 5. Add Feed Caching to TanStack Persist
**Priority: MEDIUM** | **Effort: Low**

Currently `shouldDehydrateQuery` only persists `userProfile`, `creator`, `creators`, `walletBalance`. The feed is excluded, meaning every cold start requires a full network fetch.

**Changes:**
- Add `'feed'` to the persist allowlist in `QueryProvider.tsx`
- Set a shorter `maxAge` for feed data (e.g., 5 minutes) to avoid stale content
- This enables instant content display on app launch, with background refresh

#### 6. Reduce Radius Expansion Waterfalls
**Priority: LOW** | **Effort: Low**

The `useFeed` hook's auto-expanding radius can make up to 5 sequential API calls (5km, 10km, 25km, 50km, 100km) before finding enough posts. This is a cold-start waterfall.

**Changes:**
- Pass all tiers in a single API call: `/feed?radiusTiers=5,10,25,50,100&minPosts=3`
- Let the backend handle expansion in a single request
- Falls back gracefully to current behavior if backend doesn't support it

---

### B. App Loading & Startup Improvements

#### 1. Add a Proper Splash Screen with `expo-splash-screen`
**Priority: HIGH** | **Effort: Low**

Currently the `index.tsx` shows a `MomentoLogo` + "Loading your experience..." text, but there's no native splash screen keeping the white flash away during JS bundle load.

**Changes:**
- Install `expo-splash-screen`
- Add `SplashScreen.preventAutoHideAsync()` at app entry
- Hide splash only after auth state + navigation are ready
- Configure in `app.json` with the app's dark background (`#0D0D0D`)

#### 2. Parallelize Startup Checks
**Priority: HIGH** | **Effort: Medium**

`index.tsx` currently waits for: auth ready → profile fetch → navigate. The profile fetch is sequential after auth.

**Changes:**
- Start profile prefetch speculatively during auth initialization
- Use `queryClient.prefetchQuery` for feed data as soon as location is available
- Overlap location permission request with auth initialization

#### 3. Reduce Provider Nesting Overhead
**Priority: LOW** | **Effort: Low**

The root layout has 7 nested providers. While this is fine functionally, each context re-render propagates. Consider:
- Memoizing provider values where they aren't already
- Lazy-loading heavy providers (e.g., `NotificationProvider`) after initial render

---

### C. General UX Polish

#### 1. Pull-to-Refresh on Feed
Already implemented via `RefreshControl` wrapping a `ScrollView`. The `ScrollView` has `scrollEnabled={false}` which may interfere with the pull gesture on some devices. Verify this works reliably.

#### 2. Error States
`ErrorBoundary` exists but individual screen error states (API failures) could use retry buttons with exponential backoff rather than blank screens.

#### 3. Skeleton-to-Content Transition
Add a subtle fade-in animation when transitioning from `FeedSkeleton` to actual content to avoid the jarring snap.

---

## Part 2: Deploying to Users on Android & iOS

### Current EAS Configuration

The project already has a solid EAS setup in `apps/mobile/eas.json`:
- **development**: Internal distribution, APK for Android, simulator for iOS
- **preview**: Internal distribution with auto-increment
- **production**: Auto-increment, Apple submission placeholders, Google Play internal track

### Prerequisites (Both Platforms)

1. **Expo account**: Already configured (`owner: sangeetparashar24`, `projectId` in app.json)
2. **EAS CLI**: `npm install -g eas-cli` (requires v12+)
3. **Run `eas build:configure`** if not already done

---

### iOS: TestFlight Deployment

#### Step 1: Apple Developer Account Setup
- Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
- This gives access to App Store Connect and TestFlight

#### Step 2: Update `eas.json` Placeholders
Replace the placeholder values in `eas.json` → `submit.production.ios`:
```json
{
  "appleId": "<your-actual-apple-id@email.com>",
  "ascAppId": "<app-store-connect-app-id>",
  "appleTeamId": "<your-10-char-team-id>"
}
```
- `ascAppId`: Create the app in [App Store Connect](https://appstoreconnect.apple.com) → My Apps → New App. The ID is the numeric "Apple ID" shown in App Information.
- `appleTeamId`: Found in [developer.apple.com/account](https://developer.apple.com/account) → Membership Details

#### Step 3: Build for iOS
```bash
cd apps/mobile
eas build --platform ios --profile production
```
- EAS handles provisioning profiles and signing automatically
- First build will prompt for Apple credentials (or use `EXPO_APPLE_ID` env var)
- Build takes ~15-30 minutes on EAS servers

#### Step 4: Submit to TestFlight
```bash
eas submit --platform ios --profile production
```
- This uploads the `.ipa` to App Store Connect
- Or combine build + submit: `eas build --platform ios --profile production --auto-submit`

#### Step 5: TestFlight Configuration
1. In App Store Connect → TestFlight:
   - Add **internal testers** (up to 100, must have Apple Developer account roles) — available immediately
   - Create a **beta group** for external testers (up to 10,000) — requires Apple review (~24-48 hours first time)
2. Fill in test information: app description, feedback email, privacy policy URL
3. Share the TestFlight invite link or add testers by email

#### Step 6: Ongoing Updates
```bash
# Build + submit in one command
eas build --platform ios --profile production --auto-submit
```
- `autoIncrement: true` in eas.json handles build numbers automatically
- New builds appear in TestFlight within minutes of processing
- External testers may need re-review if significant changes are made

---

### Android: Internal Testing / APK Distribution

#### Option A: Direct APK Distribution (Fastest)
```bash
cd apps/mobile
eas build --platform android --profile preview
```
- This produces an `.apk` file
- Download from the EAS dashboard and share directly with testers
- No Google Play account needed
- Users must enable "Install from unknown sources"

#### Option B: Google Play Internal Testing (Recommended for Scale)

##### Step 1: Google Play Developer Account
- Register at [play.google.com/console](https://play.google.com/console) ($25 one-time fee)
- Create a new app entry

##### Step 2: Create a Service Account for EAS
1. In Google Cloud Console → create a service account
2. Grant it "Service Account User" role
3. Download the JSON key file → save as `apps/mobile/google-services.json` (already referenced in `eas.json`)
4. In Google Play Console → API access → link the service account
5. Grant "Release manager" permission to the service account

##### Step 3: Build AAB for Google Play
```bash
cd apps/mobile
eas build --platform android --profile production
```
- Production builds produce `.aab` (Android App Bundle) by default
- The preview profile produces `.apk` which is fine for direct sharing but not for Play Store

##### Step 4: Submit to Google Play
```bash
eas submit --platform android --profile production
```
- Uploads to the **internal** track (as configured in `eas.json`)
- Internal testing: up to 100 testers, no review needed
- Testers join via a link from Play Console

##### Step 5: Promote to Closed/Open Testing
- Internal → Closed Alpha → Open Beta → Production
- Closed testing requires a review (~days for first submission)
- Open testing link can be shared publicly

---

### Recommended Deployment Workflow

```
Development:
  eas build --profile development    → Dev client for team

Testing (pre-release):
  eas build --profile preview        → APK for quick Android testing
  eas build --profile production     → TestFlight (iOS) + Internal Track (Android)

Production:
  eas build --profile production --auto-submit → Both stores
```

### Environment Considerations

All three build profiles currently point to the **same** API URL and **devnet** Solana RPC. Before production release:

1. **Create production env vars**: mainnet RPC, production API URL, production Privy app ID
2. **Update `eas.json`** production profile:
   ```json
   "env": {
     "EXPO_PUBLIC_API_URL": "https://api.momento.app/api",
     "EXPO_PUBLIC_SOLANA_RPC_URL": "https://mainnet.helius-rpc.com/?api-key=PROD_KEY",
     "EXPO_PUBLIC_SOLANA_NETWORK": "mainnet-beta"
   }
   ```
3. **Rotate the Helius API key** currently committed in `eas.json` — it's visible in source control

### Key Gotchas

- **iOS privacy manifest**: Expo SDK 54 handles this, but verify before App Store review
- **Push notifications**: You'll need an APNs key uploaded to Expo (`eas credentials`) for iOS push notifications to work in production builds
- **Bundle identifier**: `com.momento.app` is set — make sure it matches what's registered in App Store Connect and Google Play
- **Privacy policy**: Required for both TestFlight external testing and Google Play. Add to your landing site
- **App icons & screenshots**: Required for store listings, not for TestFlight internal testing

---

### Quick Start Checklist

- [ ] Apple Developer Program enrollment ($99/year)
- [ ] Google Play Developer registration ($25 one-time)
- [ ] Update `eas.json` with real Apple team/app IDs
- [ ] Create Google Play service account JSON key
- [ ] Set up production environment variables
- [ ] Rotate exposed API keys in `eas.json`
- [ ] Upload APNs key to Expo for iOS push notifications
- [ ] Build & submit iOS: `eas build --platform ios --profile production --auto-submit`
- [ ] Build & submit Android: `eas build --platform android --profile production --auto-submit`
- [ ] Add testers in TestFlight and Google Play Console
