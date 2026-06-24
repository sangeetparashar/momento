# D-API — Phase 2 API Surface, Authorization Model & Phase 3 Endpoint Contracts

> **Scope.** Design-only. Defines (a) the Phase 2 endpoints to **build now** — the Helius
> webhook ingest + fee/trade summary reads — and (b) **contract-only** Phase 3 endpoints
> (names + request/response shapes, no implementation). Momento is **Solana-only**;
> there is no `chain` parameter on any new endpoint.
>
> **Grounding.** Follows the conventions established in `apps/api/app/api/wallet/*`
> (Next.js App Router route handlers, `{ success, data | error }` envelope, `requireAuth`/
> `requireCreator`/`requireAdmin` from `lib/auth.ts`, Zod schemas via `validateBody` in
> `lib/validation.ts`, `applyRateLimit` from `lib/ratelimit.ts`), the HMAC webhook pattern
> from `app/api/kyc/webhook/route.ts` + `lib/veriff.ts`, and the **client-signed tx**
> pattern (API builds an unsigned base64 tx, mobile signs via Privy and self-submits,
> then POSTs to `/wallet/transactions/log`).
>
> See also: `research/02-api-backend.md` §6 (route placement), §5 (data model),
> `research/01-mobile-app.md` §5 (mobile trade flow).

---

## 0. Conventions (apply to every endpoint below)

- **Runtime:** Next.js App Router route handlers (`export async function GET/POST(request: NextRequest)`).
- **Envelope:** every response is `{ success: true, data: <T> }` or `{ success: false, error: <string> }`.
  Validation failures use `validateBody(schema, body)` → `400` with `Validation error: <path>: <msg>`.
- **Auth precedence:** check rate limit first for **public/read** routes (cheap reject), but
  for **admin** routes check auth *before* the limiter and pass `failClosed: true` (mirrors
  `app/api/admin/*`). Webhook routes verify the shared secret *before* any DB work.
- **Money values:** all on-chain amounts are **strings in smallest units** (lamports / token
  base units) to preserve precision (same convention as `WalletTransaction.inputAmount`,
  `CreatorToken.totalSupply`). USD/display values are `number`. Basis points are `number`.
- **Wallet gating:** any endpoint that builds a tx for the user must reject a `pending-`
  wallet via `getWalletForChain(user)` returning `null` → `400 "Wallet not ready"` (matches
  `wallet/swap` POST).
- **Idempotency:** all on-chain ingest + log writes upsert on a natural key (e.g. tx
  signature) so retries/replays are no-ops.

---

## 1. Authorization Model

Four caller classes. Each new endpoint declares exactly one.

| Class | How verified | Helper | Failure |
|---|---|---|---|
| **Public** | none | — | n/a |
| **User** | Privy JWT `Authorization: Bearer` | `requireAuth(request)` (reuses `lib/auth.ts` → `PrivyClient.verifyAuthToken`) | `401` |
| **Creator** | Privy JWT + `role === 'CREATOR'` | `requireCreator(request)` | `401` / `403` |
| **Admin** | Privy JWT + `isAdmin` | `requireAdmin(request)`, `failClosed: true` | `401` / `403` / `503` |
| **Webhook (Helius)** | Shared-secret + replay protection (below) | new `lib/helius-webhook.ts::verifyHeliusWebhook` | `401` |

### 1.1 Who reads what

- **Trade/fee summaries are public reads.** Token-level trade volume, price, and aggregate
  fee stats are public market data (the creator-token TOKEN tab and market screens render
  for unauthenticated/guest users — `research/01-mobile-app.md` §2). So
  `GET /api/tokens/[mint]/trades` and `GET /api/tokens/[mint]/fees` are **public**
  (optional auth only to personalize). Rate-limited by IP via `readLimiter`.
- **Per-creator fee summary** (`GET /api/creators/[id]/fees`) is **public** for the
  *display* figures (lifetime volume, lifetime fees generated). The **claimable / unclaimed
  balance** and **claim history** are **Creator-or-Admin** — only the token owner (or an
  admin) may see what is owed/claimable. Implemented as a single route that widens the
  payload when `requireAuth` resolves to the owner or admin; otherwise returns the public
  subset only.
- **Claims are admin-gated.** Fee claiming (Phase 3 `POST /api/creators/[id]/fees/claim`)
  is `requireAdmin` per the LOCKED platform-action model: claims are executed by the
  **Privy server wallet** (Momento signs), not client-signed. Admin gating + `failClosed`
  rate limiting + a `PromotionLog`-style audit row.

### 1.2 Webhook auth: shared secret + replay protection

The Helius webhook is a public URL receiving on-chain events. Three layers (new
`lib/helius-webhook.ts`, modeled on `lib/veriff.ts::verifyWebhookSignature`):

1. **Shared secret.** Helius is configured (dashboard) to send an `Authorization` header
   equal to `HELIUS_WEBHOOK_SECRET`. We compare it with `crypto.timingSafeEqual`. If Helius
   "auth header" is opaque, alternatively HMAC the raw body with the secret and send it as a
   custom header — same `timingSafeEqual` check on the hex digest as Veriff. Reject `401`
   before any parsing/DB work (read `request.text()` raw first, exactly like the KYC route).
2. **Replay protection.** Each Helius event carries a transaction `signature`. We dedupe on
   it: a Redis `SETNX` key `helius:evt:<signature>` with TTL (e.g. 10 min) rejects fast
   replays; the durable guarantee is the **idempotent upsert** on the persisted row's unique
   key (`signature`). A replayed event therefore produces zero side effects. (No timestamp
   window is required because the signature is globally unique and our writes are idempotent;
   a freshness check `slot`/`blockTime` can be added to drop very old replays.)
3. **Fail-closed.** Unlike user-facing rate limits, webhook signature failure is always a
   hard `401`. No rate limiter on the webhook itself (Helius is the only legitimate caller
   and is already authenticated); optionally an IP allowlist if Helius publishes ranges.

---

## 2. PHASE 2 — BUILD NOW

### 2.1 `POST /api/webhooks/helius` — on-chain event ingest

**Auth:** Webhook (shared secret + replay protection). **Limiter:** none (secret-gated).
**Lib modules:** `lib/helius-webhook.ts` (new — verify + parse), `lib/prisma.ts`,
`lib/redis.ts` (dedupe + cache invalidation), `lib/notifications.ts` (lifecycle pushes).
**Route file:** `app/api/webhooks/helius/route.ts`.

Helius "enhanced transaction" / address-activity webhooks POST a JSON **array** of events.
The handler verifies the secret on the raw body, then for each event idempotently records
the relevant on-chain activity and invalidates affected caches. Phase 2 ingests the event
types we already have data for and that feed the summary endpoints:

- **Trades** against a creator-token pool (Meteora DBC/DAMM v2 swaps) → persist a trade row
  (mint, side buy/sell, in/out amounts, price, trader, signature, slot, blockTime) and the
  **fee** taken (Token-2022 transfer-fee + platform split) → fee-ledger row.
- **Transfer-fee accrual / withheld-amount** events on the Token-2022 mint → fee-ledger row.
- (Forward-compatible) **token deploy / pool graduate** confirmations → flip
  `CreatorToken.status` and fire `notifyTokenLifecycle` (Phase 3 wires the producers; the
  ingest switch is structured to accept these now).

> **Data model note (design-time, no migration here):** Phase 2 ingest assumes two new
> tables land with Phase 3's schema work — `TokenTrade` (per-swap) and `FeeLedger`
> (per-fee-event, with `claimed` boolean + claim tx). The summary endpoints (§2.2) read
> these. If schema is not yet available when this route is built, the handler persists into
> a single append-only `OnchainEvent(signature unique, type, mint, payload Json)` staging
> table and the summaries aggregate from it — same contracts, thinner storage. This keeps
> Phase 2 shippable independent of the Phase 3 migration.

**Request body** (Helius-shaped; we only read what we need):
```jsonc
// application/json — array of enhanced-tx events
[
  {
    "signature": "5xq...",          // unique — idempotency + replay key
    "slot": 0,
    "timestamp": 0,                  // blockTime (unix seconds)
    "type": "SWAP",                  // SWAP | TRANSFER | TOKEN_MINT | ...
    "source": "METEORA",
    "accountData": [ /* ... */ ],
    "tokenTransfers": [ { "mint": "...", "fromUserAccount": "...", "toUserAccount": "...", "tokenAmount": 0 } ],
    "events": { /* helius-parsed swap/fee detail */ }
  }
]
```

**Response:**
```jsonc
{ "success": true, "data": { "received": 12, "processed": 12, "skipped": 0 } }
// 401 { "success": false, "error": "Invalid signature" }
```
Always returns `200` for *processable but already-seen* events (skipped++) so Helius does
not retry-storm. Returns `401` only on secret failure; `5xx` only on unexpected error
(Helius will retry, which is safe given idempotency).

**Validation:** Zod `heliusWebhookSchema` (new in `lib/validation.ts`) — `z.array` of a lax
event object (`signature: z.string()`, `type: z.string()`, passthrough the rest). We
intentionally tolerate unknown fields (`.passthrough()`).

---

### 2.2 Fee / trade summary reads

All **public reads** (optional auth for owner-widened fee payload), `readLimiter` keyed by
user-or-IP, cached via `getOrSetCache` with short TTL. **Lib modules:** new `lib/fees.ts`
(aggregation helpers over `FeeLedger`/`TokenTrade` or the staging table), `lib/prisma.ts`,
`lib/redis.ts`.

#### `GET /api/tokens/[mint]/trades` — per-token trade summary
**Route:** `app/api/tokens/[mint]/trades/route.ts`. **Auth:** Public. **Limiter:** `readLimiter`.
**Query:** `range` ∈ `24H|7D|1M|3M|1Y|ALL` (default `24H`), `granularity` ∈ `hour|day`
(optional, derived from range), `limit` for recent-trades tail (default 50, max 200).

```jsonc
// 200
{
  "success": true,
  "data": {
    "mint": "Hxk...",
    "range": "24H",
    "summary": {
      "priceUsd": 0.0042,
      "priceChangePct": 12.5,
      "volumeUsd": 18450.12,
      "volumeBase": "4392000000",
      "buyCount": 312,
      "sellCount": 188,
      "uniqueTraders": 274,
      "high": 0.0051, "low": 0.0039
    },
    "series": [ { "t": 1719100800, "p": 0.0041, "v": 1203.4 } ],  // OHLC-lite points
    "recent": [
      { "signature": "5xq...", "t": 1719187200, "side": "buy",
        "amountBase": "1000000000", "amountUsd": 4.2, "priceUsd": 0.0042, "trader": "9aZ..." }
    ]
  }
}
```

#### `GET /api/tokens/[mint]/fees` — per-token fee summary
**Route:** `app/api/tokens/[mint]/fees/route.ts`. **Auth:** Public (owner/admin widened).
**Limiter:** `readLimiter`. **Query:** `range` (same enum, default `ALL`).

```jsonc
// 200 (public subset)
{
  "success": true,
  "data": {
    "mint": "Hxk...",
    "range": "ALL",
    "transferFeeBps": 400,                  // Token-2022 configured transfer fee
    "feesGeneratedUsd": 920.55,             // lifetime fees this token produced
    "feesGeneratedBase": "219000000000",
    "split": { "creatorBps": 200, "momentoBps": 200 },
    // present ONLY when caller is token owner or admin:
    "claimable": { "creatorUsd": 410.10, "creatorBase": "97600000000",
                   "momentoUsd": 410.10, "lastClaimAt": 1719000000 }
  }
}
```

#### `GET /api/creators/[id]/fees` — per-creator fee summary
**Route:** `app/api/creators/[id]/fees/route.ts`. **Auth:** Public (owner/admin widened).
**Limiter:** `readLimiter`. Aggregates across all tokens owned by creator `id` (today
one-per-creator, but written to sum a list). Same shape as token-fees with an added
`perToken: [...]` breakdown; the `claimable` block appears only for the creator themself
or an admin.

```jsonc
// 200
{
  "success": true,
  "data": {
    "creatorId": "usr_...",
    "lifetime": { "volumeUsd": 184500.0, "feesGeneratedUsd": 920.55 },
    "perToken": [ { "mint": "Hxk...", "symbol": "DEEL", "feesGeneratedUsd": 920.55 } ],
    "claimable": { "creatorUsd": 410.10, "momentoUsd": 410.10 }  // owner/admin only
  }
}
```

---

## 3. PHASE 3 — CONTRACT ONLY (names + shapes, no implementation)

Each follows the client-signed tx pattern unless marked **server-signed (platform action)**.
Lib mapping uses planned modules: `lib/launch.ts` (Meteora DBC/DAMM v2 deploy), `lib/trade.ts`
(creator-token buy/sell routing + Token-2022 fee), `lib/vesting.ts` (Streamflow/Jupiter Lock),
`lib/signer.ts` (Privy **server-wallet** signing for platform actions), `lib/fees.ts` (claim
ledger). New Zod schemas land in `lib/validation.ts`; new tx `type` values
(`launch`, `buy`, `sell`, `claim`, `vest_create`, `vest_withdraw`) extend
`wallet/transactions/log`.

> All "build" responses return `{ transaction: <base64 unsigned tx>, ... }`; mobile signs
> via Privy and self-submits, then POSTs the confirmed signature to
> `/api/wallet/transactions/log`. "Status" reads return persisted state.

### 3.1 Token launch

**`POST /api/tokens/launch`** — Creator. Limiter: `writeLimiter`. Lib: `lib/launch.ts`.
Builds the unsigned Token-2022 mint + Meteora DBC pool-init tx for the creator to sign.
Persists a `PENDING`/`DEPLOYING` `CreatorToken` row.
```jsonc
// req (Zod launchTokenSchema)
{ "name": "Deel Token", "symbol": "DEEL", "description": "...", "imageUrl": "https://...",
  "totalSupply": "1000000000", "transferFeeBps": 400,
  "feeSplit": { "creatorBps": 200, "momentoBps": 200 },
  "fundraise": { "targetUsd": 25000, "lpAllocPct": 50, "creatorAllocPct": 30, "momentoAllocPct": 20 } }
// res
{ "success": true, "data": { "tokenId": "ct_...", "mintAddress": "Hxk...",
  "transaction": "<base64-unsigned>", "poolType": "METEORA_DBC", "status": "DEPLOYING" } }
```

**`GET /api/tokens/[mint]`** — Public. Limiter: `readLimiter`. Lib: `lib/prisma.ts` + `lib/helius.ts`.
Token detail for the creator TOKEN tab (replaces the hard-coded placeholder in
`creator/[id].tsx`).
```jsonc
{ "success": true, "data": {
  "mint": "Hxk...", "name": "Deel Token", "symbol": "DEEL", "imageUrl": "...",
  "decimals": 9, "totalSupply": "1000000000", "circulatingSupply": "120000000",
  "status": "ACTIVE", "poolType": "DAMM_V2", "poolAddress": "...",
  "priceUsd": 0.0042, "marketCapUsd": 504000, "transferFeeBps": 400,
  "creator": { "id": "usr_...", "username": "deel", "verified": true },
  "graduatedAt": 1719000000 } }
```

### 3.2 Trade (creator-token buy / sell)

**`POST /api/tokens/[mint]/buy`** — User. Limiter: `writeLimiter` (consider `swapLimiter`).
Lib: `lib/trade.ts` (routes via Meteora; applies Token-2022 transfer fee + in-app rebate).
```jsonc
// req { "amountInBase": "5000000", "inputMint": "USDC", "slippageBps": 50 }
// res { "success": true, "data": { "transaction": "<base64-unsigned>",
//        "quote": { "expectedOutBase": "1190000000", "priceUsd": 0.0042,
//                   "feeBase": "200000", "feeBps": 100, "inAppRebateBase": "150000" } } }
```

**`POST /api/tokens/[mint]/sell`** — User. Limiter: `writeLimiter`. Lib: `lib/trade.ts`.
Mirror of buy; `inputMint` = creator token, output = USDC/SOL; same `quote` block with the
external-vs-in-app fee differential (1%/in-app rebate vs ~10% external) surfaced for the
mobile tax-disclosure row.

### 3.3 Claim fees (admin, **server-signed platform action**)

**`POST /api/creators/[id]/fees/claim`** — **Admin**, `failClosed`. Limiter: `writeLimiter`.
Lib: `lib/signer.ts` (Privy **server wallet** signs + submits — *not* client-signed) +
`lib/fees.ts` (ledger). Harvests Token-2022 withheld fees, splits creator/Momento, marks
`FeeLedger` rows `claimed`, writes an audit row. Optional body `{ mint }` to scope to one
token (default: all of creator's tokens).
```jsonc
// res { "success": true, "data": { "claimed": [
//   { "mint": "Hxk...", "creatorBase": "97600000000", "momentoBase": "97600000000",
//     "signature": "3pQ..." } ], "totalCreatorUsd": 410.10 } }
```

### 3.4 Vesting (Streamflow / Jupiter Lock)

**`POST /api/vesting/create`** — Creator. Limiter: `writeLimiter`. Lib: `lib/vesting.ts`.
Builds an unsigned Streamflow lock/stream create tx for the creator to sign.
```jsonc
// req { "mint": "Hxk...", "recipient": "9aZ...", "amountBase": "50000000000",
//       "startAt": 1719000000, "cliffAt": 1726000000, "endAt": 1750000000, "unlockEvery": 86400 }
// res { "success": true, "data": { "vestingId": "vs_...", "transaction": "<base64-unsigned>" } }
```

**`GET /api/vesting/list`** — User. Limiter: `readLimiter`. Lib: `lib/vesting.ts`.
Lists streams where caller is creator (`?role=sender`) or recipient (`?role=recipient`,
default), optional `?mint=`.
```jsonc
// res { "success": true, "data": { "streams": [
//   { "vestingId": "vs_...", "mint": "Hxk...", "symbol": "DEEL", "role": "recipient",
//     "totalBase": "50000000000", "withdrawnBase": "12000000000",
//     "claimableBase": "3000000000", "cliffAt": 1726000000, "endAt": 1750000000,
//     "status": "active" } ] } }
```

**`POST /api/vesting/[id]/withdraw`** — User (recipient). Limiter: `writeLimiter`. Lib: `lib/vesting.ts`.
Builds an unsigned withdraw/claim tx for the recipient to sign.
```jsonc
// req { } (id in path)
// res { "success": true, "data": { "transaction": "<base64-unsigned>",
//        "claimableBase": "3000000000" } }
```

---

## 4. Endpoint → Lib Module Map

| Endpoint | Phase | Auth | Limiter | Primary lib module(s) |
|---|---|---|---|---|
| `POST /api/webhooks/helius` | **2** | Webhook (secret + replay) | none | `helius-webhook` (new), `prisma`, `redis`, `notifications` |
| `GET /api/tokens/[mint]/trades` | **2** | Public | `readLimiter` | `fees` (new), `prisma`, `redis` |
| `GET /api/tokens/[mint]/fees` | **2** | Public (+owner/admin) | `readLimiter` | `fees` (new), `prisma`, `redis` |
| `GET /api/creators/[id]/fees` | **2** | Public (+owner/admin) | `readLimiter` | `fees` (new), `prisma`, `redis` |
| `POST /api/tokens/launch` | 3 | Creator | `writeLimiter` | `launch` (new), `prisma` |
| `GET /api/tokens/[mint]` | 3 | Public | `readLimiter` | `prisma`, `helius` |
| `POST /api/tokens/[mint]/buy` | 3 | User | `writeLimiter`/`swapLimiter` | `trade` (new) |
| `POST /api/tokens/[mint]/sell` | 3 | User | `writeLimiter`/`swapLimiter` | `trade` (new) |
| `POST /api/creators/[id]/fees/claim` | 3 | **Admin** `failClosed` | `writeLimiter` | `signer` (server wallet), `fees` |
| `POST /api/vesting/create` | 3 | Creator | `writeLimiter` | `vesting` (new) |
| `GET /api/vesting/list` | 3 | User | `readLimiter` | `vesting` (new) |
| `POST /api/vesting/[id]/withdraw` | 3 | User | `writeLimiter` | `vesting` (new) |

## 5. New `lib/validation.ts` schemas to add

- **Phase 2:** `heliusWebhookSchema` (lax array, passthrough); `tradeRangeSchema`
  (`range` enum + `limit`/`granularity`).
- **Phase 3:** `launchTokenSchema`, `tradeOrderSchema` (buy/sell), `claimFeesSchema`,
  `vestingCreateSchema`, `vestingWithdrawSchema`. All validated through the existing
  `validateBody(schema, body)` helper.

## 6. Open questions for Phase 3 (not blocking Phase 2)

1. **Schema:** confirm `TokenTrade` + `FeeLedger` tables (vs. the `OnchainEvent` staging
   fallback in §2.1) and extend `PoolType` enum (`METEORA_DBC`, `DAMM_V2`); the current
   `@@unique([userId, chain])` on `CreatorToken` and the `chain` column should be revisited
   under Solana-only.
2. **Fee split source of truth:** on-chain (Token-2022 fee config) vs. DB — summaries must
   agree with what the claim tx actually moves.
3. **Helius config:** which webhook product (enhanced-tx vs. address-activity) and whether
   it sends a verifiable auth header or requires body-HMAC (drives `helius-webhook.ts`).
4. **Claim cadence:** admin manual vs. cron sweep (no on-chain cron exists today — would be
   a new `vercel.json` entry or external worker).
