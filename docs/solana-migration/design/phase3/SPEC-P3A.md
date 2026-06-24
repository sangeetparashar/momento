# SPEC-P3A — Phase 3A Authoritative Design (Launch · Trade · Graduation · Fee-Claim+Rebate · Vesting)

> **Status:** AUTHORITATIVE. This SPEC reconciles the five Phase 3A design drafts
> (`D-launch.md`, `D-trade.md`, `D-graduation.md`, `D-fee-claim.md`, `D-vesting.md`) into a single
> design. Implementation agents follow **`CONTRACTS-P3A.md`** (the binding contract, zero ambiguity);
> this file is the "why". Wherever the five drafts conflicted, the reconciliation rules in §0 decided
> the winner.
> **Builds on committed Phase 2 (MERGED):** `prisma/schema.prisma`, `apps/api/lib/solana/*`,
> `apps/api/lib/fees.ts`, `apps/api/lib/helius-webhook.ts`, `apps/api/app/api/cron/fee-claim/route.ts`,
> `apps/api/lib/validation.ts`, `apps/api/lib/auth.ts`, `packages/shared/src/{constants,types}.ts`.
> **Solana-only. `@solana/web3.js` v1.** SDK ground truth = `scripts/spikes/spike-{a,b,c}-*.ts`.
> **Date:** 2026-06-24. Lead-architect reconciliation.

---

## 0. Reconciliation rules applied (which draft won where)

1. **Phase 2 `CONTRACTS.md` is canonical for schema, enums, and `lib/solana/*` / `lib/fees.ts` /
   `lib/helius-webhook.ts` signatures.** Phase 3A modules CONSUME these import-only; they never edit
   `lib/solana/*`, `lib/fees.ts`, or `lib/helius-webhook.ts`'s public functions.
2. **`D-fee-claim.md §1` is canonical for the `FeeEvent` `type`/`recipient` pairing** (the deferred P1
   contract). Restated bindingly in §7.3 and `CONTRACTS-P3A §f`. The Phase-2 `lib/fees.ts` reader is
   NOT changed; Phase-3 writers conform to it.
3. **`D-trade.md §0` is canonical for the in-app trade signing model** (client-signed, backend
   self-submit, two-call build→submit, `intentId` written pre-signature).
4. **`D-launch.md §0` is canonical for the launch on-chain model** (DBC SDK mints the base mint;
   per-launch config; server-signed platform action with two ephemeral co-signers).
5. **`D-graduation.md §3` is canonical for raised-tracking** (recompute from confirmed rows; the
   `helius-webhook.ts` increment is the single shared edit, owned by P3-foundation — see §0.1).
6. **Naming collisions reconciled** (§0.2). Every new lib uses ONE error class, ONE venue type, and the
   Phase-2 enums from `@momento/shared`/`@prisma/client`; no module redefines a Phase-2 enum.
7. **File-ownership rule (binding):** every shared/contended file is edited by exactly ONE task,
   `P3-foundation`, which runs FIRST. The five module tasks own only NEW files. See `CONTRACTS-P3A §c`.

### 0.1 The single shared-file conflict and its resolution

Four drafts independently add Zod schemas to `lib/validation.ts`; graduation adds a `raisedBaseUnits`
increment to `lib/helius-webhook.ts`; launch+graduation add additive schema fields; fee-claim adds
constants + env. If each module edited these, tasks would collide. **Resolution: all of these land in
ONE first task, `P3-foundation`.** The five module tasks then never touch a shared file (`CONTRACTS-P3A
§c`). This is the same partitioning discipline Phase 2 used (T-foundation owning schema/shared/env).

### 0.2 Name / type reconciliation across the five drafts

| Draft surface | Canonical (this SPEC) | Resolution |
|---|---|---|
| `TradeVenue = 'METEORA_DBC'\|'METEORA_DAMM_V2'` (D-trade) | reuse, but it is a **subset alias of `PoolType`** | persisted to `Trade.venue: PoolType`; the string union is a lib-local narrowing |
| `TradeError` (D-trade), `SolanaTxError` (solana) | both kept; `TradeError` is module-local for input/venue errors, `SolanaTxError` for on-chain | trade lib maps `SolanaTxError.code → HTTP` in the route, like the swap route |
| launch `feeSplit.{creatorBps,partnerBps}` vs `TokenFeeConfig.{creator,partner}TradingFeeBps` | storage uses canonical `*TradingFeeBps`; request body uses `feeSplit` | request→storage mapping in `lib/launch.ts` |
| graduation `finalizeStartedAt` (new) | the ONLY additive schema field in Phase 3A | one forward migration, `P3-foundation` |
| fee-claim `ClaimResult`, vesting `VestingPlan`, etc. | kept verbatim per their drafts | no cross-module name clash |
| `signMode: 'server'\|'client'` (vesting), launch `status` deviation, trade two-call | each module's response discriminator kept | enumerated in §endpoints + `CONTRACTS-P3A §d` |

---

## 1. System shape (the five flows in one paragraph)

A **creator launches** a Token-2022 mint with a 3–5% transfer fee onto a Meteora DBC curve (USDC-quoted),
baking the LP-split and fee-split knobs into the DBC config (`lib/launch.ts`, server-signed). **Users
trade** on the curve (pre-graduation) or the DAMM v2 pool (post-graduation) via a client-signed,
backend-self-submit two-call flow that records an `intentId` before the signature exists (`lib/trade.ts`).
When confirmed quote raised reaches the threshold, an idempotent **keeper graduates** the token —
migrating DBC→DAMM v2, locking the two LP position NFTs, persisting both `LpPosition` rows, and flipping
`CreatorToken.status=GRADUATED` (`lib/graduation.ts`). A **fee-claim cron** sweeps Token-2022 withheld
fees + DBC trading fees + DAMM v2 LP fees into the treasury/creator and pays owed in-app **rebates**
(`lib/fee-claim.ts`, filling the two Phase-2 cron seams). Creators **vest** team/LP allocations via
Streamflow / Jupiter Lock (`lib/vesting.ts`). All platform actions are signed by the **Privy server
wallet**; all user actions are client-signed; both self-submit via Helius.

---

## 2. The on-chain signing model (server vs client-relay vs ephemeral multi-signer)

This is the single most cross-cutting decision. Three signing modes, picked per action class:

| Action class | Mode | Signers | submit route | Module(s) |
|---|---|---|---|---|
| **Platform action** (launch, graduate-migrate, fee claim, rebate send, platform-issued vesting) | **Server-signed** | `serverSigner()` (+ `ephemeralSigner()` co-signers) | `submit({route:'sender'})` (launch/migrate/claim) or `'rpc'` (rebate) | launch, graduation, fee-claim, vesting (primary) |
| **User action** (buy, sell, vesting withdraw, creator-as-poolCreator launch fallback) | **Client-relay** | `clientRelaySigner(userWallet)` (+ optional `ephemeralSigner`) | `buildUnsignedForClient → submitClientSigned` (forces `'rpc'`) | trade, vesting (withdraw), launch (alt) |
| **Account-creating co-sign** (DBC config+baseMint, migrate position NFTs, Streamflow metadata, Jup-Lock base) | **Ephemeral multi-signer** | `ephemeralSigner(kp)` alongside the primary | inherits primary's route | launch, graduation, vesting |

**Why server-signed for platform actions:** launch/migrate/claim are Momento's own treasury actions
(payer/partner/feeClaimer). They go through `serverSigner()` and `submit()`. `submit()` is **fail-closed**:
a server-signed broadcast refuses to run without the durable Upstash idempotency store — exactly the
at-most-once guarantee these need.

**Why client-relay for user actions:** the Privy embedded wallet signs on the device; Privy cannot point
at our Helius RPC, so the backend self-submits the client-signed tx (`submitClientSigned`, route forced
to `'rpc'` — no Jito tip on a client tx). The user is `feePayer`, resolved from the `clientRelaySigner`.

**The ephemeral multi-signer crux (BLOCKER carried from Phase 2 OPEN #1):** account-creating
instructions need a fresh `Keypair` to co-sign (the config/baseMint at launch, the two position-NFT
keypairs at migrate, the Streamflow `metadata` / Jup-Lock `base`). `applySigners` (signer.ts L105)
handles this: ephemerals `partialSign` first, the server signs, then any ephemeral sig the Privy sign
stripped is re-attached; if still missing → `PARTIAL_SIGN_UNSUPPORTED`. **It is UNVERIFIED on devnet
whether `@privy-io/node signTransaction` (a) preserves a pre-attached ephemeral partial sig and (b)
signs the same compiled message (no blockhash/ix mutation that invalidates a re-attached captured sig).**
This single devnet outcome gates **launch, graduation, AND vesting**. The fallback for each is the
client-relay co-sign path (the creator's embedded wallet is the primary signer; the ephemeral sig is
pre-attached server-side before `buildUnsignedForClient` serializes with `requireAllSignatures:false`).
See Open Questions §9.1 — **this is the top blocker.**

---

## 3. Launch flow (`lib/launch.ts` + `POST /api/tokens/launch`)

Server-signed two-transaction sequence (mirrors verified spike-b), idempotent + resumable on `tokenId`:

1. **Validate + authorize:** `requireCreator`, `validateBody(launchTokenSchema)`, `writeLimiter`,
   wallet-ready, one-token guard (`@@unique([userId, chain])` → clean 409).
2. **Persist `CreatorToken` (PENDING) + `TokenFeeConfig` + `TokenFundraise` (DRAFT)** in ONE Prisma tx
   BEFORE any chain call (the idempotency anchor + rollback target).
3. **`createConfig` (DBC)** — `client.partner.createConfig(...)`, signers `serverSigner()` +
   `ephemeralSigner(configKeypair)`. On confirm: persist `dbcConfigKey`, `status=DEPLOYING`.
4. **`createPool` (DBC)** — `client.creator.createPool(...)`, **this is the instruction that mints the
   taxed Token-2022 base mint.** Signers `serverSigner()` + `ephemeralSigner(baseMintKeypair)` +
   poolCreator. Default `poolCreator = treasury` (fully server-signed); the human creator is recorded via
   `TokenFeeConfig.creatorFeeWallet`.
5. **Persist success:** `mintAddress`, `dbcPoolAddress`, `poolType=METEORA_DBC`, `status=ACTIVE`;
   `TokenFundraise.status=ACTIVE` + threshold/LP-bps/`leftoverReceiver`.

**Cross-module bake (what launch writes that graduation/fee-claim/trade later read):** `mintAddress`
(the canonical token key), `dbcConfigKey`, `dbcPoolAddress`, `quoteMint=USDC`, `transferFeeBps`/
`transferFeeMaxBaseUnits`/`transferFeeAuthority`/`withdrawWithheldAuthority` (all = treasury),
`TokenFeeConfig.{feeClaimer, creatorFeeWallet, creator/partnerTradingFeeBps, rebateMint=USDC}`, and on
`TokenFundraise`: `thresholdBaseUnits`, `partnerLpBps/creatorLpBps/partnerLockedLpBps/creatorLockedLpBps`,
`migrationFeeBps`, `leftoverReceiver`. The DBC config encodes the SAME `*LpBps`/`leftoverReceiver` so the
graduation migrate produces exactly the split graduation records (§5).

### 3.1 The launch transfer-fee-on-DBC-mint BLOCKER

The DBC SDK mints the base mint inside `createPool`; we cannot pre-create a taxed mint and hand it over
(Token-2022 forbids adding extensions after `InitializeMint`). So the TransferFeeConfig must be set by
the DBC config/`createPool` itself (**Path A**). It is UNVERIFIED whether
`dynamic-bonding-curve-sdk@1.5.10`'s `TokenConfig`/`CreatePoolParams` expose transfer-fee fields (bps,
maxFee, the two authorities). **If Path A is unsupported, Path B (prepend extension init) is mechanically
impossible with a program-initialized mint** — the whole tax architecture escalates (newer SDK, or tax
only via the post-graduation DAMM v2 pool). This is the highest-risk item in Phase 3A. See §9.2.

---

## 4. Trade flow (`lib/trade.ts` + buy/sell/detail endpoints)

Client-signed, two-call build→submit. **`resolveTradeVenue(mint)` reads `CreatorToken.status`:**
`GRADUATED` (or a DAMM v2 pool address present) ⇒ `METEORA_DAMM_V2` (`cpAmm.swap`); `ACTIVE` with
`dbcPoolAddress` ⇒ `METEORA_DBC` (`client.pool.swap`); neither ⇒ `TOKEN_NOT_TRADEABLE`.

**The `intentId` loop (closes the Phase-2 deferred gap):**
1. `buildTrade` persists `Trade { intentId: uuid, source: IN_APP, signature: null, blockTime: null,
   rebateBaseUnits, rebateMint:USDC, rebatePaid:false, priceUsd, priceTs, … }` in the same tx that
   returns the unsigned swap tx — the intent exists BEFORE any signature.
2. `submitTrade` self-submits the client-signed tx (`submitClientSigned`, route `'rpc'`) and patches
   `{signature, blockTime}` (asserts `Trade.userId === user.id`).
3. The committed `helius-webhook.ts` joins on `signature`: hit ⇒ confirms the IN_APP row; miss ⇒ inserts
   an EXTERNAL row. Race (webhook first): the recon cron re-classifies the EXTERNAL row whose `signature`
   later matches a Momento intent. `Trade.signature @unique` + `intentId @unique` make it collision-safe.
4. The rebate is **recorded here, paid by `lib/fee-claim.ts`** (locked module boundary). This module
   never sends USDC.

**User nets ~1%:** the on-chain transfer fee (400 bps) is venue-blind; the ~1% effective rate is achieved
off-token by recording the owed rebate (`computeRebate → rebateToUsdc`, USDC default, no gross-up).
Slippage `minOut` is the MEV guard; route forced to `'rpc'`.

---

## 5. Graduation flow (`lib/graduation.ts` + `GET /api/cron/graduate`)

Two responsibilities: (1) track confirmed `raisedBaseUnits` vs `thresholdBaseUnits`, flip
`ACTIVE→THRESHOLD_MET`; (2) an idempotent keeper that migrates DBC→DAMM v2 and realizes the LP split.

**Raised tracking** recomputes from confirmed rows (`getRaisedProgress`): `sum(FundraiseContribution,
blockTime!=null, refunded=false) + sum(Trade venue=METEORA_DBC, side=BUY, blockTime!=null, quote-in
USDC)`. Both are USDC base units in the same quote mint (never sum across mints). The cached
`TokenFundraise.raisedBaseUnits` counter (incremented opportunistically by the webhook edit, §0.1) is
display only; the authoritative sum is the keeper's query.

**State machine:** `DRAFT→ACTIVE→THRESHOLD_MET→FINALIZING→COMPLETED` (+ `FAILED→REFUNDED` out of scope).
`FINALIZING` is a lease (conditional update on `status` + `finalizeStartedAt < now−LEASE_TTL`) — exactly
one worker migrates per token per tick.

**Migrate (reuse spike-b verbatim):** `client.migration.migrateToDammV2({payer, pool:dbcPoolAddress,
dammConfig})` returns TWO locked-LP position-NFT keypairs (first=PARTNER, second=CREATOR). Signers =
`serverSigner()` + `ephemeralSigner(first)` + `ephemeralSigner(second)`, `submit({route:'sender',
idempotencyKey:'graduate:migrate:<tokenId>'})`. Persist BOTH `LpPosition` rows (PARTNER + CREATOR,
`@@unique([tokenId,owner])`, same `createSignature`), perma-lock-or-Jup-Lock each leg per the config, then
finalize: `TokenFundraise.status=COMPLETED + finalizeSignature + finalizedAt`; `CreatorToken.status=
GRADUATED + graduatedAt + poolType=METEORA_DAMM_V2 + poolAddress=<damm v2>`.

**Three idempotency layers:** DB lease (`FINALIZING`+`finalizeStartedAt`), `submit()` durable Redis
store (at-most-once broadcast on the stable key), on-chain unique constraints + the program's own
"already migrated" rejection (→ §4.4 detect-existing-pool recovery). Never double-migrate.

---

## 6. Fee-claim + rebate flow (`lib/fee-claim.ts` + cron seams + admin endpoint)

Fills the two `TODO` seams in `cron/fee-claim/route.ts` (the only edit to that committed route — it keeps
its Phase-2 recon/harvest blocks). All env-gated default-OFF.

**Claim** (per graduated token, up to 4 independent txns, each its own idempotency key):
(a) Token-2022 withheld → `harvestWithheldTokensToMint` + `withdrawWithheldTokensFromMint` (spike-a) to
the fee vault; (b) DBC partner+creator trading fees (`claimPartnerTradingFee` / `claimCreatorTradingFee`);
(c) DAMM v2 locked-LP fees (`cpAmm.claimPositionFee` per position NFT). Partner legs server-signed
(`recipient=PLATFORM`); creator legs server-signed only when `creatorFeeWallet` is Momento-custodied, else
client-relayed (Open Q §9.4). Recording is atomic+idempotent per claim tx: derive amount from confirmed
tx meta, `attribute2080` the LP legs, `createMany({skipDuplicates})` accrual + one `CLAIMED` row, flip
swept accruals `claimed=true`.

**Rebate** (USDC default, no gross-up; gated by `REBATE_LEGAL_APPROVED`): reserve-before-send CAS
(`updateMany rebatePaid:false→true`; count 0 ⇒ deduped), SPL `createTransferCheckedInstruction` from
`MOMENTO_REBATE_USDC_VAULT` → trader ATA, `submit({route:'rpc'})`. On confirm set
`Trade.rebateSignature` + flip the `REBATE` FeeEvent claimed. On non-TIMEOUT failure roll back the
reservation; on TIMEOUT keep it and let the submit-layer key resolve.

---

## 7. Cross-module data contracts

### 7.1 Launch → graduation (the LP-split bake)
Launch writes `TokenFundraise.{partnerLpBps, creatorLpBps, partnerLockedLpBps, creatorLockedLpBps,
migrationFeeBps, leftoverReceiver}` AND bakes the identical values into the DBC config. Graduation reads
`TokenFundraise` to know which `migrationFeeOption` tier to migrate with and records the two `LpPosition`
rows the program produces. Graduation never chooses the split — it realizes what launch baked.

### 7.2 Trade ↔ webhook ↔ rebate (the `intentId` loop)
`lib/trade.ts` is the FIRST producer of `intentId`/IN_APP `Trade` rows. The committed
`helius-webhook.ts` classifies on `signature`. The committed `cron/fee-claim` recon reclassifies
EXTERNAL→IN_APP on signature match (now reachable once trade writes intents — set `INTENT_RECON=1`).
`lib/fee-claim.ts` pays `source=IN_APP, rebatePaid=false` rows. Closed loop.

### 7.3 `FeeEvent` type/recipient convention (RESTATED bindingly — D-fee-claim §1)
`type` encodes the fee LEG; `recipient` encodes WHO claims; written as a fixed pair. Binding table in
`CONTRACTS-P3A §f`. Key rows: `PARTNER_TRADING_FEE→PLATFORM`(feeClaimer, USDC); `CREATOR_TRADING_FEE→
CREATOR`(creatorFeeWallet, USDC); `LOCKED_LP_FEE→PLATFORM|CREATOR by NFT owner`; `CLAIMED→` matches the
swept leg (audit/idempotency anchor, NOT in the reader's filter — no double count);
`TRANSFER_FEE_WITHHELD→PROTOCOL` (Phase-2 webhook); `REBATE→TRADER`. The Phase-2 `lib/fees.ts` reader is
unchanged; writers conform.

### 7.4 Launch/graduation → fee-claim (hard dependency)
Fee-claim cannot run until launch populates `feeConfig.{feeClaimer, creatorFeeWallet,
withdrawWithheldAuthority}`, `dbcPoolAddress`, `quoteMint`, and graduation writes the two `LpPosition`
rows. Restated in `CONTRACTS-P3A §f`.

### 7.5 Launch → vesting (ordering)
Vesting consumes the creator/team + LP allocation amounts, mint/decimals, and Token-2022 fee config that
launch wrote. Ordering: launch → vesting. Vesting reads `CreatorToken.mintAddress`/`decimals`/feeConfig
for the §6-T22 gross-up.

---

## 8. Endpoint inventory (shapes binding in `CONTRACTS-P3A §d`)

| Endpoint | Auth | Limiter | Module | Signing |
|---|---|---|---|---|
| `POST /api/tokens/launch` | Creator | write | launch | server (default) / client-relay (alt) |
| `GET /api/tokens/[mint]` | Public | read | trade | — |
| `POST /api/tokens/[mint]/buy` | User | swap | trade | build only (client signs) |
| `POST /api/tokens/[mint]/sell` | User | swap | trade | build only |
| `POST /api/tokens/[mint]/buy/submit` | User | swap | trade | relay client-signed |
| `POST /api/tokens/[mint]/sell/submit` | User | swap | trade | relay client-signed |
| `GET /api/cron/graduate` | Cron secret | none | graduation | server |
| `POST /api/creators/[id]/fees/claim` | Admin | none | fee-claim | server |
| `POST /api/vesting/create` | Creator | write | vesting | server (primary) / client (fallback) |
| `GET /api/vesting/list` | User | read | vesting | — |
| `POST /api/vesting/[id]/withdraw` | User | write | vesting | client-relay |

Envelope `{success, data|error}`, base-unit strings, `validateBody`, `isValidMint`/`isValidUuid` guards,
`SolanaTxError.code → HTTP` mapping — all consistent with Phase 2.

---

## 9. Consolidated Open Questions (must clear before mainnet)

### 9.1 [BLOCKER] Privy ephemeral co-signing (gates launch, graduation, vesting)
Does `@privy-io/node signTransaction` preserve a pre-attached ephemeral partial sig AND sign the same
compiled message (no blockhash/ix mutation)? `applySigners` re-attach is only valid if yes. Decides the
server-path default vs the client-relay fallback for ALL three account-creating flows. **Single highest
priority — must be proven on devnet before launch/graduation/vesting are wired live.** (signer.ts L99/L126
TODO; Phase-2 SPEC §10.1.)

### 9.2 [BLOCKER] Launch transfer-fee on the DBC-minted base mint (§3.1)
Does `dynamic-bonding-curve-sdk@1.5.10` `TokenConfig`/`createPool` expose TransferFeeConfig fields
(bps, maxFee, transferFeeConfigAuthority, withdrawWithheldAuthority)? If NO, Path B is impossible and the
tax architecture escalates (newer SDK or tax-via-DAMM-v2-only). **Needs a product/architecture decision if
devnet inspection of the installed `.d.ts` shows the fields absent.**

### 9.3 `poolCreator` must-sign → server-signed vs client-relay launch (D-launch §3.4)
If DBC requires `poolCreator` to be a tx signer and product wants the human creator to own `poolCreator`
on-chain, launch must go through the client-relay path. Default = `poolCreator=treasury`; revisit per
product need for on-chain creator ownership.

### 9.4 Creator-claim signer policy (D-fee-claim §8)
Are creator trading-fee + creator LP-fee claims server-signed (custodied creator wallet) or client-relayed
(creator embedded wallet)? Phase-3A defaults to server-sign when custodied, else client-relay. Finalize
with the wallet-custody decision.

### 9.5 [LEGAL — BLOCKING for prod rebate sends] `REBATE_LEGAL_APPROVED`
Rebate disbursement is a value transfer to users; the gate stays OFF in prod until compliance signs off.
Claims (sweeping our own fees) are NOT gated by this.

### 9.6 Resumable ephemeral keypairs on launch retry (D-launch §4)
The launch config+baseMint ephemeral keypairs must be persisted (encrypted, keyed by `tokenId`) so a
resumed launch reuses the SAME pubkeys; a regenerated keypair on retry = orphaned config + duplicate mint.
Where to store (launch-scratch table vs Privy) is a `TODO(verify-devnet)`.

### 9.7 SDK-minor-sensitive surfaces (re-verify against installed `.d.ts` before coding)
`swapQuote`/`getQuote`/`cpAmm.swap` param shapes; `migrateToDammV2` auto-perma-lock behavior;
`DAMM_V2_MIGRATION_FEE_ADDRESS` index vs `migrationFeeBps` tier; `fetchPoolState`/`getUserPositionByPool`
field names; Jupiter Lock `createVestingEscrowV2` account/arg names; Streamflow T22 gross-vs-net deposit
interpretation; the `computeUnitLimit` devnet-measured constant (submit.ts has no simulation yet).

### 9.8 Helius webhook subscription scope (D-launch §3 step 6)
Program-level subscription vs per-pool registration on launch — affects whether launch must register the
new pool address with Helius.

### 9.9 Idempotency store backing (Phase-2 OPEN, carried)
The signer idempotency store must be Redis/Prisma-backed (not in-process Map) before any treasury/fee-claim
go-live — `submit()` fail-closed requires durable Upstash for all server-signed Phase-3A txns.
