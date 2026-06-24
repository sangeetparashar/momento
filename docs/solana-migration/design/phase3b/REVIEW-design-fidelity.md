# Phase 3B — Mobile UI Design-Fidelity Review

Adversarial static review of the Phase 3B working-tree UI (apps/mobile) against the
mandatory design system: `docs/design/DESIGN_REFERENCE.md`, `docs/DESIGN_SYSTEM.md`,
the Figma exports in `docs/design/screens/`, and the established app primitives /
composites / tokens.

Scope: token detail/trade screens, launch wizard (6 steps + layout), vesting
list/create + withdraw sheet, all new composites/features/primitives, and the
modified `creator/[id].tsx`, `market.tsx`, `(tabs)/profile.tsx`, `ProfileDashboard.tsx`.

**Verdict:** Overall fidelity is HIGH. New code consistently uses `COLORS`/`SPACING`/
`RADII` tokens (pure-black bg `#000`, surface `#1A1A1A`, accent `#00FF88`, border
`#2A2A2A`), the `Text` variants, and reuses `Button`/`PillButton`/`BuySellPills`/
`StatsCard`/`PillTabs`/`Skeleton`/`Card`. No hardcoded off-brand hex other than the
already-sanctioned semantic-with-alpha overlays (red/amber/green tints) that mirror
existing components. The verified badge is the correct 8px solid-green circle.
Findings below are mostly polish / consistency, not brand violations.

Counts: **P0: 0 · P1: 2 · P2: 7**

---

## P1

### P1-1 — TOKEN tab "24H CHANGE" stat is permanently blank ("—"), contradicting the Figma
- **Files:**
  - `apps/mobile/app/token/[mint].tsx:100-105`
  - `apps/mobile/app/creator/[id].tsx` (TOKEN tab, `<TokenStatRow priceUsd … marketCapUsd … />`)
  - `apps/mobile/src/components/composites/TokenStatRow.tsx:34-54`
- **Problem:** The Figma `creator-token.png` shows three prominent stats: **PRICE /
  24H CHANGE / MARKET CAP**, with 24H CHANGE rendered as a large green `17%` — it is a
  focal point of the screen. `TokenStatRow` supports a `change24hPct` prop, but BOTH
  call sites omit it, so the middle cell always renders the em-dash fallback (`'—'`,
  `valueColor='neutral'`). The data isn't available either: `TokenDetailResponse`
  (`tokenApi.types.ts:16-46`) has `priceUsd` and `marketCapUsd` but **no 24h change
  field**. Net result: the hero 3-up row ships with a dead center column on every
  token, a visible regression from the mockup (the OLD creator screen at least showed
  a placeholder `17%`).
- **Fix:** Either (a) wire a real change value — add `change24hPct` to the backend
  contract / detail response and pass it through both screens; or (b) if the value is
  genuinely unavailable for launch, drop the 24H cell to a 2-up PRICE / MKT CAP row
  (and note the deviation) rather than shipping a permanently empty stat. Do not ship
  a focal stat stuck on "—".

### P1-2 — Token "$SYMBOL" hero uses system mono (Menlo/Roboto), not the brand display font
- **Files:**
  - `apps/mobile/app/token/[mint].tsx:217-223` (`hero` → `...TYPOGRAPHY.monoLarge`)
  - `apps/mobile/app/creator/[id].tsx:620-626` (`tokenHero` → `...TYPOGRAPHY.monoLarge`)
- **Problem:** The `$DEEL` ticker hero in `creator-token.png` is heavy **Space Mono
  Bold** (the app's `FONT_FAMILY_DISPLAY_BOLD`), matching every other large heading.
  `TYPOGRAPHY.monoLarge` resolves to `FONT_FAMILY_MONO` = Menlo (iOS) / `monospace`
  (Android) — a different typeface from the rest of the app's all-caps display text.
  The largest, most brand-defining element on the token screen therefore renders in
  the wrong font family. (creator/[id] is pre-existing, but token/[mint].tsx is new
  and copies the same mistake — both should match the design.) It is also not
  uppercased via `textTransform` (relies on the symbol already being caps).
- **Fix:** Base the hero on `TYPOGRAPHY.h2`/`h1` (which use `FONT_FAMILY_DISPLAY_BOLD`)
  or explicitly set `fontFamily: FONT_FAMILY_DISPLAY_BOLD` + `textTransform:'uppercase'`,
  keeping the 32–36px size. Apply to both files for parity.

---

## P2

### P2-1 — Stat labels abbreviated vs. the mockup ("24H" / "MKT CAP" vs "24H CHANGE" / "MARKET CAP")
- **File:** `apps/mobile/src/components/composites/TokenStatRow.tsx:42-61`
- **Problem:** Figma labels are `PRICE` / `24H CHANGE` / `MARKET CAP`. The component
  hardcodes `PRICE` / `24H` / `MKT CAP`. Minor, but it diverges from the reference and
  from the old screen's wording.
- **Fix:** Use `24H CHANGE` and `MARKET CAP` (the inline `StatsCard` label sizes them
  fine; if width is tight, that's a layout tweak, not a copy change).

### P2-2 — TradePanel reimplements the CTA button instead of reusing the `Button` primitive
- **File:** `apps/mobile/src/components/features/TradePanel.tsx:362-374, 562-589`
- **Problem:** The buy/sell CTA is a bespoke `Pressable` with its own
  `cta/ctaBuy/ctaSell/ctaText` styles. The green BUY case duplicates exactly what
  `Button variant="primary"` already provides (primary bg, inverse text, RADII.md,
  letter-spacing). Only the white-bg SELL state needs custom color. Hand-rolling the
  whole control risks drift (e.g. it has no pressed-state feedback, unlike `Button`).
- **Fix:** Use `Button` for the BUY path; for SELL either add a variant or pass a
  style override, keeping a single source of button styling/press behavior.

### P2-3 — `manageRow` border uses string-concat alpha (`COLORS.primary + '30'`) instead of a token
- **File:** `apps/mobile/src/components/features/ProfileDashboard.tsx:448` (and the
  pre-existing `creatorCta` at :563, `creatorCtaIcon` at :571)
- **Problem:** `COLORS.primary + '30'` (`#00FF8830`) is an ad-hoc translucent green.
  The theme already exposes `COLORS.primaryMuted` (`rgba(0,255,136,0.15)`) for exactly
  this "subtle green outline/fill" use; `LaunchTokenCta` correctly uses a solid
  `COLORS.primary` border + `primaryMuted` icon bg. Mixing `+ '30'` hex math is an
  inconsistent pattern and harder to keep on-brand.
- **Fix:** Use `COLORS.primaryMuted` (or a named token) for these borders/fills so the
  green-tint surfaces are consistent across launch CTA / manage row / creator CTA.

### P2-4 — Vesting/profile entry rows are inconsistent in look with `LaunchTokenCta`
- **Files:** `apps/mobile/src/components/features/ProfileDashboard.tsx:226-236`
  (`entryRow` VESTING), `:207-218` (`manageRow`) vs `features/LaunchTokenCta.tsx`
- **Problem:** Three sibling entry affordances on the same dashboard use three
  different treatments: `LaunchTokenCta` (icon chip + title `h3` + caption + green
  border), `manageRow` (small icon + single `label` + green-30 border), `entryRow`
  (small icon + single `label` + grey border). They read as unrelated components even
  though they're the same "navigate to a token feature" row.
- **Fix:** Align the three on one row pattern (same icon size, same border token, same
  text variant). Cheap consistency win on the most-seen screen.

### P2-5 — Per-screen header back buttons are reimplemented inconsistently
- **Files:** `app/token/[mint].tsx:53-61` & `app/token/[mint]/trade.tsx:40-55`
  (`backBtn` 40×40, centered) vs `app/vesting.tsx:112-120` & `app/vesting/create.tsx`
  (`backBtn` width:32, left-aligned) vs `app/launch/_layout.tsx:42-61` (40×40)
- **Problem:** Header height, back-hit-area, and title alignment differ between the
  new screens (some center the title with two 40px spacers, some use a 32px spacer).
  No shared header primitive is used, so the chrome subtly shifts as the user moves
  between Phase 3B screens. Not off-brand, but inconsistent.
- **Fix:** Extract a small shared `ScreenHeader` (back chevron + centered title +
  optional right slot) and use it across token/trade/vesting/launch, or at minimum
  standardize the back-button box (40×40) and title alignment.

### P2-6 — `result.tsx` title `LAUNCHED` is defined in the layout but never rendered
- **Files:** `app/launch/_layout.tsx:27` (`result: 'LAUNCHED'`) +
  `app/launch/result.tsx:80-94`
- **Problem:** The layout maps the `result` segment to title `LAUNCHED`, but the result
  screen renders its own full-bleed hero (`$SYMBOL IS LIVE`) and the layout suppresses
  the back button for `result` — so the `LAUNCHED` header title is dead config and the
  terminal screen has no top chrome at all (the centered `h2` hero stands alone).
  Harmless, but it signals the header contract for the terminal step is muddled.
- **Fix:** Remove the unused `result` title entry (or intentionally render a minimal
  header). Confirm the terminal screen's top spacing reads correctly without the
  layout title.

### P2-7 — Launch intro copy is forced ALL-CAPS via `variant="label"` on long sentences
- **Files:** `app/launch/index.tsx:106-108`, `app/launch/fees.tsx:41-44`,
  `app/launch/fundraise.tsx:42-45`, `app/launch/vesting.tsx:46-49`,
  `app/vesting/create.tsx:196-199`
- **Problem:** Multi-line instructional sentences use `Text variant="label"`, which is
  `FONT_FAMILY_DISPLAY_BOLD` + `textTransform:'uppercase'` + tracking. The design uses
  all-caps for LABELS/headers, but long body sentences set entirely in bold tracked
  caps hurt readability and aren't how the mockups present descriptive copy (bio/body
  is sentence-case `#888`). `create.tsx` even has `VEST OR LOCK $ {symbol}` rendering a
  stray space before the symbol.
- **Fix:** Use `variant="bodySmall"`/`caption` (`#888`, sentence case) for descriptive
  intro paragraphs; reserve `label` for true section headers. Fix the `$ {symbol}`
  spacing in `create.tsx:197`.

---

## Notes (verified GOOD — no action)

- `FeeDisclosure`, `FundraiseProgress`, `PercentSlider`, `VestingProgressBar`,
  `TokenStatRow`, `FormField`, `TradeStatusSheet`, `VestingWithdrawSheet`,
  `VestingScheduleCard`, `RecentTradesList`, `TradeScreenSkeleton`, `VestingSkeleton`,
  `StepProgress`, `AllocationSliders`, `ReviewRow` all use design tokens, correct
  border/surface colors, all-caps `label`/`h3` headers, and the shared `Skeleton`.
- `TradePanel` mirrors `TokenSwapWidget` (you-pay / arrow / you-receive cards) and
  `TradeStatusSheet`/`VestingWithdrawSheet` mirror `SwapModal`'s success/error states
  — good pattern reuse. The amount input correctly uses `TYPOGRAPHY.h2` (display bold).
- `market.tsx` and `(tabs)/profile.tsx` changes are navigation-only (no visual delta);
  removing `ComingSoonModal` in favor of real routes is correct.
- Loading / error / empty / disabled states are present on every new screen
  (skeletons, RETRY buttons, NO TRADES / NO VESTING empties, gated CTAs).
- Verified badge (`token/[mint].tsx:287-292`) is the spec-correct 8px solid-green dot.
