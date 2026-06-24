# Hardening audit — financial math (fees.ts / fee-claim.ts / trade.ts)

> Adversarial money-math pass BEYOND the per-phase reviews. Focus: BigInt vs number
> coercion, floor/ceil/cap, transfer-fee + rebate vs spike-a, attribute2080 sums,
> decimals, negative/overflow, division rounding, rebate double-pay / reserve airtightness,
> price=0 / manipulable-oracle rebate sizing, mixed-mint summation.
> Cross-referenced: spike-a (rebate ground truth), phase3 REVIEW-correctness / REVIEW-security
> (to avoid re-reporting already-fixed items). Offline (no compile/network).

## Verified CORRECT (no finding)
- `calcFee` / `computeRebate` / `grossUpTokenRebate` integer math matches spike-a exactly
  (floor on fee, ceil on gross-up, max-fee cap, >=100% fee guard). bigint end-to-end.
- `rebateToUsdc` keeps the multiply + floor in the bigint domain; the only float op is the
  price→micro-price scale (price < ~9000 stays < 2^53 at 1e12). No precision loss for normal sizes.
- `attribute2080` remainder-to-creator makes the three legs sum EXACTLY to the input (no dust).
- `getTokenFeeSummary` correctly sums `*Base` ONLY within `amountMint === token.mint` (mixed-mint
  base-unit summation is avoided); USD stays mint-agnostic.
- Rebate reserve-before-send CAS, stranded-reservation recovery, stable `rebate:<tradeId>` submit
  key, TIMEOUT/DUPLICATE leave-reserved vs definitive-failure rollback — all sound under retries.

## Findings (new or still-open)

### P1 — fee-claim: every claimed/accrual FeeEvent is written with `amountUsd = null` → all USD fee figures are structurally 0
`recordTradingFeeClaim` / `recordWithheldWithdraw` (fee-claim.ts:299-414) never set `amountUsd`.
The read model `getTokenFeeSummary` (fees.ts:366/371/374) and `getCreatorFeeSummary` (fees.ts:625)
SUM `ev.amountUsd ?? 0`. So once the on-chain claim engine is the source of fee events, every
`feesGeneratedUsd`, `claimable.creatorUsd`, `claimable.momentoUsd`, and the per-creator lifetime/
claimable USD are perpetually 0 (only the base-unit figures populate). Creator + admin dashboards
show $0 fees generated/claimable for real claimed fees.
Fix: set `amountUsd` when recording (amountBaseUnits / 10^mintDecimals × USD-price-of-amountMint;
USDC price ≈ 1), or have fees.ts derive USD from base × price at read time.

### P1 — fee-claim/trade: rebate USDC sizing in `payRebate` still uses the manipulable DAS price snapshot, with no sanity band and no per-trade/per-wallet cap
`payRebate` (fee-claim.ts:981) sizes the USDC send via `rebateToUsdc(rebateOwedNet, trade.priceUsd, decimals)`.
`trade.priceUsd` is the DAS `getAsset` price-per-token snapshot taken at quote time (trade.ts:557).
This is the still-open half of REVIEW-security P0-1/P1-7: P0-1's fix re-derives the token-denominated
`rebateOwedNet` from the CONFIRMED fill (good), but the token→USDC conversion is still driven by an
oracle an attacker can move on a thin pool, and there is NO sanity band, NO staleness check, and NO
per-trade / per-wallet rebate cap (the P0-1 fix explicitly asked for a cap). When rebates are turned
on (REBATE_SEND_ENABLED && REBATE_LEGAL_APPROVED) a manipulated-high token price inflates the USDC
rebate owed for a given net token rebate → rebate-vault drain.
Fix: size the rebate from pool/curve-implied price (the venue quote already touches the pool), clamp
to a sane deviation band vs a reference, reject price<=0 for sizing (defer/true-up rather than 0 or
inflated), and add a per-trade + per-wallet USDC rebate cap constant.

### P1 — fee-claim: price=0 silently and permanently denies an owed rebate (no reservation, infinite benign no-op)
`payRebate` (fee-claim.ts:981-985): with `trade.priceUsd` null/0 (common on devnet DAS, and
`buildTrade` persists `priceUsd: quote.priceUsd > 0 ? … : null`), `rebateToUsdc` returns 0 →
`rebateBaseUnits <= 0` → returns `{ reason:'no-rebate-owed' }` BEFORE the reservation. The row stays
`rebatePaid:false`, so every `runRebateSweep` tick re-derives 0 and treats it as a benign no-op
(runRebateSweep:1172-1181) forever — a genuinely-owed rebate (owed in token terms) is never paid and
never surfaced as failed. This is the deferred "never size a rebate off price=0" item.
Fix: when `rebateOwedNet > 0` but the USD price is unavailable, do NOT collapse to 0 silently —
record the rebate as deferred/true-up (or skip with a distinct, surfaced reason) and use a
pool-implied price so a missing DAS price does not zero out a real obligation.

### P2 — fee-claim/webhook: REBATE FeeEvent stores a per-token PRICE in `amountUsd`, not the rebate's USD value
cron/fee-claim/route.ts:181 sets `amountUsd: trade.priceUsd ?? null` on the REBATE row. `amountUsd`
is summed as a USD VALUE elsewhere; `trade.priceUsd` is a price-per-token (e.g. 0.0042). REBATE rows
are excluded from the current summary filters so it is not yet aggregated, but it is stored-data
corruption that will mis-report the moment any view includes REBATE.
Fix: store the rebate's USD value = rebateBaseUnits / 10^USDC_DECIMALS (USDC ≈ $1), or null, not the
token price.

### P2 — fee-claim: rebate re-derivation uses NET-received tokens as the GROSS fee basis (slight under-pay)
`payRebate` (fee-claim.ts:938-941) sets `taxedBaseGross = amountOutBaseUnits` (BUY) / `amountInBaseUnits`
(SELL) from `deriveConfirmedFill`, which reads the trader's NET token balance delta (post transfer-fee
on the recipient leg for a BUY). `computeRebate` then treats that net amount as `grossBaseUnits` for
`floor(gross*bps/10000)`. The on-chain fee was computed on the pre-fee gross, so the rebate basis is
understated by the fee fraction on the BUY leg. Direction is conservative (under-pays, never over),
but the effective rate then lands slightly above the ~1% target.
Fix: gross-up the BUY received amount to the pre-fee basis (gross = net*10000/(10000-feeBps)) before
computeRebate, or read the gross transfer amount from the ix/meta rather than the recipient net delta.

### P2 — schema-shared: `amountInBase` has no upper bound (still-open REVIEW-security P2-7)
validation.ts:129 `amountInBase: z.string().regex(/^[1-9]\d*$/)` — unlike `totalSupply` (`refine
length<=15`) there is no magnitude cap. Arbitrarily large values flow into BigInt/BN/quote and the
recorded rebate basis before any on-chain reality check. The bigint math itself is safe, but the
recorded `expectedOut`/`minOut`/rebate basis can be absurd, and any `Number()` display path on those
overflows 2^53.
Fix: add a length/magnitude cap to `amountInBase` (mirror the `totalSupply` refine).

### P2 — fees: `attribute2080` is dead code; the documented 20/80 split is never enforced in the recording path
fees.ts:154 `attribute2080` is exported but never called in any execution path (fee-claim records the
claimed leg amount directly, assuming Meteora withheld its 20% on-chain — fee-claim.ts:288-293). This
is intentional per the comment, but it means: (a) the protocol-20% withholding is entirely an on-chain
assumption with no off-chain reconciliation, and (b) `getTokenFeeSummary.split` discloses the
creator/momento share of the WHOLE fee dollar (×80%) while `feesGeneratedBase` records the 80% net —
a disclosure/aggregation basis mismatch.
Fix: either wire attribute2080 into a reconciliation check against the on-chain claimed amount, or
delete it and document that the 20% is on-chain-only so reviewers stop expecting an off-chain split.
