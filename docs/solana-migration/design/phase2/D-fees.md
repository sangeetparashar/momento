# D — Fee Accounting, Tax/Rebate Scaffolding & Helius Webhook Ingestion (Phase 2)

> **Status:** Design only. No code beyond this doc. Phase-2 deliverable per `docs/solana-migration/README.md` §11
> ("fee-accounting foundation: `FeeEvent`, webhooks"). The on-chain **Meteora claim CPI is Phase 3** — this doc
> defines the *seam* (`TODO(Phase 3)`) but does not implement claims.
>
> **Grounded in:** research `12-tax-mechanism.md` (rebate is off-token/centralized), `15-lp-economics.md`
> (20% protocol / 80% partner+creator), `05-token-fee-lp-onchain.md` (current flat-4% Jupiter baseline),
> `16-solana-stack.md` (Helius webhooks, Privy server wallets, web3.js v1); spike `spike-a-token2022-fee-rebate.ts`
> (verified Token-2022 fee/harvest/withdraw signatures + gross-up math); code `lib/jupiter.ts`, `lib/redis.ts`,
> `lib/ratelimit.ts`, `lib/auth.ts`, `lib/veriff.ts` (HMAC pattern), `app/api/keep-warm` (cron pattern).

---

## 0. TL;DR / Cross-cutting decisions

1. **Two-axis fee model.** Creator tokens are **Token-2022 mints with a 3–5% Transfer Fee** (default **400 bps**,
   `spike-a`). That fee is charged by the chain on *every* transfer — we cannot make it venue-aware
   (`12-tax-mechanism.md` §1, confirmed). The "1% in-app" target is achieved **off the token**, via **our rebate
   accounting**, not by a different on-chain rate.

2. **Trade classification is provenance-based, not on-chain-detectable.** A trade is `IN_APP` **iff Momento built
   and sponsored/submitted the transaction** (we hold the intent record before the signature exists). Everything
   else seen on the mint is `EXTERNAL`, learned only by **observing** Helius webhooks. This maps directly to
   `FeeEvent.source ∈ {IN_APP, EXTERNAL}`.

3. **Default rebate mechanism = rebate in USDC (CHOSEN).** Paying the rebate *in the creator token* re-incurs the
   3–5% transfer fee (`spike-a` caveat, README finding). We default to **rebate in USDC** because (a) it is
   **fee-exempt** (no second transfer fee, no gross-up rounding drift), (b) it is **dollar-native** matching the
   USDC-quote launchpad (`15` §3) and the Privy USDC onramp, and (c) it cleanly decouples rebate liquidity from
   per-token treasuries. **Gross-up-in-token is the documented fallback** (`spike-a` proved the math) for the case
   where a USDC rebate vault is unavailable for a given token. Mechanism is **per-`FeeEvent`**, recorded in
   `rebateAsset`.

4. **Idempotency / dedupe key = on-chain `signature`** for trade/transfer events (a tx may emit several fee legs,
   so the row key is **`(signature, kind, mint)`**); claim events dedupe on **`claimTxSignature`**. Webhook
   delivery dedupes on a Redis `SETNX` of the raw delivery id *and* the DB unique constraint as the durable
   backstop (webhooks are at-least-once → must be idempotent).

5. **20/80 economics are recorded, not computed by us.** Meteora withholds the **fixed 20% protocol** cut and the
   remaining **80% LP fee** splits **partner(Momento)/creator** by `creator_trading_fee_percentage` (default 50/50
   → Momento 40% / creator 40% / protocol 20% of every fee dollar, `15` §6.2). Phase 2 **records accrual/claim
   `FeeEvent`s** against that split; Phase 3 performs the actual `claimPartnerTradingFee` CPI.

6. **Supersedes the flat-4% Jupiter path.** `lib/jupiter.ts`'s `platformFeeBps`/`feeAccount` model (`05` §1) earns
   $0 on un-seeded mints and is a referral skim, not a fee ledger. The new model makes the **Token-2022 transfer
   fee + Meteora LP fee** the revenue source and `FeeEvent` the single source of truth. Jupiter stays only as a
   routing fallback for **non-creator** mints; its `platformFee` is **disabled for creator-token routes**.

---

## 1. Scope & non-goals

**In scope (Phase 2):** the `FeeEvent`/`Trade` data model; trade classification (`IN_APP` vs `EXTERNAL`); rebate
*computation* + persistence (the on-chain rebate *send* is Phase 4, but the ledger entry and the chosen mechanism
are defined here); the Helius Enhanced Webhook **receiver** (auth, replay protection, parsing, dedupe); the
fee/trade **summary read model**; the partner+creator fee-**claim job** scaffolding (cron) with the Meteora CPI
stubbed as `TODO(Phase 3)`.

**Out of scope (later phases):** actually building/sponsoring swaps through our pool (Phase 4); the Meteora DBC
launch + `claimPartnerTradingFee` CPI (Phase 3); vesting (Phase 5); the in-app rebate *transfer* execution
(Phase 4 — Phase 2 only computes + ledgers the owed amount and `rebateStatus=PENDING`).

---

## 2. Trade classification — `IN_APP` vs `EXTERNAL`

### 2.1 The fundamental constraint

We **cannot** tax or even reliably distinguish external trades on-chain: the Token-2022 transfer fee is flat and
context-blind (`12` §1). External venues (Jupiter/Raydium/Orca/Meteora) trade our transfer-fee tokens fine but we
have **no hook** into them — we can only **OBSERVE** them after the fact via Helius webhooks (CONTEXT: "we CANNOT
tax external trades — only OBSERVE them"). Therefore classification is **provenance at construction time**, never
post-hoc inference.

### 2.2 Decision rule

| Condition (evaluated in order) | `source` |
|---|---|
| Momento built the swap tx (our API returned the unsigned/sponsored tx for this intent) **and** the webhook signature matches a pending `Trade` we created | `IN_APP` |
| Signature touches a watched creator mint but has **no** matching Momento-originated `Trade` intent | `EXTERNAL` |

**Mechanics.** When the API builds an in-app swap (Phase 4 pool route, or the interim Jupiter route for a creator
mint), it writes a `Trade` row in status `BUILT` **keyed by an `intentId`** *before* signing, and — once the
client/relayer returns the signature — patches the row with the `signature`. The webhook receiver then **joins on
`signature`**: a hit ⇒ confirm the existing `IN_APP` `Trade`; a miss ⇒ insert a new `EXTERNAL` `Trade`. This is
robust because the signature is deterministic from the signed tx and we record it the instant we learn it; we never
try to recognize "our" instructions inside an arbitrary parsed tx (which `12` §2 flags as fragile/spoofable).

**Edge cases.**
- *Race (webhook arrives before we persist the signature):* webhook insert lands first as `EXTERNAL`; a
  reconciliation step (the claim cron, §7) re-classifies any `EXTERNAL` `Trade` whose `signature` later matches a
  Momento intent to `IN_APP` and enqueues the owed rebate. Dedupe key `(signature, …)` guarantees no duplicate row.
- *Self-submitted via Helius Sender (`16`):* still `IN_APP` — we hold the intent; classification is unchanged by
  who broadcasts.
- *In-app SEND (not a trade) of a creator token:* it incurs the transfer fee but is **not** a trade → recorded as a
  `FeeEvent` of `kind=TRANSFER_FEE` with `source=IN_APP` but **no rebate** (rebates apply to trades only; policy
  flag `REBATE_NON_TRADE=false`).

---

## 3. Fee taxonomy & the rebate computation

### 3.1 `FeeEvent.kind`

| `kind` | Origin | Recorded by | Notes |
|---|---|---|---|
| `TRANSFER_FEE` | Token-2022 withheld fee on a transfer/swap of a creator mint | webhook (EXTERNAL) or in-app trade builder (IN_APP) | the 3–5% chain fee; `spike-a` |
| `LP_FEE_ACCRUAL` | Meteora DBC/DAMM trading-fee accrual attributable to a pool | claim cron read / webhook on fee accounts | the 80% LP leg; basis for §6 split |
| `PROTOCOL_FEE` | Meteora's fixed 20% | derived/observed | recorded for reconciliation only; Momento never receives it |
| `REBATE` | Our outbound rebate to an in-app trader | rebate ledger (Phase 4 executes) | negative to Momento; `rebateAsset` ∈ {USDC, TOKEN} |
| `FEE_CLAIM` | A `claimPartnerTradingFee` / locked-LP claim landing in a Momento/creator wallet | claim cron (Phase 3 CPI) | dedupe on `claimTxSignature` |

### 3.2 Rebate computation (the core math)

Locked product: on-chain fee 3–5% (default 400 bps); **in-app net target ≈ 100 bps** (`spike-a`
`TARGET_IN_APP_BPS`).

```
chargedFee      = floor(grossAmount * feeBps / 10_000)        // capped at maximumFee  (spike-a calcFee)
targetFee       = floor(grossAmount * TARGET_IN_APP_BPS/10_000)
rebateOwed_net  = chargedFee - targetFee                       // value the trader must receive back
```

`rebateOwed_net` is denominated as **token value**, then converted to the rebate asset:

- **Default — rebate in USDC (fee-exempt):** `rebateUsdc = rebateOwed_net * price(token→USDC)` using the DAS/oracle
  price at fill (`lib/helius.ts` already reads `token_info.price_info`). **No gross-up** (USDC has no transfer fee).
  Slippage on the price snapshot is bounded by recording `priceTs`; the claim/recon job can true-up.
- **Fallback — gross-up in token:** `grossRebate = ceil(rebateOwed_net * 10_000 / (10_000 - feeBps))`; the rebate
  transfer itself is charged `feeBps`, so the trader nets `rebateOwed_net` (exact integer math verified in
  `spike-a` §6, lands in-app effective rate within 0.25pp of target). Use only when no USDC rebate vault exists for
  the token.

**Why USDC default (justification, ties to `12` §3(a) + `spike-a` caveat):** rebate-in-token "re-incurs the
transfer fee" (CONTEXT, spike-a) forcing a gross-up that (a) bleeds extra token supply on every rebate, (b)
compounds rounding, and (c) keeps rebate liquidity fragmented per-mint. USDC sidesteps the fee entirely, is
dollar-native for the reconciliation dashboard (`15` §3), and reuses the Privy USDC rails. Trade-off: requires a
funded USDC rebate vault + a price snapshot per fill (acceptable; we already fetch prices).

### 3.3 Rebate lifecycle (Phase 2 = ledger; Phase 4 = execute)

`REBATE` `FeeEvent` is written with `rebateStatus = PENDING` at trade-confirm time. Phase 4's payout worker (out of
scope here) transitions `PENDING → SENT(claimTxSignature) | FAILED`. Phase 2 must make the *amount* and *asset*
deterministic and idempotent so the payout worker can be a thin executor. Rebates are **batchable** per
trader/token/epoch to amortize fees (esp. the token-gross-up path).

---

## 4. Data model (additive Prisma — forward migration only; never `db push`, per R4)

Two new tables + enums. Mirrors `WalletTransaction`'s unique-signature idiom (`schema.prisma:256`) and the additive
SQL style of `20260411100000_add_creator_token/migration.sql`. Types also added to `packages/shared/src/types.ts`.

```prisma
enum FeeEventKind     { TRANSFER_FEE LP_FEE_ACCRUAL PROTOCOL_FEE REBATE FEE_CLAIM }
enum FeeEventSource   { IN_APP EXTERNAL }          // == trade classification (§2)
enum RebateAsset      { USDC TOKEN }
enum RebateStatus     { NONE PENDING SENT FAILED }
enum TradeSource      { IN_APP EXTERNAL }
enum TradeStatus      { BUILT CONFIRMED FAILED }   // BUILT = intent exists pre-signature (§2.2)

model Trade {
  id            String      @id @default(uuid())
  intentId      String?     @unique               // set when WE build the tx (IN_APP); null for EXTERNAL
  signature     String?                            // on-chain sig; filled at submit (IN_APP) or by webhook (EXTERNAL)
  mint          String                             // creator-token mint observed/traded
  creatorTokenId String?                           // FK to CreatorToken when known
  userId        String?                            // in-app trader (null for EXTERNAL)
  source        TradeSource
  status        TradeStatus @default(BUILT)
  side          String?                            // "buy" | "sell" (best-effort from parse)
  inputMint     String?
  outputMint    String?
  inAmount      String?                            // base units, string for precision
  outAmount     String?
  feeBps        Int?                               // on-chain transfer-fee bps at fill
  priceUsd      Float?                             // token→USD snapshot at fill (for rebate calc)
  priceTs       DateTime?
  blockTime     DateTime?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  feeEvents     FeeEvent[]
  @@unique([signature])                            // dedupe: one Trade per on-chain signature
  @@index([mint, blockTime])
  @@index([creatorTokenId, source, blockTime])
  @@index([userId, blockTime])
  @@index([status])                                // for the recon/claim sweep
  @@map("trades")
}

model FeeEvent {
  id            String         @id @default(uuid())
  kind          FeeEventKind
  source        FeeEventSource
  mint          String
  creatorTokenId String?
  poolAddress   String?
  tradeId       String?                            // FK to Trade when fee derives from a trade
  signature     String?                            // on-chain sig of the originating tx (TRANSFER_FEE/accrual)
  claimTxSignature String?                         // on-chain sig of a FEE_CLAIM / rebate SENT
  // amounts (base units, string)
  grossAmount   String?                            // trade size the fee was computed on
  feeAmount     String?                            // chargedFee (TRANSFER_FEE) | accrued (LP_FEE_ACCRUAL)
  // 20/80 attribution (recorded, not enforced by us — §6)
  protocolAmount String?                           // 20% leg
  partnerAmount  String?                           // Momento leg (of the 80%)
  creatorAmount  String?                           // creator leg (of the 80%)
  // rebate fields (kind=REBATE)
  rebateAsset   RebateAsset?
  rebateAmount  String?                            // in rebateAsset base units
  rebateStatus  RebateStatus  @default(NONE)
  blockTime     DateTime?
  createdAt     DateTime       @default(now())

  trade         Trade?         @relation(fields: [tradeId], references: [id], onDelete: SetNull)

  // DEDUPE: a tx may emit multiple legs, so the natural key is (signature, kind, mint).
  @@unique([signature, kind, mint])
  // claims have their own idempotency key
  @@unique([claimTxSignature, kind])
  @@index([creatorTokenId, kind, blockTime])
  @@index([mint, blockTime])
  @@index([rebateStatus])                          // payout worker queue (Phase 4)
  @@map("fee_events")
}
```

> **Dedupe rationale.** On-chain `signature` is the only globally-unique, replay-proof identity for an event
> (`WalletTransaction` already uses signature uniqueness). One tx → many fee legs → key on `(signature, kind, mint)`.
> Claims may not share the trade signature, so they get `(claimTxSignature, kind)`. Both unique constraints make
> webhook re-delivery and cron re-runs **safe no-ops** (insert-or-ignore).

> **A new `PoolType.METEORA_DBC` / `METEORA_DAMM` should be added** (current enum is `BONDING_CURVE | RAYDIUM`,
> `schema.prisma:191`) and `CreatorToken` gains `feeBps`, `withdrawWithheldAuthority`, `feeClaimer`, `quoteMint`,
> `partnerConfigKey` (Phase 3 needs these; flag here as the schema seam).

---

## 5. Helius Enhanced Webhook RECEIVER

New route: `apps/api/app/api/webhooks/helius/route.ts` (`POST`). Watches each launched creator mint + its
fee-collection/pool accounts (registered via Helius Webhook API at launch time, Phase 3). Helius Enhanced Webhooks
deliver **parsed** Token-2022 transfers and program events (`16` §Helius). Mirrors the existing webhook idioms in
`app/api/kyc/webhook/route.ts` (`request.text()` → verify → parse → idempotent persist).

### 5.1 Auth / verification (shared secret, like `lib/veriff.ts`)

Helius supports a static **`Authorization` header** on webhook config; we also support an HMAC mode for parity with
Veriff. Verification order:

1. **Read raw body** with `await request.text()` (must hash/verify the *raw* bytes, as veriff does).
2. **Constant-time compare** the shared secret:
   - Header mode: `request.headers.get('authorization') === Bearer ${HELIUS_WEBHOOK_SECRET}` via
     `crypto.timingSafeEqual` (never `===` on the secret — copy the veriff `timingSafeEqual` pattern,
     `lib/veriff.ts:77`).
   - HMAC mode (if configured): `HMAC_SHA256(rawBody, HELIUS_WEBHOOK_SECRET)` compared to a signature header,
     identical to `verifyWebhookSignature` (`lib/veriff.ts:66-81`).
3. On mismatch → `401` (do not leak which check failed).

`HELIUS_WEBHOOK_SECRET` is a new env var (documented in `.env.local.example` alongside `CRON_SECRET`).

### 5.2 Replay protection

- **Timestamp window:** reject deliveries whose event `blockTime`/`timestamp` is older than `WEBHOOK_MAX_AGE`
  (default 10 min) **only for the replay check** — but still allow back-fill via an explicit admin reprocess path
  (so a legitimately late delivery isn't lost; the DB unique key is the real guard).
- **Delivery dedupe (fast path):** `SETNX webhook:helius:<deliveryId|sha256(rawBody)>` with a short TTL in Upstash
  (`lib/redis.ts` patterns). A second delivery of the same payload short-circuits to `200` without DB work.
- **Durable dedupe (source of truth):** the `(signature, kind, mint)` / `(claimTxSignature, kind)` unique
  constraints (§4) make any duplicate that slips past Redis an insert-or-ignore no-op. **At-least-once delivery is
  assumed**; correctness never depends on Redis.

### 5.3 Payload parsing

Helius posts an **array** of enhanced tx objects. For each:

1. **Extract `signature`, `timestamp`/`blockTime`, `tokenTransfers[]`, `accountData[]`, `events`.**
2. **Token-2022 transfer / swap legs:** for transfers touching a watched creator mint, compute/parse the
   **withheld fee** (the parsed transfer carries amounts; the fee = `floor(amount*feeBps/10_000)` cross-checked
   against on-chain withheld delta from `accountData`). Emit a `TRANSFER_FEE` `FeeEvent`.
3. **Classify** via §2.2: look up `Trade` by `signature`. Hit → mark `CONFIRMED`, `source=IN_APP`. Miss → create
   `EXTERNAL` `Trade` + `TRANSFER_FEE` event with `source=EXTERNAL`.
4. **Fee-claim / harvest events:** transfers into the `withdrawWithheldAuthority`/fee-vault or `fee_claimer` wallet
   (matches `harvestWithheldTokensToMint`/`withdrawWithheldTokensFromMint` shapes from `spike-a`) → `FEE_CLAIM`
   `FeeEvent` keyed on `claimTxSignature`.
5. **Persist** all events for the batch in **one `prisma.$transaction`** using insert-or-ignore semantics
   (`createMany({ skipDuplicates: true })` against the unique keys) so a partial batch retry is safe.
6. **Invalidate** the affected summary caches (`feeSummary:*`, §6) via `invalidateCache` (`lib/redis.ts`).

### 5.4 Receiver contract

- Always return `200` on successfully-verified-and-enqueued (Helius retries on non-2xx → avoid duplicate-processing
  storms; our dedupe makes retries safe regardless).
- **Heavy parsing off the hot path:** verify + Redis-dedupe + `createMany(skipDuplicates)` is cheap and synchronous;
  anything expensive (price snapshots, rebate computation) is deferred to the claim/recon cron (§7) reading
  `EXTERNAL`/unprocessed rows. Keeps the receiver within Vercel function limits.
- **Rate/abuse:** the shared-secret gate is the primary control; optionally an IP-allow of Helius egress. No Privy
  auth here (it's a machine caller), exactly like `kyc/webhook`.

---

## 6. Summary read model (per token, per creator) + 20/80 mapping

A denormalized read model for the reconciliation dashboard (`15` §6.5). Computed by aggregating `FeeEvent`s; cached
in Upstash with a short TTL (`getOrSetCache`, `lib/redis.ts`), invalidated by the webhook (§5.3) and claim cron.

**Per-token summary** (`feeSummary:token:<mint>`): rolling totals of `grossVolume`, `transferFeeTotal`,
`lpFeeAccrued`, `rebatePaid` (USDC + token-equiv), `inAppVolume` vs `externalVolume`, `tradeCount` by source,
`netMomentoRevenue`, `creatorEarned`, `unclaimedAccrual`.

**Per-creator summary** (`feeSummary:creator:<userId>`): the above summed across the creator's token(s)
(`@@unique([userId, chain])` today = one token/creator, but model supports many).

### 20/80 attribution (the recorded split — `15` §6.2)

For every fee dollar, with default `creator_trading_fee_percentage = 50`:

| Leg | Share | Recorded on `FeeEvent` |
|---|---|---|
| Meteora protocol | **20%** (fixed; host referral carved from *this*) | `protocolAmount` |
| Momento (partner / `fee_claimer`) | **40%** (= 50% of the 80%) | `partnerAmount` |
| Creator | **40%** (= 50% of the 80%) | `creatorAmount` |

We **record** these from the Meteora-reported split / config; we do **not** compute the protocol cut ourselves (it's
withheld on-chain). The summary's `netMomentoRevenue` = Σ`partnerAmount` (LP) + transfer-fee retained after rebates
− rebate cost; `creatorEarned` = Σ`creatorAmount`. **Momento keeps 40% of every fee on every trade anywhere — not
just in-app** (`15` §6.2), which is the key economic property the summary surfaces.

---

## 7. Partner + Creator fee-CLAIM job (cron) — with Phase-3 seam

New route `apps/api/app/api/cron/fee-claim/route.ts`, on the **`keep-warm` cron pattern**
(`app/api/keep-warm/route.ts`): `GET`, gated on `CRON_SECRET` (`Authorization: Bearer ${CRON_SECRET}`,
constant-time), Vercel cron schedule (e.g. every 30 min). Fail-open auth only when `CRON_SECRET` unset (dev), exactly
like keep-warm.

**Responsibilities (Phase 2 — accounting + scaffolding):**
1. **Reconcile classification:** sweep `Trade.status=BUILT`/`EXTERNAL` whose `signature` now matches a Momento
   intent → reclassify `IN_APP`, enqueue `REBATE` (`rebateStatus=PENDING`) per §3 (idempotent via unique keys).
2. **Harvest accounting:** record `TRANSFER_FEE` withheld balances ready to harvest (the actual
   `harvestWithheldTokensToMint` + `withdrawWithheldTokensFromMint` execution — verified signatures in `spike-a` —
   is wired in Phase 3/4; Phase 2 logs the intent + expected amounts).
3. **Claim recording:** when a `claimPartnerTradingFee` / locked-LP claim lands, write a `FEE_CLAIM` `FeeEvent`
   (deduped on `claimTxSignature`) with the 20/80 attribution (§6).

**Phase-3 seam (explicit):**
```ts
// TODO(Phase 3): execute Meteora claims via @meteora-ag/dynamic-bonding-curve-sdk
//   - partner:  claimPartnerTradingFee()  -> fee_claimer = MOMENTO_LP_FEE_CLAIMER  (15 §6.4)
//   - creator:  creator trading-fee + locked-LP fee claim
//   - sign with Privy Server Wallet (@privy-io/node), self-submit via Helius Sender (16)
//   - on confirm: insert FEE_CLAIM FeeEvent { claimTxSignature, partnerAmount, creatorAmount, protocolAmount }
//   Phase 2 ONLY records claims observed via webhook; it does NOT initiate the CPI.
```
Likewise the **rebate execution** (`REBATE` `PENDING → SENT`) is `TODO(Phase 4)` (USDC transfer or grossed-up token
transfer, §3.2). The cron is structured so dropping in those two CPIs is additive.

**Idempotency:** every cron action is insert-or-ignore on the §4 unique keys; safe to run on overlapping schedules
or after a missed tick (no locking needed beyond the DB constraints; optionally a Redis lease to avoid concurrent
runs).

---

## 8. How this supersedes the flat-4% Jupiter path

- **Today (`05` §1, `lib/jupiter.ts`):** a 4% `platformFeeBps` skim on swap *output*, landing in `MOMENTO_FEE_WALLET`
  only if the output mint's fee-ATA is pre-seeded (else **feeless fallback → $0**). No ledger, no creator split, no
  external visibility, classic-SPL only.
- **New model:** revenue = **Token-2022 transfer fee (3–5%)** + **Meteora LP fee (80% partner+creator)**; `FeeEvent`
  is the **single source of truth**; webhooks give **external** visibility; the 20/80 split pays creators.
- **Migration stance:** for **creator-token routes**, disable Jupiter `platformFeeBps` (set `skipPlatformFee=true`
  in `getSwapQuote`, `lib/jupiter.ts:84`) — the transfer fee + LP fee already capture revenue; double-charging would
  break the ~1% in-app target. Jupiter remains a routing option for **non-creator** mints, where its platform fee
  may stay. Phase 4 replaces the creator-token swap path entirely with the own-pool route.

---

## 9. Env vars (new) & file map

**New env:** `HELIUS_WEBHOOK_SECRET` (receiver auth), `MOMENTO_REBATE_USDC_VAULT` (default rebate source),
`MOMENTO_LP_FEE_CLAIMER` (`15` §6.4, = Meteora `fee_claimer`), `MOMENTO_CREATOR_FEE_PCT` (drives
`creator_trading_fee_percentage`, default 50), `WEBHOOK_MAX_AGE` (default 600s). Reuses `CRON_SECRET`,
`UPSTASH_*`, Helius RPC config.

**New files (Phase 2):**
- `apps/api/prisma/migrations/<ts>_add_fee_events_trades/migration.sql` — additive, forward-only.
- `apps/api/app/api/webhooks/helius/route.ts` — receiver (§5).
- `apps/api/lib/helius-webhook.ts` — verify (HMAC/bearer) + parse + classify + persist helpers.
- `apps/api/lib/fees.ts` — rebate math (`calcFee`/gross-up from `spike-a`), 20/80 attribution, summary aggregation.
- `apps/api/app/api/cron/fee-claim/route.ts` — claim/recon cron (§7).
- `packages/shared/src/types.ts` — `FeeEvent`/`Trade` enums + interfaces.

---

## 10. Open items / risks

1. **Exact withheld-fee field in Helius enhanced payload** for Token-2022 transfers — verify the parser maps the
   withheld delta vs computing from `feeBps` (cross-check on devnet, `spike-a` accounts).
2. **Price snapshot source for USDC rebate** — DAS `price_info` (`lib/helius.ts`) vs a dedicated oracle; record
   `priceTs` and let recon true-up.
3. **Meteora-reported split granularity** — does the SDK expose per-claim partner/creator/protocol amounts, or must
   we derive from config %? (`15` §7 unknown #1/#4). Affects whether `protocolAmount`/`creatorAmount` are observed
   or computed.
4. **Compliance** (`15` §6.5, README R2): moving rebate value to specific users + holding fee-claim authority is a
   regulatory surface — **legal read before Phase 4 execution.**
5. **Webhook back-pressure / batch size** — confirm Helius batch limits vs Vercel function time; defer heavy work to
   cron (§5.4) is the mitigation.
