# Phase 3B Mobile UI — Correctness / API-Wiring Review

Scope: new `apps/mobile` files wiring Phase 3A endpoints (launch / trade / vesting +
gated fee feeds). Gate is STATIC review (no compile/run). Contract:
`docs/solana-migration/design/phase3/CONTRACTS-P3A.md` §d/§e.

Verdict: solid wiring overall — envelope unwrap, base-unit BigInt math, client-sign→submit
flow, query keys, and barrel exports all resolve. Findings below are mostly correctness gaps
around token `decimals` assumptions and the vesting client-path.

P0: 1 · P1: 6 · P2: 7

---

## P0

### P0-1 — Vesting create/withdraw amount conversion hardcodes 9 decimals; wrong base units for 6–8-decimal tokens
`apps/mobile/app/vesting/create.tsx:31,84` (`DEFAULT_DECIMALS = 9`, `displayToBase(amountWhole, DEFAULT_DECIMALS)`).
The launch wizard lets a creator pick `decimals` 6–9 (`launchTokenSchema.decimals`,
`useLaunchWizard` `draft.decimals`). The launch→vesting hand-off (`app/launch/result.tsx:60-73`)
forwards `amountWhole` but NOT `decimals`, and the create screen unconditionally scales by 1e9.
A creator who launched a 6-decimal token and vests "50,000" tokens will send
`amountBase = 50000 * 10^9` = 1000× the intended gross deposit (`vestingCreateSchema.amountBase`
is just a positive-int string, so the server accepts it). This silently over-deposits / fails on
insufficient balance. Fix: thread real decimals through the flow — fetch via `useTokenDetail(mint)`
in `create.tsx` (or pass `decimals` in the result→create params and the wizard draft) and use it in
`displayToBase`. Until then, gross deposits are wrong for every non-9-decimal token.

---

## P1

### P1-1 — `useCreateVesting` client path never logs the signature; row stays PENDING forever
`apps/mobile/src/hooks/useCreateVesting.ts:29-39`. Per CONTRACTS-P3A §d.7, when
`signMode === 'client'` "row stays PENDING until mobile self-submits + **logs**." The hook signs
and broadcasts (`signAndSend`) and stuffs `createSignature` into the returned object, but makes NO
follow-up call to persist that signature, so the `VestingSchedule` row is never flipped to ACTIVE
and won't appear correctly in `GET /vesting/list`. There is no log endpoint in the P3B surface, so
either the backend default must be `signMode: 'server'` (then this path is dead and should error
loudly) or a log/confirm call is missing. Fix: confirm backend always returns `server` for the
supported path and make the `client` branch throw "unsupported" rather than silently leaving a
PENDING row; or add the log POST once the endpoint exists.

### P1-2 — Client-sign `signOnly` uses Privy `signTransaction`, an unverified provider method
`apps/mobile/src/hooks/useClientSignSubmit.ts:101-111`. Every trade (§d.4) goes through
`provider.request({ method: 'signTransaction', params: { transaction: tx } })`. The proven pattern
(`useSwap.ts:167`) only ever calls `signAndSendTransaction`. `signTransaction` (sign-without-send)
is required here because §d.4 needs a client-signed base64 to relay, but it is NOT exercised
anywhere else in the app and the Privy RN Solana provider's support / return shape is unverified.
The code defensively handles `res.signedTransaction ?? res.transaction ?? res`, which is good, but
if the method is unsupported the entire BUY/SELL submit path fails at runtime. Fix: verify the
Privy embedded-wallet RN provider exposes `signTransaction`; if not, fall back to
`signAndSendTransaction` + a submit that accepts a signature (would require a backend contract
change). This is the single highest-risk wiring assumption in Phase 3B.

### P1-3 — `useWithdrawVesting` calls `withdrawVesting(id)` even when claimable is 0 / no guard
`apps/mobile/src/hooks/useWithdrawVesting.ts:26-34` and `VestingWithdrawSheet.tsx:70-74`. §d.9
returns 400 "Nothing to withdraw" when claimable is 0. The sheet's WITHDRAW button is reachable
(the gating "NOTHING TO WITHDRAW YET" disable lives in `VestingScheduleCard`, not the sheet), and
a stale list row (claimable became 0 between list fetch and open) will POST and surface a raw 400.
That is handled as a generic error, but the design (`D-vesting-ui §4.3`) wants this surfaced as a
banner + list refetch. Fix: on the withdraw error, detect the 400 and `invalidateQueries(['vesting'])`,
and/or disable the sheet CTA when `schedule.claimableBase === '0'`.

### P1-4 — `useUserProfile()` destructured for `isLoading`-less guard race in vesting/launch screens
`apps/mobile/app/vesting/create.tsx:152` and `app/launch/index.tsx:62` gate on `if (user && !isCreator)`
and `if (!walletAddress)`. While `user` is still loading (`undefined`), NONE of the guards fire, so the
full form renders briefly with `mint/tokenId` falling back to `''`. A fast tapper can hit CREATE with
empty `tokenId`/`mint` (caught by `buildPayload` validation → P2, not crash) but the creator-only guard
is also bypassed during load. Fix: render a loading state while `useUserProfile().isLoading` before
evaluating role/wallet guards (the hook already exposes `isLoading`).

### P1-5 — Trade quote ignores user-selected slippage; hardcoded 50 bps everywhere
`apps/mobile/src/components/features/TradePanel.tsx:111,149`. Both the debounced quote and the
re-quote-before-submit pass `slippageBps: 50` literally. `tradeOrderSchema` accepts 1–5000 and
`MOMENTO_TRADE.DEFAULT_SLIPPAGE_BPS`/`MAX_SLIPPAGE_BPS` exist for a reason; there is no UI to change
it and `minOut` is always computed at 0.5%. Not a crash, but it is a silent functional limitation
(volatile tokens will fail with SLIPPAGE and the user can't widen tolerance). Fix: add a slippage
control (or at least source the default from `MOMENTO_TRADE.DEFAULT_SLIPPAGE_BPS` so it is tunable
in one place).

### P1-6 — `FundraiseProgress` quoteMint passed but quoteDecimals assumed USDC(6) regardless of mint
`apps/mobile/app/token/[mint].tsx:108-117` passes `quoteMint={token.fundraise.quoteMint}` but not
`quoteDecimals`; the component defaults to 6 (`FundraiseProgress.tsx:69`). If a future fundraise uses
a non-6-decimal quote mint, the raised/threshold figures render off by orders of magnitude. Today
quote is always USDC so it is correct, but the prop is dropped on the floor — make the decimals
derive from the mint or document the USDC-only assumption explicitly. (Borderline P2; flagged P1
because it is money display.)

---

## P2

### P2-1 — BUY balance/USDC detection matches any 6-decimal token
`apps/mobile/src/components/features/TradePanel.tsx:81-84`: `tokens.find(t => t.symbol === 'USDC' || t.decimals === 6)`.
The `decimals === 6` fallback can match a non-USDC 6-decimal holding and show the wrong "available"
balance / MAX. Prefer matching the actual USDC mint (`TOKEN_MINTS.USDC` from `useSwap`).

### P2-2 — `useCreateVesting` reads `signer.error` synchronously after `run()` (stale closure)
`useCreateVesting.ts:36`. `run()` sets error via React state and returns null; `signer.error` in the
same tick is the previous render's value, so the thrown message is almost always the generic fallback.
Functionally fine (mutation rejects), but the specific error text is lost. Capture the message from a
returned value instead of the hook's state.

### P2-3 — Vesting create `unlockEvery` fixed at 1 day; cliff/duration in days only
`apps/mobile/app/vesting/create.tsx:107-111`. Always daily ticks. The schema's
`(endAt-cliffAt) % unlockEvery === 0` invariant holds by construction, and the `Math.max` clamps keep
it valid, but sub-day or custom cadences are impossible. Acceptable for v1; note as a limitation.

### P2-4 — `useTokenDetail` polls only while `status === 'ACTIVE'`; FINALIZING/THRESHOLD_MET stop refreshing
`apps/mobile/src/hooks/useTokenDetail.ts:17-19`. During graduation (`FINALIZING`) price/fundraise stop
auto-updating until manual refetch. Consider also polling on `THRESHOLD_MET`/`FINALIZING`.

### P2-5 — `RecentTradesList` / fee feeds are permanently empty (ENV gate default off, route not in contract)
`useTokenTrades.ts`, `useTokenFees.ts`, `useCreatorFees.ts` gate on `ENV.FEES_FEED_ENABLED` (default
false) and the routes are not in the binding §d. Screens degrade to empty states (good), but the
"RECENT TRADES" section + creator fee surfaces show nothing in prod. This is intentional per the code
comments; flag so it is not mistaken for a wiring bug.

### P2-6 — Launch result screen drops `configSignature`; review passes it but result never renders it
`app/launch/review.tsx:58` forwards `configSignature`+`poolSignature`; `app/launch/result.tsx:20-30`
only reads `poolSignature` (and doesn't render it either). Harmless, but the success screen shows no
deploy signature / explorer link unlike the trade & withdraw sheets. Consider surfacing one.

### P2-7 — `displayToBase` MAX uses `toFixed(2|4)` which can exceed available balance by rounding
`TradePanel.tsx:131-136` `handleMax` does `availableInput.toFixed(4)`. `toFixed` rounds half-up, so a
balance of `1.23455` → `"1.2346"`, slightly above the real balance, tripping `insufficientBalance` or a
server-side balance error on MAX. Use floor-to-precision (or pass the raw base-unit balance through).

---

## Verified correct (no action)

- Envelope unwrap (`services/api.ts:138-147`) — hooks never re-unwrap `{success,data}`.
- Client-sign → `/submit` trade flow: build (§d.3) retains `intentId`+`idempotencyKey`, re-quote on
  stale, sign-only, POST submit with all three fields, `deduped`/`PENDING` handled
  (`useSubmitTrade.ts`, `useTokenTradeQuote.ts`, `useClientSignSubmit.ts`).
- BUY not sending `inputMint` is fine — backend buy route derives direction by side and ignores it
  (`apps/api/app/api/tokens/[mint]/buy/route.ts`, `lib/trade.ts:347-360`).
- Base-unit math uses BigInt throughout (`utils/tokenAmount.ts`, `VestingScheduleCard`,
  `FundraiseProgress`); no float arithmetic on base units; divide-by-zero guarded.
- Withdraw correctly uses `signAndSend` (no `/submit` endpoint per §d.9).
- Barrels (`hooks/index.ts`, `components/*/index.ts`) export every new symbol; imports resolve.
- Expo Router file-based routes (`token/[mint]`, `token/[mint]/trade`, `launch/*`, `vesting`,
  `vesting/create`) are valid; `useLocalSearchParams` typed; no shared router file needed.
- Token decimals for trade I/O are sourced from `useTokenDetail` (`TradePanel` input/output decimals),
  not hardcoded — only the vesting screens hardcode 9 (P0-1/P1).
