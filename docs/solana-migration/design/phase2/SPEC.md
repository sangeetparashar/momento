# SPEC — Momento Solana Token Economy (Phase 2, Authoritative Design)

> **Status:** AUTHORITATIVE. This is the single reconciled design that supersedes the four
> Phase 2 design drafts (`D-schema.md`, `D-signer.md`, `D-fees.md`, `D-api.md`) wherever they
> conflict. Implementation agents follow `CONTRACTS.md` (the binding contract); this file is the
> "why". **Solana-only.** `@solana/web3.js` **v1**.
> **Date:** 2026-06-24. **Lead architect reconciliation.**

---

## 0. Reconciliation rules applied

This SPEC merges four drafts. Where they disagree, these rules decided the winner:

1. **`D-schema.md` is canonical for all Prisma model names, enum names, and fields.** The API
   draft's alternate names are *mappings onto* the canonical schema, not new tables.
2. **`D-signer.md` is canonical for every `apps/api/lib/solana/*` interface.** Kept verbatim.
3. **`D-fees.md` is canonical for the rebate mechanism (USDC default) and the dedupe keys.**
4. **Phase boundary is hard:** Phase 2 builds the data model, the signing-layer *interfaces*
   (stubbed, import-safe), the webhook receiver, the fee ledger, the summary reads, and the
   recon/claim cron *scaffold*. Real Meteora / Streamflow / Jupiter-Lock CPIs and the on-chain
   rebate *send* are Phase 3+ behind typed `TODO(Phase 3)` / `TODO(Phase 4)` seams.

### 0.1 Name-mapping table (API draft → canonical schema)

The `D-api.md` draft proposed loose storage names; they map to canonical `D-schema.md` models:

| `D-api.md` name | Canonical model (this SPEC) | Notes |
|---|---|---|
| `TokenTrade` | **`Trade`** | per-swap row |
| `FeeLedger` | **`FeeEvent`** | per-fee-leg ledger row |
| `OnchainEvent` (staging fallback) | **dropped** | Not used. The canonical `Trade` + `FeeEvent` tables land in Phase 2 (T-foundation), so the thin-staging fallback in `D-api.md §2.1` is **not built**. |
| `CreatorToken.feeBps` | **`CreatorToken.transferFeeBps`** | |
| `CreatorToken.feeClaimer` | **`TokenFeeConfig.feeClaimer`** (+ `MOMENTO_LP_FEE_CLAIMER` env default) | claimer lives on the config row |
| `CreatorToken.partnerConfigKey` | **`CreatorToken.dbcConfigKey`** | |
| `split.creatorBps` / `split.momentoBps` (API) | **`TokenFeeConfig.creatorTradingFeeBps` / `partnerTradingFeeBps`** | API response *presents* these; storage uses the canonical names |
| `lib/signer.ts` (API draft) | **`apps/api/lib/solana/*`** (`serverSigner`, `submit`, …) | the signer draft's module layout wins; there is no flat `lib/signer.ts` |

### 0.2 Enum-name reconciliation (fees draft → canonical schema)

`D-fees.md` proposed a flatter enum set. Canonical names come from `D-schema.md`; the fees-draft
values are folded in:

| `D-fees.md` enum / value | Canonical (this SPEC) | Resolution |
|---|---|---|
| `FeeEventKind` | **`FeeEventType`** | name from schema draft |
| `FeeEventSource` | **`FeeSource`** | one shared enum (`IN_APP`/`EXTERNAL`) used by both `Trade` and `FeeEvent` |
| `TradeSource` | **`FeeSource`** | collapsed — do NOT create a parallel `TradeSource` enum |
| `FeeEventType` value `TRANSFER_FEE` | **`TRANSFER_FEE_WITHHELD`** | schema name |
| `FeeEventType` value `LP_FEE_ACCRUAL` | **`PARTNER_TRADING_FEE` + `CREATOR_TRADING_FEE`** (split by leg) + **`LOCKED_LP_FEE`** | the 80% LP leg is recorded per-recipient, not as one undifferentiated accrual |
| `FeeEventType` value `PROTOCOL_FEE` | **`SURPLUS`** is distinct; protocol cut is recorded via `recipient = PROTOCOL` on the relevant `FeeEvent` | Meteora's fixed 20% is attributed via `FeeRecipient.PROTOCOL`, not a dedicated `type` |
| `FeeEventType` value `FEE_CLAIM` | **`CLAIMED`** | generic sweep/claim to a recipient |
| `RebateAsset { USDC TOKEN }` | **`FeeEvent.rebateMint` (String) + `TokenFeeConfig.rebateMint`** | rebate asset is a *mint string*, not an enum; USDC default, token = gross-up fallback |
| `RebateStatus { NONE PENDING SENT FAILED }` | **`Trade.rebatePaid: Boolean` + `FeeEvent` `type=REBATE` row** | Phase 2 ledgers PENDING via an unpaid `REBATE` `FeeEvent` (`claimed=false`) + `Trade.rebatePaid=false`; no separate status enum |
| `TradeStatus { BUILT CONFIRMED FAILED }` | **NOT a stored enum in canonical `Trade`** | See §3.3 — canonical `Trade` has a required `signature @unique` + `blockTime` (confirmed rows only). The "intent before signature" lifecycle is handled by an **`intentId`** column added to the canonical `Trade` (see CONTRACTS §a) so in-app provenance is preserved without a status machine. |

> **The one schema reconciliation that required a field addition:** `D-fees.md` needs to record an
> in-app trade *intent before its signature exists* (provenance classification, §3). `D-schema.md`'s
> `Trade.signature` is `@unique` + required. To satisfy both without a `TradeStatus` state machine,
> the canonical `Trade` gains a nullable **`intentId String? @unique`** and `signature` is relaxed to
> **`String? @unique`** (nullable, still unique — Postgres allows many NULLs). `blockTime` becomes
> nullable too (unknown until confirmed). This is the minimal, additive change that lets the in-app
> builder write the intent row first and the webhook patch the signature later. All other `D-schema.md`
> `Trade` fields are kept. See CONTRACTS §a for the exact reconciled model.

---

## 1. System overview

Momento launches **Token-2022** creator tokens carrying a **3–5% Transfer Fee** (default **400 bps**).
The chain charges that fee on every transfer and is context-blind. The "~1% in-app" experience is
achieved **off the token** via Momento's **rebate accounting**, paid by default **in USDC** (fee-exempt).
Tokens launch on **Meteora DBC** (USDC-quoted), graduate to **DAMM v2** with two permanently-locked LP
positions (partner + creator), each fee-claimable forever. Meteora keeps a fixed **20% protocol** cut;
the remaining **80%** splits partner(Momento)/creator by configurable bps. Vesting uses **Streamflow**
and **Jupiter Lock**. All platform on-chain actions are signed by a **Privy server wallet**
(`@privy-io/node`) and self-submitted via **Helius**; user actions are client-signed and backend-self-submitted.

Phase 2 stands up: the full data model, the import-safe signing layer interfaces, the Helius webhook
receiver, the `FeeEvent`/`Trade` ledger, the public fee/trade summary reads, and the recon/claim cron
scaffold. On-chain CPIs are deferred behind typed seams.

---

## 2. Data model (canonical — full detail in CONTRACTS §a)

**8 new models, extension of `CreatorToken`, back-relations on `User`.** Canonical model names:
`TokenFeeConfig`, `FeeEvent`, `Trade`, `TokenFundraise`, `FundraiseContribution`, `LpPosition`,
`VestingSchedule`. New enums: `TokenProgram`, `FundraiseStatus`, `FeeSource`, `TradeSide`,
`FeeEventType`, `FeeRecipient`, `LpProvider`, `LpOwner`, `VestingProvider`, `VestingStatus`; plus
new **values** on the existing `PoolType` (`METEORA_DBC`, `METEORA_DAMM_V2`).

**Cross-cutting invariants (binding):**

1. **Money = base-unit integer `String`** named `*BaseUnits`, always paired with an explicit `*Mint`.
   `*Usd` columns are `Float`, display/analytics-only, never on-chain truth. No `Decimal`/`BigInt`/float
   for on-chain amounts.
2. **On-chain idempotency = `@unique` `signature`** (or `streamId` / `createSignature` / `finalizeSignature`).
   Off-chain computed rows use a separate `@unique` `internalRef`. Writers upsert on these keys.
3. **Two `onDelete` regimes:** token-scoped config/ledger **Cascades** from `CreatorToken`; user
   references on financial rows (`Trade.userId`, `FundraiseContribution.userId`,
   `VestingSchedule.beneficiaryUserId`) are **optional + `SetNull`**. The existing account-delete route
   (`app/api/users/me/delete/route.ts`) needs **no change** and must not be "fixed" back to Cascade.
4. **bps everywhere**; split pairs (`creatorTradingFeeBps + partnerTradingFeeBps = 10000`) enforced in app logic.
5. **`chain` stays `"solana"`** on all new rows (dormant no-op; not dropped this phase).
6. **`CreatorToken.lpPositions` is plural** (partner + creator NFTs; `@@unique([tokenId, owner])`).

---

## 3. Fee accounting, classification & rebate

### 3.1 Two-axis fee model
Revenue = **Token-2022 transfer fee (3–5%)** + **Meteora LP fee (80% partner+creator)**. `FeeEvent`
is the **single source of truth**. The flat-4% Jupiter `platformFeeBps` path
(`lib/jupiter.ts`) is **disabled for creator-token routes** (`skipPlatformFee=true`) so we never
double-charge against the 1% in-app target; Jupiter stays only as a routing fallback for non-creator mints.

### 3.2 Classification — provenance, not inference
A trade is **`IN_APP`** iff Momento built/sponsored the tx (we hold the intent record before the
signature exists). Everything else on a watched mint is **`EXTERNAL`**, learned only by **observing**
Helius webhooks. We never try to recognize "our" instructions inside an arbitrary parsed tx.

### 3.3 The intent → signature lifecycle (reconciled)
When the API builds an in-app swap it writes a `Trade` row with `source=IN_APP`, an `intentId`, and
`signature=NULL` **before** signing; once the signature is known it patches `signature` + `blockTime`.
The webhook receiver joins inbound events on `signature`: a hit confirms the existing `IN_APP` `Trade`;
a miss inserts a new `EXTERNAL` `Trade`. **Race** (webhook first): the row lands `EXTERNAL`; the recon
cron (§7 of `D-fees.md`) reclassifies any `EXTERNAL` `Trade` whose `signature` later matches a Momento
intent and enqueues the rebate. The `signature @unique` constraint makes this collision-safe.

### 3.4 Rebate mechanism (LOCKED: USDC default)
Default rebate asset = **USDC** (`TokenFeeConfig.rebateMint` = USDC mint), because rebating *in the
creator token* re-incurs the 3–5% transfer fee. Fallback = **gross-up in token** when no USDC vault
exists for a token. Verified math (`spike-a`, `FEE_BPS=400`, `TARGET_IN_APP_BPS=100`):

```
chargedFee     = min(floor(gross * feeBps / 10_000), maximumFee)
targetFee      = floor(gross * TARGET_IN_APP_BPS / 10_000)
rebateOwed_net = chargedFee - targetFee
// USDC default:  rebateUsdcBaseUnits = rebateOwed_net * price(token→USDC)   (no gross-up)
// token fallback: grossRebate = ceil(rebateOwed_net * 10_000 / (10_000 - feeBps))
```

Phase 2 **computes + ledgers** the owed rebate (a `REBATE` `FeeEvent`, `claimed=false`; `Trade.rebatePaid=false`).
Phase 4 executes the transfer (`TODO(Phase 4)`).

### 3.5 20/80 attribution (recorded, not computed by us)
Per fee dollar with default 50/50: **protocol 20%** (`FeeRecipient.PROTOCOL`), **Momento 40%**
(`PARTNER_TRADING_FEE`), **creator 40%** (`CREATOR_TRADING_FEE`). We record these from the
Meteora-reported split; we never compute the protocol cut. Momento keeps 40% of every fee on every
trade anywhere (in-app or external) — the key economic property the summary surfaces.

---

## 4. Signing & submission layer (`apps/api/lib/solana/*`)

The single choke-point for every on-chain tx. Interfaces are **verbatim from `D-signer.md`** (see
CONTRACTS §b). Import-safe: factories read env on first *use*, never at module load; `STUB_SOLANA_SIGNER=1`
swaps in stubs so `tsc` / route imports / unit tests run with zero secrets.

- **Platform actions** (mint, DBC `createConfig`/`createPool`/`migrate`, claim fees, create vesting):
  `serverSigner()` (Privy server wallet via `@privy-io/node`) + `submit()`. Launch/fee-claim use
  `route: 'sender'` (Helius Sender, Jito tip).
- **User actions:** `buildUnsignedForClient()` → client signs via Privy embedded wallet →
  `submitClientSigned()` self-submits via Helius. Privy never broadcasts (no custom-RPC field).
- **Multi-signer:** `MultiSigner`/`applySigners` lets a tx carry the server/client signer **plus** an
  ephemeral `Keypair` (Streamflow `metadata`, Jupiter Lock `base`). **OPEN (blocks vesting):** does
  `@privy-io/node` `signTransaction` preserve a pre-attached ephemeral signature? Verify on devnet;
  fallback = route co-signed txns through the client embedded wallet. Surfaced as
  `SolanaTxError` code `PARTIAL_SIGN_UNSUPPORTED`.
- **Idempotency:** key = caller-supplied or `sha256(label + feePayer + unsigned message)`; in-process
  Map default with a pluggable store seam (`TODO(ops)`: back with Prisma/Redis).

In Phase 2 these files exist, compile, import clean, and return stub results; **no live broadcast**.
Phase 3 consumer modules (mint/launch/trade/vesting/claim) wire against the stable interfaces.

---

## 5. Webhook ingestion (`POST /api/webhooks/helius`)

Receiver pattern mirrors `app/api/kyc/webhook/route.ts` + `lib/veriff.ts`:

1. **Read raw body** (`await request.text()`).
2. **Verify shared secret** with `crypto.timingSafeEqual` — bearer-header mode
   (`Authorization === Bearer ${HELIUS_WEBHOOK_SECRET}`) or HMAC-SHA256 mode (parity with Veriff).
   Mismatch → `401` (no leak of which check failed). Verify **before** any DB work.
3. **Fast dedupe:** Redis `SETNX webhook:helius:<deliveryId|sha256(body)>` short TTL → duplicate short-circuits to `200`.
4. **Parse** the array of enhanced txs: `signature`, `blockTime`, `tokenTransfers[]`, `accountData[]`,
   `events`. For transfers touching a watched creator mint → `TRANSFER_FEE_WITHHELD` `FeeEvent`.
   Classify via §3.2/3.3. Fee-claim/harvest transfers → `CLAIMED`/`PARTNER_TRADING_FEE` etc.
5. **Persist** the batch in one `prisma.$transaction` via `createMany({ skipDuplicates: true })` on the
   `@unique` keys (insert-or-ignore). **Durable dedupe = the DB unique constraints**; correctness never
   depends on Redis. At-least-once delivery assumed.
6. **Invalidate** affected summary caches (`invalidateCache('feeSummary:*')`).
7. Heavy work (price snapshots, rebate compute) is deferred to the cron (§7), keeping the receiver fast.
8. Always return `200` for verified+enqueued (incl. already-seen) so Helius does not retry-storm; `401`
   only on secret failure; `5xx` only on unexpected error.

**Response:** `{ success: true, data: { received, processed, skipped } }`.

---

## 6. Summary read model (public)

`GET /api/tokens/[mint]/trades`, `GET /api/tokens/[mint]/fees`, `GET /api/creators/[id]/fees` —
**public reads** (`readLimiter`, IP/user keyed), aggregated from `Trade`/`FeeEvent` via `lib/fees.ts`,
cached with short TTL via `getOrSetCache`. The **claimable/unclaimed** block on the fee endpoints is
**owner-or-admin only** — the route runs optional `requireAuth` and widens the payload when the caller
is the token owner or an admin; otherwise returns the public subset. Claims themselves are admin-gated
and **Phase 3** (`POST /api/creators/[id]/fees/claim`, server-signed platform action).

---

## 7. Recon / claim cron (`GET /api/cron/fee-claim`)

`keep-warm` pattern: `GET`, `Authorization: Bearer ${CRON_SECRET}` (constant-time; fail-open only when
`CRON_SECRET` unset, dev). Vercel cron (~30 min). Phase 2 responsibilities: reconcile classification
(reclassify late-matching `EXTERNAL` trades to `IN_APP`, enqueue rebate); record harvest-ready withheld
balances (intent + expected amounts only); record claims observed via webhook (`CLAIMED` `FeeEvent`,
deduped on `signature`). Every action is insert-or-ignore on the unique keys (safe on overlapping ticks).

**Phase-3 seam (explicit, in-code):**
```ts
// TODO(Phase 3): execute Meteora claims via @meteora-ag/dynamic-bonding-curve-sdk
//   partner: claimPartnerTradingFee() -> feeClaimer = MOMENTO_LP_FEE_CLAIMER
//   creator: creator trading-fee + locked-LP fee claim
//   sign with serverSigner() (@privy-io/node), submit({ route:'sender' }) via Helius Sender
//   on confirm: insert CLAIMED FeeEvent { signature, recipient, feeBaseUnits, amountMint }
// TODO(Phase 4): execute REBATE send (USDC transfer or grossed-up token transfer)
```

---

## 8. Security model

- **Auth classes:** Public, User (`requireAuth`), Creator (`requireCreator`), Admin (`requireAdmin`,
  `failClosed`), Webhook (shared secret + replay). Each new endpoint declares exactly one.
- **Webhook:** raw-body `timingSafeEqual` before parsing; Redis fast-dedupe; DB-unique durable dedupe;
  hard `401` on secret failure; no rate limiter (machine caller). Optional Helius IP allowlist.
- **Cron:** `CRON_SECRET` bearer, constant-time, fail-open in dev only.
- **Reads:** rate-limit first (cheap reject); claimable figures gated to owner/admin.
- **Claims (Phase 3):** admin-gated, `failClosed`, server-wallet-signed, audit row (`PromotionLog`-style).
- **Signer:** no secrets at import; stub mode for CI; live Privy/Helius calls marked `TODO(ops)`.
- **Money safety:** integer base-unit strings + explicit mints everywhere; idempotent upserts on
  signatures make webhook/cron re-runs safe no-ops.

---

## 9. Phase-2-vs-Phase-3 boundary (binding)

| Concern | Phase 2 (BUILD NOW) | Phase 3+ (seam only) |
|---|---|---|
| Prisma models + enums + migration | ✅ all 8 models, enum values, additive migration | — |
| `packages/shared` types/constants | ✅ TS enums mirror Prisma + `MOMENTO_*` constants | — |
| `lib/solana/*` interfaces | ✅ files exist, compile, stubbed, import-safe | live Privy/Helius broadcast (`TODO(ops)`) |
| Webhook receiver | ✅ verify/parse/classify/persist/dedupe | producers that register Helius webhooks at launch (P3) |
| `FeeEvent`/`Trade` ledger | ✅ written by webhook + cron | — |
| Fee/trade summary reads | ✅ public + owner-widened | — |
| Recon/claim cron | ✅ accounting + scaffold | Meteora claim CPI (P3), rebate send (P4) |
| Token launch / buy / sell | contract-only (shapes) | build (`lib/launch.ts`, `lib/trade.ts`) — P3 |
| Vesting | contract-only (shapes) | build (`lib/vesting.ts`) — P3, gated on Privy multi-signer OPEN |
| Fee claim endpoint | contract-only (shapes) | server-signed execute — P3 |

---

## 10. Open decisions needing the user / ops

1. **Privy multi-signer (BLOCKS vesting/lock):** does `@privy-io/node` `signTransaction` preserve a
   pre-attached ephemeral signature? Must verify on devnet before the vesting module is built.
2. **Idempotency store** for the signer: dedicated Prisma table vs reuse the rate-limit Redis. Decide
   before any treasury/fee-claim go-live.
3. **`protocolFeeBps` default (2000):** confirm against the deployed Meteora program version.
4. **Meteora split granularity:** does the SDK expose per-claim partner/creator/protocol amounts, or
   must we derive from config %? Affects observed-vs-computed attribution.
5. **caip2 cluster string** Privy expects for devnet vs mainnet-beta server signing.
6. **Compliance (legal read before Phase 4):** moving rebate value to specific users + holding
   fee-claim authority is a regulatory surface.
</content>
</invoke>
