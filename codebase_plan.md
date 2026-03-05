# Momento - Codebase Build Plan

## Project Overview
**Momento** is a location-based creator platform with Solana wallet integration.
- Creators post content geotagged to their location
- Users discover creators/posts nearby (PostGIS)
- Embedded Solana wallets via Privy
- KYC verification for creators via Veriff
- Token portfolio display (real balances, dummy prices for MVP)

## Architecture

```
momento/
├── apps/
│   ├── api/                 # Next.js 14 API (Vercel)
│   │   ├── app/api/         # 12 API route files
│   │   ├── lib/             # 7 utility modules
│   │   └── prisma/          # Schema + migrations + seed
│   └── mobile/              # Expo React Native
│       ├── app/             # 10 screens (Expo Router)
│       └── src/
│           ├── components/
│           │   ├── primitives/  # 5 primitives (Text, Button, Avatar, Spacer, Card)
│           │   └── features/    # 7 features (PostCard, TickerBanner, TokenList, etc.)
│           ├── hooks/           # 8 React Query hooks
│           ├── providers/       # 3 providers (Query, Location, Notification)
│           ├── services/        # API service class
│           ├── styles/          # Theme, Typography, Layouts
│           ├── config/          # Env, dummy data
│           └── utils/           # Formatters
└── packages/
    └── shared/              # Shared TypeScript types + constants
```

## Tech Stack
| Layer | Technology | Notes |
|-------|-----------|-------|
| Monorepo | Turbo + pnpm | Workspace with 3 packages |
| API | Next.js 14 (App Router) | Deployed to Vercel |
| Database | Supabase PostgreSQL + PostGIS | Location queries |
| Cache | Upstash Redis | Feed, creator, wallet caching |
| Auth | Privy | Google/Apple OAuth + embedded Solana wallets |
| KYC | Veriff | Creator identity verification |
| Blockchain | Helius | Solana RPC, token balances |
| Mobile | Expo (React Native) | Expo Router for navigation |
| State | React Query (TanStack) | Server state management |
| Animations | Reanimated | UI thread animations |
| Lists | FlashList (Shopify) | Recycler-based list rendering |
| Images | expo-image | Better caching than RN Image |
| Storage | Supabase Storage | Avatars, banners, posts |

## Build Phases

### Phase 1: Foundation (Sequential - Main Context)
- [x] Git init
- [x] Turbo monorepo scaffold
- [x] pnpm workspace config
- [x] Shared package (types + constants)

### Phase 2: Parallel Build (Agents)
**Agent A: API Backend**
- Prisma schema + PostGIS migration
- 7 lib modules (prisma, redis, auth, helius, veriff, storage, notifications)
- 12 API route files across 6 resource groups
- Seed script
- Vercel config

**Agent B: Mobile Foundation**
- Expo app setup
- Config files (env, dummy data)
- API service class
- 3 providers (Query, Location, Notification)
- Style system (theme, typography, layouts)
- 5 primitive components
- 8 React Query hooks
- Utility functions

**Agent C: Mobile UI**
- 7 feature components
- 10 screens (Login, Home, Explore, Profile, Creator, Post, Market, Edit, Create, Settings)
- Tab + Stack navigation layout
- Root layout with provider wiring

### Phase 3: Integration (Main Context)
- Verify all imports resolve
- Ensure shared package is properly linked
- Git commit at milestone
- Document any deviations from original spec

## Key Decisions
1. **Scaffold-first**: All external services use placeholder env vars
2. **Open to improvements**: Using latest compatible versions, better patterns where applicable
3. **Multi-platform**: Android emulator + iOS + physical Android device testing
4. **Git milestones**: Commits at logical completion points

## External Services (To be configured later)
- Supabase: Database + Storage
- Upstash: Redis cache
- Privy: Auth + Wallets
- Veriff: KYC
- Helius: Solana RPC
- Vercel: API hosting
- EAS: Mobile builds

## Status Log
| Date | Update |
|------|--------|
| 2026-03-05 | Initial plan created, starting build |
