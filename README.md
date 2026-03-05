# Momento - Complete MVP Documentation

A location-based creator platform with Solana wallet integration.

---

## What You're Building

| Feature | Status | Tech |
|---------|--------|------|
| Location-based discovery | ✅ MVP | PostGIS |
| Verified creators (KYC) | ✅ MVP | Veriff |
| Embedded Solana wallets | ✅ MVP | Privy |
| Real token balances | ✅ MVP | Helius |
| Token trading UI | ⏳ Phase 2 | Placeholder |

---

## Documentation Files

| Order | File | Description |
|-------|------|-------------|
| 1 | `SETUP_GUIDE.md` | Service accounts & credentials |
| 2 | `SCREEN_MAP.md` | Visual reference of all screens |
| 3 | `CURSOR_INSTRUCTIONS.md` | Part 1: Monorepo & Database |
| 4 | `CURSOR_INSTRUCTIONS_PART2.md` | Part 2: API Routes |
| 5 | `CURSOR_INSTRUCTIONS_PART3.md` | Part 3: Mobile Foundation |
| 6 | `CURSOR_INSTRUCTIONS_PART4.md` | Part 4: Components & Screens |
| 7 | `CURSOR_INSTRUCTIONS_PART5.md` | Part 5: Testing & Deployment |

---

## Quick Start

```
1. Complete SETUP_GUIDE.md (collect all credentials)
2. Follow CURSOR_INSTRUCTIONS Parts 1-5 in order
3. Run seed script for test data
4. Deploy to Vercel + EAS
```

**Estimated build time: 4-6 hours**

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile App (Expo)                     │
│  React Native + Expo Router + Reanimated + React Query   │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    API (Next.js 14)                      │
│           Vercel + Prisma + Privy Auth                   │
└─────────────────────────┬───────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Supabase   │   │   Upstash   │   │   Helius    │
│  PostgreSQL │   │    Redis    │   │  Solana RPC │
│  + PostGIS  │   │   (Cache)   │   │ + Balances  │
└─────────────┘   └─────────────┘   └─────────────┘
```

---

## Project Structure

```
momento/
├── apps/
│   ├── api/                 # Next.js API (Vercel)
│   │   ├── app/api/         # API Routes
│   │   ├── lib/             # Utilities
│   │   └── prisma/          # Database
│   └── mobile/              # Expo React Native
│       ├── app/             # Screens (Expo Router)
│       └── src/
│           ├── components/  # UI Components
│           │   ├── primitives/  # Text, Button, Avatar...
│           │   └── features/    # PostCard, TokenList...
│           ├── hooks/       # React Query hooks
│           ├── styles/      # Theme, Typography, Layouts
│           └── config/      # Constants, dummy data
└── packages/
    └── shared/              # Shared TypeScript types
```

---

## Key Decisions (From Senior Architect Review)

| Decision | Rationale |
|----------|-----------|
| **Reanimated for animations** | UI thread, no Android stutter |
| **expo-image** | Better caching, memory, transitions |
| **FlashList** | Shopify's recycler for long lists |
| **No admin dashboard** | Use Supabase Dashboard instead |
| **SKIP_KYC in dev** | Faster iteration, saves $2/verify |
| **Hardcoded ticker data** | Simpler, no extra API calls |
| **Style primitives** | Reusable Text, Button, Avatar, Card |

---

## Cost Estimate

| Service | Tier | Monthly |
|---------|------|---------|
| Supabase | Pro | $25 |
| Upstash | Pay-as-you-go | ~$10 |
| Vercel | Pro | $20 |
| Helius | Free/Starter | $0-49 |
| Privy | Free | $0 |
| EAS | Free | $0 |
| **Total** | | **$55-105** |

Plus ~$2 per KYC verification (Veriff).

---

## Real vs Dummy Data

### Real (MVP)
- ✅ User authentication (Privy)
- ✅ Embedded Solana wallets (Privy)
- ✅ Token holdings list (Helius)
- ✅ SOL balance (Helius)
- ✅ Posts & profiles (Supabase)
- ✅ Location-based feed (PostGIS)
- ✅ KYC verification (Veriff)
- ✅ Push notifications (Expo)

### Dummy (Phase 2)
- ⏳ Token prices in USD
- ⏳ Price change percentages
- ⏳ Market cap values
- ⏳ Portfolio charts
- ⏳ Trending rankings
- ⏳ Buy/Sell execution

---

## Prompt Count

| Part | Phases | Prompts |
|------|--------|---------|
| 1 | Monorepo, Database, Core Libs | ~20 |
| 2 | API Routes | ~15 |
| 3 | Mobile Foundation, Styles, Hooks | ~25 |
| 4 | Components & Screens | ~20 |
| 5 | Seed Data, Deployment | ~8 |
| **Total** | | **~88** |

---

## After MVP: Phase 2 Roadmap

1. Price oracle integration (Jupiter/Birdeye)
2. Token swap execution
3. Creator token minting
4. Real-time price charts
5. Advanced analytics
6. Auth sync cron job
7. PostGIS edge case filtering
