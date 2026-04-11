# Agent Handoff: Momento Component-First UI Rebuild + Emulator Testing

> Generated: 2026-04-11
> Session focus: Built a reusable composite component library from Figma specs, wired it into 4 pages, tested on Android Studio emulator, iterated on live UI feedback

## 1. Project Overview

Momento is a location-based creator monetization platform ("stock market for culture"). Monorepo: `apps/api` (Next.js 15, Vercel), `apps/mobile` (Expo 54, React Native 0.81.5), `apps/landing` (Next.js 15), `packages/shared` (TypeScript types). Auth via Privy, blockchain via Solana + Base. Design system: pure black (#000000), #00FF88 green accent, Space Mono monospaced font, all-caps uppercase.

## 2. Current State

### Working
- **Composite component library** — 8 reusable components in `src/components/composites/` (PillTabs, StatsCard, BuySellPills, PerformanceChart, PortfolioRow, PortfolioTable, TokenSwapWidget) + PillButton primitive
- **Home feed** — PillTabs header (FOR YOU / TRENDING), vertical scroll with peek, video/image/text posts loading from API
- **Creator profile** — PillTabs (PROFILE/POSTS/TOKEN), full-bleed hero, social link icons, masonry post grid
- **Token tab** — BuySellPills, StatsCard row (PRICE/24H CHANGE/MARKET CAP), PerformanceChart with SVG green line + gradient fill
- **Profile page (dashboard mode)** — Financial dashboard layout: name, WALLET+PORTFOLIO pills, stats cards, VIEW POSTS/SWAP tabs, feed-style post list matching creator POSTS tab
- **Portfolio screen** — Standalone `/portfolio` route: stats cards, performance chart, token table with BUY/SELL, swap widget
- **Explore page** — Search bar always visible, masonry grid, CREATORS/POSTS tabs
- **Tab bar** — 3 tabs (Home/Explore/Profile), wallet hidden via `href: null`
- **Emulator testing pipeline** — Android Studio Medium_Phone_API_36.1 emulator, Metro on port 8082, ADB reverse on both 8081→8082 and 8082→8082
- **Feed data** — API returns posts from Toronto seed data at any location via expanded radius tiers (up to 15,000km)
- **GPS fallback** — LocationProvider times out after 8s and falls back to Toronto coordinates

### Not Yet Working / In Progress
- **Market page rebuild (2E)** — Deferred. Current inline tabs/rows still work but not using new composites. Documented in BUILD_SPEC.md as DEFERRED.
- **Real token data** — All portfolio/chart data is sample/placeholder. Token prices, 24H change, market cap are hardcoded.
- **Real portfolio data** — Profile stats (24H CHANGE, EARNINGS TO DATE) use placeholder values
- **Video loading** — Some sample video URLs (Google Storage bucket) show black frames; unclear if URLs expired or codec issue
- **Feed deduplication** — FOR YOU and TRENDING tabs may show same creators (small seed dataset)
- **Profile social links** — Not shown on own profile dashboard (only on creator detail page when viewing others)
- **useSavedPosts runs unconditionally** — TODO comment at profile.tsx line 95; doesn't accept `enabled` param

## 3. What Was Done This Session

### Design Phase
1. **Analyzed all 20 Figma screens** — extracted pixel-perfect specs from `docs/design/screens/`
2. **Created HTML mockups** — `docs/design/mockups/` (components.html, token-page.html, profile-page.html, market-page.html)
3. **Wrote BUILD_SPEC.md** — 1,044-line spec with exact props, colors, font sizes, padding for every component
4. **Wrote IMPLEMENTATION_PLAN.md** — Phased rollout with dependency graph

### Phase 1: Composite Components (8 components)
5. **PillButton** (`primitives/PillButton.tsx`) — filled/outlined/ghost variants, xs/sm/md sizes
6. **PillTabs** (`composites/PillTabs.tsx`) — dark capsule container, equal-width tabs
7. **StatsCard** (`composites/StatsCard.tsx`) — card and inline variants
8. **BuySellPills** (`composites/BuySellPills.tsx`) — outlined BUY + filled SELL
9. **PerformanceChart** (`composites/PerformanceChart.tsx`) — SVG line chart via react-native-svg
10. **PortfolioRow** (`composites/PortfolioRow.tsx`) — flat sibling layout (star/body/buy/sell/arrow)
11. **PortfolioTable** (`composites/PortfolioTable.tsx`) — header + rows with optional card wrapper
12. **TokenSwapWidget** (`composites/TokenSwapWidget.tsx`) — gradient cards + swap arrow

### Phase 1 Verification (parallel agents)
13. **Testing agent** found: nested Pressable touch propagation, header/row column misalignment, empty PillTabs, expanded values always green, flat Y line centering, duplicate symbol
14. **Verification agent** found: column widths off spec, SELL pill missing border, inline margin wrong, SELECT TOKEN padding wrong
15. All issues fixed across 2 commits

### Phase 2: Page Integrations
16. **Creator detail header** — replaced inline tabs with PillTabs
17. **Home feed header** — replaced inline tabs with PillTabs (FOR YOU / TRENDING)
18. **Token tab rebuild** — BuySellPills + StatsCard×3 + PerformanceChart replacing placeholders
19. **Profile dashboard** — new `ProfileDashboard.tsx` feature component, feature-flagged
20. **Phase 2 verification** — caught wallet route bug, stale tab state, wasted API calls, no-op handlers

### Emulator Testing & Live Fixes
21. **Android emulator setup** — Medium_Phone_API_36.1, cleared storage (777MB), installed dev client APK
22. **Metro on port 8082** — with ADB reverse on both 8081→8082 and 8082→8082
23. **GPS fallback** — LocationProvider times out after 8s, falls back to Toronto
24. **Feed radius expansion** — API radius tiers extended to 15,000km for global reach
25. **Wallet tab hidden** — `href: null` in tab layout
26. **UI feedback fixes** — search bar always visible, "CREATORS TO WATCH" → "TRENDING", social icons enlarged, feed sort wired to popular for Trending tab
27. **AnimatedPressable restructured** — splits style into layout props (Pressable) and visual props (Animated.View)
28. **Portfolio screen** — extracted from profile into standalone `/portfolio` route
29. **VIEW POSTS tab** — feed-style post list on profile matching creator POSTS tab
30. **Safe back navigation** — `router.canGoBack()` with fallback to `/(tabs)/profile`

## 4. Key Decisions & Rationale

| Decision | Why | Alternatives Considered |
|----------|-----|------------------------|
| PillButton as shared primitive | Single atom reused in PillTabs, BuySellPills, TokenSwapWidget | Extending existing Button (too many overrides needed) |
| AnimatedPressable: Pressable outside, Animated.View inside, style split | Pressable needs layout props (flex) to participate in parent layouts; Animated.View needs visual props for scale animation | Pressable inside (broke PillTabs layout), Pressable inside with flex:1 (circular height dependency) |
| Profile dashboard as feature flag | `USE_DASHBOARD_PROFILE = true` at top of profile.tsx. Old social-media profile fully preserved below | Full rewrite (risky, can't A/B test) |
| Portfolio as separate screen | Profile page was too long with chart+table+swap. WALLET and PORTFOLIO as side-by-side pill buttons | Keep everything on profile (too much scrolling) |
| VIEW POSTS / SWAP tabs on profile | Creators need to see their own posts; swap is secondary | Masonry grid (doesn't show captions/timestamps), separate posts screen (extra navigation) |
| Feed-style posts (not list/grid) | Matches creator/[id].tsx POSTS tab exactly — avatar+name+timestamp+caption+image | Compact list with thumbnails (user specifically requested matching the creator view) |
| "CREATORS TO WATCH" → "TRENDING" | Long text was being cut off in PillTabs on smaller screens | Smaller font (less readable), abbreviation (unclear) |
| TRENDING tab = popular sort | More useful for discovery than following-only | keeping following sort (not useful if you follow nobody) |
| GPS 8s timeout with Toronto fallback | Emulator GPS hangs forever on `getCurrentPositionAsync` | No fallback (feed never loads), hardcoded location (wrong on real devices) |
| Feed radius to 15,000km | All seed data is in Toronto; users far away got 0 posts | Keep 1,000km max (empty feeds for most users during early stage) |
| react-native-svg for charts | Already in deps, lightweight, no new dependency | victory-native (heavy), react-native-chart-kit (opinionated) |
| Flex-based column widths in PortfolioRow | Responsive across phone sizes | Fixed pixel widths (breaks on small screens) |

## 5. Bugs, Failures & Lessons Learned

- **AnimatedPressable flex:1 inside broke PillTabs**: Adding `flex:1` to the inner Pressable caused a circular height dependency — Pressable tried to fill parent, parent sized from children. Fix: restructure to Pressable-outside (layout), Animated.View-inside (visual), with style splitting via `LAYOUT_PROPS` set.
- **PillTabs active border was fragile**: Using `style` override to add `borderWidth:1` on a `ghost` variant that explicitly sets `borderWidth:0`. Fix: use `variant="outlined"` for active tabs instead.
- **PortfolioRow nested Pressables caused double-fire**: Tapping inner BUY/SELL also triggered outer row `onPress`. Fix: restructured to flat sibling layout — star, rowBody (Pressable for navigation), buy, sell, arrow are all siblings, not nested.
- **Emulator GPS `getCurrentPositionAsync` hangs forever**: API 36 emulators don't respond to `adb emu geo fix`. The `Location.getCurrentPositionAsync()` promise never resolves. Fix: race it against an 8-second timeout, fallback to Toronto coordinates.
- **Metro keeps dying on WSL**: Metro process gets killed periodically. Fix: use `nohup` and write to `/tmp/metro.log`. Always restart with `nohup npx expo start --port 8082 > /tmp/metro.log 2>&1 &`.
- **Port 8081 conflict**: Something holds port 8081 persistently. Fix: use 8082 and reverse both ports: `adb reverse tcp:8081 tcp:8082 && adb reverse tcp:8082 tcp:8082`.
- **Emulator storage too small for APK**: 215MB APK needs 777MB+ free. Fix: uninstall unused apps (`com.wispr.flowapp`, `com.mylesapp.Myles`, `com.kubi.kucoin`, `host.exp.exponent`), use `--partition-size 2047`.
- **`(tabs)/wallet.tsx` auto-discovered as 4th tab**: Expo Router auto-discovers any `.tsx` in `(tabs)/` directory. Fix: `<Tabs.Screen name="wallet" options={{ href: null }} />`.
- **`router.back()` breaks when no stack history**: Navigating to wallet/portfolio from profile tab has no back stack entry. Fix: `router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')`.
- **Feed shows same posts on both tabs**: Small seed dataset (all Toronto) means both sort modes return similar posts. Not a bug — will resolve with more creators.

## 6. Codebase Map

```
momento/
├── HANDOFF.md                          — This file
├── CLAUDE.md                           — Agent instructions: reference design system
├── docs/design/
│   ├── BUILD_SPEC.md                   — Pixel-perfect component specs (1,044 lines)
│   ├── IMPLEMENTATION_PLAN.md          — Phased rollout plan
│   ├── DESIGN_REFERENCE.md             — Screen-by-screen Figma specs
│   ├── screens/                        — 20 Figma PNG exports
│   └── mockups/                        — 4 interactive HTML mockups
├── apps/api/
│   └── app/api/feed/route.ts           — Feed with radius tiers [50..15000km]
├── apps/mobile/
│   ├── app/
│   │   ├── _layout.tsx                 — Root stack (gestureEnabled, gestureDirection)
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx             — Tab bar (3 tabs, wallet hidden)
│   │   │   ├── home.tsx                — Feed with PillTabs (FOR YOU/TRENDING)
│   │   │   ├── explore.tsx             — Masonry grid, always-visible search
│   │   │   ├── profile.tsx             — USE_DASHBOARD_PROFILE flag → ProfileDashboard
│   │   │   └── wallet.tsx              — Tab wallet (hidden, has back button)
│   │   ├── creator/[id].tsx            — PillTabs + token tab rebuild
│   │   ├── portfolio.tsx               — NEW: standalone portfolio screen
│   │   └── wallet.tsx                  — Standalone wallet (safe back nav)
│   └── src/
│       ├── components/
│       │   ├── primitives/
│       │   │   ├── PillButton.tsx       — Shared pill atom (filled/outlined/ghost)
│       │   │   ├── AnimatedPressable.tsx — Pressable-outside, Animated.View-inside, style split
│       │   │   └── index.ts            — Exports PillButton
│       │   ├── composites/             — NEW: 7 composite components
│       │   │   ├── PillTabs.tsx
│       │   │   ├── StatsCard.tsx
│       │   │   ├── BuySellPills.tsx
│       │   │   ├── PerformanceChart.tsx
│       │   │   ├── PortfolioRow.tsx
│       │   │   ├── PortfolioTable.tsx
│       │   │   ├── TokenSwapWidget.tsx
│       │   │   └── index.ts
│       │   ├── features/
│       │   │   ├── ProfileDashboard.tsx — NEW: financial dashboard profile
│       │   │   └── index.ts            — Exports ProfileDashboard
│       │   └── index.ts                — Re-exports composites
│       ├── providers/
│       │   └── LocationProvider.tsx     — GPS timeout + Toronto fallback
│       └── styles/
│           ├── theme.ts                — Design tokens (unchanged)
│           └── typography.ts           — Typography system (unchanged)
```

## 7. Remaining Work

### High Priority
- [ ] **Market page rebuild (2E)** — Replace inline tabs with PillTabs, replace inline rows with PortfolioTable. Data adapter needed to map creator API data → PortfolioRowProps. See BUILD_SPEC.md section 2E for exact spec. File: `apps/mobile/app/market.tsx`
- [ ] **Wire real wallet data to profile** — Stats cards (24H CHANGE, EARNINGS TO DATE) currently use placeholders. API endpoints exist: `/api/wallet/balance`, `/api/wallet/snapshots`. Hook exists: `useWalletBalance()`. Connect the real values.
- [ ] **Wire real chart data** — PerformanceChart uses hardcoded sample data. API has `/api/wallet/snapshots` for portfolio history. Hook `usePriceHistory()` exists but isn't connected to PerformanceChart.
- [ ] **Wire real portfolio rows** — PortfolioTable uses sample DEEL/BELLE/NAAN/AURA/SEAM data. Need to fetch actual user token holdings from wallet balance API.

### Medium Priority
- [ ] **Delete/edit posts from profile** — VIEW POSTS tab shows posts but no edit/delete buttons. API has `DELETE /api/posts/[id]`. Add swipe-to-delete or a menu icon per post row.
- [ ] **Profile social links on own profile** — Social icons show on creator detail (`creator/[id].tsx`) but not on ProfileDashboard. User's `socialLinks` data is available via `user.socialLinks`.
- [ ] **Fix NAAN 3% showing green** — PortfolioRow shows negative values in green because sample data has `changePositive: false` but the StatsCard on the profile uses `valueColor="positive"` hardcoded. Should derive from the actual value.
- [ ] **Clean up old profile code** — When USE_DASHBOARD_PROFILE is confirmed stable, remove the old social-media profile rendering below the flag in profile.tsx (~400 lines of dead code).
- [ ] **useSavedPosts guard** — Runs unconditionally even when dashboard is showing. Either add `enabled` param or lazy-mount the old profile component. TODO at profile.tsx line 95.

### Low Priority / Nice to Have
- [ ] **PagerView for creator tabs** — Re-enable swipeable tab swiping once compiled into dev build
- [ ] **Notifications bell on home header** — Removed during redesign. Consider adding as badge on profile tab icon instead.
- [ ] **Landing page on custom domain** — Currently at `landing-eight-puce-10.vercel.app`
- [ ] **Month labels responsive to time range** — PerformanceChart always shows JAN-DEC regardless of 24H/7D/1M range. Should show hours/days for shorter ranges.
- [ ] **Video autoplay in feed** — Some videos show black frames. May need to preload or check URLs.

## 8. Environment & Setup Notes

### Dev Environment
- **WSL2** on Windows (Ubuntu), Node 22 via nvm (`/home/sangeet/.nvm/versions/node/v22.22.2/bin`)
- **pnpm** 10.30.0 for monorepo
- **ADB**: Windows `adb.exe` symlinked at `/home/sangeet/Android/platform-tools/adb`

### Android Emulator
- **AVD**: `Medium_Phone_API_36.1` (API 36, x86_64)
- **Launch**: `/mnt/c/Users/sange/AppData/Local/Android/Sdk/emulator/emulator.exe -avd Medium_Phone_API_36.1 -no-snapshot-load -partition-size 2047`
- **Auth token**: `imb5YbX+2R75ChNO` (at `/mnt/c/Users/sange/.emulator_console_auth_token`)
- **Storage**: Uninstall unused apps if APK install fails (need ~777MB free)

### Metro Bundler
- **Start**: `nohup npx expo start --port 8082 > /tmp/metro.log 2>&1 &`
- **ADB reverse**: `adb reverse tcp:8081 tcp:8082 && adb reverse tcp:8082 tcp:8082` (BOTH ports!)
- **Connect app**: `adb shell am start -a android.intent.action.VIEW -d "exp+momento://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082" com.momento.app`
- **Check logs**: `tail -20 /tmp/metro.log`
- **Metro dies often** on WSL — always use `nohup` and check it's alive before testing

### Build & Deploy
- **EAS build**: `eas build --profile development --platform android --non-interactive`
- **Install APK**: Download from EAS, save to `/mnt/c/Users/sange/Downloads/`, install with `adb install -r 'C:\Users\sange\Downloads\momento-dev.apk'`
- **API deploys automatically** on push to `main` (Vercel)
- **Dev client APK ID**: `d29be976-7629-4d28-9c35-aa27f3bac5df`
- **NOTE**: If you change native modules, you need a new EAS build. JS-only changes hot-reload via Metro.

### Key Env Vars
- `EXPO_PUBLIC_API_URL` = `https://momento-api-ten.vercel.app/api`
- `EXPO_PUBLIC_PRIVY_APP_ID` = `cmjbzyj4q00twlb0d1uc5w0sb`

## 9. Reference Links

- **Landing (live)**: https://landing-eight-puce-10.vercel.app
- **API health**: https://momento-api-ten.vercel.app/api/health
- **EAS builds**: https://expo.dev/accounts/sangeetparashar24/projects/momento/builds
- **Design spec**: `docs/design/BUILD_SPEC.md`
- **Figma screens**: `docs/design/screens/`
- **HTML mockups**: `docs/design/mockups/` (open in browser)
