# Momento - Architecture Reference

## Monorepo Structure
```
momento/
├── package.json              # Root: turbo + pnpm workspaces
├── pnpm-workspace.yaml       # packages: ['apps/*', 'packages/*']
├── turbo.json                # Build/lint/dev task definitions
├── .gitignore
├── codebase_plan.md          # Living build plan with status log
├── ARCHITECTURE_ANALYSIS.md  # Deep pattern analysis
│
├── apps/
│   ├── api/                  # Next.js 14 App Router (Vercel)
│   │   ├── package.json      # @momento/api
│   │   ├── tsconfig.json     # @/* path alias to root
│   │   ├── next.config.js    # transpilePackages: ['@momento/shared']
│   │   ├── vercel.json       # CORS + deployment config
│   │   ├── .env.local.example # 11 env vars template
│   │   ├── prisma/
│   │   │   ├── schema.prisma             # 6 models: User, Post, Like, Comment, Follow, KycRecord
│   │   │   ├── migrations/00_postgis_setup/migration.sql  # PostGIS extension + triggers
│   │   │   └── seed.ts                   # 5 creators, 5 users, 20 posts, follows, comments
│   │   ├── lib/
│   │   │   ├── prisma.ts     # Singleton PrismaClient (global cache in dev)
│   │   │   ├── redis.ts      # Upstash Redis: getOrSetCache, invalidateCache, TTLs
│   │   │   ├── auth.ts       # Privy: verifyToken, getAuthUser, requireAuth, requireCreator, requireAdmin
│   │   │   ├── helius.ts     # Solana: wallet balance, token holdings via Helius API
│   │   │   ├── veriff.ts     # KYC: session creation, webhook verification
│   │   │   ├── storage.ts    # Supabase Storage: presigned upload URLs
│   │   │   └── notifications.ts # Expo push: batched notifications (100/batch)
│   │   └── app/
│   │       ├── layout.tsx    # Root layout (minimal)
│   │       ├── page.tsx      # Health check page
│   │       └── api/
│   │           ├── feed/route.ts                    # GET: PostGIS location feed
│   │           ├── creators/nearby/route.ts         # GET: nearby creators
│   │           ├── creators/apply/route.ts          # POST: creator application
│   │           ├── creators/[id]/route.ts           # GET: creator profile
│   │           ├── creators/[id]/posts/route.ts     # GET: creator's posts
│   │           ├── creators/[id]/follow/route.ts    # POST/DELETE: follow toggle
│   │           ├── posts/route.ts                   # POST: create post
│   │           ├── posts/[id]/route.ts              # GET: single post
│   │           ├── posts/[id]/like/route.ts         # POST/DELETE: like toggle
│   │           ├── posts/[id]/comments/route.ts     # GET/POST: comments
│   │           ├── comments/[id]/route.ts           # DELETE: remove comment
│   │           ├── users/me/route.ts                # GET/PATCH: current user profile
│   │           ├── users/me/location/route.ts       # PATCH: update user location
│   │           ├── users/me/push-token/route.ts     # POST: register push token
│   │           ├── wallet/balance/route.ts          # GET: Solana wallet balance
│   │           ├── uploads/presign/route.ts         # POST: get presigned upload URL
│   │           └── kyc/webhook/route.ts             # POST: Veriff webhook callback
│   │
│   └── mobile/               # Expo React Native (SDK 52)
│       ├── package.json      # @momento/mobile
│       ├── tsconfig.json     # @/* -> src/*, @momento/shared path
│       ├── app.json          # Expo config: dark theme, plugins, permissions
│       ├── eas.json          # EAS build profiles (dev/preview/production)
│       ├── babel.config.js   # react-native-reanimated/plugin
│       ├── metro.config.js   # Monorepo-aware config
│       ├── assets/
│       │   ├── notification-icon.png  # Placeholder
│       │   └── adaptive-icon.png      # Placeholder
│       ├── app/              # Expo Router screens
│       │   ├── _layout.tsx           # Root: provider tree + Stack navigator
│       │   ├── index.tsx             # Splash: auth check -> redirect
│       │   ├── login.tsx             # Login: Privy OAuth
│       │   ├── (tabs)/
│       │   │   ├── _layout.tsx       # Tab navigator: home/explore/profile
│       │   │   ├── home.tsx          # Feed: FlashList + TickerBanners
│       │   │   ├── explore.tsx       # Discovery: masonry grid
│       │   │   └── profile.tsx       # Portfolio: chart + token list
│       │   ├── creator/[id].tsx      # Creator profile: banner, stats, follow
│       │   ├── post/[id].tsx         # Post detail: image, comments, like
│       │   ├── market.tsx            # Market: token rankings, search
│       │   ├── edit-profile.tsx      # Modal: avatar, social links, KYC
│       │   └── create-post.tsx       # Modal: caption, media, location
│       └── src/
│           ├── components/
│           │   ├── index.ts          # Re-exports primitives + features
│           │   ├── primitives/       # 5 atomic components
│           │   │   ├── Text.tsx      # variant prop maps to TYPOGRAPHY keys
│           │   │   ├── Button.tsx    # primary/secondary/ghost, sm/md/lg
│           │   │   ├── Avatar.tsx    # expo-image with initials fallback
│           │   │   ├── Spacer.tsx    # horizontal/vertical spacing
│           │   │   ├── Card.tsx      # Surface container
│           │   │   └── index.ts
│           │   └── features/         # 7 composed components
│           │       ├── TickerBanner.tsx    # Reanimated infinite scroll ticker
│           │       ├── PostCard.tsx        # Full feed post card
│           │       ├── LikeButton.tsx      # Animated heart with haptics
│           │       ├── TokenList.tsx       # Portfolio token table
│           │       ├── PortfolioChart.tsx  # SVG chart with time ranges
│           │       ├── ComingSoonModal.tsx # Placeholder modal
│           │       ├── SwapModal.tsx       # Bottom sheet swap UI
│           │       └── index.ts
│           ├── hooks/                # 8 React Query hooks
│           │   ├── useFeed.ts            # Infinite query, auto-expanding radius
│           │   ├── useCreatorProfile.ts   # Profile + optimistic follow
│           │   ├── useLike.ts            # Optimistic like across feed + detail
│           │   ├── useWalletBalance.ts   # 30s polling
│           │   ├── useUserProfile.ts     # Profile + optimistic update
│           │   ├── useCreatePost.ts      # Post creation with location
│           │   ├── useKyc.ts             # KYC application
│           │   ├── useUpload.ts          # Image picker + presigned upload
│           │   └── index.ts
│           ├── providers/
│           │   ├── QueryProvider.tsx      # TanStack React Query client
│           │   ├── LocationProvider.tsx   # expo-location, 5-min refresh
│           │   ├── NotificationProvider.tsx # expo-notifications setup
│           │   ├── AuthBridge.tsx         # Wires Privy getAccessToken into apiService
│           │   └── index.ts
│           ├── services/
│           │   ├── api.ts                # ApiService class, singleton
│           │   └── index.ts
│           ├── styles/
│           │   ├── theme.ts              # COLORS (30+), SPACING, RADII, SHADOWS
│           │   ├── typography.ts         # TYPOGRAPHY: h1-h3, body, bodySmall, caption, label, mono, monoLarge
│           │   ├── layouts.ts            # LAYOUTS: row, center, screen, card helpers
│           │   └── index.ts
│           ├── config/
│           │   ├── env.ts                # ENV object from EXPO_PUBLIC_* vars
│           │   ├── dummyData.ts          # Ticker, market, wallet, creators, feed dummy data
│           │   └── index.ts
│           └── utils/
│               ├── formatters.ts         # formatNumber, formatCurrency, formatTimeAgo, formatPercentage, truncateAddress
│               └── index.ts
│
└── packages/
    └── shared/                # @momento/shared
        ├── package.json       # main + types both point to ./src/index.ts
        ├── tsconfig.json      # ES2020, ESNext modules
        └── src/
            ├── index.ts       # Re-exports types + constants
            ├── types.ts       # Enums: UserRole, KycStatus, PostType
            │                  # Interfaces: User, PublicCreator, Post, PostWithCreator,
            │                  #   Comment, TokenHolding, WalletBalance, SocialLinks,
            │                  #   FeedResponse, NearbyCreatorsResponse, FollowResponse, LikeResponse
            └── constants.ts   # SOCIAL_PLATFORMS, DUMMY_TRENDING_TOKENS, DUMMY_CREATORS_TO_WATCH
```

## Tech Stack Details

| Layer | Package | Version | Purpose |
|-------|---------|---------|---------|
| Monorepo | turbo | ^2 | Task runner |
| Monorepo | pnpm | 10.30.0 | Package manager |
| API Framework | next | 14.x | App Router API |
| ORM | prisma + @prisma/client | 5.x | PostgreSQL ORM |
| Auth | @privy-io/server-auth | 1.x | Token verification |
| Cache | @upstash/redis | latest | Redis caching |
| Storage | @supabase/supabase-js | 2.x | File uploads |
| Blockchain | helius-sdk | latest | Solana RPC |
| KYC | veriff (custom) | - | Identity verification |
| Notifications | expo-server-sdk | latest | Push notifications |
| Mobile | expo | ~52 | React Native framework |
| Navigation | expo-router | ~4 | File-based routing |
| State | @tanstack/react-query | ^5 | Server state |
| Lists | @shopify/flash-list | latest | Recycler lists |
| Images | expo-image | latest | Cached images |
| Animation | react-native-reanimated | ~3 | UI thread animations |
| Charts | react-native-svg | latest | SVG rendering |
| Haptics | expo-haptics | latest | Touch feedback |
| Location | expo-location | latest | GPS coordinates |
| Notifications | expo-notifications | latest | Push notifications |
| Icons | @expo/vector-icons | latest | Ionicons |

## Database Models (Prisma)
```
User (id, privyUserId, walletAddress, email?, username?, displayName?, bio?,
      avatarUrl?, bannerUrl?, role, kycStatus, isAdminApproved, isAdmin,
      tokenSymbol?, socialLinks?, locationLat?, locationLng?,
      followerCount, followingCount, postCount, createdAt, updatedAt)

Post (id, creatorId->User, postType, content?, caption?, mediaUrl?, mediaUrls?,
      latitude, longitude, likeCount, commentCount, createdAt, updatedAt)

Like (id, userId->User, postId->Post, createdAt) [unique: userId+postId]

Comment (id, postId->Post, userId->User, content, createdAt)

Follow (id, followerId->User, followingId->User, createdAt) [unique: followerId+followingId]

KycRecord (id, userId->User, veriffSessionId?, status, decisionTime?,
           reasonCode?, vendorData?, createdAt, updatedAt)
```

## Design Tokens
- Background: `#0D0D0D` (near black)
- Primary: `#00FF88` (neon green)
- Surface: `#1A1A1A`
- Text Primary: `#FFFFFF`
- Text Secondary: `#8A8A8A`
- Error: `#FF4444`
- Success: `#00FF88` (same as primary)

## Cache TTLs
- Feed: 60 seconds (keyed by rounded lat/lng grid ~1km)
- Creator profiles: 10 minutes
- Wallet balance: 30 seconds
- User profile: 5 minutes
