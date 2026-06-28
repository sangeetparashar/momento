# CONTRACTS — Binding Phase 2 Implementation Contract

> **Status:** BINDING. Implementation agents (T-foundation, T-signer, T-fees) implement EXACTLY
> what is written here. Zero ambiguity by design. Read `SPEC.md` for rationale.
> Canonical names come from `D-schema.md`; signer interfaces from `D-signer.md`; fee/rebate/dedupe
> from `D-fees.md`. **Solana-only. `@solana/web3.js` v1.**
> **File ownership is partitioned so concurrent tasks NEVER share a file** (see §c).

---

## (a) Prisma data model — paste-ready

> All blocks below are additive to `apps/api/prisma/schema.prisma`. **T-foundation owns this file.**
> `@@map` snake_case table names match existing repo convention. `chain` is left untouched (dormant).

### a.1 New enums

```prisma
enum TokenProgram {
  TOKEN_CLASSIC   // legacy classic SPL (Tokenkeg…)
  TOKEN_2022      // Token-2022 (TokenzQd…) — all new launches
}

// PoolType ALREADY EXISTS { BONDING_CURVE, RAYDIUM } (DB also carries dormant AERODROME).
// ADD the two Meteora venues (adding enum VALUES is a safe ALTER TYPE … ADD VALUE).
enum PoolType {
  BONDING_CURVE
  RAYDIUM
  METEORA_DBC
  METEORA_DAMM_V2
}

enum FundraiseStatus {
  DRAFT
  ACTIVE
  THRESHOLD_MET
  FINALIZING
  COMPLETED
  FAILED
  REFUNDED
}

enum FeeSource {        // shared by Trade.source AND FeeEvent.source — do NOT duplicate
  IN_APP
  EXTERNAL
}

enum TradeSide {
  BUY
  SELL
}

enum FeeEventType {
  TRANSFER_FEE_WITHHELD
  PARTNER_TRADING_FEE
  CREATOR_TRADING_FEE
  LOCKED_LP_FEE
  SURPLUS
  REBATE
  CLAIMED
}

enum FeeRecipient {
  PLATFORM
  CREATOR
  PROTOCOL
  TRADER
}

enum LpProvider {
  METEORA_DAMM_V2
  METEORA_DAMM_V1
  METEORA_DLMM
}

enum LpOwner {
  PARTNER
  CREATOR
}

enum VestingProvider {
  STREAMFLOW
  JUP_LOCK
}

enum VestingStatus {
  PENDING
  ACTIVE
  PAUSED
  COMPLETED
  CANCELED
}
```

### a.2 `CreatorToken` — added fields + relations (edit in place; keep all existing fields/indexes)

```prisma
  // ── add fields ──
  tokenProgram              TokenProgram @default(TOKEN_2022)
  transferFeeBps            Int?
  transferFeeMaxBaseUnits   String?
  transferFeeAuthority      String?
  withdrawWithheldAuthority String?
  quoteMint                 String?
  dbcConfigKey              String?
  dbcPoolAddress            String?

  // ── add relations ──
  feeConfig     TokenFeeConfig?
  fundraise     TokenFundraise?
  lpPositions   LpPosition[]            // plural: partner + creator positions
  trades        Trade[]
  feeEvents     FeeEvent[]
  vestings      VestingSchedule[]
  contributions FundraiseContribution[]
```
Keep `@@unique([userId, chain])`, `@@index([chain, status])`, `@@index([symbol])` unchanged.
Optionally add `@@index([status])`.

### a.3 `User` — added back-relations (edit in place)

```prisma
  trades                 Trade[]
  fundraiseContributions FundraiseContribution[]
  vestingSchedules       VestingSchedule[]
  // (creatorTokens already exists)
```

### a.4 `TokenFeeConfig`

```prisma
model TokenFeeConfig {
  id                        String   @id @default(uuid())
  tokenId                   String   @unique

  transferFeeBps            Int                      // 300–500
  rebateTargetBps           Int      @default(100)   // in-app effective target (~1%)

  creatorTradingFeeBps      Int      @default(5000)  // share of the 80%
  partnerTradingFeeBps      Int      @default(5000)  // share of the 80% (sum = 10000)
  protocolFeeBps            Int      @default(2000)  // Meteora fixed 20% (recorded, not configurable)

  feeClaimer                String?                  // Momento partner wallet (DBC feeClaimer)
  creatorFeeWallet          String?
  rebateWallet              String?
  withdrawWithheldAuthority String?
  rebateMint                String?                  // USDC by default — NEVER the creator token

  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt

  token CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)

  @@map("token_fee_configs")
}
```

### a.5 `Trade` (RECONCILED — see SPEC §0.2: `signature`/`blockTime` nullable + `intentId`)

```prisma
model Trade {
  id            String     @id @default(uuid())
  tokenId       String
  userId        String?                              // SetNull on user delete
  traderWallet  String                               // on-chain payer

  side          TradeSide
  source        FeeSource                            // IN_APP | EXTERNAL — drives rebate eligibility
  venue         PoolType                             // METEORA_DBC | METEORA_DAMM_V2 | …

  intentId      String?    @unique                   // set when WE build the tx (IN_APP), pre-signature
  signature     String?    @unique                   // ON-CHAIN IDEMPOTENCY KEY (null until confirmed)

  amountInBaseUnits    String
  amountInMint         String
  amountOutBaseUnits   String
  amountOutMint        String
  priceUsd             Float?                         // display only
  priceTs              DateTime?                      // snapshot time for rebate true-up

  transferFeeBaseUnits String  @default("0")
  feeBps               Int?
  rebateBaseUnits      String  @default("0")
  rebateMint           String?
  rebatePaid           Boolean @default(false)
  rebateSignature      String?

  poolAddress   String?
  blockTime     DateTime?                            // null until confirmed
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  token     CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  user      User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
  feeEvents FeeEvent[]

  @@index([tokenId, blockTime])
  @@index([userId, blockTime])
  @@index([tokenId, side])
  @@index([traderWallet])
  @@index([source, rebatePaid])
  @@map("trades")
}
```

### a.6 `FeeEvent`

```prisma
model FeeEvent {
  id              String       @id @default(uuid())
  tokenId         String
  tradeId         String?

  type            FeeEventType
  source          FeeSource
  recipient       FeeRecipient
  recipientWallet String?

  grossBaseUnits  String       @default("0")
  feeBaseUnits    String       @default("0")
  netBaseUnits    String       @default("0")
  amountMint      String
  amountUsd       Float?
  feeBps          Int?

  signature       String?      @unique              // on-chain rows
  internalRef     String?      @unique              // off-chain computed rows: `${tradeId}:${recipient}:${type}`
  claimed         Boolean      @default(false)
  claimedAt       DateTime?
  claimSignature  String?

  blockTime       DateTime?
  createdAt       DateTime     @default(now())

  token CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  trade Trade?       @relation(fields: [tradeId], references: [id], onDelete: SetNull)

  @@index([tokenId, createdAt])
  @@index([tokenId, type])
  @@index([recipient, claimed])
  @@index([type, createdAt])
  @@index([tradeId])
  @@map("fee_events")
}
```
> **Idempotency rule:** on-chain row sets `signature`, leaves `internalRef` null. Off-chain accrual/rebate
> sets `internalRef`, leaves `signature` null until paid (then fills `claimSignature`). Never set both.

### a.7 `TokenFundraise`

```prisma
model TokenFundraise {
  id                       String          @id @default(uuid())
  tokenId                  String          @unique
  status                   FundraiseStatus @default(DRAFT)

  quoteMint                String                          // USDC by default
  thresholdBaseUnits       String                          // migration_quote_threshold (USDC base units)
  raisedBaseUnits          String          @default("0")
  contributorCount         Int             @default(0)
  minContributionBaseUnits String?
  maxContributionBaseUnits String?

  partnerLpBps             Int?
  creatorLpBps             Int?
  partnerLockedLpBps       Int?
  creatorLockedLpBps       Int?
  migrationFeeBps          Int?
  leftoverReceiver         String?

  startsAt                 DateTime?
  endsAt                   DateTime?
  finalizedAt              DateTime?
  finalizeSignature        String?         @unique

  createdAt                DateTime        @default(now())
  updatedAt                DateTime        @updatedAt

  token         CreatorToken            @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  contributions FundraiseContribution[]

  @@index([status])
  @@map("token_fundraises")
}
```

### a.8 `FundraiseContribution`

```prisma
model FundraiseContribution {
  id              String   @id @default(uuid())
  fundraiseId     String
  tokenId         String                              // denormalized
  userId          String?                             // SetNull on user delete
  walletAddress   String

  amountBaseUnits String
  quoteMint       String
  signature       String   @unique                    // ON-CHAIN IDEMPOTENCY KEY

  refunded        Boolean  @default(false)
  refundSignature String?  @unique
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

### a.9 `LpPosition`

```prisma
model LpPosition {
  id                    String     @id @default(uuid())
  tokenId               String

  provider              LpProvider @default(METEORA_DAMM_V2)
  owner                 LpOwner                          // PARTNER | CREATOR
  ownerWallet           String

  poolAddress           String
  positionAddress       String?
  positionNftMint       String?    @unique
  lpMint                String?

  baseReserveBaseUnits  String?
  quoteReserveBaseUnits String?
  liquidity             String?

  locked                Boolean    @default(true)
  lockedUntil           DateTime?
  createSignature       String?    @unique
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt

  token CreatorToken @relation(fields: [tokenId], references: [id], onDelete: Cascade)

  @@unique([tokenId, owner])
  @@index([tokenId])
  @@index([owner])
  @@index([poolAddress])
  @@map("lp_positions")
}
```

### a.10 `VestingSchedule`

```prisma
model VestingSchedule {
  id                String          @id @default(uuid())
  tokenId           String
  beneficiaryUserId String?                             // SetNull on user delete
  beneficiaryWallet String

  provider          VestingProvider
  streamId          String?         @unique             // Streamflow / Jup-Lock PDA

  totalBaseUnits    String
  releasedBaseUnits String          @default("0")
  tokenMint         String

  cliffSeconds      Int             @default(0)
  durationSeconds   Int
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

### a.11 Migration discipline (MANDATORY)
- Author `apps/api/prisma/migrations/<ts>_add_token_economy/migration.sql` by hand (or via
  `prisma migrate dev --create-only`, then review). Apply with **`prisma migrate deploy`**.
- **NEVER `prisma db push`/`--accept-data-loss`** against data envs (PostGIS geography columns/indexes/
  triggers in `00_postgis_setup` are invisible to Prisma and would be dropped).
- All new models/values are additive. `PoolType` value adds use `ALTER TYPE "PoolType" ADD VALUE`
  (no type-swap dance). Commit the generated `migration_lock.toml` if `prisma migrate` is adopted.

---

## (b) TS interfaces — `apps/api/lib/solana/*` and `lib/fees.ts` (paste-ready)

> **T-signer owns all of `apps/api/lib/solana/*`. T-fees owns `lib/fees.ts`.** Verbatim from `D-signer.md`.

### b.1 `apps/api/lib/solana/types.ts`

```ts
import type {
  Transaction, PublicKey, Keypair, Connection, Commitment, TransactionInstruction,
} from '@solana/web3.js';

export interface Signer {
  readonly publicKey: PublicKey;
  readonly kind: 'privy-server' | 'client-relay' | 'ephemeral';
  sign(tx: Transaction): Promise<Transaction>;
}

export interface BuiltTx {
  tx: Transaction;
  signers: Signer[];
  computeUnitLimit?: number;
  label?: string;
}

export type SubmitRoute = 'rpc' | 'sender';

export interface SubmitOptions {
  route?: SubmitRoute;
  priorityLevel?: 'Min' | 'Low' | 'Medium' | 'High' | 'VeryHigh' | 'UnsafeMax';
  jitoTipLamports?: number;
  swqosOnly?: boolean;
  commitment?: Commitment;
  maxRetries?: number;
  idempotencyKey?: string;
  computeUnitPriceMicroLamports?: number;
}

export interface SubmitResult {
  signature: string;
  slot?: number;
  route: SubmitRoute;
  priorityFeeMicroLamports: number;
  jitoTipLamports?: number;
  attempts: number;
  idempotencyKey: string;
  deduped: boolean;
}
```

### b.2 `apps/api/lib/solana/serverWallet.ts`

```ts
import type { Transaction, PublicKey } from '@solana/web3.js';

export interface ServerWallet {
  readonly address: PublicKey;                              // resolved from env walletId on first use
  signTransaction(tx: Transaction): Promise<Transaction>;
  signAllTransactions(txs: Transaction[]): Promise<Transaction[]>;
}

export function getServerWallet(): ServerWallet;            // singleton; lazy env read; stub under STUB_SOLANA_SIGNER
```

### b.3 `apps/api/lib/solana/signer.ts`

```ts
import type { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import type { Signer } from './types';

export function serverSigner(): Signer;                     // kind 'privy-server'
export function ephemeralSigner(kp?: Keypair): Signer;      // kind 'ephemeral' (metadata/base co-signer)
export function clientRelaySigner(userPubkey: PublicKey): Signer; // kind 'client-relay' (no-op sign)
export function applySigners(tx: Transaction, signers: Signer[]): Promise<Transaction>; // ephemerals first
```

### b.4 `apps/api/lib/solana/submit.ts`

```ts
import type { BuiltTx, SubmitOptions, SubmitResult, Signer } from './types';

export function submit(built: BuiltTx, opts?: SubmitOptions): Promise<SubmitResult>;
export function buildUnsignedForClient(built: BuiltTx): Promise<{ txBase64: string; idempotencyKey: string }>;
export function submitClientSigned(input: {
  txBase64: string; idempotencyKey: string; extraSigners?: Signer[]; opts?: SubmitOptions;
}): Promise<SubmitResult>;
```

### b.5 `apps/api/lib/solana/connection.ts`

```ts
import type { Connection } from '@solana/web3.js';
export function getConnection(): Connection;               // cached; Helius RPC (reuses lib/helius config)
```

### b.6 `apps/api/lib/solana/priorityFee.ts`

```ts
import type { TransactionInstruction } from '@solana/web3.js';
import type { SubmitOptions } from './types';

export function getPriorityFeeEstimate(input: {
  transaction?: string;
  accountKeys?: string[];
  priorityLevel?: SubmitOptions['priorityLevel'];
}): Promise<number>;                                        // micro-lamports / CU
export function computeBudgetIxs(microLamportsPerCu: number, unitLimit: number): TransactionInstruction[];
```

### b.7 `apps/api/lib/solana/sender.ts`

```ts
export function sendViaSender(input: {
  rawTxBase64: string;
  swqosOnly?: boolean;
}): Promise<{ signature: string }>;                         // POST https://sender.helius-rpc.com/fast
export function jitoTipIx(tipLamports: number): import('@solana/web3.js').TransactionInstruction;
```

### b.8 `apps/api/lib/solana/idempotency.ts`

```ts
export interface IdempotencyStore {
  get(key: string): Promise<string | null>;                // returns prior signature if landed
  put(key: string, signature: string): Promise<void>;
  reserve(key: string): Promise<boolean>;                  // atomic; true if newly reserved
}
export function getIdempotencyStore(): IdempotencyStore;    // in-process Map default; TODO(ops): Prisma/Redis
export function deriveIdempotencyKey(label: string, feePayer: string, unsignedMessageB64: string): string;
```

### b.9 `apps/api/lib/solana/errors.ts`

```ts
export type SolanaTxErrorCode =
  | 'CONFIG_MISSING' | 'STUBBED' | 'SIGNER_REJECTED' | 'PARTIAL_SIGN_UNSUPPORTED'
  | 'SIMULATION_FAILED' | 'BLOCKHASH_EXPIRED' | 'INSUFFICIENT_FUNDS' | 'TIP_TOO_LOW'
  | 'RPC_ERROR' | 'TIMEOUT' | 'DUPLICATE' | 'UNKNOWN';

export class SolanaTxError extends Error {
  code: SolanaTxErrorCode;
  retriable: boolean;
  signature?: string;
  cause?: unknown;
}
export function classify(err: unknown): SolanaTxError;
```

### b.10 `apps/api/lib/solana/index.ts` (barrel)

```ts
export * from './types';
export { getServerWallet } from './serverWallet';
export { serverSigner, ephemeralSigner, clientRelaySigner, applySigners } from './signer';
export { submit, buildUnsignedForClient, submitClientSigned } from './submit';
export { getConnection } from './connection';
export { SolanaTxError, classify } from './errors';
```

### b.11 `apps/api/lib/fees.ts` (T-fees)

```ts
// ── Rebate math (verified in spike-a) ──
export function calcFee(grossBaseUnits: bigint, feeBps: number, maxFeeBaseUnits: bigint): bigint;
export function computeRebate(input: {
  grossBaseUnits: bigint; feeBps: number; targetBps: number; maxFeeBaseUnits: bigint;
}): { chargedFee: bigint; targetFee: bigint; rebateOwedNet: bigint };
export function grossUpTokenRebate(rebateOwedNet: bigint, feeBps: number): bigint; // token-fallback path
export function rebateToUsdc(rebateOwedNet: bigint, tokenToUsdcPrice: number, tokenDecimals: number): bigint;

// ── 20/80 attribution ──
export interface FeeSplit { protocolBaseUnits: string; partnerBaseUnits: string; creatorBaseUnits: string; }
export function attribute2080(feeBaseUnits: bigint, creatorTradingFeeBps: number, partnerTradingFeeBps: number): FeeSplit;

// ── Summary aggregation (read model over Trade/FeeEvent) ──
export interface TokenFeeSummary {
  mint: string; range: string; transferFeeBps: number;
  feesGeneratedUsd: number; feesGeneratedBase: string;
  split: { creatorBps: number; momentoBps: number };
  claimable?: { creatorUsd: number; creatorBase: string; momentoUsd: number; momentoBase: string; lastClaimAt: number | null };
}
export interface TokenTradeSummary {
  mint: string; range: string;
  summary: { priceUsd: number; priceChangePct: number; volumeUsd: number; volumeBase: string;
             buyCount: number; sellCount: number; uniqueTraders: number; high: number; low: number };
  series: Array<{ t: number; p: number; v: number }>;
  recent: Array<{ signature: string; t: number; side: 'buy' | 'sell'; amountBase: string; amountUsd: number; priceUsd: number; trader: string }>;
}
export function getTokenFeeSummary(mint: string, range: string, opts?: { includeClaimable?: boolean }): Promise<TokenFeeSummary>;
export function getTokenTradeSummary(mint: string, range: string, limit?: number): Promise<TokenTradeSummary>;
export function getCreatorFeeSummary(creatorId: string, opts?: { includeClaimable?: boolean }): Promise<{
  creatorId: string; lifetime: { volumeUsd: number; feesGeneratedUsd: number };
  perToken: Array<{ mint: string; symbol: string; feesGeneratedUsd: number }>;
  claimable?: { creatorUsd: number; momentoUsd: number };
}>;
```

### b.12 `apps/api/lib/helius-webhook.ts` (T-fees)

```ts
import type { NextRequest } from 'next/server';

export function verifyHeliusWebhook(request: NextRequest, rawBody: string): boolean; // timingSafeEqual; bearer or HMAC
export interface ParsedHeliusEvent {
  signature: string; blockTime: number | null; type: string;
  tokenTransfers: Array<{ mint: string; fromUserAccount: string; toUserAccount: string; tokenAmount: number }>;
  accountData: any[]; events: any;
}
export function parseHeliusBatch(rawBody: string): ParsedHeliusEvent[];
export function ingestHeliusEvents(events: ParsedHeliusEvent[]): Promise<{ received: number; processed: number; skipped: number }>;
```

---

## (c) FILE MANIFEST — partitioned (no file shared across tasks)

### T-foundation (schema + shared types/constants + env examples + migration)

| File | CREATE/EDIT | Responsibility |
|---|---|---|
| `apps/api/prisma/schema.prisma` | EDIT | Add 10 enums (§a.1) + values; extend `CreatorToken` (§a.2) + `User` (§a.3); add 7 new models (§a.4–a.10) |
| `apps/api/prisma/migrations/<ts>_add_token_economy/migration.sql` | CREATE | Hand-written additive SQL: `CREATE TYPE` for new enums, `ALTER TYPE "PoolType" ADD VALUE` ×2, `ALTER TABLE creator_tokens ADD COLUMN…`, `CREATE TABLE` ×7, indexes, FKs, unique constraints |
| `apps/api/prisma/migrations/migration_lock.toml` | CREATE (if absent) | `provider = "postgresql"` (commit) |
| `packages/shared/src/types.ts` | EDIT | Add TS enums mirroring Prisma (`TokenProgram`, `FundraiseStatus`, `FeeSource`, `TradeSide`, `FeeEventType`, `FeeRecipient`, `LpProvider`, `LpOwner`, `VestingProvider`, `VestingStatus`); add `METEORA_DBC`/`METEORA_DAMM_V2` to `PoolType`; add `Trade`, `FeeEvent`, `TokenFeeConfig`, `TokenFundraise`, `FundraiseContribution`, `LpPosition`, `VestingSchedule` interfaces |
| `packages/shared/src/constants.ts` | EDIT | Add `MOMENTO_FEE` constant block (§d): USDC mint, default bps, token-program IDs, `MOMENTO_*` defaults |
| `apps/api/.env.local.example` | EDIT | Add all new env vars (§d) with comments |

> T-foundation must finish (or at minimum land the migration + generated client) before T-fees can
> run typed queries. T-signer is independent of the schema and can start immediately.

### T-signer (owns ALL of `apps/api/lib/solana/*` — new directory)

| File | CREATE | Responsibility (interface in §b) |
|---|---|---|
| `apps/api/lib/solana/index.ts` | CREATE | Barrel (§b.10) |
| `apps/api/lib/solana/types.ts` | CREATE | `Signer`, `BuiltTx`, `SubmitRoute`, `SubmitOptions`, `SubmitResult` (§b.1) |
| `apps/api/lib/solana/connection.ts` | CREATE | `getConnection()` cached Helius `Connection` (§b.5) |
| `apps/api/lib/solana/serverWallet.ts` | CREATE | `ServerWallet` + `getServerWallet()`; `@privy-io/node`; live calls `TODO(ops)` (§b.2) |
| `apps/api/lib/solana/signer.ts` | CREATE | 3 signer impls + `applySigners` (§b.3) |
| `apps/api/lib/solana/priorityFee.ts` | CREATE | Helius priority-fee estimate + ComputeBudget ixs (§b.6) |
| `apps/api/lib/solana/sender.ts` | CREATE | Helius Sender client + Jito tip ix (§b.7) |
| `apps/api/lib/solana/submit.ts` | CREATE | `submit` / `buildUnsignedForClient` / `submitClientSigned` pipeline (§b.4) |
| `apps/api/lib/solana/idempotency.ts` | CREATE | `IdempotencyStore` seam + key derivation (§b.8) |
| `apps/api/lib/solana/errors.ts` | CREATE | `SolanaTxError` taxonomy + `classify` (§b.9) |

> All import-safe: env read on first use only; `STUB_SOLANA_SIGNER=1` short-circuits live calls.

### T-fees (fee lib + webhook route + cron + summary endpoints + validation schemas)

| File | CREATE/EDIT | Responsibility |
|---|---|---|
| `apps/api/lib/fees.ts` | CREATE | Rebate math, 20/80 attribution, summary aggregation (§b.11) |
| `apps/api/lib/helius-webhook.ts` | CREATE | Verify (bearer/HMAC) + parse + classify + persist (§b.12) |
| `apps/api/app/api/webhooks/helius/route.ts` | CREATE | `POST` receiver (§e.1) |
| `apps/api/app/api/tokens/[mint]/trades/route.ts` | CREATE | `GET` public trade summary (§e.2) |
| `apps/api/app/api/tokens/[mint]/fees/route.ts` | CREATE | `GET` public+owner fee summary (§e.3) |
| `apps/api/app/api/creators/[id]/fees/route.ts` | CREATE | `GET` public+owner creator fee summary (§e.4) |
| `apps/api/app/api/cron/fee-claim/route.ts` | CREATE | `GET` recon/claim cron scaffold; Phase-3/4 seams (SPEC §7) |
| `apps/api/lib/validation.ts` | EDIT | Add `heliusWebhookSchema` (lax array, `.passthrough()`) + `tradeRangeSchema` (`range` enum + `limit`/`granularity`) |
| `apps/api/vercel.json` | CREATE/EDIT | Add cron entry for `/api/cron/fee-claim` (~30 min) |

> **No file is owned by two tasks.** T-fees edits `lib/validation.ts` (T-foundation does not touch it).
> T-foundation edits `packages/shared/*` (T-fees imports the generated types but does not edit them).
> T-fees imports from `lib/solana/*` (T-signer) and the Prisma client (T-foundation) — import-only,
> never edits those files.

---

## (d) New env vars + shared constants

### d.1 Env vars (add to `apps/api/.env.local.example`)

| Var | Owner task uses | Purpose | Default |
|---|---|---|---|
| `PRIVY_AUTHORIZATION_KEY` | T-signer | Authorization private key signing server-wallet API requests | — (ops) |
| `PRIVY_SERVER_WALLET_ID` | T-signer | Id of the provisioned Momento treasury wallet (identify, not create) | — (ops) |
| `SOLANA_RPC_URL` | T-signer | Override RPC; falls back to Helius `rpcUrl` | Helius rpcUrl |
| `SOLANA_NETWORK` | T-signer | `devnet` / `mainnet-beta` (caip2 cluster) | `devnet` |
| `HELIUS_SENDER_URL` | T-signer | Helius Sender endpoint | `https://sender.helius-rpc.com/fast` |
| `JITO_TIP_LAMPORTS` | T-signer | Default Jito tip | `200000` (min; `5000` if swqosOnly) |
| `JITO_TIP_ACCOUNT` | T-signer | Jito tip recipient account | — |
| `STUB_SOLANA_SIGNER` | T-signer | `1` → stub mode (import-safe, no live calls) | unset |
| `HELIUS_WEBHOOK_SECRET` | T-fees | Webhook shared secret (bearer/HMAC) | — |
| `WEBHOOK_MAX_AGE` | T-fees | Replay freshness window (seconds) | `600` |
| `MOMENTO_REBATE_USDC_VAULT` | T-fees | Default USDC rebate source wallet | — |
| `MOMENTO_LP_FEE_CLAIMER` | T-fees | Meteora `fee_claimer` (= `TokenFeeConfig.feeClaimer` default) | — |
| `MOMENTO_CREATOR_FEE_PCT` | T-fees | Drives `creator_trading_fee_percentage` | `50` |
| `CRON_SECRET` | T-fees | Cron bearer (REUSE — already exists) | — |

Reused (already present): `PRIVY_APP_ID`/`NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `HELIUS_API_KEY`,
`UPSTASH_REDIS_REST_*`, `MOMENTO_FEE_WALLET`, `MOMENTO_PLATFORM_FEE_BPS`.

### d.2 Shared constants (add to `packages/shared/src/constants.ts`, owned by T-foundation)

```ts
export const MOMENTO_FEE = {
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDC_DECIMALS: 6,
  TOKEN_2022_PROGRAM_ID: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  TOKEN_CLASSIC_PROGRAM_ID: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  DEFAULT_TRANSFER_FEE_BPS: 400,   // locked range 300–500
  TARGET_IN_APP_BPS: 100,          // ~1% effective after rebate (spike-a)
  PROTOCOL_FEE_BPS: 2000,          // Meteora fixed 20% (confirm vs deployed program)
  DEFAULT_CREATOR_TRADING_FEE_BPS: 5000,
  DEFAULT_PARTNER_TRADING_FEE_BPS: 5000,
} as const;
```

---

## (e) Endpoint request/response shapes — Phase 2 BUILD-NOW (binding)

> Envelope: `{ success: true, data }` or `{ success: false, error }`. Money = base-unit strings.
> USD/display = number. bps = number.

### e.1 `POST /api/webhooks/helius` — Webhook auth (secret + replay). Limiter: none.
**Request:** Helius enhanced-tx JSON **array** (validate with lax `heliusWebhookSchema`, `.passthrough()`):
```jsonc
[ { "signature": "5xq…", "slot": 0, "timestamp": 0, "type": "SWAP", "source": "METEORA",
    "accountData": [], "tokenTransfers": [ { "mint": "…", "fromUserAccount": "…", "toUserAccount": "…", "tokenAmount": 0 } ],
    "events": {} } ]
```
**Response:** `{ "success": true, "data": { "received": 12, "processed": 12, "skipped": 0 } }`
`401 { "success": false, "error": "Invalid signature" }`. Always `200` for already-seen (skipped++).

### e.2 `GET /api/tokens/[mint]/trades` — Public. Limiter: `readLimiter`.
**Query:** `range ∈ 24H|7D|1M|3M|1Y|ALL` (default `24H`); `granularity ∈ hour|day` (optional);
`limit` (default 50, max 200). **Response:**
```jsonc
{ "success": true, "data": {
  "mint": "Hxk…", "range": "24H",
  "summary": { "priceUsd": 0.0042, "priceChangePct": 12.5, "volumeUsd": 18450.12,
    "volumeBase": "4392000000", "buyCount": 312, "sellCount": 188, "uniqueTraders": 274,
    "high": 0.0051, "low": 0.0039 },
  "series": [ { "t": 1719100800, "p": 0.0041, "v": 1203.4 } ],
  "recent": [ { "signature": "5xq…", "t": 1719187200, "side": "buy",
    "amountBase": "1000000000", "amountUsd": 4.2, "priceUsd": 0.0042, "trader": "9aZ…" } ] } }
```

### e.3 `GET /api/tokens/[mint]/fees` — Public (owner/admin widened). Limiter: `readLimiter`.
**Query:** `range` (default `ALL`). **Response (public subset):**
```jsonc
{ "success": true, "data": {
  "mint": "Hxk…", "range": "ALL", "transferFeeBps": 400,
  "feesGeneratedUsd": 920.55, "feesGeneratedBase": "219000000000",
  "split": { "creatorBps": 200, "momentoBps": 200 } } }
```
**Owner/admin only adds:**
```jsonc
"claimable": { "creatorUsd": 410.10, "creatorBase": "97600000000",
  "momentoUsd": 410.10, "momentoBase": "97600000000", "lastClaimAt": 1719000000 }
```

### e.4 `GET /api/creators/[id]/fees` — Public (owner/admin widened). Limiter: `readLimiter`.
**Response:**
```jsonc
{ "success": true, "data": {
  "creatorId": "usr_…",
  "lifetime": { "volumeUsd": 184500.0, "feesGeneratedUsd": 920.55 },
  "perToken": [ { "mint": "Hxk…", "symbol": "DEEL", "feesGeneratedUsd": 920.55 } ],
  "claimable": { "creatorUsd": 410.10, "momentoUsd": 410.10 } } }   // claimable: owner/admin only
```

### e.5 `GET /api/cron/fee-claim` — Cron (`Authorization: Bearer ${CRON_SECRET}`, constant-time). Limiter: none.
**Response:** `{ "success": true, "data": { "reclassified": 0, "rebatesQueued": 0, "claimsRecorded": 0, "harvestNoted": 0 } }`
Body contains `TODO(Phase 3)` Meteora-claim and `TODO(Phase 4)` rebate-send seams (SPEC §7). Idempotent
(insert-or-ignore on unique keys); safe on overlapping ticks.

> **Phase 3 endpoints** (`POST /api/tokens/launch`, `GET /api/tokens/[mint]`, `POST /api/tokens/[mint]/buy|sell`,
> `POST /api/creators/[id]/fees/claim`, `POST /api/vesting/create`, `GET /api/vesting/list`,
> `POST /api/vesting/[id]/withdraw`) are **contract-only** — see `D-api.md §3`. Do NOT build in Phase 2.
</content>
