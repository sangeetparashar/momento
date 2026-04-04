# MOMENTO — Technical Overview

**Creator Ecosystem | Blockchain Monetization | AI-Powered Distribution**

---

## Platform Overview

Momento is a location-based social platform where creators monetize through blockchain technology. Users discover creators nearby, follow their journey, and invest in their growth through creator tokens, prediction markets, and yield-bearing strategies. The platform uses AI to help creators distribute content across all social platforms and predict post performance before publishing.

Built as a **Turbo monorepo** with a shared type system across three applications — a mobile app, an API backend, and a marketing landing page — all deploying independently while sharing types and constants.

---

## Technology Stack

### Mobile Application
**Expo 54 · React Native 0.81 · Expo Router · React Query · FlashList**

Single codebase for iOS and Android with OTA updates that bypass App Store review delays. Offline-first architecture using React Query with AsyncStorage persistence — the app renders instantly from cache and syncs in the background. Optimistic UI updates give users zero-latency interactions on likes, follows, and comments.

### Backend API
**Next.js 14 (App Router) · Vercel Serverless · Prisma ORM**

26 REST API endpoints deployed as serverless functions that auto-scale to demand with zero configuration. Prisma provides type-safe database access with auto-generated migrations and a typed schema shared across the entire stack. Every endpoint includes authentication guards, Zod validation, rate limiting, and Redis caching.

### Database
**PostgreSQL + PostGIS on Supabase**

Spatial geography columns enable sub-100ms location queries. The feed uses PostGIS `ST_DWithin` for radius-based discovery with auto-expanding search (5km → 10km → 25km → 50km → 100km) to always surface relevant content. 8 data models covering users, posts, engagement, KYC, portfolio tracking, and saved content.

### Caching
**Upstash Redis (Serverless REST API)**

Location-quantized cache keys (~1km grid) dramatically improve hit rates for the location-based feed. Tiered TTLs: 60s for feed data, 30s for wallet balances, 300s for profiles. Pattern-based invalidation ensures data freshness after mutations. The feed caches a sort-agnostic post pool and applies user-specific ranking per-request.

### Authentication & Identity
**Privy (Google OAuth + Embedded Solana Wallets) · Veriff KYC**

Every user gets an embedded Solana wallet on signup — no seed phrases, no browser extensions, zero friction. Privy handles OAuth and wallet creation in a single flow. Creator verification uses Veriff for government ID checks with HMAC-signed webhooks and admin approval, making the platform regulatory-ready from day one.

### Blockchain
**Solana via Helius RPC + DAS API · Jupiter v6 · Meteora DLMM · Raydium CLMM**

Solana provides sub-second finality at less than $0.001 per transaction. Helius DAS API returns rich token metadata for wallet displays. Jupiter v6 aggregates liquidity across all Solana DEXs for best-price token swaps. Meteora and Raydium provide dynamic liquidity pools for creator token launches with concentrated liquidity.

### Storage & Notifications
**Supabase Storage · Expo Push Notifications**

Media uploads use presigned URLs for direct client-to-bucket transfers — no server bottleneck, no bandwidth cost on the API. Push notifications fire-and-forget across 7 event types (new post, comment, like, follow, creator approval, KYC status, wallet activity) in batches of 100 for throughput.

### AI (Planned)
**pgvector Embeddings · Cross-Platform Agents · Recommendation Engine**

Semantic vector search will replace text-based ILIKE queries. AI agents will auto-distribute creator posts to Instagram, TikTok, X, and YouTube with format adaptation per platform. A feedback engine will predict post performance across platforms using historical engagement data, surfacing "best time to post" and "predicted reach" to creators.

### DeFi (Planned)
**Kamino · Marinade (Solana) / Aave · Lido (Ethereum)**

Idle stablecoins will earn yield through auto-compounding vaults instead of sitting in wallets. One-tap deposit and withdraw. Users and creators grow their holdings passively while the platform shares fees transparently.

---

## Architecture Highlights

### Smart Feed Ranking
5 configurable sort modes with weighted scoring across recency, engagement, proximity, and following. An algorithm transparency modal shows users exactly how their feed is ranked — building trust through openness rather than black-box algorithms.

### Location-First Discovery
PostGIS geography columns power spatial queries with auto-expanding radius. Location is quantized to a ~1km grid for cache efficiency. Users organically discover nearby creators without algorithmic manipulation — proximity is a first-class signal.

### Blockchain-Native Wallets
Every user has a real Solana wallet from their first login. Wallet balances update in real-time via Helius DAS API. Portfolio snapshots track historical value for charts. The infrastructure is ready for token swaps, creator token launches, and DeFi yield on day one.

### AI-Ready Architecture
The feed ranking algorithm already implements configurable weight presets — the same pattern extends to ML-driven personalization. The database schema supports pgvector for semantic search. The modular hook system enables plug-in AI agents for cross-platform content distribution.

---

## Current Build Metrics

| Metric | Count |
|--------|-------|
| API Endpoints | 26 |
| Mobile Screens | 20 |
| Database Models | 8 |
| React Query Hooks | 18 |
| Rate Limiters | 7 |
| Service Modules | 9 |
| Feed Sort Modes | 5 |

---

## Protocol & Infrastructure References

| Layer | Protocols |
|-------|-----------|
| **Solana DeFi** | Jupiter v6, Meteora DLMM, Raydium CLMM, Kamino, Marinade, Helius, Birdeye |
| **Solana Tokens** | SPL Token 2022, Metaplex Token Metadata |
| **Ethereum DeFi** | Aave v3, Lido, Yearn, Maker DSR |
| **Prediction Markets** | Drift Protocol, Hedgehog Markets, Polymarket (UX reference) |
| **Infrastructure** | Vercel (serverless), Supabase (Postgres + Storage), Upstash Redis, Privy, Veriff, Expo EAS |

---

*See `docs/ROADMAP.excalidraw` for the visual phased roadmap (open in excalidraw.com).*
