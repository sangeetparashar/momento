# 09 — Current Onramp / Funding Implementation (Audit)

> Audit date: 2026-06-23. Scope: how fiat → wallet funding works **today** in Momento, to ground a separate Moonpay-via-Privy research effort.
> All paths are repo-relative to `/home/user/momento`. Line numbers refer to the files as they exist at audit time.

---

## 0. TL;DR

There are **two parallel onramp paths in the codebase**, only one of which is the intended go-forward:

1. **Privy native funding modal ("Buy USDC")** — the *recommended*, actively-wired path. Mobile calls Privy's `useFundSolanaWallet()` / `useFundWallet()` hooks directly; Privy opens its own modal and routes to **MoonPay** (its configured card provider). No Momento server involvement. **Code is shipped but BLOCKED**: it does nothing useful until the *MoonPay Fiat On-Ramp plugin* is enabled in the Privy dashboard (a manual request-and-wait step, not yet done at the time the docs were written). Asset is **USDC on Solana** (devnet/mainnet-beta derived from `SOLANA_NETWORK`).

2. **Legacy server-built WebView URLs (Ramp / MoonPay / Transak)** — the older, *bespoke* path. `apps/api/app/api/wallet/onramp/route.ts` builds a hosted-widget URL per provider; mobile renders it in a `WebView`. In the current UI, **Ramp and MoonPay are visually present but marked "COMING SOON" and disabled**; Transak is **not even shown in the picker**. This path is effectively dormant in the UI but the server route is fully implemented and live.

So: the **only user-reachable fiat onramp** is the Privy "Buy USDC" card, and it is **gated on a Privy dashboard toggle**. The MoonPay-via-Privy direction the strategy wants is *already the wired design* — the gap is operational (enable plugin, verify Expo SDK behavior, go to mainnet), not a code rewrite.

---

## 1. Architecture overview (mobile → ??? → provider)

There is no single architecture; there are two, picked by which card the user taps in `FundWalletModal`.

### Path A — Privy native (recommended, "Buy USDC" card)

```
FundWalletModal ("Buy USDC" card)
  → usePrivyFunding().fund()
    → @privy-io/expo/ui useFundSolanaWallet().fundWallet({...})   (Solana)
      / useFundWallet().fundWallet({...})                          (Base)
    → Privy native modal (rendered by <PrivyElements/> in PrivyGuard)
    → Privy routes to MoonPay (card / Apple Pay / Google Pay)
    → MoonPay settles USDC directly to the user's Privy embedded wallet
  → on resolve: queryClient.invalidateQueries(['walletBalance', userId, chain])
```
**No Momento API call. No server URL builder. No webhook.** The client promise resolution is the only completion signal.

### Path B — Legacy server WebView (dormant in UI)

```
FundWalletModal (ramp / moonpay / transak card)
  → useOnramp({provider, chain}) → GET /api/wallet/onramp?provider=&chain=
    → route.ts: requireAuth + getWalletForChain
    → buildRampUrl / buildMoonPayUrl / buildTransakUrl
    → { success, data: { url, provider, coin:'USDC', walletAddress, chain } }
  → <WebView source={{uri: data.url}}>
  → provider hosted widget handles payment + KYC + settlement to wallet address
  → completion detected by URL sniffing in onNavigationStateChange (→ auto-close)
```

---

## 2. File-by-file findings

### 2.1 `apps/mobile/src/hooks/usePrivyFunding.ts` (Path A core)

- Imports `useFundWallet` and `useFundSolanaWallet` from `@privy-io/expo/ui` (lines 2, 33–34). Both hooks are called unconditionally (rules of hooks); the active one is chosen at call time by `chain`.
- `fund()` (lines 38–95):
  - Picks wallet address: `ethWalletAddress` for Base, `walletAddress` (Solana) otherwise (lines 39–40). Errors with a toast if no address (lines 42–47).
  - **Solana branch** (lines 64–76): `fundSolanaWallet({ address, asset: 'USDC', cluster: { name: useSandbox ? 'devnet' : 'mainnet-beta' }, defaultPaymentMethod: 'card', card: { preferredProvider: 'moonpay' }, moonpay: { useSandbox, uiConfig: { theme:'dark', accentColor:'#00FF88' } } })`.
  - **Base branch** (lines 51–62): same shape minus `cluster`, with `useSandbox` derived from `BASE_NETWORK`.
  - **Asset is hard-coded `'USDC'`** for both chains. **Provider is explicitly pinned to MoonPay** via `card.preferredProvider: 'moonpay'` and a `moonpay` config block (lines 57–61, 71–75).
  - Sandbox vs production: derived purely from network flags — Solana `ENV.SOLANA_NETWORK !== 'mainnet-beta'` (line 64), Base `ENV.BASE_NETWORK !== 'mainnet'` (line 52). **No separate onramp env var.**
  - On success: invalidates `['walletBalance', user?.id, chain]` (line 81) and returns `'completed'`. Cancel detected by `code.includes('cancel')` → `'cancelled'` (lines 85–87). Otherwise toast + `'error'`.
- Header comment (lines 10–25) states the design intent explicitly: "Replaces the bespoke MoonPay/Ramp/Transak WebView-URL flow. Privy routes to its configured card/onramp providers (MoonPay, Coinbase)…" and requires `<PrivyElements/>` mounted + "MoonPay fiat-onramp plugin enabled in the Privy dashboard (Phase 0)."

> **Note on SDK surface:** the funding-hook arg shape used here (`card.preferredProvider`, `moonpay.useSandbox`, `moonpay.uiConfig`, Solana `cluster` as an object) is what the code assumes. The Privy Expo SDK is pinned at `@privy-io/expo: ^0.63.9` (`apps/mobile/package.json:18`). `node_modules` was not available at audit time, so the exact runtime acceptance of these specific keys could not be confirmed against the installed `.d.ts` — this should be verified on a dev build (see Risks). The docs themselves flag this exact uncertainty (see §2.5 Q "verify before building").

### 2.2 `apps/mobile/src/hooks/useOnramp.ts` (Path B client fetch)

- Thin React Query wrapper over `GET /wallet/onramp` (lines 33–41). Defaults: `provider='ramp'`, `chain='solana'` (lines 29–30). `staleTime: 0`, `gcTime: 0` because "widget URLs are single-use/time-limited" (line 38). `enabled` gated so it only fires when the WebView screen is open.
- Returns `OnrampUrlResponse` (typed in shared). Still fully functional — but only consumed by the dormant WebView branch.

### 2.3 `apps/mobile/src/components/features/FundWalletModal.tsx` (UX shell, both paths)

- `FundingMethod = 'picker' | 'privy' | OnrampProvider | 'onchain'` (line 26).
- Header titles map (lines 28–35) still references "Buy USDC via Ramp/MoonPay/Transak" for the legacy webview titles.
- `handleSelect` (lines 60–70): if method is `'privy'`, calls `fund()` directly (Privy modal opens over the sheet) and closes on `'completed'`; otherwise sets the sub-screen.
- **MethodPicker (lines 123–232)** — what the user actually sees, in order:
  1. **"Buy USDC" — Privy native** (lines 139–166). Green RECOMMENDED badge. Subtitle "Card, Apple Pay, or Google Pay. Powered by Privy — no extra account needed." This is the live, enabled option.
  2. **"Transfer from Wallet"** (on-chain) (lines 168–186). Always enabled. Shows the user's wallet address + copy/share + chain-specific instructions (Solana: send SOL or USDC from Phantom/Solflare; Base: ETH/USDC). This is the only *guaranteed-working* funding method today (no provider dependency).
  3. **"Ramp" — `styles.methodCardDisabled` + COMING SOON badge** (lines 188–204). Wired to `onSelect('ramp')` but visually disabled.
  4. **"MoonPay" — disabled + COMING SOON** (lines 206–222). Wired to `onSelect('moonpay')`.
  - **Transak is NOT rendered** in the picker at all, despite full server support.
- `OnrampWebView` (lines 244–330): renders the legacy provider URL in a `WebView`. Completion is detected by sniffing the navigation URL for `transak.com/complete`, `status=completed`, `moonpay.com/transaction_receipt`, `rampnetwork.com/success` (lines 257–270) and auto-closing after 2s. This is brittle URL-matching, not a webhook.
- `OnChainTransfer` (lines 336–462): self-contained address-display screen.
- Where the modal is mounted: `app/(tabs)/profile.tsx:614`, `(tabs)/explore.tsx:558`, `(tabs)/home.tsx:428`, `app/wallet.tsx:428`, `app/fund-wallet-onboarding.tsx:87`. Note `app/(tabs)/wallet.tsx` "Buy crypto" button instead shows a ComingSoon modal (`wallet.tsx:69–72`) and routes users to the profile screen's modal.

### 2.4 `apps/api/app/api/wallet/onramp/route.ts` (Path B server)

- `PROVIDERS = ['ramp','moonpay','transak']` (line 8). GET handler (lines 237–297): rate-limited (`readLimiter`), `requireAuth`, validates provider, resolves wallet via `getWalletForChain(user, chain)`.
- Returns envelope `{ success, data: { url, provider, coin:'USDC', walletAddress, chain } }` (lines 277–286). **Asset is always USDC.**
- **Ramp** `buildRampUrl` (lines 18–41): hosted URL `app.rampnetwork.com` (prod) / `app.demo.rampnetwork.com` (sandbox). Asset code `SOLANA_USDC` / `BASE_USDC` (line 29). Params include `hostApiKey` (`RAMP_API_KEY`), `userAddress`, `fiatCurrency: USD`. **Plain query-string URL — no signature.** Env: `RAMP_API_KEY`, `RAMP_ENVIRONMENT` (default `sandbox`).
- **MoonPay** `buildMoonPayUrl` (lines 49–72): hosted URL `buy.moonpay.com` (prod) / `buy-sandbox.moonpay.com` (sandbox). `currencyCode = usdc_sol / usdc_base` (line 60). Params: `apiKey` (falls back to literal `'pk_test_123'` if unset, line 63), `walletAddress`, `baseCurrencyCode: usd`, `colorCode: #00FF88`, `showWalletAddressForm: false`. **⚠ NOT URL-signed** — MoonPay production requires an HMAC `signature` query param (`MOONPAY_SECRET_KEY`) which is absent here, so this URL would be **rejected by MoonPay in production**. Works only in sandbox/unsigned mode. Env: `MOONPAY_API_KEY`, `MOONPAY_ENVIRONMENT` (default `sandbox`). No secret key referenced anywhere.
- **Transak** (lines 84–227): the most built-out provider. Two-step signed-session flow: `getTransakAccessToken()` exchanges `TRANSAK_API_KEY` + `TRANSAK_API_SECRET` (via `api-secret` header) for an access token (in-memory cached 6 days, lines 84–141), then `POST /api/v2/auth/session` to mint a single-use `widgetUrl` (lines 178–219). Falls back to `buildTransakDirectUrl` (unsigned direct params) on any failure (lines 150–176, 211–226). Env (env-suffixed): `TRANSAK_API_KEY[_STAGING]`, `TRANSAK_API_SECRET[_STAGING]`, `TRANSAK_ENVIRONMENT` (default `STAGING`). Hard-codes `referrerDomain: 'momento-api-ten.vercel.app'` (line 195).
- **No completion webhook on the server** for any provider — the route only mints URLs. (The only webhook in `app/api` is `kyc/webhook` for Veriff creator KYC, unrelated to onramp.)

### 2.5 Docs: `docs/privy-onramp-setup.md` and `docs/privy-onramp-flow.html`

- **`privy-onramp-setup.md`** — operational checklist. Key facts:
  - **Status (line 3–5):** "Code shipped… **Blocked on one dashboard step**" — the "Buy USDC" button is live but **no provider appears until the MoonPay plugin is enabled in the Privy dashboard.**
  - **Step 1 (lines 10–22):** Privy Console → app `cmjbzyj4q00twlb0d1uc5w0sb` → Plugins → **MoonPay Fiat On-Ramp → Request Access** → wait for Privy review (they may collect basic KYB about Momento for MoonPay) → toggle on. "This is the only thing standing between the current code and a working onramp."
  - **No service account / no fee (line 6, 60–61):** explicitly the "no-service-account" path — no MoonPay merchant account, no API keys, **no developer fee** (deferred by design). Monetization is via the existing 4% Jupiter trading fee instead.
  - **Sandbox/prod (line 29):** auto-derived from `SOLANA_NETWORK` / `BASE_NETWORK`. Dev = MoonPay sandbox; mainnet = live MoonPay.
  - **Device caveat (lines 33–36):** onramp hooks only work in a **dev/native build**, not Expo Go (no Privy native module; app falls back to guest mode).
  - **SDK (line 55):** `@privy-io/expo@0.63.9`, hooks from `@privy-io/expo/ui`.
- **`privy-onramp-flow.html`** — design-decision doc. Confirms:
  - Decision (2026-05-31): **widget onramp, no Bridge account, no fee.** The fee path (Bridge) would require a standalone Bridge account + business KYB + USD payout account + webhooks + is **Base/EVM-only** — explicitly deferred.
  - Widget path is "Base AND Solana", cards + Apple/Google Pay, **provider auto-selected by Privy (Meld / MoonPay / Coinbase)** by region; KYC is **provider-side, not Momento's**; **no custody / no money-transmitter exposure** since funds settle straight to the embedded wallet.
  - **Open uncertainty (lines 196–199, 226):** Privy's onramp hooks are documented for `@privy-io/react-auth` (web). The doc flags "**Confirm the equivalent hook exists in the Expo SDK**" as a pre-build risk, with the legacy WebView route as the fallback. The shipped code (`usePrivyFunding.ts`) resolves this by using `useFundWallet`/`useFundSolanaWallet` from `@privy-io/expo/ui` (a *funding* hook, not the web `useFiatOnramp`).

---

## 3. Cross-cutting facts

| Concern | Current state |
|---|---|
| **Provider(s) wired** | Path A: **MoonPay via Privy** (pinned). Path B server: Ramp (unsigned URL), MoonPay (unsigned URL, prod-broken), Transak (signed 2-step + unsigned fallback). |
| **User-reachable today** | Only **Path A "Buy USDC"** (gated on Privy plugin) + **on-chain transfer** (always works). Ramp/MoonPay = disabled "COMING SOON"; Transak = hidden. |
| **Asset / chain** | **USDC** everywhere (hard-coded). Solana USDC mint `EPjFW…Dt1v` (6 decimals) per `CHAIN_CONFIG.solana`. Base USDC `0x8335…2913`. SOL/native is NOT an onramp target — native top-ups only via on-chain transfer. |
| **Solana cluster** | Path A: `cluster.name = devnet | mainnet-beta` from `SOLANA_NETWORK` (`usePrivyFunding.ts:64,69`). |
| **Fees** | **No Momento onramp fee** (deferred). Users pay provider's spread/fees. Momento earns only on trading (`MOMENTO_PLATFORM_FEE_BPS=400`, Jupiter). |
| **KYC linkage** | **Onramp KYC is provider-side** (MoonPay/Privy), with **zero coupling to Momento's own KYC.** Momento's Veriff KYC (`apps/api/app/api/kyc/webhook/route.ts`, `VERIFF_*`, `SKIP_KYC`) is exclusively for **creator onboarding**, not funding. No shared identity, no gating of funding on Momento KYC. |
| **Completion signal** | Path A: client promise resolution → balance query invalidation (no webhook). Path B: WebView URL string-sniffing (`FundWalletModal.tsx:257–270`). No server-side settlement confirmation in either path. |
| **Custody** | None — funds settle directly to the user's Privy embedded wallet in both paths. |

### Env vars (onramp-relevant)
- **Privy native path needs essentially no new env** — only the Privy `appId`/`clientId` (already set: `NEXT_PUBLIC_PRIVY_APP_ID` / `EXPO_PUBLIC_PRIVY_APP_ID`, app id `cmjbzyj4q00twlb0d1uc5w0sb`) and the network flags `EXPO_PUBLIC_SOLANA_NETWORK` / `EXPO_PUBLIC_BASE_NETWORK`.
- **Legacy server path env** (`apps/api/.env.local.example:43–62`): `RAMP_API_KEY`, `RAMP_ENVIRONMENT`; `TRANSAK_API_KEY`, `TRANSAK_ENVIRONMENT` (+ implied `_STAGING`/`_SECRET` variants referenced in code); `MOONPAY_API_KEY`, `MOONPAY_ENVIRONMENT`. **No `MOONPAY_SECRET_KEY`** anywhere — confirms MoonPay URL signing is not implemented.

---

## 4. Stubbed vs. working

| Item | Status |
|---|---|
| Privy "Buy USDC" → MoonPay (Solana USDC) | **Code complete, runtime-blocked** on Privy dashboard plugin enablement + dev-build verification. Not functional for users yet. |
| On-chain transfer (address display) | **Working** (no external dependency). |
| Server `/api/wallet/onramp` — Ramp | Implemented; URL unsigned; **UI-disabled** ("COMING SOON"). Needs real `RAMP_API_KEY`. |
| Server `/api/wallet/onramp` — MoonPay | Implemented but **prod-broken (no URL signature)**; **UI-disabled**. |
| Server `/api/wallet/onramp` — Transak | **Most complete** server impl (signed session); **hidden from UI**. Needs real keys. |
| Onramp completion webhook / reconciliation | **Not implemented** (URL-sniffing / promise-resolution only). |
| Momento onramp fee | **Intentionally absent.** |

---

## 5. Gap to "MoonPay via Privy" (the strategy target)

**The wired design IS "MoonPay via Privy."** `usePrivyFunding.ts` already pins `card.preferredProvider: 'moonpay'` and passes a `moonpay` config block on the Solana funding hook. So the remaining gap is **operational + verification, not architectural**:

1. **Enable the MoonPay Fiat On-Ramp plugin** in the Privy dashboard for app `cmjbzyj4q00twlb0d1uc5w0sb` (Request Access → Privy/MoonPay review/KYB → toggle on). Until then, tapping "Buy USDC" opens an empty Privy modal. *(This is the single hard blocker per `privy-onramp-setup.md`.)*
2. **Verify the Expo SDK actually honors the passed config** — `@privy-io/expo@0.63.9` `useFundSolanaWallet`: confirm it accepts `asset:'USDC'`, `cluster:{name}`, `card.preferredProvider:'moonpay'`, and the `moonpay` block, and that MoonPay (not Coinbase) is what loads. The flow doc itself flags Expo-vs-react-auth hook parity as the key pre-build unknown.
3. **Go mainnet** — set `EXPO_PUBLIC_SOLANA_NETWORK=mainnet-beta` so `useSandbox=false` and live MoonPay (not sandbox) is used; confirm MoonPay supports USDC-on-Solana payout in target regions.
4. **Confirm "does Privy native funding already route to MoonPay?"** — Privy auto-selects among MoonPay/Coinbase/Meld by region. The code *requests* MoonPay via `preferredProvider`, but whether Privy honors that vs. region-overriding it is provider-config-dependent and must be confirmed once the plugin is live.
5. **Optional cleanup** — decide the fate of the dormant `/api/wallet/onramp` route + WebView branch (keep as fallback per flow-doc Q4, or delete). The disabled Ramp/MoonPay/Transak cards in the picker are dead UI today.

**What is NOT needed** for MoonPay-via-Privy: no Momento MoonPay merchant account, no MoonPay API/secret keys, no server URL signing, no webhook, no DB table, no Bridge/KYB. (Trade-off: this path yields **no Momento onramp fee** — accepted by design.)

---

## 6. Key file index

- `apps/mobile/src/hooks/usePrivyFunding.ts` — Path A core (Privy MoonPay funding).
- `apps/mobile/src/hooks/useOnramp.ts` — Path B client fetch (legacy).
- `apps/mobile/src/components/features/FundWalletModal.tsx` — UX shell for both paths (lines 139–222 picker, 244–330 webview).
- `apps/mobile/src/providers/PrivyGuard.tsx` — mounts `<PrivyProvider>` + `<PrivyElements>` (required for funding hooks); themes modal `#00FF88` (lines 76–78); embedded wallet creation for both chains (lines 65–70).
- `apps/api/app/api/wallet/onramp/route.ts` — Path B server URL builders (Ramp/MoonPay/Transak).
- `apps/api/lib/auth.ts:212–218` — `getWalletForChain`.
- `packages/shared/src/types.ts:200–209` — `OnrampProvider`, `OnrampUrlResponse` (no Privy type — Path A bypasses shared types).
- `packages/shared/src/constants.ts:11–35` — `CHAIN_CONFIG` (USDC mints/decimals).
- `apps/api/.env.local.example:43–62` — onramp env vars (no MoonPay secret).
- `apps/mobile/.env.example` — `EXPO_PUBLIC_SOLANA_NETWORK` / `_BASE_NETWORK` drive sandbox flag.
- `docs/privy-onramp-setup.md`, `docs/privy-onramp-flow.html` — setup checklist + design decision (no-account, no-fee, MoonPay plugin).
- Git: commit `e1b5da2` "feat(onramp): Privy native funding modal (Buy USDC) — no service account, no fee" introduced Path A.
