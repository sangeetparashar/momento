# Hardening — Completeness Critic, ROUND 2 (final pass)

Role: final critic over the round-2 fix tree (uncommitted), verifying each fix the
round-1 critic (`CRITIC.md` §2-§3) flagged actually landed in the ACTUAL code. Static
review only (no tsc/network). Date 2026-06-24.

Round-2 set under verification: R-1 (submit settlement policy), P1-B (confirm honors
target commitment), G-2 (USDC resolver wired into consumers), G-1 (launch + vesting
auth-first per-user failClosed rate limit), G-4 (/vesting/list per-row decimals),
G-3 (mobile useWithdrawVesting/useCreateVesting POST /vesting/[id]/confirm).

---

## Confirmed-applied — 6 / 6

| # | Round-1 finding | Where verified (file:line) | Verdict |
|---|-----------------|----------------------------|---------|
| R-1 | submit `finally` recorded a CONFIRMED-FAILED sig under the idempotency key → bricked stable-key (rebate) retries + marked failed rebate "paid" | `solana/submit.ts:369` `landedFailed` flag; `:464-466` catch sets it ONLY when `classified.code === 'SIMULATION_FAILED'`; `:473-488` finally `put(sig)` only when `signature && !landedFailed` (TIMEOUT/BLOCKHASH_EXPIRED), else `del()` (known-failed or never-broadcast) | **FIXED, correct** |
| P1-B | `confirmSignature` ignored a `processed` target → false-TIMEOUT on any processed-target submit | `solana/submit.ts:190-195` `target` set = `['processed','confirmed','finalized']` for processed, `['confirmed','finalized']` for confirmed, `['finalized']` for finalized; `:211` accepts when `target.includes(st.confirmationStatus)` | **FIXED, correct** |
| G-2 | resolver added but launch/trade/cron/fee-claim consumers still used mainnet `MOMENTO_FEE.USDC_MINT` literal for quote/rebate defaults | `launch.ts:580` `getUsdcMint()` → threaded to `quoteMint`(`:614`), `rebateMint`(`:625`), `fundraise.quoteMint`(`:631`), `LaunchContext.quoteMint`(`:678`); `trade.ts:273,1158`; `cron/fee-claim/route.ts:141`; `fee-claim.ts:923,1219,1273` | **FIXED, correct** |
| G-1 | launch + 4 vesting routes still IP/XFF-keyed their rate limit | auth-first + `applyRateLimit(request, <limiter>, user.id, {failClosed:true})` in `tokens/launch/route.ts:55-60` (requireCreator first), `vesting/create/route.ts:91`, `vesting/[id]/withdraw/route.ts:36-37`, `vesting/list/route.ts:27-28`, `vesting/[id]/confirm/route.ts:47-48` | **FIXED, correct** |
| G-4 | `/vesting/list` returned no per-row decimals → mobile fell back to 9 | `vesting/list/route.ts:72` select `token:{symbol:true,decimals:true}`; `:98` returns `decimals: s.token?.decimals ?? null` | **FIXED, correct** |
| G-3 | server confirm route existed but mobile never called it | `useWithdrawVesting.ts:50-61` `submit` POSTs via `confirmVesting(vestingId, signature)`; `useCreateVesting.ts:49-56` calls `confirmVesting` on client path; `tokenApi.ts:53-54` `confirmVesting` → `POST /vesting/${id}/confirm {signature}`; type `VestingConfirmResponse` (`tokenApi.types.ts:174-176`) matches `c.status` read | **FIXED, correct** |

### Verification detail on R-1 (the round-1 NEW regression)

The three-outcome settlement policy is now implemented exactly as the round-1 critic
prescribed:
- **KNOWN-FAILED** (`confirmSignature` throws `SolanaTxError('SIMULATION_FAILED')` on an
  on-chain revert, `submit.ts:206-210`): pass-through `classify()` (`errors.ts:74`) keeps
  the code, catch sets `landedFailed=true` (`:464-466`), finally takes the `del()` branch
  (`:487`). The failed sig is carried on the thrown error for observability but NEVER
  persisted as the dedup record → the rebate stable-key caller (`rebate:<id>`) can rebuild
  + re-send with a fresh blockhash. Regression closed.
- **STATUS-UNKNOWN** (`TIMEOUT` `:447-449`, or `BLOCKHASH_EXPIRED` `:433-437`, both carrying
  the broadcast `signature`): `landedFailed` stays false → finally `put(sig)` (`:478`) so a
  retry dedups to it and reconciliation can poll. Correctly NOT released (avoids
  double-broadcast of a tx that may still land).
- **NEVER-BROADCAST** (`RPC_ERROR`, `signature` undefined): finally `del()` (`:487`) →
  identical retry can reserve + re-broadcast.

`classify()` pass-through (`errors.ts:74`) guarantees a `SolanaTxError` raised by
`confirmSignature` keeps its `SIMULATION_FAILED` code, so `landedFailed` is set reliably.

---

## Still-open / again-missed

None among the six items in scope — all six landed and are correct.

The deferred items the round-1 critic listed under G-4 but that were **out of round-2
scope** remain not-addressed (expected, not counted against this round):
- `VestingSchedule.tokenProgram` durable column / additive migration — still only the
  interim route-level `CreatorToken.tokenProgram` lookup (e.g. `confirm/route.ts:67`).
- signing P1-C (auto idempotency key derived from pre-budget message) — note: this was
  ALSO addressed (`submit.ts:516,562` derive from `preBudgetMessageB64`), though it was
  not a named round-2 target.
- signing P1-D (relay blob unauthenticated), validation `amountInBase`/transaction size
  caps — not addressed (out of scope).

These are tracked, not regressions.

## New regressions introduced this round

None found.

Cross-module consistency spot-checks (all hold):
- G-2 residual `MOMENTO_FEE.USDC_MINT` references are all intentional and correct, NOT
  consumer-site mint defaults: `fee-claim.ts:237` (`isUsdcMint` accepts mainnet literal OR
  `getUsdcMint()` to recognize legacy-persisted mainnet rows), `cron/fee-claim/route.ts:143`
  (`useUsdc` same back-compat OR-clause), `launch.ts:125` (comment), `trade.ts:274,1159`
  (`USDC_DECIMALS`, not the mint). Constant doc-comment at `constants.ts:52-55` correctly
  marks the literal DEPRECATED for cluster-scoped use.
- G-3 type contract is sound: mobile `VestingConfirmResponse.status` (`tokenApi.types.ts:176`)
  matches the `c.status` consumed in `useWithdrawVesting.ts:53`. Both hooks invalidate
  `['vesting']` after confirm and degrade gracefully if confirm is rejected (tx already
  landed → row reconciles on next list read).
- G-1 launch route is genuinely auth-FIRST: `requireCreator(request)` (`launch/route.ts:55`)
  runs before `applyRateLimit` (`:58`), so the bucket is keyed to the verified userId.
- P1-B widening is safe: each commitment accepts itself + strictly stronger statuses
  (`processed ⊂ confirmed ⊂ finalized`); no caller that wanted `finalized` now accepts a
  weaker status.

---

## Bottom line
- **Confirmed-applied this round: 6 / 6** (R-1, P1-B, G-2, G-1, G-4, G-3) — all genuinely
  in the code and, where cross-module, consistent.
- **Still-open / again-missed (in scope): 0.**
- **New regressions: 0.**
- Round-1's NEW P1 regression (R-1) is closed; the partial fixes (G-1 partial, G-2 ~30%)
  are now complete. Out-of-scope deferred items (VestingSchedule.tokenProgram migration,
  signing P1-D, validation caps) remain for a later pass.
