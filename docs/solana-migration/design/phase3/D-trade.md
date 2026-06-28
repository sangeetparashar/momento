# D-trade — Phase 3A In-App Trading + Token Detail (`lib/trade.ts` + buy/sell/detail endpoints)

> **Status:** DESIGN ONLY. No code beyond this doc. Builds on **committed Phase 2**.
> **Module owner:** T-trade. **Solana-only. `@solana/web3.js` v1.**
>
> **Reuses (import-only, never edits):**
> - `apps/api/lib/solana/*` — `buildUnsignedForClient`, `submitClientSigned`, `getConnection`,
>   `SolanaTxError`, `classify`, `clientRelaySigner`, types (`BuiltTx`, `SubmitResult`).
> - `apps/api/lib/fees.ts` — `computeRebate`, `calcFee`, `rebateToUsdc`.
> - `packages/shared` — `MOMENTO_FEE` (USDC mint/decimals, target/transfer bps, token-2022 id).
> - `apps/api/lib/auth.ts` — `requireAuth`, `getWalletForChain`.
> - `apps/api/lib/ratelimit.ts` — `swapLimiter`, `readLimiter`, `applyRateLimit`.
> - `apps/api/lib/validation.ts` — `validateBody`, `isValidMint` (+ new schemas, §6).
> - `apps/api/lib/prisma.ts` — default `prisma`.
>
> **Ground truth for SDK signatures:** `scripts/spikes/spike-b-meteora-dbc.ts` (DBC `client.pool.swap` /
> `client.pool.swapQuote`; cp-amm `getQuote` / `swap`). REUSE EXACT signatures.
>
> **Contract anchors:** `phase2/D-api.md §3.1–3.2` (buy/sell/detail shapes), `phase2/CONTRACTS.md §a.5`
> (`Trade`), `phase2/D-fees.md §2.2` (IN_APP classification via `intentId`/`signature`), `phase2/SPEC.md §73`
> (DBC→DAMM v2 graduation).

---

## 0. Cross-cutting decisions (TL;DR)

1. **Client-signed, backend self-submit, for USER actions** (LOCKED). Backend builds the UNSIGNED Meteora
   swap tx (`buildUnsignedForClient`); the mobile app signs via the Privy embedded wallet; backend
   self-submits via `submitClientSigned`. The user is `feePayer` (resolved automatically by `submit.ts`
   from the `clientRelaySigner`). Two-call shape: **`POST /buy|/sell` builds + persists the intent**, then a
   **`POST /buy|/sell/submit`** relays the signed tx. (Rationale + alternative in §3.4.)

2. **`intentId` closes the Phase 2 deferred gap.** The instant WE build a swap tx (before any signature
   exists) we persist a `Trade` row with `intentId` set and `source = IN_APP`, `signature = null`,
   `blockTime = null`. On submit we patch `signature`/`blockTime`. The Helius webhook
   (`lib/helius-webhook.ts`) then joins on `signature`: a hit confirms the **IN_APP** row (so the rebate
   cron pays it), a miss inserts an **EXTERNAL** row. This is the exact mechanic of D-fees §2.2; this module
   is the first producer of `intentId`.

3. **Venue selection = curve vs pool.** Pre-graduation the token trades on the **DBC bonding curve**
   (`venue = METEORA_DBC`, swap via `client.pool.swap`); post-graduation it trades on the **DAMM v2 pool**
   (`venue = METEORA_DAMM_V2`, swap via `cpAmm.swap`). Selection is driven by `CreatorToken.status`
   (`GRADUATED` ⇒ DAMM v2) corroborated by the presence of `dbcPoolAddress` vs a DAMM v2 pool address. (§2.)

4. **User nets ~1%.** The Token-2022 transfer fee (default 400 bps) is charged on-chain on every transfer
   and is venue-blind. The ~1% effective rate is achieved **off the token** by recording the owed rebate
   (`computeRebate` → `rebateBaseUnits`/`rebateMint`) at build time. **This module records the rebate; it
   does NOT send it** — the rebate-execution module (Phase 4 cron) pays `rebatePaid=false` rows. Default
   `rebateMint = USDC` (fee-exempt, no gross-up).

5. **Quote/price source.** The on-chain swap **quote** comes from the Meteora SDK sync helpers
   (`client.pool.swapQuote` for DBC, `cpAmm.getQuote` for DAMM v2) — this is the authority for
   `expectedOutBase` and `minOut`. The **USD price** (`priceUsd`, display + rebate true-up) comes from
   `lib/helius.ts` DAS `price_info` / oracle, snapshotted with `priceTs` on the `Trade`.

6. **Money = base-unit strings at every boundary; bigint in the math layer.** USD/display = number; bps =
   number. (CONTRACTS §e.)

7. **MEV/priority.** Client-relay path is forced to RPC route (no Jito tip — `submitClientSigned` forces
   `route='rpc'`). Slippage `minOut` is the primary MEV guard. Priority fee is the Helius per-tx estimate
   baked into the budget ixs by `buildUnsignedForClient`. (§7.)

---

## 1. `lib/trade.ts` — interface (paste-ready)

> File: `apps/api/lib/trade.ts` (CREATE). Owned by T-trade. Import-safe (env/network only inside fns).

```ts
import type { BuiltTx, SubmitResult } from '@/lib/solana';
import { PoolType, TradeSide } from '@momento/shared';

// ── Venue resolution ────────────────────────────────────────────────────────

export type TradeVenue = 'METEORA_DBC' | 'METEORA_DAMM_V2';

export interface ResolvedToken {
  tokenId: string;
  mint: string;                    // base mint (creator token)
  decimals: number;
  tokenProgram: 'TOKEN_2022' | 'TOKEN_CLASSIC';
  quoteMint: string;               // USDC by default
  venue: TradeVenue;               // curve (pre-grad) | pool (post-grad)
  poolAddress: string;             // DBC virtual pool OR DAMM v2 pool
  transferFeeBps: number;          // Token-2022 transfer fee (feeConfig ?? token ?? default)
  transferFeeMaxBaseUnits: bigint; // 0 = uncapped
  rebateTargetBps: number;         // ~100
  rebateMint: string;              // USDC; NEVER the creator token
}

/**
 * Resolve a mint to its trade venue + fee config. Reads CreatorToken (+ feeConfig).
 * Venue = METEORA_DAMM_V2 iff status === 'GRADUATED' (or a DAMM v2 pool address is set);
 * else METEORA_DBC using dbcPoolAddress. Throws TradeError('TOKEN_NOT_TRADEABLE') if the
 * token is not ACTIVE/GRADUATED or has no resolvable pool.
 */
export function resolveTradeVenue(mint: string): Promise<ResolvedToken>;

// ── Quote ───────────────────────────────────────────────────────────────────

export interface QuoteInput {
  token: ResolvedToken;
  side: TradeSide;                 // BUY = quote→base ; SELL = base→quote
  amountInBaseUnits: bigint;       // base units of the INPUT mint
  slippageBps: number;             // 1..5000, default 50
  priceUsd?: number;               // DAS/oracle snapshot (rebate true-up); fetched if absent
}

export interface TradeQuote {
  venue: TradeVenue;
  inputMint: string;
  outputMint: string;
  amountInBaseUnits: string;
  expectedOutBaseUnits: string;    // from SDK swapQuote/getQuote
  minOutBaseUnits: string;         // expectedOut * (1 - slippageBps/10_000), floor
  priceUsd: number;                // display
  priceTs: string;                 // ISO; snapshot time for rebate true-up
  // fee disclosure (mobile tax row)
  transferFeeBaseUnits: string;    // chargedFee = calcFee(gross, transferFeeBps, max)
  feeBps: number;                  // transferFeeBps
  rebateBaseUnits: string;         // computeRebate().rebateOwedNet → rebateToUsdc(...)
  rebateMint: string;              // USDC
  effectiveFeeBps: number;         // ~100 after rebate (disclosure)
}

/**
 * Build a swap quote from the live curve/pool state via the Meteora SDK sync
 * helper (DBC client.pool.swapQuote | DAMM cpAmm.getQuote). Computes minOut from
 * slippageBps and the owed rebate from fees.ts (computeRebate → rebateToUsdc).
 * Pure read — no DB writes, no tx build.
 */
export function getTradeQuote(input: QuoteInput): Promise<TradeQuote>;

// ── Build (unsigned, client-signed flow) ─────────────────────────────────────

export interface BuildTradeInput {
  token: ResolvedToken;
  side: TradeSide;
  userId: string;
  traderWallet: string;            // user's Solana wallet (feePayer + swap owner)
  amountInBaseUnits: bigint;
  slippageBps: number;
  quote: TradeQuote;               // re-validated server-side; never trust client quote
}

export interface BuiltTrade {
  intentId: string;                // = Trade.intentId (uuid); set BEFORE signature exists
  tradeId: string;                 // Trade.id
  built: BuiltTx;                  // hand to buildUnsignedForClient
  quote: TradeQuote;
}

/**
 * Build the UNSIGNED Meteora swap tx and PERSIST the Trade intent atomically:
 *   1. Build the venue swap ix (DBC client.pool.swap | DAMM cpAmm.swap) with
 *      owner=traderWallet, amountIn, minimumAmountOut=minOut.
 *   2. Wrap as BuiltTx { tx, signers:[clientRelaySigner(traderWallet)], label:'trade.buy|sell',
 *      computeUnitLimit }. feePayer/blockhash are filled by buildUnsignedForClient.
 *   3. Persist Trade { intentId (uuid), source: IN_APP, venue, side, userId, traderWallet,
 *      amountIn*, amountOut* (expected), priceUsd, priceTs, transferFeeBaseUnits, feeBps,
 *      rebateBaseUnits, rebateMint, rebatePaid:false, poolAddress, signature:null, blockTime:null }.
 * The Trade row is the IN_APP intent the webhook later joins on `signature`.
 */
export function buildTrade(input: BuildTradeInput): Promise<BuiltTrade>;

// ── Submit (relay step 2) ────────────────────────────────────────────────────

export interface SubmitTradeInput {
  intentId: string;
  txBase64: string;                // client-signed
  idempotencyKey: string;          // opaque blob from buildUnsignedForClient (round-tripped)
}

export interface SubmitTradeResult {
  intentId: string;
  signature: string;
  venue: TradeVenue;
  status: 'CONFIRMED' | 'PENDING';
  deduped: boolean;
}

/**
 * Self-submit the client-signed tx (submitClientSigned, route forced to 'rpc'),
 * then patch the Trade { signature, blockTime } so the webhook classifies it IN_APP
 * and the rebate cron pays it. Idempotent: a re-submit of the same intent/signature
 * returns the existing row (Trade.signature @unique + idempotency store).
 */
export function submitTrade(input: SubmitTradeInput): Promise<SubmitTradeResult>;

// ── Token detail ─────────────────────────────────────────────────────────────

export interface TokenDetail {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  decimals: number;
  totalSupply: string;
  circulatingSupply: string;
  status: string;                  // ACTIVE | GRADUATED | …
  venue: TradeVenue;               // curve vs pool (drives the trade route)
  poolType: PoolType | null;
  poolAddress: string | null;
  priceUsd: number;
  marketCapUsd: number;
  transferFeeBps: number;
  feeConfig: { creatorBps: number; momentoBps: number; rebateTargetBps: number; rebateMint: string };
  fundraise: {                     // present pre-graduation (DBC curve progress)
    status: string;
    raisedBaseUnits: string;
    thresholdBaseUnits: string;
    progressPct: number;           // raised/threshold * 100, clamped 0..100
    quoteMint: string;
  } | null;
  creator: { id: string; username: string | null; verified: boolean };
  graduatedAt: number | null;      // unix seconds
}

/** GET /api/tokens/[mint] read model: price + fundraise progress + fee config + venue. */
export function getTokenDetail(mint: string): Promise<TokenDetail | null>;

// ── Errors ───────────────────────────────────────────────────────────────────

export type TradeErrorCode =
  | 'TOKEN_NOT_FOUND' | 'TOKEN_NOT_TRADEABLE' | 'VENUE_UNRESOLVED'
  | 'QUOTE_STALE' | 'SLIPPAGE' | 'AMOUNT_INVALID' | 'WALLET_NOT_READY';
export class TradeError extends Error { code: TradeErrorCode; }
```

---

## 2. Venue selection (curve vs pool) — the core routing decision

`resolveTradeVenue(mint)` reads `CreatorToken` (+ `feeConfig`) and picks exactly one venue:

| Condition (in order) | `venue` | Pool address source | Swap call |
|---|---|---|---|
| `status === 'GRADUATED'` (or a DAMM v2 pool address is recorded) | `METEORA_DAMM_V2` | DAMM v2 pool (LpPosition.poolAddress / token.poolAddress) | `cpAmm.swap` (cp-amm-sdk) |
| `status === 'ACTIVE'` with `dbcPoolAddress` set | `METEORA_DBC` | `CreatorToken.dbcPoolAddress` | `client.pool.swap` (DBC sdk) |
| neither | throw `TradeError('TOKEN_NOT_TRADEABLE')` | — | — |

- **Single source of truth = `CreatorToken.status`.** The launch/graduation module (not this module) flips
  `status` to `GRADUATED` and writes the DAMM v2 pool address + `graduatedAt` when Meteora migrates the
  curve. We READ that state and never infer venue from on-chain reserves.
- The same resolution drives both the quote and the build, so a token that graduates between quote and build
  is caught by the `QUOTE_STALE` re-validation in `buildTrade` (the venue on the persisted quote must match
  the freshly resolved venue, else rebuild).
- SDK signatures are taken VERBATIM from `spike-b`: DBC `client.pool.swap({ owner, pool, amountIn:BN,
  minimumAmountOut:BN, swapBaseForQuote, referralTokenAccount:null, payer })` and the sync
  `client.pool.swapQuote(...)`. `swapBaseForQuote=false` ⇒ BUY (quote/USDC → base/token);
  `=true` ⇒ SELL. DAMM v2 uses `cpAmm.getQuote(...)` + `cpAmm.swap(...)` (cp-amm 1.4.3; exact param shape
  re-verified against the installed SDK `.d.ts` before coding — `spike-b` flags these as minor-version
  sensitive).

---

## 3. Endpoints

> Envelope `{ success, data | error }`. Handler skeleton mirrors `wallet/swap`: `applyRateLimit` →
> `requireAuth` → `isValidMint` guard → validate → work → `{ success:true, data }`; `catch` re-throws
> `Response` (auth/validation) then 500. Next 15 async params: `{ params }: { params: Promise<{ mint }> }`.

### 3.1 `GET /api/tokens/[mint]` — token detail (Public)

**Auth:** Public. **Limiter:** `readLimiter`. **Lib:** `getTokenDetail` (+ `lib/helius.ts` price).
**Route:** `app/api/tokens/[mint]/route.ts` (CREATE).

```jsonc
// 200 — extends D-api §3.1 with venue + fee config + fundraise progress
{ "success": true, "data": {
  "mint": "Hxk…", "name": "Deel Token", "symbol": "DEEL", "imageUrl": "…",
  "decimals": 9, "totalSupply": "1000000000", "circulatingSupply": "120000000",
  "status": "ACTIVE", "venue": "METEORA_DBC", "poolType": "METEORA_DBC", "poolAddress": "…",
  "priceUsd": 0.0042, "marketCapUsd": 504000, "transferFeeBps": 400,
  "feeConfig": { "creatorBps": 200, "momentoBps": 200, "rebateTargetBps": 100, "rebateMint": "EPjF…" },
  "fundraise": { "status": "ACTIVE", "raisedBaseUnits": "3200000000", "thresholdBaseUnits": "5000000000",
                 "progressPct": 64, "quoteMint": "EPjF…" },
  "creator": { "id": "usr_…", "username": "deel", "verified": true },
  "graduatedAt": null } }
// 400 invalid mint | 404 { "success": false, "error": "Token not found" }
```
`fundraise` is non-null only pre-graduation (reads `TokenFundraise`). Post-graduation `venue` =
`METEORA_DAMM_V2`, `fundraise` = null, `graduatedAt` set.

### 3.2 `POST /api/tokens/[mint]/buy` — build buy (User)

**Auth:** `requireAuth` (User). **Limiter:** `swapLimiter` (5/min — tighter than write; per D-api §3.2).
**Lib:** `lib/trade.ts`. **Route:** `app/api/tokens/[mint]/buy/route.ts` (CREATE).
Wallet gate: `getWalletForChain(user)` null / `pending-` ⇒ `400 "Wallet not ready"`.

```jsonc
// req (Zod tradeOrderSchema)
{ "amountInBase": "5000000", "inputMint": "USDC", "slippageBps": 50 }
// res — build + persisted intent (extends D-api §3.2 with intentId + venue)
{ "success": true, "data": {
  "intentId": "tr_…",
  "transaction": "<base64-unsigned>",
  "idempotencyKey": "v1:…",            // opaque; round-trip to /buy/submit
  "venue": "METEORA_DBC",
  "quote": { "expectedOutBase": "1190000000", "minOutBase": "1184050000",
             "priceUsd": 0.0042, "priceTs": "2026-06-24T00:00:00Z",
             "feeBase": "200000", "feeBps": 400, "effectiveFeeBps": 100,
             "inAppRebateBase": "150000", "rebateMint": "EPjF…" } } }
```
For BUY, `inputMint` is the quote mint (USDC); output is the creator token. (`SOL` input is rejected in
Phase 3A — USDC-quoted launches only; documented limitation.)

### 3.3 `POST /api/tokens/[mint]/sell` — build sell (User)

Mirror of buy. **Limiter:** `swapLimiter`. `inputMint` = creator token; output = USDC. Same `quote` block;
the `effectiveFeeBps` (~100 in-app vs the full `feeBps`/external ~10x) is surfaced for the mobile
tax-disclosure row (D-api §3.2). `swapBaseForQuote=true`.

### 3.4 `POST /api/tokens/[mint]/{buy,sell}/submit` — relay the client-signed tx (User)

**Auth:** `requireAuth`. **Limiter:** `swapLimiter`. **Lib:** `submitTrade`.
**Route:** `app/api/tokens/[mint]/buy/submit/route.ts` + `.../sell/submit/route.ts` (CREATE).

```jsonc
// req { "intentId": "tr_…", "transaction": "<base64-client-signed>", "idempotencyKey": "v1:…" }
// res { "success": true, "data": { "intentId": "tr_…", "signature": "3pQ…",
//        "venue": "METEORA_DBC", "status": "CONFIRMED", "deduped": false } }
```

**Why two calls (build then submit).** The Privy embedded wallet signs on the client; the backend must
self-submit (Privy cannot point at our Helius RPC — LOCKED). `buildUnsignedForClient` returns the unsigned
tx + an opaque `idempotencyKey` blob (carries the real key + `lastValidBlockHeight` + applied priority fee);
the client signs and round-trips both back. The submit handler verifies the `intentId` belongs to the
authed user, then calls `submitClientSigned`. **Alternative considered:** a single call where the client
posts the signed tx with the order — rejected because the intent (and `intentId`) MUST be persisted before
the signature exists (D-fees §2.2 race handling), so the build step is a distinct write.

---

## 4. How `intentId` / classification closes the Phase 2 gap

1. **Build (`buildTrade`):** persist `Trade { intentId: uuid, source: IN_APP, signature: null,
   blockTime: null, … }` in the same transaction that returns the unsigned tx. The intent now exists
   **before** any signature.
2. **Submit (`submitTrade`):** `submitClientSigned` lands the tx; we patch the same row
   `{ signature, blockTime }` (and `status` confirmed). `Trade.signature @unique` is the on-chain
   idempotency key.
3. **Webhook (`lib/helius-webhook.ts`, unchanged):** on the swap delivery it does
   `prisma.trade.findUnique({ where: { signature } })`. **Hit** ⇒ existing IN_APP row (it sets `blockTime`
   and writes the `TRANSFER_FEE_WITHHELD` `FeeEvent` with `source = IN_APP`). **Miss** ⇒ inserts a new
   `EXTERNAL` Trade. So setting `intentId` + patching `signature` is exactly what makes the webhook see this
   as IN_APP.
4. **Race (webhook before our `signature` patch):** webhook inserts an EXTERNAL row first; the rebate/recon
   cron re-classifies any EXTERNAL Trade whose `signature` later matches a Momento `intentId` to IN_APP and
   enqueues the rebate (D-fees §2.2). Our build writes `intentId`; the recon join uses it. We never write a
   second row — `Trade.signature @unique` + the `intentId @unique` constraint dedupe.
5. **Rebate handoff:** at build we record `rebateBaseUnits` (from `computeRebate(...).rebateOwedNet` →
   `rebateToUsdc(...)`), `rebateMint = USDC`, `rebatePaid = false`, `priceUsd`/`priceTs`. The
   **rebate-execution module** (Phase 4 cron) pays `source=IN_APP, rebatePaid=false` rows. This module
   computes + records only — no USDC send here (locked module boundary).

---

## 5. Quote, price, slippage / minOut

- **On-chain quote = SDK sync helper** (`client.pool.swapQuote` / `cpAmm.getQuote`) against live
  curve/pool state. This is the authority for `expectedOutBase`.
- **minOut (slippage guard):** `minOut = floor(expectedOut * (10_000 - slippageBps) / 10_000)` in bigint.
  Passed as `minimumAmountOut` to the swap ix — the on-chain swap reverts if the realized output is below
  it. `slippageBps` default 50, validated 1..5000.
- **USD price** (`priceUsd`) from `lib/helius.ts` DAS `price_info`/oracle, snapshotted with `priceTs` on the
  Trade so the rebate cron can true-up against fill price (fees.ts `rebateToUsdc` takes the token→USDC
  price; `priceTs` bounds snapshot drift — D-fees §3.2).
- **Quote freshness:** `buildTrade` re-runs the quote server-side and re-resolves the venue; it never trusts
  a client-supplied quote. If the freshly resolved venue differs from the quoted venue, or recomputed minOut
  drifts beyond a tolerance, throw `QUOTE_STALE` (client re-quotes).

## 6. Validation, auth, rate limit, idempotency

- **Schemas** (add to `apps/api/lib/validation.ts` — `tradeOrderSchema`, `tradeSubmitSchema`):
  ```ts
  export const tradeOrderSchema = z.object({
    amountInBase: z.string().regex(/^[1-9]\d*$/),   // positive base-unit integer string
    inputMint: z.enum(['USDC']).optional(),          // BUY=USDC; SELL ignores (uses token mint)
    slippageBps: z.number().int().min(1).max(5000).default(50),
  });
  export const tradeSubmitSchema = z.object({
    intentId: z.string().uuid(),
    transaction: z.string().min(1),                  // base64 client-signed
    idempotencyKey: z.string().min(1),               // opaque relay blob
  });
  ```
  Use `validateBody(schema, body)`; route-param `isValidMint(mint)` guard before any DB/cache.
- **Auth:** all four trade endpoints `requireAuth` (User). `submitTrade` additionally asserts the
  `Trade.userId === user.id` (a user may only submit their own intent) → else `403`.
- **Rate limit:** `swapLimiter` (5/min) on buy/sell/submit; `readLimiter` on detail. IP-keyed before auth
  (repo convention).
- **Idempotency:** the solana layer is the durable guard — `submitClientSigned` reserves on the carried key
  via the Redis idempotency store; `Trade.signature @unique` + `Trade.intentId @unique` dedupe at the DB.
  A retried submit of the same intent returns the existing signature (`deduped:true`). Client path forces
  `route='rpc'` (no `privy-server` signer ⇒ no fail-closed durable-store requirement for the broadcast
  itself, but Redis is used for at-most-once when configured).

## 7. MEV / priority notes

- **Slippage `minOut` is the primary MEV protection** — a sandwich that pushes price past tolerance reverts
  the swap on-chain.
- **Route:** client-relay path is **forced to `rpc`** by `submitClientSigned` (a client-built tx carries no
  Jito tip; Helius Sender would reject it). No Jito bundle on user swaps in Phase 3A.
- **Priority fee:** the Helius per-tx estimate is baked into the compute-budget ixs by
  `buildUnsignedForClient` (carried in the opaque key, reported on `SubmitResult`). No per-request override
  needed.
- **`computeUnitLimit`:** set on the `BuiltTx` (Meteora swaps fit comfortably under ~200k CU; provide a
  tested constant since `submit.ts` does not yet simulate — see its TODO). Re-verify against a devnet swap.

## 8. Persistence summary (`Trade` fields this module sets)

| Field | Set at build | Set at submit | Set by webhook/cron |
|---|---|---|---|
| `intentId` | uuid | — | — |
| `source` | `IN_APP` | — | (recon may reclassify EXTERNAL→IN_APP) |
| `venue` | DBC \| DAMM_V2 | — | — |
| `side` | BUY \| SELL | — | — |
| `userId` / `traderWallet` | yes | — | — |
| `amountIn*` / `amountInMint` | yes | — | — |
| `amountOut*` / `amountOutMint` | expected (from quote) | — | (true-up from chain optional) |
| `priceUsd` / `priceTs` | yes (snapshot) | — | — |
| `transferFeeBaseUnits` / `feeBps` | computed | — | webhook re-derives authoritative |
| `rebateBaseUnits` / `rebateMint` / `rebatePaid` | yes / USDC / false | — | rebate cron sets `rebatePaid`,`rebateSignature` |
| `poolAddress` | yes | — | — |
| `signature` | null | yes | (EXTERNAL path sets it) |
| `blockTime` | null | yes (on confirm) | webhook sets authoritative |

## 9. Cross-module dependencies

- **Consumes (read/import only):** `lib/solana/*` (build/submit/connection/errors), `lib/fees.ts`
  (`computeRebate`/`calcFee`/`rebateToUsdc`), `packages/shared` `MOMENTO_FEE`, `lib/auth.ts`,
  `lib/ratelimit.ts`, `lib/validation.ts`, `lib/prisma.ts`, `lib/helius.ts` (USD price).
- **Edits:** `apps/api/lib/validation.ts` (add `tradeOrderSchema`, `tradeSubmitSchema`).
- **Depends on (other Phase 3 modules):** the **launch/graduation module** owns writing
  `CreatorToken.status=GRADUATED`, the DAMM v2 pool address, `dbcPoolAddress`, `quoteMint`, and
  `TokenFeeConfig` — this module READS them for venue + fee resolution.
- **Hands off to:** the **rebate-execution module** (Phase 4) which pays `IN_APP, rebatePaid=false` Trades;
  the **Helius webhook** (`lib/helius-webhook.ts`, committed) which classifies via `signature`. This module
  is the producer of the `intentId`/IN_APP `Trade` rows both depend on.
- **New SDK deps** (already validated in `spike-b`): `@meteora-ag/dynamic-bonding-curve-sdk@1.5.10`,
  `@meteora-ag/cp-amm-sdk@1.4.3` (both web3.js v1).

## 10. Open items / risks

1. **SDK param shapes** for `swapQuote`/`getQuote`/`cpAmm.swap` are minor-version sensitive (`spike-b`
   TODOs) — re-verify against the installed `.d.ts` before coding.
2. **`computeUnitLimit`** constant needs a devnet-measured value (submit.ts has no simulation yet).
3. **SOL-input buys** deferred — USDC-quoted only in 3A.
4. **DAMM v2 pool-address discovery** post-graduation: prefer the launch module persisting it on the token /
   `LpPosition`; fall back to `cpAmm.getPositionsByUser`/derive only if absent.
