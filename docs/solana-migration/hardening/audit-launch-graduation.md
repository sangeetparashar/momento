# Hardening Audit — launch.ts + graduation.ts

Adversarial security/correctness pass over `apps/api/lib/launch.ts` and
`apps/api/lib/graduation.ts` (+ their routes), BEYOND the per-phase reviews
(phase3 REVIEW-{security,correctness,sdk,contract}.md). Focus: launch atomicity &
rollback, Token-2022 transfer-fee attachment, split realization, graduation
state-machine/lease, no-double-migrate idempotency, the LP-lock finalize gate,
partial-failure recovery, @unique placeholder hygiene.

Cross-referenced ground truth: `scripts/spikes/spike-a-token2022-fee-rebate.ts`,
`scripts/spikes/spike-b-meteora-dbc.ts`, `apps/api/lib/solana/submit.ts`,
`apps/api/prisma/schema.prisma`.

---

## P0 — graduation resolves the WRONG DAMM v2 pool (multi-token corruption)

**File:** `apps/api/lib/graduation.ts:481` (`migrateAndPersist`), `:892`
(`recoverFromChain`), via `resolveDammV2Pool` `:978-989`.

`resolveDammV2Pool(cpAmm, payer.publicKey)` resolves the graduated pool by
`cpAmm.getPositionsByUser(serverWallet)` and returning **`positions[0]`** — the
FIRST position of the Momento treasury / server wallet, with NO filter by this
token's `baseMint` or DBC pool.

The server wallet is the PARTNER (`feeClaimer`) for **every** graduated token, so
once one token graduates the server wallet permanently holds a partner LP
position. The next token to graduate calls `getPositionsByUser(serverWallet)` and
gets back positions for ALL graduated tokens; `[0]` is an arbitrary (effectively
the oldest) pool. Consequences for the second-and-later graduation:

- `verifyLockState`/`isLegLocked` read positions in the WRONG pool → may report
  the wrong leg as (un)locked, gating finalize incorrectly.
- `persistLpPositions` writes the WRONG `poolAddress` onto BOTH LpPosition rows.
- `finalize` sets `CreatorToken.poolAddress = <wrong DAMM v2 pool>` and marks the
  token GRADUATED pointing at another token's pool.
- Downstream `lib/fee-claim.ts` reads `LpPosition.poolAddress` to claim LP fees →
  claims against the wrong pool / wrong token's position.

The spike masked this because each spike run used a FRESH per-run partner keypair
that owned exactly one position. In production the server wallet is shared and
long-lived.

**Fix:** Resolve the pool DETERMINISTICALLY for THIS token, not by scanning the
shared wallet's positions. spike-b note (L553-554) says
`deriveDammV2PoolAddress(...)` is exported by the DBC SDK — derive the DAMM v2
pool from the token's `baseMint` (+ quoteMint/config), or use the cp-amm
"get pool by mints" reader, then verify the resolved pool's positions belong to
this token's `baseMint`. Pass `token.mintAddress`/`dbcPoolAddress` into the
resolver and NEVER return a pool that does not match this token's base mint. As an
interim guard, after resolving, assert the pool's base mint == `token.mintAddress`
before persisting/finalizing; mismatch ⇒ keep FINALIZING (do not finalize on a
mismatched pool). devnetBlocked=false (the bug + guard are code-fixable offline;
only the exact derive/reader signature needs devnet confirmation).

---

## P1 — `TokenAuthorityOption.Immutable` may strip the withdrawWithheld authority ⇒ transfer fees permanently unharvestable (devnet blocker class)

**File:** `apps/api/lib/launch.ts:378` (`tokenAuthorityOption:
TokenAuthorityOption.Immutable`) vs `:309-339` / `:366-369`
(`buildTokenTransferFeeConfig` sets `transferFeeConfigAuthority` +
`withdrawWithheldAuthority` = treasury).

The curve config requests an Immutable Token-2022 mint AND simultaneously sets
transfer-fee authorities to the treasury. In spike-a the harvest path
(`harvestWithheldTokensToMint` + `withdrawWithheldTokensFromMint`,
spike-a:398-411) REQUIRES a real `withdrawWithheldAuthority` SIGNER to pull
withheld fees out of token accounts and the mint. If the DBC SDK's
`TokenAuthorityOption.Immutable` causes the base mint to be born with NO
withdraw-withheld authority (or set to None) — which is plausible since "immutable"
commonly means no authorities — then Momento can NEVER harvest the withheld
transfer fees. Every transfer fee would accrue and be **permanently stranded**,
silently breaking the entire fee/rebate revenue model even if the
TransferFeeConfig itself attaches (the existing P1-1 SDK blocker).

This is a DISTINCT risk from the field-name blocker already reviewed: the fee can
attach correctly and STILL be unharvestable if Immutable nukes the withhold
authority.

**Fix:** On devnet, after createPool, fetch the mint's TransferFeeConfig extension
and ASSERT `withdrawWithheldAuthority == treasury` and
`transferFeeConfigAuthority == treasury` (non-None). If `Immutable` strips them,
either (a) use the DBC authority option that keeps the mint authority immutable but
PRESERVES the transfer-fee/withhold authorities, or (b) escalate per D-launch §0.1
Path B. Add the assertion to the launch verify gate. devnetBlocked=true (the actual
behavior of `TokenAuthorityOption.Immutable` on the withhold authority cannot be
observed offline — node_modules absent), but the defensive verify assertion is
code-addable now.

---

## P2 — off-chain `thresholdBaseUnits` (targetUsd as USDC) ≠ on-chain `migration_quote_threshold`; keeper migrates with no on-chain reserve cross-check

**File:** `apps/api/lib/launch.ts:240`
(`thresholdBaseUnits: usdToUsdcBaseUnits(targetUsd)`) + `:426`
(`migrationMarketCap: knobs.targetUsd`); `apps/api/lib/graduation.ts:242-245`
(graduate decision uses ONLY the off-chain sum vs `thresholdBaseUnits`).

`targetUsd` is used BOTH as the DBC `migrationMarketCap` (a market-cap input the
SDK turns into the on-chain `migration_quote_threshold` via the curve) AND as the
off-chain `thresholdBaseUnits` (raw USDC raised). Market cap and raised-quote
threshold are different quantities, so the off-chain threshold the keeper checks
will generally NOT equal the on-chain `migration_quote_threshold`. The keeper
(`graduateToken`) calls `migrateToDammV2` purely on the off-chain
`raised >= thresholdBaseUnits` with no on-chain cross-check (D-graduation §3.1's
"reserve >= threshold" reconcile is still a TODO). If off-chain threshold <
on-chain threshold, the keeper attempts migrate before the curve permits → the
program rejects → generic catch → row stays FINALIZING and retries every tick
until enough raise accrues (wasted broadcasts / fee burn / stuck-looking token).
If off-chain > on-chain, migration is delayed past the point the curve already
allowed it.

**Fix:** Before migrate, read the DBC virtual-pool quote reserve vs the stored
`migration_quote_threshold` (spike-b `client.state.getPoolByBaseMint` /
`getPoolByConfig`) and only migrate when the on-chain reserve has reached the
on-chain threshold; treat `thresholdBaseUnits` as a display/early-detect heuristic
only. At minimum, classify the "not yet migratable" program error distinctly from a
real failure so it counts as `skipped`, not an alerting `failed`. (Owner:
graduation; the threshold-derivation reconciliation also touches launch.)

---

## P2 — `usdToUsdcBaseUnits` precision loss for large targetUsd

**File:** `apps/api/lib/launch.ts:168-171`. `Math.round(usd * 1e6)` loses integer
precision for `usd` above ~9.0e9 (Number.MAX_SAFE_INTEGER / 1e6). `targetUsd` is
validated only as `z.number().positive()` with no upper bound (validation.ts:115),
so an extreme target silently produces a wrong `thresholdBaseUnits`. **Fix:** bound
`targetUsd` in the schema (e.g. <= 1e9) and/or compute base units via BigInt from a
string. Low likelihood, cheap guard.

---

## Re-verified / already-fixed (NOT re-reporting)

- **@unique placeholder hygiene** (prev P1-6): current `persistLpPositions`,
  `recoverFromChain`, and the already-migrated branch correctly leave
  `positionNftMint` / `createSignature` / `finalizeSignature` NULL instead of
  `recovered-*` / `external-migrate:*` placeholders. Fixed. ✓
- **LP-lock finalize gate** (prev SEC P1-2): `verifyLockState` + `isLockSatisfied`
  gate `finalize` on a VERIFIED perma-lock for both legs; unverified/unlocked keeps
  the row FINALIZING. Correctly implemented (modulo the P0 wrong-pool bug, which
  makes the verification read the wrong pool). ✓ logic / ✗ input pool.
- **Lease / no-double-migrate**: three layers present (DB lease conditional update,
  `submit` durable Redis store keyed `graduate:migrate:<tokenId>`, @unique
  finalizeSignature). Lease-TTL-vs-long-migrate is covered by the durable
  broadcast store. ✓
- **maximumFee field name** (prev SDK P1-1): now emits `maximumFee` (spike-a name)
  on both shapes; field-name BLOCKER still correctly TODO-flagged + devnet-gated. ✓
- **Cross-process resume duplicate config/mint** (prev SEC P2-1): still OPEN as
  documented (ephemeral keypairs regenerated; in-code claim of submit-store
  protection overstates it because the blockhash + new pubkeys change the derived
  idempotency key). Persist encrypted ephemeral secrets keyed by tokenId before
  cross-process go-live. (Already tracked; not re-scoring.)
- **markFailed bricks the creator slot** (prev SEC P2-2): still open as documented.
