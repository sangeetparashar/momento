# Momento — Improvements & Deployment Plan

> Last updated: 2026-03-25

---

## Table of Contents

1. [App Performance Improvements](#1-app-performance-improvements)
2. [Feed-Before-Auth (Instant Content)](#2-feed-before-auth-instant-content)
3. [Environment Variables — Complete Reference](#3-environment-variables--complete-reference)
4. [API Endpoints to Deploy](#4-api-endpoints-to-deploy)
5. [Deploying to TestFlight (iOS)](#5-deploying-to-testflight-ios)
6. [Deploying to Google Play Internal Testing (Android)](#6-deploying-to-google-play-internal-testing-android)
7. [Pre-Launch Testing Checklist](#7-pre-launch-testing-checklist)
8. [CI/CD & Ongoing Operations](#8-cicd--ongoing-operations)

---

## 1. App Performance Improvements

### 1a. Feed — Smooth Loading

| Improvement | Why | Status |
|---|---|---|
| **Feed loads before auth** | Users see content instantly on app open — no blank screen while Privy initializes | ✅ Implemented |
| **Persist feed to AsyncStorage** | Reopening the app shows cached feed instantly, then refreshes in background | ✅ Implemented |
| **Image prefetch (already in place)** | `expo-image` prefetches next 5 images via `Image.prefetch()` | ✅ Already done |
| **FlatList tuning (already in place)** | `removeClippedSubviews`, `windowSize=5`, `initialNumToRender=2`, `getItemLayout` | ✅ Already done |
| **Default fallback location** | Feed uses NYC coords when device location isn't ready yet | ✅ Already done |

### 1b. App Startup — Smooth Loading

| Improvement | Why | Priority |
|---|---|---|
| **Splash screen hold via `expo-splash-screen`** | Hold native splash until providers + first feed page are ready — prevents white flash | High |
| **Reduce provider waterfall** | LocationProvider, NotificationProvider, and PrivyGuard all run async init in sequence. Consider parallelizing | Medium |
| **Lazy-load wallet/swap modules** | Jupiter swap, onramp screens only load when user navigates to wallet — reduce initial JS bundle parse time | Medium |
| **Add `expo-splash-screen` `preventAutoHideAsync`** | Call in `_layout.tsx`, hide after first feed render | High |

### 1c. Explore Screen

| Improvement | Why | Priority |
|---|---|---|
| **Replace masonry FlatList with FlashList** | `@shopify/flash-list` is already a dependency but explore uses manual masonry. FlashList handles large lists better | Medium |
| **Skeleton placeholders on explore** | Show skeleton cards while creators/posts load | Low |

### 1d. General Performance

| Improvement | Why | Priority |
|---|---|---|
| **Enable Hermes (already via New Arch)** | `newArchEnabled: true` in app.json — Hermes is on | ✅ Already done |
| **Reanimated animations (already in place)** | All animations use `react-native-reanimated` (UI thread) | ✅ Already done |
| **Bundle analysis** | Run `npx expo export --dump-sourcemap` to identify large dependencies (ethers shims, polyfills) | Medium |

---

## 2. Feed-Before-Auth (Instant Content)

### Architecture Change

**Before:** App opens → Privy auth init → if not logged in → `/login` (blank screen) → sign in → `/home` → feed loads

**After:** App opens → feed starts loading immediately (no auth required) → navigate to `/home` → show feed with auth gate overlay if not signed in → user signs in → overlay dismisses, full features unlocked

### What Changed

1. **`index.tsx` (splash router):** Always navigates to `/(tabs)/home` regardless of auth state. No longer redirects to `/login`.
2. **`useFeed.ts`:** No changes needed — feed already works without auth. The API returns `isLiked: false` for unauthenticated users.
3. **`home.tsx`:** Added `AuthGateOverlay` — a semi-transparent overlay with sign-in CTA that appears when user is not authenticated. Feed is fully visible and scrollable behind it.
4. **`QueryProvider.tsx`:** Added `feed` to persisted query keys so feed data survives app restarts.
5. **Feed API (`/api/feed`):** Already supports optional auth — `getAuthUser()` returns null for unauthenticated requests, and the feed still returns ranked posts.

### Auth-Gated Actions

These actions check auth and show a sign-in prompt if the user isn't logged in:
- Like / unlike posts
- Comment on posts
- Create posts
- Follow creators
- Access wallet / swap / onramp
- Edit profile

---

## 3. Environment Variables — Complete Reference

### Mobile App (`apps/mobile`)

Set these in `eas.json` under each build profile's `env` block, or in `.env.*` files.

| Variable | Description | Example | Required |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | Momento API base URL | `https://momento-api-ten.vercel.app/api` | Yes |
| `EXPO_PUBLIC_PRIVY_APP_ID` | Privy app ID | `cmjbzyj4q00twlb0d1uc5w0sb` | Yes |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | Helius RPC endpoint | `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY` | Yes |
| `EXPO_PUBLIC_SOLANA_NETWORK` | `devnet` or `mainnet-beta` | `mainnet-beta` | Yes |

### API Backend (`apps/api`)

Set these in Vercel Environment Variables (Settings → Environment Variables).

#### Core Infrastructure

| Variable | Description | Where to Get | Required |
|---|---|---|---|
| `DATABASE_URL` | Supabase PostgreSQL (transaction mode, port 6543) | Supabase → Settings → Database → Connection string (Transaction) | Yes |
| `DIRECT_URL` | Supabase PostgreSQL (direct, port 5432) | Supabase → Settings → Database → Connection string (Direct) | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → Settings → API → Project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (server only) | Supabase → Settings → API → service_role key | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint | Upstash Console → Database → REST API URL | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token | Upstash Console → Database → REST API Token | Yes |

#### Authentication

| Variable | Description | Where to Get | Required |
|---|---|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID (must match mobile) | Privy Dashboard → App Settings | Yes |
| `PRIVY_APP_SECRET` | Privy server secret | Privy Dashboard → App Settings → App Secret | Yes |

#### Blockchain & DeFi

| Variable | Description | Where to Get | Required |
|---|---|---|---|
| `HELIUS_API_KEY` | Helius RPC + DAS API key | Helius Dashboard → API Keys | Yes |
| `SOLANA_NETWORK` | `devnet` or `mainnet-beta` | Set manually | Yes |
| `JUPITER_API_KEY` | Jupiter swap API key (optional for low volume) | Jupiter Station → API | No |
| `MOMENTO_FEE_WALLET` | Solana wallet address for platform swap fees | Your Solana wallet | Yes (for swaps) |
| `MOMENTO_PLATFORM_FEE_BPS` | Platform fee in basis points (400 = 4%) | Set manually | No (default: 400) |

#### Fiat Onramp Providers

| Variable | Description | Where to Get | Required |
|---|---|---|---|
| `RAMP_API_KEY` | Ramp Network API key | Ramp Dashboard → API Keys | Yes (for Ramp) |
| `RAMP_ENVIRONMENT` | `sandbox` or `production` | Set manually | Yes (for Ramp) |
| `MOONPAY_API_KEY` | MoonPay API key | MoonPay Dashboard → API Keys | Yes (for MoonPay) |
| `MOONPAY_ENVIRONMENT` | `sandbox` or `production` | Set manually | Yes (for MoonPay) |
| `TRANSAK_API_KEY` | Transak API key | Transak Dashboard → API Keys | Yes (for Transak) |
| `TRANSAK_ENVIRONMENT` | `STAGING` or `PRODUCTION` | Set manually | Yes (for Transak) |

#### KYC Verification

| Variable | Description | Where to Get | Required |
|---|---|---|---|
| `VERIFF_API_KEY` | Veriff KYC API key | Veriff Dashboard → Integration | Yes (for creator KYC) |
| `VERIFF_SHARED_SECRET` | Veriff webhook HMAC secret | Veriff Dashboard → Webhooks | Yes (for creator KYC) |

#### App Config

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Public API URL (for onramp callbacks) | Yes |
| `SKIP_KYC` | Set `true` to bypass KYC in development | No |
| `NODE_ENV` | `development` or `production` | Auto-set by Vercel |

---

## 4. API Endpoints to Deploy

All API routes live in `apps/api/app/api/`. The API deploys as a single Vercel project.

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/feed` | GET | Optional | Location-based feed with ranking |
| `/api/posts` | POST | Required | Create a new post |
| `/api/posts/[id]` | GET | Optional | Get post details |
| `/api/posts/[id]/like` | POST | Required | Like/unlike a post |
| `/api/comments` | GET/POST | Required | List/create comments |
| `/api/creators` | GET | Optional | List creators |
| `/api/creators/nearby` | GET | Optional | Nearby creators |
| `/api/creators/[id]` | GET | Optional | Creator profile |
| `/api/creators/apply` | POST | Required | Apply as creator (triggers KYC) |
| `/api/creators/[id]/follow` | POST | Required | Follow/unfollow |
| `/api/users/me` | GET/PATCH | Required | Current user profile |
| `/api/users/me/location` | POST | Required | Update user location |
| `/api/users/[id]` | GET | Optional | Public user profile |
| `/api/search` | GET | Optional | Full-text search |
| `/api/uploads/presign` | POST | Required | Get S3 presigned upload URL |
| `/api/wallet/balance` | GET | Required | Token + SOL balance |
| `/api/wallet/history` | GET | Required | Transaction history |
| `/api/wallet/swap` | GET/POST | Required | Jupiter swap quote + execute |
| `/api/wallet/onramp` | GET | Required | Fiat onramp URL |
| `/api/wallet/snapshots` | GET | Required | Portfolio snapshots |
| `/api/kyc/webhook` | POST | None (HMAC) | Veriff KYC webhook |

### API Deployment Steps

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Link the API project
cd apps/api
vercel link

# 3. Set ALL environment variables (see Section 3)
vercel env add DATABASE_URL production
vercel env add DIRECT_URL production
# ... repeat for every variable above

# 4. Deploy to production
vercel --prod

# 5. Run Prisma migrations on deploy (already in vercel.json build command)
#    Build command: prisma generate && npx tsx scripts/apply-postgis.ts && next build
```

---

## 5. Deploying to TestFlight (iOS)

### Prerequisites

| Requirement | How to Get |
|---|---|
| Apple Developer Account ($99/year) | https://developer.apple.com/programs/ |
| Expo account | https://expo.dev/signup |
| EAS CLI installed | `npm install -g eas-cli` |
| App Store Connect app created | https://appstoreconnect.apple.com → My Apps → + |
| Bundle ID registered | `com.momento.app` in Apple Developer → Certificates, IDs & Profiles |

### Step-by-Step

```bash
# 1. Login to EAS
eas login

# 2. Verify project config
cd apps/mobile
cat app.json  # Confirm bundleIdentifier = com.momento.app

# 3. Update eas.json submit config with real values
#    Replace PLACEHOLDER values:
#    - appleId: your Apple ID email
#    - ascAppId: App Store Connect app ID (numeric, from URL)
#    - appleTeamId: your 10-char team ID

# 4. Build for iOS production
eas build --platform ios --profile production

#    This will:
#    - Ask to log in to your Apple Developer account
#    - Generate/manage provisioning profiles automatically
#    - Build in the cloud (~15-25 min)
#    - Return a build URL

# 5. Submit to TestFlight
eas submit --platform ios --latest

#    OR submit a specific build:
eas submit --platform ios --id BUILD_ID

# 6. Wait for Apple processing (~5-30 min)
#    Check status in App Store Connect → TestFlight

# 7. Add testers
#    App Store Connect → TestFlight → Internal Testing → + Testers
#    Internal: up to 100 testers (Apple ID required)
#    External: up to 10,000 testers (requires Apple review, ~24-48h)

# 8. Testers receive email → install TestFlight app → install Momento
```

### TestFlight Tips

- **Internal testers** (your team): No Apple review needed, available immediately after processing
- **External testers**: Requires a brief App Review (~24-48h first time, faster after)
- **Build expiry**: TestFlight builds expire after 90 days
- **Auto-increment**: `eas.json` has `autoIncrement: true` — build numbers increase automatically
- **Crash reports**: Available in App Store Connect → TestFlight → Crashes

### eas.json Updates Needed for Real Deployment

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-real-apple-id@email.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCDE12345"
      }
    }
  }
}
```

---

## 6. Deploying to Google Play Internal Testing (Android)

### Prerequisites

| Requirement | How to Get |
|---|---|
| Google Play Developer Account ($25 one-time) | https://play.google.com/console/signup |
| Google Play Console app created | Play Console → Create app |
| Upload key / signing key | EAS manages this automatically |
| `google-services.json` (for push notifications) | Firebase Console → Project Settings → Android app |

### Step-by-Step

```bash
# 1. Build AAB for production (not APK — Play Store requires AAB)
eas build --platform android --profile production

#    The first build will:
#    - Generate an upload keystore (EAS manages it)
#    - Build an AAB (~10-20 min)

# 2. Download the AAB from the build URL
#    OR submit directly:
eas submit --platform android --latest

# 3. For first submission, you need a service account key:
#    a. Google Cloud Console → IAM → Service Accounts
#    b. Create account with "Service Account User" role
#    c. Grant "Release Manager" in Play Console → Users & Permissions
#    d. Download JSON key → save as google-services.json in apps/mobile/

# 4. Manual first upload (required by Google):
#    Play Console → Your app → Production → Create new release
#    Upload the AAB file
#    Fill in release notes
#    Save → Review → Start rollout

# 5. After first upload, configure EAS auto-submit:
#    eas.json already has: "track": "internal"
#    Future submissions: eas submit --platform android --latest

# 6. Add testers:
#    Play Console → Testing → Internal testing → Testers
#    Create an email list → add tester emails
#    Share the opt-in URL with testers

# 7. Testers click opt-in link → install from Play Store
```

### Google Play Tips

- **Internal testing**: Up to 100 testers, no review needed, available in minutes
- **Closed testing (Alpha/Beta)**: More testers, requires brief review
- **AAB vs APK**: Play Store requires AAB. The `production` EAS profile builds AAB by default.
- **Development profile** builds APK (for sideloading/direct install during dev)

### Important: First-Time Google Play Setup

Google requires a **manual first upload** through the Play Console web UI before automated submissions work. Plan for this.

---

## 7. Pre-Launch Testing Checklist

### Core Flows

- [ ] **Auth flow**: Sign up with Google → wallet created → profile setup → home feed
- [ ] **Auth flow**: Login with existing account → home feed with personalized data
- [ ] **Feed**: Feed loads without auth (guest view) → shows posts with location ranking
- [ ] **Feed**: Pull-to-refresh works → radius expansion if few nearby posts
- [ ] **Feed**: Horizontal swipe between posts → video autoplay/pause on visibility
- [ ] **Feed**: Algorithm switcher (smart/recent/popular/nearby/following)
- [ ] **Explore**: Masonry grid loads → search works → creator/post tabs
- [ ] **Post creation**: Pick image/video → add caption → upload → appears in feed
- [ ] **Likes**: Like/unlike with optimistic update → count updates immediately
- [ ] **Comments**: Add comment → appears in list → count updates
- [ ] **Follow**: Follow/unfollow creator → follower count updates
- [ ] **Profile**: Edit profile → save → changes reflected
- [ ] **Notifications**: Push notification received → tap opens relevant screen

### Wallet & DeFi Flows

- [ ] **Wallet balance**: Shows SOL + USDC + token balances (via Helius)
- [ ] **Swap**: SOL → USDC quote → execute swap → balance updates
- [ ] **Swap fee**: 4% platform fee deducted and sent to fee wallet
- [ ] **Onramp (Ramp)**: Opens Ramp widget → purchase USDC → balance updates
- [ ] **Onramp (MoonPay)**: Opens MoonPay widget → purchase USDC
- [ ] **Onramp (Transak)**: Opens Transak widget → purchase USDC
- [ ] **Transaction history**: Shows recent transactions with signatures

### KYC / Creator

- [ ] **Creator application**: Submit → Veriff KYC flow → webhook updates status
- [ ] **Skip KYC (dev)**: `SKIP_KYC=true` → auto-approves creator application

### Platform-Specific

- [ ] **iOS**: Location permission prompt → grant → feed shows nearby posts
- [ ] **iOS**: Push notification permission → grant → token registered
- [ ] **iOS**: Deep link `momento://` → opens correct screen
- [ ] **Android**: Same as iOS tests above
- [ ] **Android**: Back button behavior (hardware) → navigates correctly

### Edge Cases

- [ ] **No location**: Feed falls back to NYC default coords
- [ ] **No posts nearby**: Radius auto-expands through tiers (5→10→25→50→100 km)
- [ ] **Offline**: Cached feed shows from AsyncStorage → error toast on actions
- [ ] **Token expired**: API returns 401 → Privy refreshes token → retry
- [ ] **Rate limited**: API returns 429 → user sees "slow down" message

### Performance Benchmarks

- [ ] **App launch to feed visible**: < 2 seconds (cached), < 4 seconds (cold)
- [ ] **Feed swipe**: 60fps, no jank
- [ ] **Image load**: Blurhash placeholder → full image in < 1s
- [ ] **Video autoplay**: Starts within 500ms of becoming visible

---

## 8. CI/CD & Ongoing Operations

### Recommended EAS Build Pipeline

```bash
# Development (for internal testing during development)
eas build --platform all --profile development

# Preview (for QA / stakeholder testing)
eas build --platform all --profile preview

# Production (for TestFlight + Play Store)
eas build --platform all --profile production
eas submit --platform all --latest
```

### Vercel API Deployment

The API auto-deploys on push to `main` if connected to Vercel. Otherwise:

```bash
cd apps/api
vercel --prod
```

### Monitoring

| What | Tool | Setup |
|---|---|---|
| API errors | Vercel → Logs | Built-in |
| Mobile crashes | EAS → Crashes / Sentry | Add `sentry-expo` |
| API performance | Vercel → Analytics | Built-in |
| Redis usage | Upstash Console | Built-in |
| Database | Supabase Dashboard | Built-in |

### Version Bumping

```bash
# Bump version before production builds
cd apps/mobile
# Edit app.json → "version": "1.1.0"
# eas.json autoIncrement handles buildNumber/versionCode
```
