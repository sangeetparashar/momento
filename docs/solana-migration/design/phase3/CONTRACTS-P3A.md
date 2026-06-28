# CONTRACTS-P3A — Binding Phase 3A Implementation Contract

> **Status:** BINDING. Implementation agents implement EXACTLY what is written here. Zero ambiguity by
> design. Read `SPEC-P3A.md` for the "why". Names/signatures reconciled across the five Phase 3A drafts.
> **Solana-only. `@solana/web3.js` v1.** Builds on committed Phase 2 (`design/phase2/CONTRACTS.md`).
> **File ownership is partitioned so concurrent tasks NEVER share a file** (§c). `P3-foundation` owns
> EVERY shared/contended file and runs FIRST; the five module tasks own only NEW files.
> **Tasks:** `P3-foundation`, `P3-launch`, `P3-trade`, `P3-graduation`, `P3-feeclaim`, `P3-vesting`.

---

## (a) Schema changes — ADDITIVE only, ONE forward migration

> **Owner: `P3-foundation`.** Phase 2 already merged ALL 8 token-economy models + 10 enums (verified in
> `apps/api/prisma/schema.prisma`). Phase 3A needs exactly **ONE additive field**. KEEP every Phase 2
> model/field/index/enum unchanged.

### a.1 The single Prisma diff — `TokenFundraise.finalizeStartedAt`

```prisma
model TokenFundraise {
  // ...all existing Phase 2 fields unchanged...
  finalizedAt       DateTime?
  finalizeSignature String?   @unique
  finalizeStartedAt DateTime?   // ── P3A ADD ── graduation lease timestamp (D-graduation §4.2)
  // ...relations/indexes unchanged...
}
```

That is the ONLY schema change in Phase 3A. Everything else reuses committed fields:
- Launch SETS (no new columns): `CreatorToken.{mintAddress, tokenProgram, decimals, totalSupply,
  transferFeeBps, transferFeeMaxBaseUnits, transferFeeAuthority, withdrawWithheldAuthority, quoteMint,
  dbcConfigKey, dbcPoolAddress, poolType, poolAddress, status, deployTxSignature, deployedAt}`;
  `TokenFeeConfig.*`; `TokenFundraise.{status, thresholdBaseUnits, *LpBps, *LockedLpBps, migrationFeeBps,
  leftoverReceiver}`.
- Trade SETS: `Trade.*` (already has `intentId`, nullable `signature`/`blockTime`).
- Graduation SETS: `LpPosition.*` (×2), `TokenFundraise.{finalizeStartedAt, finalizeSignature,
  finalizedAt, status}`, `CreatorToken.{status, graduatedAt, poolType, poolAddress}`.
- Fee-claim SETS: `FeeEvent.*`, `Trade.{rebatePaid, rebateSignature}`.
- Vesting SETS: `VestingSchedule.*`.

### a.2 The migration (hand-authored, additive, forward-only)

```
apps/api/prisma/migrations/20260625000000_add_finalize_started_at/migration.sql
```
```sql
-- P3A: graduation lease timestamp (additive, nullable — no backfill, no data loss)
ALTER TABLE "token_fundraises" ADD COLUMN "finalizeStartedAt" TIMESTAMP(3);
```
Apply with `prisma migrate deploy`. **NEVER `prisma db push`/`--accept-data-loss`** (PostGIS columns in
`00_postgis_setup` are invisible to Prisma). Phase 2 migration `20260624010000_add_token_economy` is
already applied; this is purely additive on top.

---

## (b) New lib interfaces — paste-ready, reconciled signatures

> Each lib is CREATE, owned by exactly one module task. All consume the committed
> `lib/solana/*` barrel (`submit`, `serverSigner`, `ephemeralSigner`, `clientRelaySigner`, `applySigners`,
> `buildUnsignedForClient`, `submitClientSigned`, `getConnection`, `SolanaTxError`, `classify`, types
> `BuiltTx`/`SubmitResult`/`Signer`) and `lib/fees.ts` / `@momento/shared` `MOMENTO_FEE`. Money = base-unit
> strings at the boundary, `bigint` in math; USD = number; bps = number; unix times = number (seconds).

### b.1 `apps/api/lib/launch.ts` — owner `P3-launch`

```ts
import type { BuiltTx, SubmitResult } from '@/lib/solana';
import type { Keypair, PublicKey } from '@solana/web3.js';

export interface LaunchTokenInput {
  creatorUserId: string;
  creatorWallet: string;
  name: string; symbol: string; description?: string; imageUrl?: string;
  totalSupply: string;            // base-unit string; default "1000000000"
  decimals?: number;              // 6..9; default 9
  transferFeeBps?: number;        // 300..500; default MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS
  transferFeeMaxBaseUnits?: string;
  creatorTradingFeeBps?: number;  // default 5000
  partnerTradingFeeBps?: number;  // default 5000 (sum = 10000)
  fundraise: {
    targetUsd: number;
    initialMarketCapUsd?: number;
    partnerLockedLpPct?: number;  // default 50
    partnerLpPct?: number;        // default 0
    creatorLockedLpPct?: number;  // default 50
    creatorLpPct?: number;        // default 0
    minContributionBaseUnits?: string;
    maxContributionBaseUnits?: string;
  };
}

export interface LaunchResult {
  tokenId: string; mintAddress: string; dbcConfigKey: string; dbcPoolAddress: string;
  poolType: 'METEORA_DBC';
  status: 'DEPLOYING' | 'ACTIVE';
  configSignature: string; poolSignature: string;
}

export interface LaunchContext {
  input: LaunchTokenInput;
  configKeypair: Keypair;      // ephemeralSigner()
  baseMintKeypair: Keypair;    // ephemeralSigner()
  quoteMint: PublicKey;        // MOMENTO_FEE.USDC_MINT
  feeClaimer: PublicKey;       // MOMENTO_LP_FEE_CLAIMER
  metadataUri: string;
}

/** Orchestrate launch: persist PENDING → createConfig → createPool → persist+flip. Idempotent on tokenId. */
export function launchCreatorToken(input: LaunchTokenInput): Promise<LaunchResult>;

/** Pure builders (no network) — return BuiltTx for submit(). */
export function buildCreateConfigTx(ctx: LaunchContext): Promise<BuiltTx>;
export function buildCreatePoolTx(ctx: LaunchContext): Promise<BuiltTx>;
```

### b.2 `apps/api/lib/trade.ts` — owner `P3-trade`

```ts
import type { BuiltTx } from '@/lib/solana';
import type { PoolType, TradeSide } from '@momento/shared';

export type TradeVenue = 'METEORA_DBC' | 'METEORA_DAMM_V2';  // narrowing of PoolType

export interface ResolvedToken {
  tokenId: string; mint: string; decimals: number;
  tokenProgram: 'TOKEN_2022' | 'TOKEN_CLASSIC';
  quoteMint: string; venue: TradeVenue; poolAddress: string;
  transferFeeBps: number; transferFeeMaxBaseUnits: bigint;
  rebateTargetBps: number; rebateMint: string;
}
export function resolveTradeVenue(mint: string): Promise<ResolvedToken>;

export interface QuoteInput {
  token: ResolvedToken; side: TradeSide; amountInBaseUnits: bigint;
  slippageBps: number; priceUsd?: number;
}
export interface TradeQuote {
  venue: TradeVenue; inputMint: string; outputMint: string;
  amountInBaseUnits: string; expectedOutBaseUnits: string; minOutBaseUnits: string;
  priceUsd: number; priceTs: string;
  transferFeeBaseUnits: string; feeBps: number;
  rebateBaseUnits: string; rebateMint: string; effectiveFeeBps: number;
}
export function getTradeQuote(input: QuoteInput): Promise<TradeQuote>;

export interface BuildTradeInput {
  token: ResolvedToken; side: TradeSide; userId: string; traderWallet: string;
  amountInBaseUnits: bigint; slippageBps: number; quote: TradeQuote;
}
export interface BuiltTrade { intentId: string; tradeId: string; built: BuiltTx; quote: TradeQuote; }
export function buildTrade(input: BuildTradeInput): Promise<BuiltTrade>;

export interface SubmitTradeInput { intentId: string; txBase64: string; idempotencyKey: string; }
export interface SubmitTradeResult {
  intentId: string; signature: string; venue: TradeVenue;
  status: 'CONFIRMED' | 'PENDING'; deduped: boolean;
}
export function submitTrade(input: SubmitTradeInput & { userId: string }): Promise<SubmitTradeResult>;

export interface TokenDetail {
  mint: string; name: string; symbol: string; imageUrl: string | null;
  decimals: number; totalSupply: string; circulatingSupply: string;
  status: string; venue: TradeVenue; poolType: PoolType | null; poolAddress: string | null;
  priceUsd: number; marketCapUsd: number; transferFeeBps: number;
  feeConfig: { creatorBps: number; momentoBps: number; rebateTargetBps: number; rebateMint: string };
  fundraise: { status: string; raisedBaseUnits: string; thresholdBaseUnits: string;
               progressPct: number; quoteMint: string } | null;
  creator: { id: string; username: string | null; verified: boolean };
  graduatedAt: number | null;
}
export function getTokenDetail(mint: string): Promise<TokenDetail | null>;

export type TradeErrorCode =
  | 'TOKEN_NOT_FOUND' | 'TOKEN_NOT_TRADEABLE' | 'VENUE_UNRESOLVED'
  | 'QUOTE_STALE' | 'SLIPPAGE' | 'AMOUNT_INVALID' | 'WALLET_NOT_READY';
export class TradeError extends Error { code: TradeErrorCode; }
```

### b.3 `apps/api/lib/graduation.ts` — owner `P3-graduation`

```ts
export interface RaisedProgress {
  tokenId: string; quoteMint: string;
  raisedBaseUnits: string; thresholdBaseUnits: string; pct: number;
  thresholdMet: boolean; contributorCount: number;
  status: 'DRAFT'|'ACTIVE'|'THRESHOLD_MET'|'FINALIZING'|'COMPLETED'|'FAILED'|'REFUNDED';
}
export function getRaisedProgress(tokenId: string): Promise<RaisedProgress>;

/** Flip ACTIVE → THRESHOLD_MET when confirmed raise >= threshold (idempotent, conditional). */
export function detectThresholdMet(tokenId: string): Promise<boolean>;

export interface GraduationResult {
  tokenId: string;
  outcome: 'finalized' | 'retried' | 'skipped' | 'already-completed' | 'failed';
  migrateSignature?: string; dammV2Pool?: string;
  partnerPositionNftMint?: string; creatorPositionNftMint?: string; error?: string;
}
/** Graduate ONE token end-to-end (idempotent): lease → migrate → lock → persist both LpPositions → finalize. */
export function graduateToken(tokenId: string): Promise<GraduationResult>;

export function runGraduationSweep(opts?: { limit?: number }): Promise<{
  detected: number; finalized: number; retried: number; failed: number;
  results: GraduationResult[];
}>;
```

### b.4 `apps/api/lib/fee-claim.ts` — owner `P3-feeclaim`

```ts
export interface ClaimResult {
  tokenId: string; mint: string;
  partnerTradingFeeSig?: string; creatorTradingFeeSig?: string;
  partnerLpFeeSig?: string; creatorLpFeeSig?: string; withdrawWithheldSig?: string;
  recorded: number; skipped: string[];
}
export interface RebateResult { attempted: number; sent: number; deduped: number; failed: number; signatures: string[]; }

export function claimTokenFees(tokenId: string, opts?: { actor?: string }): Promise<ClaimResult>;
export function runClaimSweep(limit?: number): Promise<{ tokens: number; results: ClaimResult[] }>;
export function payRebate(tradeId: string): Promise<{ sent: boolean; signature?: string; reason?: string }>;
export function runRebateSweep(limit?: number): Promise<RebateResult>;
```

### b.5 `apps/api/lib/vesting.ts` — owner `P3-vesting`

```ts
import type { BuiltTx } from '@/lib/solana';
import type { VestingProvider, VestingStatus, VestingSchedule } from '@prisma/client';
import type { PublicKey } from '@solana/web3.js';

export type VestingKind = 'vesting' | 'lock';

export interface VestingCreateInput {
  kind: VestingKind; tokenId: string; mint: string; recipient: string;
  amountBase: string;                 // GROSS to deposit
  startAt: number; cliffAt: number; endAt: number; unlockEvery: number;
  cliffAmountBase?: string;
}
export interface VestingPlan {
  provider: VestingProvider; streamId: string; ephemeralPubkey: string;
  netDepositBase: string; built: BuiltTx;
}
export function buildStreamflowCreate(input: VestingCreateInput, payer: PublicKey): Promise<VestingPlan>;
export function buildJupiterLockCreate(input: VestingCreateInput, payer: PublicKey): Promise<VestingPlan>;
export function buildVestingCreate(input: VestingCreateInput, payer: PublicKey): Promise<VestingPlan>;

export function buildVestingWithdraw(args: {
  schedule: VestingSchedule; invoker: PublicKey; amountBase?: string;
}): Promise<{ built: BuiltTx; claimableBase: string }>;

export function buildVestingCancel(args: {
  schedule: VestingSchedule; invoker: PublicKey;
}): Promise<{ built: BuiltTx }>;

export function getVestingState(schedule: VestingSchedule): Promise<{
  totalBase: string; withdrawnBase: string; claimableBase: string; status: VestingStatus;
}>;
```

---

## (c) FILE MANIFEST — partitioned (NO file shared across tasks)

> **Rule:** any file edited by more than one draft is moved into `P3-foundation` (runs FIRST). After it
> lands, the five module tasks touch only their own NEW files. `vercel.json` edits are consolidated into
> `P3-foundation` to avoid two crons racing the same file.

### `P3-foundation` — ALL shared/contended files (schema, migration, validation, webhook, shared, env, vercel)

| File | CREATE/EDIT | Responsibility |
|---|---|---|
| `apps/api/prisma/schema.prisma` | EDIT | Add ONLY `TokenFundraise.finalizeStartedAt` (§a.1). No other change. |
| `apps/api/prisma/migrations/20260625000000_add_finalize_started_at/migration.sql` | CREATE | `ALTER TABLE "token_fundraises" ADD COLUMN "finalizeStartedAt" TIMESTAMP(3);` (§a.2) |
| `apps/api/lib/validation.ts` | EDIT | Add ALL Phase-3A Zod schemas: `launchTokenSchema`, `tradeOrderSchema`, `tradeSubmitSchema`, `feeClaimSchema`, `vestingCreateSchema`, `vestingWithdrawSchema` (§e). KEEP all Phase-2 schemas. |
| `apps/api/lib/helius-webhook.ts` | EDIT | Add the additive `raisedBaseUnits`/`contributorCount` `increment` on confirmed USDC-in curve-BUY/contribution rows, inside the existing per-event `$transaction` (D-graduation §3.2). Touch ONLY this; do not alter verify/parse/classify. |
| `packages/shared/src/constants.ts` | EDIT | Add `MOMENTO_LAUNCH`/`MOMENTO_CLAIM` constant block (§g): claim/rebate batch sizes, default LP pcts, slippage default, `MOMENTO_REBATE_USDC_VAULT` note. KEEP `MOMENTO_FEE`. |
| `packages/shared/src/types.ts` | EDIT | Add any P3A wire interfaces consumed cross-package (optional; modules may keep types local). No Phase-2 type changes. |
| `apps/api/.env.local.example` | EDIT | Add all new env vars (§g) with comments. |
| `apps/api/vercel.json` | EDIT | Add the `/api/cron/graduate` cron entry (`*/5 * * * *`); fee-claim cron already present. |

> P3-foundation must finish (migration applied + generated client + schemas exported + webhook increment +
> constants/env) before any module task runs typed queries / imports the new schemas.

### `P3-launch`

| File | CREATE | Responsibility |
|---|---|---|
| `apps/api/lib/launch.ts` | CREATE | DBC createConfig+createPool orchestration, persistence, idempotency/rollback (§b.1) |
| `apps/api/app/api/tokens/launch/route.ts` | CREATE | `POST` Creator-gated launch (§d.1) |

### `P3-trade`

| File | CREATE | Responsibility |
|---|---|---|
| `apps/api/lib/trade.ts` | CREATE | Venue resolve, quote, build (intent), submit, token detail (§b.2) |
| `apps/api/app/api/tokens/[mint]/route.ts` | CREATE | `GET` public token detail (§d.2) |
| `apps/api/app/api/tokens/[mint]/buy/route.ts` | CREATE | `POST` build buy (§d.3) |
| `apps/api/app/api/tokens/[mint]/sell/route.ts` | CREATE | `POST` build sell (§d.3) |
| `apps/api/app/api/tokens/[mint]/buy/submit/route.ts` | CREATE | `POST` relay client-signed buy (§d.4) |
| `apps/api/app/api/tokens/[mint]/sell/submit/route.ts` | CREATE | `POST` relay client-signed sell (§d.4) |

### `P3-graduation`

| File | CREATE | Responsibility |
|---|---|---|
| `apps/api/lib/graduation.ts` | CREATE | Raised tracking, threshold, keeper, migrate+lock+persist (§b.3) |
| `apps/api/app/api/cron/graduate/route.ts` | CREATE | `GET` cron shell over `runGraduationSweep()` (§d.5) |

### `P3-feeclaim`

| File | CREATE/EDIT | Responsibility |
|---|---|---|
| `apps/api/lib/fee-claim.ts` | CREATE | Claim + rebate execution engine (§b.4) |
| `apps/api/app/api/cron/fee-claim/route.ts` | EDIT | Fill ONLY the two `TODO(Phase 3)`/`TODO(Phase 4)` seams with env-gated `runClaimSweep`/`runRebateSweep`; KEEP the Phase-2 recon/harvest blocks + response shape (extend `data` with `rebatesSent`) |
| `apps/api/app/api/creators/[id]/fees/claim/route.ts` | CREATE | `POST` admin manual claim (§d.6) |

> `P3-feeclaim` is the ONLY task that edits `cron/fee-claim/route.ts` (committed Phase-2 file). No other
> task touches it. The constants/env it needs are added by `P3-foundation`.

### `P3-vesting`

| File | CREATE | Responsibility |
|---|---|---|
| `apps/api/lib/vesting.ts` | CREATE | Streamflow + Jupiter Lock builders, withdraw/cancel, state (§b.5) |
| `apps/api/app/api/vesting/create/route.ts` | CREATE | `POST` Creator-gated create (§d.7) |
| `apps/api/app/api/vesting/list/route.ts` | CREATE | `GET` User list (§d.8) |
| `apps/api/app/api/vesting/[id]/withdraw/route.ts` | CREATE | `POST` recipient withdraw (§d.9) |

> **No file appears under two tasks.** The four formerly-contended files (`validation.ts`,
> `helius-webhook.ts`, `schema.prisma`+migration, `packages/shared`+`vercel.json`) are all under
> `P3-foundation`. `cron/fee-claim/route.ts` is owned solely by `P3-feeclaim`.

---

## (d) Endpoint request/response shapes (envelope-consistent with Phase 2)

> Envelope `{success:true,data}` / `{success:false,error}`. Money = base-unit strings. Order:
> `applyRateLimit(request, <limiter>())` → auth → `isValidMint`/`isValidUuid` guard → `validateBody` →
> work → `{success,data}`; `catch` re-throws `Response` (auth/validation) else maps `SolanaTxError.code`.

### d.1 `POST /api/tokens/launch` — Creator · `writeLimiter`
```jsonc
// req (launchTokenSchema)
{ "name":"Deel Token","symbol":"DEEL","description":"…","imageUrl":"https://…",
  "totalSupply":"1000000000","decimals":9,"transferFeeBps":400,
  "feeSplit":{"creatorBps":5000,"partnerBps":5000},
  "fundraise":{"targetUsd":25000,"initialMarketCapUsd":100,
    "partnerLockedLpPct":50,"partnerLpPct":0,"creatorLockedLpPct":50,"creatorLpPct":0} }
// res 200 (server-signed default)
{ "success":true,"data":{ "tokenId":"…","mintAddress":"Hxk…","dbcConfigKey":"Cfg…",
  "dbcPoolAddress":"Pool…","poolType":"METEORA_DBC","status":"ACTIVE",
  "configSignature":"5xq…","poolSignature":"3pQ…" } }
```
Errors: `DUPLICATE`→200 (prior LaunchResult); `SIMULATION_FAILED`→400; `INSUFFICIENT_FUNDS`→402;
`TIMEOUT`/`BLOCKHASH_EXPIRED`→202 (status DEPLOYING); one-token-per-creator→409; else 500.
Alt (creator-as-poolCreator, §9.3): `data` is `{transaction:"<base64-unsigned>", tokenId, status:"DEPLOYING"}`.

### d.2 `GET /api/tokens/[mint]` — Public · `readLimiter`
```jsonc
{ "success":true,"data":{ "mint":"Hxk…","name":"Deel Token","symbol":"DEEL","imageUrl":"…",
  "decimals":9,"totalSupply":"1000000000","circulatingSupply":"120000000",
  "status":"ACTIVE","venue":"METEORA_DBC","poolType":"METEORA_DBC","poolAddress":"…",
  "priceUsd":0.0042,"marketCapUsd":504000,"transferFeeBps":400,
  "feeConfig":{"creatorBps":200,"momentoBps":200,"rebateTargetBps":100,"rebateMint":"EPjF…"},
  "fundraise":{"status":"ACTIVE","raisedBaseUnits":"3200000000","thresholdBaseUnits":"5000000000",
    "progressPct":64,"quoteMint":"EPjF…"},
  "creator":{"id":"usr_…","username":"deel","verified":true},"graduatedAt":null } }
// 400 invalid mint | 404 { "success":false,"error":"Token not found" }
```
`fundraise` non-null only pre-graduation. Post-grad: `venue:"METEORA_DAMM_V2"`, `fundraise:null`, `graduatedAt` set.

### d.3 `POST /api/tokens/[mint]/{buy,sell}` — User · `swapLimiter`
```jsonc
// req (tradeOrderSchema)
{ "amountInBase":"5000000","inputMint":"USDC","slippageBps":50 }
// res — build + persisted intent
{ "success":true,"data":{ "intentId":"…","transaction":"<base64-unsigned>","idempotencyKey":"v1:…",
  "venue":"METEORA_DBC",
  "quote":{ "expectedOutBase":"1190000000","minOutBase":"1184050000","priceUsd":0.0042,
    "priceTs":"2026-06-24T00:00:00Z","feeBase":"200000","feeBps":400,"effectiveFeeBps":100,
    "inAppRebateBase":"150000","rebateMint":"EPjF…" } } }
```
BUY: `inputMint`=USDC, output=token. SELL: input=token, output=USDC (`inputMint` ignored). Wallet gate:
`getWalletForChain(user)` null/`pending-` → 400 "Wallet not ready". SOL-input rejected in 3A.

### d.4 `POST /api/tokens/[mint]/{buy,sell}/submit` — User · `swapLimiter`
```jsonc
// req (tradeSubmitSchema) { "intentId":"…","transaction":"<base64-client-signed>","idempotencyKey":"v1:…" }
// res { "success":true,"data":{ "intentId":"…","signature":"3pQ…","venue":"METEORA_DBC",
//        "status":"CONFIRMED","deduped":false } }
```
403 if `Trade.userId !== user.id`. Idempotent: re-submit returns existing signature (`deduped:true`).

### d.5 `GET /api/cron/graduate` — Cron (`Authorization: Bearer ${CRON_SECRET}`, constant-time) · no limiter
Mirror `cron/fee-claim/route.ts` auth (fail-closed; `ALLOW_INSECURE_CRON` dev opt-in only).
```jsonc
{ "success":true,"data":{ "detected":1,"finalized":1,"retried":0,"failed":0 } }
```

### d.6 `POST /api/creators/[id]/fees/claim` — Admin (`requireAdmin`, failClosed) · no limiter
`isValidUuid([id])`. Body (feeClaimSchema): `{ "tokenId":"…" }` | `{ "mint":"Hxk…" }` | `{}` (all creator's graduated tokens).
```jsonc
{ "success":true,"data": /* ClaimResult | ClaimResult[] */ }
```
Writes a `PromotionLog`-style audit row (actor, target, method='fee-claim', metadata=signatures). Errors:
`CONFIG_MISSING`/`STUBBED`→500; `SIMULATION_FAILED`/`SIGNER_REJECTED`→502; `DUPLICATE`→200 (deduped).

### d.7 `POST /api/vesting/create` — Creator · `writeLimiter`
`requireCreator`; wallet gate; verify caller owns `tokenId` (`CreatorToken.userId===user.id`) and `mint===token.mintAddress`.
```jsonc
// req (vestingCreateSchema)
{ "kind":"vesting","tokenId":"…","mint":"Hxk…","recipient":"9aZ…","amountBase":"50000000000",
  "startAt":1719000000,"cliffAt":1726000000,"endAt":1750000000,"unlockEvery":86400,"cliffAmountBase":"0" }
// res
{ "success":true,"data":{ "vestingId":"…","provider":"STREAMFLOW","streamId":"<metadataPubkey|escrowPDA>",
  "signMode":"client",                  // "server" => already submitted
  "transaction":"<base64-unsigned>",    // present only when signMode==="client"
  "createSignature":null,               // set when signMode==="server"
  "netDepositBase":"48000000000" } }
```
`signMode` discriminator: server path submits + sets `createSignature`+`status=ACTIVE`; client/fallback
path returns `transaction`, row stays `PENDING` until mobile self-submits + logs.

### d.8 `GET /api/vesting/list` — User · `readLimiter`
`requireAuth`. `?role=recipient`(default)|`sender`; optional `?mint=`. Per-row live `getVestingState`.
```jsonc
{ "success":true,"data":[ { "vestingId":"…","mint":"Hxk…","symbol":"DEEL","role":"recipient",
  "totalBase":"50000000000","withdrawnBase":"3000000000","claimableBase":"3000000000",
  "cliffAt":1726000000,"endAt":1750000000,"status":"ACTIVE" } ] }
```

### d.9 `POST /api/vesting/[id]/withdraw` — User (recipient) · `writeLimiter`
`requireAuth`; authorize caller wallet === `beneficiaryWallet`; 400 "Nothing to withdraw" if claimable 0.
```jsonc
// req {}  (id in path)
// res { "success":true,"data":{ "transaction":"<base64-unsigned>","claimableBase":"3000000000" } }
```

---

## (e) New Zod schemas — ALL in `apps/api/lib/validation.ts` (owner `P3-foundation`)

```ts
// launch (P3-launch consumes)
export const launchTokenSchema = z.object({
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  totalSupply: z.string().regex(/^[1-9]\d*$/).default('1000000000'),
  decimals: z.number().int().min(6).max(9).default(9),
  transferFeeBps: z.number().int().min(300).max(500).default(400),
  feeSplit: z.object({
    creatorBps: z.number().int().min(0).max(10000),
    partnerBps: z.number().int().min(0).max(10000),
  }).refine((f) => f.creatorBps + f.partnerBps === 10000, 'feeSplit must sum to 10000')
    .default({ creatorBps: 5000, partnerBps: 5000 }),
  fundraise: z.object({
    targetUsd: z.number().positive(),
    initialMarketCapUsd: z.number().positive().optional(),
    partnerLockedLpPct: z.number().int().min(0).max(100).default(50),
    partnerLpPct: z.number().int().min(0).max(100).default(0),
    creatorLockedLpPct: z.number().int().min(0).max(100).default(50),
    creatorLpPct: z.number().int().min(0).max(100).default(0),
    minContributionBaseUnits: z.string().regex(/^\d+$/).optional(),
    maxContributionBaseUnits: z.string().regex(/^\d+$/).optional(),
  }).refine((f) => f.partnerLockedLpPct + f.partnerLpPct + f.creatorLockedLpPct + f.creatorLpPct === 100,
    'LP percentages must sum to 100'),
}).strict();

// trade (P3-trade consumes)
export const tradeOrderSchema = z.object({
  amountInBase: z.string().regex(/^[1-9]\d*$/),
  inputMint: z.enum(['USDC']).optional(),
  slippageBps: z.number().int().min(1).max(5000).default(50),
});
export const tradeSubmitSchema = z.object({
  intentId: z.string().uuid(),
  transaction: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

// fee-claim admin (P3-feeclaim consumes)
export const feeClaimSchema = z.object({
  tokenId: z.string().uuid().optional(),
  mint: z.string().optional(),       // route also runs isValidMint when present
}).strict();

// vesting (P3-vesting consumes)
export const vestingCreateSchema = z.object({
  kind: z.enum(['vesting', 'lock']).default('vesting'),
  tokenId: z.string().uuid(),
  mint: z.string(),
  recipient: z.string(),
  amountBase: z.string().regex(/^[1-9]\d*$/),
  cliffAmountBase: z.string().regex(/^\d+$/).default('0'),
  startAt: z.number().int(),
  cliffAt: z.number().int(),
  endAt: z.number().int(),
  unlockEvery: z.number().int().positive(),
}).refine((v) => v.cliffAt >= v.startAt, 'cliffAt must be >= startAt')
  .refine((v) => v.endAt > v.cliffAt, 'endAt must be > cliffAt')
  .refine((v) => (v.endAt - v.cliffAt) % v.unlockEvery === 0, 'endAt-cliffAt must be a multiple of unlockEvery');
export const vestingWithdrawSchema = z.object({ amountBase: z.string().regex(/^[1-9]\d*$/).optional() });
```

---

## (f) Cross-module data contracts (BINDING)

### f.1 `FeeEvent` type/recipient/mint pairing (restated; reader unchanged, writers conform)

| `type` | `recipient` | `recipientWallet` | `amountMint` | Written by |
|---|---|---|---|---|
| `PARTNER_TRADING_FEE` | `PLATFORM` | `feeConfig.feeClaimer` (Momento) | quote (USDC) | fee-claim |
| `CREATOR_TRADING_FEE` | `CREATOR` | `feeConfig.creatorFeeWallet` | quote (USDC) | fee-claim |
| `LOCKED_LP_FEE` | `PLATFORM` **or** `CREATOR` (by NFT owner) | partner/creator wallet | base or quote | fee-claim |
| `CLAIMED` | matches swept leg | sweep destination | claimed mint | fee-claim (audit/idempotency; NOT in reader filter) |
| `TRANSFER_FEE_WITHHELD` | `PROTOCOL` | — | creator-token mint | webhook (Phase 2) |
| `REBATE` | `TRADER` | `trade.traderWallet` | `rebateMint` (USDC) | cron recon (Phase 2) / fee-claim pays |

Idempotency: on-chain rows set `signature`; off-chain set `internalRef`. NEVER both. Accrual `internalRef`
= `${tokenId}:${recipient}:${type}:${claimSignature}`; rebate `internalRef` = `${tradeId}:TRADER:REBATE`.

### f.2 Launch bakes → graduation realizes
Launch SETS on `TokenFundraise`: `partnerLpBps, creatorLpBps, partnerLockedLpBps, creatorLockedLpBps`
(sum=10000 across legs per LP-pct mapping), `migrationFeeBps`, `leftoverReceiver`, `thresholdBaseUnits`
(= USDC base units of `targetUsd`), AND bakes the SAME `*LpBps`/`leftoverReceiver`/`migrationFee` into the
DBC config. Graduation reads `TokenFundraise.migrationFeeBps` → `DAMM_V2_MIGRATION_FEE_ADDRESS` tier and
records the two `LpPosition` rows. Graduation does NOT choose the split.

### f.3 Trade ↔ webhook ↔ rebate loop
`lib/trade.ts` writes `Trade {intentId, source:IN_APP, signature:null}` pre-signature →
`submitTrade` patches `{signature, blockTime}` → committed `helius-webhook.ts` classifies on `signature`
→ committed `cron/fee-claim` recon reclassifies EXTERNAL→IN_APP on signature match (enable `INTENT_RECON=1`
once trade ships) → `lib/fee-claim.ts` `runRebateSweep` pays `source=IN_APP, rebatePaid=false`.

### f.4 Hard dependencies (build cannot run live without)
Fee-claim ⇐ launch (`feeConfig.{feeClaimer,creatorFeeWallet,withdrawWithheldAuthority}`, `dbcPoolAddress`,
`quoteMint`) + graduation (two `LpPosition` rows). Trade ⇐ launch (`status`, `dbcPoolAddress`, `feeConfig`)
+ graduation (`status=GRADUATED`, DAMM v2 pool). Vesting ⇐ launch (mint/decimals/feeConfig).

---

## (g) New env vars + shared constants (owner `P3-foundation`)

### g.1 Env vars (add to `apps/api/.env.local.example`)
| Var | Used by | Purpose | Default |
|---|---|---|---|
| `FEE_CLAIM_ENABLED` | P3-feeclaim | gate `runClaimSweep` in cron | `0` (off) |
| `REBATE_SEND_ENABLED` | P3-feeclaim | gate `runRebateSweep` in cron | `0` (off) |
| `REBATE_LEGAL_APPROVED` | P3-feeclaim | compliance gate for prod rebate sends (BLOCKING) | `0` (off) |
| `FEE_CLAIM_BATCH` | P3-feeclaim | tokens per claim sweep | `25` |
| `REBATE_BATCH` | P3-feeclaim | rebates per sweep | `50` |
| `INTENT_RECON` | P3-feeclaim/trade | enable EXTERNAL→IN_APP recon (set on once trade ships) | `0` |
| `GRADUATION_LEASE_TTL_MS` | P3-graduation | `finalizeStartedAt` lease TTL | `600000` (10 min) |
| `VESTING_FORCE_CLIENT_COSIGN` | P3-vesting | force client fallback after devnet proves Privy strips | unset |

Reused (already present): `MOMENTO_LP_FEE_CLAIMER`, `MOMENTO_CREATOR_FEE_PCT`, `MOMENTO_REBATE_USDC_VAULT`,
`PRIVY_AUTHORIZATION_KEY`, `PRIVY_SERVER_WALLET_ID`, `SOLANA_RPC_URL`, `SOLANA_NETWORK`,
`HELIUS_SENDER_URL`, `JITO_TIP_LAMPORTS`, `CRON_SECRET`, `UPSTASH_REDIS_REST_*`, `HELIUS_API_KEY`,
`JUP_LOCK_*` (vesting Jupiter Lock program/IDL).

### g.2 Shared constants (add to `packages/shared/src/constants.ts`, after `MOMENTO_FEE`)
```ts
export const MOMENTO_LAUNCH = {
  DEFAULT_TOTAL_SUPPLY: '1000000000',
  DEFAULT_DECIMALS: 9,
  DEFAULT_PARTNER_LOCKED_LP_PCT: 50,
  DEFAULT_CREATOR_LOCKED_LP_PCT: 50,
  DEFAULT_INITIAL_MARKET_CAP_USD: 100,
  DEFAULT_MIGRATION_FEE_BPS: 100,        // 1% graduated-pool swap fee
} as const;
export const MOMENTO_TRADE = {
  DEFAULT_SLIPPAGE_BPS: 50,
  MAX_SLIPPAGE_BPS: 5000,
  DEFAULT_COMPUTE_UNIT_LIMIT: 200_000,   // devnet-measured constant TODO(verify-devnet)
} as const;
export const MOMENTO_CLAIM = {
  DEFAULT_FEE_CLAIM_BATCH: 25,
  DEFAULT_REBATE_BATCH: 50,
} as const;
```

### g.3 New package deps (added by the consuming module, declared here)
`@meteora-ag/dynamic-bonding-curve-sdk@1.5.10` (launch, trade, graduation, fee-claim),
`@meteora-ag/cp-amm-sdk@1.4.3` (trade, graduation, fee-claim),
`@streamflow/stream@12.4.0` + `@coral-xyz/anchor` + pinned Jupiter Lock IDL (vesting). All web3.js v1.

---

## (h) Build order

1. **`P3-foundation` FIRST** (blocks everyone): migration applied + Prisma client regenerated, all Zod
   schemas exported, `helius-webhook.ts` increment, constants/env/vercel.json.
2. **Then all five module tasks IN PARALLEL** — they share NO file and depend only on the committed Phase-2
   surface + P3-foundation's outputs (schemas/constants/generated client). `P3-launch`, `P3-trade`,
   `P3-graduation`, `P3-feeclaim`, `P3-vesting` can run concurrently.
3. **Runtime/integration ordering** (not a build dependency, a data dependency): launch produces tokens →
   trade/graduation operate on them → fee-claim sweeps graduated tokens → vesting consumes launch outputs.
   Code compiles independently; live behavior follows this chain.
