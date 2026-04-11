# Momento Mobile — Build Specification

> **Audience:** Coding agents and human developers picking this up.
> **Author:** Design agent, after analyzing all 20 Figma screen exports and all current source code.
> **Rule:** Do NOT delete any existing code. Build new components alongside existing ones. Pages will import the new components and swap them in. Old code gets removed only after human verification on-device.

---

## Table of Contents

1. [Project Context](#1-project-context)
2. [File Structure](#2-file-structure)
3. [Design Token Reference](#3-design-token-reference)
4. [Phase 1: Composite Components](#4-phase-1-composite-components)
   - 1A. PillTabs
   - 1B. StatsCard
   - 1C. BuySellPills
   - 1D. PerformanceChart
   - 1E. PortfolioRow
   - 1F. PortfolioTable
   - 1G. TokenSwapWidget
5. [Phase 2: Page Integration](#5-phase-2-page-integration)
   - 2A. Creator Detail Header (PillTabs swap)
   - 2B. Home Feed Header (PillTabs swap)
   - 2C. Token Tab Rebuild
   - 2D. Profile Page Rebuild
   - 2E. Market Page Rebuild

---

## 1. Project Context

### Codebase Location
```
/home/sangeet/code/momento/apps/mobile/
```

### Existing Primitives You MUST Use
These already exist at `src/components/primitives/`. Do NOT rebuild them. Import them:

| Component | Import | Use For |
|-----------|--------|---------|
| `Text` | `@/components/primitives` | All text. Accepts `variant` (h1/h2/h3/body/bodySmall/caption/label/mono/monoLarge) and `color` (any key from COLORS). |
| `AnimatedPressable` | `@/components/primitives` | Any tappable element that should spring-scale on press (0.97 default). |
| `Card` | `@/components/primitives` | Dark surface containers. `variant="flat"` = border, `variant="elevated"` = shadow. Bg is `COLORS.surface`, radius is `RADII.md` (12px), padding is `SPACING.lg` (16px). |
| `Button` | `@/components/primitives` | Action buttons. Variants: primary (green bg), secondary (green border), ghost (transparent). |
| `Avatar` | `@/components/primitives` | Profile images with fallback initials. Sizes: xs/sm/md/lg/xl. |

### Existing Design Tokens You MUST Use
These already exist. Import from `@/styles/theme` and `@/styles/typography`:

```typescript
// @/styles/theme
COLORS.background       // #000000
COLORS.surface           // #1A1A1A
COLORS.surfaceElevated   // #242424
COLORS.primary           // #00FF88
COLORS.textPrimary       // #FFFFFF
COLORS.textSecondary     // #888888
COLORS.textTertiary      // #555555
COLORS.textInverse       // #000000
COLORS.border            // #2A2A2A
COLORS.error             // #FF4444 (also COLORS.marketRed)
COLORS.marketGreen       // #00FF88
SPACING.xs               // 4
SPACING.sm               // 8
SPACING.md               // 12
SPACING.lg               // 16
SPACING.xl               // 24
RADII.full               // 9999  (pill shapes)
RADII.md                 // 12    (cards, charts)
RADII.sm                 // 8

// @/styles/typography
TYPOGRAPHY.label         // 12px, 600 weight, uppercase, 1.5 letter-spacing, textTertiary
TYPOGRAPHY.caption       // 12px, 400, 0.5 letter-spacing, textSecondary
TYPOGRAPHY.body          // 16px, 400
TYPOGRAPHY.bodySmall     // 14px, 400, textSecondary
TYPOGRAPHY.h2            // 24px, 700, uppercase, 1 letter-spacing
TYPOGRAPHY.monoLarge     // 24px, 700

// Font families
FONT_FAMILY_DISPLAY      // 'SpaceMono-Regular'
FONT_FAMILY_DISPLAY_BOLD // 'SpaceMono-Bold'
```

### Figma Screen Reference
All at `docs/design/screens/`. When the spec says "see screen X" — open that PNG and match it pixel-for-pixel.

---

## 2. File Structure

Create this new directory and these files:

```
apps/mobile/src/components/composites/
├── PillTabs.tsx
├── StatsCard.tsx
├── BuySellPills.tsx
├── PerformanceChart.tsx
├── PortfolioRow.tsx
├── PortfolioTable.tsx
├── TokenSwapWidget.tsx
└── index.ts
```

The barrel `index.ts` should export all components:
```typescript
export { PillTabs } from './PillTabs';
export { StatsCard } from './StatsCard';
export { BuySellPills } from './BuySellPills';
export { PerformanceChart } from './PerformanceChart';
export { PortfolioRow } from './PortfolioRow';
export { PortfolioTable } from './PortfolioTable';
export { TokenSwapWidget } from './TokenSwapWidget';
```

Also update `src/components/index.ts` to re-export:
```typescript
export * from './composites';
```

---

## 3. Design Token Reference

These values are extracted directly from the Figma screenshots. When in doubt, the Figma PNG is truth.

### The PillTabs Pattern (the single most important pattern)

Look at these screens to see PillTabs in action:
- `creator-token.png` → top of screen: `PROFILE | POSTS | TOKEN`
- `creator-account-1.png` → top of screen: `EDIT PROFILE | NEW POST | ACCOUNT`
- `market.png` → middle: `TRENDING | 24H GAINERS | TOP CREATORS`
- `home-feed.png` → top: `FOR YOU | CREATORS TO WATCH` (this is a different style — plain text, not pill container)

**Observation from Figma:** The pills on `creator-token.png` and `creator-account-1.png` sit inside a dark rounded container. The active tab has a slightly lighter background and a subtle border. The inactive tabs are dim gray text with no background. The container itself has fully-rounded ends (9999px radius). The whole thing looks like a single capsule with segments.

### Color Values From Figma (verified against screenshots)

| Element | Color | Token |
|---------|-------|-------|
| Pill container background | `#1A1A1A` | `COLORS.surface` |
| Active pill background | `#242424` | `COLORS.surfaceElevated` |
| Active pill border | `#2A2A2A` | `COLORS.border` |
| Active pill text | `#FFFFFF` | `COLORS.textPrimary` |
| Inactive pill text | `#888888` | `COLORS.textSecondary` |
| Stats value (green numbers) | `#00FF88` | `COLORS.primary` |
| Negative value (red numbers) | `#FF4444` | `COLORS.error` |
| Chart line | `#00FF88` | `COLORS.primary` |
| BUY button border | `#888888` | `COLORS.textSecondary` |
| SELL button fill | `#FFFFFF` | `COLORS.textPrimary` |
| SELL button text | `#000000` | `COLORS.textInverse` |
| Chart month labels | `#555555` | `COLORS.textTertiary` |

---

## 4. Phase 1: Composite Components

---

### 1A. PillTabs

**Reference screens:** `creator-token.png`, `creator-account-1.png`, `market.png`

**WHY this component exists:** Tabs appear on 5+ screens, each hand-coded differently. The creator detail page uses inline `Pressable` + `Text` with style arrays (see `creator/[id].tsx` lines 355–377). The home feed uses a completely different inline implementation (see `home.tsx` lines 289–309). The market page has yet another. All of these should be one component with the same visual treatment.

#### Props Interface

```typescript
interface PillTabItem {
  key: string;
  label: string;
}

interface PillTabsProps {
  /** Array of tab items with unique keys and display labels. */
  tabs: PillTabItem[];
  /** Currently active tab key. */
  activeTab: string;
  /** Callback when a tab is pressed. Receives the tab key. */
  onTabChange: (key: string) => void;
  /**
   * Size variant.
   * - 'md' (default): Standard page navigation. 11px text, 8px vertical padding.
   * - 'sm': Time range selectors. 10px text, 6px vertical padding.
   */
  size?: 'sm' | 'md';
  /** Optional style override for the outer container. */
  style?: ViewStyle;
}
```

#### Visual Specification

**Outer container:**
- `flexDirection: 'row'`
- `backgroundColor: COLORS.surface` (#1A1A1A)
- `borderRadius: RADII.full` (9999 — fully rounded capsule)
- `padding: 3` (exactly 3px — this creates the thin dark border around the active pill)
- Self-sizing: width is determined by content. The container does NOT stretch to fill its parent unless the consumer passes `style={{ flex: 1 }}` or a width.

**Each tab button:**
- `flex: 1` — tabs share equal width within the container. This is visible in the Figma: PROFILE/POSTS/TOKEN are equal-width segments.
- `paddingVertical: 8` (md) or `6` (sm)
- `paddingHorizontal: 12`
- `borderRadius: RADII.full` (9999 — each pill is fully rounded)
- `alignItems: 'center'`, `justifyContent: 'center'`
- Text: `fontFamily: FONT_FAMILY_DISPLAY_BOLD`, `textTransform: 'uppercase'`, `letterSpacing: 1.2`
- Text size: `11` (md) or `10` (sm)

**Inactive tab:**
- `backgroundColor: 'transparent'`
- `borderWidth: 0`
- Text `color: COLORS.textSecondary` (#888888)

**Active tab:**
- `backgroundColor: COLORS.surfaceElevated` (#242424)
- `borderWidth: 1`, `borderColor: COLORS.border` (#2A2A2A)
- Text `color: COLORS.textPrimary` (#FFFFFF)

**Press feedback:**
- Wrap each tab in `AnimatedPressable` with `scaleValue={0.95}` for a subtle press-down feel.

**Accessibility:**
- Each tab should have `accessibilityRole="tab"` and `accessibilityState={{ selected: isActive }}`.

#### Implementation Notes

- Do NOT use `LayoutAnimation` for tab switching — it causes jank with sibling views on Android. Just swap styles instantly.
- The container must be scrollable ONLY if there are more than 4 tabs. For 2-3 tabs (the common case), it should be a fixed-width row. For now, assume max 5 tabs — no scroll needed.
- The component is purely presentational — it does not manage state. The parent owns `activeTab` and `onTabChange`.

#### Test Checklist
- [ ] 2 tabs (FOR YOU / CREATORS TO WATCH) — renders correctly, no overflow
- [ ] 3 tabs (PROFILE / POSTS / TOKEN) — equal widths, active tab highlighted
- [ ] 5 tabs (24H / 7D / 1M / 3M / 1Y) at `sm` size — compact, fits comfortably
- [ ] Pressing a tab calls `onTabChange` with the correct key
- [ ] Active tab has visibly lighter background (#242424) than container (#1A1A1A)
- [ ] Text is uppercase Space Mono Bold throughout

---

### 1B. StatsCard

**Reference screens:** `user-account-1.png` (paired cards: "24H CHANGE 0.9%" and "EARNINGS TO DATE 12.2K"), `creator-token.png` (inline row: PRICE / 24H CHANGE / MARKET CAP)

**WHY this component exists:** The profile page needs paired dark cards showing portfolio metrics. The token page needs a 3-across inline stats row. Both show a tiny label on top and a large green value below. Currently the token tab has this inline (lines 315–328 in `creator/[id].tsx`) with placeholder "—" values, and the profile page has nothing like this at all (it shows follower counts instead). We need one component that handles both layouts.

#### Props Interface

```typescript
interface StatsCardProps {
  /** Tiny uppercase label above the value. e.g. "24H CHANGE" */
  label: string;
  /** The display value. e.g. "0.9%", "12.2K", "0.004" */
  value: string;
  /**
   * Layout variant:
   * - 'card': Dark surface background box. Used in pairs on the profile page.
   * - 'inline': No background, just centered text. Used in the 3-across row on the token page.
   */
  variant?: 'card' | 'inline';
  /**
   * Value color:
   * - 'positive' (default): COLORS.primary (#00FF88)
   * - 'negative': COLORS.error (#FF4444)
   * - 'neutral': COLORS.textPrimary (#FFFFFF)
   */
  valueColor?: 'positive' | 'negative' | 'neutral';
  /** Optional style override for the outer container. */
  style?: ViewStyle;
}
```

#### Visual Specification

**Card variant** (see `user-account-1.png` — the two dark boxes below "WALLET"):
- Container: `backgroundColor: COLORS.surface` (#1A1A1A), `borderRadius: RADII.md` (12px), `padding: 14px vertical, 16px horizontal`
- No border (the card blends with the dark bg — the slight contrast between #1A1A1A and #000000 is the visual separation)
- Label: `fontSize: 9`, `fontWeight: '700'`, `textTransform: 'uppercase'`, `letterSpacing: 1.5`, `color: COLORS.textTertiary` (#555555), `fontFamily: FONT_FAMILY_DISPLAY_BOLD`
- Gap between label and value: `8px` (`marginTop: SPACING.sm`)
- Value: `fontSize: 22`, `fontWeight: '700'`, `color: COLORS.primary` (#00FF88), `fontFamily: FONT_FAMILY_DISPLAY_BOLD`

**Inline variant** (see `creator-token.png` — the PRICE / 24H CHANGE / MARKET CAP row):
- Container: `backgroundColor: 'transparent'`, no border, no padding
- `alignItems: 'center'` (text is centered within each column)
- Label: same as card variant
- Value: `fontSize: 16` (slightly smaller than card variant), same font/weight/color

#### Implementation Notes

- The component renders just one stat. The parent arranges multiple `StatsCard` components in a row using `flexDirection: 'row'` and `gap`.
- For the profile page paired layout: parent wraps two `StatsCard variant="card"` in a `View` with `flexDirection: 'row'`, `gap: 12`, and each card gets `flex: 1`.
- For the token page inline layout: parent wraps three `StatsCard variant="inline"` in a `View` with `flexDirection: 'row'`, `justifyContent: 'space-between'`, and each gets `flex: 1`.

---

### 1C. BuySellPills

**Reference screen:** `creator-token.png` — the BUY and SELL buttons below "$DEEL"

**WHY this component exists:** The token page has BUY/SELL buttons that are currently inline-styled Pressables (lines 299–311 in `creator/[id].tsx`). The current implementation is close to correct but uses `flex: 1` making them stretch full-width. The Figma shows them as compact centered pills with specific outlined/filled treatment. This component also needs to be reusable on the Market page expanded rows eventually.

#### Props Interface

```typescript
interface BuySellPillsProps {
  /** Called when BUY is pressed. */
  onBuy: () => void;
  /** Called when SELL is pressed. */
  onSell: () => void;
  /** Disables both buttons (e.g. during loading). */
  disabled?: boolean;
  /** Optional style for the outer row container. */
  style?: ViewStyle;
}
```

#### Visual Specification

Look at `creator-token.png` very carefully:

**Outer row:**
- `flexDirection: 'row'`
- `justifyContent: 'center'`
- `gap: 12` (`SPACING.md`)

**BUY pill (outlined / ghost):**
- `backgroundColor: 'transparent'`
- `borderWidth: 1`
- `borderColor: COLORS.textSecondary` (#888888) — NOT white, NOT green. In the Figma, the BUY border is a medium gray.
- `borderRadius: RADII.full` (9999 — fully rounded)
- `paddingVertical: 10`, `paddingHorizontal: 36`
- Text: `color: COLORS.textPrimary` (#FFFFFF), `fontSize: 12`, `fontWeight: '700'`, `textTransform: 'uppercase'`, `letterSpacing: 1.5`, `fontFamily: FONT_FAMILY_DISPLAY_BOLD`

**SELL pill (filled):**
- `backgroundColor: COLORS.textPrimary` (#FFFFFF)
- `borderWidth: 1`, `borderColor: COLORS.textPrimary` (#FFFFFF) — matches fill, so the border is invisible but keeps sizing consistent with BUY
- `borderRadius: RADII.full` (9999)
- Same padding as BUY
- Text: `color: COLORS.textInverse` (#000000), same font specs

**Press feedback:**
- Wrap each pill in `AnimatedPressable` with `scaleValue={0.95}`.
- On press, BUY border lightens to `COLORS.textPrimary` (#FFFFFF). Use Pressable's `({ pressed }) =>` style callback.
- On press, SELL background dims to `#DDDDDD`.

**Disabled state:**
- Entire row: `opacity: 0.4`

#### Implementation Notes

- The two pills are NOT `flex: 1`. They are auto-width based on text content + padding. This means "BUY" will be slightly narrower than "SELL" if using the same padding, which is correct per the Figma.
- Actually, looking at the Figma more carefully, BUY and SELL appear to be the same width. Use `minWidth: 100` on each to ensure they stay visually balanced.

---

### 1D. PerformanceChart

**Reference screens:** `creator-token.png` (TOKEN PERFORMANCE), `user-account-1.png` (PORTFOLIO PERFORMANCE)

**WHY this component exists:** Both the token page and the profile page show a green line chart with month labels and a time-range selector below. The current token tab has a placeholder "Coming Soon" gray box (lines 330–335 in `creator/[id].tsx`). The current profile page has no chart at all. This is a net-new component.

#### Props Interface

```typescript
interface ChartDataPoint {
  /** X position (0-1 normalized, or timestamp). */
  x: number;
  /** Y value (price, portfolio value, etc.). */
  y: number;
}

interface PerformanceChartProps {
  /** Section title above the chart. e.g. "TOKEN PERFORMANCE" */
  title: string;
  /** Chart data points. Minimum 2 points. */
  data: ChartDataPoint[];
  /** Currently selected time range. */
  timeRange: string;
  /** Callback when time range changes. */
  onTimeRangeChange: (range: string) => void;
  /** Available time ranges. Defaults to ['24H', '7D', '1M', '3M', '1Y']. */
  timeRanges?: string[];
  /** Chart height in px. Default 160. */
  height?: number;
  /** Optional style override. */
  style?: ViewStyle;
}
```

#### Visual Specification

Look at `creator-token.png` — the chart section:

**Title:**
- Text using `TYPOGRAPHY.label` style but with these overrides: `fontSize: 11`, `color: COLORS.textSecondary` (#888888), `letterSpacing: 1.5`
- `marginBottom: 16` below the title before the chart area

**Chart area:**
- `height: 160` (default, configurable via prop)
- `width: '100%'`
- `borderBottomWidth: 1`, `borderBottomColor: COLORS.border` (#2A2A2A) — thin line at the base of the chart

**Chart line:**
- Rendered with `react-native-svg` (`Svg`, `Polyline`, `Defs`, `LinearGradient`, `Stop`, `Polygon`). This dependency already exists in the project (check `package.json` — it's used by other RN packages).
- Line: `stroke: COLORS.primary` (#00FF88), `strokeWidth: 2.5`, `strokeLinejoin: 'round'`, `fill: 'none'`
- Fill area below line: `LinearGradient` from `COLORS.primary` at `stopOpacity={0.12}` (top) to `stopOpacity={0}` (bottom). This creates the subtle green glow beneath the line visible in the Figma.
- The line should be a smooth `Polyline` connecting the data points. No curve interpolation needed — straight segments between points (matching the Figma which shows angular connections, not bezier curves).

**Fallback if no data:**
- Show the chart area with a dashed horizontal line at the vertical midpoint: `strokeDasharray="4,4"`, `stroke: COLORS.border`, `strokeWidth: 1`
- Center text: "NO DATA" using `TYPOGRAPHY.caption`, `color: COLORS.textTertiary`

**Month labels** (below the chart baseline):
- Row of 12 labels: JAN, FEB, MAR, APR, MAY, JUN, JUL, AUG, SEP, OCT, NOV, DEC
- `flexDirection: 'row'`, `justifyContent: 'space-between'`
- Each label: `fontSize: 7`, `textTransform: 'uppercase'`, `letterSpacing: 0.5`, `color: COLORS.textTertiary` (#555555), `fontFamily: FONT_FAMILY_DISPLAY`
- `marginTop: 6` above the month row, `marginBottom: 20` below it

**Time range pills:**
- Render using the `PillTabs` component (from 1A) with `size="sm"`.
- `alignSelf: 'center'` — the pills are centered horizontally.
- Tabs: `[{ key: '24H', label: '24H' }, { key: '7D', label: '7D' }, ...]`
- Pass `activeTab={timeRange}` and `onTabChange={onTimeRangeChange}`.

**Month labels note:** The month labels should only show when the time range is '1Y' or '3M'. For '24H', '7D', '1M', show hour/day labels instead (or hide labels entirely and just show the line). For V1, always show month labels — refine in a later pass.

#### Implementation Notes

- `react-native-svg` usage: Import `Svg, Polyline, Polygon, Defs, LinearGradient, Stop` from `react-native-svg`. If it's not installed, install it: `npx expo install react-native-svg`.
- Data normalization: The component should internally normalize `data` points to fit the SVG viewBox. Use a viewBox of `"0 0 {width} {height}"` where width/height come from layout measurement. Map `data[i].x` to `0..width` and `data[i].y` to `height..0` (inverted — higher values = higher on screen).
- Use `onLayout` to measure the container width dynamically (different phone screen sizes).
- This component MUST be self-contained — it includes the title, chart SVG, month labels, AND the time range PillTabs. The parent just passes data and callbacks.

---

### 1E. PortfolioRow

**Reference screens:** `market.png` (token rows in the TRENDING table), `market-expanded.png` (DEEL row expanded showing 1H/7D/24 VOLUME/MARKET CAP), `user-account-1.png` (PORTFOLIO section at the bottom)

**WHY this component exists:** The market page has inline-rendered rows (see `market.tsx`). The profile page needs a portfolio table that doesn't exist yet. Both show the same visual pattern: star icon, token avatar, name, 24h change %, price, BUY button, and an expand arrow. When expanded, sub-stats appear below. Building this once prevents duplication.

#### Props Interface

```typescript
interface ExpandedStat {
  label: string;   // e.g. "1H", "7D", "24 VOLUME", "MARKET CAP"
  value: string;   // e.g. "11%", "6%", "2M", "10M/USD"
}

interface PortfolioRowProps {
  /** Token/creator symbol. e.g. "DEEL" */
  symbol: string;
  /** Avatar color fallback (hex). Used if no avatarUrl. */
  avatarColor?: string;
  /** Avatar image URL. */
  avatarUrl?: string;
  /** 24-hour change as a display string. e.g. "17%", "0.5%", "-3%" */
  change: string;
  /** Whether the change is positive (green) or negative (red). */
  changePositive: boolean;
  /** Price as display string. e.g. "10,631USD" */
  price: string;
  /** Called when BUY is tapped. */
  onBuy?: () => void;
  /** Called when SELL is tapped. If undefined, SELL column is hidden. */
  onSell?: () => void;
  /** Whether the row is expandable (shows arrow). */
  expandable?: boolean;
  /** Whether the row is currently expanded. */
  expanded?: boolean;
  /** Called when expand arrow is tapped. */
  onToggleExpand?: () => void;
  /** Data shown when expanded. */
  expandedData?: ExpandedStat[];
  /** Whether the star is filled (favorited). */
  favorited?: boolean;
  /** Called when star is tapped. */
  onToggleFavorite?: () => void;
  /** Called when the row itself is tapped (navigate to token detail). */
  onPress?: () => void;
}
```

#### Visual Specification

Look at `market.png` — each row in the TRENDING table:

**Row layout** (collapsed):
- Grid using flexbox: `flexDirection: 'row'`, `alignItems: 'center'`
- Columns: `Star(20px) | TokenInfo(flex:1) | Change(52px) | Price(flex:1) | Buy(40px) | Arrow(24px)`
- If `onSell` is provided, add a Sell column (40px) between Buy and Arrow.
- `paddingVertical: 10`
- `borderBottomWidth: 1`, `borderBottomColor: COLORS.border` (#2A2A2A) — thin separator. Use `StyleSheet.hairlineWidth` for maximum thinness.

**Star (favorite):**
- Unfavorited: `☆` outline, `color: COLORS.textTertiary` (#555555), `fontSize: 14`
- Favorited: `★` filled, `color: COLORS.primary` (#00FF88)
- Use `Ionicons` name `star-outline` / `star` if available, or keep plain text.
- `width: 20`, `alignItems: 'center'`
- Tappable via `Pressable`.

**Token info (avatar + name):**
- `flexDirection: 'row'`, `alignItems: 'center'`, `gap: 8`
- Avatar: `width: 22`, `height: 22`, `borderRadius: 11` (circle). If `avatarUrl` provided, show image. Otherwise show colored circle using `avatarColor`.
- Name: `fontSize: 11`, `fontWeight: '700'`, `textTransform: 'uppercase'`, `letterSpacing: 1`, `color: COLORS.textPrimary`, `fontFamily: FONT_FAMILY_DISPLAY_BOLD`

**24H change:**
- `fontSize: 11`, `fontWeight: '700'`, `fontFamily: FONT_FAMILY_DISPLAY_BOLD`
- Positive: `color: COLORS.primary` (#00FF88)
- Negative: `color: COLORS.error` (#FF4444)

**Price:**
- `fontSize: 10`, `color: COLORS.textSecondary` (#888888), `fontFamily: FONT_FAMILY_DISPLAY`

**BUY button:**
- Text only (no border, no bg): `fontSize: 9`, `fontWeight: '700'`, `textTransform: 'uppercase'`, `color: COLORS.primary` (#00FF88), `fontFamily: FONT_FAMILY_DISPLAY_BOLD`
- Tappable via `Pressable`.

**SELL button** (when shown):
- Same as BUY but `color: COLORS.textSecondary` (#888888)

**Expand arrow:**
- `fontSize: 10`, `color: COLORS.textTertiary`
- Collapsed: `▼` (or `Ionicons` `chevron-down`)
- Expanded: `▲` (or `Ionicons` `chevron-up`)
- Tappable via `Pressable`.

**Expanded detail row** (see `market-expanded.png` — DEEL row):
- Appears directly below the main row with no additional border.
- `paddingLeft: 28` (indent past the star column)
- `paddingBottom: 10`
- `flexDirection: 'row'`, `gap: 20`
- Each stat:
  - Label: `fontSize: 7`, `textTransform: 'uppercase'`, `letterSpacing: 1`, `color: COLORS.textTertiary`, `fontFamily: FONT_FAMILY_DISPLAY_BOLD`
  - Value: `fontSize: 11`, `color: COLORS.primary`, `fontFamily: FONT_FAMILY_DISPLAY_BOLD`, `marginTop: 2`
- Typical expanded data: `[{ label: '1H', value: '11%' }, { label: '7D', value: '6%' }, { label: '24 VOLUME', value: '2M' }, { label: 'MARKET CAP', value: '10M/USD' }]`

#### Implementation Notes

- The component handles its own expanded/collapsed state if `onToggleExpand` is not provided (uncontrolled). If `onToggleExpand` IS provided, the parent controls it (controlled).
- Wrapping the whole row in `Pressable` (for `onPress`) should not interfere with the star, buy, sell, or arrow press targets. Use `stopPropagation` or separate hit areas.

---

### 1F. PortfolioTable

**Reference screens:** `user-account-1.png` (PORTFOLIO section), `market.png` (TRENDING table inside a bordered card)

**WHY this component exists:** It wraps the header row + a list of `PortfolioRow` components. The market page puts it inside a dark card; the profile page renders it flat. This component handles the header labels and maps data to rows.

#### Props Interface

```typescript
interface PortfolioTableProps {
  /** Section title. e.g. "PORTFOLIO", "TRENDING". Shown above the table. */
  title?: string;
  /** Array of row data. Each item maps to a PortfolioRow. */
  rows: PortfolioRowProps[];
  /** Whether to show the header labels row. Default true. */
  showHeader?: boolean;
  /** Whether to wrap in a Card (surface bg + border). Used on market page. Default false. */
  cardWrapped?: boolean;
  /** Whether to show the SELL column. Default false. */
  showSellColumn?: boolean;
  /** Optional style for the outer container. */
  style?: ViewStyle;
}
```

#### Visual Specification

**Title** (when provided):
- Uses `TYPOGRAPHY.label` with overrides: `fontSize: 12`, `color: COLORS.textPrimary` (#FFFFFF), `letterSpacing: 1.5`
- `marginBottom: 12`
- If `cardWrapped`, the title goes INSIDE the card. If not `cardWrapped`, it goes above.

**Header row:**
- Same column layout as `PortfolioRow` but with tiny gray labels:
- `TOKEN | 24HR | PRICE | BUY | SELL` (SELL only if `showSellColumn`)
- Each label: `fontSize: 8`, `textTransform: 'uppercase'`, `letterSpacing: 1`, `color: COLORS.textTertiary`, `fontFamily: FONT_FAMILY_DISPLAY_BOLD`
- `paddingVertical: 6`, `borderBottomWidth: 1`, `borderBottomColor: COLORS.border`

**Card wrapped** (market page style):
- Wrap everything in `Card variant="flat"` — this gives `COLORS.surface` bg, `RADII.md` radius, `COLORS.border` border, `SPACING.lg` padding.

**Not card wrapped** (profile page style):
- No background, no border. Just the title + header + rows on the black bg.

---

### 1G. TokenSwapWidget

**Reference screens:** `user-account-2.jpg` (bottom WALLET section), `creator-account-2.png` (same section on creator view)

**WHY this component exists:** Both the user account and creator account pages show a wallet/swap section at the bottom with two gradient cards (pay and receive), each with a "SELECT TOKEN" pill, connected by a circular swap arrow. This doesn't exist in the current profile page at all — it's a net-new component.

#### Props Interface

```typescript
interface TokenSwapWidgetProps {
  /** Called when the top "Select Token" is pressed (payment token). */
  onSelectPayToken: () => void;
  /** Called when the bottom "Select Token" is pressed (receive token). */
  onSelectReceiveToken: () => void;
  /** Currently selected pay token info (if any). */
  payToken?: { symbol: string; iconUrl?: string };
  /** Currently selected receive token info (if any). */
  receiveToken?: { symbol: string; iconUrl?: string };
  /** Section title. Default "WALLET". */
  title?: string;
  /** Optional style override. */
  style?: ViewStyle;
}
```

#### Visual Specification

Look at `user-account-2.jpg` — the WALLET section at the bottom:

**Title:**
- `fontSize: 12`, `fontWeight: '700'`, `textTransform: 'uppercase'`, `letterSpacing: 1.5`, `color: COLORS.textPrimary`, `fontFamily: FONT_FAMILY_DISPLAY_BOLD`
- `marginBottom: 16`

**Swap card (top — pay):**
- `width: '100%'`
- Background: CSS `linear-gradient(135deg, #1A1A1A, #242424)`. In React Native, use `LinearGradient` from `expo-linear-gradient` (already installed in Expo projects): `colors={[COLORS.surface, COLORS.surfaceElevated]}`, `start={{ x: 0, y: 0 }}`, `end={{ x: 1, y: 1 }}`.
- `borderWidth: 1`, `borderColor: COLORS.border` (#2A2A2A)
- `borderRadius: RADII.md` (12px)
- `padding: 20`
- `flexDirection: 'row'`, `justifyContent: 'space-between'`, `alignItems: 'center'`
- Left side:
  - Label: "Select Payment" — `fontSize: 10`, `color: COLORS.textSecondary`
  - Below it: "$" icon — `fontSize: 28`, `color: COLORS.textSecondary`, `marginTop: 4`
  - If `payToken` is set, show the token symbol instead of "$"
- Right side:
  - "SELECT TOKEN" pill button: `paddingVertical: 6`, `paddingHorizontal: 14`, `borderWidth: 1`, `borderColor: COLORS.textSecondary`, `borderRadius: RADII.full`, `backgroundColor: 'transparent'`
  - Text: `fontSize: 9`, `fontWeight: '700'`, `textTransform: 'uppercase'`, `letterSpacing: 1`, `color: COLORS.textPrimary`, `fontFamily: FONT_FAMILY_DISPLAY_BOLD`
  - If `payToken` is set, show the symbol instead of "SELECT TOKEN"

**Swap arrow (between the two cards):**
- `width: 32`, `height: 32`, `borderRadius: 16` (circle)
- `backgroundColor: COLORS.surface` (#1A1A1A), `borderWidth: 1`, `borderColor: COLORS.border`
- Centered: `alignSelf: 'center'`, `marginVertical: -4` (overlaps slightly with cards above/below)
- Icon: `Ionicons` `swap-vertical` size 16, `color: COLORS.textPrimary`
- `zIndex: 1` to sit above the cards

**Swap card (bottom — receive):**
- Identical layout to top card but without the "Select Payment" label and "$" icon.
- Just shows "SELECT TOKEN" pill on the right, left side is empty (or shows receive token if set).

---

## 5. Phase 2: Page Integration

---

### 2A. Creator Detail Header — PillTabs Swap

**File:** `apps/mobile/app/creator/[id].tsx`
**Reference screen:** `creator-token.png` (top bar with `PROFILE | POSTS | TOKEN`)

**WHAT TO CHANGE:**

Replace the inline tab bar (lines 355–377) with the `PillTabs` component.

**Current code** (lines 354–377):
```tsx
<View style={styles.navBar}>
  <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
    <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
  </Pressable>
  <View style={styles.tabBar}>
    {TABS.map((tab) => (
      <Pressable key={tab} onPress={() => handleTabChange(tab)} style={styles.tabItem}>
        <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
          {tab}
        </Text>
      </Pressable>
    ))}
  </View>
</View>
```

**Replace with:**
```tsx
<View style={styles.navBar}>
  <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
    <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
  </Pressable>
  <PillTabs
    tabs={[
      { key: 'PROFILE', label: 'Profile' },
      { key: 'POSTS', label: 'Posts' },
      { key: 'TOKEN', label: 'Token' },
    ]}
    activeTab={activeTab}
    onTabChange={(key) => handleTabChange(key as ProfileTab)}
    style={{ flex: 1 }}
  />
</View>
```

**WHY:** The Figma (`creator-token.png`) shows the tabs inside a dark pill container. The current code renders them as bare text with no container background. The `PillTabs` component matches the Figma exactly.

**Style changes needed in the same file:**
- Remove `styles.tabBar`, `styles.tabItem`, `styles.tabText`, `styles.tabTextActive` from the StyleSheet (they become dead code). But **per the project rule**, do NOT delete them yet — just stop referencing them.
- Update `styles.navBar` to: `gap: SPACING.sm` (8px between back button and pill tabs).

**Add import:**
```typescript
import { PillTabs } from '@/components/composites';
```

**Test on screen:** Navigate to any creator profile. The PROFILE/POSTS/TOKEN tabs should appear in a dark capsule at the top. The active tab should be highlighted. Pressing a tab should switch content.

---

### 2B. Home Feed Header — PillTabs Swap

**File:** `apps/mobile/app/(tabs)/home.tsx`
**Reference screen:** `home-feed.png` (top: `FOR YOU | CREATORS TO WATCH`)

**WHAT TO CHANGE:**

Replace the inline tab rendering (lines 289–309) with `PillTabs`.

**Current code** (lines 289–309):
```tsx
<View style={styles.headerTabs}>
  <Pressable onPress={() => handleTabPress('FOR_YOU')}>
    <Text style={[styles.headerTab, feedTab === 'FOR_YOU' && styles.headerTabActive]}>
      FOR YOU
    </Text>
  </Pressable>
  <Pressable onPress={() => handleTabPress('CREATORS_TO_WATCH')}>
    <Text style={[styles.headerTab, feedTab === 'CREATORS_TO_WATCH' && styles.headerTabActive]}>
      CREATORS TO WATCH
    </Text>
  </Pressable>
</View>
```

**Replace with:**
```tsx
<PillTabs
  tabs={[
    { key: 'FOR_YOU', label: 'For You' },
    { key: 'CREATORS_TO_WATCH', label: 'Creators to Watch' },
  ]}
  activeTab={feedTab}
  onTabChange={(key) => handleTabPress(key as FeedTab)}
  style={{ flex: 1, marginHorizontal: SPACING.xs }}
/>
```

**WHY:** The current home header tabs are plain text that changes from gray to white. The Figma shows them in a pill container (visible in `home-feed.png` and `home-feed-2.png` — "FOR YOU" and "CREATORS TO WATCH" sit inside a dark capsule at the top). The `PillTabs` component gives them the correct container treatment.

**IMPORTANT NUANCE:** The home feed header has 3 elements: algo icon (left), tabs (center), market icon (right). The overall `styles.header` layout (`flexDirection: 'row'`, `alignItems: 'center'`) stays the same. The PillTabs just replaces the middle `View style={styles.headerTabs}`. The algo and market icons remain untouched.

**Also update the loading state** (lines 269–274): The loading skeleton shows `<Text style={styles.headerTabActive}>FOR YOU</Text>`. Replace this with the same `PillTabs` component (disabled or with just the active tab) for visual consistency during load.

**Add import:**
```typescript
import { PillTabs } from '@/components/composites';
```

---

### 2C. Token Tab Rebuild

**File:** `apps/mobile/app/creator/[id].tsx` — the `renderTokenTab()` function (lines 287–349)
**Reference screen:** `creator-token.png`

**WHAT TO CHANGE:**

Replace the entire `renderTokenTab()` function body. The current version has placeholder values ("—") and a "Coming Soon" chart box. The rebuild uses the new composite components.

**New renderTokenTab() implementation:**

```tsx
const renderTokenTab = () => (
  <ScrollView
    showsVerticalScrollIndicator={false}
    contentContainerStyle={styles.tokenContent}
    nestedScrollEnabled
  >
    {/* Token symbol hero */}
    <Text style={styles.tokenHero}>
      ${profile?.tokenSymbol || '???'}
    </Text>

    {/* BUY / SELL pills */}
    <BuySellPills
      onBuy={() => setShowComingSoon(true)}
      onSell={() => setShowComingSoon(true)}
      style={{ marginTop: SPACING.xl }}
    />

    {/* Stats row — 3 across */}
    <View style={styles.tokenStatsRow}>
      <StatsCard
        label="PRICE"
        value={tokenData?.price ?? '—'}
        variant="inline"
      />
      <StatsCard
        label="24H CHANGE"
        value={tokenData?.change24h ?? '—'}
        variant="inline"
        valueColor={tokenData?.changePositive ? 'positive' : 'negative'}
      />
      <StatsCard
        label="MARKET CAP"
        value={tokenData?.marketCap ?? '—'}
        variant="inline"
      />
    </View>

    {/* Divider */}
    <View style={styles.tokenDivider} />

    {/* Performance chart */}
    <PerformanceChart
      title="TOKEN PERFORMANCE"
      data={chartData}
      timeRange={chartTimeRange}
      onTimeRangeChange={setChartTimeRange}
      style={{ width: '100%' }}
    />

    {/* Follow CTA */}
    {!isOwnProfile && (
      <Pressable
        onPress={toggleFollow}
        style={[styles.tokenFollowButton, isFollowing && styles.tokenFollowingButton]}
      >
        <Text style={[styles.tokenFollowText, isFollowing && styles.tokenFollowingText]}>
          {isFollowing ? 'FOLLOWING' : 'FOLLOW'}
        </Text>
      </Pressable>
    )}
  </ScrollView>
);
```

**New state and data needed at the top of CreatorScreen:**
```typescript
const [chartTimeRange, setChartTimeRange] = useState('1Y');

// Sample/placeholder chart data until real API exists
const chartData = useMemo(() => [
  { x: 0, y: 20 }, { x: 1, y: 18 }, { x: 2, y: 25 },
  { x: 3, y: 30 }, { x: 4, y: 28 }, { x: 5, y: 35 },
  { x: 6, y: 50 }, { x: 7, y: 45 }, { x: 8, y: 55 },
  { x: 9, y: 60 }, { x: 10, y: 58 }, { x: 11, y: 70 },
], []);

// Token data — placeholder until real API
const tokenData = useMemo(() => ({
  price: '0.004',
  change24h: '17%',
  changePositive: true,
  marketCap: '10.6K',
}), []);
```

**New styles to add:**
```typescript
tokenStatsRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  width: '100%',
  marginTop: SPACING.xl,
},
tokenDivider: {
  width: '100%',
  height: 1,
  backgroundColor: COLORS.border,
  marginVertical: SPACING.xl,
},
```

**Styles to keep (still used):** `tokenContent`, `tokenHero`, `tokenFollowButton`, `tokenFollowingButton`, `tokenFollowText`, `tokenFollowingText`.

**Styles now unused (do NOT delete yet):** `tokenButtons`, `tokenBuyButton`, `tokenBuyText`, `tokenSellButton`, `tokenSellText`, `tokenStats`, `tokenStatItem`, `tokenStatLabel`, `tokenStatValue`, `tokenChartContainer`, `tokenChartLabel`, `tokenChart`, `tokenChartPlaceholder`.

**Add imports:**
```typescript
import { PillTabs, StatsCard, BuySellPills, PerformanceChart } from '@/components/composites';
```

**WHY this matters:** The token page is the most visually different from the Figma. It currently shows "—" for all values and "Coming Soon" for the chart. The Figma (`creator-token.png`) shows actual values (0.004 / 17% / 10.6K) and a real green line chart. Even with placeholder data, the rebuilt version will look dramatically closer to the Figma.

---

### 2D. Profile Page Rebuild

**File:** `apps/mobile/app/(tabs)/profile.tsx`
**Reference screens:** `user-account-1.png` (user view), `creator-account-1.png` (creator view)

**WHY this is the biggest change:** The current profile page looks like Instagram (avatar + bio + follower counts + masonry grid). The Figma looks like a trading dashboard (centered name + stats cards + portfolio chart + token table + swap widget). These are fundamentally different layouts.

**STRATEGY:** Do NOT rewrite profile.tsx. Instead:

1. Create a new file: `apps/mobile/src/components/features/ProfileDashboard.tsx`
2. This component receives the same data (user, wallet, posts) but renders the Figma layout.
3. In `profile.tsx`, import it and render it conditionally (e.g., `const USE_NEW_PROFILE = true;`).
4. Once verified on device, flip the flag and eventually delete the old rendering code.

**ProfileDashboard.tsx structure:**

```
SafeAreaView (bg: black)
├── ScrollView
│   ├── Header Row
│   │   ├── [Creator only] PillTabs: EDIT PROFILE | NEW POST | ACCOUNT
│   │   └── [User only] Settings gear icon (top right)
│   ├── User Name (28px bold uppercase centered)
│   ├── WALLET pill button (centered)
│   ├── Stats Cards Row
│   │   ├── StatsCard "24H CHANGE" → value
│   │   └── StatsCard "EARNINGS TO DATE" → value
│   ├── PerformanceChart "PORTFOLIO PERFORMANCE"
│   ├── PortfolioTable "PORTFOLIO"
│   │   └── PortfolioRow × N (user's token holdings)
│   └── TokenSwapWidget "WALLET"
└── Tab Bar (handled by parent layout, not this component)
```

**Data mapping:**
- User name: `user?.displayName || user?.username`
- 24H Change: from `walletBalance` or API (placeholder for now)
- Earnings to Date: from API (placeholder for now)
- Portfolio chart data: from API (placeholder sample data for now)
- Portfolio rows: from user's token holdings API (placeholder sample data for now)

**Specific elements from the Figma:**

1. **Settings gear** (`user-account-1.png`, top right): `Ionicons` `settings-outline`, `size: 22`, `color: COLORS.textSecondary`. Positioned `alignSelf: 'flex-end'`, `padding: SPACING.sm`.

2. **Creator pill tabs** (`creator-account-1.png`, top center): `PillTabs` with `tabs=[{ key: 'edit', label: 'Edit Profile' }, { key: 'post', label: 'New Post' }, { key: 'account', label: 'Account' }]`. When "Edit Profile" is pressed → navigate to `/edit-profile`. When "New Post" → navigate to `/create-post`. When "Account" → scroll to account settings section (or show settings sheet).

3. **User name**: `fontSize: 28`, `fontWeight: '700'`, `textTransform: 'uppercase'`, `letterSpacing: 2`, `textAlign: 'center'`, `color: COLORS.textPrimary`, `fontFamily: FONT_FAMILY_DISPLAY_BOLD`. `marginBottom: 16`.

4. **WALLET pill**: Outlined pill button, centered. `paddingVertical: 8`, `paddingHorizontal: 24`, `borderWidth: 1`, `borderColor: COLORS.textSecondary`, `borderRadius: RADII.full`, `backgroundColor: 'transparent'`. Text: `fontSize: 11`, `fontWeight: '700'`, `textTransform: 'uppercase'`, `letterSpacing: 1.5`, `color: COLORS.textPrimary`. `marginBottom: 24`. On press → navigate to `/(tabs)/wallet`.

5. **Stats cards**: Two `StatsCard variant="card"` in a `flexDirection: 'row'` container with `gap: 12`. Each card `flex: 1`. `marginBottom: 28`.

6. **Chart**: `PerformanceChart title="PORTFOLIO PERFORMANCE"`. Full width. `marginBottom: 24`.

7. **Portfolio table**: `PortfolioTable title="PORTFOLIO" showSellColumn={true}`. Maps user's token holdings to rows. `marginBottom: 24`.

8. **Swap widget**: `TokenSwapWidget title="WALLET"`. `marginBottom: 24`. On select → open a token picker (can use ComingSoonModal for now).

---

### 2E. Market Page Rebuild

**File:** `apps/mobile/app/market.tsx`
**Reference screens:** `market.png`, `market-expanded.png`

**WHAT TO CHANGE:**

The market page structure is already close to the Figma. The main changes:

1. **Replace inline filter tabs** with `PillTabs`:
   - Current: inline `Pressable` + `Text` with underline style
   - Replace with: `<PillTabs tabs={[{ key: 'trending', label: 'Trending' }, { key: '24h', label: '24H Gainers' }, { key: 'top', label: 'Top Creators' }]} ... />`

2. **Replace inline table rows** with `PortfolioRow`:
   - Current: inline rendered rows with custom grid
   - Replace with: `<PortfolioTable cardWrapped={true} title="TRENDING" rows={mappedRows} />`
   - Create an adapter function that maps the current creator data to `PortfolioRowProps`

3. **Keep the ticker banners** — they already exist as a feature component (`TickerBanner`). Check if it matches the Figma (green text, monospace, horizontal scroll). If the existing `TickerBanner` component renders correctly, keep it.

4. **Keep the search bar** — the current `TextInput` implementation is fine. Style it to match: `backgroundColor: COLORS.surface`, `borderWidth: 1`, `borderColor: COLORS.border`, `borderRadius: RADII.full`, `height: 36`.

**Data adapter example:**
```typescript
const mapCreatorToPortfolioRow = (creator: any): PortfolioRowProps => ({
  symbol: creator.tokenSymbol || creator.username,
  avatarUrl: creator.avatarUrl,
  avatarColor: '#' + Math.floor(Math.random()*16777215).toString(16), // fallback
  change: `${creator.change24h || 0}%`,
  changePositive: (creator.change24h || 0) >= 0,
  price: creator.tokenPrice ? `${creator.tokenPrice}USD` : '—',
  onBuy: () => handleBuy(creator),
  expandable: true,
  expandedData: [
    { label: '1H', value: `${creator.change1h || 0}%` },
    { label: '7D', value: `${creator.change7d || 0}%` },
    { label: '24 VOLUME', value: creator.volume24h || '—' },
    { label: 'MARKET CAP', value: creator.marketCap || '—' },
  ],
});
```

---

## Appendix: Testing with Android Studio Emulator

### Setup
1. Open Android Studio on Windows
2. Go to Device Manager → Create Virtual Device → Pixel 8, API 34
3. Start the emulator

### Running the App
```bash
cd apps/mobile

# Option A: Expo dev server (connects to running emulator)
npx expo start --port 8082

# Option B: Direct build + install on emulator (slower but more reliable)
npx expo run:android
```

**Option A** requires the dev client APK to be installed on the emulator first:
```bash
# Download the existing EAS build
curl -sL <apk-url-from-expo-builds> -o /tmp/momento.apk
# Install on emulator (emulator must be running)
adb install -r /tmp/momento.apk
```

**Option B** builds from source and installs directly. Slower first time but doesn't need a pre-built APK.

### Emulator Networking
- The emulator accesses the host machine (where Metro runs) via `10.0.2.2`
- No `adb reverse` needed for the emulator — it handles port mapping automatically
- Metro should be running on port 8082 (set via `--port 8082`)

### Screenshot Comparison
After each component integration, take a screenshot from the emulator and compare against the corresponding Figma screen in `docs/design/screens/`. They should match closely.
