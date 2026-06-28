# D — Token-Economy Prisma Data Model (Phase 2, Solana-only)

> **Status:** DESIGN ONLY. No code/schema changes are made by this doc — it specifies the models, enums, relations, indexes, and idempotency keys to add to `apps/api/prisma/schema.prisma`, plus the migration caveats for executing them safely.
> **Date:** 2026-06-24.
> **Grounded in:** `apps/api/prisma/schema.prisma` (existing `User`, `CreatorToken`, `WalletTransaction`, `PortfolioSnapshot`), migration `20260623120000_remove_base_support`, and research `03-database.md`, `05-token-fee-lp-onchain.md`, `10-meteora.md`, `15-lp-economics.md`.
> **Locked decisions honored:** Token-2022 + Transfer Fee (3–5% bps); in-app rebate to ~1% via OUR OWN rebate accounting (rebate paid in SOL/USDC, NOT the token); Meteora DBC → DAMM v2; Momento = partner/`feeClaimer`; USDC-quoted; configurable splits; Meteora protocol fee fixed 20%, remaining 80% split partner/creator; vesting via Streamflow + Jupiter Lock; `@solana/web3.js` v1.

---

## 0. Executive summary

The token economy needs **8 new models + 9 new enums** and an **extension of the dormant `CreatorToken`**. The design follows the existing repo conventions exactly:

- **Money as base-unit integer `String`** (matches `CreatorToken.totalSupply`/`circulatingSupply`). Every amount column is a base-unit string paired with an explicit `*Mint` and/or `*Decimals` so there is no float drift. `*Usd` columns are `Float` and are **display/analytics only**, never on-chain truth.
- **On-chain idempotency = `@unique` on the transaction signature.** Every model that records an on-chain action carries a unique `signature` so webhook/poller re-ingestion is a safe upsert.
- **Two FK/`onDelete` regimes** (see §2 — this is the single most important cross-cutting rule):
  1. **Config rows owned by a token cascade with the token** (`onDelete: Cascade` from `CreatorToken`). `CreatorToken` itself still cascades from `User`.
  2. **Financial/audit rows do NOT vanish when a user is deleted.** `Trade.userId`, `FundraiseContribution.userId`, `VestingSchedule.beneficiaryUserId` are **optional FKs with `onDelete: SetNull`** so the GDPR-style account-delete in `app/api/users/me/delete/route.ts` anonymizes the user reference but preserves the financial/accounting trail (which is keyed by token + wallet + signature, not by user). See §2 and §9.

---

## 1. Reconciliation with the existing (dormant) `CreatorToken`

`CreatorToken` exists today (`schema.prisma:196-224`) and is 100% inert — no launch code reads/writes it (per `05-token-fee-lp-onchain.md §4`). We **extend it in place** (no rename) and add relations. Field-level reconciliation:

| Existing field | Keep / change | Notes |
|---|---|---|
| `id` (uuid PK) | keep | |
| `userId` | keep, FK→User `onDelete: Cascade` | already exists |
| `chain` (`String`) | **keep as-is** | Migration `20260623120000` *deliberately KEPT* `chain`, `@@unique([userId, chain])`, and `@@index([chain, status])` in the DB as harmless no-ops (always `"solana"`). Do **not** drop them in this phase — that is a separate, guarded enum/column migration. New code writes `chain = "solana"`. |
| `name`, `symbol`, `description`, `imageUrl` | keep | |
| `mintAddress` (`String? @unique`) | keep, **re-document as Token-2022 SPL mint** | unique already gives mint-level idempotency |
| `decimals` (`Int @default(9)`) | **change default to apply Token-2022 reality** — keep `9` as schema default but note DBC limits base decimals to **6–9** (`10-meteora.md §4`). Launch code sets the real value. | |
| `totalSupply`, `circulatingSupply` (`String`) | keep | base-unit string pattern we standardize on |
| `poolAddress`, `poolType` (`PoolType?`) | keep | `PoolType` needs `METEORA_DBC` + `METEORA_DAMM_V2` values added (see §3) |
| `bondingCurveParams` (`Json?`) | keep | DBC curve config blob |
| `status` (`TokenStatus`) | keep — **`GRADUATED` already exists** in the enum (`schema.prisma:188`); no change needed | maps to DBC graduation |
| `deployTxSignature`, `deployedAt`, `graduatedAt` | keep | |
| `createdAt`, `updatedAt` | keep | |

**New fields to ADD to `CreatorToken`** (Token-2022 economy):

- `tokenProgram String @default("TOKEN_2022")` — discriminator so the classic-SPL ATA derivation in `scripts/create-fee-atas*` and `lib/jupiter.ts` can branch. (We are launching Token-2022; existing classic SPL fee logic must not assume `Tokenkeg…`.)
- `transferFeeBps Int?` — the on-chain Token-2022 Transfer-Fee extension rate (3–5% = 300–500 bps; locked decision). Nullable until mint is created.
- `transferFeeMaxBaseUnits String?` — Token-2022 `maximumFee` cap (base units), part of the transfer-fee extension config.
- `transferFeeAuthority String?` / `withdrawWithheldAuthority String?` — Token-2022 extension authorities (the wallet that can withdraw withheld fees; a Momento server wallet per the Privy server-wallet decision).
- `quoteMint String?` — USDC mint by default (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), the DBC/DAMM quote asset.
- `dbcConfigKey String?` — the Meteora DBC partner **config key** pubkey this launch was created under.
- `dbcPoolAddress String?` — the DBC virtual pool (distinct from the graduated `poolAddress`/DAMM pool).

**New relations on `CreatorToken`** (all back-references):
`feeConfig TokenFeeConfig?`, `fundraise TokenFundraise?`, `lpPosition LpPosition?`, `trades Trade[]`, `feeEvents FeeEvent[]`, `vestings VestingSchedule[]`, `contributions FundraiseContribution[]`.

> **One-token-per-creator:** the DB still has `@@unique([userId, chain])`. Once `chain` is dropped (future migration) this collapses to one-token-per-creator. The new models do **not** assume more than one token per creator, but they are keyed by `tokenId` (not `userId`), so a future multi-launch product needs no relational rework here.

---

## 2. Cross-cutting decision: FK `onDelete` regimes (READ THIS)

`app/api/users/me/delete/route.ts:27` deletes a user with `prisma.user.delete()` and relies **entirely on `onDelete: Cascade`** to clean relations. That is correct for social data (posts/likes/follows) but **wrong for financial audit data** — cascading would erase the fee/trade/vesting ledger.

**Rule:**

| Relationship | onDelete | Why |
|---|---|---|
| `CreatorToken.userId → User` | **Cascade** (unchanged) | A token belongs to its creator; deleting the creator deletes the token… |
| `TokenFeeConfig / TokenFundraise / LpPosition / Trade / FeeEvent / VestingSchedule / FundraiseContribution . tokenId → CreatorToken` | **Cascade** | …and deleting the token cascades all of its config + ledger. This is intentional: a deleted token's accounting goes with it. |
| `Trade.userId → User` | **SetNull** (FK is **optional**) | Trades may originate from EXTERNAL wallets not in our DB at all; and for in-app users, deleting the user must **anonymize**, not destroy, the trade. Trade truth = `traderWallet + signature`. |
| `FundraiseContribution.userId → User` | **SetNull** (optional FK) | Same: preserve the contribution/refund ledger after account deletion. |
| `VestingSchedule.beneficiaryUserId → User` | **SetNull** (optional FK) | Vesting beneficiary is identified on-chain by `beneficiaryWallet`; the User link is a convenience. |
| `FeeEvent.tradeId → Trade` | **SetNull** (optional FK) | A claim/sweep `FeeEvent` may outlive the trade row; never block. |

**Net effect:** deleting a creator removes their token + all token-scoped config/ledger (Cascade through `CreatorToken`). Deleting a *non-creator user* who merely traded leaves the `Trade`/`Contribution`/`Vesting` rows intact with `userId = NULL`. The existing delete route needs **no change** for this to be safe (SetNull happens automatically); document it so nobody "fixes" it back to Cascade.

---

## 3. Enums

```prisma
// --- Token program discriminator (Token-2022 economy) ---
enum TokenProgram {
  TOKEN_CLASSIC   // legacy classic SPL (Tokenkeg…) — pre-existing tokens / fallback
  TOKEN_2022      // Token-2022 (TokenzQd…) — all new creator-token launches
}

// PoolType ALREADY EXISTS as { BONDING_CURVE, RAYDIUM } (schema.prisma:191-194 in TS;
// the DB enum also still carries the dormant AERODROME value, kept by migration
// 20260623120000). ADD the Meteora venues. Adding enum VALUES is a safe ALTER.
enum PoolType {
  BONDING_CURVE
  RAYDIUM
  METEORA_DBC       // Dynamic Bonding Curve (launch primitive)
  METEORA_DAMM_V2   // graduation target AMM
}

enum FundraiseStatus {
  DRAFT
  ACTIVE          // accepting contributions / bonding
  THRESHOLD_MET   // migration_quote_threshold reached, ready to finalize
  FINALIZING      // graduating: DAMM pool create + LP lock in flight
  COMPLETED       // graduated; LP live + locked
  FAILED          // missed threshold
  REFUNDED
}

enum FeeSource {
  IN_APP     // trade originated inside Momento → eligible for rebate to ~1%
  EXTERNAL   // trade detected on-chain outside the app → full transfer fee
}

enum TradeSide {
  BUY
  SELL
}

// FeeEvent.kind: the lifecycle stage of a fee row.
enum FeeEventType {
  TRANSFER_FEE_WITHHELD  // Token-2022 transfer fee withheld on a transfer/swap
  PARTNER_TRADING_FEE    // DBC/DAMM partner (Momento) trading-fee accrual
  CREATOR_TRADING_FEE    // DBC/DAMM creator trading-fee accrual
  LOCKED_LP_FEE          // fee claimed from a permanently-locked LP position
  SURPLUS                // last-swap graduation surplus (partner/protocol)
  REBATE                 // OUR rebate paid out to an in-app trader (SOL/USDC)
  CLAIMED               // generic sweep/claim to a recipient wallet
}

enum FeeRecipient {
  PLATFORM   // Momento treasury / feeClaimer
  CREATOR
  PROTOCOL   // Meteora's fixed 20%
  TRADER     // rebate recipient
}

enum LpProvider {
  METEORA_DAMM_V2
  METEORA_DAMM_V1
  METEORA_DLMM
}

enum LpOwner {
  PARTNER   // Momento
  CREATOR
}

enum VestingProvider {
  STREAMFLOW
  JUP_LOCK   // Jupiter Lock (zero-fee LP / token locks)
}

enum VestingStatus {
  PENDING
  ACTIVE
  PAUSED
  COMPLETED
  CANCELED
}
```

---

## 4. `TokenFeeConfig` — fee tiers, splits, claimer, rebate target

One per token (`tokenId @unique`). Holds the **partner/creator split**, the **fee claimer** wallet, and the **rebate target bps** that the in-app rebate accounting drives toward (locked: in-app effective ~1%, rebate paid in SOL/USDC not the token).

```prisma
model TokenFeeConfig {
  id                 String   @id @default(uuid())
  tokenId            String   @unique

  // On-chain transfer-fee (Token-2022) — mirror of CreatorToken.transferFeeBps for fast joins
  transferFeeBps     Int                                   // 300–500 (3–5%)
  rebateTargetBps    Int      @default(100)                // in-app effective rate target (~1%)

  // DBC/DAMM split of the 80% "LP fee" (Meteora protocol keeps a fixed 20% off the top)
  creatorTradingFeeBps  Int   @default(5000)               // creator's share of the 80%, in bps of that 80%
  partnerTradingFeeBps  Int   @default(5000)               // partner's share of the 80% (creator + partner = 10000)
  protocolFeeBps        Int   @default(2000)               // Meteora fixed 20% — recorded for accounting, not configurable

  // Wallets (Privy SERVER wallets for platform actions)
  feeClaimer            String?                            // Momento partner wallet (DBC feeClaimer)
  creatorFeeWallet      String?                            // creator payout wallet
  rebateWallet          String?                            // wallet that funds rebates (SOL/USDC)
  withdrawWithheldAuthority String?                        // Token-2022 withheld-fee withdraw authority
  rebateMint            String?                            // mint rebates are paid in (USDC/SOL) — NOT the creator token

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  token CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)

  @@map("token_fee_configs")
}
```

Notes: split fields are bps and constrained in app logic (`creatorTradingFeeBps + partnerTradingFeeBps = 10000`). `protocolFeeBps` is stored (not configurable) so the reconciliation dashboard can compute net without re-deriving Meteora's cut. Rebate is paid in `rebateMint` (SOL/USDC), per spike-a — never in the creator token.

---

## 5. `FeeEvent` — every accrual / withholding / claim / rebate

High-write ledger. `source` (IN_APP|EXTERNAL) + `type` classify each row; `signature @unique` is the idempotency key for on-chain rows; in-DB-only computed accruals use `internalRef @unique` instead.

```prisma
model FeeEvent {
  id              String       @id @default(uuid())
  tokenId         String
  tradeId         String?                                 // originating trade (for accruals/rebates)

  type            FeeEventType
  source          FeeSource                               // IN_APP | EXTERNAL
  recipient       FeeRecipient
  recipientWallet String?

  // Amounts: base-unit integer string + explicit mint; *Usd is display-only.
  grossBaseUnits  String       @default("0")              // pre-fee notional (where applicable)
  feeBaseUnits    String       @default("0")              // the fee/withheld amount
  netBaseUnits    String       @default("0")              // amount net of fee (where applicable)
  amountMint      String                                  // mint the amounts are denominated in
  amountUsd       Float?
  feeBps          Int?                                    // effective bps applied (for audit)

  // Idempotency: on-chain rows key on signature; off-chain accruals key on internalRef.
  signature       String?      @unique                    // claim/sweep/withhold tx
  internalRef     String?      @unique                    // deterministic id for off-chain-computed rows
  claimed         Boolean      @default(false)            // accrual swept yet?
  claimedAt       DateTime?
  claimSignature  String?

  blockTime       DateTime?
  createdAt       DateTime     @default(now())

  token CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  trade Trade?       @relation(fields: [tradeId], references: [id], onDelete: SetNull)

  @@index([tokenId, createdAt])          // per-token fee feed / dashboard
  @@index([tokenId, type])               // per-token by kind
  @@index([recipient, claimed])          // unclaimed-by-recipient sweep cron
  @@index([type, createdAt])             // global by kind over time
  @@index([tradeId])                     // fee rows for a trade
  @@map("fee_events")
}
```

> **Two idempotency keys, never both:** an on-chain row sets `signature` (and leaves `internalRef` null); an internally-computed accrual/rebate sets `internalRef` (e.g. `${tradeId}:${recipient}:${type}`) and leaves `signature` null until it is actually paid out, at which point `claimSignature` is filled. Each is independently `@unique`, so Postgres allows many NULLs but rejects duplicate real values.

---

## 6. `Trade` — per-trade history (buyer, side, in/out, fee, rebate, venue)

Distinct from the generic `WalletTransaction`. Drives charts, volume, creator earnings, and the in-app rebate computation.

```prisma
model Trade {
  id            String     @id @default(uuid())
  tokenId       String
  userId        String?                                   // null if external trader not in our DB
  traderWallet  String                                    // on-chain payer (always present)

  side          TradeSide
  source        FeeSource                                 // IN_APP | EXTERNAL — drives rebate eligibility
  venue         PoolType                                  // METEORA_DBC | METEORA_DAMM_V2 | …

  // Amounts (base-unit integer strings + explicit mints)
  amountInBaseUnits   String                              // what the trader put in
  amountInMint        String
  amountOutBaseUnits  String                              // what the trader got out
  amountOutMint       String
  priceUsd            Float?                              // display only

  // Fee + rebate accounting (the locked rebate model)
  transferFeeBaseUnits String @default("0")               // Token-2022 fee withheld on this trade
  feeBps               Int?                                // effective fee bps
  rebateBaseUnits      String @default("0")               // rebate owed/paid (in rebateMint, SOL/USDC)
  rebateMint           String?
  rebatePaid           Boolean @default(false)
  rebateSignature      String?

  poolAddress   String?
  signature     String     @unique                        // ON-CHAIN IDEMPOTENCY KEY
  blockTime     DateTime
  createdAt     DateTime   @default(now())

  token     CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  user      User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
  feeEvents FeeEvent[]

  @@index([tokenId, blockTime])     // per-token chart / volume (time-ordered)
  @@index([userId, blockTime])      // per-user trade history
  @@index([tokenId, side])          // buys vs sells aggregation
  @@index([traderWallet])           // by-wallet (external traders not in User)
  @@index([source, rebatePaid])     // unpaid in-app rebates sweep
  @@map("trades")
}
```

> **Adding `Trade.user` requires a back-relation on `User`:** add `trades Trade[]` to the `User` model. Likewise `User` gains `fundraiseContributions FundraiseContribution[]` and `vestingSchedules VestingSchedule[]`.

---

## 7. `TokenFundraise` + `FundraiseContribution` — threshold raise (USDC)

`TokenFundraise` is one-per-token (`tokenId @unique`) and mirrors DBC's `migration_quote_threshold`. Amounts are USDC base units (6 decimals).

```prisma
model TokenFundraise {
  id                  String          @id @default(uuid())
  tokenId             String          @unique
  status              FundraiseStatus @default(DRAFT)

  quoteMint           String                              // USDC by default
  thresholdBaseUnits  String                              // migration_quote_threshold (USDC base units)
  raisedBaseUnits     String          @default("0")
  contributorCount    Int             @default(0)
  minContributionBaseUnits String?
  maxContributionBaseUnits String?

  // Split / migration config snapshot (denormalized from the DBC config for audit)
  partnerLpBps        Int?                                // partner_lp_percentage (claimable)
  creatorLpBps        Int?                                // creator_lp_percentage (claimable)
  partnerLockedLpBps  Int?                                // partner_locked_lp_percentage
  creatorLockedLpBps  Int?                                // creator_locked_lp_percentage
  migrationFeeBps     Int?                                // graduated-pool fee tier (e.g. 100 = 1%)
  leftoverReceiver    String?                             // usually the creator

  startsAt            DateTime?
  endsAt              DateTime?
  finalizedAt         DateTime?
  finalizeSignature   String?         @unique             // graduation/migration tx (idempotent)

  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  token         CreatorToken            @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  contributions FundraiseContribution[]

  @@index([status])
  @@map("token_fundraises")
}

model FundraiseContribution {
  id              String   @id @default(uuid())
  fundraiseId     String
  tokenId         String                                  // denormalized for per-token queries w/o join
  userId          String?                                 // SetNull on user delete (preserve ledger)
  walletAddress   String                                  // on-chain payer

  amountBaseUnits String                                  // USDC contributed
  quoteMint       String
  signature       String   @unique                        // ON-CHAIN IDEMPOTENCY KEY

  refunded        Boolean  @default(false)
  refundSignature String?  @unique                        // refund idempotency
  blockTime       DateTime?
  createdAt       DateTime @default(now())

  fundraise TokenFundraise @relation(fields: [fundraiseId], references: [id], onDelete: Cascade)
  token     CreatorToken   @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  user      User?          @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([fundraiseId, createdAt])
  @@index([tokenId, createdAt])
  @@index([userId])
  @@index([walletAddress])
  @@map("fundraise_contributions")
}
```

---

## 8. `LpPosition` — DAMM v2 position NFT(s), locked flag, partner/creator owner

A DBC graduation produces **two locked DAMM v2 positions** (one partner-owned, one creator-owned), each a **position NFT** whose holder claims fees forever (`10-meteora.md §3`, `15-lp-economics.md §4`). So `LpPosition` is **one row per (token, owner)** — NOT `@unique` on `tokenId` alone. Use a composite unique.

```prisma
model LpPosition {
  id                String     @id @default(uuid())
  tokenId           String

  provider          LpProvider @default(METEORA_DAMM_V2)
  owner             LpOwner                               // PARTNER | CREATOR
  ownerWallet       String                                // wallet holding the position NFT

  poolAddress       String                                // DAMM pool
  positionAddress   String?                               // position account
  positionNftMint   String?    @unique                    // the NFT mint (1:1 with a position)
  lpMint            String?

  baseReserveBaseUnits  String?                           // snapshot at create
  quoteReserveBaseUnits String?
  liquidity             String?                           // liquidity delta / amount

  locked            Boolean    @default(true)             // permanently-locked LP (still fee-claimable)
  lockedUntil       DateTime?                             // null = permanent
  createSignature   String?    @unique                    // pool/position create tx (idempotent)
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  token CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)

  @@unique([tokenId, owner])     // one PARTNER + one CREATOR position per token
  @@index([tokenId])
  @@index([owner])
  @@index([poolAddress])
  @@map("lp_positions")
}
```

> **`CreatorToken.lpPosition` cannot be a `?`-to-one** now that there are two per token. Declare it as `lpPositions LpPosition[]` on `CreatorToken` (plural). Flagged in §11 naming.

---

## 9. `VestingSchedule` — Streamflow + Jupiter Lock

Provider-agnostic; `provider` selects STREAMFLOW vs JUP_LOCK. `streamId @unique` (the Streamflow/Jup-Lock contract PDA) is the on-chain idempotency key.

```prisma
model VestingSchedule {
  id                String          @id @default(uuid())
  tokenId           String
  beneficiaryUserId String?                               // SetNull on user delete
  beneficiaryWallet String                                // on-chain recipient (authoritative)

  provider          VestingProvider                       // STREAMFLOW | JUP_LOCK
  streamId          String?         @unique               // Streamflow / Jupiter Lock contract PDA (idempotent)

  totalBaseUnits    String                                // creator-token base units locked
  releasedBaseUnits String          @default("0")
  tokenMint         String                                // the vested mint

  cliffSeconds      Int             @default(0)
  durationSeconds   Int                                   // total linear vesting period
  startAt           DateTime
  cliffAt           DateTime?
  endAt             DateTime?

  status            VestingStatus   @default(PENDING)
  createSignature   String?         @unique
  cancelSignature   String?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  token CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  user  User?        @relation(fields: [beneficiaryUserId], references: [id], onDelete: SetNull)

  @@index([tokenId])
  @@index([beneficiaryUserId])
  @@index([beneficiaryWallet])
  @@index([status])
  @@map("vesting_schedules")
}
```

---

## 10. Required additions to existing models (paste-ready deltas)

### 10.1 `User` — add back-relations

```prisma
  // add to model User { … }
  trades                 Trade[]
  fundraiseContributions FundraiseContribution[]
  vestingSchedules       VestingSchedule[]
  // (creatorTokens already exists)
```

### 10.2 `CreatorToken` — add fields + relations

```prisma
  // add fields
  tokenProgram              TokenProgram @default(TOKEN_2022)
  transferFeeBps            Int?
  transferFeeMaxBaseUnits   String?
  transferFeeAuthority      String?
  withdrawWithheldAuthority String?
  quoteMint                 String?
  dbcConfigKey              String?
  dbcPoolAddress            String?

  // add relations
  feeConfig     TokenFeeConfig?
  fundraise     TokenFundraise?
  lpPositions   LpPosition[]            // plural — partner + creator positions
  trades        Trade[]
  feeEvents     FeeEvent[]
  vestings      VestingSchedule[]
  contributions FundraiseContribution[]
```

`CreatorToken` keeps `@@unique([userId, chain])`, `@@index([chain, status])`, `@@index([symbol])` unchanged (do not touch `chain` this phase). Optionally add `@@index([status])` to support `chain`-free status queries once the column is dropped.

---

## 11. Cross-cutting naming / decisions other designers MUST align on

1. **Money type = base-unit integer `String` + explicit `*Mint`/`*Decimals`.** Column suffix is **`BaseUnits`** for on-chain integer strings (e.g. `amountInBaseUnits`). `*Usd` is `Float` and **display-only**. Do not introduce `Decimal`, `BigInt`, or float for on-chain amounts.
2. **On-chain idempotency = `signature String @unique`** on every model recording a tx (`Trade.signature`, `FundraiseContribution.signature`, `FeeEvent.signature`, `*.finalizeSignature`, `*.createSignature`, `*.streamId`). Off-chain computed rows use a separate `internalRef String @unique`. Webhook/poller writers MUST upsert on these keys.
3. **Two `onDelete` regimes (§2):** token-scoped config CASCADEs from `CreatorToken`; user references on financial rows are **optional + `SetNull`**. The account-delete route needs no change. Do not "fix" these FKs to required/Cascade.
4. **`bps` everywhere for percentages** (`transferFeeBps`, `creatorTradingFeeBps`, `migrationFeeBps`, `rebateTargetBps`), 10000 = 100%. Split pairs must sum to 10000 in app logic.
5. **Rebate is paid in `rebateMint` (SOL/USDC), never the creator token** (spike-a). `Trade.rebate*` + `FeeEvent` `type=REBATE` are the rebate ledger; reconcile any rebate UI against these.
6. **`FeeSource` (IN_APP|EXTERNAL) is shared** by `Trade` and `FeeEvent` — keep it one enum; it is the hinge for the tiered fee/rebate logic.
7. **`PoolType` doubles as `Trade.venue`.** Add `METEORA_DBC`/`METEORA_DAMM_V2`; do **not** create a parallel venue enum.
8. **`CreatorToken.lpPositions` is plural** (partner + creator NFTs). Any code expecting a single LP row per token is wrong.
9. **`packages/shared/src/types.ts` + `constants.ts` must mirror these enums** (the repo keeps TS enums in lockstep with Prisma — see existing `TokenStatus`/`PoolType`). New enums (`FeeSource`, `TradeSide`, `FundraiseStatus`, `VestingProvider`, etc.) need TS counterparts; add a `MOMENTO_*` fee/claimer/quote-mint constant block (currently absent — `05 §5`).
10. **`chain` stays `"solana"`** on all new rows; it is a dormant no-op column not yet dropped.

---

## 12. PostGIS forward-migration caveat (MANDATORY)

- **NEVER run `prisma db push` / `prisma db push --accept-data-loss`** against any environment carrying real data. The `00_postgis_setup` migration adds `geography(Point,4326)` columns (`users.location`, `posts.location`), GiST indexes (`idx_users_location_geo`, `idx_posts_location_geo`), and the `sync_user_location` / `sync_post_location` triggers. **None of these exist in `schema.prisma`** — Prisma is blind to them. A `db push` will diff schema.prisma against the live DB and **silently drop the geography columns, GiST indexes, and triggers** (and `--accept-data-loss` will not even warn meaningfully).
- The repo uses **both** a `migrations/` folder and `db push` in dev/CI (see migration `20260623120000` header). For this phase: author a hand-written `migrations/2026…_add_token_economy/migration.sql` (all the new tables/enums/indexes/constraints are additive — no PostGIS interaction) and apply via **`prisma migrate deploy`** in prod/CI. Generate it with `prisma migrate dev --create-only` and **review the SQL** before applying; never let the dev `db push` path be the source of truth for prod.
- All new models are **purely additive** (new tables + new enum values). The only enum *value* additions are to `PoolType` — `ALTER TYPE … ADD VALUE` is safe and does not require the create-new-type dance (that dance is only for *removing* `AERODROME`, deferred per migration `20260623120000`).
- There is no `migration_lock.toml` in the repo today; if `prisma migrate` is adopted it will create one (provider `postgresql`) — expected, commit it.

---

## 13. Index coverage matrix (query path → index)

| Query path | Model | Index |
|---|---|---|
| Token chart / volume (time-ordered) | Trade | `@@index([tokenId, blockTime])` |
| Buys vs sells per token | Trade | `@@index([tokenId, side])` |
| A user's trade history | Trade | `@@index([userId, blockTime])` |
| External-wallet trades | Trade | `@@index([traderWallet])` |
| Unpaid in-app rebates (cron) | Trade | `@@index([source, rebatePaid])` |
| Per-token fee feed / dashboard | FeeEvent | `@@index([tokenId, createdAt])`, `@@index([tokenId, type])` |
| Unclaimed-fee sweep per recipient | FeeEvent | `@@index([recipient, claimed])` |
| Fee rows for a trade | FeeEvent | `@@index([tradeId])` |
| Contributions for a fundraise / token | FundraiseContribution | `@@index([fundraiseId, createdAt])`, `@@index([tokenId, createdAt])` |
| A user's / wallet's contributions | FundraiseContribution | `@@index([userId])`, `@@index([walletAddress])` |
| Active fundraises | TokenFundraise | `@@index([status])` |
| LP positions per token / owner / pool | LpPosition | `@@index([tokenId])`, `@@index([owner])`, `@@index([poolAddress])` |
| Vesting per token / beneficiary / status | VestingSchedule | `@@index([tokenId])`, `@@index([beneficiaryUserId])`, `@@index([beneficiaryWallet])`, `@@index([status])` |
| **By signature (any model)** | all | covered by the `@unique` on `signature` / `streamId` / `internalRef` (a unique constraint is a usable index) |

### Idempotency unique-key summary

| Model | Unique idempotency key(s) |
|---|---|
| CreatorToken | `mintAddress` (existing) |
| TokenFeeConfig | `tokenId` |
| TokenFundraise | `tokenId`, `finalizeSignature` |
| FundraiseContribution | `signature`, `refundSignature` |
| Trade | `signature` |
| FeeEvent | `signature`, `internalRef` |
| LpPosition | `[tokenId, owner]`, `positionNftMint`, `createSignature` |
| VestingSchedule | `streamId`, `createSignature` |

---

## 14. Open items (defer / confirm before migration)

- **Drop `chain` + collapse `@@unique([userId, chain])` → `[userId]`** — deferred (guarded migration; needs zero-row audit). Not in this phase.
- **`TokenPriceSnapshot` (OHLC rollups)** — optional, analogous to `PortfolioSnapshot`, keyed `[tokenId, createdAt]`. Not required by the task; add later if charts need server-side rollups beyond `Trade` aggregation.
- **Partitioning `trades` / `fee_events`** by time if volume warrants (Postgres declarative partitioning is outside Prisma's schema — same caveat class as PostGIS). Defer until volume data exists.
- **Exact DBC/DAMM protocol-fee constant** (`protocolFeeBps` default 2000) — confirm against deployed Meteora program version (`10-meteora.md §8`, `15 §7`).
