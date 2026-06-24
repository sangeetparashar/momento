# SPEC-P3B — Phase 3B Mobile UI (Authoritative Design)

> **Status:** BINDING design spec. Reconciles the four sub-designs in this folder
> (`D-launch-ui.md`, `D-trade-ui.md`, `D-vesting-ui.md`, `D-datalayer-ui.md`) into ONE contract.
> Companion file `CONTRACTS-P3B.md` holds the zero-ambiguity signatures + file manifest + build order.
>
> Scope: (1) creator token-LAUNCH wizard; (2) token DETAIL + buy/sell TRADE; (3) FUNDRAISE progress;
> (4) VESTING view + withdraw; (5) FEE/TAX disclosure; plus the mobile DATA LAYER powering them.
>
> Backend contract: `docs/solana-migration/design/phase3/CONTRACTS-P3A.md` (§b.2, §d.1–d.9, §e).
> Envelope `{ success, data|error }` is unwrapped by `apiService` already. Money = base-unit STRINGS;
> format with token `decimals` using BigInt math (never float on base units).

---

## 0. Design system (MANDATORY — repo CLAUDE.md + docs/design/DESIGN_REFERENCE.md)

All new UI uses tokens from `apps/mobile/src/styles/theme.ts` + `typography.ts`. NEVER hardcode hex.

| Role | Token | Value |
|---|---|---|
| Background | `COLORS.background` | `#000000` |
| Surface / card | `COLORS.surface` | `#1A1A1A` |
| Elevated | `COLORS.surfaceElevated` / `backgroundTertiary` | `#242424` |
| Accent / progress fill / verified dot | `COLORS.primary` | `#00FF88` |
| Accent wash | `COLORS.primaryMuted` | `rgba(0,255,136,0.15)` |
| Text primary / secondary / tertiary | `COLORS.textPrimary/Secondary/Tertiary` | `#FFFFFF` / `#888888` / `#555555` |
| Inverse (on accent) | `COLORS.textInverse` | `#000000` |
| Error / warning | `COLORS.error` / `COLORS.warning` | `#FF4444` / `#FFB800` |
| Border | `COLORS.border` | `#2A2A2A` |

- Typography: `TYPOGRAPHY.{h1,h2,h3,body,bodySmall,caption,label,mono,monoLarge}`. ALL-CAPS for headings
  and labels (variants already apply `textTransform:'uppercase'`); numerics use `mono`/`monoLarge`.
- Verified badge = solid green 8px circle (`width/height:8, borderRadius:4, backgroundColor:COLORS.primary`).
- CTA: `COLORS.primary` bg + `COLORS.textInverse` text + `RADII.md`. Disabled: `surfaceElevated` bg +
  `textTertiary` text (the existing `Button` `disabled`/`loading` handles this — reuse it).
- Cards: `surface` bg + 1px `COLORS.border` + `RADII.lg`. Progress track `COLORS.border` (6px, `RADII.full`),
  fill `COLORS.primary`. Spacing `SPACING.{xxs2,xs4,sm8,md12,lg16,xl24,xxl32,xxxl48}`.

Before building any screen: open the relevant PNG in `docs/design/screens/` (e.g. `creator-token.png`),
compare against the current implementation, and match layout/spacing/type/color.

---

## 1. The two signing models (THE load-bearing reconciliation)

The four docs disagreed on `signTransaction` vs `signAndSendTransaction`. CONTRACTS-P3A is the tiebreaker:

- **§d.4** `POST /tokens/[mint]/{buy,sell}/submit` body is `tradeSubmitSchema` =
  `{ intentId, transaction:"<base64-CLIENT-SIGNED>", idempotencyKey }`. The API relays the submit.
  → **TRADES MUST SIGN-ONLY** (`signTransaction`), re-serialize to base64, and POST it back.
- **§d.9** `POST /vesting/[id]/withdraw` returns ONLY `{ transaction:"<base64-unsigned>", claimableBase }`
  — NO submit endpoint. **§d.7** `POST /vesting/create` returns `signMode:'client'|'server'`; client path
  returns `{ transaction }` and also has NO submit endpoint.
  → **VESTING withdraw + vesting create(client) SIGN-AND-SEND** (`signAndSendTransaction`, exactly like
  `useSwap.executeSwap`).
- **§d.1** `POST /tokens/launch` default is SERVER-SIGNED (returns landed signatures, no client signing).
  The alt `creator-as-poolCreator` path returns `{ transaction }` with `status:'DEPLOYING'` → SIGN-AND-SEND.
  3B default = server-signed; the alt path is handled defensively but not the primary flow.

ONE shared primitive expresses both: `useClientSignSubmit()` with `mode:'signOnly'|'signAndSend'`
(see CONTRACTS-P3B §a.3). All client-signed flows go through it; no flow re-implements signing.
This is the #1 on-device integration risk: verify the Privy Solana provider exposes `signTransaction`
(not only `signAndSendTransaction`) early. `useSwap` proves `getWalletProvider()` + `provider.request()` work.

The `signOnly` re-serialize step uses `uint8ArrayToBase64` (new, in `utils/solanaTx.ts`) after the provider
returns the signed `VersionedTransaction`. If the provider's `signTransaction` returns a different shape, that
is isolated to `useClientSignSubmit` — every screen stays unaffected.

---

## 2. Data layer (foundation)

The data layer is one task (**P3B-foundation**) so the three screen tasks never touch shared files.
It owns: the typed API wrappers, the wire types, the formatting + tx utils, the shared client-sign hook,
every React Query hook, every shared component, and every edit to an existing screen. See CONTRACTS-P3B §b.

Conventions (from the existing app, do not deviate):
- `apiService.get/post` already inject the bearer + unwrap `{success,data}` + throw `ApiError{status,body}`.
  New code calls these directly; never re-wrap.
- Read = `useQuery`; write = `useMutation` (`@tanstack/react-query`). Account-scoped keys include `user?.id`.
- Mutations surface failures via `showErrorToast` (`@/utils/toast`); queries expose `error` to the screen.
- All base-unit formatting goes through `@/utils/tokenAmount` — no inline `parseInt`/float on base units.

### 2.1 Endpoint-availability flags (foundation action items)
- `GET /tokens/[mint]/{trades,fees}` and `GET /creators/[id]/fees` are in the PROMPT but NOT in the binding
  §d table. Implement the wrappers + hooks, but gate the hooks behind `ENV.FEES_FEED_ENABLED`
  (`EXPO_PUBLIC_FEES_FEED_ENABLED`, default false) and render empty states until the backend read routes
  land. NO screen has a hard dependency on these. Foundation files a backend follow-up.
- `creator → mint` gap: `PublicCreator` does not yet expose the token mint. 3B needs it for the
  `creator/[id]` and `market` deep-links into `/token/[mint]`. **Decision: add `tokenMint?: string`
  (and `tokenId?: string`) to the `/creators/[id]` response + `PublicCreator` shared type** (one
  `@momento/shared` edit, foundation-owned/flagged to backend). Until then those entry points fall back to
  rendering the in-tab token panel via `useTokenDetail(profile.tokenMint)` guarded on presence, and the
  standalone `/token/[mint]` route works regardless.

---

## 3. LAUNCH wizard (P3B-launch)

Creator-only, multi-step stack under `app/launch/`. Server-signed submit (plain mutation, no Privy).

**Entry point** (foundation-owned edit): a "LAUNCH YOUR TOKEN" CTA card in `ProfileDashboard`, shown when
`isCreator && !hasLaunchedToken` → `router.push('/launch')`. When the creator already has a token, show a
compact "MANAGE $SYMBOL" row → `/token/[mint]`. Gate is a UX nicety; server 409 is the real guard.

**Steps** (linear push stack; `_layout.tsx` renders back chevron + centered step title + `StepProgress`;
sticky footer CTA above the safe-area inset):
1. `index.tsx` — TOKEN BASICS: image upload card (reuse `useUpload`), NAME, $TICKER (auto-uppercase),
   DESCRIPTION (counter), SUPPLY + DECIMALS.
2. `fees.tsx` — FEE & TAX: TRANSFER FEE control (3%–5%, bps 300–500), TRADING FEE SPLIT (single "YOUR SHARE"
   creator %, partner = 100−creator), worked example, and the shared `<FeeDisclosure variant="launch">`.
3. `fundraise.tsx` — TARGET USD, INITIAL MARKET CAP (collapsible advanced), LP ALLOCATION
   (`AllocationSliders`: 4 percents summing to EXACTLY 100, stacked-bar + TOTAL chip + reset).
4. `vesting.tsx` — TEAM VESTING (optional toggle; form-only — collects the slice, does NOT submit it here;
   hands off to the D-vesting create flow from the result screen).
5. `review.tsx` — read-only summary (BASICS/FEES/FUNDRAISE/VESTING) with per-section EDIT, permanence
   warning + required checkbox, footer CTA "LAUNCH TOKEN" → `useLaunchToken().mutate(buildLaunchPayload())`.
6. `result.tsx` — success/deploying hero, mint/pool tap-to-copy + explorer link, VIEW TOKEN / SHARE / DONE,
   and (if a vesting slice was collected) a "SET UP VESTING" hand-off.

**Form state**: `useLaunchWizard()` Context (in-memory only, discarded on abandon) holds the `LaunchDraft`,
`patch`, `errors`, `validateStep`. Validation mirrors `launchTokenSchema` exactly so CONTINUE/LAUNCH is
disabled before any network call. Defaults are imported from `@momento/shared` `MOMENTO_LAUNCH` +
`MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS` — never hardcoded. `buildLaunchPayload(draft)` (pure) produces the
§d.1 body, dropping the vesting key entirely. Whole-token → base-unit conversion uses
`displayToBase(whole, decimals)` from `@/utils/tokenAmount` (BigInt).

**States**: per-field inline errors; review-level mapped API error card (409 terminal → "GO TO MY TOKEN";
402 → fund-and-retry; 400 → adjust params; 202 DEPLOYING → success-pending). Loading = button spinner +
disabled form + cosmetic `LaunchProgress` strip ("This can take ~30s"). Success = `router.dismissAll()` then
`router.replace('/launch/result', {params})` so back can't re-fire submit. `index.tsx` redirects
non-creators on mount.

---

## 4. TRADE: token DETAIL + buy/sell (P3B-trade)

Replaces the hardcoded `$0.004` / "Trading Coming Soon" placeholder.

### 4.1 `app/token/[mint].tsx` — DETAIL
`useLocalSearchParams<{mint}>()`. Top→bottom: nav bar (back + `$SYMBOL` + creator handle w/ verified dot);
hero image; `<TokenStatRow>` (PRICE / 24H / MKT CAP from `useTokenDetail`+`useTokenTrades`);
`<FundraiseProgress>` (only when `token.fundraise != null`; graduated badge when `fundraise==null &&
graduatedAt`); `<PerformanceChart>` (real price points or "PRICE HISTORY UNAVAILABLE" — never fabricated);
`<FeeDisclosure variant="trade">` (collapsed); `<RecentTradesList>` (tap row → explorer); sticky BUY/SELL
bar (`BuySellPills`) → `router.push('/token/'+mint+'/trade?side=buy|sell')`, disabled + "NOT YET TRADEABLE"
when `status!=='ACTIVE'` and not graduated.

States: loading → `<TradeScreenSkeleton>`; error → centered alert + retry; 404 → "TOKEN NOT FOUND".
Pull-to-refresh refetches all queries.

### 4.2 `app/token/[mint]/trade.tsx` — TRADE (`?side=buy|sell`)
Full-screen pushed route hosting `<TradePanel>` + `<TradeStatusSheet>`.

`<TradePanel>`: header ("BUY/SELL $SYMBOL" + venue badge); BUY|SELL segmented toggle (resets amount+quote);
"You pay" card (BUY input = USDC 6dp; SELL input = token `decimals`; balance + MAX via `useWalletBalance`,
SwapModal pattern); "You receive" read-only `quote.expectedOutBase` (spinner while quoting); slippage chips
(0.1/0.5/1% + custom; default `MOMENTO_TRADE.DEFAULT_SLIPPAGE_BPS`; warn >100bps); quote breakdown
(min received, price, FEE ({feeBps/100}%), IN-APP REBATE +`inAppRebateBase` green, EFFECTIVE FEE
{effectiveFeeBps/100}%); `<FeeDisclosure variant="trade">`; error banner; primary CTA with label state-machine
(Connect Wallet / Enter Amount / Min … / Insufficient {symbol} / Fetching Quote… / Quote Expired — Refresh /
BUY $SYMBOL).

**Flow**: §d.3 returns BOTH quote AND unsigned `transaction`+`intentId` in ONE call (build == quote, no
separate quote endpoint). `useTokenTradeQuote` POSTs `/tokens/[mint]/[side]` on amount/side/slippage change
(debounce 400ms) and holds the whole `TradeBuildResponse` (surfaces `.quote`, retains `.transaction`/
`.intentId`/`.idempotencyKey`); 30s TTL → re-quote before submit. `useSubmitTrade` runs
`useClientSignSubmit({mode:'signOnly'})`: sign-only the held tx → re-serialize → POST `.../submit` with
`{intentId, transaction:signedBase64, idempotencyKey}` → CONFIRMED/PENDING. On success: fast-poll
`walletBalance` (now + 3s + 8s), invalidate `['tokenDetail',mint]`/`['tokenTrades',mint]`/`['tokenFees',mint]`,
log the tx (SwapModal pattern). `<TradeStatusSheet>` overlays `signing→submitting→confirming→success/error`
with mapped error copy (§6 of D-trade) + RETRY.

---

## 5. FUNDRAISE + FEE/TAX disclosure (shared composites, foundation-owned)

`FundraiseProgress` and `FeeDisclosure` are authored once in `components/composites/` by foundation, then
imported by trade (and launch for the fee step). This kills the three duplicate names across docs.

- `FundraiseProgress` — track + fill to `progressPct`, "RAISED $x / $y · n%", status chip
  (ACTIVE→LIVE, THRESHOLD_MET→TARGET MET, FINALIZING→GRADUATING…, COMPLETED/graduated→GRADUATED, FAILED/
  REFUNDED→red). `compact` variant = bar + inline only. Divide-by-zero guarded. USDC = 6 decimals.
- `FeeDisclosure` — single source of fee copy. `variant:'trade'|'launch'|'vesting'`, `expandable` collapsed
  by default. Numbers from `@momento/shared` (`MOMENTO_FEE.TARGET_IN_APP_BPS`=100,
  `DEFAULT_TRANSFER_FEE_BPS`=400) + live `TokenDetail.feeConfig`/`quote`. **Honesty guardrails (REQUIRED):**
  the ≈1% is *effective/net after rebate*; the full transfer fee is charged on-chain first and the rebate is
  paid by a later sweep (not instant); vesting context says NO rebate applies to withdrawals and the net
  received may be slightly less due to the token's transfer fee; every variant ends with "Not financial or
  tax advice." Never say "no fee" or "free."

---

## 6. VESTING view + withdraw (P3B-vesting)

`app/vesting.tsx`: own header (back + "VESTING"), `PillTabs` RECIPIENT|SENDER role toggle (drives `role=`),
optional summary strip (CLAIMABLE NOW / TOTAL VESTING), `FlatList` of `VestingScheduleCard`. States:
`VestingSkeleton` (loading), centered empty copy per role, error banner + RETRY, pull-to-refresh.

`VestingScheduleCard`: `$SYMBOL` + status pill (ACTIVE→VESTING, COMPLETED→FULLY VESTED, CANCELLED, PENDING);
kind/cliff line (countdown pre-cliff); `VestingProgressBar` (withdrawn solid / claimable 50%-alpha / locked
track); RELEASED/CLAIMABLE/LOCKED amounts via `formatBaseUnits`; recipient-only WITHDRAW CTA
(filled when `claimableBase>0`, disabled "NOTHING TO WITHDRAW YET" otherwise). `decimals` may be absent on the
list row → default 9, read from cached `['tokenDetail',mint]` if present (`TODO(contract)`).

`VestingWithdrawSheet` (recipient-only `Modal` pageSheet, SwapModal shell): review (amount, recipient,
`<FeeDisclosure variant="vesting">`) → `useWithdrawVesting().withdraw(id)`: POST `/vesting/[id]/withdraw` →
`useClientSignSubmit({mode:'signAndSend'})` (no submit endpoint) → confirming → success (explorer link, DONE
invalidates `['vesting']`) / error (TRY AGAIN). Block close during signing/confirming.

Optional `app/vesting/create.tsx` (creator) consumes `useCreateVesting` (`signMode` discriminator: server →
done; client → `signAndSend` the returned tx). Reachable from the launch result hand-off (prefilled slice).

Entry point (foundation-owned edit): a "VESTING" row in `ProfileDashboard` → `/vesting`.

---

## 7. States checklist (all screens)

Loading / error / empty / disabled / terminal are mandatory per screen (specified inline above and in the
sub-docs). Reuse existing primitives: `LoadingView`, `Skeleton`/`SkeletonText`, `ChartSkeleton`, `Button`
(loading+disabled), `Card`, `Text`, `FundWalletModal` (offer on wallet-not-ready/insufficient).
Client-sign status → copy: `signing`→"SIGNING…", `submitting`→"SUBMITTING…", `confirming`→"CONFIRMING…",
`success`→"DONE". Error code map (`ApiError.status`/`body.error`): 400 wallet-not-ready, 402 insufficient,
403 not-owner, 409 already-has-token, 202/PENDING success-ish, SLIPPAGE/QUOTE_STALE re-quote, else
`ApiError.message`. Accessibility: 44px touch targets, `accessibilityRole` on CTAs/progressbars,
labels combining label+value.

---

## 8. Dependency note (NO install in this phase — WRITE FILES ONLY)

`@react-native-community/slider` is NOT installed (verified in `apps/mobile/package.json`); only
`expo-clipboard` + `expo-image-picker` are present, and `@solana/web3.js` (used by `useSwap`).
**Decision: `PercentSlider` ships as a −/+ STEPPER (no slider lib)** with the same prop API, so launch can
build without a native install. If the slider lib is added later, only `PercentSlider` internals change.
`expo-clipboard` (copy mint/pool) and `expo-image-picker` (via `useUpload`) are available. The build runs
files-only — no pnpm/expo/tsc/eslint/network.
