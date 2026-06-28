# 05 — Token / Fee / Liquidity / On-Chain Baseline Audit

**Scope:** Audit of ALL existing token, fee, liquidity, and on-chain code to establish the current baseline before the all-in Solana plan (token launches, threshold fundraising LP with configurable splits, in-app vs. elsewhere tax, vesting, Meteora/Bags).

**Bottom line:** The ONLY on-chain economics actually shipped today is a **4% trading fee on swaps** (Jupiter on Solana, KyberSwap on Base), taken from the output token and routed to a single fee wallet per chain. Everything else — token minting, bonding curves, LP creation, LP-fee capture, creator splits, tax tiers, vesting, threshold fundraising — is **NOT built**. It exists only as a dormant DB schema (`CreatorToken`) and a prior design doc (`docs/lp-trading-fees-design.html`).

---

## 1. The fee model that EXISTS today (trading fee, both chains)

A single env-var-driven platform fee, taken from the **output** token of every swap.

### Config (shared across both chains)
- `MOMENTO_PLATFORM_FEE_BPS` — default `400` (= **4%**). `apps/api/lib/jupiter.ts:39-41`, `apps/api/lib/base-swap.ts:48-50`.
- `MOMENTO_FEE_WALLET` — Solana fee sink. `apps/api/lib/jupiter.ts:43-45`.
- `BASE_FEE_WALLET` — Base (EVM) fee sink. `apps/api/lib/base-swap.ts:52-54`.
- `.env.local.example:67-70` documents it: *"Platform fee in basis points (400 = 4%). Taken from output token on every swap."*
- `PLAN.md:128-129` lists `MOMENTO_FEE_WALLET` and `MOMENTO_PLATFORM_FEE_BPS` (default 400).

> Note: the design doc (`lp-trading-fees-design.html:135`) and code both say **4%** / `400` bps. Consistent. The header comment in `jupiter.ts:1-10` describes the fee but does not name a number; `create-fee-atas-send.ts:8,223` calls it "4%".

### Solana path — `apps/api/lib/jupiter.ts`
- Uses **Jupiter Swap API V1** (`lite-api.jup.ag/swap/v1` free, or `api.jup.ag` with `JUPITER_API_KEY`). `jupiter.ts:13-16`.
- File header states the intent: *"Momento keeps 100% of the fee (no Jupiter revenue share). The fee is taken from the output token and sent to MOMENTO_FEE_WALLET's associated token account."* (`jupiter.ts:1-10`).
- `getSwapQuote()` adds `platformFeeBps` to the quote query **only when a fee wallet is configured and not skipped** (`jupiter.ts:84-86`).
- `buildSwapTransaction()` derives the **fee wallet's ATA for the output mint** on-chain via PDA (`deriveATA`, `jupiter.ts:136-149`) and passes it as Jupiter's `feeAccount` (`jupiter.ts:171-181`).
- **Graceful degradation:** if the ATA can't be derived (e.g. native SOL output) or the swap build fails (e.g. ATA not yet created on-chain), it **re-quotes WITHOUT the platform fee** and proceeds feeless (`jupiter.ts:169-228`). So a swap to a token whose fee-ATA doesn't exist silently earns Momento $0.
- Hardcoded mints: `SOL`, `USDC` (`jupiter.ts:23-26`).

### Base path — `apps/api/lib/base-swap.ts`
- Uses **KyberSwap Aggregator** (replaced sunset 0x v1). Two-step: GET `/routes` then POST `/route/build`.
- Fee via KyberSwap query params: `chargeFeeBy=currency_out`, `feeAmount=<bps>`, `isInBps=true`, `feeReceiver=BASE_FEE_WALLET` (`base-swap.ts:163-170`). No-ops silently if `BASE_FEE_WALLET` unset.

### Route wiring — `apps/api/app/api/wallet/swap/route.ts`
- `GET` = quote, `POST` = build tx. Chain selected via `?chain=base|solana` (default solana). Solana POST builds against `user.walletAddress`; the client signs with the Privy embedded wallet and submits (jupiter.ts:118-121 describes this).

---

## 2. The fee wallet + ATA scripts (`scripts/create-fee-atas*.ts`)

Both scripts provision **Associated Token Accounts (ATAs) for ONE hardcoded Momento fee wallet** so Jupiter's `feeAccount` (the output-token ATA) exists on-chain and the 4% fee can actually land.

- **Fee wallet (hardcoded):** `5U29gHgfeY8rnLcttjcQVLba1KGub9YUt6MP4yDc55yD` (`create-fee-atas.ts:36-38`, `create-fee-atas-send.ts:36-38`).
- ATAs are **permissionless to create** — any wallet pays ~0.00204 SOL rent; no fee-wallet private key needed (`create-fee-atas.ts:10-12`, `:191-193`).
- Both build the **CreateIdempotent** instruction (index `1`) manually so re-runs are safe (`create-fee-atas.ts:87-105`).

### `create-fee-atas.ts` (build-only)
- Single mint: **wSOL** (`So111...112`), expected ATA `CnjifXnj2QpiNe693xKHoA5WbpL42SFYNAxwEjUJtyBq` (`:39-44`).
- Checks existence, then emits an **unsigned base64 tx** for external signing (Phantom / CLI). Does not submit.

### `create-fee-atas-send.ts` (build + sign + send)
- Loads a local keypair (`KEYPAIR_PATH`), batches ≤5 ATAs/tx, submits via `sendAndConfirmTransaction` (`:185-219`).
- Creates ATAs for **11 mints** so the 4% fee can be collected on ANY of these as swap output (`:46-60`): wSOL, USDC, USDT, BONK, JUP, WIF, PYTH, RAY, ORCA, RENDER.
- Closing line: *"The Momento platform will now collect 4% fees on swaps to these tokens."* (`:222-224`).

**Implied fee model:** Momento earns by inserting itself as Jupiter's referral/`platformFee` recipient. Revenue only accrues for output tokens whose fee-wallet ATA has been pre-created — hence the manual ATA-seeding scripts. Coverage is a fixed allowlist of 11 popular mints; arbitrary creator tokens would NOT collect a fee until their ATA is seeded (and jupiter.ts falls back to feeless).

---

## 3. Balances / prices — `apps/api/lib/helius.ts`

Read-only. No fee or LP logic.
- `getSolBalance()` via Helius RPC `getBalance` (`helius.ts:21-40`).
- `getTokenBalances()` via Helius **DAS `searchAssets`** (`tokenType: 'fungible'`), maps mint/symbol/amount/price/value (`helius.ts:45-96`); price from `token_info.price_info`.
- `fetchWalletBalance()` aggregates SOL + tokens; SOL price from **CoinGecko** free API (`helius.ts:101-138`).
- Network from `SOLANA_NETWORK` (default **`devnet`**) (`helius.ts:6-7`) — note: default is devnet, not mainnet.

---

## 4. Creator-token data model (migration `20260411100000_add_creator_token`)

A schema exists; **no code reads or writes it for launches.** The only file referencing `CreatorToken` outside the schema/types is `apps/api/app/api/feed/route.ts` (the `creatorTokens` relation), not a launch flow. No `deployToken`, `launchToken`, `createMint`, `claimPartner`, or `feeClaimer` anywhere in `apps/api`.

### Table `creator_tokens` (`migration.sql`, mirrored in `schema.prisma:198-226`, `packages/shared/src/types.ts:76-101`)
Columns: `id, userId, chain, name, symbol, description, imageUrl, mintAddress (unique), decimals (default 9), totalSupply (default '1000000000'), circulatingSupply (default '0'), poolAddress, poolType, bondingCurveParams (JSONB), status (default PENDING), deployTxSignature, deployedAt, graduatedAt, createdAt, updatedAt`.
Constraints: unique `mintAddress`; **unique `(userId, chain)`** (one token per creator per chain); indexes on `(chain,status)` and `symbol`.

### Enums
- `TokenStatus`: `PENDING, DEPLOYING, ACTIVE, FAILED, GRADUATED` (`migration.sql:2`, `types.ts:16-22`).
- `PoolType`: `BONDING_CURVE, RAYDIUM, AERODROME` (`migration.sql:5`, `types.ts:24-28`).
- `bondingCurveParams` typed as `{ slope, basePrice, reserveRatio }` (`types.ts:90-94`).

**Observation:** The schema already encodes the **pump.fun/Meteora bonding-curve → graduate-to-DEX lifecycle** (`GRADUATED`, `graduatedAt`, `BONDING_CURVE`, `RAYDIUM`). It is Solana-leaning by design but currently 100% inert. `defaults: 9 decimals, 1B supply` are Solana SPL conventions.

---

## 5. Constants / types — `packages/shared/src`

### `constants.ts`
- `CHAIN_CONFIG.solana`: USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, USDC decimals 6, SOL decimals 9, explorer Solscan (`constants.ts:11-22`).
- `CHAIN_CONFIG.base`: EVM USDC, Aerodrome/Base explorer (`constants.ts:23-33`).
- **No fee constants, no fee wallet addresses, no Meteora/launchpad constants** in shared. All fee config lives in API env vars only.

### `types.ts`
- `CreatorToken`, `TokenStatus`, `PoolType` interfaces (see §4).
- `SwapQuote.platformFee?: { amount, feeBps }` (`types.ts:212-222`) — the only fee field exposed to clients.
- No tax/vesting/LP-split types exist.

---

## 6. Prior design intent — `docs/lp-trading-fees-design.html` (drafted 2026-05-31)

This is the key prior-art doc to reconcile with the new plan. Summary of its **existing designed model**:

### Three fee "legs"
1. **Trading fee — 4% — BUILT, both chains.** `MOMENTO_PLATFORM_FEE_BPS=400` → per-chain fee wallet (lines 131-136). The doc explicitly says "Allow configuration for trading is already done" (line 152).
2. **LP / launchpad fee — NEW — not built.** The core of the design. Recommendation: **Solana + Meteora DBC (Dynamic Bonding Curve)** (lines 118-121).
3. **Onramp fee — 0% — deferred by design** (Privy widget path, no Bridge account) (lines 143-147).

### Recommended LP architecture (Meteora DBC) — source-verified figures in the doc
- Momento becomes the **partner** holding one **partner config key** (fee schedule + `creatorTradingFeePercentage` + migration target). Every creator launch inherits these terms (flow step 2, lines 317-318).
- **Fee split: partner (Momento) keeps 80%, Meteora protocol takes 20%** (`PROTOCOL_FEE_PERCENT = 20`), claimed via `claimPartnerTradingFee` → `fee_claimer` wallet (lines 140-141, 204-211, 320-322).
- Creator's cut is carved from Momento's 80% via `creatorTradingFeePercentage` (lines 207, 282).
- Lifecycle: bonding curve → graduate → **Meteora DAMM v2**, LP locked, partner + creator keep claiming (lines 208, 323-324). Maps 1:1 onto the `CreatorToken` `GRADUATED`/`bondingCurveParams` schema (line 169).
- SDK named: `@meteora-ag/dynamic-bonding-curve-sdk` (line 187).

### Proposed new config (NOT yet implemented)
- `MOMENTO_LP_FEE_CLAIMER` — Solana wallet registered as Meteora `fee_claimer` (lines 281).
- `MOMENTO_CREATOR_FEE_PCT` — % of partner share passed to creator (drives `creator_trading_fee_percentage`) (line 282).
- New `fee_events` table (additive raw SQL) to log every claim/accrual for accounting (lines 283, 322).

### Alternatives surveyed
- Solana: Raydium LaunchLab (#2; flat 0.25% Raydium tax, app-set `fee_rate` via `create_platform_config`, claim via `claim_platform_fee`). pump.fun = highest volume but **no partner economics**.
- Base: Clanker v4.1, Flaunch (`RevenueManager`), Zora (auto-paid 20% `platformReferrer`), Doppler.
- **Bankr reframing (§03):** Bankr is a *competitor*, not infra to integrate — it's a Clanker interface keeping the interface slice. Recommendation: integrate the layer beneath (Clanker/LaunchLab/**Meteora DBC**) directly.

### Compliance flag (line 286-288)
> *"Launching tokens + holding pool fee-claim authority is a materially bigger regulatory surface than swaps... Get a legal read before shipping the launchpad leg."*

### Open decisions left unresolved in the doc (lines 299-304)
Q1 chain, Q2 launch model (bonding curve vs direct LP), **Q3 creator fee split %** (comps: pump.fun ~50%, Bankr 57%, Clanker-bot 80%), Q4 whether single global trading fee is enough vs per-creator/token config, Q5 legal read.

> **Note — `bnkr`/Bags:** The new plan mentions "Bags." The prior design doc analyzed **Bankr (bnkr)** (a Base/Clanker launch bot) but does NOT mention "Bags" (bags.fm, a Solana launchpad). There is **no Bags research or code anywhere** in the repo — a gap for the new plan.

### `docs/TECHNICAL_OVERVIEW.md`
- Marketing-level only. Names "Meteora DLMM, Raydium CLMM" as the liquidity layer for "creator token launches with concentrated liquidity" (`:43-45,98`) and says infra is "ready for... creator token launches... on day one" (`:73`). Note the mismatch: overview says **DLMM/CLMM** (concentrated-liquidity pools); the LP design doc recommends **Meteora DBC → DAMM** (bonding curve). No fee/tax/vesting/LP-split specifics.

---

## 7. Dependencies present vs. missing

Present (`package.json` files):
- `@solana/web3.js ^1.98.0` (root), `@solana/spl-token ^0.4.14` (apps/api — used ONLY by the ATA scripts), `@privy-io/server-auth`, `@privy-io/expo`, `@solana-mobile/mobile-wallet-adapter-*` (mobile).

**Missing for the new plan (no dependency, no code):**
- No Meteora SDK (`@meteora-ag/dynamic-bonding-curve-sdk`, DAMM).
- No Bags SDK / API client.
- No Raydium SDK, no Metaplex / token-metadata, no `gill`.
- No Jupiter referral-program SDK (current code hand-rolls `platformFeeBps`/`feeAccount`).

---

## 8. Gap analysis — what is MISSING for the new plan

| New-plan requirement | Current state | Gap |
|---|---|---|
| **Token mint / launch** | `CreatorToken` schema only; no mint code | Build entire mint + metadata + launch flow (Meteora DBC / Bags) |
| **Threshold-based fundraising LP** | None | No threshold/bonding-curve fill logic, no fundraising model in schema |
| **Configurable LP splits** (% to LP vs USDC pair / % platform / % returned to creator as direct tokens) | None | No split config, no allocation/return-tokens-to-creator logic; design doc only covers fee-% split, not token-allocation splits |
| **USDC-paired LP** | USDC mint known; no pool creation | Build LP creation bound to USDC pair |
| **Tax: 1% in-app vs 10% elsewhere** | Only a flat 4% swap fee; no tiering, no on-chain transfer-tax | No transfer-fee/Token-2022 logic; no "in-app vs elsewhere" detection; conflicts with current 4% model — needs reconciliation |
| **Vesting** | None (no schema field, no code, no dep) | Build entirely |
| **LP-fee capture (partner 80%)** | None | Need `fee_claimer` wallet, `claimPartnerTradingFee` flow, `fee_events` table, claim cron |
| **Creator fee/token split** | None | `creatorTradingFeePercentage` config + payout; `MOMENTO_CREATOR_FEE_PCT` env (designed, unbuilt) |
| **Fee accounting / dashboard** | `WalletTransaction` logs swaps only | New `fee_events` table + reconciliation |
| **Maximize creator + Momento fees** | 4% swap fee only | Whole LP-fee + tax-tier economics unbuilt |

### Reconciliation notes / conflicts to resolve
1. **Tax model conflict.** Today = flat **4% Jupiter platform fee** on output. New plan = **1% in-app / 10% elsewhere** transfer tax. These are different mechanisms (referral fee vs. on-chain transfer tax, likely **Token-2022 transfer-fee extension**). Decide whether they stack or replace.
2. **`@solana/spl-token` is classic SPL.** A 1%/10% transfer tax implies **Token-2022**; current dep + ATA scripts assume the classic Token program (`Tokenkeg...`). New mints would need Token-2022 program IDs and ATA derivation changes.
3. **Bags vs Meteora.** Prior design = Meteora DBC. New plan names Bags. No Bags code/research exists — needs its own investigation (fee economics, partner/referral model, SDK, claim mechanism, Token-2022 support).
4. **Fee-ATA seeding doesn't scale to creator tokens.** The 11-mint allowlist + feeless fallback means arbitrary creator tokens earn no swap fee until manually seeded. New plan needs automatic fee capture per launched token.
5. **`SOLANA_NETWORK` defaults to `devnet`** (`helius.ts:7`) — confirm mainnet config before any launch.
6. **One-token-per-creator constraint** (`@@unique([userId, chain])`) — confirm this matches the new multi-launch/fundraising product.

---

## File reference index
- `scripts/create-fee-atas.ts` — wSOL ATA for fee wallet (build-only, base64 output).
- `scripts/create-fee-atas-send.ts` — 11-mint ATAs for fee wallet (signs + sends).
- `apps/api/lib/jupiter.ts` — Solana 4% swap fee (Jupiter `platformFeeBps`/`feeAccount`, feeless fallback).
- `apps/api/lib/base-swap.ts` — Base 4% swap fee (KyberSwap `chargeFeeBy=currency_out`).
- `apps/api/lib/helius.ts` — read-only SOL + token balances (Helius DAS), CoinGecko SOL price.
- `apps/api/app/api/wallet/swap/route.ts` — quote/build endpoints wiring both chains.
- `apps/api/prisma/migrations/20260411100000_add_creator_token/migration.sql` — `creator_tokens` table.
- `apps/api/prisma/schema.prisma:184-226` — `TokenStatus`, `PoolType`, `CreatorToken`.
- `packages/shared/src/constants.ts` — chain config, USDC mints (no fee constants).
- `packages/shared/src/types.ts:16-28,76-101,212-222` — token enums/interfaces, `SwapQuote.platformFee`.
- `apps/api/.env.local.example:64-70` — fee env vars.
- `docs/lp-trading-fees-design.html` — prior LP + trading-fee design (Meteora DBC, 80/20 split).
- `docs/TECHNICAL_OVERVIEW.md:43-45,73,98` — marketing-level Meteora/Raydium mentions.
