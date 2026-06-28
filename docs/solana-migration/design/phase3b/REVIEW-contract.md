# REVIEW-contract — Phase 3B Mobile (Adversarial Contract/Completeness Review)

Scope: static review of the Phase 3B working-tree changes in `apps/mobile` (+ the one
allowed `packages/shared/src/types.ts` change) against `CONTRACTS-P3B.md` and the backend
`CONTRACTS-P3A.md` §d. We cannot compile/run here; this is the gate.

## Verdict

Manifest is COMPLETE and the partition is clean. Every file in §b.1–b.4 exists; no file is
owned by two tasks; barrels are single-writer (foundation pre-added all screen-task export
lines per §b.0); screen tasks never edited a barrel; the `creator/[id]` and `market`
placeholders (`tokenData`/`chartData`/`ComingSoonModal`) are genuinely removed and replaced
with `useTokenDetail`-driven real data. Scope boundary respected — only `apps/mobile/**`,
`packages/shared/src/types.ts`, and `docs/**` touched (no backend edits). All
component/hook/screen signatures conform to §a. Reused primitives/composites/hooks
(`BuySellPills`, `PillTabs`, `StatsCard`, `PerformanceChart`, `useWalletBalance`,
`useUpload`, `WalletBalance`, `CHAIN_CONFIG`, `MOMENTO_FEE`, theme/typography tokens) all
exist with the assumed shapes. `useClientSignSubmit` mirrors the proven `useSwap` provider
pattern (signOnly re-serialize → /submit; signAndSend pass-through).

No P0. Findings below are P1 correctness/contract nuances and P2 polish.

---

## P1

### P1-1 — Vesting-create hardcodes 9 decimals; wrong base units for 6–8-decimal tokens
`apps/mobile/app/vesting/create.tsx:31,84` (`const DEFAULT_DECIMALS = 9;` →
`displayToBase(amountWhole, DEFAULT_DECIMALS)`).
Launch allows `decimals` 6–9 (§a.2 `LaunchTokenRequest.decimals`, launchTokenSchema
`min(6).max(9)`). The create screen never fetches the token's real decimals, so for any
token launched with <9 decimals the GROSS `amountBase` sent to `POST /vesting/create` (§d.7)
is inflated by 10^(9−decimals) — a creator vesting "50,000" tokens of a 6-decimal mint sends
1000× too much. The launch-result hand-off forwards no decimals either.
Fix: load decimals via `useTokenDetail(mint)` (or thread `decimals` through the result
hand-off params) and pass it to `displayToBase`; gate the submit button until decimals are
known.

### P1-2 — Vesting summary roll-up sums mixed-decimal/mixed-mint amounts into one figure
`apps/mobile/app/vesting.tsx:58-81,138-149`.
The summary strip BigInt-adds `claimableBase`/`totalBase` across all rows and formats with a
single `decimals` (the last row's, defaulting to 9). Rows can be different mints/decimals
(code even sets a `mixed` flag) but `mixed` is never surfaced — the user sees a single
nonsensical number when schedules span decimals/mints. Either render per-mint subtotals,
hide the strip when `mixed`, or show a "mixed" affordance. (Self-documented as "coarse" but
the displayed value is materially misleading when decimals differ.)

### P1-3 — `inputMint` omitted on BUY quote requests (contract says BUY input = USDC)
`apps/mobile/src/components/features/TradePanel.tsx:111,149`
(`quoter.getQuote({ amountInBase: base, slippageBps: 50 })`).
§d.3 specifies BUY sends `inputMint:"USDC"`. The request omits it. `tokenApi.types`
`TradeOrderRequest.inputMint` is optional and the backend enum default is `'USDC'`, so this
is likely benign — but it relies on an undocumented server default rather than the contract's
stated request. Pass `inputMint: 'USDC'` on BUY to match §d.3 exactly and avoid coupling to
a server default that could change. (ACCEPTABLE if backend confirms USDC is the default;
otherwise NEEDS-FIX.)

---

## P2

### P2-1 — `result.tsx` forwards `configSignature` but its param type omits it
`apps/mobile/app/launch/review.tsx:59` sends `configSignature` in the result params;
`apps/mobile/app/launch/result.tsx:20-30` types `useLocalSearchParams` without it (only
`poolSignature`). Harmless (result screen never reads either signature), but the type drift
is sloppy — drop the unused param from `review.tsx` or add it to the result type. NEEDS-FIX
(cosmetic).

### P2-2 — `FeeDisclosure` trade variant builds a dead conditional fragment
`apps/mobile/src/components/composites/FeeDisclosure.tsx:155`
(`${rebateMint ? '' : ''}` — both branches empty). Leftover no-op; `rebateMint` is accepted
but never rendered in the trade rebate line. Remove the dead ternary, or actually surface the
rebate mint/symbol. ACCEPTABLE (no behavioral impact).

### P2-3 — `useLaunchToken` invalidates `['userProfile']` but profile query key is `['userProfile']`?
`apps/mobile/src/hooks/useLaunchToken.ts:25-26` invalidates `['userProfile']` and
`['creator']`. Confirm these match the actual query keys used by `useUserProfile` /
`useCreatorProfile` (the profile dashboard reads `user.tokenMint`, which only refreshes if
the key matches). If `useUserProfile` keys differ, the "MANAGE $TOKEN" row won't appear
post-launch without an app reload. Verify key parity. ACCEPTABLE pending key confirmation.

### P2-4 — Gated feeds: `useTokenTrades`/`useTokenFees`/`useCreatorFees` default OFF
`apps/mobile/src/config/env.ts:25` (`FEES_FEED_ENABLED` default false) + the three gated
hooks. Per §f.2 these read routes are not in binding §d; chart, recent trades, and fee
earnings render empty until the backend lands them and the env flag flips. This is the
documented, intended degradation — flagged only so it is not mistaken for a wiring bug.
ACCEPTABLE (matches contract §f.2).

### P2-5 — Shared-type change also added to `User` (contract named only `PublicCreator`)
`packages/shared/src/types.ts` adds `tokenMint?`/`tokenId?` to BOTH `User` and
`PublicCreator`; §b.1 / §2.2 specified only `PublicCreator`. The `User` addition is what
`profile.tsx` actually reads, so it is necessary and purely additive. ACCEPTABLE deviation —
note it as an intentional widening of the §f.1 unresolved item (backend must populate
`User.tokenMint` too, not just the creator response).

---

## Cross-checks PASSED (no action)
- All §a.1 util signatures present and BigInt-safe; `solanaTx` adds `uint8ArrayToBase64`.
- §a.2 wire types mirror §d JSON exactly (money = base-unit strings).
- §a.3 sign hook: signOnly re-serializes + calls `submit`; signAndSend passes signature;
  guards wallet/provider; `console.warn` only; returns null on error.
- §a.4 hooks: query keys, staleTimes, `refetchInterval` (ACTIVE-gated), ENV gating,
  account-scoped vesting key, signOnly vs signAndSend wiring all conform.
- §a.5/§a.6/§a.7/§a.8 component signatures match exactly.
- §c API methods: endpoints + verbs + envelope reliance all correct.
- Build order honored: foundation owns every shared/contended file; screen tasks add only NEW
  route/component files; `features/launch/` subdir owned solely by launch.
- Placeholder removal verified in `creator/[id].tsx` and `market.tsx`.
