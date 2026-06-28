# REVIEW-correctness — Phase 3A (Solana-only, @solana/web3.js v1)

> Adversarial static correctness review. We CANNOT compile here, so this is the gate.
> Scope: `lib/{launch,trade,graduation,fee-claim,vesting}.ts` + their routes + foundation
> (`validation.ts`, `helius-webhook.ts` raised increment, migration 20260625000000) vs
> CONTRACTS-P3A / SPEC-P3A / D-* design docs.
> Each finding = {severity, file:line, problem, fix}. Severity: P0 = breaks money/idempotency or
> won't run; P1 = wrong behavior under realistic input / spec deviation with consequences;
> P2 = latent / cosmetic / hardening.

---

## SUMMARY

The five modules are structurally faithful to the contract: signing modes, the build→submit
two-call trade flow, the graduation lease state-machine, the fee-claim 3-layer anti-double-pay,
and the vesting server-vs-client fallback (with the same-ephemeral clean-tx rebuild) are all
implemented as specified. No P0 logic defect was found in the money math or the idempotency
cores. The findings below are P1 spec-deviations / latent correctness risks and P2 hardening.
All on-chain SDK shapes remain `TODO(verify-devnet)` and are correctly flagged as such by the
authors — those are NOT counted as review findings (they are known-open by design).

**Counts: P0 = 0 · P1 = 7 · P2 = 9**

---

## P0 — none

No defect was found that double-pays, double-migrates, double-claims, won't compile against the
committed schema/barrel, or mis-handles base-unit strings in the money path. (The graduation
`createSignature` @unique deviation, the rebate reservation, and the webhook string-increment are
all handled correctly — see P1/P2 notes.)

---

## P1 — wrong behavior / consequential spec deviation

### P1-1 — launch: `totalSupply` treated as WHOLE tokens but typed/validated as BASE units
`apps/api/lib/launch.ts:189-190` (`resolveKnobs`), `:346` (`totalTokenSupply: knobs.totalSupplyWhole`).
`launchTokenSchema` documents `totalSupply` as a base-unit string (CONTRACTS §e: "Money = base-unit
strings") and the row persists `totalSupply: knobs.totalSupply` verbatim, but `resolveKnobs` does
`totalSupplyWhole = Number(BigInt(totalSupply))` and feeds that to `buildCurveWithMarketCap` as
**whole** tokens (matching spike-b's `TOTAL_TOKEN_SUPPLY = 1_000_000_000`). So the SAME string is
interpreted two ways: whole-token to the SDK, "base-unit" everywhere else. With the default
`"1000000000"` it happens to be right (spike-b uses 1e9 whole); any caller who passes a true
base-unit supply (e.g. `1000000000` × 10^9) gets a curve sized 1e9× too large AND a `Number()` that
exceeds 2^53 (precision loss / `Infinity`-class bug). Also `transferFeeMaxBaseUnits` default
(`:198`) multiplies `totalSupplyBig * 10^decimals`, i.e. it treats `totalSupply` as whole there —
internally consistent with the whole-token reading but contradicting the schema's base-unit framing.
**Fix:** pick ONE meaning. Either (a) document `totalSupply` as WHOLE tokens in the schema/contract
and stop calling it base-unit, or (b) keep it base-unit and compute `totalSupplyWhole =
totalSupplyBig / 10^decimals` (BigInt division, then guard against Number overflow). Reject inputs
where `totalSupplyWhole` exceeds `Number.MAX_SAFE_INTEGER`.

### P1-2 — trade: `QUOTE_STALE` only checks venue, never minOut drift
`apps/api/lib/trade.ts:559-562` (`buildTrade`). D-trade §5 and the module header require
`QUOTE_STALE` when "the freshly resolved venue differs from the quoted venue, **or recomputed
minOut drifts beyond a tolerance**". The implementation only compares `fresh.venue !==
input.quote.venue` and then silently re-quotes + persists the NEW quote, building the swap with the
fresh `minOut`. A price that moved adversely between client quote and server build is accepted at
the new (worse) minOut with no `QUOTE_STALE` and no client re-confirm — the client's slippage
intent is honored (slippageBps re-applied) but the displayed quote the user approved is discarded.
**Fix:** compare `quote.expectedOutBaseUnits`/`minOutBaseUnits` (client) vs the freshly recomputed
values; if drift exceeds a tolerance (e.g. > slippageBps or a fixed bps), throw `QUOTE_STALE` so the
client re-quotes instead of silently rebuilding.

### P1-3 — trade: `submitTrade` reports `status:'CONFIRMED'` without confirming
`apps/api/lib/trade.ts:700-706`. After `submitClientSigned` returns, the code unconditionally returns
`status: 'CONFIRMED'` and sets `blockTime = new Date()` (a server wall-clock, not the chain block
time). `submitClientSigned`/`submit` return a landed-or-deduped `SubmitResult` but the contract's
`SubmitTradeResult.status` is `'CONFIRMED' | 'PENDING'` precisely so an unconfirmed/timeout broadcast
can be surfaced as PENDING. Writing a fake `blockTime` also pre-empts the webhook's authoritative
block time and could mark the IN_APP row "confirmed" for a tx that never lands. **Fix:** derive
`status` from the submit result (CONFIRMED only when the layer actually confirmed; PENDING on a
timeout/deduped-unknown) and set `blockTime` only from a confirmed result (let the webhook set the
authoritative value otherwise). At minimum do not fabricate `blockTime`.

### P1-4 — fee-claim: stranded rebate reservation can never be retried
`apps/api/lib/fee-claim.ts:858` + `:953-956` + `runRebateSweep:974`. `payRebate` rolls back the
`rebatePaid` reservation only inside its own `catch` for non-TIMEOUT errors. But if the process
crashes between the reserve (`:864`) and the send, or the `catch` rollback itself fails, the row is
left `rebatePaid=true, rebateSignature=null` with **no transfer sent**. `runRebateSweep` selects
only `rebatePaid:false` rows, so that trade is permanently skipped (the rebate is silently never
paid). The D-fee-claim §4 contract's "leave reserved only on TIMEOUT" rule assumes the rollback
always runs; a crash defeats it. **Fix:** add a reconciliation pass (or widen the sweep selector)
for rows `rebatePaid=true AND rebateSignature=null AND createdAt < now-staleWindow` that re-derives
the submit idempotency key (short-circuits to the prior sig if it landed, else re-sends). Without it
there is no recovery path for a crashed reservation.

### P1-5 — fee-claim: trading-fee CLAIMED amount uses the WRONG token program for the dest ATA
`apps/api/lib/fee-claim.ts:685, :722, :762`. The claimed-amount probe derives the destination ATA
with `TOKEN_CLASSIC_PROGRAM_ID` for the quote (USDC) mint. USDC is classic SPL, so for USDC legs
this is correct. BUT `getUserPositionByPool`/`claimPositionFee` (DAMM v2, §3c) can pay fees in
`tokenA`/`tokenB` where one side is the **Token-2022** creator mint (base-or-quote per spike-b);
the recording path forces `amountMint = quoteMint` and a classic-program ATA regardless. If a
locked-LP leg pays the base (Token-2022) side, `claimedAmountFromMeta` looks up an ATA under the
wrong program → finds nothing → records `0`, understating the accrual (the CLAIMED audit row is
still written, so it's not a double-pay, just wrong accounting). **Fix:** for LP-fee legs derive the
dest ATA under the correct program per mint (use `poolState.tokenAFlag/tokenBFlag` →
`getTokenProgram`), and record the actual claimed mint(s) rather than hard-coding `quoteMint` +
classic.

### P1-6 — graduation: `recoverFromChain` persists PLACEHOLDER NFT mints into a @unique column
`apps/api/lib/graduation.ts:727-735` (and `migrateAndPersist` already-migrated branch `:391`). When
on-chain position readers are unavailable, recovery calls `persistLpPositions` with
`positionNftMint: \`recovered-partner:${tokenId}\`` / `\`recovered-creator:${tokenId}\``.
`LpPosition.positionNftMint` is `@unique`. These synthetic strings are unique per token so they
won't collide across tokens, but (a) they are written as if real position NFTs (downstream
fee-claim's `getUserPositionByPool` will never match them, and `buildLpFeeClaim` falls back to
`positions[0]`), and (b) a later real recovery tick that DOES resolve the true mint will try to
`update` the row to the real mint — fine — but if two different tokens ever recover the SAME
fabricated shape (they can't here, but the `external-migrate:${tokenId}` / `recovered-*:${tokenId}`
pattern is fragile). More importantly the PARTNER row's `createSignature` is set to
`external-migrate:${tokenId}` (`:391/:726`), a non-signature placed in a `@unique` signature column,
which will then block any genuinely different token that produces a colliding placeholder and
pollutes audit. **Fix:** when the real NFT mint / signature is unknown, leave `positionNftMint` /
`createSignature` NULL (both are nullable) rather than inventing unique-column values; finalize from
`TokenFundraise.finalizeSignature` only, and let the fee-claim cron backfill positions.

### P1-7 — webhook: `contributorCount` increments per BUY, not per distinct contributor
`apps/api/lib/helius-webhook.ts:572-578`. The raised-tracking hook does
`contributorCount: { increment: 1 }` on every confirmed curve BUY. `getRaisedProgress`
(graduation.ts:144) computes the authoritative count as a `Set<wallet>.size`, so the cached counter
and the authoritative count diverge whenever a wallet buys twice. The field is "display only" per
D-graduation §3.1 so this is not a graduation-decision bug, but the displayed contributor count will
over-count repeat buyers (and the increment also fires for a curve BUY that is not a "contribution"
in the fundraise sense). **Fix:** either drop the `contributorCount` increment from the webhook
(let the authoritative `getRaisedProgress` own it) or gate it to first-seen wallets; at minimum
document that the cached counter is buys-not-contributors.

---

## P2 — latent / hardening / cosmetic

### P2-1 — fee-claim: PARTNER LP / partner-trading claim silently skipped if feeClaimer ≠ server wallet
`apps/api/lib/fee-claim.ts:567` (`buildLpFeeClaim`), and the partner-trading path assumes the
server can sign. `persistLpPositions` sets PARTNER `ownerWallet = feeConfig.feeClaimer`
(graduation.ts:657). If `MOMENTO_LP_FEE_CLAIMER` is NOT the same key as the Privy server wallet,
`owner.equals(signer.publicKey)` is false and the **partner** LP-fee claim is skipped as
`lp-partner-needs-client-relay` — i.e. Momento's own fee never gets claimed by the cron. The design
assumes feeClaimer == treasury == server wallet; nothing enforces it. **Fix:** assert/document that
`MOMENTO_LP_FEE_CLAIMER === serverWallet.address`, or add a server-signed partner path that signs as
the configured feeClaimer when it is custodied.

### P2-2 — trade: `effectiveFeeBps` is the static rebate target, not the realized effective rate
`apps/api/lib/trade.ts:485`. `effectiveFeeBps: token.rebateTargetBps` (~100) is returned verbatim.
When `priceUsd === 0` (devnet DAS commonly returns none), `rebateBaseUnits` collapses to 0
(`:470`), so the trader nets the FULL transfer fee yet the disclosure still says ~100 bps effective.
Cosmetic/disclosure mismatch, not a money bug. **Fix:** report `effectiveFeeBps = feeBps` when the
computed rebate is 0, else the target.

### P2-3 — trade: market-cap uses circulatingSupply but supply unit is ambiguous
`apps/api/lib/trade.ts:775`. `circulatingWhole = Number(toBigInt(circulatingSupply)) / 10**decimals`
assumes `circulatingSupply` is base units, while launch writes `totalSupply` as whole tokens
(P1-1). The two supply fields are interpreted on different scales; market cap is display-only so
low severity, but it will be off by 10^decimals if `circulatingSupply` is ever set in whole tokens
to match `totalSupply`. **Fix:** settle the supply unit convention (tie to P1-1) and apply it
consistently to both fields.

### P2-4 — graduation: `finalize` leaves `finalizeStartedAt` set (lease not cleared on COMPLETED)
`apps/api/lib/graduation.ts:793-805`. On COMPLETED the lease timestamp is never cleared. Harmless
because `graduateToken` short-circuits `COMPLETED` before claiming a lease, but a stale
`finalizeStartedAt` on a COMPLETED row is misleading for ops dashboards. **Fix (optional):** null
`finalizeStartedAt` in the finalize update.

### P2-5 — graduation: `migrationFeeOptionFor` default silently coerces unmapped bps to 1%
`apps/api/lib/graduation.ts:495-497` and launch.ts:458-462 (`migrationFeeOptionFromBps`). Both
default any unmapped `migrationFeeBps` to `FixedBps100`. Launch always bakes
`DEFAULT_MIGRATION_FEE_BPS = 100`, so today they agree, but if a future launch persists a
non-tier bps the graduation migrate would use a DIFFERENT fee tier than the config baked — the
two must stay in lockstep. **Fix:** validate `migrationFeeBps ∈ {25,30,100,200,400,600}` at launch
(reject otherwise) so the graduation lookup can't diverge; or throw on unmapped instead of
defaulting.

### P2-6 — vesting: withdraw assumes CLASSIC token program for JUP_LOCK claim ATAs
`apps/api/lib/vesting.ts:366-369`. `isT22 = false` is hard-coded ("schedule does not persist token
program; classic-default"). For a Token-2022 creator mint the recipient/escrow ATAs are derived
under the classic program → wrong ATA → claim build/exec fails. `VestingSchedule` has no token-
program column, but the mint's program is resolvable from `CreatorToken.tokenProgram` via
`schedule.tokenId`. **Fix:** look up the token program from the CreatorToken (or add a column) and
pass it to the ATA derivation for both Streamflow and Jup-Lock withdraw paths.

### P2-7 — vesting: `getVestingState` Streamflow `unlocked` fallback yields claimable 0 even when due
`apps/api/lib/vesting.ts:464-471`. If `stream.unlocked` is neither a function nor a value, `unlocked`
defaults to `withdrawn` → `claimable = 0`. A recipient with genuinely-claimable funds would see
"Nothing to withdraw" (withdraw route 400). Acceptable degradation but worth a local cliff/linear
fallback (the Jup-Lock path already computes one via `jupLockUnlocked`). **Fix:** compute a
local cliff+linear `unlocked(now)` from the persisted schedule when the SDK field is absent.

### P2-8 — fee-claim: withheld-source ATA discovery is best-effort and capped at 50 rows
`apps/api/lib/fee-claim.ts:412-416`. `take: 50` on the `TRANSFER_FEE_WITHHELD` rows means a token
with >50 unclaimed withheld legs harvests only a subset per tick (the rest next tick). Not
incorrect (idempotent, eventually consistent) but undocumented partial-harvest behavior; a token
with many holders could lag. **Fix:** loop until exhausted or document the per-tick cap.

### P2-9 — launch: `creatorTradingFeePercentage` rounding can drift the 80% split off the baked bps
`apps/api/lib/launch.ts:255-257`. `Math.round((creatorTradingFeeBps/10000)*100)` collapses the bps
to an integer percentage (e.g. 5000 bps → 50). Any non-round bps (e.g. 3333) rounds to 33%, so the
on-chain `creatorTradingFeePercentage` no longer matches `TokenFeeConfig.creatorTradingFeeBps`
persisted in the DB; fee-claim's `attribute2080`/accrual then uses bps that disagree with the
on-chain split. The schema allows any 0..10000 bps. **Fix:** restrict the request bps to whole
percents, or verify the SDK accepts a bps/fraction directly and pass the exact value.

---

## Things checked and found CORRECT (no finding)

- **validateBody usage:** every route uses `{ success, data | response }` correctly (returns
  `parsed.response`, not `.error`) — matches `lib/validation.ts`.
- **App Router params:** all `[mint]`/`[id]` handlers use `{ params }: { params: Promise<{...}> }`
  and `await params` (Next 15) — correct and consistent.
- **Imports:** cross-module + `@momento/shared` (`MOMENTO_FEE/LAUNCH/TRADE/CLAIM`, `PoolType`,
  `TradeSide`) + the `lib/solana` barrel all resolve to real exports; `LpProvider` vs `PoolType`
  share the `METEORA_DAMM_V2` member so `lpPosition.findFirst({ provider:'METEORA_DAMM_V2' })`
  (trade.ts:288) is valid; `Trade.source`/`FeeEvent.source` use `FeeSource` values (`'IN_APP'`).
- **Prisma model/field names:** Trade/FeeEvent/TokenFundraise/LpPosition/VestingSchedule/
  CreatorToken/TokenFeeConfig/PromotionLog field usages match the committed schema; `tokenId_owner`
  and `userId_chain` composite-unique selectors are correct; `User.isAdminApproved` exists.
- **Webhook raised increment:** correctly gated on `legInsert.count === 1` (per-(sig,mint) unique),
  reads the base-unit STRING then writes `(prev + raisedQuote).toString()` as bigint (no Prisma
  numeric `increment` on the string column), inside the per-event `$transaction`, status-filtered
  so it no-ops on terminal/absent fundraise. Migration SQL matches the contract (additive,
  nullable; uses `IF NOT EXISTS` for the db-push/migrate dual path).
- **Graduation idempotency:** the three layers (lease `claimLease` conditional updateMany; stable
  `idempotencyKey=graduate:migrate:<tokenId>`; @unique `finalizeSignature`/`positionNftMint`/
  `@@unique([tokenId,owner])`) are all present; `finalizeSignature` persisted EARLY post-broadcast
  as the recovery breadcrumb; short-circuit on existing `finalizeSignature`; `recoverFromChain` on
  the already-migrated rejection; lease NOT released on failure (kept until TTL). The
  `createSignature @unique` deviation (PARTNER row carries it, CREATOR row null) is correctly
  documented and avoids the constraint violation (only the placeholder value in P1-6 is the issue).
- **Fee-claim anti-double-pay:** reserve-before-send CAS (`updateMany rebatePaid:false→true`,
  count 0 ⇒ deduped without send); roll back only on definitive (non-TIMEOUT/DUPLICATE) failure;
  per-claim CLAIMED row keyed by `@unique signature`; accrual keyed by
  `internalRef=${tokenId}:${recipient}:${type}:${claimSignature}`; never sets both
  signature+internalRef; `createMany skipDuplicates`. Money kept in bigint; `grossUpTokenRebate`
  only on the token fallback.
- **Vesting server↔client fallback:** PRIMARY `submit()` server path; on `PARTIAL_SIGN_UNSUPPORTED`
  (raised by `applySigners` step 5) OR `VESTING_FORCE_CLIENT_COSIGN=1`, rebuilds a CLEAN tx from the
  snapshotted original ixs **reusing the SAME ephemeral Signer** (so `streamId` =
  metadataPubKey/escrow PDA stays stable), with `[ephemeral, clientRelaySigner(payer)]`; row stays
  PENDING on the client path. `signMode` discriminator returned. Withdraw amount = min(requested,
  claimable); cancel rejects JUP_LOCK (cancelMode=0).
- **web3.js v1:** Transaction/Connection/PublicKey/Keypair/ComputeBudget-via-submit usage is all
  v1; no v2/`@solana/kit` imports anywhere; SPL ix builders are the v1 `@solana/spl-token` names.
- **Cron auth:** `cron/graduate` mirrors `cron/fee-claim` fail-closed constant-time bearer compare
  exactly; fee-claim seams are env-gated (FEE_CLAIM_ENABLED / REBATE_SEND_ENABLED &&
  REBATE_LEGAL_APPROVED) and extend `data` with `rebatesSent`, Phase-2 blocks preserved.
- **Error→HTTP mapping:** routes re-throw `Response` (auth/validation) and map `SolanaTxError.code`
  /`TradeError.code` per §d (launch DUPLICATE→200, INSUFFICIENT_FUNDS→402, TIMEOUT/BLOCKHASH→202,
  one-token→409; admin claim CONFIG/STUBBED→500, SIM/SIGNER_REJECTED→502, DUPLICATE→200).
</content>
</invoke>
