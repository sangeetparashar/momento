# Phase 3B Mobile — UX States Review (adversarial)

Scope: new/modified `apps/mobile` files wiring Phase 3A endpoints. Static review only
(no compile/run). Focus: loading/error/empty/disabled coverage, trade slippage +
insufficient-balance + pending/success/fail, launch wizard validation + server errors,
vesting nothing-to-withdraw / not-recipient, fee/tax disclosure accuracy, accessibility.

Severity: P0 = ships broken / misleading-financial / unrecoverable; P1 = real UX hole or
contract mismatch; P2 = polish / minor.

Counts: **P0 = 3, P1 = 11, P2 = 7**

---

## P0

### P0-1 — "TRADE CONFIRMED" is shown for PENDING (not-yet-confirmed) submits — misleading
`apps/mobile/src/components/features/TradeStatusSheet.tsx:93-104` (+ `TradePanel.tsx:154-156`)
`submitTrade` can return `status:'PENDING'` (§d.4 — accepted, NOT confirmed). The sign hook
maps PENDING → transient `confirming` status (`useClientSignSubmit.ts:117-120`) but then
**immediately** sets `success`, and never polls. The sheet then renders "TRADE CONFIRMED"
even when the chain outcome is unknown. For a money action this is a false confirmation: the
user may see "confirmed", close, and the trade later fails/drops.
Fix: thread the submit `status` into the sheet. If `PENDING`, render a distinct
"SUBMITTED — CONFIRMING" terminal state (not the green check / "CONFIRMED" copy), and either
poll `getTokenDetail`/a status endpoint or tell the user balances will reconcile and to check
the explorer. Only show "CONFIRMED" for `status==='CONFIRMED'`.

### P0-2 — Vesting withdraw never gates on "Nothing to withdraw"; backend 400 surfaces as raw error
`apps/mobile/src/components/features/VestingWithdrawSheet.tsx:70-74` + `useWithdrawVesting.ts:25-34`
§d.9 returns **400 "Nothing to withdraw"** when claimable is 0. The sheet's WITHDRAW button is
always enabled in review state regardless of `schedule.claimableBase`, and the hook calls
`withdrawVesting(id)` before any sign step, so a 0-claimable tap (e.g. claimable changed between
list fetch and open, or a stale list) throws and lands in the generic "WITHDRAW FAILED" screen
with a backend string. The card gates the entry CTA (`VestingScheduleCard.tsx:119,161-166`) but
the sheet itself does not, and the list can be stale.
Fix: in the sheet, disable WITHDRAW when `BigInt(schedule.claimableBase) <= 0` with copy
"NOTHING TO WITHDRAW YET"; and map the backend "Nothing to withdraw" 400 to a friendly,
non-alarming message (not the red "WITHDRAW FAILED" treatment).

### P0-3 — Not-recipient (403) on withdraw has no tailored handling
`apps/mobile/src/components/features/VestingWithdrawSheet.tsx:231-257` + `useWithdrawVesting.ts`
§d.9 authorizes `caller wallet === beneficiaryWallet` and 403s otherwise. The SENDER role can
reach a recipient row's data, and even for recipients a wallet mismatch (multi-wallet, wrong
embedded wallet) yields a 403 that renders as "WITHDRAW FAILED" + raw error with a RETRY that
will deterministically fail again. No "you are not the recipient" state.
Fix: detect the 403 / not-recipient code and show a terminal explanatory state with only a
CLOSE action (no RETRY). Ideally never open the sheet for non-recipients.

---

## P1

### P1-1 — No slippage control anywhere; slippageBps hardcoded to 50
`apps/mobile/src/components/features/TradePanel.tsx:111,149` (also `trade.tsx`)
SPEC-P3B / D-trade-ui §6 explicitly require a slippage control (chips 0.1/0.5/1% + custom,
default `MOMENTO_TRADE.DEFAULT_SLIPPAGE_BPS`, warn >100bps). TradePanel hardcodes
`slippageBps: 50` in both the quote and the submit-time re-quote. Users cannot raise slippage,
so a `SLIPPAGE`-class failure (§b.2 TradeError) is unrecoverable from the UI — RETRY re-quotes
at the same 50bps and fails again.
Fix: add the slippage chip row + custom input, store `slippageBps`, pass it to `getQuote`,
re-quote on change, and surface the >100bps warning.

### P1-2 — Trade error codes are not mapped to actionable copy
`apps/mobile/src/components/features/TradePanel.tsx:340-347`, `TradeStatusSheet.tsx:140-142`
Both the quote-error banner and the failure sheet print the raw `error.message`. D-trade-ui §
("SLIPPAGE → increase slippage or retry", QUOTE_STALE, AMOUNT_INVALID, WALLET_NOT_READY) is
not implemented. Raw server strings are not user-friendly and don't tell the user what to do.
Fix: map `TradeErrorCode` to specific copy + the right recovery action (e.g. SLIPPAGE → bump
slippage, QUOTE_STALE → auto re-quote).

### P1-3 — RETRY after a failed submit re-signs a possibly-stale/consumed tx
`apps/mobile/src/components/features/TradePanel.tsx:167-171,139-156`
`handleRetry` calls `doSubmit`, which only re-quotes when `quoter.isStale()` (30s). Within 30s
of a failure it reuses the held `build.transaction` + `intentId`. If the original failed for
SLIPPAGE or a moved price, re-signing the same intent will fail identically; worse, the same
`idempotencyKey` may dedupe to the prior failed attempt. Retry should force a fresh build.
Fix: on retry, always re-build (fresh intentId/tx/idempotencyKey) before signing.

### P1-4 — Insufficient-balance / fees gates depend on a balance shape that may never populate
`apps/mobile/src/components/features/TradePanel.tsx:74-92`
`insufficientBalance` and the BUY-side USDC balance rely on `balanceData.tokens` with a USDC
entry matched by `symbol==='USDC' || decimals===6`, and `nativeBalance ?? solBalance`. If
`useWalletBalance` doesn't return `tokens` (or names USDC differently), `availableInput` is
null → the BAL/MAX row is hidden, no insufficient-balance gate fires, and the user can submit
an unaffordable trade that fails on-chain. This is unverifiable here but is a load-bearing
assumption about a shape this file doesn't own.
Fix: confirm `useWalletBalance` returns `{ nativeBalance, tokens:[{mint,symbol,decimals,amount}] }`;
match USDC by mint (the known USDC mint), not by `decimals===6` (collides with any 6-dp token).

### P1-5 — `MIN_NATIVE_FOR_FEES` SOL gate is wrong for a USDC-fee / sponsored model
`apps/mobile/src/components/features/TradePanel.tsx:33,75,196` 
The CTA hard-blocks with "ADD SOL FOR FEES" when native SOL < 0.003. If fees are sponsored or
paid in USDC (the whole P3 model is USDC-quote + transfer-fee), this blocks valid trades and
routes the user to FundWalletModal to buy SOL they may not need. At minimum it's an unverified
assumption that the embedded wallet needs the user to hold SOL.
Fix: verify the fee-payer model. If sponsored/relayed, drop the SOL gate; if real, confirm the
threshold and ensure FundWalletModal can actually fund SOL.

### P1-6 — Launch is server-signed and synchronous, but 202/DEPLOYING + DUPLICATE are under-handled
`apps/mobile/app/launch/review.tsx:50-72`, `app/launch/result.tsx:34,87-93`
§d.1 can return 202 with `status:'DEPLOYING'` (TIMEOUT/BLOCKHASH_EXPIRED) and 200 DUPLICATE
(prior LaunchResult). The result screen shows a green "LAUNCHING" with a checkmark icon and
offers "VIEW $SYMBOL" → `/token/[mint]`, but a DEPLOYING token is not yet tradeable and
`getTokenDetail` may 404, dumping the user into "TOKEN NOT FOUND". There is no polling to flip
DEPLOYING→ACTIVE and no distinct visual for the not-final state (checkmark implies success).
Also `onError` is a generic `Alert` — `INSUFFICIENT_FUNDS` (402), one-token-per-creator (409),
and `SIMULATION_FAILED` (400) all read identically.
Fix: use a non-success icon for DEPLOYING, poll token status (or disable VIEW until ACTIVE),
and map the documented launch error codes to specific copy (esp. 409 already-launched → route
to existing token, 402 → funding guidance).

### P1-7 — Launch error Alert can lose the user's wizard draft on dismissal
`apps/mobile/app/launch/review.tsx:69-72`
On launch failure the only feedback is `Alert.alert('Launch Failed', …)` with an OK. The draft
is preserved in context (good), but there's no inline retry affordance and no guard that the
mutation isn't silently retriable while `isPending` toggled. Minor, but a server failure on the
most important action deserves an in-screen error banner + RETRY, not a transient alert.
Fix: render a persistent error banner on the review screen with a RETRY that re-submits.

### P1-8 — Vesting unlock-schedule can violate the backend modulo invariant
`apps/mobile/app/vesting/create.tsx:105-124`
`vestingCreateSchema` requires `(endAt - cliffAt) % unlockEvery === 0`. The screen sets
`unlockEvery = DAY_SECONDS` and day-aligned offsets, THEN clamps:
`cliffAt = max(cliffAt, startAt)`, `endAt = max(endAt, cliffAt + unlockEvery)`. If a user enters
cliff===duration, `endAt` becomes `cliffAt + DAY_SECONDS` → modulo holds, OK; but the comment
claims the invariant "by construction" while the clamps can shift `endAt` independent of
`cliffAt`. Edge: cliff 0, duration 0 is blocked by validation, but cliff==duration produces a
1-day vest the user didn't ask for, silently. Also `cliffAmountBase:'0'` is always sent even for
`kind:'lock'` where a cliff is meaningless.
Fix: compute `endAt` as `cliffAt + ceilToMultiple(duration-cliff, unlockEvery)`, assert the
modulo before submit, and surface a friendly message if it can't be satisfied rather than
silently mutating the schedule.

### P1-9 — Vesting decimals hardcoded to 9 across create/list/withdraw → wrong amounts for 6–8 dp tokens
`vesting/create.tsx:31,84`, `vesting.tsx:31,62`, `VestingWithdrawSheet.tsx:27,55`, `VestingScheduleCard.tsx:17,83`
Launch allows `decimals` 6–9, but every vesting surface defaults to 9 and the create screen
ALWAYS uses `DEFAULT_DECIMALS=9` to convert the whole-token amount to base units
(`displayToBase(amountWhole, 9)`). For a 6-dp token this over-deposits by 1000x. The list row's
`decimals?` is optional (`tokenApi.types.ts:164`) and frequently absent, so display is also
wrong. This is a correctness-of-money issue driven by a missing contract field.
Fix: source decimals from the token (pass through launch hand-off / fetch token detail by mint)
rather than defaulting to 9 for amount conversion; treat a missing list `decimals` as a hard
"can't format" rather than silently assuming 9.

### P1-10 — Withdraw success can show without a signature, and "View on explorer" silently absent
`apps/mobile/src/components/features/VestingWithdrawSheet.tsx:68-73,201-224`
`signature` is local state set only if `res?.signature` truthy; on the signAndSend path the
provider must return a signature. If it doesn't (provider shape variance, like the trade
signOnly branch which defensively handles `res?.signedTransaction ?? res?.transaction ?? res`),
the success screen renders with no explorer link and no signature, giving the user no proof /
no way to verify. The create-vesting client path has the same dependency.
Fix: assert a signature on the success path; if missing, show a softer "submitted" state and
log; never claim "WITHDRAWN" with zero traceability.

### P1-11 — Gated feeds default OFF means RECENT TRADES is permanently "NO TRADES YET" in prod-likely config
`apps/mobile/src/hooks/useTokenTrades.ts:15`, `app/token/[mint].tsx:165-170`, `env.ts:25`
`FEES_FEED_ENABLED` defaults to `'false'`, so `useTokenTrades` is disabled and the detail
screen always shows the "NO TRADES YET" empty state even for an actively-traded token. This
reads as a bug to users (a token with volume showing no trades). The empty state is
indistinguishable from "feature disabled".
Fix: when the feed is gated off, hide the RECENT TRADES section entirely (don't render a
misleading empty state), or show "TRADE HISTORY COMING SOON".

---

## P2

### P2-1 — FeeDisclosure trade-variant rebate line drops the rebate mint symbol
`apps/mobile/src/components/composites/FeeDisclosure.tsx:154-156`
`${rebateMint ? '' : ''}` is a no-op — the rebate amount is printed with no unit ("Estimated
rebate on this trade: 0.15"), and the mint is always formatted at 6 decimals (assumes USDC).
Honesty is otherwise good (effective-after-rebate, "paid later", "Not financial or tax advice"),
so this is polish, but an amount with no unit is ambiguous.
Fix: append "USDC" (or resolved rebate symbol) to the rebate figure.

### P2-2 — "EFFECTIVE FEE ≈ 1%" headline shows even before any quote / with default bps
`FeeDisclosure.tsx:63`, used in `app/token/[mint].tsx:173-180` (no `effectiveInAppBps` passed)
On the token detail screen no `effectiveInAppBps` is supplied, so the headline falls back to the
100bps default and asserts "≈1%" as a standing promise rather than a per-trade computed value.
Combined with "rebate paid later," a skeptical reader could read the standing ≈1% as guaranteed.
Fix: when no live quote drives it, soften to "typically ≈1% after rebate" or omit the numeric
headline outside the trade flow.

### P2-3 — Trade segmented toggle: contrast of inactive text on surface
`apps/mobile/src/components/features/TradePanel.tsx:425-427`
Inactive segment text is `textTertiary` (#555) on `surface` (#1A1A1A). That's below WCAG AA for
small text. The active states are fine. Design uses tertiary for inactive, but BUY/SELL is an
interactive control.
Fix: use `textSecondary` (#888) for the inactive (still-tappable) segment label.

### P2-4 — `displayToBase` throw on too-many-decimals is swallowed with no user feedback
`apps/mobile/src/components/features/TradePanel.tsx:104-108,144-148`
When the user types more fraction digits than the token allows, `requestQuote`/`doSubmit`
silently `return` (catch → no-op). The comment says "surfaced via the input itself" but nothing
surfaces it — the quote just never updates and the CTA stays in ENTER AMOUNT-ish states.
Fix: show an inline "max N decimals for this token" hint when the parse throws.

### P2-5 — Launch result "DEPLOYING" still uses the green success checkmark + primaryMuted halo
`apps/mobile/app/launch/result.tsx:83-93`
Pairs with P1-6: even copy aside, the visual (checkmark-circle, green) signals done. A
DEPLOYING state should look in-progress (spinner/clock).
Fix: swap icon/treatment when `deploying`.

### P2-6 — Vesting create CTA disabled only while pending; no field-completeness gating
`apps/mobile/app/vesting/create.tsx:268-276`
The CREATE button is always enabled (except while pending); validation only runs on press via
`buildPayload`. That's acceptable, but there's no disabled/affordance hint for empty required
fields, and `errors.mint/tokenId` (missing hand-off ids) only appear after a press even though
they're knowable on mount.
Fix: surface the missing-id banner on mount when mint/tokenId are absent; optionally disable CTA
until recipient+amount are non-empty.

### P2-7 — Vesting list summary rolls up mixed-decimals into one figure (acknowledged but still wrong)
`apps/mobile/app/vesting.tsx:58-81,132-152`
The code computes a `mixed` flag but never uses it — the summary sums base units across
different-decimals mints and prints one number. For mixed portfolios this total is meaningless.
Fix: either hide the roll-up when `mixed`, or render per-mint; at minimum show a "mixed tokens"
caveat using the `mixed` flag already computed.

---

## Notes / things done well
- Client-sign reconciliation (signOnly for trades → /submit; signAndSend for vesting) matches
  §d.4/d.7/d.9 and follows the `useSwap` provider pattern (`useClientSignSubmit.ts`).
- Base-unit math is BigInt-only with float only post-split (`tokenAmount.ts`) — no precision loss.
- Busy sheets are non-dismissable during in-flight on-chain actions (Trade + Withdraw sheets).
- Creator-only / wallet-not-ready / already-launched guards exist on launch + vesting-create.
- Disclosure copy avoids "no fee"/"free", states "paid later via a sweep, not instantly", and
  ends every variant with "Not financial or tax advice." (legally cautious — good).
- Most async surfaces have skeleton/error+RETRY/empty (token detail, vesting list, trade screen).
