# Hardening — Completeness Critic (final pass)

Role: final completeness critic over the fix-phase working tree (uncommitted) against
the hardening audits (`audit-*.md`). Three jobs: (1) spot-check P0/P1 fixes were really
applied, (2) hunt for missed high-risk issues, (3) flag regressions / cross-module gaps.
Static review only (no tsc/network). Date 2026-06-24.

The fix phase edited 18 files + added `app/api/vesting/[id]/confirm/route.ts`. No new
Prisma migration was added. `lib/launch.ts` and `app/api/vesting/list/route.ts` were NOT
modified.

---

## 1. Confirmed-applied (spot-checked in code) — 11 fixes

| # | Finding | Where verified | Verdict |
|---|---------|----------------|---------|
| 1 | **submit P0-A** idempotency reservation never released → stable-key brick | `solana/submit.ts:345-460` try/finally + `idempotency.ts del()` on both stores | Applied (but see Regression R-1) |
| 2 | **webhook P0-1** `payer` out-of-scope ReferenceError in raise-counter block | `helius-webhook.ts:537` `payer` lifted to per-mint scope | Applied, correct |
| 3 | **webhook P1-1/P1-2** lost-update race on raisedBaseUnits/contributorCount | `helius-webhook.ts:660-695` atomic `$executeRaw` UPDATE (numeric cast) + correlated NOT EXISTS | Applied, correct |
| 4 | **webhook P1-3** external curve buys invisible to raise (`amountInMint`/venue) | `helius-webhook.ts:558-595` `writeQuoteLeg` writes quote leg + `venue=METEORA_DBC`; matches `graduation.ts:120-127` filter | Applied, cross-module consistent |
| 5 | **webhook P1-4** SELL mislabeled BUY (net-zero side) | `helius-webhook.ts:363-408` `deriveTradeSide` (opposite-signed deltas) + `isCurveBuy` gates the raise | Applied, correct |
| 6 | **graduation P0** wrong DAMM v2 pool (`positions[0]` of shared wallet) | `graduation.ts:979-1102` `resolveDammV2Pool(.. baseMint)` + `poolMatchesBaseMint` cross-check, fail-closed (null ⇒ keep FINALIZING) | Applied, excellent |
| 7 | **fee-claim P1** every FeeEvent `amountUsd=null` → $0 dashboards | `fee-claim.ts:233-265, 456-650` `amountToUsd` snapshot at write | Applied, correct |
| 8 | **fee-claim/trade P1** rebate sized off manipulable DAS price; no band/cap; price=0 silent deny | `fee-claim.ts:267-410, 1215-1300` pool/fill-implied median price + deviation band + per-trade/per-wallet USDC cap + `rebate-deferred-no-price` surfaced reason | Applied, strong |
| 9 | **trade P1** submit binds feePayer/pool/program but not ix-data amount/minOut | `trade.ts:805-905` Anchor ix-data decode: `amountIn==intent` (exact), `0<minOut<=expectedOut` | Applied, correct (degrades safely if layout differs) |
| 10 | **authz P1-A** money-path rate limits IP-keyed/XFF-spoofable | `tokens/[mint]/{buy,sell}{,/submit}/route.ts` auth-first + `applyRateLimit(.., user.id, {failClosed:true})` | Applied on the 4 TRADE routes only (see G-1) |
| 11 | **vesting P1** Token-2022 withdraw derives ATAs under classic program (withdraw-DoS) | `vesting.ts:399-413` `isT22 = args.isToken2022`; route resolves `CreatorToken.tokenProgram` and threads it (`withdraw/route.ts:78-83`) | Applied (interim route-level; durable schema column NOT added, see G-2) |

Also confirmed applied (secondary): mobile **P0-A/P0-B** 202-as-success (`services/api.ts:130-150`,
`useClientSignSubmit.ts:138-156`, `launch/review.tsx:79-84`); vesting **withdraw authz** by
`beneficiaryUserId` (`withdraw/route.ts:55-66`); vesting **deriveStatus** prefers on-chain truth
(`vesting.ts:601-625`); new **`/api/vesting/[id]/confirm`** route (re-derives funded/withdrawn from
chain, binds sig→streamId, never trusts client amounts) — server side is correct.

---

## 2. NEW P0/P1 found

### R-1 (NEW P1, regression introduced by the P0-A fix) — the submit `finally` records a CONFIRMED-FAILED (`SIMULATION_FAILED`) signature under the idempotency key, permanently bricking legitimate retries and marking a failed rebate "paid"
**Files:** `apps/api/lib/solana/submit.ts:438-456` (finally), `:197-201` (SIMULATION_FAILED throw),
`apps/api/lib/fee-claim.ts:1410-1416` (payRebate rolls back, expecting a clean retry).

The P0-A `finally` settles the reservation by: *if `signature` exists → `store.put(sig)`; else
`store.del()`.* But `signature` is set by `broadcastOnce` BEFORE `confirmSignature`, so when a tx
LANDS-AND-FAILS (`confirmSignature` throws `SIMULATION_FAILED`), the finally still does
`store.put('rebate:<id>', failedSig)`. The audit text for P0-A explicitly said to record the sig only
for "broadcast happened, status UNKNOWN" (TIMEOUT/BLOCKHASH_EXPIRED) and to RELEASE on a definitive
failure — but the implementation keys solely on `signature != null` and cannot tell "unconfirmed" from
"confirmed-failed."

Consequence on the rebate path (the exact stable-key caller P0-A was written for):
1. Tick 1: rebate tx lands, fails on-chain → finally `put(failedSig)`; payRebate catch rolls back
   `rebatePaid:false` to allow a retry.
2. Tick 2: row re-selected → payRebate rebuilds → `submit()` → `store.get('rebate:<id>')` returns
   `failedSig` → **short-circuits `deduped:true` with the FAILED signature** (`submit.ts:290-301`).
   The rebate is NEVER re-broadcast, and payRebate persists `rebateSignature = failedSig`, marking
   the rebate paid against a failed tx (`fee-claim.ts:1385-1399`, `runRebateSweep` counts it deduped).

So a single transient on-chain failure permanently denies an owed rebate AND records a bogus "paid"
signature — a fund-tracking integrity defect that the P0-A fix itself created. (Pre-fix, the bare
RESERVED_MARKER at least expired after the 10-min TTL and allowed a true retry; the new behavior is a
permanent durable record.)
**Fix:** In the catch/finally, distinguish the *known-failed* (`SIMULATION_FAILED`) case from
*status-unknown* (`TIMEOUT`/`BLOCKHASH_EXPIRED` with a sig). On `SIMULATION_FAILED`, RELEASE (`del`)
the reservation (the failed sig must not become the dedup record), so the stable-key caller can rebuild
and re-send with a fresh blockhash. Only `put()` the sig for genuinely-unknown outcomes. Pass the
classified error into the finally (or set a `landedFailed` flag in the catch before re-throwing).

### G-1 (still-open P1 — authz P1-A, only partially fixed) — launch + all vesting routes still IP-key their rate limit (XFF-bypassable / NAT-DoS on money paths)
**Files (still vulnerable):** `tokens/launch/route.ts:49`, `vesting/create/route.ts:86`,
`vesting/[id]/withdraw/route.ts:32`, `vesting/list/route.ts:23`, and the NEW
`vesting/[id]/confirm/route.ts:43` — all call `applyRateLimit(request, <limiter>)` with no `userId`
and no `failClosed`. The audit listed these routes under the SAME P1-A finding; only the 4 trade
routes were converted to auth-first per-user `failClosed` limiting. Launch (one-token-per-creator,
fund-moving) and the vesting write paths remain XFF-rotation-bypassable. (Owners: launch, vesting.)

---

## 3. Regressions / cross-module gaps still needing a follow-up

### G-2 (cross-module gap — schema-shared P0 only ~30% wired) — `getUsdcMint()` resolver added but the primary consumer `launch.ts` (and several trade/cron sites) still use the frozen MAINNET `MOMENTO_FEE.USDC_MINT`
**Resolver:** `packages/shared/src/constants.ts:42-52` (added, correct, import-safe).
**Still on the mainnet literal:**
- `lib/launch.ts:607,618,624,671` — **launch.ts was NOT modified at all.** On devnet this persists the
  mainnet USDC mint into `CreatorToken.quoteMint` / `TokenFeeConfig.rebateMint` /
  `TokenFundraise.quoteMint` and passes it to the DBC `createConfig`/`createPool` builders → the pool's
  quote vault references a mint that does not exist on devnet. **This IS the original P0, still live in
  the most important consumer.**
- `lib/trade.ts:274,283,1156,1186` — quote/rebate fallbacks still mainnet literal.
- `app/api/cron/fee-claim/route.ts:138-139` — `rebateMint` default + `useUsdc` comparison vs the mainnet
  literal: on devnet a devnet-USDC rebate mint fails `useUsdc`, mis-routing the rebate down the
  Token-2022 gross-up path.
- `lib/fee-claim.ts:134,922` — `classicProgramFor` fast-path + `claimTokenFees` quoteMint default still
  use the literal (the rebate path `:1218,1272` and `isUsdcMint` `:236` were correctly migrated).

The schema-shared module did its half (the resolver); the consumer modules (launch, trade, feeclaim)
did NOT switch their call sites — exactly the "module-fix that assumed a change elsewhere that wasn't
made" class. The P0 is NOT resolved until launch.ts + the remaining trade/cron/fee-claim sites call
`getUsdcMint()` at request time.

### G-3 (cross-module gap — vesting confirm contract HALF-wired) — server `/api/vesting/[id]/confirm` exists but the mobile client never calls it; client-path rows still strand PENDING and `releasedBaseUnits` is never bumped
**Server (done):** `app/api/vesting/[id]/confirm/route.ts` (correct, re-derives from chain).
**Client (missing):** `apps/mobile/src/hooks/useWithdrawVesting.ts:40-44` passes the signature straight
through (`submit: async (signature) => ({ signature, status: null })`) and only invalidates the query —
it never POSTs `/vesting/[id]/confirm`. `useCreateVesting.ts` likewise has no confirm call (only a
comment). `grep` for a confirm call site in `apps/mobile/src` finds none. So the audit's vesting-confirm
P1 (audit-api-authz P1-B / audit-vesting P2) is functionally still open: the persisted withdrawn total
and PENDING→ACTIVE/COMPLETED transition never happen on the client path; the allocation ceiling still
counts stuck-PENDING rows. (Owner of the call side: mobile.)

### G-4 (still-open, deferred items NOT addressed) 
- **`/api/vesting/list` per-row `decimals`** (deferred item named in the prompt): `vesting/list/route.ts:52-67`
  still selects only `token:{symbol:true}` and returns no `decimals`. The mobile withdraw sheet still
  falls back to 9 → mis-scales 6-8-decimal tokens. NOT fixed. (Owner: vesting + schema-shared type.)
- **`VestingSchedule.tokenProgram` durable column** (deferred item named in the prompt): no additive
  migration was added; only the interim route-level lookup landed (G item under #11). The durable
  schema-shared fix is still outstanding.
- **signing P1-B** (`confirmSignature` ignores `processed` commitment, `submit.ts:186`), **P1-C**
  (idempotency key derived AFTER live priority-fee → message-derived dedup defeated), **P1-D** (relay
  blob `lvbh`/`pf` unauthenticated) — none addressed this pass. P1-B is a false-TIMEOUT on any
  `processed`-target submit; P1-C means only explicit-key callers actually dedup (the rebate path is
  fine since it uses `rebate:<id>`, but harvest/partner/creator claim + graduation migrate rely on
  stable keys that DO exist, so impact is limited — still, the message-key fallback is structurally
  broken).
- **validation** `amountInBase` / submit `transaction` size caps (audit-schema P2, audit-authz P2-B/P2-C):
  not addressed (`validation.ts` unmodified).

### Verified NOT regressed / consistent
- webhook P1-3 write shape (`venue=METEORA_DBC`, `amountInMint=quoteMint`) exactly matches the
  `graduation.computeConfirmedRaise` filter (`graduation.ts:120-127`) — cross-module consistent.
- graduation `migrateAndPersist`/`recoverFromChain` callers fetch the token via `findUnique` (full
  record), so the new `token.mintAddress` arg is populated — no undefined-pass regression.
- trade ix-data binding strengthened the program check (`!expectedProgram || !has` vs old `&&`); both
  venues map to a program, so no valid swap is newly rejected.
- rebate per-wallet cap reads only confirmed (`rebatePaid && rebateSignature!=null`) USDC rows and the
  send now persists the ACTUAL sent amount — cap accounting is self-consistent (minor TOCTOU across two
  concurrent trades of one wallet remains, bounded by the per-trade cap; acceptable P2).

---

## Bottom line
- **Confirmed-applied: 11** P0/P1 fixes (plus several secondary), all genuinely in the code and, where
  cross-module, consistent.
- **NEW P1: 1** — R-1, a regression the P0-A fix introduced (records a confirmed-FAILED signature →
  bricks rebate retry + marks failed rebate "paid"). Plus **G-1**, the authz P1-A fix that stopped at
  the 4 trade routes (launch + vesting routes still IP-keyed).
- **Regressions / cross-module gaps needing follow-up: G-2** (schema-shared USDC-mint P0 resolver added
  but launch.ts + trade/cron/fee-claim consumers NOT switched — the P0 is still live on devnet);
  **G-3** (vesting confirm route built server-side but mobile never calls it — contract half-wired);
  **G-4** (deferred `/vesting/list` decimals, `VestingSchedule.tokenProgram` migration, signing
  P1-B/C/D, validation caps — not addressed).
