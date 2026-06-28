# Hardening Audit — Webhook Ingestion & Prisma Data Path

Scope (focus dimension): `apps/api/lib/helius-webhook.ts` (esp. the `raisedBaseUnits` /
`contributorCount` increment block), the webhook route, `apps/api/lib/fees.ts` read models,
and Prisma usage across the ingestion path — on-chain verify gating, IN_APP/EXTERNAL
classification, dedup keys, replay/freshness window, `$transaction` correctness + rethrow,
the String-column read-then-write increment race, and at-least-once idempotency.

Cross-referenced against the prior phase-2 / phase-3 REVIEW docs. The big phase-2 P0/P1s
(forged-payload trust, replay window, single-transaction persistence, cache invalidation,
bigint gross) are CONFIRMED FIXED in the committed code. The findings below are NEW or
still-open issues, concentrated in the Phase-3 graduation-counter block that was added
AFTER the phase-2 review (it is not covered by any prior REVIEW).

---

## P0-1 — `payer` is out of scope in the raised-counter block → ReferenceError on every first-seen BUY → permanent ingest 500/retry-storm

- **File:** `apps/api/lib/helius-webhook.ts:581` (reference) vs `:483` (declaration).
- **Problem:** `payer` is declared `const payer = vm.trader || ''` *inside* the
  `else if (!existingTrade)` block (line 483). The graduation-counter block (lines 555–598)
  is a sibling block of the `if / else if / else` chain, so `payer` is **not in scope** at
  line 581 (`traderWallet: payer`). This is a ReferenceError at runtime (block-scoped `const`)
  / a `Cannot find name 'payer'` at compile time.
  The counter block runs whenever `legInsert.count === 1` (i.e. the FIRST delivery of any
  watched BUY — IN_APP *or* EXTERNAL), so the very first confirmation of essentially every
  external buy on a fundraising token throws. The throw is inside the `$transaction`, is not
  caught locally, hits the `catch (err)` at line 604, drops the Redis fast-path marker, and
  **rethrows → route returns 500 → Helius retries the same batch forever**. No leg is ever
  persisted for that signature; ingestion for that token is wedged.
- **Fix:** Lift the trader wallet to a loop-scoped variable computed for all branches, e.g.
  `const payer = vm.trader || '';` declared once before the `if (existingTrade …)` chain (it is
  derived purely from `vm`, which is available in every branch). Then both line 489 and line 581
  reference the same in-scope value. Add a regression test that drives a first-seen EXTERNAL BUY
  with a fundraise row present.
- **Module:** fees-webhook. devnetBlocked: false.

## P1-1 — Lost-update race on `raisedBaseUnits` (read-then-write, default READ COMMITTED, no row lock)

- **File:** `apps/api/lib/helius-webhook.ts:567–595` (read `fundraise.raisedBaseUnits` →
  write `prevRaised + raisedQuote`).
- **Problem:** The comment claims this is safe because it is "inside THIS `$transaction`", but
  Prisma's default isolation is **READ COMMITTED**, and the `findFirst` does not take a row lock.
  Two webhook deliveries (different signatures) that land concurrently both read the same
  `prevRaised`, each add their own `raisedQuote`, and the second `update` clobbers the first —
  one contribution is silently dropped from the cached counter. The phase-2 review never saw this
  code; the prompt explicitly calls out the String-column read-then-write increment race.
- **Severity rationale:** P1 not P0 because the graduation DECISION path
  (`graduation.computeConfirmedRaise` / `getRaisedProgress`) recomputes from confirmed rows and
  never trusts this counter — so a lost update cannot strand or prematurely trigger a migration.
  It only corrupts the cached display value. Still must be fixed: it is a silent money-display
  inconsistency on a financial counter.
- **Fix:** Make the increment atomic at the DB level. Either (a) run this `$transaction` with
  `{ isolationLevel: 'Serializable' }` (and let the caller retry on serialization failure), or
  (b) replace the read-then-write with a single conditional `$executeRaw`
  `UPDATE token_fundraises SET raised_base_units = (raised_base_units::numeric + $delta)::text
  WHERE id = $id AND status IN (…)` which performs the add server-side under the row's write lock,
  eliminating the read. Prefer (b) — `increment` cannot be used because the column is a String.
- **Module:** fees-webhook. devnetBlocked: false.

## P1-2 — Lost-update / over-count race on `contributorCount` (first-BUY heuristic is not concurrency-safe)

- **File:** `apps/api/lib/helius-webhook.ts:578–593`.
- **Problem:** `contributorCount` is incremented when `priorFromWallet === 0` (no prior BUY trade
  for this wallet/token). Under concurrency this both (a) over-counts and (b) loses updates:
  two first-time BUYs from the SAME new wallet (two signatures) processed concurrently each see
  `priorFromWallet === 0` (neither sees the other's just-created trade across READ COMMITTED
  snapshots) and BOTH `increment: 1` → wallet counted twice; and the same lost-update window as
  P1-1 means a legitimate `increment: 1` can be clobbered by a concurrent write to the same row.
- **Fix:** Same remediation as P1-1 (serializable txn or a single server-side conditional UPDATE).
  Since the column is numeric, `{ increment: 1 }` is already atomic for the add itself — the
  remaining hazard is the non-atomic "first BUY?" decision. Gate it on a uniqueness signal instead
  of a `count`, e.g. attempt to insert a `(tokenId, walletAddress)`-unique contributor marker and
  only `increment` when that insert is new; or accept the cached value as approximate and rely on
  `getRaisedProgress` (which already computes the authoritative distinct-wallet count).
- **Module:** fees-webhook. devnetBlocked: false.

## P1-3 — EXTERNAL curve buys are written with `amountInMint = <token mint>`, so `computeConfirmedRaise` never counts them

- **File:** `apps/api/lib/helius-webhook.ts:490–497` (trade create) vs
  `apps/api/lib/graduation.ts:120–129` (raise query filter).
- **Problem:** The webhook creates the EXTERNAL trade with `amountInBaseUnits = grossBaseUnits`
  (the CREATOR-TOKEN amount) and `amountInMint = mint` (the creator token), and
  `venue = token.poolType ?? 'METEORA_DAMM_V2'`. But the authoritative raise computation in
  `computeConfirmedRaise` only sums `Trade` rows matching `venue = 'METEORA_DBC'` AND
  `side = 'BUY'` AND **`amountInMint = quoteMint`**. The webhook-created external trades carry the
  token mint in `amountInMint`, not the quote mint, and (for DAMM-default tokens) a non-DBC venue —
  so they are **invisible** to the raise total. External (non-Momento) curve buys therefore do not
  advance the confirmed raise toward the threshold, even though they really contributed quote.
- **Fix:** When the confirmed tx is a curve BUY against the quote mint, persist the QUOTE leg on
  the trade so it is countable: set `amountInMint = token.quoteMint`,
  `amountInBaseUnits = <confirmed quote base units>` (the `quoteVm.grossBaseUnits` already derived
  at line 557), and `venue = 'METEORA_DBC'` for DBC-phase tokens. (The transfer-fee leg amount is
  separate and already lives on the FeeEvent.) Reconcile with `D-graduation §3.1` so the keeper's
  recompute and the webhook agree on what a "curve BUY" row looks like.
- **Module:** fees-webhook (the write side is webhook-owned; the read-side filter belongs to
  graduation — coordinate). devnetBlocked: false.

## P1-4 — `vm.side` cannot distinguish BUY vs SELL from balance meta → SELLs counted as BUYs and inflate the raise counter

- **File:** `apps/api/lib/helius-webhook.ts:331–338` (side derivation) consumed at `:490`, `:555`.
- **Problem:** `side` is derived from the NET signed delta of the mint summed across all owners.
  For any plain transfer/swap the credited and debited legs cancel, so `net === 0`, and the code
  maps `net === 0 → 'BUY'` (the explicit ambiguous default). In practice a curve SELL is therefore
  also labelled `'BUY'`. Combined with the counter block (line 555 gated on `vm.side === 'BUY'`),
  a SELL increments `raisedBaseUnits` by the quote leg that actually flowed OUT to the seller —
  inflating the cached raise in the wrong direction. It also mislabels the persisted Trade `side`,
  corrupting buy/sell counts in `getTokenTradeSummary`.
- **Fix:** Determine side from a stable signal, not net-zero meta: compare the TRADER wallet's
  signed delta on the creator-token mint (trader token delta > 0 ⇒ BUY, < 0 ⇒ SELL), or identify
  the pool/curve vault account and use the pool's token delta sign. Only count toward the raise
  when the trader's quote delta is NEGATIVE (quote actually paid in). Until side is reliable, do
  not gate the raise counter on `vm.side` alone.
- **Module:** fees-webhook. devnetBlocked: false.

## P2-1 — `raisedQuote` uses summed positive quote deltas (`grossBaseUnits`), which can over-count multi-leg quote movement

- **File:** `apps/api/lib/helius-webhook.ts:556–557`.
- **Problem:** `quoteVm.grossBaseUnits` is the sum of ALL positive quote-mint owner deltas in the
  tx. A curve buy that also routes a quote-denominated fee (e.g. to a protocol/fee account)
  produces two positive quote credits, so the cached raise is bumped by more than the buyer's net
  contribution. Display-only, but it is a money counter.
- **Fix:** Use the buyer's net quote DEBIT magnitude (trader quote delta < 0) as the contribution,
  not the gross of all positive quote deltas. Pairs naturally with the P1-4 trader-centric side fix.
- **Module:** fees-webhook. devnetBlocked: false.

## P2-2 — `getTokenFeeSummary` / `getCreatorFeeSummary` sum `amountUsd` across mixed mints & nullable snapshots without freshness gating

- **File:** `apps/api/lib/fees.ts:362–380`, `:624–632`.
- **Problem:** `feesGeneratedUsd` and the USD `claimable` sums add `ev.amountUsd ?? 0` across all
  legs regardless of `amountMint` and regardless of how stale each per-leg USD snapshot is. Base
  units are correctly summed only within a single mint (the prior REVIEW-correctness P1-2b fix),
  but the USD path silently treats a null/zero snapshot as `0` and never flags legs missing a USD
  value, so a claimable USD figure can read low simply because some legs were written before a
  price was attached. This is a read-model display value, not a payout decision, hence P2.
- **Fix:** Either compute USD lazily from the current price at read time, or exclude legs with a
  null `amountUsd` from the USD aggregate and surface a "partial" flag, so a missing snapshot is
  not silently counted as `$0`.
- **Module:** fees-webhook (owns `fees.ts`). devnetBlocked: false.

---

## Confirmed-OK (no longer open)

- On-chain verification gating (`verifyOnChain`) is present; amounts derive from confirmed
  pre/post token-balance base-unit strings, payload floats are never trusted. (phase-2 P0 fixed.)
- Replay/freshness window via `WEBHOOK_MAX_AGE` on `ev.blockTime` is present (phase-2 P1 fixed).
- Constant-time secret compare hashes both sides to fixed width before `timingSafeEqual`
  (phase-2 P1 fixed).
- Per-event persistence runs in a single `prisma.$transaction`; errors are rethrown (not
  swallowed), the Redis marker is dropped on failure so retries are not deduped away, and the
  route returns 500 → Helius retries (phase-2 P1 fixed). NOTE: the P0-1 crash exploits exactly
  this (correct) rethrow path to produce an unrecoverable retry-storm.
- Dedup keys: on-chain legs set `signature` (encoded `${sig}:${kind}:${mint}`), `internalRef`
  left null — never both (CONTRACTS §a.6 honored).
- `legInsert.count === 1` gate correctly makes the counter increment idempotent against
  re-delivery (a deduped insert returns count 0). The remaining hazards are concurrency
  (P1-1/P1-2), not re-delivery.
- Body-size + batch-cardinality DoS guards present in the route and `ingestHeliusEvents`.
