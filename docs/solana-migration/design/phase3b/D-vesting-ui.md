# D — Phase 3B Mobile UI: Vesting View + Withdraw, Fee/Tax Disclosure, Fundraise Progress

> **Status:** implementation-ready. **Owner:** Vesting/disclosure/fundraise UI sub-task of Phase 3B.
> **Scope (this doc):** (a) the recipient VESTING VIEW (list + per-schedule detail) and the WITHDRAW flow
> (`POST /vesting/[id]/withdraw` → client-sign → confirm); (b) a reusable **FeeTaxDisclosure** component;
> (c) a reusable **FundraiseProgress** component. The vesting CREATE form is creator-facing and lives in
> the LAUNCH WIZARD (D-launch) — see §7 Cross-cutting for the shared hook/type contract.
> **Backend contract:** `docs/solana-migration/design/phase3/CONTRACTS-P3A.md` §d.8 (`GET /api/vesting/list`),
> §d.9 (`POST /api/vesting/[id]/withdraw`), §d.2 (`GET /api/tokens/[mint]` `fundraise` block).
> **Design system:** repo `CLAUDE.md` + `docs/design/DESIGN_REFERENCE.md`. Pure-black, mono all-caps, green accent.

---

## 0. Design tokens (exact, from `apps/mobile/src/styles/theme.ts` + `typography.ts`)

Use the existing token modules — **do not hardcode hex**. Reference map for this doc:

| Role | Token | Value |
|---|---|---|
| Screen bg | `COLORS.background` | `#000000` |
| Card / surface | `COLORS.surface` | `#1A1A1A` |
| Elevated chip | `COLORS.backgroundTertiary` | `#242424` |
| Accent / progress fill / verified dot | `COLORS.primary` | `#00FF88` |
| Accent wash (rebate pill, glow border) | `COLORS.primaryMuted` | `rgba(0,255,136,0.15)` |
| Text primary | `COLORS.textPrimary` | `#FFFFFF` |
| Text secondary (labels, captions) | `COLORS.textSecondary` | `#888888` |
| Text tertiary (axis, disabled, track) | `COLORS.textTertiary` | `#555555` |
| Border / divider | `COLORS.border` | `#2A2A2A` |
| Negative / error | `COLORS.error` | `#FF4444` |
| Warning | `COLORS.warning` | `#FFB800` |
| Black-on-accent text | `COLORS.textInverse` | `#000000` |

Typography: titles `TYPOGRAPHY.h2/h3`; tiny uppercase labels `TYPOGRAPHY.label` (9px, tracking 1.5);
amounts/numerics `TYPOGRAPHY.mono` / `monoLarge`; captions `TYPOGRAPHY.caption`.
Spacing `SPACING.*`, radii `RADII.*`. Progress-bar track height **6px**, radius `RADII.full`.
Status pill radius `RADII.full`. Card radius `RADII.lg` (16). Section gap `SPACING.xl` (24).

---

## 1. File manifest (all NEW unless marked EDIT)

### Data layer
| File | Kind | Responsibility |
|---|---|---|
| `apps/mobile/src/types/economy.ts` | CREATE (shared) | Wire types for vesting + fundraise + trade (see §6). Co-owned with D-trade/D-launch; **first writer creates, others import**. |
| `apps/mobile/src/hooks/useVesting.ts` | CREATE | `useVestingList(role)` (React Query) + `useVestingWithdraw()` (sign+confirm mutation). |
| `apps/mobile/src/lib/clientSign.ts` | CREATE (shared) | `signAndSubmit()` / `signAndSend()` Privy helpers (see §7.1). **Shared with D-trade — co-own.** |
| `apps/mobile/src/hooks/index.ts` | EDIT | Export `useVestingList`, `useVestingWithdraw`. |

### Vesting view + withdraw
| File | Kind | Responsibility |
|---|---|---|
| `apps/mobile/app/vesting.tsx` | CREATE | Route screen: header + role toggle + list of `VestingScheduleCard`. |
| `apps/mobile/src/components/features/VestingScheduleCard.tsx` | CREATE | One schedule row/card: amounts, progress, status, WITHDRAW CTA. |
| `apps/mobile/src/components/features/VestingWithdrawSheet.tsx` | CREATE | Bottom-sheet modal: review → sign → confirming → success/error. |
| `apps/mobile/src/components/features/VestingSkeleton.tsx` | CREATE | Loading skeleton matching card layout (mirror `WalletSkeleton`). |
| `apps/mobile/src/components/features/index.ts` | EDIT | Export the three components above. |

### Reusable components (also consumed by D-trade / D-launch / token-detail)
| File | Kind | Responsibility |
|---|---|---|
| `apps/mobile/src/components/composites/FundraiseProgress.tsx` | CREATE | Threshold bar + raised/target USD + contributor count + graduated state. |
| `apps/mobile/src/components/composites/FeeTaxDisclosure.tsx` | CREATE | ~1% in-app vs higher elsewhere + rebate explanation. Inline + expandable. |
| `apps/mobile/src/components/composites/VestingProgressBar.tsx` | CREATE | Low-level dual-segment (released/claimable/locked) bar reused by card + sheet. |
| `apps/mobile/src/components/composites/index.ts` | EDIT | Export the three composites + their prop types. |

### Entry-point edits (where these surfaces are reached from)
| File | Kind | Edit |
|---|---|---|
| `apps/mobile/src/components/features/ProfileDashboard.tsx` | EDIT | Add a "VESTING" menu/stat row → `router.push('/vesting')` (only render when `useVestingList` count > 0, or always for creators). |
| token-detail screen (D-trade, `app/token/[mint].tsx`) | COORDINATE | Render `<FundraiseProgress>` when `data.fundraise != null`, and `<FeeTaxDisclosure>` in the trade panel. Owned by D-trade; this doc supplies the components. |

---

## 2. Vesting view — screen `app/vesting.tsx`

Expo Router file-based: creating `app/vesting.tsx` auto-registers `/vesting` (no router file edit). Use a
stack header consistent with `app/wallet.tsx` (back chevron left, centered all-caps title "VESTING").

### 2.1 Layout (top → bottom)
1. **Header** — `COLORS.background`, hairline bottom border `COLORS.border`. Back button (Ionicons
   `chevron-back`, 24, `textPrimary`), centered title `TYPOGRAPHY.h3` "VESTING".
2. **Role toggle** — reuse `PillTabs` (composite) with two items: `RECIPIENT` (default) | `SENDER`.
   Drives the `?role=` query param. SENDER is read-only (no withdraw CTA).
3. **Summary strip** (optional, recipient only) — two inline `StatsCard`s: `CLAIMABLE NOW` (sum of
   `claimableBase` across rows, green) and `TOTAL VESTING` (sum of `totalBase`, neutral). Hidden when empty.
4. **List** — `FlatList` of `VestingScheduleCard`, `contentContainerStyle` padding `SPACING.lg`, gap
   `SPACING.md`. `keyExtractor = vestingId`.

### 2.2 States
- **Loading:** `<VestingSkeleton count={3} />`.
- **Empty:** centered, `COLORS.textSecondary`. Recipient copy: "NO VESTING SCHEDULES" + sub "Tokens vested
  to you will appear here." Sender copy: "YOU HAVEN'T CREATED ANY VESTING SCHEDULES." Icon Ionicons
  `time-outline` 40px `textTertiary`.
- **Error:** inline error card (mirror SwapModal `errorBanner`: red 8%-alpha bg, 20%-alpha border,
  `alert-circle`) + "RETRY" text button calling `refetch()`.
- **Pull-to-refresh:** `RefreshControl` tint `COLORS.primary`.
- **Pagination:** list is small (per user); no infinite scroll needed in 3B.

---

## 3. `VestingScheduleCard` — `components/features/VestingScheduleCard.tsx`

### 3.1 Props
```ts
export interface VestingScheduleCardProps {
  schedule: VestingRow;            // §6 wire type
  role: 'recipient' | 'sender';
  onWithdraw?: (s: VestingRow) => void;   // opens VestingWithdrawSheet; recipient only
}
```

### 3.2 Visual (card: `COLORS.surface`, `RADII.lg`, padding `SPACING.lg`, border `COLORS.border`)
- **Row 1 (header):** `$SYMBOL` (`TYPOGRAPHY.mono`, bold, white) on the left; **StatusPill** on the right.
  - StatusPill maps `VestingStatus` → label + color:
    - `ACTIVE` → "VESTING", `COLORS.primary` text on `COLORS.primaryMuted`.
    - `COMPLETED` → "FULLY VESTED", `textSecondary` on `backgroundTertiary`.
    - `CANCELLED` → "CANCELLED", `COLORS.error` on red 12%-alpha.
    - `PENDING` → "PENDING", `COLORS.warning` on warning 12%-alpha.
    - (Fallback: title-case the raw status, `textSecondary`.)
- **Row 2 (kind/cliff line):** `KIND • CLIFF {date}` small `TYPOGRAPHY.label` `textTertiary`. If pre-cliff
  (`now < cliffAt`), show "CLIFF IN {countdown}". If `kind==='lock'`, label reads "LOCK" not "VESTING".
- **Row 3 (`VestingProgressBar`):** see §5.3 — three segments: released (solid green), claimable (green
  60% alpha / striped), locked (track `COLORS.border`). Above the bar, right-aligned `releasedPct%`.
- **Row 4 (amounts grid, 3 inline `StatsCard`s):**
  `RELEASED` (withdrawn, neutral) · `CLAIMABLE` (green) · `LOCKED` (= total − withdrawn − claimable,
  textSecondary). Values formatted via `formatBaseUnits(base, decimals)` (§7.2) + ` $SYMBOL`.
- **Row 5 (CTA, recipient only):**
  - `claimableBase > 0` → filled green pill "WITHDRAW {amount} $SYMBOL", black text, `onWithdraw(schedule)`.
  - `claimableBase === 0 && status==='ACTIVE'` → disabled outlined pill "NOTHING TO WITHDRAW YET"
    (`opacity 0.4`, `textTertiary`).
  - `status==='COMPLETED' && withdrawn===total` → no CTA (or muted "FULLY WITHDRAWN" caption).
  - sender role → never renders a CTA.

### 3.3 Decimals source
The list row does **not** include `decimals`/`symbol`-decimals reliably for math display beyond what §d.8
returns (`symbol` yes, decimals no). **Decision:** request D-foundation/D-trade to ensure `decimals` is
present on the list row (add to wire type §6); until then, default to `9` (creator-token default) and
read `decimals` from a cached `GET /api/tokens/[mint]` if already in the React Query cache. Document the
assumption in code with a `TODO(contract)`.

---

## 4. Withdraw flow — `components/features/VestingWithdrawSheet.tsx`

Recipient-only. Triggered from `VestingScheduleCard.onWithdraw`. Presented as a `Modal`
(`presentationStyle="pageSheet"`, `animationType="slide"`) — same shell as `SwapModal`.

### 4.1 Props
```ts
export interface VestingWithdrawSheetProps {
  visible: boolean;
  schedule: VestingRow | null;
  onClose: () => void;
}
```

### 4.2 Step machine (drives the hook `useVestingWithdraw`, mirrors `useSwap` statuses)
`idle → building → signing → confirming → success | error`

1. **Review (idle):** restate `$SYMBOL`, "YOU WILL RECEIVE" = `formatBaseUnits(claimableBase)`, recipient
   wallet (truncated, mono), and a one-line note: "Tokens are sent to your wallet on Solana." Primary CTA
   "WITHDRAW" (green). Secondary "CANCEL".
   - Include a compact `<FeeTaxDisclosure variant="inline" context="vesting" />` — withdrawing a
     Token-2022 transfer-fee token incurs the on-chain transfer fee on the moved amount; the disclosure
     must say the **net received may be slightly less** than claimable due to the token's transfer fee
     (NOT a Momento fee). (Accuracy: vesting withdraw is not a Momento trade, so there is **no in-app
     rebate** here — see §8.)
2. **building:** call `POST /api/vesting/[id]/withdraw` (body `{}`) → `{ transaction, claimableBase }`.
   Spinner + "PREPARING WITHDRAWAL".
3. **signing:** decode base64 → `VersionedTransaction` → Privy provider `signAndSendTransaction`
   (see §7.1 — **withdraw has NO `/submit` endpoint**, so we sign-AND-send client-side, unlike trades).
   Copy: "APPROVE IN YOUR WALLET".
4. **confirming:** "CONFIRMING ON SOLANA" spinner.
5. **success:** green check circle (reuse SwapModal `successCircle`), "WITHDRAWAL SUBMITTED",
   subtitle amount + `$SYMBOL`, tappable signature card → `https://solscan.io/tx/{sig}` (use
   `CHAIN_CONFIG.solana.explorerUrl`), "DONE" CTA. On done: `queryClient.invalidateQueries(['vesting'])`.
6. **error:** red error banner with mapped message + "TRY AGAIN" (resets to idle/review).

### 4.3 Disabled / guards
- CTA disabled while `building|signing|confirming`.
- If `claimableBase === '0'` (race) → backend returns 400 "Nothing to withdraw"; surface as error banner
  and refetch list.
- Block `onClose` during `signing|confirming` (match SwapModal `handleClose`).

---

## 5. Reusable components

### 5.1 `FeeTaxDisclosure` — `components/composites/FeeTaxDisclosure.tsx`

Accurate, non-misleading statement of the fee model. Numbers come from `@momento/shared` constants — **never
hardcode**: in-app effective ≈ `MOMENTO_FEE.TARGET_IN_APP_BPS` (100 bps = ~1%); the token's transfer fee
elsewhere = the token's `transferFeeBps` (default `MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS` = 400 bps = ~4%).

```ts
export interface FeeTaxDisclosureProps {
  variant?: 'inline' | 'card' | 'expandable';   // default 'card'
  context?: 'trade' | 'vesting' | 'fundraise';   // tunes copy; default 'trade'
  transferFeeBps?: number;        // from token detail; default DEFAULT_TRANSFER_FEE_BPS
  effectiveInAppBps?: number;     // default TARGET_IN_APP_BPS (100)
  rebateBps?: number;             // = transferFeeBps - effectiveInAppBps, derived if omitted
  style?: ViewStyle;
}
```

**Copy (accurate — this is load-bearing, must match the on-chain reality):**
- Headline (trade): "≈1% EFFECTIVE FEE IN-APP".
- Body: "This token charges a {transferFeeBps/100}% transfer fee on every transaction, on Solana and
  everywhere it trades. When you trade inside Momento, you receive an automatic rebate that brings your
  **effective** fee down to about {effectiveInAppBps/100}%."
- Honesty guardrails (REQUIRED): the rebate is paid **after** the trade by a sweep (it is not instant),
  and the headline number is "effective/net," not the on-chain charge. Show a fine-print line:
  "Rebate is paid out by Momento after the transaction settles; the full transfer fee is charged on-chain
  first. Not financial or tax advice." Do **not** claim "no fee" or "free."
- vesting context: replace headline with "TRANSFER FEE APPLIES" and body: "This is a transfer-fee token.
  A {transferFeeBps/100}% fee is deducted on-chain when tokens move to your wallet. Momento does not charge
  a fee on withdrawals, and **no rebate applies to withdrawals**."
- fundraise context: "Contributions are in USDC; the {transferFeeBps/100}% transfer fee applies to the
  creator token, not your USDC contribution."

**Variants:**
- `inline` — single muted caption line (`textTertiary`) with an info icon; used inside review screens.
- `card` — `COLORS.surface` card, `RADII.md`, green left accent (3px `COLORS.primary`) + `pricetag`/`shield`
  icon, headline + body + fine print.
- `expandable` — collapsed shows headline + chevron; expands body + fine print. Default collapsed.

### 5.2 `FundraiseProgress` — `components/composites/FundraiseProgress.tsx`

Powered by the `fundraise` block of `GET /api/tokens/[mint]` (§d.2) and/or graduation `RaisedProgress`.

```ts
export interface FundraiseProgressProps {
  raisedBaseUnits: string;     // USDC base units
  thresholdBaseUnits: string;  // USDC base units (target)
  progressPct?: number;        // server-provided; else derived (clamped 0..100)
  quoteMint?: string;          // for label; default USDC
  quoteDecimals?: number;      // default 6 (USDC)
  contributorCount?: number;   // from RaisedProgress; optional
  status: 'DRAFT'|'ACTIVE'|'THRESHOLD_MET'|'FINALIZING'|'COMPLETED'|'FAILED'|'REFUNDED';
  graduatedAt?: number | null; // when set → graduated state
  compact?: boolean;           // dense single-bar variant for cards
  style?: ViewStyle;
}
```

**Visual:**
- **Label row:** left `TYPOGRAPHY.label` "FUNDRAISE" (or "GRADUATED" when graduated). Right `progressPct%`
  green mono.
- **Bar:** 6px track `COLORS.border`, fill `COLORS.primary`, width = `min(100, progressPct)%`,
  `RADII.full`. When `THRESHOLD_MET`/`COMPLETED`/graduated → fill is full + subtle `SHADOWS.glow`.
- **Stats row:** "$RAISED / $TARGET" using `formatUsd(base, decimals)` — raised in white mono, target in
  `textSecondary`. If `contributorCount != null`, right-aligned "{n} BACKERS" (`textSecondary`).
- **Status chip** (non-compact): maps status →
  `ACTIVE` "LIVE" green · `THRESHOLD_MET` "TARGET MET" green · `FINALIZING` "GRADUATING…" warning ·
  `COMPLETED`/graduated "GRADUATED" green-on-muted · `FAILED` "FAILED" red · `REFUNDED` "REFUNDED" red ·
  `DRAFT` "DRAFT" textTertiary.
- **Graduated state:** when `graduatedAt` set (token-detail returns `fundraise:null` post-grad), render the
  graduated banner instead of a live bar: "🟢 GRADUATED TO OPEN MARKET" + date. The token-detail screen
  passes a synthesized `status:'COMPLETED', progressPct:100` when `fundraise===null && graduatedAt!=null`.

**States:** `compact` = bar + inline `$raised/$target` only (for list cards). Loading is handled by the
parent (skeleton); component itself is pure/presentational. Guard divide-by-zero (threshold `0` → 0%).

### 5.3 `VestingProgressBar` — `components/composites/VestingProgressBar.tsx`

Low-level presentational bar shared by card + sheet.
```ts
export interface VestingProgressBarProps {
  totalBase: string; withdrawnBase: string; claimableBase: string;
  height?: number;     // default 6
  style?: ViewStyle;
}
```
Three stacked horizontal segments (flex widths from ratios): withdrawn = solid `COLORS.primary`;
claimable = `COLORS.primary` @ 0.5 alpha (visually "ready"); locked remainder = `COLORS.border`. All within
a `RADII.full` clipped container. Pure math on `bigint(String)` to avoid float drift; widths as `%`.

---

## 6. Wire types — `apps/mobile/src/types/economy.ts`

Mirror the API envelopes exactly (money = base-unit strings, unix seconds = number). **Shared file**; first
of {D-vesting, D-trade, D-launch} to land creates it, others extend (see §7).

```ts
export type VestingStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type VestingRole = 'recipient' | 'sender';

export interface VestingRow {            // GET /api/vesting/list item (§d.8)
  vestingId: string;
  mint: string;
  symbol: string;
  role: VestingRole;
  totalBase: string;
  withdrawnBase: string;
  claimableBase: string;
  cliffAt: number;                       // unix seconds
  endAt: number;                         // unix seconds
  status: VestingStatus;
  kind?: 'vesting' | 'lock';             // TODO(contract): confirm present; default 'vesting'
  decimals?: number;                     // TODO(contract): request on list row; default 9
}

export interface VestingWithdrawResponse {   // POST /api/vesting/[id]/withdraw (§d.9)
  transaction: string;                   // base64 unsigned
  claimableBase: string;
}

export type FundraiseStatus =
  | 'DRAFT' | 'ACTIVE' | 'THRESHOLD_MET' | 'FINALIZING'
  | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface FundraiseBlock {        // GET /api/tokens/[mint] .fundraise (§d.2)
  status: string;
  raisedBaseUnits: string;
  thresholdBaseUnits: string;
  progressPct: number;
  quoteMint: string;
}
```

---

## 7. Cross-cutting decisions (other designers MUST align)

### 7.1 Shared Privy client-sign helper — `apps/mobile/src/lib/clientSign.ts` (CO-OWNED with D-trade)
Two distinct flows exist; **the helper must expose both**:
- **`signAndSubmit(unsignedB64, submitFn)`** — for TRADES: client signs to bytes, then calls the matching
  `.../buy|sell/submit` endpoint with the signed base64 + `intentId` + `idempotencyKey` (per §d.4). Used by
  D-trade `useTrade`.
- **`signAndSend(unsignedB64)`** — for VESTING WITHDRAW: there is **NO submit endpoint** (§d.9 returns only
  `{transaction, claimableBase}`), so the app signs AND sends via Privy provider `signAndSendTransaction`
  (exactly like `useSwap.executeSwap`) and returns the signature.
Both reuse the `base64ToUint8Array` + `VersionedTransaction.deserialize` + `getWalletProvider()` pattern
from `useSwap.ts`. **D-trade and this doc must not each define their own copy** — first to land writes it.

### 7.2 Shared formatters (CO-OWNED, propose `apps/mobile/src/lib/format.ts`)
`formatBaseUnits(base: string, decimals: number, maxFrac?)` and `formatUsd(base: string, decimals=6)`
(USDC). D-trade needs identical formatting; consolidate to avoid drift. If a shared util already lands in
D-trade, import it. Use `bigint` math, never `parseInt` on large supplies.

### 7.3 Reusable component ownership
`FundraiseProgress`, `FeeTaxDisclosure`, `VestingProgressBar` are authored HERE (composites). D-trade
(token-detail/trade panel) and D-launch (wizard preview) **import** them — do not fork. D-trade renders
`<FeeTaxDisclosure context="trade">` in the buy/sell panel and `<FundraiseProgress>` above the chart when
`fundraise != null`. Coordinate prop names against §5.

### 7.4 Entry points to edit
- `ProfileDashboard.tsx` — add the "VESTING" nav row (→ `/vesting`).
- token-detail screen (D-trade-owned) — mount the two reusable components.
- `app/_layout.tsx` — verify `/vesting` inherits the dark stack header style (likely no edit needed since
  options are per-screen via `Stack.Screen`); if a global `headerShown:false` is set, `app/vesting.tsx`
  renders its own header (preferred, matches `wallet.tsx`).

### 7.5 React Query keys (namespace to avoid collisions)
`['vesting','list', userId, role]` for the list; invalidate `['vesting']` (prefix) after any successful
withdraw. Fundraise data piggybacks on D-trade's `['token', mint]` key — no separate fetch here.

---

## 8. Accuracy / compliance notes (do not deviate)
- **Withdraws are not Momento trades** → **no in-app rebate** on vesting withdraw; the only deduction is the
  token's on-chain Token-2022 transfer fee. `FeeTaxDisclosure context="vesting"` must say this plainly.
- The "≈1%" claim is **effective/net after rebate**, and the rebate is **paid after settlement by a sweep**
  (`runRebateSweep`, gated by `REBATE_*` env). Never present it as instant or as "no fee."
- All disclosure numbers derive from `@momento/shared` constants / token-detail `transferFeeBps` so copy
  stays correct if defaults change.
- "Not financial or tax advice." fine print on every `FeeTaxDisclosure` card/expandable variant.

---

## 9. Accessibility & polish
- Min touch target 44px on CTAs/back/role-toggle; `hitSlop` on icon buttons.
- Progress bars: add `accessibilityRole="progressbar"` + `accessibilityValue={{ now, min:0, max:100 }}`.
- Status pills + amounts get `accessibilityLabel` combining label+value (e.g. "Claimable 3,000 DEEL").
- Respect safe-area insets (`useSafeAreaInsets`) on the screen + sheet (match `SwapModal`).
- All text uppercase via `TYPOGRAPHY` variants; numerics use mono family for column alignment.
- Disabled/loading/empty/error states specified per component above — implement all four.
