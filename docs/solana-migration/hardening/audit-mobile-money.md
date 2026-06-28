# Hardening audit — mobile money / signing paths

Scope: `apps/mobile` signing + money flows — `useClientSignSubmit`, `useSubmitTrade`,
`useTokenTradeQuote`, `useWithdrawVesting`, `useCreateVesting`, `useLaunchToken`,
`services/tokenApi(.types)`, `services/api`, `utils/tokenAmount`, `utils/solanaTx`,
`TradePanel`, `TradeStatusSheet`, `VestingWithdrawSheet`, `vesting/create`, `launch/*`.
Static review only (no tsc/network). Date 2026-06-24. Cross-checked against
phase3b REVIEW-* and hardening/audit-signing-tx.md to avoid re-reporting fixed items
(e.g. PENDING-not-CONFIRMED P0-1, nothing-to-withdraw P0-2, not-recipient P0-3,
decimals P1-9 are all already fixed in the committed code).

---

## P0-A — HTTP 202 (broadcast-but-unconfirmed) is treated as SUCCESS; a timed-out trade is shown "TRADE CONFIRMED"

`apps/mobile/src/services/api.ts:117-147` (root cause) → surfaces in
`useSubmitTrade.ts:36-48`, `useClientSignSubmit.ts:122-135`, `TradeStatusSheet.tsx`.

The trade submit route returns **HTTP 202** with body `{ success:false, error }` when the
relay throws `SolanaTxError(TIMEOUT | BLOCKHASH_EXPIRED)` — i.e. the tx was broadcast but
confirmation is unknown (`apps/api/app/api/tokens/[mint]/buy/submit/route.ts:71-83`, same
for sell). On the client, `ApiService.request` only branches on `response.ok` (true for any
2xx incl. 202) and only special-cases `204`. For 202 it skips the error throw, then the
`{success,data}` unwrap check fails (no `data` key) so it returns the **raw
`{success:false, error}` object** cast as `TradeSubmitResponse`. Result: `res.signature`,
`res.status`, `res.deduped` are all `undefined`. `useClientSignSubmit` sets
`submitStatus = null`, `signature = null`, `status = 'success'`. `TradeStatusSheet` then
renders the green check "TRADE CONFIRMED" (not even the PENDING branch, since
`submitStatus !== 'PENDING'`) with no explorer link — a **false confirmation of a trade
whose chain outcome is unknown**. The user may close, believing the buy/sell landed.

Fix: in `ApiService.request`, after parsing, treat a response whose JSON body is an object
with `success === false` (or specifically status `202`) as an error — throw
`new ApiError(response.status, parsed)`. That routes 202 into the existing error UI
(TRADE FAILED + RETRY) and, better, the caller can map 202 to a distinct
"SUBMITTED — confirming, check the explorer" terminal state. At minimum, never report
`success` for a body that says `success:false`.

## P0-B — Same 202/`success:false` mishandling corrupts LAUNCH: result screen shows "$TOKEN IS LIVE" with mint "—" and a VIEW button to `/token/undefined`

`apps/mobile/src/services/api.ts:117-147` (root cause) → `useLaunchToken.ts`,
`app/launch/review.tsx:52-72`, `app/launch/result.tsx:32-34,55-58,130-133`.

`/tokens/launch` returns the identical 202 `{success:false}` shape on
TIMEOUT/BLOCKHASH_EXPIRED. Because of P0-A's root cause, `launch.mutate` resolves to
`onSuccess` (not `onError`) with `res = {success:false,error}`. The review screen navigates
to the result screen with `mint = res.mintAddress` (undefined) and `status = res.status`
(undefined, so `deploying` is false). The result screen then shows the success hero
"$SYMBOL IS LIVE", an enabled "VIEW $SYMBOL" CTA that routes to `/token/undefined`, and
mint "—". The DEPLOYING handling (prior P1-6) is correct in principle but never triggers
because the status field is lost. Same centralized fix as P0-A resolves this; it routes 202
into `mapLaunchError` which already has copy.

## P1-C — `useClientSignSubmit` signOnly re-serialization is fragile against the real Privy provider return shape

`apps/mobile/src/hooks/useClientSignSubmit.ts:110-119`.

For `signOnly`, the code does
`const signed = res?.signedTransaction ?? res?.transaction ?? res;` then
`typeof signed?.serialize === 'function' ? signed.serialize() : (signed as Uint8Array)`.
If the Privy `@privy-io/expo` Solana provider's `signTransaction` returns something other
than a `VersionedTransaction` or `{signedTransaction|transaction}` (e.g. a base64 string, a
`{ signature }`, or an `{ signedTransaction: base64 }`), the final `(signed as Uint8Array)`
fallback feeds `uint8ArrayToBase64` a non-byte value → it iterates a string and produces a
corrupt base64 that the `/submit` endpoint will reject (or worse, `assertTxMatchesIntent`
behavior on a malformed tx). The exact return shape can only be confirmed against the live
Privy provider (no spike exists for `signTransaction` — the spikes/useSwap only exercise
`signAndSendTransaction`). devnetBlocked: cannot verify the shape offline.

Fix: handle the documented Privy return shapes explicitly — if `signed` is a string, decode
base64 directly; if it has `.serialize`, use it; otherwise throw a clear error instead of
silently emitting garbage base64. Add a guard that the produced base64 deserializes back to
a `VersionedTransaction` before POSTing.

## P1-D — `useWithdrawVesting` (signAndSend) reports "WITHDRAWN" the instant the provider returns, with no confirmation gate

`apps/mobile/src/hooks/useWithdrawVesting.ts:39-49`, `useClientSignSubmit.ts:99-106,128-130`,
`VestingWithdrawSheet.tsx:78-81,221-261`.

The withdraw path uses `signAndSend`. `useClientSignSubmit` calls
`provider.request({ method:'signAndSendTransaction', params:{ transaction, connection }})`
and immediately treats the returned `signature` as terminal success (`status='success'`).
There is no `confirming` step and no `connection.confirmTransaction`. With a `'confirmed'`
Connection, Privy's provider *may* await confirmation internally, but that is not
guaranteed by contract — `signAndSendTransaction` can resolve as soon as the tx is
broadcast. If it resolves pre-confirmation, the sheet shows "WITHDRAWN — Your $SYMBOL has
been released" for a tx that can still drop. Unlike the trade path (P0-1, since fixed),
there is NO PENDING/CONFIRMED distinction available here because there is no `/submit`
endpoint to report chain status. Same applies to any future signAndSend launch-alt path.
devnetBlocked: the provider's confirmation semantics can only be verified against the live
Privy provider.

Fix: after `signAndSendTransaction`, explicitly `await getConnection().confirmTransaction`
(or `getSignatureStatuses` poll) to a `'confirmed'` commitment before flipping to success,
and show the `confirming` state meanwhile. The `SignStatus` already defines `'confirming'`
but no code path ever sets it — wire it here.

## P1-E — `getConnection()` memoizes a Connection bound to a possibly-stale RPC and is shared mutably across all sign flows

`apps/mobile/src/utils/solanaTx.ts:37-45,13-14`.

`getConnection()` lazily caches a single `Connection(SOLANA_RPC_URL,'confirmed')`. This is
only used in `signAndSend` mode (vesting withdraw) as the broadcast/confirm RPC. The URL
falls back to public `api.mainnet-beta.solana.com` if neither `EXPO_PUBLIC_HELIUS_RPC_URL`
nor `ENV.HELIUS_RPC_URL` is set — public mainnet RPC is rate-limited and frequently drops
`sendRawTransaction`/confirmation for money txs. A user on the public fallback can have a
withdraw silently fail to broadcast/confirm. Low severity in prod (env is set), but the
silent public fallback on a fund-moving path is a foot-gun.

Fix: if no Helius RPC is configured, fail loudly (or surface a "wallet not configured"
state) on the signAndSend path rather than quietly using a public RPC that will throttle
money transactions.

## P2-F — Custom slippage allows up to 50% (`MAX_SLIPPAGE_BPS = 5000`) with only a soft warning; MAX precision floor can still over-spend on tiny-decimal tokens

`apps/mobile/src/components/features/TradePanel.tsx:419-435` and `:152-161`.

(1) The custom slippage field clamps to `MOMENTO_TRADE.MAX_SLIPPAGE_BPS = 5000` (50%) with
only a text warning above 100 bps. A fat-fingered "50" reads as 50% slippage on a money
trade. Consider a hard cap well below 5000 for the in-app UI (e.g. 1000 bps) and require an
explicit confirm above the warn threshold.
(2) `handleMax` floors to `inputDecimals === 6 ? 2 : 4` dp. For a hypothetical token minted
with <4 decimals this still under-floors safely, but for the SELL side the floored MAX is
re-quoted and the actual on-chain balance is checked server-side — fine. Keep, but note the
precision constant is decimals-agnostic; prefer flooring at `min(decimals, 6)` derived dp.

## Already-fixed (not re-reported)

- PENDING-not-CONFIRMED trade state — `TradeStatusSheet.tsx:69,104-120` now renders a
  distinct SUBMITTED/confirming state for `submitStatus==='PENDING'` (prior P0-1). The 202
  case (P0-A) is a *different* bug that bypasses this.
- Nothing-to-withdraw gating + friendly mapping (prior P0-2) — `VestingWithdrawSheet.tsx:70-92`.
- Not-recipient 403 terminal state (prior P0-3) — `VestingWithdrawSheet.tsx:88-92,298-314`.
- Vesting decimals sourced from token detail, not hardcoded 9 (prior P1-9) —
  `vesting/create.tsx:65-93`, `VestingWithdrawSheet.tsx:62`. (Still depends on the
  list/withdraw responses returning real `decimals`; the schema-shared/vesting modules own
  that backend gap.)
- Client-signed vesting create rejected loudly rather than stranding a PENDING row —
  `useCreateVesting.ts:33-37`.
- Retry forces a fresh build/intent so a consumed/stale intent is never re-signed —
  `TradePanel.tsx:167-209`.
