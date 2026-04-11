# Agent Handoff: Momento Design Alignment + Mobile Testing

> Generated: 2026-04-11
> Session focus: Redesigned landing page and mobile app UI to match Figma mockups, fixed production DB migration, set up Android device testing pipeline

## 1. Project Overview

Momento is a location-based creator monetization platform ("stock market for culture"). Monorepo with `apps/api` (Next.js 15, Vercel), `apps/mobile` (Expo 54, React Native), `apps/landing` (Next.js 15), and `packages/shared` (TypeScript types). Auth via Privy, blockchain via Solana + Base (ETH). Design system: pure black (#000000), #00FF88 green accent, Space Mono monospaced font, all-caps uppercase typography.

## 2. Current State

### Working
- **Landing page** — fully redesigned, deployed at `landing-eight-puce-10.vercel.app`. Polaroid entry → hero ("The Stock Market for Culture") → ticker → showcase (4 phone screens with real Figma screenshots) → footer
- **API** — healthy at `momento-api-ten.vercel.app/api/health`. Root redirects to landing page. All 26 endpoints functional. DB migration for `baseWalletAddress` applied
- **Mobile code** — all 4 redesign phases committed and pushed to `main` (theme tokens, explore grid, creator profile tabs, home feed vertical scroll)
- **Dev client APK** — built via EAS (`d29be976-7629-4d28-9c35-aa27f3bac5df`), installed on Sangeet's Pixel 8 (`47231FDJH001N0`)
- **Multi-chain** — Solana + Base wallet creation, balance fetching, swaps, onramp all working
- **Design reference system** — `CLAUDE.md` + `docs/design/DESIGN_REFERENCE.md` + 20 Figma screenshots in `docs/design/screens/`

### Not Yet Working / In Progress
- **On-device testing** — phone disconnected from USB/ADB during session. The app was installed but couldn't be fully tested through the dev server. Metro tunnel was set up but device went offline before validation
- **Videos not loading** — user reported older videos not loading. Unclear if this is a data issue (sample video URLs expired?) or a code issue from the feed redesign (`contentFit="cover"` + `ResizeMode.COVER` changes)
- **Creator profile navigation** — user reported crash when opening a creator profile. Was fixed by removing PagerView (native module not in build) and using simple `useState` tab switching instead. Needs verification on device
- **Home feed "FOR YOU" algo** — algo button is now a small icon (left of header) instead of the old prominent circle. User may want it more discoverable. Long-press on "FOR YOU" also opens it
- **Manifesto section** — restored with static rendering (no animation). Shows "Creators earn pennies. Fans get likes. Not equity. → Momento flips this." Needs visual verification

## 3. What Was Done This Session

1. **Pulled latest code** — `git stash && git pull` to get multi-chain work merged
2. **Analyzed Figma designs** — extracted 23 assets from `Momento.zip`, launched 5 parallel agents to analyze every screen
3. **Saved design system to memory** — `design_system.md` in `.claude/projects/` memory
4. **Landing page redesign** — `1deb47a`
   - Tailwind: added Cormorant Garamond serif font
   - Hero: thin serif "MOMENTO" / "THE STOCK MARKET FOR CULTURE" / waitlist CTA
   - Navbar: minimal with outlined ghost button
   - Ticker: monospaced multiplier format (DEEL 17X)
   - Showcase: 4 phone screens with real Figma screenshots
   - All typography → monospaced uppercase
5. **Figma screenshots in phone mockups** — `f514a85` — copied `Homepage.png`, `Explore.png`, `Creator Portfolio.png`, `User Account.png` to `apps/landing/public/screens/`
6. **Landing fixes** — removed Manifesto (scroll animation unreliable), then restored with static rendering (`184c832`)
7. **Design reference system** — `26d40cd` — `CLAUDE.md`, `docs/design/DESIGN_REFERENCE.md`, 20 Figma screens in `docs/design/screens/`
8. **Mobile Phase 0** — `2f97e12` — pure black bg, Space Mono font, uppercase headings, tab bar updated
9. **Mobile Phase 2 (Explore)** — `0c84b9b` — no overlays, 2px gaps, sharp corners, edge-to-edge, floating search icon
10. **Mobile Phase 3 (Creator)** — `d0c7260` — PROFILE/POSTS/TOKEN tabs, full-bleed hero, verified dot, feed-style posts, token page
11. **Mobile Phase 1 (Home Feed)** — `966c789` — vertical scroll + peek, "FOR YOU"/"CREATORS TO WATCH" tabs, overlay actions, FlatList (not FlashList)
12. **DB migration** — applied `20260404000000_add_base_wallet_support` directly via `prisma db execute` against production Supabase
13. **API fix** — `e885631` — root redirects to landing, auth reads `PRIVY_APP_ID` as fallback
14. **Creator profile crash fix** — `aa13627` — removed PagerView import, simple tab switching
15. **Dev build + ADB install** — built EAS dev APK, symlinked Windows `adb.exe` from WSL, installed via `adb install`

## 4. Key Decisions & Rationale

| Decision | Why | Alternatives Considered |
|----------|-----|------------------------|
| FlatList instead of FlashList for home feed | FlashList doesn't support `snapToInterval` needed for peek effect | Kept FlashList initially, had to switch |
| Simple `useState` tabs instead of PagerView for creator profile | PagerView is a native module — crashes if not compiled into the dev build. Simple conditional rendering works without native deps | PagerView (swipeable but requires rebuild), react-native-tab-view |
| Cormorant Garamond for landing hero font | Closest Google Font to the thin elegant serif in the Figma splash screen | Playfair Display, Didot (not on Google Fonts) |
| Space Mono for mobile app font | Matches the monospaced terminal aesthetic in Figma. Available as TTF, loaded via expo-font | JetBrains Mono (larger file), IBM Plex Mono |
| Removed ticker banners from home feed | Not present in Figma home screen designs. Still exist on Market page | Kept but hidden, moved to header |
| `contentFit="cover"` for feed images | Figma shows edge-to-edge images filling the card. Was `"contain"` before | Keep contain with dark bars |
| API root redirects to landing | Two separate Vercel deployments — API shouldn't serve its own landing page | Serve landing from API (causes confusion) |
| DB migration via `prisma db execute` not `prisma migrate deploy` | Production DB wasn't initialized with Prisma migrate (no migration history table). Direct SQL was the only option | Baseline + migrate (more complex) |

## 5. Bugs, Failures & Lessons Learned

- **All API 500s were caused by missing DB column**: `The column 'users.baseWalletAddress' does not exist`. The Prisma schema had the column but the migration was never applied to production. Fixed by running SQL directly via `prisma db execute --url`
- **`react-native-pager-view` crash**: The creator profile used PagerView which is a native module. Dev builds compiled before the dep was added don't have it. Fix: use simple `useState` + conditional rendering instead
- **Manifesto "Momento flips this" orphaned text**: The preceding "Creators earn pennies..." text used anime.js scroll-triggered animation with `opacity: 0` initial state. If the trigger didn't fire (common on mobile + some scroll positions), only "Momento flips this." showed with no context. Fix: removed animation, render everything statically
- **ADB from WSL**: The Windows ADB server (`adb -a -P 5037 nodaemon server`) approach doesn't work well — port forwarding between WSL2 and Windows is unreliable. What works: symlink the Windows `adb.exe` directly into WSL PATH (`ln -sf /mnt/c/Users/sange/AppData/Local/Android/Sdk/platform-tools/adb.exe /home/sangeet/Android/platform-tools/adb`)
- **Port 8081 conflict**: Expo defaults to 8081 which was occupied. Use `--port 8082` explicitly
- **EAS build needs `eas-cli` globally**: `npx eas` fails with "could not determine executable". Install with `npm install -g eas-cli`
- **Metro cache**: After adding/removing dependencies, always restart Metro with `--clear` flag
- **Expo Go doesn't work**: The app uses native modules (Privy, PagerView). Expo Go crashes immediately. Must use a dev client build via EAS
- **`vercel logs` requires project linking**: Run `vercel link --project momento-api --yes` first, then `vercel logs --level error --since 1h --no-follow`

## 6. Codebase Map

```
momento/
├── CLAUDE.md                          — Agent instructions: reference design system for all UI work
├── HANDOFF.md                         — This file
├── docs/
│   ├── design/
│   │   ├── DESIGN_REFERENCE.md        — Screen-by-screen specs, gap analysis current vs Figma
│   │   └── screens/                   — 20 Figma PNG exports (home-feed.png, explore.png, etc.)
│   └── DESIGN_SYSTEM.md              — Landing page design tokens
├── apps/
│   ├── api/
│   │   ├── lib/auth.ts               — Privy auth, requireAuth(), reads NEXT_PUBLIC_PRIVY_APP_ID || PRIVY_APP_ID
│   │   ├── app/page.tsx              — Redirects to landing page
│   │   └── prisma/schema.prisma      — DB schema (baseWalletAddress, primaryChain added)
│   ├── landing/
│   │   ├── components/
│   │   │   ├── CreatorLanding.tsx     — Entry: loading → polaroid → AppShowcaseFlow
│   │   │   ├── showcase/AppShowcaseFlow.tsx — Main page: hero + ticker + showcase + footer
│   │   │   └── showcase/*Screen.tsx  — Phone mockups using Figma screenshots
│   │   └── public/screens/           — feed.png, explore.png, creator.png, wallet.png
│   └── mobile/
│       ├── app/(tabs)/home.tsx        — Home feed (vertical scroll, peek, overlay actions)
│       ├── app/(tabs)/explore.tsx     — Explore (pure image masonry, floating search)
│       ├── app/(tabs)/profile.tsx     — User profile (unchanged this session)
│       ├── app/creator/[id].tsx       — Creator profile (PROFILE/POSTS/TOKEN tabs)
│       ├── app/_layout.tsx            — Root layout (loads Space Mono font via expo-font)
│       ├── assets/fonts/              — SpaceMono-Regular.ttf, SpaceMono-Bold.ttf
│       ├── src/styles/theme.ts        — Design tokens (bg #000000, primary #00FF88)
│       ├── src/styles/typography.ts   — Typography system (Space Mono, uppercase headings)
│       └── src/providers/ChainProvider.tsx — Multi-chain context (Solana/Base switching)
└── packages/shared/src/
    ├── constants.ts                   — CHAIN_CONFIG (Solana + Base), SOCIAL_PLATFORMS
    └── types.ts                       — ChainType, PostWithCreator, etc.
```

## 7. Remaining Work

### High Priority
- [ ] **Verify mobile app on device** — reconnect phone via USB, `adb reverse tcp:8082 tcp:8082`, connect to `localhost:8082`. Test: home feed scrolling, explore grid, creator profile tabs, video playback, navigation flow. The APK is already installed (`d29be976`)
- [ ] **Fix video loading** — user reported older videos not loading. Check if sample video URLs (Google Storage bucket) are still valid. May need to update `dummyData.ts` or check if `ResizeMode.COVER` change broke video rendering
- [ ] **Test creator profile fully** — verify PROFILE/POSTS/TOKEN tabs work, hero image loads, post grid renders, follow/unfollow works

### Medium Priority
- [ ] **Notifications bell** — removed from home header during redesign. Currently only accessible from Profile tab. Consider adding back as a small icon or badge
- [ ] **Market page accessibility** — trending-up icon added to home header but may not be discoverable enough. Consider keeping ticker banners or adding a dedicated market tab
- [ ] **Feed algorithm discoverability** — algo is behind an options icon (left of header) + long-press. May need a more visible way to switch between smart/recent/popular/nearby/following
- [ ] **Landing page on custom domain** — currently at `landing-eight-puce-10.vercel.app`. Should be on `momento.network` or `moment.network`

### Low Priority / Nice to Have
- [ ] **PagerView for creator tabs** — re-enable swipeable tabs once PagerView is compiled in the dev build. The native module is in `package.json` already
- [ ] **Landing page Manifesto animation** — currently static. Could add a subtle fade-in on scroll (but test on mobile viewport first)
- [ ] **Explore search UX** — search is behind a floating icon. Could add pull-down-to-search gesture
- [ ] **Token tab real data** — currently shows "—" placeholders and "Coming Soon" chart. Wire up real price data when available

## 8. Environment & Setup Notes

### Dev Environment
- **WSL2** on Windows (Ubuntu), Node 22 via nvm, pnpm 10.30.0
- **ADB**: Windows `adb.exe` symlinked into WSL at `/home/sangeet/Android/platform-tools/adb`. Must have phone connected via USB to Windows
- **Metro**: run from `apps/mobile` with `npx expo start --port 8082`. Port 8081 is often occupied
- **After ADB connect**: always run `adb reverse tcp:8082 tcp:8082` before connecting from dev client

### Build Commands
- **Landing dev**: `pnpm --filter landing dev` (port 3001)
- **Mobile dev**: `npx expo start --port 8082` from `apps/mobile`
- **EAS build**: `eas build --profile development --platform android --non-interactive`
- **Install APK**: `curl -sL <apk-url> -o /tmp/momento.apk && adb install -r /tmp/momento.apk`
- **Vercel logs**: `vercel link --project momento-api --yes && vercel logs --level error --since 1h --no-follow --expand`

### Key Env Vars (Vercel - momento-api)
- `NEXT_PUBLIC_PRIVY_APP_ID` = `cmjbzyj4q00twlb0d1uc5w0sb`
- `PRIVY_APP_SECRET` — set on Vercel, not in repo
- `DATABASE_URL` — Supabase pooler (port 6543)
- `DIRECT_URL` — Supabase direct (port 5432, for migrations)

### Mobile Env (eas.json + .env.development)
- `EXPO_PUBLIC_API_URL` = `https://momento-api-ten.vercel.app/api`
- `EXPO_PUBLIC_PRIVY_APP_ID` = `cmjbzyj4q00twlb0d1uc5w0sb`

## 9. Reference Links

- **Landing (live)**: https://landing-eight-puce-10.vercel.app
- **API health**: https://momento-api-ten.vercel.app/api/health
- **EAS builds**: https://expo.dev/accounts/sangeetparashar24/projects/momento/builds
- **Latest dev build**: https://expo.dev/accounts/sangeetparashar24/projects/momento/builds/d29be976-7629-4d28-9c35-aa27f3bac5df
- **Figma assets**: `/tmp/momento-design/` (extracted from `Momento.zip`) and committed to `docs/design/screens/`
- **Design reference**: `docs/design/DESIGN_REFERENCE.md`
- **Plan file**: `.claude/plans/adaptive-launching-horizon.md`
