# EVM / Base Removal Surface — Research & Removal Plan

**Status:** Research deliverable (read-only audit). No code changed.
**Date:** 2026-06-23
**Goal:** Go all-in on Solana. Remove ALL Ethereum / Base / EVM surface area from the monorepo (apps/api, apps/mobile, packages/shared, scripts, docs).
**Scope of monorepo:** `apps/api` (Next.js + Prisma), `apps/mobile` (Expo RN), `apps/landing` (no EVM found), `packages/shared`.

---

## TL;DR for the implementer

The multi-chain design is a **chain-parameterized abstraction**, not two parallel stacks. Almost every wallet path is `if (chain === 'base') { ... } else { /* solana */ }`. Removal is therefore mostly:

1. **Delete** the two pure-EVM API libs (`lib/base.ts`, `lib/base-swap.ts`) and the mobile `ChainProvider` / `ChainSwitcher`.
2. **Strip** the `chain === 'base'` branches from ~10 API routes and ~8 mobile files, hard-wiring Solana.
3. **Collapse** the shared `ChainType` union and `CHAIN_CONFIG` to Solana-only (or keep a 1-member union to minimize churn — see Risk R1).
4. **Schema:** drop `User.baseWalletAddress`; decide whether to keep the chain-agnostic `chain`/`nativeBalance` columns (they are now used by Solana too — see Risk R2). This needs a forward migration; **do NOT roll back the old migrations.**
5. **Remove** Privy embedded `ethereum` wallet creation (mobile `PrivyGuard` + `useAuth`).
6. **Drop** `@ethersproject/shims` dep + polyfill, and all `BASE_*` / `ALCHEMY_*` / `ZEROX_*` / `KYBER_*` env vars.

**Biggest traps:** (R1) `ChainType`/`CHAIN_CONFIG` are imported widely by Solana code; (R2) the DB columns `chain`, `nativeBalance`, `nativeValueUsd` were *renamed from* sol-specific columns and now back Solana data — do not drop them blindly; (R3) `WalletBalance` keeps both `nativeBalance` AND legacy `solBalance` fields that Solana consumers still read.

---

## 1. FILES TO DELETE (pure EVM, no Solana logic)

| File | Why | Notes / dependents to fix |
|---|---|---|
| `apps/api/lib/base.ts` | Entire Base balance fetcher (ETH + ERC-20 + Alchemy). | Imported by `apps/api/app/api/wallet/balance/route.ts:4`. Remove that import + the `chain === 'base'` branch. |
| `apps/api/lib/base-swap.ts` | KyberSwap (Base) quote/build. | Imported by `apps/api/app/api/wallet/swap/route.ts:5`. Remove import + branch. Also imports `CHAIN_CONFIG.base` (`:21,:80`). |
| `apps/mobile/src/providers/ChainProvider.tsx` | Chain selection context + AsyncStorage persistence. | Imported by `_layout.tsx:11,107,199`, `useAuth.ts:3,90`, `useChain.ts:2`. See §6 for how to retire. |
| `apps/mobile/src/components/features/ChainSwitcher.tsx` | Network selector dropdown UI. | Imported by `features/index.ts:26`, `app/(tabs)/wallet.tsx:18,116`, `app/wallet.tsx:22,210`. |
| `apps/mobile/src/hooks/useChain.ts` | Re-export shim for `useChain`. | Used everywhere `useChain` is imported (see §6 list). Delete after all consumers hard-wire `'solana'`. |

> `apps/mobile/app/wallet.tsx` AND `apps/mobile/app/(tabs)/wallet.tsx` are **two** wallet screens, both chain-aware. Both must be edited (not deleted).

---

## 2. CODE TO STRIP (file:line — branches/blocks to remove or collapse to Solana)

### 2a. Shared types & constants — `packages/shared/src/`
- `types.ts:14` — `export type ChainType = 'solana' | 'base';` → collapse to `'solana'` (see Risk R1; do NOT just delete the type — it's imported widely).
- `types.ts:28` — `enum PoolType { ... AERODROME }` — `AERODROME` is the Base/Aerodrome DEX pool type; remove that member. (`RAYDIUM`/`BONDING_CURVE` are Solana.)
- `types.ts:53` — `User.baseWalletAddress?: string;` → remove field.
- `types.ts:54` — `User.primaryChain: ChainType;` → remove or pin to Solana (DB column decision, Risk R2).
- `types.ts:79` (`CreatorToken.chain`), `:124-127`, `:173` (`WalletBalance.chain`), `:191` (`PortfolioPoint`), `:205-209` (`OnrampUrlResponse.chain`), `:212` (`SwapQuote.chain`) — all carry `chain: ChainType`. Keep the field if you keep the DB columns; otherwise drop. At minimum these stop being a *union*.
- `constants.ts:11-34` — `CHAIN_CONFIG` object: **remove the entire `base: { ... }` block (`:23-33`)**. Keep `solana`. Note `CHAIN_CONFIG.base.usdcAddress` is referenced by `lib/base-swap.ts:80`, `app/api/wallet/send/route.ts:270-271`, mobile `SwapModal.tsx:71` — all of those are Base paths being removed anyway.
- `constants.ts:36` — `export type ChainConfig = typeof CHAIN_CONFIG;` stays valid after the `base` key is removed.

### 2b. API — `apps/api/lib/auth.ts`
- `:22` `AuthUser.baseWalletAddress` and `:23` `primaryChain` — fields to remove (tie to schema decision).
- `:63-72`, `:108-117`, `:142-151` — `select` blocks include `baseWalletAddress`, `primaryChain`. Strip those columns.
- `:83-85` — `ethWallet` extraction from Privy `linkedAccounts` (chainType === 'ethereum'). Remove.
- `:89` `const baseWalletAddress = ...`, `:92` `primaryChain` derivation, `:101-106` create with `baseWalletAddress/primaryChain`. Strip.
- `:118-156` — the "sync Base wallet if missing" branch: the `!user.baseWalletAddress` condition + `ethWallet` lookup + `updateData.baseWalletAddress`. Simplify to Solana-only pending-sync.
- `:212-218` — `getWalletForChain()`: the `if (chain === 'base')` branch. Either delete the helper entirely and inline `user.walletAddress`, or keep it always-Solana. Callers: `balance/route.ts:2,17`, `swap/route.ts:2,47,136`, `send/route.ts:2,226`, `onramp/route.ts:2,256`.
- `:224-229` — `getChainParam()` returns `'solana' | 'base'`. Either delete (callers stop passing chain) or hard-return `'solana'`. Callers: `balance`, `swap`, `history`, `snapshots`, `transactions` routes.

### 2c. API routes (`apps/api/app/api/wallet/*`)
- `balance/route.ts:4` import `fetchBaseWalletBalance`; `:15` `getChainParam`; `:26` `chain === 'base' ? 'ETH' : 'SOL'`; `:37,63` cacheKey/snapshot by chain; **`:40-42` the `if (chain === 'base')` branch.** Strip to Solana-only.
- `swap/route.ts:5` import `getBaseSwapQuote/buildBaseSwapTransaction`; `:32,35-64` GET Base branch; `:117-157` POST Base branch (`body.chain === 'base'`). Strip both; remove `chain` plumbing.
- `send/route.ts:4` `CHAIN_CONFIG` import (only used by Base branch `:270-271`); `:83` `chain` body param; `:93,97` `'ETH'` token allowed; **`:108-111` the Base dispatch** and **`:215-297` the entire `handleBaseSend()` function** (native ETH + ERC-20 `transfer` calldata, chainId 8453). Strip. After removal, `getWalletForChain` import (`:2`) and `AuthUser` type import may be droppable.
- `onramp/route.ts:18,29` Ramp `BASE_USDC` asset; `:49,60` MoonPay `usdc_base`; `:150,160,178-179` Transak `network = 'base'`; `:246,256` `chain` param + `getWalletForChain`. Collapse all `chain === 'base' ? ... : ...` to the Solana literal.
- `history/route.ts:2,19-21` — `getChainParam` + `coinId = chain === 'base' ? 'ethereum' : 'solana'`. Hard-wire `'solana'`.
- `snapshots/route.ts:2,19,28` — `getChainParam` + `where: { chain }`. Decide per Risk R2; simplest: hard-wire `'solana'`.
- `transactions/route.ts:2,19,25,28` — `getChainParam` + `where: { chain }` + cacheKey. Hard-wire `'solana'`.
- `transactions/log/route.ts:22,30-35` — accepts `chain`, validates `chain !== 'solana' && chain !== 'base'`. Reject anything but `'solana'` (or drop chain from body).
- `lib/redis.ts:32` `walletBalance(userId, chain='solana')`, `:43-44` `walletTransactions(... chain ...)` — keep signatures (Solana already uses them) but the `chain` arg becomes constant. Low priority cleanup.

### 2d. Mobile (`apps/mobile/`)
- `index.js:7` — `import '@ethersproject/shims';` (EVM-only polyfill). Remove.
- `src/config/env.ts:18-25` — `BASE_RPC_URL`, `BASE_CHAIN_ID`, `BASE_NETWORK`. Remove.
- `src/providers/PrivyGuard.tsx:67` — `embedded: { ethereum: { createOnLogin: 'users-without-wallets' } }`. **Remove the `ethereum` key** (keep `solana`).
- `src/hooks/useAuth.ts` — `:24,37,106` `useEmbeddedEthereumWallet`; `:90` `useChain().setAvailableChains`; `:133-159` auto-create ETH wallet effect; `:178-185` `ethWalletAddress/ethWalletStatus`; `:187-195` `setAvailableChains` effect; `:215-228` `getEthWalletProvider`; `:245-248` returned eth fields; `GUEST_AUTH` `:57-59` eth fields. Strip all ETH wallet machinery.
- `src/hooks/useSwap.ts` — `:5` useChain; `:9` `BASE_CHAIN_ID_HEX`; `:63-70` `encodeApprove`; `:72-92` `waitForTransaction` (EVM receipt poll); `:109,137-150` chain branch in `fetchQuote`; **`:185-263` the entire Base swap block** (approval + eth_sendTransaction). Strip; keep Solana path.
- `src/hooks/usePrivyFunding.ts` — `:5,28` useChain; `:33` `useFundWallet` (EVM); `:39,51-62` `isBase`/`fundEvmWallet` branch. Keep only `useFundSolanaWallet`.
- `src/hooks/useOnramp.ts:3,9,30` — `chain` option (defaults solana). Drop the param.
- `src/hooks/useWalletBalance.ts:6,19` and `src/hooks/useWalletTransactions.ts:3,32` — `useChain()` + pass `chain` to API. Drop chain query param.
- `src/components/features/SwapModal.tsx` — `:22,85` useChain; `:38` `ETH_NATIVE`; `:69-71` `BASE_TOKENS`; `:86,91,118,358,559` `chain === 'base'` branches; "Powered by KyberSwap" string. Strip to Solana/Jupiter only.
- `src/components/features/SendModal.tsx` — `:22,70` useChain; `:38` `BASE_CHAIN_ID_HEX`; `:48-57` ETH min amounts; `:75-79` chain-derived symbol/address; **`:170-226` Base send block** (`eth_sendTransaction` + receipt poll); `:122-124,141-143,309-311,399-413,433-437` chain-conditional UI. Strip.
- `src/components/features/FundWalletModal.tsx` — `:19,44` useChain; `:180-183,348-357,389-402,455-458` Base copy/branches (Coinbase/MetaMask/Base network text, mainnet hard-code). Reduce to Solana.
- `app/(tabs)/wallet.tsx` — `:18,23,46,116` ChainSwitcher/useChain; `:31-37` `getExplorerAccountUrl(... 'base')`; `:54-55` `chain === 'base' ? ethWalletAddress : ...`. Hard-wire Solana.
- `app/wallet.tsx` — `:22,27,75` ChainSwitcher/useChain; `:59-71` `getExplorerUrl` Base branch (basescan.org); `:64,126,210,214-215` `chain === 'base'` / `ENV.BASE_NETWORK` / ChainSwitcher render. Hard-wire Solana.
- `app/_layout.tsx:11,107,199` — `<ChainProvider>` wrapper. Remove after `useChain` consumers are gone.

> `src/config/dummyData.ts:84` has `chain: 'solana'` (already Solana — leave).

---

## 3. DEPENDENCIES TO REMOVE

| package.json | Dependency | Action |
|---|---|---|
| `apps/mobile/package.json:14` | `@ethersproject/shims` | Remove (only EVM polyfill; imported solely at `index.js:7`). |

**No other EVM libs are installed.** There is NO `viem`, `wagmi`, `ethers` (core), `alchemy-sdk`, or `@coinbase/*` anywhere — Base was implemented with raw `fetch` JSON-RPC + manual ABI encoding. Privy's EVM support comes bundled inside `@privy-io/expo` (`useEmbeddedEthereumWallet`, `useFundWallet`) — **do not remove `@privy-io/expo`** (Solana auth needs it); just stop calling the EVM hooks.

After removing `@ethersproject/shims`, run `pnpm install` to refresh `pnpm-lock.yaml`.

---

## 4. ENV VARS TO DROP

### `apps/api/.env.local.example` (lines ~38-42, the "Base Chain" block)
- `BASE_RPC_URL`, `BASE_CHAIN_ID`, `ALCHEMY_API_KEY`, `ZEROX_API_KEY`, `BASE_FEE_WALLET`
- Also (not in example but read in code): `BASE_AGGREGATOR_URL`, `KYBER_CLIENT_ID` (`lib/base-swap.ts:31,37`).
- `MOMENTO_PLATFORM_FEE_BPS` is **shared** with Jupiter/Solana fee logic — KEEP.

### `apps/mobile/.env.example`, `.env.production`, `.env.development` (each has a "Base" block)
- `EXPO_PUBLIC_BASE_RPC_URL`, `EXPO_PUBLIC_BASE_CHAIN_ID`, `EXPO_PUBLIC_BASE_NETWORK`

### Live env files (contain real secrets — separate concern)
- `apps/api/.env.development` has no Base vars but **does contain committed live secrets** (Privy app secret, Supabase service role key, Helius key, Veriff keys). Out of scope for EVM removal, but flag for the team — these should not be in the repo.

> No Base vars found in `eas.json` (the `"base"` matches there are EAS build-profile inheritance, unrelated).

---

## 5. SCHEMA CHANGES (`apps/api/prisma/schema.prisma`) + migration ordering

### Columns / enum members that are PURE EVM (safe to drop)
- `User.baseWalletAddress` (`:33`) + its unique index `users_baseWalletAddress_key`.
- `PoolType.AERODROME` (`:195`) — Base/Aerodrome only (Raydium/BondingCurve are Solana).

### Columns that are CHAIN-AGNOSTIC and back Solana data — DO NOT drop blindly (Risk R2)
- `User.primaryChain` (`:34`, default `"solana"`) — drop only if you also remove it from `AuthUser`/types; otherwise leave as a no-op defaulting to solana.
- `CreatorToken.chain` (`:201`) + `@@unique([userId, chain])` (`:222`) + `@@index([chain, status])` (`:223`).
- `PortfolioSnapshot.chain` (`:231`, default `"solana"`) + `@@index([userId, chain, createdAt])` (`:239`).
- `WalletTransaction.chain` (`:246`) + `@@unique([userId, chain, signature])` (`:258`) + `@@index([userId, chain, createdAt])` (`:259`).
- `PortfolioSnapshot.nativeBalance/nativeValueUsd` (`:233-234`) and `WalletBalance`'s `nativeBalance` — these were **renamed from** `solBalance`/`solValueUsd` in migration `20260411000000`. They now hold Solana data. KEEP (renaming back is gratuitous churn and risks breaking the snapshot read path at `snapshots/route.ts:53-58`).

**Recommendation:** the cheapest, safest cut is to drop only `User.baseWalletAddress` + `PoolType.AERODROME`, and leave the chain columns in place defaulting to `'solana'`. This minimizes migration risk and keeps historical rows valid. Aggressively dropping `chain` columns is a larger, riskier change for little benefit.

### Migration ordering risks
- Existing migrations `20260404000000_add_base_wallet_support`, `20260411000000_rename_native_balance_add_tx_history`, `20260411100000_add_creator_token` are **already applied**. **Do NOT edit or delete applied migrations** — Prisma checksums them; editing breaks `migrate deploy`. Add a NEW forward migration instead (e.g. `2026XXXX_remove_base_support`).
- A migration that `DROP COLUMN "baseWalletAddress"` must also `DROP INDEX "users_baseWalletAddress_key"` (Postgres usually drops the dependent unique index automatically, but be explicit).
- Dropping `PoolType.AERODROME`: Postgres cannot remove an enum value if any row uses it. Verify no `creator_tokens.poolType = 'AERODROME'` rows exist first; enum-value removal requires the create-new-type/swap dance or `ALTER TYPE` workarounds.
- This repo uses `prisma db push` in dev/CI (`package.json` `db:push`, `vercel-build` uses `prisma generate` not `migrate deploy`) AND keeps a `migrations/` folder. Confirm the deploy strategy before authoring the migration so dev (`db push`) and prod stay in sync.

---

## 6. SHARED ABSTRACTIONS USED BY SOLANA TOO (don't break these)

These are the load-bearing items the implementer must handle carefully rather than delete outright:

1. **`ChainType` union** (`packages/shared/src/types.ts:14`) — imported by ~15 mobile files and several API files. Collapsing to `type ChainType = 'solana'` (one-member union) lets all `ChainType` annotations keep compiling while making `=== 'base'` branches dead/unreachable (TS will flag them, which helps find them). This is the lowest-churn path; full removal of the type is a larger refactor.
2. **`CHAIN_CONFIG`** (`packages/shared/src/constants.ts`) — `CHAIN_CONFIG[chain]` is used pervasively (SendModal, SwapModal, FundWalletModal, both wallet screens) to get name/symbol/decimals/icon/explorer. Keep the object; just remove the `base` key. Consumers indexing `CHAIN_CONFIG['solana']` keep working.
3. **`WalletBalance` shape** (`types.ts:173-184`) — carries BOTH `nativeBalance`/`nativeSymbol`/`nativePriceUsd` AND legacy `solBalance`/`solPriceUsd`. Solana code reads both (`balance/route.ts:43-49`, mobile `SendModal.tsx:106-109`). Keep all of these; they are not Base-specific.
4. **`getWalletForChain` / `getChainParam`** (`lib/auth.ts`) — used by Solana routes too. Either delete and inline the Solana wallet, or keep them as constant-Solana helpers. Don't remove without updating all callers (listed in §2b).
5. **`lib/redis.ts` cacheKeys** — `chain` is baked into key strings used by the live Solana cache. Changing key format orphans existing cache entries (harmless but a cold-cache blip). Keep keys as-is.
6. **`useOnramp` legacy positional signature** (`useOnramp.ts:20-27`) — keep back-compat handling when dropping the `chain` option.

---

## 7. DOCS TO ARCHIVE / MARK SUPERSEDED

These describe the multi-chain build and are now historical. Recommend moving to an `archive/` folder or adding a "SUPERSEDED by Solana-only migration (2026-06)" banner at the top:

- Entire `docs/multi-chain/` directory (16 files): `00-overview.md`, `01-agent1-shared-types.md` … `11-phase4-integration.md`, `AGENT_PROMPTS*.md`, `HUMAN_DEVICE_TESTING.md`.
- Root `MULTI_CHAIN_PLAN.md`.
- Root `HANDOFF_MULTICHAIN.md`.
- Spot-check (not exhaustively audited) for Base mentions to update: `AGENT_MEMORY.md`, `ARCHITECTURE_ANALYSIS.md`, `README.md`, `docs/architecture.md`, `docs/CURRENT_STATE_AUDIT.md`, and the `CURSOR_INSTRUCTIONS_PART*.md` series. These are docs, not code — update opportunistically, lower priority.

---

## 8. SUGGESTED REMOVAL ORDER (dependency-safe)

1. **Mobile UI leaves first** (no dependents): strip Base branches in `SendModal`, `SwapModal`, `FundWalletModal`, both `wallet.tsx` screens. Remove `ChainSwitcher` usages.
2. **Mobile hooks:** strip Base from `useSwap`, `usePrivyFunding`, `useOnramp`, `useWalletBalance`, `useWalletTransactions`; strip ETH wallet from `useAuth`; remove `ethereum` from `PrivyGuard`.
3. **Retire `ChainProvider`/`useChain`/`ChainSwitcher`** + `_layout.tsx` wrapper once no consumers remain.
4. **Mobile deps/env/polyfill:** remove `@ethersproject/shims` (dep + `index.js:7`), Base env keys, `env.ts` Base fields.
5. **API routes:** strip `chain === 'base'` branches (balance, swap, send, onramp, history, snapshots, transactions, transactions/log).
6. **Delete `lib/base.ts`, `lib/base-swap.ts`** (after their imports are gone).
7. **`lib/auth.ts`:** strip ETH wallet extraction + `baseWalletAddress`/`primaryChain` + collapse `getWalletForChain`/`getChainParam`.
8. **Shared:** remove `CHAIN_CONFIG.base`, collapse `ChainType`, remove `AERODROME`, drop `baseWalletAddress`/`primaryChain` from `User`.
9. **Schema + new forward migration** (drop `baseWalletAddress` + index, `AERODROME`; keep chain columns defaulting to solana). Run `pnpm install` + `prisma generate`.
10. **Type-check** (`tsc`) the whole monorepo — the collapsed `ChainType` will surface any missed `=== 'base'` branch as a dead-code/never error. **Use this as the completeness gate.**

---

## 9. Quick reference — every EVM-relevant location found

**Delete:** `apps/api/lib/base.ts`, `apps/api/lib/base-swap.ts`, `apps/mobile/src/providers/ChainProvider.tsx`, `apps/mobile/src/components/features/ChainSwitcher.tsx`, `apps/mobile/src/hooks/useChain.ts`.

**Strip branches:** `packages/shared/src/types.ts` (14,28,53-54,79,124-127,173,191,205-212), `packages/shared/src/constants.ts` (11-34), `apps/api/lib/auth.ts` (22-23,63-72,83-156,212-229), `apps/api/lib/redis.ts` (32,43-44), `apps/api/app/api/wallet/{balance,swap,send,onramp,history,snapshots,transactions,transactions/log}/route.ts`, mobile `index.js:7`, `config/env.ts:18-25`, `providers/PrivyGuard.tsx:67`, `hooks/{useAuth,useSwap,usePrivyFunding,useOnramp,useWalletBalance,useWalletTransactions}.ts`, `components/features/{SwapModal,SendModal,FundWalletModal}.tsx`, `app/(tabs)/wallet.tsx`, `app/wallet.tsx`, `app/_layout.tsx` (11,107,199).

**Deps:** remove `@ethersproject/shims` from `apps/mobile/package.json:14`.

**Env:** `apps/api/.env.local.example` Base block + `BASE_AGGREGATOR_URL`/`KYBER_CLIENT_ID`; `apps/mobile/.env.{example,production,development}` Base blocks.

**Schema:** `apps/api/prisma/schema.prisma` — drop `User.baseWalletAddress` (33) + index, `PoolType.AERODROME` (195); keep chain columns. New forward migration only; never edit applied migrations.

**Docs:** archive `docs/multi-chain/*`, `MULTI_CHAIN_PLAN.md`, `HANDOFF_MULTICHAIN.md`.
