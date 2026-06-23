# Discovery Audit: `apps/mobile` (Expo React Native)

> Scope: Exhaustive inventory of the mobile app for the Solana all-in / EVM-removal
> migration. Focus on wallet, trading, onramp/funding, Privy auth, token/balance
> display, and creator-token / token-launch surfaces. All paths are absolute.
> Citations use `file:line`.

---

## 0. Executive Summary

- The app is **dual-chain today**: every wallet/trading/funding/balance surface
  branches on a `useChain()` value of `'solana' | 'base'`. Solana is the default
  and the richer path; Base/EVM is fully wired in parallel (KyberSwap swaps,
  `eth_sendTransaction`, ERC-20 approvals, BaseScan links, ETH embedded wallet).
- **Real, working features (dev build only):** OAuth/email login (Privy), embedded
  Solana + ETH wallet auto-creation, balance polling, in-app **swap** (Jupiter on
  Solana / KyberSwap on Base), **send** (SOL/USDC/ETH), **fiat onramp** via Privy's
  native MoonPay modal, KYC application via Veriff (web browser handoff).
- **Placeholders / not built:** All **creator-token trading** (buy/sell) is a
  "Coming Soon" modal. Creator TOKEN tab uses **hard-coded sample price + chart**.
  Portfolio swap widget is non-functional. **No token-launch wizard, no vesting
  view, no LP/fundraise UI, no tax disclosure surface, and zero references to
  Meteora / Bags / Streamflow** anywhere in the app.
- The strategy's net-new product surfaces (token launch, fundraise/LP config,
  vesting, tax disclosure) are **greenfield** on mobile.

---

## 1. Stack & Build Config

`/home/user/momento/apps/mobile/package.json`
- Expo `~54`, React Native `0.81.5`, React `19.1`, expo-router `~6`.
- **Solana:** `@solana/web3.js` (transitive via shared/api usage), `@solana-mobile/mobile-wallet-adapter-protocol*` `^2.2.6` (Phantom/MWA — used by deeplink interceptor), Privy embedded Solana wallet.
- **EVM/legacy:** `@ethersproject/shims` `^5.8.0` is still a dependency (polyfill for ETH path). No `ethers`/`viem`/`wagmi` packages — EVM tx-building is hand-rolled in `useSwap.ts`/`SendModal.tsx` via raw `provider.request`.
- **Auth/wallet:** `@privy-io/expo` `^0.63.9`, `@privy-io/expo-native-extensions` `0.0.7` (native crypto; absent in Expo Go).
- `react-native-passkeys`, `react-native-qrcode-styled`, `react-native-webview` (onramp WebView fallback).

`/home/user/momento/apps/mobile/app.json`
- `scheme: "momento"` (wallet deeplink callbacks). Plugins: expo-router, splash, location, image-picker, notifications, secure-store, web-browser, **expo-apple-authentication**, expo-video, custom `with-ios-script-sandboxing`. **No Privy/Solana config plugin** — Privy is configured at runtime in `PrivyGuard.tsx`.

`/home/user/momento/apps/mobile/src/config/env.ts`
- Reads `EXPO_PUBLIC_*`. Has BOTH Solana (`SOLANA_RPC_URL`, `SOLANA_NETWORK` default `devnet`) AND Base (`BASE_RPC_URL`, `BASE_CHAIN_ID` default 8453, `BASE_NETWORK` default `mainnet`) env (env.ts:12-25). `PRIVY_APP_ID` from env; **Privy `clientId` is hard-coded** in `PrivyGuard.tsx:64`.

---

## 2. Routing / IA (`apps/mobile/app/**`)

Root stack: `/home/user/momento/apps/mobile/app/_layout.tsx`
- Provider order (_layout.tsx:102-201): `GestureHandlerRootView → SafeAreaProvider → QueryProvider → PrivyGuard → ChainProvider → AuthAwareQueryCacheCleaner → LocationProvider → NotificationProvider → ErrorBoundary → Stack`.
- `useWalletDeeplinkInterceptor` (_layout.tsx:36-77) catches Phantom callback URLs (`wallet_action=`, `phantom_encryption`) so expo-router doesn't 404 — **this is the only place external (Phantom/MWA) wallet connection is acknowledged**; embedded Privy wallets are the primary path.

### Tabs — `app/(tabs)/_layout.tsx`
- **3 visible tabs, icons-only, no labels** (matches design system): `home` (home icon), `explore` (globe), `profile` (person). Active tint = brand green `#00FF88` (_layout.tsx:84).
- A 4th screen `wallet` is registered with `href: null` (hidden from tab bar, _layout.tsx:116-121).

### Screen inventory

| Route file | Purpose | Chain? | Real / Placeholder |
|---|---|---|---|
| `app/index.tsx` | Boot orchestrator: auth → disclaimer → profile-complete → fund-onboarding → home. Prefetches feed/profile. | agnostic | Real |
| `app/login.tsx` | Privy auth: Apple, Google, Email-OTP, + X/Instagram/TikTok modal. | agnostic | Real (needs dev build) |
| `app/setup-profile.tsx` | Onboarding: username, name, avatar, social links. | agnostic | Real |
| `app/fund-wallet-onboarding.tsx` | Post-signup "Fund Your Account" promo → FundWalletModal or skip. | agnostic | Real (static copy) |
| `app/(tabs)/home.tsx` | Feed (For You / Trending). Links to creator/post/market/create-post/notifications. FundWalletModal CTA. | agnostic | Real |
| `app/(tabs)/explore.tsx` | Masonry browse + search; nearby creators (geolocation). Shows `tokenSymbol` on cards. | agnostic | Real |
| `app/(tabs)/profile.tsx` | Dashboard profile (feature-flag `USE_DASHBOARD_PROFILE=true`, profile.tsx:37). Wallet-balance CTA, settings sheet, links to wallet/portfolio/edit/create. KYC entry. | agnostic | Real; old layout dead-code fallback |
| `app/(tabs)/wallet.tsx` | **OLDER/simpler wallet** (536 lines): address card, balance, assets, Swap + ComingSoon only. **No Send/Fund/tx-history.** | **Solana+Base** | Real but **stale duplicate** (see §8) |
| `app/wallet.tsx` | **Fuller wallet** (764 lines): adds Send, Fund, transaction history, fast-polling, RefreshControl. Routed via root Stack `name="wallet"`. | **Solana+Base** | Real |
| `app/portfolio.tsx` | Stats cards, performance chart (real snapshots), token table, **non-functional** TokenSwapWidget. | agnostic | Mixed: data real, swap = Coming Soon |
| `app/market.tsx` | Creator leaderboard (trending/active/top), ticker banners. BUY → **Coming Soon**. | agnostic | Data real, trading placeholder |
| `app/creator/[id].tsx` | Creator profile, 3 tabs PROFILE/POSTS/**TOKEN**. TOKEN tab = **hard-coded price `$0.004` + sample chart** (creator/[id].tsx:66-79), BuySellPills → Coming Soon. | agnostic | **Token data is fake placeholder** |
| `app/user/[id].tsx` | Public user profile; BUY → Coming Soon. | agnostic | Data real, trading placeholder |
| `app/post/[id].tsx` | Post detail (video/image/text), comments, like. | n/a | Real |
| `app/create-post.tsx` | Creator-only composer (media + location + caption). | n/a | Real |
| `app/edit-profile.tsx` | Profile editor incl. creator `tokenSymbol` field + **KYC button/status modal**. | n/a | Real |
| `app/notifications.tsx` | Notification feed; wallet-type notifications deep-link to `/wallet`. | agnostic | Real |
| `app/delete-account.tsx` | Type-DELETE confirm → logout. | n/a | Real |
| `app/settings/_layout.tsx` | Settings stack container. | n/a | Real |
| `app/settings/favorites.tsx` | Saved posts list. | n/a | Real |
| `app/settings/permissions.tsx` | Device permission status (location/camera). | n/a | Real |
| `app/+not-found.tsx` | Catch-all; also handles Phantom wallet callback URLs. | Solana (MWA) | Real |

---

## 3. Providers (`src/providers`)

- **`PrivyGuard.tsx`** — Gates the whole Privy stack. In **Expo Go** (`Constants.appOwnership === 'expo'`) the native crypto module is missing, so it renders children in **guest mode** with no auth (PrivyGuard.tsx:22-43). In a dev build it lazily `require`s `@privy-io/expo`, mounts `PrivyProvider` + `PrivyElements` + `AuthBridge`. **Privy config creates BOTH embedded wallets** (PrivyGuard.tsx:65-70): `embedded.ethereum.createOnLogin` AND `embedded.solana.createOnLogin = 'users-without-wallets'`. `PrivyElements` themed green/dark (required for the funding & signing modals).
- **`AuthBridge.tsx`** — Registers a lazy `getAccessToken()` token getter into the `apiService` singleton so every request carries `Authorization: Bearer` (AuthBridge.tsx:16-32). Has a `__DEV__` one-shot ping to `/debug/auth` (AuthBridge.tsx:36-59).
- **`ChainProvider.tsx`** — Context for `chain` + `availableChains`, persisted to AsyncStorage key `momento_selected_chain` (ChainProvider.tsx:23). **Only accepts `'solana' | 'base'`** (ChainProvider.tsx:33). Auto-falls-back to first available chain if selected one is unavailable (ChainProvider.tsx:56-60). Default = `'solana'`.
- **`QueryProvider.tsx`** — React Query + AsyncStorage persistence + per-user cache cleaner.
- **`LocationProvider.tsx`**, **`NotificationProvider.tsx`** — geolocation + push.

---

## 4. Auth & Wallet Wiring — `src/hooks/useAuth.ts`

- Single hook abstracting Privy; returns `GUEST_AUTH` mock when Privy unavailable (useAuth.ts:46-64, 76-81).
- **Auto-creates a Solana embedded wallet** 1.5s after login if `status === 'not-created'` (useAuth.ts:110-131), then **auto-creates an ETH embedded wallet** 2s after (useAuth.ts:135-159).
- Exposes both: `walletAddress` + `getWalletProvider()` (Solana) and `ethWalletAddress` + `getEthWalletProvider()` (Base) (useAuth.ts:200-228, 242-248).
- **Drives `availableChains`** (useAuth.ts:189-195): pushes `'solana'` if SOL wallet exists, `'base'` if ETH wallet exists. **Because ETH wallets are auto-created for everyone, every OAuth user ends up multi-chain**, which is exactly what the migration must reverse.
- Migration note: removing Base = drop `embedded.ethereum` from `PrivyGuard`, delete the ETH auto-create effect (useAuth.ts:133-159) and all `eth*` fields, and hard-set `availableChains = ['solana']`.

---

## 5. Trading UI (Solana + EVM)

### `src/hooks/useSwap.ts` — **dual-chain**
- Solana flow: `GET /wallet/swap` (Jupiter quote w/ platform fee) → `POST /wallet/swap` returns base64 unsigned `VersionedTransaction` → Privy Solana provider `signAndSendTransaction` via a `Connection` to `EXPO_PUBLIC_HELIUS_RPC_URL` (useSwap.ts:265-307).
- Base flow: KyberSwap quote (`chain=base`) → ERC-20 `approve` calldata hand-encoded (useSwap.ts:64-70) → `eth_sendTransaction` for approve + swap, poll `eth_getTransactionReceipt` (useSwap.ts:185-262). `BASE_CHAIN_ID_HEX = '0x2105'` hard-coded.
- Quote carries `platformFee?: { amount, feeBps }` (useSwap.ts:34) — **this is the existing hook for the in-app tax**. Quote max-age 30s.

### `src/components/features/SwapModal.tsx` — **dual-chain**
- Full native swap sheet: token select (SOL/USDC or ETH/USDC), MAX, debounced quote, price-impact + min-received, progress states, success screen with explorer link.
- Header literally says "Powered by Jupiter" / "Powered by KyberSwap" (SwapModal.tsx:357-359).
- Docstring notes the **"4% platform fee"** (SwapModal.tsx:77) but the **fee % is never displayed to the user** (`platformFeeAmount` is computed at SwapModal.tsx:257-261 but unused). **Tax disclosure (1% vs 10%) would slot here** + on the (future) trade confirmation.
- `MIN_SWAP`, `MIN_NATIVE_FOR_FEES` per chain (SwapModal.tsx:50-55). Persists tx record to AsyncStorage + logs to `/wallet/transactions/log`.

### `src/components/composites/TokenSwapWidget.tsx` — **presentational stub**
- Pure UI (two gradient "Select Token" cards + flip arrow). No chain logic, no wiring. Used in `portfolio.tsx` with both selectors bound to `handleComingSoon`. Designed per Figma `user-account-2.jpg`.

### `src/components/features/SendModal.tsx` — **dual-chain**
- Send SOL/USDC (Solana) or ETH/USDC (Base). Solana: `POST /wallet/send` → deserialize → `provider.signTransaction` → `connection.sendRawTransaction` (SendModal.tsx:228-259). Base: `eth_sendTransaction` + receipt poll (SendModal.tsx:170-226). Chain-aware address regex (SendModal.tsx:121-124).

### Creator-token "trading" (all placeholder)
- `app/creator/[id].tsx` TOKEN tab, `app/market.tsx`, `app/user/[id].tsx`, `app/portfolio.tsx`, `components/composites/BuySellPills.tsx` → all route to `ComingSoonModal` ("Trading Coming Soon"). No real creator-token buy/sell exists.

---

## 6. Onramp / Funding

### `src/hooks/usePrivyFunding.ts` — **PRIMARY, recommended path** (dual-chain)
- Uses Privy's prebuilt funding modal: `useFundSolanaWallet` (Solana) / `useFundWallet` (Base) (usePrivyFunding.ts:33-34). Both target `asset: 'USDC'`, `defaultPaymentMethod: 'card'`, **`card.preferredProvider: 'moonpay'`**, themed green (usePrivyFunding.ts:51-77). **This is the MoonPay-via-Privy fiat onramp the strategy calls for — already implemented.** Sandbox toggled off `SOLANA_NETWORK`/`BASE_NETWORK`. Requires `PrivyElements` mounted + MoonPay plugin enabled in Privy dashboard.

### `src/hooks/useOnramp.ts` + WebView providers — **legacy/secondary**
- `GET /wallet/onramp?provider=&chain=` returns a single-use widget URL. Provider type = `'ramp' | 'moonpay' | 'transak'` (shared types). Rendered in a `WebView`.

### `src/components/features/FundWalletModal.tsx`
- Picker with: **"Buy USDC" (Privy native — RECOMMENDED)** → calls `usePrivyFunding().fund()`; **"Transfer from Wallet"** (on-chain receive: copy/share address); **Ramp** and **MoonPay** cards shown but flagged **"COMING SOON" / disabled** (FundWalletModal.tsx:188-222). Transak not surfaced. Chain-aware copy throughout (FundWalletModal.tsx:336-461 OnChainTransfer; e.g. "Send SOL or USDC from Phantom…").

---

## 7. Balance / Token Display

- `src/hooks/useWalletBalance.ts` — `GET /wallet/balance?chain=`; query key `['walletBalance', userId, chain]`; 30s poll (10s fast-poll for 60s after a tx), pauses when backgrounded (useWalletBalance.ts:32-49).
- `src/hooks/useWalletTransactions.ts`, `usePriceHistory.ts` (`usePortfolioSnapshots`), `useCreatorLeaderboard.ts`.
- `WalletBalance` shared type carries both `nativeBalance` and a legacy `solBalance`, plus `tokens: TokenHolding[]`, `change24h`, `earningsToDate` (`packages/shared/src/types.ts:173-183`). Wallet/portfolio screens read `nativeBalance ?? solBalance` defensively.
- Composites: `PortfolioTable`, `PortfolioRow`, `PerformanceChart`, `StatsCard`, `BuySellPills`, `PillTabs` (`src/components/composites/`).

---

## 8. Notable Findings / Risks / Unknowns

1. **EVM/Base is pervasive, not isolated.** Removing Base touches: `PrivyGuard` config, `useAuth` (ETH auto-create + all `eth*` fields), `ChainProvider`/`useChain` (the `'base'` union member), `useSwap`, `SwapModal`, `SendModal`, `FundWalletModal`, `usePrivyFunding`, both wallet screens, `shared/constants.ts` `CHAIN_CONFIG.base`, and `shared/types.ts` (`ChainType`, `baseWalletAddress`, `primaryChain`). Plan a coordinated removal, not a screen-by-screen one.

2. **Duplicate wallet screens (real bug/risk).** `app/(tabs)/wallet.tsx` (536 lines, no Send/Fund/tx-history) and `app/wallet.tsx` (764 lines, full) are **divergent copies**. The tab one is hidden (`href:null`) and appears stale; navigation goes to the root `wallet` screen. Decide which is canonical before adding features to avoid double-maintenance.

3. **Creator-token economics are 100% greenfield on mobile.** No token-launch wizard, no vesting (Streamflow), no LP/fundraise/threshold UI, no split-config UI, **no Meteora/Bags references**. The creator TOKEN tab shows fabricated price/chart (`creator/[id].tsx:66-79`) — must be replaced with a real token-status surface.

4. **Tax (1% in-app vs 10% elsewhere) is not disclosed in UI.** A `platformFee/feeBps` field exists in the swap quote but is computed-and-discarded in `SwapModal` (SwapModal.tsx:257-261). No tax/fee breakdown is shown anywhere. The "4%" docstring is stale vs the new 1%/10% model.

5. **Hard-coded values to migrate:** Privy `clientId` (`PrivyGuard.tsx:64`), Base chain-id hex `0x2105` (`useSwap.ts`, `SendModal.tsx`), Solana token mints duplicated in `useSwap.ts:22-25` and `shared/constants.ts`. Default `SOLANA_NETWORK` is `devnet` (env.ts:16) — confirm mainnet for launch.

6. **Auth only works in a dev build** (not Expo Go) — Privy native crypto. Any QA of wallet/trading/onramp must use a dev/EAS build.

7. **Onramp duplication:** Privy-native funding (the desired MoonPay path) coexists with a legacy server-URL `useOnramp` + WebView (Ramp/MoonPay/Transak). The legacy provider cards are disabled. Recommend deleting the legacy onramp path during migration.

8. **External wallet (Phantom/MWA) is half-present:** `@solana-mobile/*` deps + deeplink interceptor exist, but the embedded Privy wallet is the only funded/used path. Clarify whether external-wallet connect is in scope.

### Where new strategy features slot in
- **Token launch wizard:** New stack route (e.g. `app/creator/launch-token.tsx`) reachable from `app/(tabs)/profile.tsx` (creator branch) and `app/edit-profile.tsx` (already has `tokenSymbol` field). New hook `useTokenLaunch` mirroring `useSwap`'s quote→build→Privy-sign pattern; backend builds Meteora/Bags txs, mobile signs via `getWalletProvider()`.
- **LP / fundraise / split config:** Part of the launch wizard (sliders for % LP vs USDC pair, % platform, % returned-as-tokens) + a live fundraise-status screen reusing `PerformanceChart`/`StatsCard`.
- **Vesting (Streamflow) view:** New tab/section on `creator/[id].tsx` TOKEN tab and a holder-side view in `portfolio.tsx`; new `useVesting` hook over a `/vesting` endpoint.
- **Tax disclosure:** Add fee breakdown row in `SwapModal.tsx` (wire up the already-present `platformFee`) and in the future creator-token buy/sell confirmation; reuse `DisclaimerModal` patterns.
- **Real creator-token trading:** Replace `ComingSoonModal` usages in `market.tsx`, `creator/[id].tsx`, `user/[id].tsx`, `portfolio.tsx`, `BuySellPills.tsx` with a real flow built on the existing `useSwap`/`SwapModal` infrastructure (Jupiter/Meteora-routed).
