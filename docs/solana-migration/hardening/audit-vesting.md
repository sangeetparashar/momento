# Hardening audit — vesting (`lib/vesting.ts` + vesting routes)

Adversarial pass over `apps/api/lib/vesting.ts`, `apps/api/app/api/vesting/{create,list,[id]/withdraw}/route.ts`,
cross-referenced against `scripts/spikes/spike-c-vesting-lock.ts`, the signer combiner
(`lib/solana/signer.ts`, `submit.ts`), the Prisma schema, and the prior Phase-3A reviews
(`design/phase3/REVIEW-{security,correctness}.md`).

Several previously-flagged items are now FIXED in committed code and are NOT re-reported:
- P0-3 (unconstrained recipient/amount + server co-sign): the create route now validates `recipient`
  as base58, asserts `amount>0` and `cliff<=amount`, and enforces a per-token allocation ceiling
  (`vestingAllocationCeiling`) against `CreatorToken.totalSupply`. Adequate.
- recipient base58 validation at create (part of old P1-6): now present (create route :106).

Findings below are STILL-OPEN or NEW.

---

## P1 — Token-2022 withdraw/claim derives ATAs under the CLASSIC token program (every launched-token vest withdraw fails)

**File:** `apps/api/lib/vesting.ts:400-403` (withdraw), `:535-537` (state for JUP_LOCK).
`isT22 = false` is hard-coded. `CreatorToken.tokenProgram` defaults to `TOKEN_2022` (schema :292),
so the launched-token default IS Token-2022. For those mints the recipient/escrow ATAs are derived under
the classic SPL program → wrong ATA + wrong program id in the claim ix → the JUP_LOCK claim build/exec
fails. (Streamflow's `prepareWithdrawInstructions` derives ATAs internally from the stream's mint owner,
so it is less affected, but `getVestingState`'s JUP_LOCK escrow-ATA derivation and the JUP_LOCK claim path
are both broken for T22.) This is functionally a withdraw-DoS for the default token type, not a fund-loss
(the tx reverts), so P1 not P0.

**Fix:** Persist the token program at create on `VestingSchedule` (additive `tokenProgram` column — owned by
schema-shared) OR resolve it on demand. `buildVestingWithdraw`/`getVestingState` receive a `schedule` that
carries `tokenId`; the withdraw route can `prisma.creatorToken.findUnique({where:{id: schedule.tokenId}})`
and pass `isToken2022` into `buildVestingWithdraw`. Until the schema column lands, the route-level lookup is
the offline-fixable path. Thread the resolved program through `getAssociatedTokenAddress(... tokenProgram)`
on lines 402-403 and 535-537.

## P1 — Withdraw authorization rests solely on an unvalidated wallet-string equality; `beneficiaryUserId` is ignored

**File:** `apps/api/app/api/vesting/[id]/withdraw/route.ts:53-56`.
Authorization is `schedule.beneficiaryWallet === wallet` only. `beneficiaryUserId` (resolved + stored at
create) is never consulted. The on-chain tx is recipient-signed so funds can only ever go to the signer's
ATA (no theft), BUT the *authorization to build/return a withdraw tx* is purely string equality on a field
copied verbatim from creator-supplied `input.recipient`. If a creator sets `recipient` to a wallet string
they do not control the user-binding of, or an embedded wallet rotates, the DB authz is brittle. The build
also returns a fully-formed tx for `claimableBase` to an actor matching only the string.

**Fix:** Authorize by `beneficiaryUserId === user.id` when it is set, with the wallet match as a secondary
gate; only fall back to wallet-string equality when `beneficiaryUserId` is null. This binds withdraw to the
resolved user identity, not a mutable/collision-prone string.

## P2 — Persisted releasedBaseUnits / PENDING→ACTIVE / ACTIVE→COMPLETED status never advance on the client-relay path (no log consumer)

**File:** `apps/api/app/api/vesting/[id]/withdraw/route.ts:6-9` + `create/route.ts:9-12` reference
`/api/wallet/transactions/log` with `type 'vest_create'`/`'vest_withdraw'` as the place that bumps
`releasedBaseUnits` and flips status. That handler (`app/api/wallet/transactions/log/route.ts:37`) only
accepts `['swap','send','receive','fund']` and never touches `VestingSchedule`. So for the client-relay
create path the row stays `PENDING` forever in the DB, and `releasedBaseUnits` is never incremented after a
withdraw. This is masked at read time because `getVestingState` derives status/withdrawn from on-chain
(`deriveStatus` returns `PENDING` whenever the DB row is still PENDING — line 585 — so a successfully
client-submitted-but-never-confirmed-back create shows PENDING even though it is live on-chain). The
allocation-ceiling sum also counts these stuck-PENDING rows, so a creator's legitimate budget can be
permanently consumed by completed-but-unlogged schedules.

**Fix (cross-module, owner fees-webhook/wallet but surfaced here):** add `vest_create`/`vest_withdraw`
handling to the transactions/log route (flip PENDING→ACTIVE on create-confirm by `createSignature`/streamId,
bump `releasedBaseUnits` + flip COMPLETED on withdraw-confirm). Within vesting-owned code, harden
`deriveStatus` to prefer on-chain truth: if the schedule is PENDING but the on-chain stream/escrow exists
and is funded, report ACTIVE rather than echoing the stale DB PENDING.

## P2 — `/api/vesting/list` omits per-row `decimals`; mobile withdraw sheet falls back to 9

**File:** `apps/api/app/api/vesting/list/route.ts:52-69, 86-97`. The row select does not include
`token: { select: { decimals: true } }` and the response has no `decimals`. `CreatorToken.decimals` is
configurable (schema :278, default 9 but not guaranteed). Any token with non-9 decimals renders/enters
amounts off by 10^(9-decimals) in the withdraw sheet, which converts to base units for the withdraw call.

**Fix:** Add `decimals: true` to the `token` select and return `decimals: s.token?.decimals ?? 9` per row.

## P2 — JUP_LOCK locks "drip dust" permanently; persisted `netDepositBase` overstates the on-chain escrow

**File:** `apps/api/lib/vesting.ts:275, 283` (create) + `jupLockUnlocked` :559-575.
`createVestingEscrowV2` transfers exactly `cliffUnlockAmount + amountPerPeriod*numberOfPeriod` into escrow
(spike-c :501-507), NOT a separate gross deposit. With `drip = (net - cliff) / periods` floored, the actual
escrowed/claimable total is `cliff + drip*periods <= net`, leaving `(net - cliff) % periods` base units that
are never deposited. Yet the create route persists `totalBaseUnits = plan.netDepositBase` (= `net`), so the
DB total overstates reality by the dust, and `jupLockUnlocked` (which mirrors `cliff + perPeriod*periods`)
never trues-up a final period. (Streamflow deposits the full `amount` and releases the remainder at end, so
it is not affected the same way — but its `amountPerPeriod` floor still relies on the SDK's end true-up.)

**Fix:** For JUP_LOCK, compute and persist `netDepositBase = cliff + drip*periods` (the amount that actually
locks) instead of the un-floored `net`, so DB totals match the escrow. Optionally fold the remainder into
the cliff amount (`cliffAmount += (net - cliff) - drip*periods`) so no tokens are stranded.

## P2 — `getVestingState` Streamflow `unlocked` fallback yields claimable 0 even when due

**File:** `apps/api/lib/vesting.ts:517-524`. If `stream.unlocked` is neither a function nor a value,
`unlocked` defaults to `withdrawn` → `claimable = 0`, so a recipient with genuinely-claimable funds sees
"Nothing to withdraw" (withdraw route 400). The JUP_LOCK path already has a local cliff+linear computation
(`jupLockUnlocked`); the Streamflow path has none.

**Fix:** When the SDK `unlocked` field is absent, compute a local cliff+linear `unlocked(now)` from the
persisted schedule (start/cliff/duration + totals) as a fallback, mirroring `jupLockUnlocked`.

## P2 (devnet-blocked, defensive-only) — raw `prepare{Withdraw,Cancel}Instructions` are unverified SDK surface

**File:** `apps/api/lib/vesting.ts:378-381` (withdraw), `:473-477` (cancel), and `claimV2` :417-428.
spike-c verified only the high-level `withdraw()/cancel()` (build+send) and `createVestingEscrowV2`/account
fetch — NOT the `prepare*` family nor the Jup-Lock `claimV2` ix name/account list. These are wrapped in
`(client as any)` with normalize-both-shapes guards and clear TODO(verify-devnet) markers, which is the
right defensive posture, but the method names + extParams shape + claim account list cannot be confirmed
offline. Marking devnetBlocked. **Defensive fix already mostly present;** additionally, if `prepared` is
nullish or `ixs` empty after normalize, throw a typed `CONFIG_MISSING`/`SIGNER_REJECTED` instead of letting
`new Transaction().add(...undefined)` throw an unmapped error.

## P2 (devnet-blocked) — Privy ephemeral co-sign of the server primary path

**File:** `apps/api/app/api/vesting/create/route.ts:282-310` + `lib/solana/signer.ts` applySigners.
The PRIMARY server path needs Privy to preserve a pre-attached ephemeral partial signature over the SAME
compiled message. `applySigners` captures + re-attaches the ephemeral sig and raises
`PARTIAL_SIGN_UNSUPPORTED` to trigger the client fallback if it is stripped, which is correct defensive
design, but the actual Privy behavior is unverifiable offline. devnetBlocked.
