# REVIEW-security — Phase 3A (Solana-only) adversarial security & economic review

> Scope: `apps/api/lib/{launch,trade,graduation,fee-claim,vesting}.ts` + their routes +
> `app/api/cron/{graduate,fee-claim}/route.ts` + `creators/[id]/fees/claim/route.ts`.
> Cross-referenced: `lib/auth.ts`, `lib/fees.ts`, `lib/solana/{signer,submit,serverWallet}.ts`.
> Reviewed statically (cannot run). Default-to-flag. Each finding = {severity, file:line, attack/risk, fix}.
> Reviewer date: 2026-06-24.

Legend: **P0** = exploitable now / fund loss / authz bypass. **P1** = serious, conditional, or
defense-in-depth gap on a money path. **P2** = hardening / correctness-under-stress.

---

## P0 findings

### P0-1 — Rebate is paid against a SERVER-recorded amount but the user submits an ARBITRARY tx (rebate farming / decoupled-rebate)
**File:** `apps/api/lib/trade.ts:644-707` (`submitTrade`) + `:551-624` (`buildTrade`); paid by
`apps/api/lib/fee-claim.ts:841-959` (`payRebate`).
**Attack/risk:** `buildTrade` computes `rebateBaseUnits` from the server-side quote and writes it onto the
`Trade` row BEFORE any signature exists. `submitTrade` then broadcasts the client-supplied `txBase64`
**verbatim** (`submitClientSigned({ txBase64, idempotencyKey })`, trade.ts:681) with **no check that the
submitted transaction is the one we built** — not the owner, not `amountIn`, not `minOut`, not the pool,
not even that it is a swap. The only binding is `Trade.userId === user.id` (ownership) and the opaque
`idempotencyKey`. So an authenticated user can:
  (a) call `/buy` with a large `amountInBase` to mint a big recorded `rebateBaseUnits`, then submit a
      *different* (tiny or unrelated) signed tx — or a tx whose `signature` simply lands — and still be
      owed the full recorded USDC rebate when `runRebateSweep` pays from `MOMENTO_REBATE_USDC_VAULT`;
  (b) more simply: the rebate is recorded from a *quote* (`expectedOut`), not from confirmed on-chain
      fill, so any divergence between quoted and actual fill (or no fill at all if the tx is a no-op that
      still confirms) is free USDC. `payRebate` only checks `trade.source==='IN_APP'`, `rebateBaseUnits>0`,
      `rebatePaid===false` (fee-claim.ts:848-858) — it never re-derives the rebate from the confirmed
      transfer-fee actually paid on-chain.
This is the core "rebate sizing from a price/quote the attacker influenced + an unbound submit" abuse. The
`REBATE_LEGAL_APPROVED`/`REBATE_SEND_ENABLED` double-gate (fee-claim cron:227) currently masks it (rebates
are OFF), but the day rebates turn on this is a direct drain of the rebate vault.
**Fix:** Before paying, re-derive the owed rebate from the CONFIRMED tx meta (the actual Token-2022
transfer fee withheld on the swap's token leg for *this* `signature`), exactly like
`claimedAmountFromMeta` does for claims — never from the pre-signature quote. AND bind submit to build:
in `submitTrade`, re-derive the idempotency/message and assert the deserialized `txBase64` matches the
intent (same feePayer==traderWallet, same pool, same `amountIn`, same `minOut`) before broadcast; reject
mismatches. Cap per-trade and per-wallet rebate, and require `blockTime!=null` + a positive on-chain
fill before a rebate is eligible.

### P0-2 — `payRebate` reserve-before-send is NOT atomic with the submit-layer dedup; the rollback re-opens a paid reservation on slow confirms
**File:** `apps/api/lib/fee-claim.ts:863-958` (`payRebate`).
**Attack/risk:** The CAS (`updateMany rebatePaid:false→true`, :864) is sound in isolation, but the
failure contract has a double-pay window. On a `BLOCKHASH_EXPIRED` / `RPC_ERROR` / `SIMULATION_FAILED`
the code rolls the reservation back to `rebatePaid:false` (:953-956) so a later tick retries. However the
submit layer may have **already broadcast** a transfer that later lands (the `rpc` route does
`sendRawTransaction` then polls; a confirm-poll timeout is reported as `TIMEOUT`, but a transport error
*after* a successful broadcast, or a node that returns an error while the tx propagates, is classified as
non-TIMEOUT). After rollback, the next tick re-derives a **new** transfer (fresh blockhash ⇒ fresh
message ⇒ fresh idempotency key inside `submit`, because the key is derived from the unsigned message at
submit.ts:426-428) and pays a SECOND time. The submit-layer idempotency key is per-*message*, not per-
*tradeId*, so it does NOT dedup two rebate transfers for the same trade across rebuilds.
**Fix:** Pass an explicit, stable `idempotencyKey: rebate:<tradeId>` into `submit` (the rebate ix set is
otherwise rebuilt with a new blockhash each tick, defeating message-derived dedup). Treat any error where
a broadcast may have occurred as "status unknown" (do NOT roll back); reconcile by reading the confirmed
chain state keyed on `tradeId`/destination before re-issuing. Only roll back on errors guaranteed to be
pre-broadcast (e.g. `SIMULATION_FAILED` from a *preflight*, or `CONFIG_MISSING`).

### P0-3 — Creator `recipient`/`amountBase` on vesting create is unconstrained ⇒ creator can move the whole supply to an arbitrary wallet, and the SERVER co-signs it
**File:** `apps/api/app/api/vesting/create/route.ts:58-98` + `apps/api/lib/vesting.ts:141-321`.
**Attack/risk:** `vestingCreateSchema` (validation.ts) does not constrain `recipient` to any allow-list and
`amountBase` only to `/^[1-9]\d*$/`. The route verifies the caller owns `tokenId` and `mint` matches, then
builds a Streamflow/Jup-Lock create whose tokens are pulled from the **payer ATA**. On the PRIMARY path
the **server wallet co-signs** (`signers:[serverSigner(), ephemeralSigner(...)]`, vesting.ts:191/300) and
`submit({route:'rpc'})` broadcasts it (create route:172). The source-of-funds is `senderToken =
getAssociatedTokenAddressSync(mint, payer, ...)` where `payer = creator wallet` — so for a creator whose
funds are the creator's own ATA this is "creator vests their own tokens to anyone," which is by-design.
BUT: (1) there is **no check that the creator actually holds `amountBase`** or that this token's
team/LP allocation budget isn't exceeded — a creator can create unlimited vesting schedules to colluding
wallets, and on the **server path the treasury is the fee-payer and co-signer** for a transfer that benefits
an arbitrary `recipient`; (2) `recipient` is never validated as base58 (`z.string()` only), so a malformed
recipient reaches `new PublicKey(input.recipient)` deep in the builder and throws an unmapped 500 instead
of a clean 400 (DoS / error-shape leak). The deeper risk is the SERVER becoming a co-signer on a
creator-directed value transfer with no allocation ceiling and no recipient policy.
**Fix:** (a) Validate `recipient` with `isValidMint`/base58 in the route (mirror the mint guard) → 400.
(b) Enforce a per-token vesting allocation ceiling (sum of existing `VestingSchedule.totalBaseUnits` for
the token + this `amountBase` ≤ the token's vesting budget baked at launch) before building. (c) On the
server path, confirm the source ATA balance covers `amountBase` (simulate) so the treasury never co-signs
a doomed/abusive transfer. (d) Reconsider whether the treasury should EVER co-sign a creator→arbitrary
recipient transfer; if the creator owns the source ATA this should be the client-relay path (creator
signs, no server co-sign).

---

## P1 findings

### P1-1 — Admin fee-claim `{}` (no selector) ignores graduated/active eligibility scope vs single-token path, and `claimTokenFees` sends creator legs to `creatorFeeWallet` with no re-validation of custody
**File:** `apps/api/app/api/creators/[id]/fees/claim/route.ts:94-110`; `apps/api/lib/fee-claim.ts:524-551,
705-739`.
**Attack/risk:** The admin route is correctly `requireAdmin`-gated and ownership-scopes tokens to creator
`[id]`. The custody guard in `buildCreatorTradingFeeClaim` (fee-claim.ts:536 `creator.equals(signer.publicKey)`)
and `buildLpFeeClaim` (:567) is the right deferral — it skips client-relay-needing creator claims. BUT the
claim *destination* and the recorded `destinationWallet` come straight from `feeConfig.creatorFeeWallet`,
which was set at launch from `input.creatorWallet` (launch.ts:571) with no on-chain proof the creator
controls it. The on-chain claim CPI sends to whatever wallet the Meteora program credits (fine), but the
recorded accrual + audit row attribute funds to `creatorFeeWallet`; if that value was ever attacker-set
(see P1-5), the audit trail and any downstream creator-claimable accounting is poisoned. Lower severity
because the actual fund movement is program-controlled, not address-controlled here.
**Fix:** Treat `creatorFeeWallet` as untrusted display metadata; never use it as a transfer destination
without the program enforcing it. Record the *confirmed* destination from tx meta, not the configured
wallet.

### P1-2 — Graduation `lockIfNeeded` silently swallows a non-perma-locked LP leg ⇒ a CREATOR (or even partner) LP position can be left UNLOCKED, then finalized as `locked:true`
**File:** `apps/api/lib/graduation.ts:525-561` + `persistLpPositions:598-639`.
**Attack/risk:** `lockIfNeeded` iterates positions, and for any leg the migrate did NOT perma-lock it does
**nothing but a TODO comment** (the explicit lock CPI is commented out, :542-554), then `catch {}` swallows
any read error (:556). Regardless, `persistLpPositions` unconditionally writes `locked: true` and
`lockedUntil: null` for both rows (:607-608, :628-629). So if the SDK's migrate does NOT auto-perma-lock
the `*_locked_lp` legs (an explicitly UNVERIFIED assumption, §10.2), graduation finalizes a token whose
LP is actually withdrawable while the DB claims it is perma-locked. For the creator leg the keeper cannot
sign the lock anyway, so an unlocked creator LP position is a real fund-at-rest exposure (creator can pull
liquidity that was promised locked). This also feeds trade venue resolution and the fee-claim LP sweep,
which trust `locked`.
**Fix:** Do not finalize with `locked:true` unless the lock is on-chain verified per leg. For a partner
leg owned by the server wallet, actually issue `permanentLockPosition` (the commented code) and confirm.
For a creator leg that migrate did not perma-lock, finalize the row as `locked:false` and surface a P0
alert (the committed split assumes 100% locked; an unlocked leg is a spec violation, not a no-op).

### P1-3 — Graduation re-confirm uses confirmed `Trade` BUY rows whose `amountInBaseUnits`/`amountInMint` are written from the (attacker-influenced) quote, not from confirmed on-chain inflow
**File:** `apps/api/lib/graduation.ts:111-145` (`computeConfirmedRaise`) sourced from
`apps/api/lib/trade.ts:591-616` (`buildTrade` persists `amountInBaseUnits: quote.amountInBaseUnits`).
**Attack/risk:** The raise sum counts `Trade` rows with `venue=METEORA_DBC, side=BUY, blockTime!=null,
amountInMint==quoteMint`. `blockTime` is set in `submitTrade` from `new Date()` (trade.ts:688) the moment
WE relay — NOT from the on-chain block, and NOT proof the swap actually moved `amountInBaseUnits` of USDC
in. Combined with P0-1 (submit tx is unbound from the intent), a user can persist a BUY intent with a huge
`amountInBase`, submit any tx that merely confirms, and inflate the confirmed-raise sum to cross the
graduation threshold prematurely (or to mis-state fundraise progress). Graduation then migrates on a raise
that never landed.
**Fix:** Compute the raise from the webhook-verified ledger (confirmed USDC inflow derived from tx meta),
not from `Trade.amountInBaseUnits` (the quoted intent value). Set `Trade.blockTime` only from the confirmed
on-chain block time, and gate the BUY-as-raise count on a webhook-verified amount field, not the quote.

### P1-4 — `recoverFromChain` / `migrateAndPersist` write synthetic placeholder identifiers (`external-migrate:`, `recovered-partner:`) into unique columns and finalize as COMPLETED
**File:** `apps/api/lib/graduation.ts:386-397, 726-735` + `finalize:783-818`.
**Attack/risk:** When migrate readers are unavailable, the code persists `migrateSignature =
external-migrate:<tokenId>` (:391/:726) and `positionNftMint = recovered-partner:<tokenId>` (:732-733),
then `finalize` flips the token to `GRADUATED`/`COMPLETED`. These placeholders are written into
`TokenFundraise.finalizeSignature` (@unique) and `LpPosition.positionNftMint` (@unique). Consequences:
(1) a token can be marked GRADUATED with **no real on-chain pool/positions resolved**, after which trade
venue resolution (`resolveTradeVenue`) flips to DAMM v2 and `getTokenDetail` reports graduated — but the
real pool address may be `''` (persistLpPositions poolAddress fallback, :729). Trades then resolve a
graduated token with an empty pool address → `VENUE_UNRESOLVED` or, worse, a swap built against a wrong/
empty pool. (2) The fake `finalizeSignature` permanently occupies the unique slot, blocking the real
signature from ever being recorded on reconciliation.
**Fix:** Never finalize on synthetic identifiers. If the chain readers cannot resolve the real pool +
both position NFT mints + a real migrate signature, keep the row `FINALIZING` (let the lease expire and
retry) and alert; do not write placeholder values into unique on-chain columns nor flip to GRADUATED.

### P1-5 — `feeClaimer`/`leftoverReceiver`/authorities default to env or treasury with weak validation; a missing/typo'd `MOMENTO_LP_FEE_CLAIMER` silently routes leftovers & fees, and creator-token mint can be born with treasury as transferFeeAuthority but feeClaimer unset
**File:** `apps/api/lib/launch.ts:242-252, 396-403, 562-589`.
**Attack/risk:** `feeClaimerPubkey()` prefers `process.env.MOMENTO_LP_FEE_CLAIMER` and falls back to the
treasury; `createConfig` sets BOTH `feeClaimer` and `leftoverReceiver` to `ctx.feeClaimer` (:398-399). If
the env var is set to an attacker-controlled (or wrong) value in a compromised/misconfigured deploy, ALL
partner fees AND all unsold/leftover base tokens at graduation route to that address — and it is baked
into the immutable DBC config. There is no allow-list / on-chain-treasury cross-check. Separately,
`feeClaimerAddressOrNull()` (:725-731) returns `null` on resolve failure and the row is created with
`feeConfig.feeClaimer = null` while the on-chain config used a *different* resolved value, desyncing the
recorded claim destination from the on-chain one.
**Fix:** Validate `MOMENTO_LP_FEE_CLAIMER` against a pinned, ops-controlled treasury allow-list at launch
(reject unknown). Fail the launch (don't fall back to treasury silently) if the partner/leftover receiver
cannot be resolved to a trusted address. Persist exactly the value used on-chain (no null/desync).

### P1-6 — Vesting withdraw recipient check compares to `beneficiaryWallet` only; a recipient whose embedded wallet rotated, or a beneficiary set by wallet-string at create, can be impersonated by anyone who controls that string match
**File:** `apps/api/app/api/vesting/[id]/withdraw/route.ts:53-56` + create route:107-121.
**Attack/risk:** Withdraw authorizes `schedule.beneficiaryWallet === wallet` (the caller's resolved Solana
wallet). This is recipient-only and the BUILT tx is recipient-signed (good). The gap is upstream: at
create, `beneficiaryWallet` is taken verbatim from `input.recipient` (a raw, unvalidated string,
create route:120) and `beneficiaryUserId` is resolved by `findFirst({ where:{ walletAddress: recipient }})`
(:107-110). If two users ever share / a `pending-` wallet string collides, or `recipient` is set to a
wallet the creator does not actually control the user-binding of, the authorization is purely string-
equality on an unvalidated field. There is no validation that `recipient` is a real base58 pubkey at
create, so a non-base58 recipient is stored and then `new PublicKey(wallet)` in withdraw (:61) is fine
(wallet is the caller's), but `buildVestingWithdraw` builds against `schedule.streamId`/`tokenMint`
regardless of recipient validity. Net: the on-chain tx is safe (recipient signs), but the DB authorization
model rests on an unvalidated string and a wallet-string `findFirst` that is collision-prone.
**Fix:** Validate `recipient` as base58 at create (400 otherwise). Prefer authorizing withdraw by
`beneficiaryUserId === user.id` when set, with the wallet match as a secondary check; never rely solely on
an unvalidated wallet string. Ensure `getVestingState`/`buildVestingWithdraw` use the schedule's recorded
token program (see P2-3) so the recipient ATA is correct.

### P1-7 — `getTokenDetail`/quote use DAS `price=0` fallback; rebate sizing and market cap silently become 0 (or skew) when the oracle is down or returns a stale/zero price
**File:** `apps/api/lib/trade.ts:220-244` (`fetchDasPriceUsd`), `:464-470`, `:774-776`.
**Attack/risk:** When DAS has no price, `fetchDasPriceUsd` returns 0; `rebateToUsdc` then returns 0
(fees.ts:119), so the recorded `rebateBaseUnits` is 0 — denial of rebate, not theft, on the down case.
The more abusable direction: the price feed is `getAsset` on the *creator token mint*, which for a thinly
traded just-launched token is exactly the value a creator/attacker can manipulate cheaply. Because the
quote's `priceUsd` snapshot drives `rebateBaseUnits` (USDC paid out), a manipulated-high token price
inflates the USDC rebate owed for a given net token rebate. Combined with P0-1 this compounds rebate
farming. There is no sanity band on the price, no comparison to pool-implied price, no staleness check
beyond `>0`.
**Fix:** Derive the price for rebate sizing from the pool/curve state (the venue quote already touches the
pool), not from DAS `getAsset`; clamp to a sane band and reject `priceUsd<=0` for rebate purposes (record
rebate as deferred/true-up rather than 0 or inflated). Add staleness + deviation guards.

### P1-8 — `minOut` (slippage) is the ONLY MEV guard and it is fully attacker-/client-set; the server accepts `slippageBps` up to 5000 (50%) and never validates the client honored the quoted `minOut`
**File:** `apps/api/lib/trade.ts:199-204, 452, 500-537`; schema `tradeOrderSchema` (slippageBps max 5000).
**Attack/risk:** SPEC §4 states "slippage `minOut` is the MEV guard." The server computes `minOut` from
`expectedOut*(1-slippageBps)`, but (a) `slippageBps` is client-supplied up to 5000 (50%) — a user can set
near-zero protection; and (b) because the submitted tx is unbound from the built tx (P0-1), the user can
submit a swap with a DIFFERENT (lower) `minimumAmountOut` than the server put in the built tx, so even the
server's `minOut` is not enforced at submit. This is a self-MEV exposure (the user can be sandwiched), and
more importantly it means the server's quoted protection is advisory only.
**Fix:** Bind the submitted tx to the built tx's `minimumAmountOut` (part of the P0-1 fix). Consider a
lower hard cap on `slippageBps` for in-app swaps and refuse submits whose decoded `minOut` is below the
quoted value.

### P1-9 — Trade ownership error is mapped to a misleading code/route status, masking IDOR attempts; submit accepts a `[mint]` path param it never cross-checks against the intent's token
**File:** `apps/api/lib/trade.ts:659-663` + `app/api/tokens/[mint]/buy/submit/route.ts:27-45`.
**Attack/risk:** `submitTrade` correctly rejects a non-owner with a 403 (good — no IDOR on the Trade row).
However the submit route validates `[mint]` with `isValidMint` but **never checks the intent's token
matches `[mint]`** — a user can POST their own `intentId` for token A to `/tokens/<mintB>/buy/submit`.
Harmless today (the tx is the user's own and bound to A's pool), but it defeats per-mint rate-limiting/
analytics and is a latent confusion bug if any submit-time logic ever keys off `[mint]`. Also the
non-owner path throws `WALLET_NOT_READY` (semantically wrong) which the route maps to 403 by coincidence
of the mapping table; a future mapping change could turn this into a 400 and leak intent existence.
**Fix:** Add an explicit, dedicated `FORBIDDEN`/ownership error code mapped to 403 (don't reuse
`WALLET_NOT_READY`). Assert the intent's token mint equals the `[mint]` path param.

### P1-10 — `claimTokenFees` derives the claimed amount and destination ATA using the TOKEN_CLASSIC program id for the USDC quote leg, but uses the recorded `ownerWallet`/`feeClaimer` as the destination owner without proving custody — and on a `deduped` submit it still records nothing, leaving accruals unclaimed
**File:** `apps/api/lib/fee-claim.ts:678-698, 716-735, 757-775`.
**Attack/risk:** Two issues. (1) The destination ATA for amount derivation is computed with
`TOKEN_CLASSIC_PROGRAM_ID` for `quoteMint` (USDC is classic — fine) but if a token's `quoteMint` were ever
a Token-2022 mint the derived ATA (and thus the credited-amount read) would be wrong, silently recording
0. (2) On `res.deduped` the code pushes `*:deduped` to skipped and records NOTHING (e.g. :675-676), but
the prior CLAIMED row that caused the dedup may have recorded 0 (if its meta read failed), so the accrual
flip never happens and fees appear perpetually unclaimed → the next sweep re-claims (no on-chain double
because of submit dedup, but the accounting never converges). Not a direct theft, but a money-accounting
integrity gap on a fund path.
**Fix:** Resolve the token program for `quoteMint` from config, not a hardcoded classic id. On a deduped
claim, still reconcile the accrual `claimed` flags from the existing CLAIMED row's signature so accounting
converges.

---

## P2 findings

### P2-1 — `launchCreatorToken` regenerates ephemeral config/baseMint keypairs on every (cross-process) call ⇒ a resumed launch after a crash mid-`createConfig` can mint a DUPLICATE config and orphan funds
**File:** `apps/api/lib/launch.ts:612-665`.
**Risk:** Acknowledged in-code (§9.6) but unmitigated: `Keypair.generate()` at :619-620 means a resume on
a fresh serverless instance uses NEW pubkeys; the durable submit store only dedups the SAME message, and a
new keypair changes the message, so a crash after `createConfig` broadcast but before the DB
`dbcConfigKey` update can create a second config (treasury pays rent twice; orphaned config). Money leak
(rent/fees), not theft.
**Fix:** Persist the ephemeral secret keys (encrypted, keyed by `tokenId`) and reuse on resume, as the
open item states; do not go live cross-process without it.

### P2-2 — `markFailed` consumes the creator's one-token `@@unique` slot permanently; combined with the launch route's 409 on FAILED, a single bad launch bricks the creator forever with no self-service recovery
**File:** `apps/api/lib/launch.ts:605-610, 733-742` + route:76-84.
**Risk:** A non-retriable failure marks the row FAILED and the route returns 409 on any subsequent launch
("manual ops review required"). DoS-of-self / support burden, not a security hole, but an attacker who can
force a non-retriable error during launch (e.g. by racing) can permanently block a creator's slot.
**Fix:** Provide an ops/automated FAILED→reset path, or allow re-launch over a FAILED row that produced no
on-chain mint (mintAddress null).

### P2-3 — Vesting withdraw/state hardcode `isToken2022 = false` ⇒ Token-2022 vested mints compute the WRONG ATA and program id, sending claims to a non-existent/uncreatable account
**File:** `apps/api/lib/vesting.ts:366-369` (withdraw), `:482-503` (state).
**Risk:** The schedule does not persist the token program, so withdraw assumes classic. For a Token-2022
creator mint (the default for launched tokens!), the recipient/escrow ATAs are derived under the classic
program and the claim ix will fail or target the wrong account. Functional break on the main token type;
borderline P1 because vested creator tokens ARE Token-2022, but no direct fund-loss (tx fails).
**Fix:** Persist the token program on `VestingSchedule` at create and use it in withdraw/state ATA
derivation.

### P2-4 — Cron auth is correct (constant-time, fail-closed) but `ALLOW_INSECURE_CRON` + absent `CRON_SECRET` opens the state-mutating sweep in any non-production `NODE_ENV` (incl. `preview`/`test` deploys that touch real infra)
**File:** `app/api/cron/graduate/route.ts:27-46`, `app/api/cron/fee-claim/route.ts:41-63`.
**Risk:** The fail-closed default is right. The residual risk is `NODE_ENV !== 'production'` being true on a
preview/staging deploy wired to real RPC/treasury, where `ALLOW_INSECURE_CRON=1` would expose graduate +
fee-claim/rebate sweeps unauthenticated. Low because it requires an explicit opt-in env, but it gates real
fund movement.
**Fix:** Additionally require the secret to be unset AND an explicit `SOLANA_NETWORK=devnet`/localnet (or a
dedicated `INSECURE_OK` only honored on localhost) before allowing the bypass; never honor it when a
mainnet RPC/treasury is configured.

### P2-5 — `getVestingState` (used by `/vesting/list`) calls `getOne`/escrow fetch per row with the caller in the loop; an attacker can enumerate many schedules and force N on-chain RPC reads per request (amplification)
**File:** `apps/api/app/api/vesting/list/route.ts:71-99` + `lib/vesting.ts:438-503`.
**Risk:** `readLimiter` bounds request rate, but each list call fans out one RPC per schedule with no cap on
schedule count; a user with many schedules (or `role=sender` over many tokens) amplifies one request into
many RPC calls (cost/DoS on the RPC provider).
**Fix:** Cap the number of live-state lookups per request (paginate), and/or cache state with a short TTL.

### P2-6 — `payRebate` token-fallback path (`grossUpTokenRebate`) can send creator tokens from the rebate vault for a `rebateMint != USDC` trade, but rebateMint is set from `feeConfig.rebateMint` at launch with no guard that the vault actually holds that mint
**File:** `apps/api/lib/fee-claim.ts:860-917`.
**Risk:** Default is USDC and the path is gated OFF, but if a token's `rebateMint` were ever non-USDC, the
transfer pulls from `MOMENTO_REBATE_USDC_VAULT` (a USDC vault) under the Token-2022 program id for a
creator-token mint — wrong source ATA, failed tx at best; at worst a misconfigured vault holding the token
could be drained via the gross-up amount. Defense-in-depth.
**Fix:** Hard-assert `rebateMint === USDC` for sends in 3A (the spec default), and reject non-USDC rebate
sends until a dedicated, mint-correct vault exists.

### P2-7 — No `amountInBase`/overflow upper bound; `BigInt(amountInBase)` accepts arbitrarily large values that flow into BN/quote and into the recorded rebate basis
**File:** `app/api/tokens/[mint]/buy/route.ts:61`, `sell/route.ts:56`; `tradeOrderSchema` (regex only).
**Risk:** `amountInBase` is validated as `/^[1-9]\d*$/` (positive integer, no max). A pathological huge
value is mostly self-limiting (the swap fails on insufficient balance), but it feeds `expectedOut`,
`minOut`, and the recorded `rebateBaseUnits`/raise sum (P0-1/P1-3) before any on-chain reality check.
**Fix:** Add a sane per-trade max to the schema; reject absurd amounts pre-quote.

---

## Gate & secret hygiene (verified OK, noted for completeness)

- **`REBATE_LEGAL_APPROVED` default OFF + double-gate.** `cron/fee-claim/route.ts:227` requires BOTH
  `REBATE_SEND_ENABLED==='1'` AND `REBATE_LEGAL_APPROVED==='1'`; both default off. Correct. (Does not
  mitigate P0-1/P0-2/P1-7 once enabled.)
- **STUB cannot sign mainnet.** `serverWallet.ts:39-41,101-133` throws `STUBBED` at any live sign;
  `submit.ts:329-341` returns a synthetic `STUB_…` signature and never broadcasts. Correct.
- **Server fail-closed without durable store.** `submit.ts:269-288` refuses a privy-server-signed
  broadcast without Upstash. Correct — but note rebate dedup still needs an explicit per-`tradeId` key
  (P0-2).
- **No secret/keypair logging observed.** Auth token never logged (auth.ts:42); ephemeral secret keys are
  never serialized to logs. Good. (Launch logs only `error.message`; review any future logging of
  `ctx`/keypairs.)
- **Cron constant-time bearer compare, fail-closed.** Both crons hash-then-`timingSafeEqual`
  (graduate:39-42, fee-claim:56-59) and 401 on missing secret. Correct (see P2-4 for the dev opt-in caveat).
- **IDOR on path params.** `[mint]` → `isValidMint`, `[id]` → `isValidUuid` before DB use across all routes.
  Trade submit enforces `Trade.userId===user.id`; vesting withdraw enforces recipient; admin claim scopes
  tokens to creator `[id]`. The residual gaps are P1-9 (mint≠intent token) and the authz-model softness in
  P0-3/P1-6.

---

## Summary of counts
- **P0: 3** (rebate-from-quote + unbound submit; rebate reserve/rollback double-pay; unconstrained vesting recipient/amount with server co-sign)
- **P1: 10**
- **P2: 7**

Top priority before ANY rebate go-live: fix P0-1 + P0-2 + P1-7 together (rebate must be derived from
confirmed on-chain fill, paid under a stable per-trade idempotency key, and priced from pool state).
Before graduation go-live: P1-2 + P1-3 + P1-4 (no finalize on synthetic/unlocked state). Before vesting
go-live: P0-3 + P1-6 + P2-3.
