# Momento Mobile — Component-First UI Rebuild Plan

> Strategy: Build reusable components first, wire them into pages one by one, keep old code until verified.

## Architecture: New Component Layers

```
apps/mobile/src/components/
├── primitives/          ← EXISTS (Text, Button, Avatar, Card, etc.)
├── composites/          ← NEW (shared multi-primitive components)
│   ├── PillTabs.tsx
│   ├── StatsCard.tsx
│   ├── PerformanceChart.tsx
│   ├── PortfolioTable.tsx
│   ├── PortfolioRow.tsx
│   ├── BuySellPills.tsx
│   ├── TokenSwapWidget.tsx
│   ├── SearchBar.tsx
│   └── index.ts
├── features/            ← EXISTS (PostCard, modals, skeletons, etc.)
└── index.ts
```

---

## Phase 1: Shared Composite Components (7 components)

### 1.1 — PillTabs
**Used in:** Creator detail (PROFILE/POSTS/TOKEN), Creator account (EDIT PROFILE/NEW POST/ACCOUNT), Market (TRENDING/24H GAINERS/TOP CREATORS), Home feed (FOR YOU/CREATORS TO WATCH), Time range selector (24H/7D/1M/3M/1Y)
**Replaces:** Inline `useState` tab switching in `creator/[id].tsx`, `market.tsx`, `home.tsx`
```
Props:
  tabs: { key: string, label: string }[]
  activeTab: string
  onTabChange: (key: string) => void
  size?: 'sm' | 'md'          // sm = time range, md = default
  variant?: 'pill' | 'underline'  // pill = rounded bg, underline = border-bottom
  style?: ViewStyle
```
**Design tokens:**
- Container: `#1A1A1A` bg, `border-radius: 9999`, `padding: 3px`
- Inactive tab: `#888` text, transparent bg
- Active tab: `#FFF` text, `#222` bg, `1px solid #2A2A2A` border, `border-radius: 9999`
- Font: Space Mono, 10-11px, 700 weight, uppercase, 1.2px letter-spacing

### 1.2 — StatsCard
**Used in:** Profile page (24H CHANGE, EARNINGS TO DATE), Token page (PRICE, 24H CHANGE, MARKET CAP)
**Replaces:** Nothing (doesn't exist in current app)
```
Props:
  label: string
  value: string
  variant?: 'card' | 'inline'   // card = dark bg box, inline = just text centered
  valueColor?: 'positive' | 'negative' | 'neutral'
  style?: ViewStyle
```
**Design tokens:**
- Card variant: `#1A1A1A` bg, `border-radius: 12px`, `padding: 14px 16px`
- Label: 9px uppercase, `#555`, 1.5px letter-spacing
- Value: 22px bold (card) or 16px bold (inline), `#00FF88` default

### 1.3 — PerformanceChart
**Used in:** Profile page (PORTFOLIO PERFORMANCE), Token page (TOKEN PERFORMANCE)
**Replaces:** PortfolioChart feature component (if it exists but doesn't match Figma)
```
Props:
  title: string               // "TOKEN PERFORMANCE" or "PORTFOLIO PERFORMANCE"
  data: { x: number, y: number }[]
  timeRange: string           // "24H" | "7D" | "1M" | "3M" | "1Y"
  onTimeRangeChange: (range: string) => void
  height?: number             // default 160
```
**Design tokens:**
- Line: `#00FF88`, 2.5px stroke
- Fill: linear gradient `#00FF88` at 12% opacity → 0%
- Month labels: 7-8px, `#555`, uppercase
- Includes PillTabs (sm) for time range below chart
- Chart library: `react-native-svg` (already in deps) or `victory-native`

### 1.4 — PortfolioRow
**Used in:** Profile portfolio table, Market trending table
**Replaces:** Inline rows in `market.tsx`
```
Props:
  tokenSymbol: string
  tokenName: string
  avatarColor?: string
  avatarUrl?: string
  change24h: number           // percentage, colored green/red
  price: string
  marketCap?: string
  onBuy?: () => void
  onSell?: () => void
  expandable?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  expandedData?: { label: string, value: string }[]
  favorited?: boolean
  onToggleFavorite?: () => void
```
**Design tokens:**
- Grid: `star(20px) | token(1fr) | change(52px) | price(90px) | buy(40px) | sell(40px)`
- Row padding: `10px 0`, border-bottom `1px solid #2A2A2A`
- Token name: 11px bold uppercase
- Change: 11px bold, `#00FF88` positive, `#FF4444` negative
- BUY text: `#00FF88`, SELL text: `#888`
- Expanded: 4 stats in a row below (1H, 7D, 24 VOL, MARKET CAP)

### 1.5 — PortfolioTable
**Used in:** Profile page, Market page
**Replaces:** Inline table in `market.tsx`
```
Props:
  title?: string              // "PORTFOLIO" or "TRENDING"
  rows: PortfolioRowProps[]
  showHeader?: boolean
  columns?: ('star' | 'token' | 'change' | 'price' | 'buy' | 'sell')[]
  style?: ViewStyle
```
Wraps header labels + PortfolioRow list. Handles expand state internally.

### 1.6 — BuySellPills
**Used in:** Token page
**Replaces:** Inline buttons in `creator/[id].tsx` TOKEN tab
```
Props:
  onBuy: () => void
  onSell: () => void
  disabled?: boolean
```
**Design tokens:**
- BUY: outlined pill, `1px solid #888`, white text, transparent bg
- SELL: filled pill, white bg, black text
- Both: `padding: 10px 36px`, `border-radius: 9999`, 12px bold uppercase

### 1.7 — TokenSwapWidget
**Used in:** Profile/Account page (bottom WALLET section)
**Replaces:** Nothing (doesn't exist in current app)
```
Props:
  onSelectPayToken: () => void
  onSelectReceiveToken: () => void
  payToken?: { symbol: string, icon: string }
  receiveToken?: { symbol: string, icon: string }
```
**Design tokens:**
- Two gradient cards (`#1A1A1A` → `#222`), `border-radius: 12px`
- SELECT TOKEN pill: `1px solid #888`, `border-radius: 9999`, 9px bold uppercase
- Swap arrow: 32px circle, `#1A1A1A` bg, `1px solid #2A2A2A`, ⇅ icon

---

## Phase 2: Page Rebuilds (using Phase 1 components)

### 2.1 — Token Tab (in `creator/[id].tsx`)
**Current:** Placeholder stats, "Coming Soon" chart, basic BUY/SELL buttons
**Target (from Figma `creator-token.png`):**
- `$DEEL` token symbol hero (36px bold centered)
- `BuySellPills` component
- 3x `StatsCard` (inline variant) — PRICE, 24H CHANGE, MARKET CAP
- Divider line
- `PerformanceChart` — green line chart with real or sample data
- `PillTabs` (sm) — time range selector
**Effort:** Medium — mostly wiring new components, some data plumbing
**Dependencies:** PillTabs, StatsCard, PerformanceChart, BuySellPills

### 2.2 — Profile Page (`(tabs)/profile.tsx`)
**Current:** Social media layout — avatar, bio, follower counts, post grid (896 lines)
**Target (from Figma `user-account-1.png`, `creator-account-1.png`):**
- `PillTabs` at top: EDIT PROFILE / NEW POST / ACCOUNT (creator only)
- Username centered (28px bold uppercase)
- WALLET pill button
- 2x `StatsCard` — 24H CHANGE, EARNINGS TO DATE
- `PerformanceChart` — PORTFOLIO PERFORMANCE
- `PillTabs` (sm) — time range
- `PortfolioTable` — token holdings with BUY/SELL
- `TokenSwapWidget` — bottom wallet section
- Settings gear icon (top right)
**Effort:** Large — major restructure, but all built from Phase 1 components
**Dependencies:** ALL Phase 1 components
**Strategy:** Build as a NEW component `ProfileV2` alongside existing profile. Toggle with a feature flag or new route.

### 2.3 — Market Page (`market.tsx`)
**Current:** Search + ticker + table with creator rows (465 lines)
**Target (from Figma `market.png`, `market-expanded.png`):**
- Back button + `SearchBar`
- 2x ticker banners (TRENDING, CREATORS TO WATCH)
- `PillTabs` — TRENDING / 24H GAINERS / TOP CREATORS
- `PortfolioTable` inside a dark surface card
- Expandable `PortfolioRow` items
- CREATOR TOKENS section below
**Effort:** Medium — structure is similar, mostly component swaps
**Dependencies:** PillTabs, PortfolioTable, PortfolioRow

### 2.4 — Creator Detail Header (`creator/[id].tsx`)
**Current:** `useState` tab switching with inline tab buttons
**Target:** Replace inline tabs with `PillTabs` component
**Effort:** Small — swap the tab rendering, keep everything else
**Dependencies:** PillTabs

### 2.5 — Home Feed Header (`(tabs)/home.tsx`)
**Current:** FOR YOU / CREATORS TO WATCH as inline styled tabs
**Target:** Replace with `PillTabs` component
**Effort:** Small
**Dependencies:** PillTabs

---

## Phase 3: Polish & Cleanup

### 3.1 — Delete old inline tab implementations after PillTabs is verified
### 3.2 — Delete old profile layout after ProfileV2 is verified
### 3.3 — Extract remaining inline components (MasonryGrid, SearchBar)
### 3.4 — Update all skeleton loading states to match new layouts
### 3.5 — Verify all screens on Android Studio emulator

---

## Implementation Order (dependency graph)

```
Week 1: Foundation
  ├── 1.1 PillTabs         (0 deps, used by everything)
  ├── 1.2 StatsCard        (0 deps)
  └── 1.6 BuySellPills     (0 deps)

Week 1: Wire into pages
  ├── 2.4 Creator detail header → PillTabs swap
  ├── 2.5 Home feed header → PillTabs swap
  └── 2.1 Token tab rebuild (PillTabs + StatsCard + BuySellPills)

Week 2: Financial components
  ├── 1.3 PerformanceChart (needs chart lib decision)
  ├── 1.4 PortfolioRow     (0 deps)
  ├── 1.5 PortfolioTable   (depends on PortfolioRow)
  └── 1.7 TokenSwapWidget  (0 deps)

Week 2: Page rebuilds
  ├── 2.3 Market page → PillTabs + PortfolioTable
  └── 2.2 Profile page V2  (depends on ALL components)

Week 3: Polish
  ├── 3.1-3.5 Cleanup, skeletons, verification
  └── Android Studio emulator testing
```

---

## Testing Strategy: Android Studio Emulator

1. **Setup:** Open Android Studio → AVD Manager → Create/use Pixel 8 API 34
2. **Build:** `npx expo run:android` (builds and installs on emulator directly)
3. **Dev server:** Metro runs on `localhost:8081` (emulator accesses host via `10.0.2.2`)
4. **Hot reload:** Supported — change code, see updates instantly
5. **No ADB reverse needed:** Emulator has built-in host networking

Advantages over physical device:
- No USB connection issues
- No ADB reverse port forwarding
- Instant rebuild cycle
- Can test multiple device sizes
- Screenshots for comparison against Figma

---

## File Naming Convention

```
apps/mobile/src/components/composites/
  PillTabs.tsx          — kebab internally, PascalCase file
  StatsCard.tsx
  PerformanceChart.tsx
  PortfolioTable.tsx
  PortfolioRow.tsx
  BuySellPills.tsx
  TokenSwapWidget.tsx
  index.ts              — barrel exports
```

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Chart library adds bundle size | Use `react-native-svg` (already installed) for manual path drawing — no new dep |
| Profile rebuild breaks existing functionality | Build as ProfileV2, keep old Profile, feature-flag toggle |
| PillTabs animation feels janky | Use `LayoutAnimation` or `react-native-reanimated` for smooth transitions |
| Market page data shape doesn't match PortfolioRow props | Adapter function in market.tsx to transform creator data → PortfolioRow format |
| Emulator performance differs from real device | Test on physical device before final release (keep EAS build pipeline) |
