# 03 — Database Discovery Audit

**Scope:** Full inventory of the Prisma/Postgres+PostGIS schema, migration history, multi-chain coupling that must be removed for the Solana-only strategy, and a gap analysis with concrete Prisma model sketches for token launches, threshold fundraise/LP, fee tiers + fee-claim accounting, vesting (Streamflow), and trade history.

**Primary sources:**
- Schema: `apps/api/prisma/schema.prisma` (276 lines, the entire datamodel)
- Migrations: `apps/api/prisma/migrations/` (4 migrations; no `migration_lock.toml` present)
- Supporting code: `apps/api/lib/jupiter.ts`, `apps/api/lib/base.ts`, `apps/api/lib/base-swap.ts`, `apps/api/lib/auth.ts`, `apps/api/app/api/wallet/swap/route.ts`, `packages/shared/src/constants.ts`

---

## 1. Datasource & Generator

`apps/api/prisma/schema.prisma:1-9`
- Generator: `prisma-client-js`.
- Datasource: `postgresql`, `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")` (pooled + direct connection — typical Supabase/Neon setup).
- PostGIS is enabled **out-of-band** via raw SQL migration (see §3). The geography columns and spatial indexes are **NOT represented in `schema.prisma`** — they are invisible to Prisma and managed only by the `00_postgis_setup` migration + triggers. This is a hidden-state risk for any future `prisma migrate`/`db push` (Prisma may try to drop unknown columns; in practice `db push --accept-data-loss` would nuke the geography columns and triggers).

---

## 2. Full Model Inventory

### 2.1 Enums

| Enum | Values | Location |
|---|---|---|
| `UserRole` | `USER`, `CREATOR` | `schema.prisma:11-14` |
| `KycStatus` | `NONE`, `PENDING`, `VERIFIED`, `REJECTED` | `schema.prisma:16-21` |
| `PostType` | `TEXT`, `IMAGE`, `VIDEO` | `schema.prisma:23-27` |
| `TokenStatus` | `PENDING`, `DEPLOYING`, `ACTIVE`, `FAILED`, `GRADUATED` | `schema.prisma:184-190` |
| `PoolType` | `BONDING_CURVE`, `RAYDIUM`, `AERODROME` | `schema.prisma:192-196` |

`PoolType.AERODROME` is a **Base/EVM-only** DEX (Aerodrome on Base). It must be removed in the Solana-only world. `RAYDIUM` is Solana; we will likely also add `METEORA` / `PUMP_AMM` / `ORCA` depending on the launch venue.

### 2.2 `User` — `schema.prisma:29-68` → table `users`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(uuid())` | PK |
| `privyUserId` | `String @unique` | Privy identity |
| `walletAddress` | `String @unique` | **Solana** wallet (note: can hold a `pending-` placeholder, see `auth.ts:118`) |
| `baseWalletAddress` | `String? @unique` | **EVM/Base wallet — REMOVE** |
| `primaryChain` | `String @default("solana")` | **multi-chain selector — REMOVE/freeze to solana** |
| `email` | `String?` | |
| `username` | `String? @unique` | |
| `displayName`, `bio`, `avatarUrl`, `bannerUrl` | `String?` | profile |
| `role` | `UserRole @default(USER)` | |
| `kycStatus` | `KycStatus @default(NONE)` | denormalized from `KycRecord` |
| `isAdminApproved` | `Boolean @default(false)` | creator approval gate |
| `isAdmin` | `Boolean @default(false)` | |
| `tokenSymbol` | `String?` | creator's intended ticker (free-floating, not FK'd to CreatorToken) |
| `socialLinks` | `Json?` | |
| `locationLat`, `locationLng` | `Float?` | synced to PostGIS `location` via trigger |
| `pushToken` | `String?` | Expo push |
| `followerCount`, `followingCount`, `postCount` | `Int @default(0)` | denormalized counters |
| `createdAt`, `updatedAt` | `DateTime` | |

Relations: `posts`, `likes`, `comments`, `followers`/`following` (self-relation via Follow), `kycRecords`, `savedPosts`, `creatorTokens`.
Indexes: `@@index([role])`, `@@index([locationLat, locationLng])`. **Hidden:** GiST index `idx_users_location_geo` on the geography `location` column.

### 2.3 `Post` — `schema.prisma:70-95` → `posts`
Fields: `id`, `creatorId` (FK→User, cascade), `postType` (`PostType`), `content?`, `caption?`, `mediaUrl?`, `mediaUrls Json?`, `latitude Float` (required), `longitude Float` (required), `likeCount`, `commentCount`, timestamps.
Indexes: `[creatorId]`, `[createdAt]`, `[creatorId, createdAt]`, `[latitude, longitude]`. **Hidden:** GiST `idx_posts_location_geo` on geography `location`.

### 2.4 `Like` — `schema.prisma:97-109` → `likes`
`userId`+`postId` (both cascade FK), `@@unique([userId, postId])`, `@@index([postId])`.

### 2.5 `Comment` — `schema.prisma:111-123` → `comments`
`userId`, `postId`, `content`, `createdAt`; `@@index([postId, createdAt])`.

### 2.6 `Follow` — `schema.prisma:125-137` → `follows`
`followerId`, `followingId` (self-relation on User, both cascade), `@@unique([followerId, followingId])`, `@@index([followingId])`.

### 2.7 `KycRecord` — `schema.prisma:139-153` → `kyc_records`
`userId` (cascade), `veriffSessionId @unique`, `status KycStatus @default(PENDING)`, `veriffDecision Json?`, `veriffPerson Json?`, `createdAt`, `decidedAt?`; `@@index([userId])`. Veriff is chain-agnostic — **no migration impact**.

### 2.8 `SavedPost` — `schema.prisma:155-167` → `saved_posts`
`userId`, `postId` (cascade), `@@unique([userId, postId])`, `@@index([userId, createdAt])`.

### 2.9 `Notification` — `schema.prisma:169-182` → `notifications`
`userId`, `type String` (free text: new_like/new_comment/new_follow/new_post/creator_approval), `title`, `body`, `data Json?`, `read Boolean`, `createdAt`. **No FK to User** (loose coupling). Indexes `[userId, createdAt]`, `[userId, read]`. New token/fundraise/fee events will need new `type` values here.

### 2.10 `CreatorToken` — `schema.prisma:198-226` → `creator_tokens` (the key model)

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | |
| `userId` | `String` | FK→User, cascade |
| `chain` | `String` | `"solana" \| "base"` — **multi-chain, freeze to solana** |
| `name`, `symbol` | `String` | display name + ticker |
| `description`, `imageUrl` | `String?` | metadata |
| `mintAddress` | `String? @unique` | SPL mint (Solana) OR ERC-20 contract (Base) — semantics collapse to SPL mint only |
| `decimals` | `Int @default(9)` | 9 (SPL) vs 18 (ERC-20) — default already Solana |
| `totalSupply` | `String @default("1000000000")` | string for precision (good) |
| `circulatingSupply` | `String @default("0")` | string |
| `poolAddress` | `String?` | AMM/bonding-curve address |
| `poolType` | `PoolType?` | includes EVM `AERODROME` |
| `bondingCurveParams` | `Json?` | untyped curve config `{slope, basePrice, reserveRatio,...}` |
| `status` | `TokenStatus @default(PENDING)` | lifecycle |
| `deployTxSignature` | `String?` | on-chain deploy tx |
| `deployedAt`, `graduatedAt` | `DateTime?` | lifecycle timestamps |
| `createdAt`, `updatedAt` | `DateTime` | |

Constraints/indexes: `@@unique([userId, chain])` (one token per user **per chain** — becomes effectively one-per-user once chain is dropped), `@@index([chain, status])`, `@@index([symbol])`, `mintAddress @unique`.

**Gaps in CreatorToken for the new strategy:** no fundraise/threshold config, no LP split config, no fee-tier reference, no vesting reference, no market/price snapshot, no relation to trades or fee claims. `bondingCurveParams` is an untyped JSON blob (no validation, not queryable). It carries the bonding-curve concept but no graduation-threshold / fundraise-target columns.

### 2.11 `PortfolioSnapshot` — `schema.prisma:228-241` → `portfolio_snapshots`
`userId`, `chain String @default("solana")`, `totalValueUsd`, `nativeBalance` (renamed from `solBalance`, see §3), `nativeValueUsd` (renamed from `solValueUsd`), `tokenValueUsd`, `createdAt`. Indexes `[userId, createdAt]`, `[userId, chain, createdAt]`. **No FK to User.** `chain` column to remove; `native*` naming was deliberately made chain-agnostic and can revert to SOL semantics.

### 2.12 `WalletTransaction` — `schema.prisma:243-261` → `wallet_transactions`
`userId`, `chain String`, `signature`, `type String` (swap/send/receive/fund), `label`, `inputToken?`, `outputToken?`, `inputAmount?`, `outputAmount?`, `recipientAddress?`, `status @default("confirmed")`, `createdAt`. `@@unique([userId, chain, signature])`, `@@index([userId, chain, createdAt])`. **No FK to User.** This is generic wallet activity, **not** trade/fee accounting. `chain` to remove (unique key collapses to `[userId, signature]`).

### 2.13 `PromotionLog` — `schema.prisma:263-275` → `promotion_logs`
Admin audit of creator promotions: `actorId`, `targetId`, `method`, `metadata Json?`, `createdAt`. Indexes `[targetId]`, `[actorId]`, `[createdAt]`. No FKs. Chain-agnostic.

---

## 3. Migration History (schema evolution)

1. **`00_postgis_setup/migration.sql`** — Enables `postgis`, adds `geography(Point,4326)` `location` columns to `users` and `posts`, GiST spatial indexes, two `plpgsql` trigger functions (`sync_user_location`, `sync_post_location`) + BEFORE INSERT/UPDATE triggers to keep geography in sync with lat/lng, and backfills. **These columns/indexes/triggers are not in `schema.prisma`** (hidden state).
2. **`20260404000000_add_base_wallet_support/migration.sql`** — Added `users.baseWalletAddress` (+ unique index), `users.primaryChain DEFAULT 'solana'`, `portfolio_snapshots.chain DEFAULT 'solana'` (+ composite index). **This is the multi-chain expansion that the Solana-only strategy reverses.**
3. **`20260411000000_rename_native_balance_add_tx_history/migration.sql`** — Renamed `portfolio_snapshots.solBalance→nativeBalance`, `solValueUsd→nativeValueUsd` (chain-agnostic rename); created `wallet_transactions` table with unique `[userId, chain, signature]` and `[userId, chain, createdAt]` index.
4. **`20260411100000_add_creator_token/migration.sql`** — Created `TokenStatus` + `PoolType` enums and `creator_tokens` table with indexes/FK as in §2.10.

**Evolution narrative:** The DB started Solana-first (location + social graph), then a deliberate multi-chain (Solana+Base) expansion landed across migrations 2-3 (wallet/portfolio/tx all gained `chain`), and migration 4 added the creator-token model that is already partly EVM-aware (`AERODROME`, ERC-20 mint semantics, `decimals` 9-vs-18, `chain` discriminator). There is **no migration** for fees, LP/fundraise, or vesting — those are greenfield.

---

## 4. Multi-Chain Surface to Remove / Rename (Solana-only)

Backend code today actively branches on chain (`apps/api/app/api/wallet/swap/route.ts:33` routes to KyberSwap for Base; `apps/api/lib/auth.ts:23,89-92` derives EVM wallet + `primaryChain`; `packages/shared/src/constants.ts:11-34` has a `base` config block; `apps/api/lib/base.ts`, `apps/api/lib/base-swap.ts` are entirely EVM).

DB-level items to remove/rename (each requires a migration + data backfill plan):

| Object | Location | Action |
|---|---|---|
| `users.baseWalletAddress` (+ unique idx) | `schema.prisma:33` | **Drop** |
| `users.primaryChain` | `schema.prisma:34` | **Drop** (always solana) |
| `PoolType.AERODROME` | `schema.prisma:196` | **Drop enum value** (requires recreate-enum migration; ensure no rows reference it) |
| `creator_tokens.chain` (+ `@@unique([userId,chain])`, `@@index([chain,status])`) | `schema.prisma:201,222-223` | **Drop column**; collapse unique to `[userId]` (one token per creator), index to `[status]` |
| `portfolio_snapshots.chain` (+ composite idx) | `schema.prisma:231,239` | **Drop column**; collapse index to `[userId, createdAt]` |
| `wallet_transactions.chain` (+ unique/idx) | `schema.prisma:246,258-259` | **Drop column**; collapse unique to `[userId, signature]` |
| `portfolio_snapshots.nativeBalance/nativeValueUsd` | `schema.prisma:233,235` | Optional rename back to `solBalance/solValueUsd` (cosmetic; or keep) |
| `creator_tokens.decimals @default(9)` | `schema.prisma:207` | Keep (already SPL default) |
| `creator_tokens.mintAddress` comment "ERC-20" | `schema.prisma:206` | Re-document as SPL-only |

**Migration-ordering caution:** dropping a Postgres enum value is not a simple `ALTER`; it requires creating a new enum type, swapping the column, and dropping the old type — and fails if any row still uses `AERODROME`. Do a data audit first. Likewise the `@@unique([userId, chain])` → `[userId]` change will fail if any creator somehow has >1 token row.

---

## 5. Gap Analysis & Proposed Data Model

The new strategy needs models for: **(A) token launch + fundraise/threshold config, (B) LP split config, (C) fee tiers + fee-claim accounting, (D) vesting (Streamflow), (E) trade history.** Today only a thin `CreatorToken` exists; there is platform-fee logic in code (`apps/api/lib/jupiter.ts:39-40` — flat `MOMENTO_PLATFORM_FEE_BPS` default **400 bps**, taken from swap output, no DB persistence, no 1%-vs-10% tiering) but **zero DB accounting** for fees, LP, fundraise, vesting, or trades.

### 5.1 Extend `CreatorToken` (Solana-only, fundraise-aware)

```prisma
model CreatorToken {
  id                 String      @id @default(uuid())
  userId             String      @unique          // one token per creator (chain dropped)
  name               String
  symbol             String
  description        String?
  imageUrl           String?
  mintAddress        String?     @unique           // SPL mint
  decimals           Int         @default(9)
  totalSupply        String      @default("1000000000")
  circulatingSupply  String      @default("0")
  poolAddress        String?
  poolType           PoolType?                      // BONDING_CURVE | RAYDIUM | METEORA | ...
  bondingCurveParams Json?
  status             TokenStatus @default(PENDING)
  deployTxSignature  String?
  deployedAt         DateTime?
  graduatedAt        DateTime?
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt

  creator   User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  fundraise TokenFundraise?
  feeConfig TokenFeeConfig?
  trades    Trade[]
  feeEvents FeeEvent[]
  vestings  VestingSchedule[]
  lpPosition LpPosition?

  @@index([status])
  @@index([symbol])
  @@map("creator_tokens")
}
```

### 5.2 Token launch + threshold fundraise — new `TokenFundraise`

Captures the configurable threshold-based raise and the LP/USDC + platform + creator-token splits.

```prisma
enum FundraiseStatus {
  DRAFT
  ACTIVE        // accepting contributions
  THRESHOLD_MET // reached softcap, ready to finalize
  FINALIZING    // creating LP / distributing
  COMPLETED     // LP live, tokens vesting
  FAILED        // missed threshold, refunding
  REFUNDED
}

model TokenFundraise {
  id                 String          @id @default(uuid())
  tokenId            String          @unique
  status             FundraiseStatus @default(DRAFT)

  // Threshold config (USDC, store as String for precision; base units in *Raw)
  softCapUsdc        String          // threshold to graduate/finalize
  hardCapUsdc        String?
  minContributionUsdc String?
  maxContributionUsdc String?
  raisedUsdc         String          @default("0")
  contributorCount   Int             @default(0)

  // Split config (basis points; must sum to 10000)
  lpUsdcBps          Int             // % of raise → LP as USDC
  platformBps        Int             // % of raise → platform treasury
  creatorTokenBps    Int             // % of supply → creator (vested)
  // optional: lpTokenBps, treasuryReserveBps as the model matures

  startsAt           DateTime?
  endsAt             DateTime?
  finalizedAt        DateTime?
  finalizeTxSignature String?

  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  token        CreatorToken          @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  contributions FundraiseContribution[]

  @@index([status])
  @@map("token_fundraises")
}

model FundraiseContribution {
  id            String   @id @default(uuid())
  fundraiseId   String
  userId        String
  walletAddress String   // SPL/SOL payer
  amountUsdc    String
  signature     String   @unique
  refunded      Boolean  @default(false)
  refundSignature String?
  createdAt     DateTime @default(now())

  fundraise TokenFundraise @relation(fields: [fundraiseId], references: [id], onDelete: Cascade)

  @@index([fundraiseId, createdAt])
  @@index([userId])
  @@map("fundraise_contributions")
}
```

### 5.3 LP position (post-graduation pool state) — new `LpPosition`

```prisma
model LpPosition {
  id            String   @id @default(uuid())
  tokenId       String   @unique
  poolAddress   String                       // Raydium/Meteora pool
  lpMint        String?                       // LP token mint
  baseReserve   String                        // creator-token reserve
  quoteReserve  String                        // USDC/SOL reserve
  lpTokenAmount String?                       // platform-held LP (if locked)
  lockedUntil   DateTime?                     // LP lock expiry
  createdTxSignature String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  token CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  @@map("lp_positions")
}
```

### 5.4 Fee tiers + fee-claim accounting — `TokenFeeConfig` + `FeeEvent`

Models the **1% in-app vs 10% elsewhere** tiering and persists every fee accrual + claim (today fees are only computed transiently in `jupiter.ts` and never recorded).

```prisma
enum FeeSource {
  IN_APP        // 1% — trade originated inside Momento
  EXTERNAL      // 10% — trade detected on-chain outside the app
}

enum FeeEventType {
  ACCRUED       // fee earned on a trade
  CLAIMED       // fee swept/distributed to a recipient
}

enum FeeRecipient {
  PLATFORM
  CREATOR
}

model TokenFeeConfig {
  id            String   @id @default(uuid())
  tokenId       String   @unique
  inAppFeeBps   Int      @default(100)   // 1%
  externalFeeBps Int     @default(1000)  // 10%
  // split of collected fee between platform vs creator (bps, sum 10000)
  platformShareBps Int   @default(5000)
  creatorShareBps  Int   @default(5000)
  feeWallet     String?                  // SPL ATA collecting fees
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  token CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  @@map("token_fee_configs")
}

model FeeEvent {
  id            String       @id @default(uuid())
  tokenId       String
  tradeId       String?                       // link to originating trade (ACCRUED)
  type          FeeEventType
  source        FeeSource
  recipient     FeeRecipient
  recipientWallet String?
  amount        String                        // fee amount (base units)
  amountMint    String                        // mint the fee is denominated in (USDC/SOL/token)
  amountUsd     Float?
  feeBps        Int
  signature     String?      @unique          // claim/sweep tx
  createdAt     DateTime     @default(now())

  token CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  trade Trade?       @relation(fields: [tradeId], references: [id], onDelete: SetNull)

  @@index([tokenId, createdAt])
  @@index([recipient, type])
  @@index([type, createdAt])
  @@map("fee_events")
}
```

### 5.5 Vesting schedules (Streamflow) — `VestingSchedule`

```prisma
enum VestingStatus {
  PENDING
  ACTIVE
  PAUSED
  COMPLETED
  CANCELED
}

model VestingSchedule {
  id              String        @id @default(uuid())
  tokenId         String
  beneficiaryUserId String?
  beneficiaryWallet String                      // SPL recipient
  streamflowId    String?       @unique          // Streamflow contract/stream PDA
  totalAmount     String                          // base units of creator token
  releasedAmount  String        @default("0")
  cliffSeconds    Int           @default(0)
  durationSeconds Int                             // total vesting period
  startAt         DateTime
  cliffAt         DateTime?
  endAt           DateTime?
  status          VestingStatus @default(PENDING)
  createTxSignature String?
  cancelTxSignature String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  token CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)

  @@index([tokenId])
  @@index([beneficiaryUserId])
  @@index([status])
  @@map("vesting_schedules")
}
```

### 5.6 Trade history — `Trade`

`wallet_transactions` is generic per-user wallet activity. Creator-token trading needs a dedicated, queryable record with price/fee linkage (drives charts, volume, creator earnings).

```prisma
enum TradeSide {
  BUY
  SELL
}

model Trade {
  id            String     @id @default(uuid())
  tokenId       String
  userId        String?                          // null if external trader not in DB
  traderWallet  String
  side          TradeSide
  source        FeeSource                        // IN_APP | EXTERNAL (drives fee tier)
  amountToken   String                           // base units of creator token
  amountQuote   String                           // USDC/SOL paid/received (base units)
  quoteMint     String
  priceUsd      Float?
  feeBps        Int
  feeAmount     String     @default("0")
  signature     String     @unique
  poolAddress   String?
  blockTime     DateTime
  createdAt     DateTime   @default(now())

  token     CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  feeEvents FeeEvent[]

  @@index([tokenId, blockTime])
  @@index([userId, blockTime])
  @@index([tokenId, side])
  @@map("trades")
}
```

(Optional) **`TokenPriceSnapshot`** — periodic OHLC/price+marketcap rollups for charts, analogous to `PortfolioSnapshot`, keyed `[tokenId, createdAt]`.

---

## 6. Cross-Cutting Notes, Risks & Unknowns

- **Hidden PostGIS state** (`00_postgis_setup`) is not in `schema.prisma`. Any future `prisma db push`/`migrate dev` can silently drop the `location` geography columns, GiST indexes, and triggers. Recommend adding an idempotent post-migrate raw-SQL step or documenting a "never use `db push`" rule.
- **Money as `String`** is the existing (correct) pattern for supply (`totalSupply`, `circulatingSupply`). New financial fields above follow it; we should standardize on base-unit integer strings + a separate `*Mint`/`*Decimals` to avoid float drift. `*Usd` Float fields are acceptable only for display/analytics, not for on-chain accounting.
- **Loose coupling:** `Notification`, `PortfolioSnapshot`, `WalletTransaction`, `PromotionLog` have **no FK to User** (only an indexed `userId`). New trade/fee models above add real FKs — confirm this is acceptable (it complicates user deletion; `apps/api/app/api/users/me/delete/route.ts` exists and must be updated to cascade or anonymize trades/fees/vesting).
- **Enum-drop migration risk:** removing `PoolType.AERODROME` requires the create-new-type/swap/drop dance and a pre-flight data audit; `creator_tokens.chain` removal + unique-key collapse (`[userId,chain]`→`[userId]`) fails if any creator has multiple token rows.
- **Existing fee logic is code-only and flat** (`jupiter.ts:39-40`, default 400 bps, no source-based 1%/10% tiering, no persistence). The proposed `TokenFeeConfig`/`FeeEvent`/`Trade.source` model is needed to realize the tiered scheme and to attribute creator vs platform earnings.
- **Unknowns to confirm with product/contracts team:** (1) launch venue (pure bonding curve → Raydium graduation? Meteora DLMM? Pump.fun program?) determines `PoolType` values and `bondingCurveParams` shape; (2) exact split dimensions (does platform also take a token allocation, not just USDC?); (3) how EXTERNAL (off-app) trades are detected and fees enforced on-chain (Helius webhooks vs Token-2022 transfer-fee extension) — this drives whether `FeeEvent.ACCRUED` is push-ingested or polled; (4) whether refunds on failed fundraise are on-chain escrow or off-chain bookkeeping.
- **Indexing for analytics:** trade/fee tables will be high-write; the proposed composite indexes (`[tokenId, blockTime]`, `[tokenId, createdAt]`) cover charting/leaderboards. Consider partitioning `trades`/`fee_events` by time if volume is high.
