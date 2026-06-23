# 02 — API Backend Discovery Audit (`apps/api`)

**Scope:** Exhaustive inventory of the Next.js (App Router) backend at `apps/api`, prepared for the "all-in on Solana, remove EVM/Base" migration and the new token-economics roadmap (token launches via Meteora/Bags, 1%/10% tax routing, threshold fundraising LP, Streamflow vesting, fee accounting, Moonpay onramp via Privy).

**Stack:** Next.js 15 (App Router, route handlers) · Prisma 5 + Postgres/PostGIS (Supabase) · Privy server-auth · Upstash Redis (cache + rate limit) · Supabase Storage · Helius (Solana RPC/DAS) · Jupiter (Solana swap) · Alchemy/KyberSwap (Base — legacy) · Veriff (KYC) · Expo Push · CoinGecko (prices). Deployed on Vercel (`iad1`), one cron (`keep-warm`).

**Headline findings:**
1. The backend is **dual-chain (`solana` | `base`) everywhere it touches money.** Chain is a first-class request parameter threaded through auth, balance, swap, send, onramp, history, snapshots, and tx logging. Removing Base is a wide but shallow surgery: it is concentrated in `lib/` and the `wallet/*` routes plus a handful of shared types/DB columns.
2. There is **NO existing endpoint for token launch, LP/fundraise, fee claiming, vesting, or tax routing.** The `CreatorToken` Prisma model + shared type exist but are **completely unwired** — no route references `prisma.creatorToken`. This is greenfield.
3. **No Meteora / Bags / Streamflow / Moonpay-via-Privy code exists** anywhere in the repo source (only docs/design references). All new objectives are net-new.
4. Swaps are **client-signed**: the API builds an unsigned tx / quote and the mobile app signs with the Privy embedded wallet. The backend never holds keys. This pattern is the template for all new on-chain endpoints.

---

## 1. Architecture & Cross-Cutting Concerns

### 1.1 Auth — `lib/auth.ts`
- Verifies Privy JWT from `Authorization: Bearer` via `PrivyClient.verifyAuthToken` (`auth.ts:32-46`).
- `getAuthUser` (`auth.ts:52-159`): looks up `User` by `privyUserId`; **lazily creates** the user on first login via `upsert` (race-safe). On creation it reads `linkedAccounts` from Privy to extract a **Solana wallet** (`chainType==='solana'`) and an **Ethereum wallet** (`chainType==='ethereum'`), storing `walletAddress` (Solana) and `baseWalletAddress` (EVM). Computes `primaryChain` = `base` only if a Base wallet exists and no Solana wallet (`auth.ts:80-92`).
- Re-syncs wallet addresses if `walletAddress` is still `pending-*` or `baseWalletAddress` is missing (`auth.ts:118-156`).
- Guards: `requireAuth` (401), `requireCreator` (`role==='CREATOR'`, 403), `requireAdmin` (`isAdmin`, 403) — all **throw a `Response`** that handlers catch (`auth.ts:164-207`).
- Chain helpers: `getWalletForChain(user, chain)` returns the Base wallet for `'base'` else the Solana wallet (null if `pending-`); `getChainParam(request)` reads `?chain=`, defaults `'solana'` (`auth.ts:212-229`).
- **Chain coupling: HIGH.** `AuthUser` carries `baseWalletAddress` + `primaryChain`; the dual-wallet extraction is the root of all Base support. Migration: drop Base wallet extraction, `getWalletForChain`/`getChainParam` Base branches, and the `primaryChain`/`baseWalletAddress` fields (or keep as nullable legacy).

### 1.2 Persistence — `lib/prisma.ts`
- Standard global singleton `PrismaClient` (`prisma.ts:7-15`). No chain coupling.

### 1.3 Cache — `lib/redis.ts`
- Lazy Upstash Redis singleton. `cacheKeys` namespace + `cacheTTL` map (`redis.ts:18-59`). **Chain-aware keys:** `walletBalance(userId, chain)`, `walletTransactions(userId, chain, cursor)` (`redis.ts:32, 43-44`).
- `getOrSetCache` (fail-open on Redis error), `invalidateCache` (supports SCAN glob), `invalidateCreatorCaches` (`redis.ts:63-127`).

### 1.4 Rate limiting — `lib/ratelimit.ts`
- Upstash sliding-window limiters: `kycLimiter` (1/h), `swapLimiter` (5/min — **defined but appears unused; swap route uses read/writeLimiter**), `writeLimiter` (30/min), `readLimiter` (60/min) (`ratelimit.ts:41-50`).
- `checkRateLimit` fails **open** by default, **closed** (503) when `failClosed` passed (admin routes) (`ratelimit.ts:55-89`). `applyRateLimit(request, limiter, userId?, opts?)` keys on `user:<id>` or `ip:<ip>` (`ratelimit.ts:94-114`). No chain coupling.

### 1.5 Storage — `lib/storage.ts`
- Supabase service-role client. `createPresignedUpload` (1h signed upload URL to `momento-uploads`), `deleteFile`, `extractStoragePath`, `deletePostMedia` (`storage.ts:29-101`). No chain coupling.

### 1.6 Validation — `lib/validation.ts`
- Zod schemas: `createPostSchema`, `createCommentSchema`, `updateProfileSchema` (incl. `tokenSymbol` regex), `locationSchema`, `pushTokenSchema`, `uploadPresignSchema`, `deleteAccountSchema`; `validateBody` helper (`validation.ts:3-71`). No chain coupling. **New token-launch/LP/vesting endpoints should add Zod schemas here.**

### 1.7 Notifications — `lib/notifications.ts`
- Expo push (`exp.host`) + DB persistence. `createAndPushNotification` writes a `Notification` row then best-effort pushes (`notifications.ts:56-106`). Typed helpers: `notifyNewPost`, `notifyNewComment`, `notifyNewFollow`, `notifyNewLike`, `notifyCreatorApproval` (`notifications.ts:111-209`). No chain coupling. **Token-launch lifecycle events (deploy started/succeeded/graduated, fundraise threshold hit, vesting cliff) would add helpers here.**

### 1.8 KYC — `lib/veriff.ts`
- `createVeriffSession` (callback `${NEXT_PUBLIC_API_URL}/api/kyc/webhook`, `vendorData=userId`), `verifyWebhookSignature` (HMAC-SHA256, timing-safe), `mapVeriffStatus` (9001→VERIFIED, 9102/3/4→REJECTED), `parseVeriffWebhookEvent` (`veriff.ts:25-114`). No chain coupling.

### 1.9 Solana RPC/Balances — `lib/helius.ts`  ✅ KEEP
- `getHeliusConfig` builds mainnet/devnet RPC from `HELIUS_API_KEY` + `SOLANA_NETWORK` (`helius.ts:3-14`).
- `getSolBalance` (RPC `getBalance`), `getTokenBalances` (DAS `searchAssets`, fungible, with prices/24h change), `fetchWalletBalance` (combines + CoinGecko SOL price) (`helius.ts:21-138`).
- **Chain: Solana (canonical). KEEP & extend.** Token-launch/holdings discovery for creator tokens will lean on Helius DAS here.

### 1.10 Jupiter Swap — `lib/jupiter.ts`  ✅ KEEP
- `lite-api.jup.ag` (free) or `api.jup.ag` if `JUPITER_API_KEY` (`jupiter.ts:14-16`).
- **Platform fee:** `MOMENTO_PLATFORM_FEE_BPS` (default **400 = 4%**) → fee taken from output token to `MOMENTO_FEE_WALLET`'s ATA. `deriveATA` derives the fee account on-chain; falls back to feeless quote if ATA can't be derived/funded (`jupiter.ts:39-45, 84-86, 136-244`).
- `getSwapQuote` + `buildSwapTransaction` (returns base64 unsigned tx for client signing).
- **Chain: Solana. KEEP.** This is the closest existing analogue to the new **tax routing (1% in-app vs 10% elsewhere)** and **fee-kept-by-creator+Momento** flow. Note current fee model is a single flat platform fee to one wallet — the new model needs configurable split (creator + Momento) and differentiated in-app vs external rates. Header comment already anticipates creator-token trading (`jupiter.ts:6-9`).

### 1.11 Base RPC/Balances — `lib/base.ts`  ❌ REMOVE
- Alchemy / public Base RPC; ETH + ERC-20 balances (USDC/DAI/WETH known list or `alchemy_getTokenBalances`), CoinGecko ETH price, `fetchBaseWalletBalance` (`base.ts:1-328`). **Chain: Base/EVM. DELETE on migration.**

### 1.12 Base Swap (KyberSwap) — `lib/base-swap.ts`  ❌ REMOVE
- KyberSwap aggregator on Base (chainId 8453); two-step quote→build; platform fee on `currency_out` to `BASE_FEE_WALLET`; taker cross-check (`base-swap.ts:1-361`). **Chain: Base/EVM. DELETE on migration.**

---

## 2. Wallet Routes (DEEP DIVE) — `app/api/wallet/**`

All require auth (`requireAuth`) and accept `?chain=solana|base` (default solana). All return `{ success, data | error }`.

### 2.1 `GET|POST /api/wallet/swap` — `wallet/swap/route.ts`
- **GET (quote)** (`swap/route.ts:24-102`): rate-limit `readLimiter`. If `chain==='base'` → `getBaseSwapQuote` (KyberSwap, requires Base wallet as taker). Else Solana → `getSwapQuote` (Jupiter); params `inputMint`(def SOL), `outputMint`(def USDC), `amount`, `slippageBps`(def 50).
- **POST (build)** (`swap/route.ts:117-185`): rate-limit `writeLimiter`. Body `{ chain, quoteResponse }`. Base → `buildBaseSwapTransaction` (taker cross-check). Solana → `buildSwapTransaction` (returns base64 unsigned tx; rejects `pending-` wallet).
- **External:** Jupiter (Solana) / KyberSwap + Alchemy (Base). **Chain coupling: HIGH.** Migration: delete Base branches; this route is the **primary template** for creator-token buy/sell + tax routing.

### 2.2 `POST /api/wallet/send` — `wallet/send/route.ts`
- `writeLimiter`. Body `{ recipientAddress, amount(human), token: SOL|USDC|ETH, chain }` (`send/route.ts:75-213`).
- **Solana:** builds unsigned `Transaction` — SOL via `SystemProgram.transfer`, USDC via SPL `createTransferInstruction` with on-the-fly recipient-ATA creation; sets recent blockhash + fee payer; serializes base64 for client signing. USDC mint switches devnet/mainnet on `SOLANA_NETWORK` (`send/route.ts:58-62, 137-197`). Uses `@solana/web3.js` + `@solana/spl-token`, RPC `SOLANA_RPC_URL`.
- **Base:** `handleBaseSend` (`send/route.ts:220-297`) — native ETH value tx or ERC-20 `transfer(address,uint256)` calldata to USDC, chainId 8453. **Chain coupling: HIGH.** Migration: drop `ETH` token, `chain==='base'` branch, `handleBaseSend`.

### 2.3 `GET /api/wallet/onramp` — `wallet/onramp/route.ts`
- `readLimiter`. Query `provider: ramp|moonpay|transak` (def ramp), `chain`. Resolves wallet via `getWalletForChain`, returns hosted-widget URL for fiat→USDC (`onramp/route.ts:237-297`).
- Providers: **Ramp** (`buildRampUrl`, asset `SOLANA_USDC`/`BASE_USDC`), **MoonPay** (`buildMoonPayUrl`, `usdc_sol`/`usdc_base`, brand color `#00FF88`), **Transak** (2-step access-token flow w/ in-memory cache + direct-URL fallback) (`onramp/route.ts:18-227`).
- **Chain coupling: MEDIUM** (chain only selects asset/network slug). **Migration relevance HIGH:** roadmap wants **Moonpay via Privy**. Current MoonPay is a raw hosted-URL builder, **not** Privy's onramp integration and **MoonPay URLs are unsigned** (`MOONPAY_API_KEY` only, no `signature` param) — needs rework. Decide whether to keep Ramp/Transak or consolidate on Privy+Moonpay.

### 2.4 `GET /api/wallet/balance` — `wallet/balance/route.ts`
- `readLimiter`. Resolves wallet; empty-balance shortcut if none (`balance/route.ts:18-35`). Cached via `cacheKeys.walletBalance(userId, chain)` TTL 30s → `fetchBaseWalletBalance` (Base) or `fetchWalletBalance` (Solana, normalized to chain-aware fields) (`balance/route.ts:37-50`). **Side effect:** fire-and-forget `prisma.portfolioSnapshot.create` on every fetch (`balance/route.ts:52-69`). **Chain coupling: HIGH** (Base branch). `WalletBalance` shape still carries legacy `solBalance`/`solPriceUsd` aliases.

### 2.5 `GET /api/wallet/history` — `wallet/history/route.ts`
- `readLimiter`. **Native-coin price chart** (not user txs). `chain==='base' ? 'ethereum' : 'solana'` → CoinGecko `market_chart`; `range` ∈ 24H/7D/1M/3M/1Y; cached `priceHistory(coinId, days)` (`history/route.ts:14-49`). **Chain coupling: LOW** (just coinId map).

### 2.6 `GET /api/wallet/snapshots` — `wallet/snapshots/route.ts`
- `readLimiter`. Reads `PortfolioSnapshot` rows for user+chain within range, downsamples to ≤200 points, returns `{t,p,native,sol,tokens}` (sol = backward-compat alias) (`snapshots/route.ts:14-69`). **Chain coupling: LOW** (chain filter + alias).

### 2.7 `GET /api/wallet/transactions` & `POST /api/wallet/transactions/log`
- **GET** (`transactions/route.ts:13-65`): `readLimiter`, cursor pagination over `WalletTransaction` (user+chain), 30s cache.
- **POST /log** (`transactions/log/route.ts:14-82`): `writeLimiter`. Idempotent upsert keyed `userId_chain_signature`. Validates `chain ∈ {solana,base}`, `type ∈ {swap,send,receive,fund}`. Called by mobile after on-chain confirmation; invalidates tx cache. **Chain coupling: MEDIUM** (chain in unique key + validation). **Migration relevance:** new on-chain actions (token deploy, LP add, vesting claim, fee claim) likely add new `type` values here or a sibling table.

---

## 3. Non-Wallet Route Inventory

### 3.1 Creators — `app/api/creators/**`
| Route | Method | Purpose | Auth | Limiter | Chain |
|---|---|---|---|---|---|
| `creators/apply` (`apply/route.ts:8`) | POST | Start creator KYC; `SKIP_KYC=true` dev bypass auto-promotes + logs `PromotionLog`; else TOCTOU-safe NONE/REJECTED→PENDING then `createVeriffSession` + `KycRecord` | requireAuth | kycLimiter | none |
| `creators/nearby` (`nearby/route.ts:10`) | GET | PostGIS `ST_DWithin`/`ST_Distance` radius search of approved creators; cursor by distance | public | readLimiter | none |
| `creators/leaderboard` (`leaderboard/route.ts:8`) | GET | Trending (top-post likes) + most-active (postCount); raw SQL; cached 5m | public | readLimiter | none |
| `creators/[id]` (`[id]/route.ts:17`) | GET | Creator profile + distance (haversine) + reverse-geocode city (Nominatim) + isFollowing | public/opt | readLimiter | none |
| `creators/[id]/posts` (`[id]/posts/route.ts:8`) | GET | Paginated creator posts, cached | public | readLimiter | none |
| `creators/[id]/follow` (`[id]/follow/route.ts:9`) | POST | Toggle follow/unfollow; transactional counter updates; notify | requireAuth | writeLimiter | none |

### 3.2 Admin — `app/api/admin/**` (all `requireAdmin`, `failClosed` rate limit, auth-before-limit)
| Route | Method | Purpose |
|---|---|---|
| `admin/promotions` (`promotions/route.ts:20`) | GET | List last 200 `PromotionLog` rows |
| `admin/users/[id]/promote-creator` (`promote-creator/route.ts:22`) | POST | Promote user→CREATOR (VERIFIED, approved) + audit log |
| `admin/users/pending-creators` (`pending-creators/route.ts:23`) | GET | List USERs with kyc NONE/PENDING |

### 3.3 KYC — `app/api/kyc/webhook` (`webhook/route.ts:7`)
- POST. **Public but HMAC-verified** (`x-hmac-signature`). On VERIFIED: tx-updates `KycRecord` + `User` (role→CREATOR, isAdminApproved). Invalidates caches, notifies. No chain coupling.

### 3.4 Users — `app/api/users/**`
- `users/[id]` GET (public profile, role-gated fields, isFollowing) · `users/me` GET/PATCH (own profile; PATCH validates username uniqueness, `tokenSymbol`, socialLinks) · `users/me/delete` POST (cascade delete + media cleanup) · `users/me/following` GET · `users/me/location` POST · `users/me/push-token` POST · `users/me/saved` GET/POST. All `requireAuth` except public `users/[id]`. No chain coupling.

### 3.5 Posts / Feed / Social — `app/api/{posts,feed,comments,search,notifications}`
- `posts` POST (requireCreator, writeLimiter) · `posts/[id]` GET(public)/DELETE(author|admin) · `posts/[id]/like` POST (toggle) · `posts/[id]/comments` GET/POST · `comments/[id]` DELETE (author|post-creator|admin) · `feed` GET (smart/recent/popular/nearby/following ranking, optional auth, `fast=true` skips auth) · `search` GET (creators+posts) · `notifications` GET/POST (mark read). **No chain coupling anywhere.**

### 3.6 Ops — `health`, `keep-warm`, `uploads/presign`, `waitlist`, `debug/auth`
- `health` GET (DB `SELECT 1`, 200/503) · `keep-warm` GET (Vercel cron `*/5`, gated on `CRON_SECRET` fail-open) · `uploads/presign` POST (requireAuth → Supabase signed URL) · `waitlist` POST (**no rate limit**, JSON file persistence) · `debug/auth` GET (**verifies Privy token, leaks token preview — consider removing for prod**). No chain coupling.

---

## 4. Scripts & Cron — `scripts/*`, `vercel.json`
- `apply-postgis.ts` — idempotent PostGIS setup (geography cols, GIST indexes, triggers, backfill); runs in `vercel-build`. No chain coupling.
- `grant-admin.ts` — toggle `isAdmin` by email. `promote-to-creator.ts` — bulk promote USERs→CREATOR.
- `fix-broken-video-urls.ts`, `fix-cache-control.ts` — one-off media/storage migrations.
- `prisma/seed.ts` — DB seed (not chain-coupled; referenced by `fix-broken-video-urls`).
- **Cron:** only `keep-warm` (`vercel.json:7-12`). **No on-chain cron jobs exist** — future fundraise-threshold checks, vesting unlock processing, or fee sweeps would need new cron entries here (or a worker outside Vercel's time limits).
- **`vercel.json`:** region `iad1`; permissive CORS `Access-Control-Allow-Origin: *` on `/api/*`; security headers; long-cache for static assets.

---

## 5. Data Model — `prisma/schema.prisma` (chain-relevant)
- **`User`** (`schema.prisma:29-68`): `walletAddress` (Solana, unique), `baseWalletAddress` (unique, **EVM — drop**), `primaryChain` default `"solana"` (**drop/simplify**), `tokenSymbol`, `relation creatorTokens`.
- **`CreatorToken`** (`schema.prisma:198-226`) ⭐ **DORMANT — exists, no routes**: `chain`, `name`, `symbol`, `mintAddress` (unique), `decimals` (def 9), `totalSupply`/`circulatingSupply` (string), `poolAddress`, `poolType` (`BONDING_CURVE|RAYDIUM|AERODROME`), `bondingCurveParams` (Json), `status` (`PENDING|DEPLOYING|ACTIVE|FAILED|GRADUATED`), `deployTxSignature`, `deployedAt`, `graduatedAt`. Unique `(userId, chain)`. **Note:** enums reference Raydium/Aerodrome — roadmap wants **Meteora/Bags**, so `PoolType` needs new members; one-token-per-user-per-chain unique constraint may conflict with future multi-token launches.
- **`WalletTransaction`** (`schema.prisma:243-261`): chain + type history, unique `(userId,chain,signature)`.
- **`PortfolioSnapshot`** (`schema.prisma:228-241`): per-chain value snapshots.
- **`PromotionLog`** (`schema.prisma:263-275`): creator-promotion audit.
- Others (no chain coupling): `Post`, `Like`, `Comment`, `Follow`, `KycRecord`, `SavedPost`, `Notification`.

---

## 6. Where New Endpoints Should Live

New objectives map to net-new route groups under `app/api/` (none exist today). Suggested placement, reusing the established patterns (Zod in `lib/validation.ts`, `requireCreator`/`requireAuth`, rate limiters, client-signed unsigned-tx pattern from `wallet/swap` + `wallet/send`, audit pattern from `PromotionLog`, lifecycle pushes via `lib/notifications.ts`):

| Objective | Suggested route(s) | Notes |
|---|---|---|
| **Token launch** (Meteora/Bags) | `app/api/creators/token/route.ts` (POST create/deploy, GET status) — or `app/api/tokens/**` | Wire the dormant `CreatorToken` model. New lib `lib/meteora.ts` / `lib/bags.ts` (parallel to `jupiter.ts`). Extend `PoolType` enum (METEORA/BAGS). Build unsigned tx → client signs (same as swap/send). |
| **LP / fundraise config** (threshold + splits) | `app/api/creators/token/fundraise/route.ts` (config CRUD), worker/cron to detect threshold | Needs new model(s): fundraise config, contributions, split config. No data model exists yet. Threshold detection = new cron (none on-chain today). |
| **Fee accounting / claiming** | `app/api/creators/token/fees/route.ts` (GET accrued, POST claim) | Generalize `jupiter.ts` fee logic from single flat fee to **creator+Momento split**. New model for fee ledger; `WalletTransaction.type` += `claim`. |
| **Vesting** (Streamflow) | `app/api/creators/token/vesting/route.ts` | New `lib/streamflow.ts`; new vesting-schedule model; client-signed claim tx; vesting-cliff cron + push. |
| **Tax routing** (1% in-app vs 10% elsewhere) | Modify `lib/jupiter.ts` + `wallet/swap` to apply differentiated fee bps based on whether the trade is an in-app creator-token swap | Today there is one `MOMENTO_PLATFORM_FEE_BPS` (4%). Needs config of in-app vs external rate + creator/Momento split destinations. |
| **Onramp via Privy + Moonpay** | Rework `wallet/onramp` MoonPay branch | Current impl builds an **unsigned** MoonPay hosted URL directly; switch to Privy's onramp / signed MoonPay flow. |

---

## 7. Migration Surface Summary (Base removal)
**Delete:** `lib/base.ts`, `lib/base-swap.ts`; Base branches in `wallet/{swap,send,balance,onramp,history,snapshots}` and `transactions/log` validation; `getWalletForChain`/`getChainParam` Base branches + Base wallet extraction in `auth.ts`; Base entries in `packages/shared/constants.ts` `CHAIN_CONFIG` and `ChainType`. **Simplify/drop DB:** `User.baseWalletAddress`, `User.primaryChain`; `PoolType.AERODROME`; consider collapsing the `chain` column usage. **Keep & extend:** `lib/helius.ts`, `lib/jupiter.ts` (Solana). Env vars to retire: `ALCHEMY_API_KEY`, `BASE_RPC_URL`, `BASE_FEE_WALLET`, `BASE_AGGREGATOR_URL`, `KYBER_CLIENT_ID`.

---

## 8. Risks & Unknowns
1. **`CreatorToken` is dormant & partly mismatched** — model/enums assume Raydium/Aerodrome + one-token-per-user; roadmap is Meteora/Bags + (likely) richer token lifecycle. Expect schema changes, not just new routes.
2. **Fee model is single-flat-fee** (`MOMENTO_PLATFORM_FEE_BPS=400`, one `MOMENTO_FEE_WALLET`). The new creator+Momento split and 1%/10% in-app-vs-external tax have **no scaffolding** — `jupiter.ts` and `wallet/swap` need redesign, plus a fee ledger.
3. **No on-chain background jobs.** Only `keep-warm` cron exists. Fundraise-threshold detection, vesting unlocks, and fee sweeps need new cron/worker infra (Vercel function time limits may force an external worker).
4. **Onramp/MoonPay is not Privy-integrated and URLs are unsigned** — security/compliance review needed before "Moonpay via Privy."
5. **`debug/auth` leaks token preview** and **`waitlist` has no rate limit** — minor but worth closing during the rebuild.
6. **`SKIP_KYC=true` auto-promotes creators** — ensure disabled in prod before money flows.
7. **Network ambiguity:** `SOLANA_NETWORK` defaults to `devnet` (`helius.ts:6`) and USDC mint switches on it (`send/route.ts:61`) — confirm mainnet config for launch.
8. **Client-signed tx trust boundary:** the API builds txs the client signs; quote/build wallet cross-checks exist for Base swap but verify equivalent safeguards for every new on-chain build endpoint (fee account, recipient, amount).
