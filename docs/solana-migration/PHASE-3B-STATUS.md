# Phase 3B — Status (Mobile UI for the token economy)

**Status:** Implemented + adversarially reviewed (4 reviewers) + fixes applied. **NOT compiled/run**
(no `node_modules`/device here — see §Dev-machine gate). **Branch:** `claude/gifted-pascal-fcyskz` · **Date:** 2026-06-24

> Phase 3B completes Phase 3: the Expo UI wiring the Phase 3A endpoints into the app.

## How it was built
One **Workflow** run (14 Opus agents, ~1.78M tokens): 4 designers → synthesize (binding `CONTRACTS-P3B.md`)
→ P3B-foundation → 3 screen builds (launch/trade/vesting) in parallel → 4 adversarial reviewers → fix.

## What shipped (apps/mobile)
- **Data layer:** `services/tokenApi(.types)`, `utils/{tokenAmount,solanaTx}`, 11 React Query hooks,
  `useClientSignSubmit` (Privy `signOnly` for trades w/ `/submit`; `signAndSend` for vesting).
- **Launch wizard:** `app/launch/*` (6-step: basics → fee/tax → fundraise+LP → vesting → review → result),
  server-signed; `LaunchTokenCta` on profile.
- **Trade + detail:** `app/token/[mint]` (+`/trade`) replacing the old "Coming Soon"/`$0.004` placeholder;
  `TradePanel` (client-sign→submit, slippage control, MAX), `TradeStatusSheet` (PENDING≠CONFIRMED),
  `RecentTradesList`.
- **Vesting:** `app/vesting` (+create); `VestingScheduleCard`, `VestingWithdrawSheet` (zero-claimable + 403 gates).
- **Reusable composites:** `FeeDisclosure`, `FundraiseProgress`, `VestingProgressBar`, `PercentSlider`, `FormField`.
- Entry-point edits: `(tabs)/profile.tsx`, `creator/[id].tsx`, `market.tsx`, `ProfileDashboard.tsx`.

## Review outcome
4 reviewers: **4 P0 · 22 P1 · 26 P2** (contract manifest PASS, design-fidelity HIGH).
- **All 4 P0 fixed (verified in code):** vesting amount conversion uses real token decimals (not hardcoded 9);
  `TradeStatusSheet` never shows "CONFIRMED" for a PENDING submit; vesting withdraw gates on zero-claimable +
  classifies 400/403 (not-recipient).
- **~13 P1 fixed:** slippage control (was hardcoded 50bps); RETRY rebuilds a fresh tx (new intentId); USDC
  matched by mint (not `decimals===6`); BUY sends `inputMint`; vesting client-sign no longer strands a PENDING
  row; brand display font on the hero; DEPLOYING state no longer shows a success check; persistent launch-error
  banner; mixed-decimal vesting roll-up suppressed.
- Findings: `design/phase3b/REVIEW-{design-fidelity,correctness,ux-states,contract}.md`.

## Notes / deferred
- **Vesting client-sign path** currently throws "not supported yet" (server-sign is the path) — fine, since the
  multi-signer (Privy ephemeral) question is a 3A devnet blocker; revisit when that's resolved.
- **Contract gap:** the `/api/vesting/list` row should return `decimals` so the withdraw sheet doesn't fall back
  to a 9-decimal default (TODO on the backend; harmless for 9-dp tokens, the default).
- New dep flagged: `@react-native-community/slider` (used by `PercentSlider`; stepper fallback noted).

## Dev-machine gate (could not run in-sandbox)
1. `pnpm install` (refresh lockfile from Phase 1) + `pnpm --filter @momento/mobile add @react-native-community/slider`.
2. `tsc --noEmit` over `apps/mobile` — the static gate I couldn't run; fix residual type errors.
3. `expo run` on a device/simulator; manual QA of: launch wizard end-to-end, token detail + buy/sell (client-sign
   via Privy → submit → confirm), vesting list + withdraw, fee/tax disclosure copy.
4. Point the app at a backend whose Phase 3A devnet blockers are resolved (DBC transfer-fee-on-mint; Privy
   ephemeral co-sign) — the UI is correct, but real on-chain behavior depends on those.

**Phase 3 (3A backend + 3B mobile) is now feature-complete in code.** Remaining to production: the two 3A devnet
blockers, the dev-machine gates for every phase, the legal read before rebates, and the Phase 0 ops items
(MoonPay plugin, mainnet flip, fee ATAs, Privy server wallet).
