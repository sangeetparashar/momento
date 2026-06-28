> ⚠️ SUPERSEDED by the Solana-only migration (2026-06). See docs/solana-migration/README.md. Retained for history.

# Agent Handoff: Momento Multi-Chain Wallet Stability + Transaction History

> Generated: 2026-04-11
> Session focus: Deep audit of multi-chain (Solana + Base) wallet infrastructure, fixed 4 chain-switching bugs, added server-side transaction history system, deployed to production

## 1. Project Overview

Momento is a location-based creator monetization platform ("stock market for culture"). Monorepo: `apps/api` (Next.js 15, Vercel), `apps/mobile` (Expo 54, React Native), `packages/shared` (TypeScript types). Auth via Privy embedded wallets. Dual-chain: Solana (Helius RPC + Jupiter swaps) and Base/Ethereum L2 (direct RPC + KyberSwap). Database: Supabase PostgreSQL + Upstash Redis. Production API at `momento-api-ten.vercel.app`.

## 2. Current State

### Working
- **Wallet creation** — Privy auto-creates both Solana + ETH embedded wallets on OAuth login (1.5s + 2s stagger)
- **Chain switching** — ChainProvider + AsyncStorage persistence, ChainSwitcher dropdown UI, all API routes dispatch on `?chain=solana|base`
- **Balance fetching** — Helius DAS API (Solana), direct RPC + optional Alchemy (Base), both with 30s Redis cache
- **Swaps** — Jupiter (Solana), KyberSwap (Base), with 4% platform fee, ERC-20 approval flow, 30s quote staleness guard
- **Sends** — SOL/ETH native + USDC SPL/ERC-20 transfers, chain-aware address validation
- **Fiat onramp** — Ramp, MoonPay, Transak all support both chains with correct asset codes
- **Portfolio snapshots** — Per-chain in DB, downsampled to 200 points, schema uses `nativeBalance`/`nativeValueUsd` (chain-agnostic)
- **Transaction history** — Server-side `WalletTransaction` model, `POST /api/wallet/transactions/log` (idempotent upsert), `GET /api/wallet/transactions` (cursor pagination, 30s cache), mobile `useWalletTransactions` hook with AsyncStorage offline fallback
- **Fee collection** — Scripts exist for Solana fee wallet ATAs (`scripts/create-fee-atas-send.ts`), KyberSwap fee params for Base
- **Production deployment** — All changes deployed to `momento-api-ten.vercel.app`, migration applied, health check passing

### Not Yet Working / In Progress
- **Creator token deployment** — No SPL token minting code (Solana), no ERC-20 factory/contract (Base). `User.tokenSymbol` field exists but is never populated
- **Automated pools / bonding curves** — Zero pool management, no Raydium/Orca/Aerodrome integration, no custom AMM
- **Creator token trading** — Swaps only work with DEX-listed tokens via Jupiter/KyberSwap. Unlisted creator tokens can't be traded
- **Fee wallet ATAs on mainnet** — Scripts exist but haven't been run. Swaps silently fall back to 0% fee
- **Arbitrary ERC-20 discovery on Base** — Only USDC/DAI/WETH visible without Alchemy API key
- **External wallet login** — SIWE/SIWS backend ready, mobile UI deferred (WalletConnect not available in Privy Expo SDK)
- **RPC failover** — No fallback if Helius or Base public RPC goes down
- **`/api/wallet/history` endpoint** — Returns CoinGecko price history, NOT transaction history (misleading name)

## 3. What Was Done This Session

1. **Deep codebase audit** — Read all wallet-related files across API + mobile. Identified 7 bugs/gaps in chain switching, 0 transaction logging, misleading field names in schema.

2. **A1: SwapModal chain-aware wallet check** — `apps/mobile/src/components/features/SwapModal.tsx` — Added `activeWalletAddress` that picks `ethWalletAddress` or `walletAddress` based on chain. Fixed 3 Solana-only references (guard, deps, button text).

3. **A2: Explicit chain param on Solana sends** — `apps/mobile/src/components/features/SendModal.tsx` — Added `chain` to POST body at line 232 (was relying on server default).

4. **A3: Quote staleness check** — `apps/mobile/src/hooks/useSwap.ts` — Added `quoteFetchedAtRef` timestamp. `executeSwap` rejects quotes >30s old with clear error message.

5. **A4: Schema rename** — `apps/api/prisma/schema.prisma`, `balance/route.ts`, `snapshots/route.ts` — Renamed `solBalance` → `nativeBalance`, `solValueUsd` → `nativeValueUsd`. Kept `sol` response key for backward compat.

6. **B1: WalletTransaction model** — `apps/api/prisma/schema.prisma` — New model with `@@unique([userId, chain, signature])`, amounts as strings for precision.

7. **B2: POST /api/wallet/transactions/log** — `apps/api/app/api/wallet/transactions/log/route.ts` — Upsert-based idempotent logging, validates chain/type, invalidates cache.

8. **B3: GET /api/wallet/transactions** — `apps/api/app/api/wallet/transactions/route.ts` — Cursor-based pagination (Prisma native), 30s Redis cache, max 50 per page.

9. **B4: Redis cache key** — `apps/api/lib/redis.ts` — Added `walletTransactions` to `cacheKeys`.

10. **B5: Fire-and-forget tx logging** — `SwapModal.tsx`, `SendModal.tsx` — After AsyncStorage write, POSTs to `/wallet/transactions/log` with `.catch(() => {})`.

11. **B6: useWalletTransactions hook** — `apps/mobile/src/hooks/useWalletTransactions.ts` — React Query, chain-aware query key, 30s staleTime. Exported from `hooks/index.ts`.

12. **B7: Wallet screen migration** — `apps/mobile/app/wallet.tsx` — Replaced AsyncStorage-only tx list with API-backed `useWalletTransactions()` + offline fallback. Added per-type tx icons (send ↑, receive ↓, swap ↔).

13. **Migration** — `apps/api/prisma/migrations/20260411000000_rename_native_balance_add_tx_history/migration.sql` — Combined column rename + table creation. Applied to production DB after baselining 2 prior migrations.

14. **Fixed .env** — `apps/api/.env` was pointing to stale Supabase project (`edswptfvtihbeshmaglm`). Updated to active project (`phlkstaghvbwacmzuihr`) with correct credentials from `.env.vercel`.

15. **Merged + deployed** — Merged `claude/nice-feistel` into `main` (clean, no conflicts), pushed, deployed to Vercel production. Health check passing.

## 4. Key Decisions & Rationale

| Decision | Why | Alternatives Considered |
|----------|-----|------------------------|
| Upsert for tx logging (not insert) | Idempotent — network retries or duplicate calls won't create dupes | Insert with try/catch on unique constraint |
| Amounts as strings in WalletTransaction | Avoid float64 precision loss on large token amounts | Float (lossy), Decimal (Prisma overhead) |
| Fire-and-forget POST for tx logging | Must not block user after successful on-chain tx. AsyncStorage is immediate fallback | Queued batch writes (unnecessary complexity for infrequent user-initiated txs) |
| Keep `sol` key in snapshots response | Backward compat for mobile clients that haven't updated yet | Breaking change (risky during active development) |
| 30s quote max age | Jupiter/KyberSwap quotes become stale as liquidity pool state changes. 30s balances UX vs safety | 15s (too aggressive, forces refetch), 60s (stale slippage) |
| Cursor-based pagination for tx history | Efficient for "load more" UI, no offset skip problem | Offset-based (slow on large datasets), time-based (clock skew issues) |
| No User relation on WalletTransaction | Keeps model lightweight, avoids touching User model (which would require adding `transactions` relation field) | FK relation (would need schema change on User model) |
| KyberSwap (not 0x) for Base swaps | 0x v1 API was deprecated/dead as of 2025-04-11. KyberSwap is free, no API key required | 1inch (rate limited), Paraswap (less Base support) |

## 5. Bugs, Failures & Lessons Learned

- **Prisma `.env` auto-loading overrides env vars**: Prisma always loads `.env` automatically. If `.env` has a stale `DATABASE_URL`, you must either fix `.env` or use `dotenv-cli` to override. Setting env vars on the command line BEFORE `npx prisma` does NOT reliably override `.env` — Prisma's own loader wins. Fixed by updating `.env` to point to the correct Supabase project.

- **Migration baseline required for existing DB**: The production DB had tables but no `_prisma_migrations` table. `prisma migrate deploy` fails with `P3005: database schema not empty`. Fix: `prisma migrate resolve --applied <migration_name>` for each existing migration, then `prisma migrate deploy` for the new one.

- **Old Supabase project in `.env`**: The `.env` file had credentials for `edswptfvtihbeshmaglm` (old/unreachable). Active project is `phlkstaghvbwacmzuihr`. The `.env.vercel` file (pulled via Vercel CLI) has the correct values. Always cross-reference `.env.vercel` for ground truth.

- **Node not on PATH in worktrees**: The worktree environment doesn't have `nvm` auto-loaded. Must `export PATH="/home/sangeet/.nvm/versions/node/v22.22.2/bin:$PATH"` before running `npx`, `pnpm`, etc.

- **Worktree can't checkout main**: `git checkout main` fails in a worktree because main is checked out in the parent repo. To merge: `cd /home/sangeet/code/momento && git merge claude/<branch>`.

- **`.env.vercel` has `\n` suffixes on values**: Values pulled via `vercel env pull` have literal `\n` at the end of strings. Must strip them when using in shell: `sed 's/\\n//'`.

## 6. Codebase Map

```
momento/
├── apps/api/                          # Next.js 15 API (deployed to Vercel)
│   ├── prisma/schema.prisma           # DB schema — User, PortfolioSnapshot, WalletTransaction
│   ├── prisma/migrations/             # 3 migrations (postgis, base wallet, native balance + tx)
│   ├── lib/auth.ts                    # getAuthUser, requireAuth, getWalletForChain, getChainParam
│   ├── lib/helius.ts                  # Solana RPC + DAS API (balance, token metadata)
│   ├── lib/jupiter.ts                 # Solana swaps (Jupiter, 4% platform fee)
│   ├── lib/base.ts                    # Base RPC (ETH + ERC-20 balance)
│   ├── lib/base-swap.ts              # Base swaps (KyberSwap, approval handling)
│   ├── lib/redis.ts                   # Upstash Redis cache keys + TTLs
│   ├── app/api/wallet/balance/        # GET — chain-aware balance + snapshot recording
│   ├── app/api/wallet/swap/           # GET (quote) + POST (build tx) — Jupiter or KyberSwap
│   ├── app/api/wallet/send/           # POST — build unsigned tx for SOL/ETH/USDC
│   ├── app/api/wallet/onramp/         # GET — Ramp/MoonPay/Transak URLs
│   ├── app/api/wallet/history/        # GET — CoinGecko price history (NOT tx history)
│   ├── app/api/wallet/snapshots/      # GET — portfolio value over time
│   ├── app/api/wallet/transactions/   # GET — paginated tx history (NEW)
│   └── app/api/wallet/transactions/log/ # POST — log a tx (NEW)
│
├── apps/mobile/                       # Expo React Native
│   ├── src/hooks/useAuth.ts           # Privy auth — Solana + ETH wallet creation, SIWS/SIWE
│   ├── src/hooks/useSwap.ts           # Swap hook — Jupiter (Solana) + KyberSwap (Base)
│   ├── src/hooks/useWalletBalance.ts  # Balance polling (30s, fast 10s after tx)
│   ├── src/hooks/useWalletTransactions.ts # Server-backed tx history (NEW)
│   ├── src/providers/ChainProvider.tsx # Chain selection context + AsyncStorage persistence
│   ├── src/components/features/SwapModal.tsx    # Swap UI (chain-aware)
│   ├── src/components/features/SendModal.tsx    # Send UI (chain-aware)
│   ├── src/components/features/FundWalletModal.tsx # Onramp UI
│   ├── src/components/features/ChainSwitcher.tsx   # Chain dropdown
│   └── app/wallet.tsx                 # Wallet screen — balance, tokens, tx history
│
├── packages/shared/src/
│   ├── types.ts                       # ChainType, WalletBalance, User, SwapQuote
│   └── constants.ts                   # CHAIN_CONFIG (name, symbol, decimals, USDC address, explorer)
│
├── scripts/
│   ├── create-fee-atas.ts             # Output unsigned ATA creation tx (single token)
│   └── create-fee-atas-send.ts        # Create + submit ATAs for 10 tokens (batch)
│
└── vercel.json                        # Monorepo config: buildCommand targets apps/api
```

## 7. Remaining Work

### High Priority
- [ ] **Run fee wallet ATA scripts on mainnet** — `scripts/create-fee-atas-send.ts` needs to be run with a funded Solana keypair. Without this, Jupiter swaps silently fall back to 0% fee (platform loses revenue). Requires ~0.02 SOL for rent. 10 token ATAs: wSOL, USDC, USDT, BONK, JUP, WIF, PYTH, RAY, ORCA, RENDER.
- [ ] **Creator token deployment (Solana)** — Design and build an SPL token factory. Needs: mint authority, metadata (Metaplex), initial supply, decimals. Database model: `CreatorToken` (mint, chain, supply, deployedAt, poolAddress). API route: `POST /api/creators/[id]/deploy-token`. Security audit required.
- [ ] **Creator token deployment (Base)** — ERC-20 factory contract. Can use OpenZeppelin ERC20 with custom constructor. Deploy via Hardhat/Foundry. Same `CreatorToken` model, chain='base'.
- [ ] **Automated pools / bonding curves** — Choose mechanism: custom bonding curve (pump.fun style) vs DEX pool (Raydium/Aerodrome). Build pool creation on token deploy, auto-seed liquidity, handle "graduation" to public DEX. This is the core product differentiator.

### Medium Priority
- [ ] **RPC failover** — Add QuickNode or Alchemy as fallback for Helius (Solana). Add Alchemy as fallback for public Base RPC (`mainnet.base.org`). Currently single point of failure on each chain.
- [ ] **Rename `/api/wallet/history` to `/api/wallet/price-history`** — Current name is misleading (returns CoinGecko price data, not transaction history). Or repurpose it to actually fetch on-chain tx history from Helius `getSignaturesForAddress`.
- [ ] **Slippage configuration** — Currently hardcoded at 50 bps. Add user-facing control in SwapModal (0.5%, 1%, 3% presets + custom).
- [ ] **Alchemy API key for Base token discovery** — Without it, only USDC/DAI/WETH are visible. Set `ALCHEMY_API_KEY` env var to enable `alchemy_getTokenBalances` for arbitrary ERC-20 discovery.
- [ ] **KyberSwap API key** — Currently using free tier with `X-Client-Id: momento`. May hit rate limits under load. Get a proper key.

### Low Priority / Nice to Have
- [ ] **External wallet login (MetaMask/Phantom)** — SIWE/SIWS backend is ready. Mobile needs WalletConnect integration (blocked by Privy Expo SDK limitations).
- [ ] **Remove backward-compat `sol` key from snapshots response** — After mobile clients update to consume `native` key, remove the `sol` alias from `snapshots/route.ts:57`.
- [ ] **Real-time balance updates** — Replace 30s polling with WebSocket or SSE. CoinGecko free tier limits prevent live price feeds.
- [ ] **Transaction simulation** — Simulate Base swaps before sending (`eth_call` with tx params) to catch reverts early.

## 8. Environment & Setup Notes

- **Node**: v22.22.2 at `~/.nvm/versions/node/v22.22.2/bin/` — must export PATH manually in worktrees
- **Package manager**: pnpm 10.x (monorepo with `pnpm-workspace.yaml`)
- **Active Supabase**: `phlkstaghvbwacmzuihr` (us-west-2). OLD project `edswptfvtihbeshmaglm` is stale — DO NOT USE
- **Env ground truth**: `apps/api/.env.vercel` has all production values. `.env` was updated this session to match. Values in `.env.vercel` have `\n` suffixes that must be stripped for shell use.
- **Vercel project**: `momento-api` — deploy with `cd /home/sangeet/code/momento && vercel --prod --yes`
- **Prisma migrations**: All 3 baselined. Future migrations: `npx prisma migrate deploy` (ensure correct DATABASE_URL/DIRECT_URL)
- **Solana network**: `mainnet-beta` in production, `devnet` for local dev
- **Base chain ID**: 8453 (mainnet), hex `0x2105`

## 9. Reference Links

- **Vercel dashboard**: https://vercel.com/sangeetparashars-projects/momento-api
- **Production API**: https://momento-api-ten.vercel.app/api/health
- **Jupiter API docs**: https://station.jup.ag/docs/apis/swap-api
- **KyberSwap API docs**: https://docs.kyberswap.com/kyberswap-solutions/kyberswap-aggregator/aggregator-api-specification
- **Helius DAS API**: https://docs.helius.dev/compression-and-das-api/digital-asset-standard-das-api
- **Privy Expo SDK**: https://docs.privy.io/guide/expo/
- **Design reference**: `docs/design/DESIGN_REFERENCE.md` + `docs/design/screens/` (20 Figma exports)
- **Existing plans**: `MULTI_CHAIN_PLAN.md` (completed), `ARCHITECTURE_ANALYSIS.md`, `PLAN.md`
