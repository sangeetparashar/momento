# Phase 2 — Adversarial Correctness Review

> Static review only (no compile — no `node_modules`). Scope: schema↔migration consistency,
> fee/rebate math, classification/idempotency, submit pipeline, TS/import correctness, web3.js v1.
> Severity: **P0** = will break at runtime / data-loss / wrong money math; **P1** = likely bug or
> spec violation; **P2** = nit / latent risk / doc drift.

Reviewer verdict: **No P0 blockers found in the gated dimensions** (schema↔migration is consistent;
web3.js v1 calls are real; the submit/idempotency pipeline is sound). The findings below are P1/P2.
The single most important item is the rebate-classification gap (P1, #1) and the
attribution-never-invoked observation (P1, #2).

---

## P1

### P1-1 — Rebate reclassification can never fire as written (cron logic vs. classification model)
**File:** `apps/api/app/api/cron/fee-claim/route.ts:59-67` (+ `lib/helius-webhook.ts:290-320`)
**Problem:** The cron reclassifies trades matching `{ source: 'EXTERNAL', intentId: { not: null }, rebatePaid: false }`.
But the webhook EXTERNAL-insert path (`ingestHeliusEvents`) **never sets `intentId`** — it only sets
`signature`. And the IN_APP intent writer is Phase 4 (per the in-code note at line 56-57). So in Phase 2
the predicate `intentId != null AND source = EXTERNAL` is unsatisfiable, and the documented race
("webhook lands EXTERNAL first, cron later reclassifies") cannot be reconciled: the webhook row has no
`intentId`, and the spec's join key for the race is **`signature`**, not `intentId` (SPEC §3.3:
"reclassifies any EXTERNAL Trade whose `signature` later matches a Momento intent"). The cron is matching
on the wrong column for the race it claims to handle.
**Fix:** Reconcile the join key. Either (a) when the Phase-4 builder writes the intent row it must also
backfill `intentId` onto any pre-existing EXTERNAL row sharing the `signature` (and the cron stays as-is),
or (b) change the cron sweep to detect EXTERNAL trades whose `signature` matches a row in the intent
store/table keyed by signature. Document the chosen join key in CONTRACTS §e.5 so Phase 4 implements the
matching half. As-is this is a latent no-op, which is acceptable for Phase 2 *only if* the comment is made
explicit that the predicate is a placeholder and the real join is signature-based.

### P1-2 — `attribute2080` is dead in Phase 2 and the summary "fees generated" can mix mints / double-count
**File:** `apps/api/lib/fees.ts:131-164` (attribute2080, never imported) and `:305-353`, `:577-605`
**Problem:** (a) `attribute2080` is exported but called nowhere in committed Phase-2 code (webhook emits a
single `TRANSFER_FEE_WITHHELD` leg with `recipient=PROTOCOL`; the 20/80 split is a Phase-3 seam). Not a
bug per se, but the prompt asked to verify the split sums exactly — it does (protocol floor, partner floor,
creator gets the remainder; legs sum to `feeBaseUnits`), and the degenerate `sumBps<=0` branch is handled.
(b) Real concern: `getTokenFeeSummary` sums `feeBaseUnits` across `CREATOR_TRADING_FEE` +
`PARTNER_TRADING_FEE` + `LOCKED_LP_FEE` into one `feesGeneratedBase` **string** without regard to
`amountMint`. LP fees may be quote-denominated (USDC) while transfer fees are token-denominated; summing
base units across mints yields a meaningless integer. The public response exposes this as one
`feesGeneratedBase`.
**Fix:** Either constrain the aggregation to a single mint, or return per-mint sums, or drop
`feesGeneratedBase` from the response and keep only `feesGeneratedUsd` (which is additive). At minimum
document that `feesGeneratedBase` is only valid when all fee legs share `amountMint`.

### P1-3 — Webhook gross-amount reconstruction loses precision and is wrong for multi-leg transfers
**File:** `apps/api/lib/helius-webhook.ts:269-274`
**Problem:** `grossWhole` sums `Math.abs(tt.tokenAmount)` (a float UI amount from Helius) across **every**
transfer leg for the mint, then `BigInt(Math.round(grossWhole * 10 ** decimals))`. Two issues:
(1) Helius `tokenAmount` is a display float; `Math.round(x * 10**9)` for 9-decimals tokens overflows
`Number` precision (>2^53) for large amounts, silently corrupting `transferFeeBaseUnits` and the
`TRANSFER_FEE_WITHHELD` `feeBaseUnits`. (2) Summing all legs double-counts a swap that both debits a user
and credits a pool/vault of the same mint, inflating gross (and thus the withheld fee) by ~2×.
**Fix:** Prefer Helius `rawTokenAmount.tokenAmount` (string base units) when present and `BigInt()` it
directly; never multiply a float by `10**decimals` for on-chain money. For gross, pick a single
authoritative leg (e.g. the debit from the trader, or the transfer whose `tokenAmount` is largest) rather
than summing all legs. This directly affects recorded fee money.

### P1-4 — `rebateToUsdc` uses `Number(rebateOwedNet)` — precision loss on large base-unit values
**File:** `apps/api/lib/fees.ts:108`
**Problem:** `Number(rebateOwedNet) / 10 ** tokenDecimals` coerces a `bigint` to `number`. For tokens with
9 decimals and non-trivial trade sizes the net rebate can exceed `Number.MAX_SAFE_INTEGER` (2^53),
producing a wrong USDC payout figure. This is money math (drives the Phase-4 payout amount written to
`Trade.rebateBaseUnits`).
**Fix:** Keep the division in bigint domain as far as possible (e.g. scale price to an integer micro-price
and do `rebateOwedNet * microPrice / 10**tokenDecimals`), or explicitly cap/guard and document the safe
range. At minimum assert the value is `<= Number.MAX_SAFE_INTEGER` before coercion.

### P1-5 — `submitClientSigned` cannot enforce `lastValidBlockHeight` → false BLOCKHASH_EXPIRED / infinite-valid window
**File:** `apps/api/lib/solana/submit.ts:414-417` and `:290-302`
**Problem:** A deserialized `Transaction.from(...)` does NOT carry `lastValidBlockHeight` (it is not part of
the wire format — only `recentBlockhash` is). The code defaults it to `0` (line 416). In `submitSignedTail`
the expiry guard is `tx.lastValidBlockHeight != null && currentHeight > tx.lastValidBlockHeight`. With
`lastValidBlockHeight = 0`, `currentHeight > 0` is always true on mainnet/devnet, so the loop throws
`BLOCKHASH_EXPIRED` on the **first** post-broadcast height check, before the real blockhash has expired —
killing legitimate client-signed submissions after one poll window.
**Fix:** When `lastValidBlockHeight` is unknown, either (a) resolve it via
`getBlockHeight()` + a fixed validity (~150 slots) at submit time, or (b) skip the height-based expiry guard
and rely solely on `getSignatureStatuses` + a wall-clock deadline. Do not default to `0` and then compare.

### P1-6 — `getDefaultTipLamports` ignores the spec'd swqos default (5000) when env is set
**File:** `apps/api/lib/solana/sender.ts:34-40`
**Problem:** Spec/CONTRACTS §d.1: default Jito tip `200000`, but `5000` when `swqosOnly`. The function does
`want = JITO_TIP_LAMPORTS ?? 200000`, then `Math.max(min, want)`. If `JITO_TIP_LAMPORTS=200000` (the
documented default) and `swqosOnly=true`, you pay `max(5000, 200000)=200000` — i.e. you over-tip 40× on the
cheap route, contradicting "5000 if swqosOnly". The env value is meant as the standard-route default, not a
floor for the swqos route.
**Fix:** When `swqosOnly`, default `want` to `MIN_TIP_LAMPORTS_SWQOS` (not the standard env), and only let an
explicit per-call `jitoTipLamports` override raise it. Or read a separate swqos env. Minor money/UX, but it
violates the stated default.

---

## P2

### P2-1 — zod v4: `.passthrough()` is a deprecated alias
**File:** `apps/api/lib/validation.ts:77`
**Problem:** Dep is `zod@^4.3.6`. In zod v4 the canonical name is `.loose()`; `.passthrough()` is kept as a
deprecated alias (emits no runtime error but is on the removal path and may warn under
`strict`/typecheck configs). CONTRACTS explicitly notes "zod v4: `.passthrough()` deprecated alias".
**Fix:** Rename to `.loose()` to match the installed major. Low risk; alias still functions today.

### P2-2 — Migration header says "9 new enums" but creates 10
**File:** `apps/api/prisma/migrations/20260624010000_add_token_economy/migration.sql:8-10`
**Problem:** The comment lists 9 then parenthetically names 10 (TokenProgram, FundraiseStatus, FeeSource,
TradeSide, FeeEventType, FeeRecipient, LpProvider, LpOwner, VestingProvider, VestingStatus). The SQL below
correctly `CREATE TYPE`s all 10. Cosmetic only — the DDL is right.
**Fix:** Change "9 new enums" → "10 new enums".

### P2-3 — `TRANSFER_FEE_WITHHELD` recipient modeled as `PROTOCOL`
**File:** `apps/api/lib/helius-webhook.ts:339`
**Problem:** The withheld Token-2022 transfer fee is recorded with `recipient: 'PROTOCOL'`. Per the economic
model the withheld fee is harvested to the mint and ultimately accrues to Momento/creator, not to Meteora's
"protocol". `PROTOCOL` is documented (SPEC §3.5) as Meteora's fixed 20% LP cut. Reusing `PROTOCOL` for the
transfer-fee leg conflates two distinct revenue streams and means `getTokenFeeSummary` (which filters to
`recipient in [CREATOR, PLATFORM]`) correctly *excludes* these — but the semantic is muddy and could trip a
future claimable calc.
**Fix:** Consider a dedicated recipient (or leave `recipientWallet=null` + rely on `type`) and document that
`TRANSFER_FEE_WITHHELD` is pre-attribution. No data corruption today.

### P2-4 — Webhook IN_APP confirmation never re-stamps `signature`/leaves classification inert; `inferSide` always BUY
**File:** `apps/api/lib/helius-webhook.ts:280-289`, `:369-375`
**Problem:** (a) For an existing trade on the same token the code only patches `blockTime`; it does not (re)set
`source`, which is fine, but note the `source` variable computed at line 282 (`existingTrade.source === 'IN_APP'
? 'IN_APP' : 'EXTERNAL'`) is then used for the FeeEvent `source` — correct. (b) `inferSide` is hard-wired to
return `'BUY'` for every external trade (both branches return BUY). Buy/sell counts in the public trade
summary will therefore be 100% buys for externally-observed trades. Documented as "display-only / bias to
BUY", but it makes `sellCount` effectively dead for external flow.
**Fix:** Derive side from per-account balance deltas in `accountData` (Helius provides
`accountData[].tokenBalanceChanges`) when available; otherwise keep the bias but flag the limitation in the
endpoint docs.

### P2-5 — `attribute2080` exported but unused; `FeeRange` type exported but `range:string` everywhere
**File:** `apps/api/lib/fees.ts:131,170`
**Problem:** Dead/loose typing: `attribute2080` has no caller (Phase-3 seam — OK), and the public summary
functions take `range: string` rather than the `FeeRange` union, so an invalid range silently falls through
`rangeStart`'s `default → null` (treated as ALL). The route layer validates range via `tradeRangeSchema`
for `/trades` but `/tokens/[mint]/fees` uses `searchParams.get('range') || 'ALL'` with **no enum
validation** (`fees/route.ts:26`), so `?range=garbage` → ALL silently.
**Fix:** Tighten `range` params to `FeeRange` and validate the fees endpoint's `range` against the same enum
as `/trades`.

### P2-6 — `caip2()` genesis-hash strings are truncated/placeholder
**File:** `apps/api/lib/solana/serverWallet.ts:59-63`
**Problem:** The CAIP-2 references (`solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` /
`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`) are truncated genesis-hash prefixes, not the full CAIP-2
identifiers Privy expects. Flagged in-code as `TODO(verify-devnet)` and unreachable in Phase 2 (live signing
throws CONFIG_MISSING first), so harmless now.
**Fix:** Resolve the exact CAIP-2 strings before any live signing (already an open decision in SPEC §10.5).

### P2-7 — `submitSignedTail` retry math: `maxRetries` ternary is a no-op
**File:** `apps/api/lib/solana/submit.ts:190`
**Problem:** `route === 'rpc' ? DEFAULT_MAX_RETRIES_RPC : DEFAULT_MAX_RETRIES_RPC` — both branches are the
same constant, so the ternary is dead. Sender route gets the same 5 app-level resends as RPC despite the
comment elsewhere implying sender is `0-handled`. Functionally fine (sender is idempotent on signature) but
the ternary signals an unfinished intent.
**Fix:** Either remove the ternary or set a distinct sender retry budget.

---

## Verified-correct (spot-checked, no action)

- **Schema ↔ migration:** every model/column/type/default/index/unique/FK/onDelete in `schema.prisma`
  (§a.4–a.10, plus `CreatorToken` 8 new columns + `creator_tokens_status_idx`) is present in
  `migration.sql` with matching Postgres types, and vice-versa. `onDelete: Cascade` (token-scoped) and
  `SetNull` (`Trade.userId`, `FundraiseContribution.userId`, `VestingSchedule.beneficiaryUserId`,
  `FeeEvent.tradeId`) all map to the correct `ON DELETE` clauses. Unique signatures
  (`trades.signature/intentId`, `fee_events.signature/internalRef`, `fundraise_contributions.signature/
  refundSignature`, `token_fundraises.finalizeSignature`, `lp_positions.positionNftMint/createSignature/
  (tokenId,owner)`, `vesting_schedules.streamId/createSignature`) all present.
- **Statement ordering:** CREATE TYPE → ALTER TYPE ADD VALUE → ALTER TABLE → CREATE TABLE → indexes → FKs.
  `ALTER TYPE PoolType ADD VALUE` values are not used at DDL time, so they are safe even if the file is
  wrapped in one transaction by `migrate deploy` (PG ≥12). The `AERODROME` DB-vs-schema drift is the
  intended, documented carryover from `remove_base_support` (Prisma tolerates extra DB enum values on read).
- **web3.js v1 API:** `ComputeBudgetProgram.setComputeUnitLimit({units})` / `setComputeUnitPrice
  ({microLamports})`, `SystemProgram.transfer({fromPubkey,toPubkey,lamports})`, `Connection
  .getLatestBlockhash/getSignatureStatuses/getBlockHeight/sendRawTransaction`, `Transaction.compileMessage/
  serialize/partialSign/from`, and `tx.lastValidBlockHeight` (a real optional field on the v1 legacy
  `Transaction`) are all valid v1 signatures. No v2/kit usage.
- **Idempotency:** in-memory `reserve`/`get`/`put` is race-safe single-instance; `deriveIdempotencyKey`
  hashes label∥feePayer∥unsigned-message with NUL separators (stable across retries). The "never both
  signature & internalRef" rule holds: webhook on-chain legs set `signature` only; cron REBATE sets
  `internalRef` only.
- **`computeRebate` / `calcFee` / `grossUpTokenRebate`:** floor on fee, `max(0, charged-target)` on rebate,
  exact integer ceil `(net*10000 + (denom-1))/denom` for the token gross-up, with the `feeBps>=100%`
  degenerate guard. Matches the spike-a formulas in SPEC §3.4.
- **Auth/limiter wiring:** `applyRateLimit(request, readLimiter)` matches the `Ratelimit | (()=>Ratelimit)`
  overload; optional `getAuthUser` widening for `claimable` matches SPEC §6; cron bearer compare is
  constant-time with fail-open-when-unset.
- **App Router signatures:** Next 15 async `params: Promise<{mint}>` / `Promise<{id}>` are correctly awaited.
- **Imports:** `@momento/shared` (re-exports `MOMENTO_FEE`), `@/lib/*`, and the `lib/solana` barrel all
  resolve to real exports; no missing awaits on the persistence calls.
