# D-fee-claim — Phase 3A: Fee-Claim + Rebate Execution (DESIGN)

> **Status:** DESIGN ONLY. Module owner: **M-fee-claim**.
> Builds on the COMMITTED Phase 2 surface. Implements the two seams left in
> `apps/api/app/api/cron/fee-claim/route.ts` — `TODO(Phase 3)` (Meteora + Token-2022 claim)
> and `TODO(Phase 4)` (rebate send) — plus a new `apps/api/lib/fee-claim.ts` library and an
> admin endpoint `POST /api/creators/[id]/fees/claim`.
> **Solana-only · `@solana/web3.js` v1.** Ground truth: `scripts/spikes/spike-b-meteora-dbc.ts`
> (claim signatures) + `scripts/spikes/spike-a-token2022-fee-rebate.ts` (harvest/withdraw).
> Signing/submit: `apps/api/lib/solana/*`. Math/attribution: `apps/api/lib/fees.ts`.

---

## 0. Scope & file manifest (no file shared with another module)

| File | CREATE/EDIT | Responsibility |
|---|---|---|
| `apps/api/lib/fee-claim.ts` | CREATE | Claim + rebate execution engine (all on-chain CPI orchestration + idempotent recording). Pure functions over `prisma` + `lib/solana/*` + `lib/fees.ts`. |
| `apps/api/app/api/cron/fee-claim/route.ts` | EDIT | Replace the two `TODO` comment seams with calls into `lib/fee-claim.ts` (`runClaimSweep`, `runRebateSweep`), gated by env flags. Keep the committed Phase-2 recon/harvest blocks untouched. |
| `apps/api/app/api/creators/[id]/fees/claim/route.ts` | CREATE | `POST` admin-gated manual claim (per-token or per-creator), `failClosed`, server-signed. |
| `packages/shared/src/constants.ts` | EDIT (additive) | Add claim/rebate batch limits + `MOMENTO_REBATE_USDC_VAULT` wiring note (no behavioral change to existing `MOMENTO_FEE`). |
| `apps/api/.env.local.example` | EDIT (additive) | `FEE_CLAIM_ENABLED`, `REBATE_SEND_ENABLED`, `FEE_CLAIM_BATCH`, `REBATE_BATCH`, `REBATE_LEGAL_APPROVED`. |

The Phase-2 `intentReconEnabled()` block, harvest-accounting count, and auth header logic in the cron
route are **unchanged** — this module only fills the two seams below them.

---

## 1. The deferred contract P1 — RESOLVED (fee-leg recipient/type convention)

`REVIEW-contract.md` §P1(1) deferred this: the read model (`lib/fees.ts`
`getTokenFeeSummary`/`getCreatorFeeSummary`) selects Momento's leg by
`recipient IN [CREATOR, PLATFORM]` **and** `type IN [CREATOR_TRADING_FEE, PARTNER_TRADING_FEE, LOCKED_LP_FEE]`,
but no Phase-2 writer emits those rows, so reader and writer have never been reconciled.

**RESOLUTION (binding for Phase 3 writers — the reader is NOT changed; writers conform to it):**

> **`type` encodes the fee LEG semantics; `recipient` encodes WHO claims it.**
> They are written as a **fixed pair**; the reader already assumes this pairing, so writers must match it:

| FeeEvent `type` | FeeEvent `recipient` | `recipientWallet` | `amountMint` |
|---|---|---|---|
| `PARTNER_TRADING_FEE` | `PLATFORM` | `feeConfig.feeClaimer` (Momento) | quote (USDC) — `CollectFeeMode.QuoteToken` |
| `CREATOR_TRADING_FEE` | `CREATOR` | `feeConfig.creatorFeeWallet` | quote (USDC) |
| `LOCKED_LP_FEE` | `PLATFORM` **or** `CREATOR` (by NFT owner) | partner/creator wallet | base **or** quote (per `claimPositionFee`) |
| `CLAIMED` | matches the leg being swept (`PLATFORM`/`CREATOR`) | sweep destination | claimed mint |
| `TRANSFER_FEE_WITHHELD` | `PROTOCOL` (Phase-2 webhook; excluded from claimable) | — | creator-token mint |
| `REBATE` | `TRADER` | `trade.traderWallet` | `rebateMint` (USDC default) |

Rationale: this is the minimal change — `PLATFORM == Momento partner` everywhere (it already is in the
reader and in `fees.ts` `getTokenFeeSummary`'s `recipient === 'PLATFORM' → momentoClaimable` branch).
`PROTOCOL` stays reserved for Meteora's withheld 20% (recorded, never claimed by us). No reader edit, no
double-count: the summary sums `feeBaseUnits` only over same-mint legs, and these LP-fee legs are
USDC-denominated (`CollectFeeMode.QuoteToken`, spike-b), so they will read correctly once emitted.

**Accounting rows vs. claimed rows.** The 80% LP fee is split per-leg with `attribute2080()` and recorded
as `PARTNER_TRADING_FEE` + `CREATOR_TRADING_FEE` (the *accrual*, what the reader calls "claimable"). When a
claim CPI lands, we additionally write **one `CLAIMED` row per claim tx** (keyed by the claim `signature`)
and flip the swept accrual rows' `claimed=true` + `claimSignature`. The reader's "claimable" = accrual rows
with `claimed=false`; "lastClaimAt" = max `claimedAt`. `CLAIMED` rows are an audit/idempotency anchor and
are intentionally **not** in the reader's `type IN (...)` filter (no double count).

---

## 2. `lib/fee-claim.ts` — public surface

```ts
// All amounts base-unit strings at the boundary; bigint in the math layer.
export interface ClaimResult {
  tokenId: string; mint: string;
  partnerTradingFeeSig?: string;   // DBC claimPartnerTradingFee
  creatorTradingFeeSig?: string;   // DBC claimCreatorTradingFee
  partnerLpFeeSig?: string;        // DAMM v2 claimPositionFee (partner NFT)
  creatorLpFeeSig?: string;        // DAMM v2 claimPositionFee (creator NFT)
  withdrawWithheldSig?: string;    // Token-2022 harvest+withdraw
  recorded: number;                // FeeEvent rows written (CLAIMED + attributed legs)
  skipped: string[];               // human reasons (no-fees, deduped, not-graduated, …)
}
export interface RebateResult {
  attempted: number; sent: number; deduped: number; failed: number;
  signatures: string[];
}

/** Claim ALL fee sources for ONE graduated token (Token-2022 withheld + DBC partner/creator + DAMM v2 LP). */
export function claimTokenFees(tokenId: string, opts?: { actor?: string }): Promise<ClaimResult>;

/** Cron entry: iterate graduated tokens with claimable balance, bounded by FEE_CLAIM_BATCH. */
export function runClaimSweep(limit?: number): Promise<{ tokens: number; results: ClaimResult[] }>;

/** Pay one Trade's owed rebate (USDC default). Reserve→send→record, idempotent. */
export function payRebate(tradeId: string): Promise<{ sent: boolean; signature?: string; reason?: string }>;

/** Cron entry: select unpaid IN_APP rebates, bounded by REBATE_BATCH; partial-failure safe. */
export function runRebateSweep(limit?: number): Promise<RebateResult>;
```

---

## 3. CLAIM design (TODO(Phase 3) seam)

Eligibility: `CreatorToken.status = GRADUATED` (or `ACTIVE` for DBC bonding-phase fees), `feeConfig`
present, and either (a) `TRANSFER_FEE_WITHHELD claimed=false` rows exist (harvest needed) or (b) a
configured claim cadence elapsed. Per token, run up to four independent claim txns; **each is its own tx
with its own idempotency key** so a partial failure never blocks the others.

### 3a. Token-2022 withheld transfer fee → Momento fee vault
Reuse spike-a **exact** signatures: `harvestWithheldTokensToMint(connection, payer, mint, sources[], …)`
then `withdrawWithheldTokensFromMint(connection, payer, mint, destination=feeVault, withdrawWithheldAuthority, …)`.
Because we sign with the Privy server wallet (not a local Keypair), we do **not** use the spike's
all-in-one `sendAndConfirm` helpers; we build the instruction list
(`createHarvestWithheldTokensToMintInstruction` + `createWithdrawWithheldTokensFromMintInstruction`,
authority = `feeConfig.withdrawWithheldAuthority` = server wallet) into a `Transaction`, wrap as `BuiltTx`,
and `submit({route:'sender'})`. `sources[]` = the recipient ATAs carrying withheld fees — derived from the
`TRANSFER_FEE_WITHHELD` `FeeEvent` rows (their `signature` legs carry the mint; we resolve holder accounts
from confirmed tx meta or scan via `getProgramAccounts` filtered on withheld>0). The withdrawn balance lands
in the creator-token mint; it is the protocol/withheld pool, recorded `recipient=PROTOCOL`,
`type=CLAIMED` (not attributed to creator/partner — that 20% economics is Meteora-side, this is our tax pool).

### 3b. DBC bonding-phase trading fees (partner + creator)
Reuse spike-b **exact** signatures:
- `client.partner.claimPartnerTradingFee({ feeClaimer: MOMENTO_LP_FEE_CLAIMER, payer: serverWallet, pool, maxBaseAmount: u64::MAX, maxQuoteAmount: u64::MAX })`
- `client.creator.claimCreatorTradingFee({ creator: creatorWallet, payer: serverWallet, pool, maxBaseAmount, maxQuoteAmount })`

Both return a `web3.js` `Transaction`. **Signer note:** partner claim signs as `feeClaimer` = server
wallet (single `serverSigner()`). The creator claim's `creator` is the creator's wallet — the server wallet
can be `payer` but the creator must sign as `creator`. Phase-3A signs creator claims with the server wallet
**only when `creatorFeeWallet` is a Momento-custodied address**; otherwise the creator claim is routed
through the client-relay path (`buildUnsignedForClient` → creator embedded wallet → `submitClientSigned`)
or deferred to a creator-initiated action. (Open item §8.)

### 3c. DAMM v2 locked-LP fees (post-graduation)
DAMM v2 has no two-recipient fee field; the split lives in the two locked position NFTs from
`migrateToDammV2` (recorded in `LpPosition`, one `PARTNER`, one `CREATOR`). Reuse spike-b:
`cpAmm.fetchPoolState(pool)` → `cpAmm.getUserPositionByPool(pool, owner)` →
`cpAmm.claimPositionFee({ owner, position, pool, positionNftAccount, tokenAMint, tokenBMint, tokenAVault,
tokenBVault, tokenAProgram: getTokenProgram(tokenAFlag), tokenBProgram: getTokenProgram(tokenBFlag) })`.
Partner position → server wallet signs → `recipient=PLATFORM`. Creator position → same signer policy as §3b.

### 3d. Recording (atomic, idempotent — per claim tx)
On confirm, for each claim `SubmitResult`:
1. Compute the claimed amount from confirmed tx meta (base-unit integer, same pattern as
   `helius-webhook.ts verifyOnChain`) — never trust the SDK's `maxAmount` sentinel.
2. Split the LP legs with `attribute2080(feeBaseUnits, creatorTradingFeeBps, partnerTradingFeeBps)` to
   derive the `PARTNER_TRADING_FEE` / `CREATOR_TRADING_FEE` accrual amounts (USDC mint, so additive in the
   reader). The protocol 20% is *not* re-recorded here (Meteora withholds it; we record only the 80% legs we
   actually receive).
3. In ONE `prisma.$transaction`: `createMany({ skipDuplicates:true })` of
   - the attributed accrual rows (`internalRef = '${tokenId}:${recipient}:${type}:${claimSignature}'`),
   - one `CLAIMED` row (`signature = claimSignature`, unique),
   then `updateMany` flips the previously-unclaimed accrual rows for this token to `claimed=true,
   claimedAt=now, claimSignature`.
The webhook (`ingestHeliusEvents`) may also observe the same claim tx; its `TRANSFER_FEE_WITHHELD` legs are
keyed differently and `skipDuplicates` makes any overlap a no-op.

---

## 4. REBATE EXECUTION design (TODO(Phase 4) seam)

Selection: `Trade` where `source=IN_APP AND rebatePaid=false AND rebateBaseUnits > 0` (index
`@@index([source, rebatePaid])` already exists), bounded by `REBATE_BATCH`. Default path = **USDC**
(`rebateMint = MOMENTO_FEE.USDC_MINT`, fee-exempt, NO gross-up); token fallback uses the value already
computed by the Phase-2 cron via `grossUpTokenRebate`. The Phase-2 cron already wrote `rebateBaseUnits` +
`rebateMint` on the Trade and enqueued the off-chain `REBATE` `FeeEvent` (`internalRef =
'${tradeId}:TRADER:REBATE'`, `claimed=false`) — this module is the thin executor.

`payRebate(tradeId)`:
1. **Reserve before send (anti-double-pay, P0):** `updateMany({ where:{ id, rebatePaid:false }, data:{
   rebatePaid:true } })`. If `count === 0`, another worker/tick already claimed it → return `deduped`
   WITHOUT sending. This is the DB-level compare-and-set reservation; `rebatePaid` is the reservation flag.
2. Build the SPL transfer: USDC `createTransferCheckedInstruction` from `MOMENTO_REBATE_USDC_VAULT` ATA →
   `trade.traderWallet` ATA (create-idempotent via `createAssociatedTokenAccountIdempotentInstruction`),
   amount = `rebateBaseUnits`. Token fallback = Token-2022 `transferCheckedWithFee` with the grossed-up
   amount (spike-a). Wrap as `BuiltTx{ signers:[serverSigner()], label:'rebate' }`, `submit({route:'rpc'})`.
3. **On confirm:** in one `prisma.$transaction` set `Trade.rebateSignature = sig` and the `REBATE`
   `FeeEvent`'s `claimed=true, claimedAt, claimSignature=sig`.
4. **On send failure:** ROLL BACK the reservation (`rebatePaid=false`, clear nothing else) so the next tick
   retries — UNLESS the error is `TIMEOUT` (status unknown), in which case LEAVE `rebatePaid=true` and let
   the submit-layer idempotency key resolve it: a retry derives the same key and short-circuits to the prior
   signature if it landed (never a second transfer). `BLOCKHASH_EXPIRED`/`RPC_ERROR` → safe to roll back and
   rebuild. This is the partial-failure contract.

Batching: rebates are independent per Trade; `runRebateSweep` processes them in a bounded loop, accumulating
counts, and NEVER aborts the batch on one failure (collect, continue, report). Same-trader/same-mint/epoch
batching into a single multi-transfer tx is a **future optimization** (one reservation per leg still
required); Phase-3A keeps one tx per rebate for clean idempotency.

---

## 5. IDEMPOTENCY & ANTI-DOUBLE-PAY (the core invariant)

Three independent layers, any one of which alone prevents a double action:

1. **Submit-layer (broadcast at-most-once):** `submit()` derives an idempotency key from the unsigned
   message and reserves it in the **durable Redis store, fail-closed** — a server/treasury-signed broadcast
   refuses to run without Upstash (`requiresDurableStore`). A retried claim/rebate with the same instructions
   returns the prior signature (`deduped:true`) instead of a second on-chain tx. Survives serverless
   fan-out / overlapping cron ticks.
2. **DB unique key (record at-most-once):** every `CLAIMED` / accrual / `REBATE` row carries a UNIQUE
   `signature` (on-chain) or `internalRef` (off-chain). All writes use `createMany({ skipDuplicates:true })`
   or scoped `updateMany`, so re-recording is an insert-or-ignore no-op. `claimSignature` distinguishes
   "claimed in tx X" from "claimed in tx Y". **Never set both `signature` and `internalRef`** (CONTRACTS §a.6).
3. **State compare-and-set (act at-most-once):** rebates reserve via `updateMany(rebatePaid:false →
   rebatePaid:true)` BEFORE building the tx (§4.1); claims gate on the accrual row's `claimed=false` and on
   `CLAIMED.signature` uniqueness. The "reserve before send, roll back only on definitively-failed (non-
   TIMEOUT) errors" rule is what makes a crash between send and record safe: a `TIMEOUT` keeps the
   reservation and defers to layer 1.

**Never double-claim:** a claim CPI's success is anchored by its on-chain `signature`; the `CLAIMED` row's
`@unique signature` + the `claimed=true` flip mean a second tick finds nothing claimable (Meteora's claim
itself zeroes the pool, so even a hypothetical double-broadcast claims 0). **Never double-pay:** the
reserve-before-send CAS + submit-layer key make two rebate transfers for one Trade impossible across
instances.

---

## 6. Admin manual-claim endpoint — `POST /api/creators/[id]/fees/claim`

`requireAdmin(request)` (`failClosed`), constant-time, mirrors `creators/[id]/fees/route.ts` param
validation (`isValidUuid`). Body: `{ tokenId?: string, mint?: string }` (claim one token) or none (claim all
the creator's graduated tokens). Calls `claimTokenFees(tokenId, { actor: admin.id })`. Writes a
`PromotionLog`-style audit row (actor, target, method='fee-claim', metadata=ClaimResult signatures).
Response: `{ success:true, data: ClaimResult | ClaimResult[] }`. Errors map `SolanaTxError.code` → envelope
(`CONFIG_MISSING/STUBBED`→500, `SIMULATION_FAILED/SIGNER_REJECTED`→502, `DUPLICATE`→200 deduped).
This endpoint shares `lib/fee-claim.ts` with the cron — no duplicated CPI logic.

---

## 7. Cron wiring (the two seams)

Replace the `TODO(Phase 3)` comment with: `if (process.env.FEE_CLAIM_ENABLED==='1') { ...runClaimSweep(FEE_CLAIM_BATCH) }`
recording `claimsRecorded += Σ result.recorded`. Replace `TODO(Phase 4)` with:
`if (REBATE_SEND_ENABLED==='1' && REBATE_LEGAL_APPROVED==='1') { ...runRebateSweep(REBATE_BATCH) }`. Both are
default-OFF env-gated so the cron stays a safe no-op until ops + legal flip them. The Phase-2 recon + harvest
blocks and the existing response shape (`{reclassified, rebatesQueued, claimsRecorded, harvestNoted}`) are
preserved (extend `data` with `rebatesSent`).

---

## 8. Cross-module dependencies & open items

- **M-token-launch / M-pool (Phase 3):** must populate `feeConfig.feeClaimer`, `creatorFeeWallet`,
  `withdrawWithheldAuthority`, `dbcPoolAddress`, `quoteMint`, and the two `LpPosition` rows (partner/creator
  NFT mints) at launch/graduation. Claim cannot run without these. **Hard dependency.**
- **`lib/solana/*` (committed):** `submit`, `serverSigner`, `getConnection`, `SolanaTxError`. **Blocker:**
  `serverWallet.ts` live `@privy-io/node` signing is `TODO(ops)` + `STUBBED`; real claims/rebates cannot land
  until ops wires it. Design works against the stub for CI.
- **Meteora SDKs:** `@meteora-ag/dynamic-bonding-curve-sdk@1.5.10`, `@meteora-ag/cp-amm-sdk@1.4.3` — not yet
  in `apps/api`. Add as deps; re-verify SDK-minor-sensitive bits (`fetchPoolState` field names, position
  readers) per spike-b TODOs before mainnet.
- **`lib/fees.ts` reader (committed, unchanged):** the §1 resolution conforms the new writers to its existing
  `recipient=PLATFORM` + `type` filter — verify summaries light up after first real claim.
- **Creator-claim signer policy (OPEN):** whether the creator trading-fee + creator LP-fee claims are
  server-signed (custodied creator wallet) or client-relayed (creator embedded wallet). Phase-3A defaults to
  server-sign when custodied, else client-relay; finalize with the wallet-custody decision.
- **LEGAL READ (BLOCKING for prod rebate sends):** rebate disbursement is a value transfer to users; the
  `REBATE_LEGAL_APPROVED` gate MUST stay OFF in prod until compliance signs off (carried from REVIEW
  §6 "Compliance before Phase 4"). Claims (sweeping our own fees) are not gated by this.
