# AGENT_MEMORY.md — Momento Source of Truth

> **Last updated:** 2026-03-24 (post `1778ff2`)
> This file is the persistent shared memory for all sub-agents. Read it completely before starting any task.

---

## 1. Project Overview

**Momento** is a location-based social creator platform with blockchain monetization, built as a **Turbo + pnpm monorepo**. Three apps — a Next.js 14 API backend (Vercel), an Expo 54 / React Native 0.81 mobile app, and a Next.js 14 marketing landing page — share TypeScript types through `@momento/shared`. Authentication is handled by **Privy** (Google OAuth + auto-created embedded Solana wallets). Content is location-tagged using **PostGIS** geography columns on Supabase PostgreSQL. The API caches through **Upstash Redis**, stores media via **Supabase Storage**, reads wallet data from Solana via **Helius RPC**, and verifies creator identity through **Veriff KYC**. The mobile app uses **React Query** with AsyncStorage persistence for offline-first state management. The platform roadmap extends from social feed into **creator token launches**, **prediction markets**, **DeFi yield**, and **AI-powered cross-posting**.

---

## 2. Architecture Map

```
momento/                              # Turbo monorepo, pnpm@10.30.0
├── apps/
│   ├── api/                          # @momento/api — Next.js 14 (App Router) → Vercel (iad1)
│   │   ├── app/api/                  #   26 REST API routes
│   │   ├── lib/                      #   9 service modules (auth, redis, helius, prisma, etc.)
│   │   ├── prisma/                   #   Schema (8 models) + migrations + seed
│   │   └── scripts/                  #   Admin scripts (promote-to-creator, apply-postgis)
│   ├── mobile/                       # @momento/mobile — Expo 54, React Native 0.81 → EAS
│   │   ├── app/                      #   Expo Router file-based routes (20 screens)
│   │   └── src/
│   │       ├── components/           #     features/ (21) + primitives/ (11)
│   │       ├── hooks/                #     18 React Query hooks
│   │       ├── providers/            #     5 context providers
│   │       ├── services/             #     ApiService singleton + notificationStorage
│   │       ├── config/               #     env.ts, dummyData.ts
│   │       └── styles/               #     theme, typography, layouts
│   └── landing/                      # @momento/landing — Next.js 14 + Tailwind + Anime.js → Vercel
├── packages/
│   └── shared/                       # @momento/shared — enums, types, constants (raw TS, no build)
├── docs/                             # Architecture docs, audit, gaps, phase status
├── turbo.json                        # Build/dev/lint pipeline config
├── pnpm-workspace.yaml               # Workspace: apps/*, packages/*
└── vercel.json                       # API deployment config (iad1, CORS headers)
```

**Dev servers:** API `:3000` | Mobile web `:8081` | Landing `:3001`

---

## 3. Store Pattern (Data Flow)

### Write Path
```
Mobile UI (Button press)
  → React Query useMutation (optimistic update)
    → ApiService.post/patch/delete()
      → Authorization: Bearer <Privy JWT>
        → Next.js API Route Handler
          → Zod validation (lib/validation.ts)
            → Prisma $transaction → PostgreSQL + PostGIS
              → Redis invalidateCache('feed:*', 'creator:*', etc.)
                → Expo Push Notification (fire-and-forget)
```

### Read Path
```
PostgreSQL + PostGIS (raw SQL spatial queries)
  → Redis getOrSetCache(key, fn, TTL)
    → API response envelope: { success: true, data: T }
      → ApiService auto-unwraps envelope
        → React Query cache (staleTime, gcTime)
          → AsyncStorage persistence (select keys, 24h max)
            → Component re-renders via useQuery / useInfiniteQuery
```

### Cache Key Strategy

| Resource | Key Pattern | TTL |
|----------|-------------|-----|
| Feed pool (sort-agnostic) | `feed:{lat.toFixed(2)}:{lng.toFixed(2)}:{radiusKm}:pool` | 60s |
| Nearby creators | `creators:nearby:{lat}:{lng}:{radiusKm}` | 120s |
| Creator profile | `creator:{id}` | 300s |
| Creator posts | `creator:{id}:posts:*` | 120s |
| User profile | `user:{id}` | 300s |
| Wallet balance | `wallet:{address}` | 30s |
| Post detail | `post:{id}` | 300s |
| Post comments | `post:{postId}:comments:*` | 60s |

Location is quantized to 2 decimal places (~1.1km grid) to improve cache hit rates. Feed caches the raw post pool separately from ranking — the pool is sort-agnostic, ranking happens per-request using the user's follow graph.

### React Query Persistence
- **Persisted keys:** `feed`, `userProfile`, `creator`, `creators`, `walletBalance`
- **Storage:** AsyncStorage via `createAsyncStoragePersister`
- **Max age:** 24 hours | **Buster:** `v2`

---

## 4. Workflow Pipelines

### 4.1 Authentication
```
Login screen → Privy OAuth (Google) → Privy creates embedded Solana wallet →
PrivyGuard detects env (Expo Go = fallback, dev build = full Privy) →
AuthBridge registers token getter with ApiService →
First API call → getAuthUser() → privy.verifyAuthToken() →
user upsert via prisma.user.upsert (race-safe) →
If wallet "pending-*", sync real address from Privy on next auth
```
**Roles:** USER (default), CREATOR (requires KYC + admin approval)
**Guards:** `requireAuth()`, `requireCreator()`, `requireAdmin()` in `lib/auth.ts`

### 4.2 Post Creation
```
requireCreator guard → createPostSchema (Zod) → rate limit (50/hr, 100/day) →
If IMAGE/VIDEO: presigned URL already obtained via POST /uploads/presign →
Prisma $transaction: create Post + increment user.postCount →
invalidateCache('feed:*', 'creator:{userId}:*') →
fire-and-forget push notification to all followers
```

### 4.3 Feed Ranking
```
GET /feed?lat=X&lng=Y&radius=Z&sort=MODE&page=N
  → Cache raw post pool (200 posts within radius via ST_DWithin, sort-agnostic)
  → Per-request ranking using user's followed IDs
  → Score = w1*recency + w2*engagement + w3*proximity + w4*following
       recency    = 0.5^(ageMs / 43200000)          (12-hour half-life)
       engagement = log(1 + likes + comments) / log(1000)
       proximity  = 1 / (1 + distanceMeters / 5000)  (~0.5 at 5km)
       following  = 1 if user follows creator, else 0
  → Weight presets:
       smart    [0.30, 0.25, 0.25, 0.20]
       recent   [0.80, 0.10, 0.05, 0.05]
       popular  [0.10, 0.80, 0.05, 0.05]
       nearby   [0.05, 0.10, 0.80, 0.05]
       following[0.05, 0.10, 0.05, 0.80]
  → Offset pagination (page * 20)
  → Compute isLiked per-user → Return FeedResponse
```

### 4.4 KYC / Creator Application
```
POST /creators/apply → Veriff createSession() →
User completes ID verification in Veriff WebView →
Veriff POST /kyc/webhook → HMAC-SHA256 signature check →
Map status (9001=VERIFIED, 9102-9104=REJECTED) →
Update KycRecord + User.kycStatus →
Admin reviews → sets isAdminApproved → role promoted to CREATOR →
Push notification to user
```

### 4.5 Media Upload
```
Mobile: expo-image-picker → useUpload hook →
POST /uploads/presign → Supabase createSignedUploadUrl (1hr expiry) →
Mobile: PUT blob directly to Supabase signed URL →
Returns public URL → used in post creation or profile update
```

### 4.6 Location Tracking
```
LocationProvider: requestForegroundPermissions →
getCurrentPositionAsync(Balanced accuracy) →
15-min polling interval (paused on background, resume + immediate on foreground) →
Sync to server if moved >500m: POST /users/me/location →
Update User.locationLat/Lng → PostGIS trigger auto-syncs geography column
```

### 4.7 Wallet Data
```
GET /wallet/balance →
  Helius RPC: getBalance (SOL in lamports) →
  Helius DAS: searchAssets (fungible SPL tokens with metadata) →
  CoinGecko API: SOL/USD price →
  Aggregate: { solBalance, tokens[], totalValueUsd } →
  Record PortfolioSnapshot for historical charts →
GET /wallet/snapshots → PortfolioSnapshot[] for chart display
```

### 4.8 Notifications
```
Push: API lib/notifications.ts → Expo Push API (batches of 100) →
  Events: new_post, new_comment, new_like, new_follow, creator_approval
Mobile: NotificationProvider registers push token on mount →
  POST /users/me/push-token → stores in User.pushToken →
  Incoming notifications → notificationStorage (AsyncStorage) →
  /notifications screen reads from local storage →
  markAsRead / markAllAsRead updates local state
```

---

## 5. UI Information Flow

### Navigation Graph
```
index.tsx (auth gate)
  ├─→ [No auth] → login.tsx
  ├─→ [Auth, incomplete profile] → setup-profile.tsx
  └─→ [Auth, complete] → (tabs)/
        ├── home.tsx          Feed (horizontal paging FlatList, TikTok-style)
        ├── explore.tsx       Discovery (masonry grid, search, creators/posts toggle)
        └── profile.tsx       User profile (stats, posts grid, settings)

Stack screens (from any tab):
  ├── creator/[id].tsx        Creator profile + posts + follow
  ├── user/[id].tsx           Public user profile
  ├── post/[id].tsx           Post detail + comments
  ├── notifications.tsx       Notification inbox
  ├── market.tsx              Token market (dummy data)
  ├── wallet.tsx              Crypto wallet balance + chart + tokens
  ├── edit-profile.tsx        Profile editing (modal)
  ├── create-post.tsx         Post creation (modal)
  ├── delete-account.tsx      Account deletion (modal)
  └── settings/
      ├── favorites.tsx       Saved posts
      └── permissions.tsx     Device permissions
```

### Provider Tree (root `_layout.tsx`)
```
GestureHandlerRootView
  → SafeAreaProvider
    → QueryProvider (PersistQueryClientProvider + AsyncStorage)
      → PrivyGuard (conditionally wraps PrivyProvider + AuthBridge)
        → LocationProvider (Expo Location + server sync)
          → NotificationProvider (push token registration + local storage)
            → ErrorBoundary
              → Stack Navigator
```

### Component Organization

**Primitives** (`src/components/primitives/`): AnimatedPressable, Avatar, Button, Card, ErrorBoundary, LoadingView, MomentoLogo, Skeleton, Spacer, Text

**Features** (`src/components/features/`): PostCard, LikeButton, BookmarkButton, TickerBanner, TokenList, PortfolioChart, FeedAlgorithmModal, SwapModal, ComingSoonModal, SettingsSheet, FollowingModal, FeedSkeleton, ExploreSkeleton, ProfileSkeleton, CreatorProfileSkeleton, PostDetailSkeleton, UserProfileSkeleton, WalletSkeleton, ChartSkeleton, FavoritesSkeleton, FollowingListSkeleton

---

## 6. Service Communication

```
┌───────────────┐    HTTPS/REST     ┌────────────────┐
│    Mobile      │ ─────────────────→│      API       │
│  (Expo 54)     │  Bearer JWT       │  (Next.js 14)  │
│                │  {success, data}  │                │
└───────┬────────┘                   └───────┬────────┘
        │                                    │
        │ Privy SDK                          ├── Prisma → PostgreSQL + PostGIS (Supabase)
        │ (OAuth + embedded wallet)          ├── @upstash/redis → Upstash Redis
        │                                    ├── @supabase/supabase-js → Supabase Storage
        ▼                                    ├── Helius RPC → Solana (devnet / mainnet)
┌───────────────┐                            ├── CoinGecko API → SOL/USD price
│    Privy       │                            ├── Veriff API → KYC sessions + webhooks
│   (Auth SaaS)  │                            ├── Expo Push API → Push notifications
└───────────────┘                            └── @privy-io/server-auth → Token verification

┌───────────────┐
│    Landing     │    Static site — no backend communication
│  (Next.js 14)  │    Deployed separately on Vercel
└───────────────┘
```

**Key constraints:**
- Mobile **never** talks directly to the database; all data flows through the API
- All blockchain reads go through the API (Helius), not directly from mobile
- CORS: `*` (open) — will need tightening for production
- Request timeout: 15 seconds (ApiService)
- Rate limiting: per-user (JWT sub) or per-IP fallback (x-forwarded-for)
- API response envelope: always `{ success: boolean, data?: T, error?: string }`

---

## 7. Current State & Roadmap

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  ✅ DONE             │  │  🔶 NOW              │  │  🔵 NEXT             │  │  🟣 FUTURE           │  │  ⚪ HORIZON          │
│  ALPHA TESTING       │  │  BETA LAUNCH         │  │  PUBLIC LAUNCH       │  │  AI PLATFORM         │  │  YIELD & UTILITY     │
│  5 Creators          │  │  10-15 Creators      │  │  App Stores          │  │  Intelligence Layer  │  │  DeFi & NFTs         │
├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤
│                     │  │                     │  │                     │  │                     │  │                     │
│ PRIVY AUTH          │  │ FIAT ONRAMP         │  │ iOS APP STORE       │  │ AI SEARCH           │  │ YIELD VAULTS        │
│ (Google OAuth +     │  │ (Credit card/Apple  │  │ (App Store Review,  │  │ (Semantic vector     │  │ (Kamino, Marinade    │
│  Solana wallets)    │  │  Pay → USDC)        │  │  TestFlight → Prod) │  │  search replacing   │  │  on Solana; Aave,   │
│                     │  │                     │  │                     │  │  ILIKE text search)  │  │  Lido on Ethereum)  │
│ VERIFF KYC          │  │ TOKEN SWAPS         │  │ GOOGLE PLAY STORE   │  │                     │  │                     │
│ (Identity verify,   │  │ (Jupiter v6 DEX     │  │ (Play Console,      │  │ CROSS-POST AGENTS   │  │ STABLECOIN GROWTH   │
│  creator approval)  │  │  aggregator)        │  │  staged rollout)    │  │ (Post on Momento,   │  │ (Idle USDC earns    │
│                     │  │                     │  │                     │  │  AI distributes to  │  │  APY instead of     │
│ ONBOARDING FLOW     │  │ FOLLOW SYSTEM       │  │ ENDPOINT HARDENING  │  │  IG, TikTok, X,     │  │  sitting in wallet) │
│ (Profile setup,     │  │ ENHANCEMENTS        │  │ (Load testing,      │  │  YouTube)           │  │                     │
│  avatar, social     │  │ (Enhanced follow    │  │  security audit,    │  │                     │  │ NFT SUPPORT         │
│  links)             │  │  feed, suggestions) │  │  rate limit tuning) │  │ FEEDBACK ENGINE     │  │ (Creator NFTs,      │
│                     │  │                     │  │                     │  │ (Predict how posts  │  │  collectible drops, │
│ SMART FEED          │  │ LIQUIDITY POOLS     │  │ SCALING             │  │  will rank & perform│  │  event tickets)     │
│ (5 sort modes,      │  │ (Meteora DLMM or    │  │ (DB read replicas,  │  │  across platforms   │  │                     │
│  PostGIS spatial,   │  │  Raydium CLMM for   │  │  CDN, edge caching, │  │  using historical   │  │ TICKET UTILITY      │
│  algorithm          │  │  creator tokens)    │  │  horizontal API)    │  │  engagement data)   │  │ (Event access,      │
│  transparency)      │  │                     │  │                     │  │                     │  │  meetups, exclusive  │
│                     │  │ SMART CONTRACTS     │  │ FIRST 5-15 CREATOR  │  │ CONTENT MODERATION  │  │  content gating)    │
│ POST CREATION       │  │ (SPL Token 2022,    │  │ TOKEN LAUNCHES      │  │ (AI safety filter,  │  │                     │
│ (Text/image/video,  │  │  Metaplex metadata, │  │ (Most influential   │  │  image classify,    │  │ PREDICTION MARKETS  │
│  Supabase uploads)  │  │  bonding curves     │  │  creators launch    │  │  text toxicity)     │  │ (Creator milestones,│
│                     │  │  for fair launch)   │  │  their own tokens)  │  │                     │  │  industry outcomes, │
│ ENGAGEMENT          │  │                     │  │                     │  │ CREATOR INSIGHTS    │  │  fee sharing with   │
│ (Like, comment,     │  │ TOKEN CREATION      │  │ TRADING VOLUME      │  │ (AI growth advice,  │  │  artists + nonprof) │
│  follow, save,      │  │ & RAISES            │  │ (Buy/sell creator   │  │  audience analytics,│  │                     │
│  push notifications)│  │ (Creator launch     │  │  tokens, portfolio  │  │  trend detection,   │  │ FEE SHARING         │
│                     │  │  page: supply,      │  │  tracking, real     │  │  best time to post) │  │ (Platform + creator │
│ SEARCH & EXPLORE    │  │  price curve, raise │  │  price data via     │  │                     │  │  + optional nonprofit│
│ (Debounced search,  │  │  cap, duration)     │  │  Jupiter/Birdeye)   │  │                     │  │  revenue split)     │
│  masonry grid,      │  │                     │  │                     │  │                     │  │                     │
│  nearby creators)   │  │ REAL PRICE DATA     │  │ TOKEN-GATED         │  │                     │  │                     │
│                     │  │ (Replace dummy      │  │ CONTENT             │  │                     │  │                     │
│ WALLET VIEW         │  │  tokens with live   │  │ (Lock posts behind  │  │                     │  │                     │
│ (SOL + SPL tokens,  │  │  Jupiter/Birdeye    │  │  token ownership)   │  │                     │  │                     │
│  portfolio chart,   │  │  price feeds)       │  │                     │  │                     │  │                     │
│  balance tracking)  │  │                     │  │                     │  │                     │  │                     │
│                     │  │ TRANSACTION         │  │                     │  │                     │  │                     │
│ MOBILE APP          │  │ HISTORY             │  │                     │  │                     │  │                     │
│ (20 screens, 18     │  │ (Helius Enhanced    │  │                     │  │                     │  │                     │
│  hooks, Expo 54,    │  │  Transactions API)  │  │                     │  │                     │  │                     │
│  swipe navigation)  │  │                     │  │                     │  │                     │  │                     │
│                     │  │                     │  │                     │  │                     │  │                     │
│ API BACKEND         │  │                     │  │                     │  │                     │  │                     │
│ (26 endpoints,      │  │                     │  │                     │  │                     │  │                     │
│  Redis caching,     │  │                     │  │                     │  │                     │  │                     │
│  rate limiting)     │  │                     │  │                     │  │                     │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

---

## 8. Roadmap Detail

### Phase 1 — MVP Foundation / Alpha Testing (DONE)
**Audience:** 5 alpha creators | **Status:** Feature-complete, ready for integration testing

Everything built in Phase 1:

| Category | What's Built | Status |
|----------|-------------|--------|
| **Auth** | Privy OAuth (Google) + auto-created embedded Solana wallets | DONE |
| **KYC** | Veriff identity verification, webhook processing, admin approval flow | DONE |
| **Onboarding** | Profile setup (avatar, banner, bio, username, social links) | DONE |
| **Feed** | Location-based feed with PostGIS spatial queries, auto-expanding radius (5→100km) | DONE |
| **Feed Algorithm** | Smart ranking (recency, engagement, proximity, following), 5 sort modes, transparency modal | DONE |
| **Posts** | Create text/image/video posts with Supabase presigned uploads | DONE |
| **Engagement** | Like (optimistic + haptic), comment, follow/unfollow, save/bookmark | DONE |
| **Notifications** | Push notifications (7 event types), notification inbox, local persistence | DONE |
| **Search** | Debounced full-text search (creators + posts), 300ms, 2-char min | DONE |
| **Explore** | Masonry grid, creators/posts toggle, nearby creators, pagination | DONE |
| **Wallet** | SOL + SPL token balances via Helius DAS, portfolio chart, snapshots | DONE |
| **Profiles** | Creator profiles (public), user profiles (edit), public user view | DONE |
| **UI** | 20 screens, 11 primitives, 21 feature components, skeleton loading, swipe navigation, MomentoLogo | DONE |
| **API** | 26 endpoints, 8 DB models, Redis caching (location-quantized), 7 rate limiters | DONE |
| **Market screen** | UI scaffold with dummy data, "Coming Soon" on actions | SCAFFOLD |
| **Swap modal** | UI exists, blocked behind Coming Soon | SCAFFOLD |
| **Fiat onramp** | Privy dependency installed, disabled (Metro resolution issue) | PARTIAL |

**Known remaining:** ~14 type contract mismatches (T1-T14), ~10 UI polish items (see `docs/PHASE1_STATUS.md`).

---

### Phase 2 — Beta Launch: Fiat Onramp + Token Infrastructure (NOW)
**Audience:** 10-15 beta creators | **Goal:** Users can fund wallets, creators can launch tokens

#### Fiat Onramp & Wallet Funding
- Fix Privy onramp Metro resolution (`@privy-io/expo/ui` transitive deps)
- Integrate **Privy fiat-to-crypto onramp** (credit card / Apple Pay → USDC on Solana)
- Replace dummy token data with **real-time prices** (Jupiter Price API / Birdeye)
- Transaction history from **Helius Enhanced Transactions API**
- New routes: `POST /wallet/swap`, `GET /wallet/transactions`

#### Follow System Enhancements
- Enhanced follow feed (dedicated "following" tab or filter)
- Follow suggestions based on location, engagement, and mutual connections
- Creator discovery improvements

#### Token Swaps
- Connect existing swap modal UI to **Jupiter Aggregator v6** API
- Quote → approve → execute flow with slippage protection
- Real-time price impact display

#### Smart Contracts & Token Creation
- Creator token minting on Solana via **SPL Token 2022** with metadata extensions (**Metaplex**)
- **Bonding curve** for initial price discovery (reference: **pump.fun** fair-launch model)
- Creator launch page: set supply, initial price curve, raise cap, launch duration
- New DB models: `CreatorToken`, `TokenLaunch`, `TokenTransaction`
- New routes: `/tokens/launch`, `/tokens/{id}/buy`, `/tokens/{id}/sell`, `/tokens/{id}/holders`

#### Liquidity Pools
- **Dynamic liquidity pools** via **Meteora DLMM** or **Raydium concentrated liquidity (CLMM)**
- Pool creation tied to creator token launch flow
- AMM pricing for creator tokens

**Solana references:** Jupiter v6, Metaplex Token Metadata, Meteora DLMM, Raydium CLMM, pump.fun bonding curves
**Depends on:** Phase 1 stable + alpha feedback incorporated

---

### Phase 3 — Public Launch: App Stores + First Creator Launches (NEXT)
**Audience:** First 5-15 influential creator token launches | **Goal:** App Store presence, real trading volume

#### App Store Distribution
- **iOS App Store:** TestFlight → App Store Review → production release
- **Google Play Store:** Internal testing → closed beta → staged rollout
- App Store Optimization (screenshots, description, keywords)
- EAS production build configuration

#### Endpoint Hardening & Scaling
- Security audit (OWASP, penetration testing)
- Load testing (k6 / Artillery against all 26+ endpoints)
- Rate limit tuning based on real usage patterns
- Database read replicas (Supabase Pro)
- CDN for static assets, edge caching for API responses
- Horizontal API scaling (Vercel serverless auto-scales)
- Tighten CORS from `*` to specific origins

#### First Creator Token Launches
- Curated launch program for most influential beta creators
- Buy/sell creator tokens through the app (Jupiter swap routes or direct pool interaction)
- Real portfolio tracking with live price data
- Trading volume analytics and creator dashboards

#### Token-Gated Content
- Creators can lock posts behind minimum token ownership
- Token-gate verification on post access (check wallet holdings)
- Exclusive content feeds for token holders

**Depends on:** Phase 2 (swaps working, tokens launchable, wallets funded)

---

### Phase 4 — AI Platform: Intelligence Layer (FUTURE)
**Goal:** AI-powered tools for creators and platform intelligence

#### AI-Powered Search Algorithm
- Replace current ILIKE text search with **semantic vector search**
- Embedding store via **pgvector** (PostgreSQL extension) or **Pinecone**
- Content embeddings for posts, creator bios, and media captions
- Personalized search results based on user behavior

#### Cross-Posting Agents
- User posts on Momento → AI agent auto-distributes to **Instagram, TikTok, Twitter/X, YouTube**
- OAuth connections to each platform (per-creator setup)
- **Format adaptation:** vertical video for TikTok/Reels, thread for Twitter, etc.
- Rate-limited scheduling to avoid platform API limits
- Post performance tracking across all platforms

#### Creator Feedback Engine
- Train on historical post performance (engagement vs. time, location, content type, creator history)
- Predict **how a post will rank** on Momento before publishing
- Predict **cross-platform performance** (estimated likes, comments, reach on each platform)
- Surface **"best time to post"** and **"predicted engagement"** to creators
- A/B testing recommendations for captions, hashtags, media formats

#### Content Moderation
- Automated safety filtering before posts go live
- Image classification (NSFW, violence, copyright)
- Text toxicity detection
- Human-in-the-loop escalation for edge cases

#### Creator Insights Dashboard
- AI-generated growth advice based on audience behavior
- Trend detection across the platform
- Audience analytics (demographics, peak activity, content preferences)

**New services:** AI worker (separate deployment, Replicate/Modal for inference), ML training pipeline, embedding store
**Depends on:** Large dataset from Phases 1-3 for training

---

### Phase 5 — Yield & Utility: DeFi, NFTs, Prediction Markets (HORIZON)
**Goal:** Grow token value, provide utility, diversify platform economy

#### Yield-Bearing Strategies
- "Idle money grows" — users deposit USDC/SOL into **yield-bearing vaults**
- **Solana:** Kamino Finance (auto-compounding concentrated liquidity), Marinade Finance (liquid staking mSOL), Solend (lending), Jito (MEV staking)
- **Ethereum (future):** Aave v3 lending pools, Maker DSR (DAI Savings Rate), Lido (liquid staking), Yearn (yield aggregation)
- Display APY, projected earnings, auto-compound status
- One-tap deposit/withdraw
- New DB models: `YieldPosition`, `YieldSnapshot`
- New routes: `/yield/deposit`, `/yield/withdraw`, `/yield/positions`, `/yield/rates`

#### NFT Support
- Creator NFT collections (art, music, exclusive content)
- NFT minting via **Metaplex Candy Machine** or **Bubblegum** (compressed NFTs for low cost)
- Collectible drops with timed mints
- NFT gallery on creator profiles

#### Ticket Utility
- Event tickets as NFTs (concert access, meetups, online events)
- Token-gated event access verification
- Secondary ticket marketplace
- Exclusive experiences for top token holders

#### Prediction Markets
- Binary outcome markets on creator milestones ("Will X reach 1M followers?", "Next Billboard #1?", "Artist of the Year?")
- AMM-based pricing for market positions (reference: **Polymarket** UX, **Drift Protocol** on-chain)
- Liquidity pools per market with **fee sharing:**
  - Platform fee (protocol revenue)
  - Creator fee (creator earns from their own market activity)
  - Optional nonprofit split (creators can designate a % to charity)
- Market creation by admins or verified creators
- Resolution oracle: admin-resolved initially → **Switchboard** / **Pyth** for automated resolution

#### Fee Sharing Model
- Platform takes a base fee on all token trades, prediction markets, and yield
- Creators earn a share of trading fees on their own tokens
- Optional nonprofit donation routing (creator-configurable per-token)
- Transparent fee breakdown visible to all users

**Solana references:** Kamino, Marinade, Solend, Jito, Metaplex Candy Machine, Bubblegum, Drift Protocol, Hedgehog Markets, Switchboard
**Ethereum references:** Aave v3, Lido, Yearn, Maker DSR, Polymarket, Augur, Gnosis
**Depends on:** Phase 3 (App Store live, token trading active, user base established)

---

## 9. AI Integration Points

| Area | Status | Phase | Code Location | Description |
|------|--------|-------|---------------|-------------|
| Feed ranking algorithm | BUILT | 1 | `apps/api/app/api/feed/route.ts` → `rankPosts()` | Weighted scoring (recency, engagement, proximity, following) |
| Algorithm transparency | BUILT | 1 | `apps/mobile/src/components/features/FeedAlgorithmModal.tsx` | Shows users how feed is ranked |
| Semantic search | PLANNED | 4 | Will enhance `apps/api/app/api/search/route.ts` | Vector embeddings replacing ILIKE text search |
| Cross-posting agents | PLANNED | 4 | — | Post on Momento → AI distributes to IG, TikTok, X, YouTube |
| Creator feedback engine | PLANNED | 4 | — | Predict post ranking + cross-platform performance |
| Content moderation | PLANNED | 4 | — | Automated safety filtering (image + text classification) |
| Creator insights | PLANNED | 4 | — | AI-generated growth advice, audience analytics, trends |
| Prediction market resolution | PLANNED | 5 | — | AI-assisted outcome verification for market settlement |

---

## 10. Key File Index

### API — Core Infrastructure
| File | Purpose |
|------|---------|
| `apps/api/lib/auth.ts` | Privy token verification, user upsert, role guards |
| `apps/api/lib/redis.ts` | Cache keys, TTLs, getOrSetCache, invalidateCache |
| `apps/api/lib/prisma.ts` | Prisma client singleton |
| `apps/api/lib/helius.ts` | Solana RPC (balance, SPL tokens via DAS) |
| `apps/api/lib/storage.ts` | Supabase presigned uploads |
| `apps/api/lib/notifications.ts` | Expo push notifications (7 event types) |
| `apps/api/lib/ratelimit.ts` | Upstash rate limiter factory (7 limiters) |
| `apps/api/lib/validation.ts` | Zod schemas (post, comment, profile, location) |
| `apps/api/lib/veriff.ts` | KYC session creation, webhook HMAC verification |

### API — Key Routes
| File | Purpose |
|------|---------|
| `apps/api/app/api/feed/route.ts` | Feed with spatial query + ranking algorithm |
| `apps/api/app/api/posts/route.ts` | Post creation (POST) |
| `apps/api/app/api/posts/[id]/route.ts` | Post detail / delete |
| `apps/api/app/api/posts/[id]/like/route.ts` | Like / unlike toggle |
| `apps/api/app/api/posts/[id]/comments/route.ts` | Comments CRUD |
| `apps/api/app/api/creators/[id]/route.ts` | Creator profile |
| `apps/api/app/api/creators/[id]/posts/route.ts` | Creator's posts |
| `apps/api/app/api/creators/[id]/follow/route.ts` | Follow / unfollow |
| `apps/api/app/api/creators/apply/route.ts` | Creator application + KYC |
| `apps/api/app/api/creators/nearby/route.ts` | Nearby creators spatial query |
| `apps/api/app/api/wallet/balance/route.ts` | Wallet balance via Helius |
| `apps/api/app/api/wallet/snapshots/route.ts` | Portfolio snapshots for charts |
| `apps/api/app/api/search/route.ts` | Search creators + posts |
| `apps/api/app/api/kyc/webhook/route.ts` | Veriff webhook handler |
| `apps/api/app/api/uploads/presign/route.ts` | Supabase presigned upload URL |

### Database
| File | Purpose |
|------|---------|
| `apps/api/prisma/schema.prisma` | 8 models: User, Post, Like, Comment, Follow, KycRecord, SavedPost, PortfolioSnapshot |
| `apps/api/scripts/apply-postgis.ts` | PostGIS extension + geography trigger setup |

### Mobile — Core
| File | Purpose |
|------|---------|
| `apps/mobile/app/_layout.tsx` | Root provider tree + Stack navigator |
| `apps/mobile/app/(tabs)/_layout.tsx` | Tab navigator (Home, Explore, Profile) |
| `apps/mobile/src/services/api.ts` | ApiService singleton (HTTP client, token injection, upload) |
| `apps/mobile/src/services/notificationStorage.ts` | Local notification persistence (AsyncStorage) |
| `apps/mobile/src/providers/AuthBridge.tsx` | Wires Privy token into ApiService |
| `apps/mobile/src/providers/LocationProvider.tsx` | Device location + server sync |
| `apps/mobile/src/providers/QueryProvider.tsx` | React Query + AsyncStorage persistence |
| `apps/mobile/src/providers/PrivyGuard.tsx` | Conditional Privy (dev build vs Expo Go) |
| `apps/mobile/src/providers/NotificationProvider.tsx` | Push token registration + badge management |
| `apps/mobile/src/hooks/useAuth.ts` | Auth hook with Privy + guest fallback |
| `apps/mobile/src/hooks/useFeed.ts` | Infinite feed with auto-expanding radius |
| `apps/mobile/src/hooks/useSwipeNavigation.ts` | Swipe gesture between tabs |
| `apps/mobile/src/config/env.ts` | Environment variables (API_URL, PRIVY_APP_ID, etc.) |
| `apps/mobile/src/styles/theme.ts` | Colors, spacing, radii, shadows |

### Shared
| File | Purpose |
|------|---------|
| `packages/shared/src/types.ts` | All TypeScript interfaces (User, Post, Wallet, API responses) |
| `packages/shared/src/constants.ts` | Social platform config, dummy token data |

---

## 11. Environment & Secrets

### API (`apps/api/.env.local`)
| Variable | Service | Required |
|----------|---------|----------|
| `DATABASE_URL` | Supabase PostgreSQL (pooled/transaction) | Yes |
| `DIRECT_URL` | Supabase PostgreSQL (direct, for migrations) | Yes |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy | Yes |
| `PRIVY_APP_SECRET` | Privy | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Yes |
| `HELIUS_API_KEY` | Helius (Solana RPC) | Yes |
| `SOLANA_NETWORK` | Config (devnet / mainnet-beta) | No (default: devnet) |
| `VERIFF_API_KEY` | Veriff KYC | Yes (for KYC flow) |
| `VERIFF_SHARED_SECRET` | Veriff KYC webhooks | Yes (for KYC flow) |
| `NEXT_PUBLIC_API_URL` | Self-reference (webhook URLs) | Yes |
| `SKIP_KYC` | Dev bypass | No (default: false) |

### Mobile (`apps/mobile/.env`)
| Variable | Service | Required |
|----------|---------|----------|
| `EXPO_PUBLIC_API_URL` | API base URL | Yes |
| `EXPO_PUBLIC_PRIVY_APP_ID` | Privy (must match API) | Yes |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | Solana RPC endpoint | No |
| `EXPO_PUBLIC_SOLANA_NETWORK` | devnet / mainnet-beta | No (default: devnet) |

### Cost Estimate (Monthly)
| Service | Cost |
|---------|------|
| Supabase (Pro) | $25 |
| Upstash Redis | ~$10 |
| Vercel (Pro) | $20 |
| Helius | $0-49 |
| Privy | Free tier |
| EAS | Free tier |
| **Total** | **$55-105** + ~$2/KYC verification |

---

## 12. Sub-Agent Protocol

### Before Starting Any Task
1. Read this file completely
2. Identify which bounded context your task falls into: **API**, **Mobile**, **Shared**, **Landing**, **Infrastructure**
3. Check the **Key File Index** (Section 10) for relevant files
4. Check **Current State** (Section 7) to understand what exists vs. what is placeholder
5. Check the **Roadmap** (Section 8) to understand where your work fits

### Conventions

**API response envelope:** Always `{ success: boolean, data?: T, error?: string }`

**Hook pattern:** `use{Resource}` → React Query `useQuery` / `useMutation` / `useInfiniteQuery`

**Cache invalidation:** Must happen in the same API route that mutates data

**Push notifications:** Fire-and-forget (never block the response)

**Validation:** Zod schemas in `apps/api/lib/validation.ts`

**File organization:**
- New shared types → `packages/shared/src/types.ts`
- New constants → `packages/shared/src/constants.ts`
- Feature components → `apps/mobile/src/components/features/`
- Primitive components → `apps/mobile/src/components/primitives/`
- New hooks → `apps/mobile/src/hooks/`
- New API routes → `apps/api/app/api/{resource}/route.ts`

### Naming Rules
| Context | Convention | Example |
|---------|-----------|---------|
| Database tables | snake_case (via Prisma @@map) | `portfolio_snapshot` |
| API paths | kebab-case | `/api/wallet/balance` |
| TypeScript types/interfaces | PascalCase | `PostWithCreator` |
| Functions/variables | camelCase | `rankPosts()` |
| React components | PascalCase files | `FeedAlgorithmModal.tsx` |
| Hooks | camelCase with `use` prefix | `useFeed.ts` |

### New Feature Checklist
1. Add types to `packages/shared/src/types.ts`
2. Add/modify Prisma schema if DB changes needed → run `npx prisma migrate dev`
3. Create API route with: auth guard, Zod validation, rate limiting, caching, error handling
4. Create React Query hook in `apps/mobile/src/hooks/`
5. Create UI component(s) in `apps/mobile/src/components/features/`
6. Wire into navigation in `apps/mobile/app/`
7. Update this file (AGENT_MEMORY.md) with new entries

### Modification Checklist
1. Check `apps/api/lib/redis.ts` for cache keys that need updating
2. Grep for the API path in `apps/mobile/src/hooks/` to find consuming hooks
3. Update `packages/shared/src/types.ts` if response shape changes
4. Run `pnpm build` from root to verify no type errors across packages
