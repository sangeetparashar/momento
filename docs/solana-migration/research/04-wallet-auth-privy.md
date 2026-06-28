# 04 — Wallet, Auth & Privy Integration Audit

**Scope:** Discovery audit of the Privy + auth + embedded-wallet integration end-to-end (mobile + backend), in service of the "all-in on Solana, remove EVM/Base" migration.
**Date:** 2026-06-23
**Status:** Discovery only. No code changed.

---

## 0. Executive Summary

Momento uses **Privy** for both authentication and embedded wallets. Login is social/email-OTP via `@privy-io/expo` (v0.63.9) on mobile; the backend verifies the Privy access token via `@privy-io/server-auth` (v1.32.5). On first login the server lazily creates a `User` row keyed by `privyUserId`, pulling wallet addresses from Privy's linked accounts.

**Critical finding for the Solana strategy:** the app currently provisions **BOTH** a Solana embedded wallet **and** an Ethereum (Base) embedded wallet for every user (`PrivyGuard.tsx:65-70`, `useAuth.ts:108-159`). The DB schema and auth layer are dual-chain (`walletAddress` + `baseWalletAddress`, `primaryChain`).

**Biggest gap:** There is **no server-side / delegated signing of any kind.** Every on-chain action today is built unsigned server-side and signed **client-side** by the user's Privy embedded wallet. There is no Privy server-wallet, no delegated session signer, no key quorum, and no programmatic signing path. The only server keypair anywhere is a one-off ops script (`scripts/create-fee-atas-send.ts`) that reads a local `id.json`. For the planned programmatic flows (mint token, create LP/pool, claim fees, create vesting) **none of the required signing infrastructure exists yet.**

Privy fiat onramp **is** already wired via Privy's native funding modal (MoonPay), in parallel with a legacy bespoke onramp URL-builder (Ramp/MoonPay/Transak) that still ships.

---

## 1. Package Inventory & Versions

### Mobile (`apps/mobile/package.json`)
- `@privy-io/expo` — **^0.63.9** (resolved `0.63.9`, `pnpm-lock.yaml:1502`)
- `@privy-io/expo-native-extensions` — **0.0.7** (native crypto/AES module; required for Privy to work — see Expo Go caveat below)
- `react-native-passkeys` — `^0.3.3` (Privy passkey support, present but not seen used in auth flow)
- Solana stack: `@solana-mobile/mobile-wallet-adapter-protocol*` `^2.2.6` (external wallet adapter / Phantom deeplink path), `buffer`, `react-native-get-random-values`, `fast-text-encoding`
- EVM shims: `@ethersproject/shims` `^5.8.0` (Base support)

### Backend (`apps/api/package.json`)
- `@privy-io/server-auth` — **^1.0.0** (resolved **1.32.5**, `pnpm-lock.yaml:1559`)
- `@solana/web3.js`, `@solana/spl-token` `^0.4.14`
- No `@solana/spl-token` server-signing; no `@meteora`, `@raydium`, vesting, or token-launch SDKs anywhere.

---

## 2. Mobile — Privy Provider & Config

### Provider tree (`apps/mobile/app/_layout.tsx`)
Order: `GestureHandlerRootView > SafeAreaProvider > QueryProvider > PrivyGuard > ChainProvider > LocationProvider > NotificationProvider > Stack` (`_layout.tsx:102-201`).

### PrivyGuard (`apps/mobile/src/providers/PrivyGuard.tsx`)
- **Expo Go guard:** If `Constants.appOwnership === 'expo'` (Expo Go), Privy is disabled and the app runs in a "guest mode" preview (`PrivyGuard.tsx:23-39`). Privy only works in a dev/standalone build because `@privy-io/expo-native-extensions` (native `ExpoCryptoAES`) isn't available in Expo Go.
- **PrivyProvider config (`PrivyGuard.tsx:62-71`):**
  - `appId={ENV.PRIVY_APP_ID}` (from env)
  - `clientId="client-WY6UDfFofojZafsbGzmGDGYExCP86xeQuKCcUvoyGmpqZ"` — **hard-coded client ID in source.**
  - `config.embedded.ethereum.createOnLogin: 'users-without-wallets'`
  - `config.embedded.solana.createOnLogin: 'users-without-wallets'`
  - => **Both EVM and Solana embedded wallets are auto-created on login today.** Migration must remove the `ethereum` block.
- `<PrivyElements/>` is mounted here (`PrivyGuard.tsx:76-78`), branded dark/`#00FF88`. Required for the funding/signing modals (`useFundWallet`/`useFundSolanaWallet` throw `privy_elements_not_ready` otherwise).

### AuthBridge (`apps/mobile/src/providers/AuthBridge.tsx`)
- Registers a lazy token getter into the API singleton: `apiService.setTokenGetter(async () => getAccessToken())` (`AuthBridge.tsx:18-32`). Every API request then carries `Authorization: Bearer <privy access token>`.
- Contains a dev-only diagnostic that pings `/api/debug/auth` 3s after mount (`AuthBridge.tsx:36-59`).

### Login (`apps/mobile/app/login.tsx` + `apps/mobile/src/hooks/useAuth.ts`)
- **Methods:** Apple, Google, X/Twitter, Instagram, TikTok (OAuth via `useLoginWithOAuth`), plus **Email OTP** (`useLoginWithEmail` → `sendCode`/`loginWithCode`) (`useAuth.ts:233-256`, `login.tsx:40-89`).
- `useAuth` dynamically `require()`s Privy hooks at module load and falls back to a `GUEST_AUTH` object when Privy is unavailable (`useAuth.ts:20-81`). This is a deliberate (eslint-disabled) conditional-hook pattern.

### Embedded wallet creation (`apps/mobile/src/hooks/useAuth.ts`)
- **Solana:** `useEmbeddedSolanaWallet(...)`; auto-creates 1.5s after login if `status === 'not-created'` via `solanaWallet.create({ recoveryMethod: 'privy' })` (`useAuth.ts:93-131`).
- **Ethereum/Base:** `useEmbeddedEthereumWallet()` (no options/callbacks in this SDK version); auto-creates 2s after login (`useAuth.ts:106, 133-159`).
- Address resolution: Solana from `solanaWallet.wallets[0].address` when `status==='connected'` (`useAuth.ts:173-176`); ETH from `ethWallet.wallets[0].address` (`useAuth.ts:179-185`).
- `ChainProvider` available chains are derived from which wallets exist (`useAuth.ts:188-195`).
- **Signing providers exposed:** `getWalletProvider()` → `solanaWallet.wallets[0].getProvider()` (`useAuth.ts:200-213`); `getEthWalletProvider()` → ETH provider (`useAuth.ts:218-228`).

### How wallet addresses are used (client signing model)
The pattern across the app is **server-builds-unsigned → client-signs**:
- **Send (`apps/mobile/src/components/features/SendModal.tsx`):**
  - Solana: POST `/wallet/send` returns base64 tx → `provider.signTransaction(tx)` → `connection.sendRawTransaction` (`SendModal.tsx:229-259`).
  - Base: POST returns raw EVM params → `provider.request({ method: 'eth_sendTransaction' })` (`SendModal.tsx:172-226`).
- **Swap (`apps/mobile/src/hooks/useSwap.ts`):**
  - Solana: POST `/wallet/swap` returns base64 → `provider.request({ method: 'signAndSendTransaction', params: { transaction, connection } })` (`useSwap.ts:297-303`).
  - Base: `eth_sendTransaction` (approve + swap) (`useSwap.ts:210-253`).

---

## 3. Backend — Authentication & User Mapping

### `apps/api/lib/auth.ts` (the core)
- **Privy client (`auth.ts:5-16`):** singleton `new PrivyClient(appId, appSecret)`, reading `NEXT_PUBLIC_PRIVY_APP_ID || PRIVY_APP_ID` and `PRIVY_APP_SECRET`. Throws if either missing.
- **Token verification (`auth.ts:32-46`):** reads `Authorization: Bearer`, calls `privy.verifyAuthToken(token)` → returns claims (incl. `claims.userId`). This is a **Privy access token (JWT)**, not a custom session.
- **User resolution / JIT provisioning (`getAuthUser`, `auth.ts:52-159`):**
  - Looks up `prisma.user` by `privyUserId`.
  - **First login:** calls `privy.getUser(privyUserId)`, extracts email (email/google/apple) and wallet addresses from `linkedAccounts` filtered by `type==='wallet'` and `chainType==='solana'|'ethereum'` (`auth.ts:80-89`), falls back to `privyUser.wallet?.address`. If no Solana address yet, stores placeholder `pending-<privyUserId>`. Determines `primaryChain` = `base` only if a Base wallet exists and no Solana wallet, else `solana` (`auth.ts:92`). Uses `upsert` to avoid the concurrent-first-login race (`auth.ts:98-117`).
  - **Existing user backfill (`auth.ts:118-156`):** if `walletAddress` still `pending-` or `baseWalletAddress` missing, re-fetches from Privy and patches. => the wallet address can lag the first request and gets synced opportunistically.
- **`AuthUser` shape (`auth.ts:18-26`):** `{ id, privyUserId, walletAddress, baseWalletAddress, primaryChain: 'solana'|'base', role, isAdmin }`.
- **Guards:** `requireAuth` (401), `requireCreator` (role must be `CREATOR`, 403), `requireAdmin` (403) (`auth.ts:164-207`).
- **Chain helpers:** `getWalletForChain(user, chain)` returns Base or Solana address, treating `pending-` as null (`auth.ts:212-218`); `getChainParam` reads `?chain=` defaulting to `solana` (`auth.ts:224-229`).

### Prisma `User` model (`apps/api/prisma/schema.prisma:29-34`)
`privyUserId @unique`, `walletAddress @unique`, `baseWalletAddress String? @unique`, `primaryChain String @default("solana")`. **Migration note:** dropping Base means deciding what to do with `baseWalletAddress`/`primaryChain` and existing `pending-`/Base-only rows.

### Debug route (`apps/api/app/api/debug/auth/route.ts`)
Public `GET /api/debug/auth` that verifies a passed token and **echoes the verified claims, appId, token preview** in the response (`debug/auth/route.ts:18-33`). Useful for diagnosis but is an **info-disclosure surface that should be removed before/with migration.**

### How the client gets its address
`GET /api/users/me` returns `walletAddress`, `baseWalletAddress`, `primaryChain` from the DB row (`users/me/route.ts:28+`). Client also reads the live address straight from the Privy hooks (`useAuth`). Two sources of truth (Privy live vs DB) exist.

---

## 4. Server-Side / Delegated Signing — What Exists vs What's Missing

### What exists
- **Nothing server-side.** Exhaustive grep for `signTransaction|signMessage|signAndSend|Keypair|walletApi|wallets().create|delegat|sessionSigner|keyQuorum|sponsor|feePayer` across `apps/api` and `packages` returns **no server signing**. The only `feePayer` is set to the **user's** pubkey when building the unsigned send tx (`wallet/send/route.ts:191`).
- The backend uses `@privy-io/server-auth` **purely for token verification and `getUser`** — it does **not** use the SDK's wallet API / server-wallet capabilities at all.
- **One ops script with a real keypair:** `scripts/create-fee-atas-send.ts` loads a local `KEYPAIR_PATH`/`~/.config/solana/id.json` (`scripts/create-fee-atas-send.ts:105-121`) to pre-create the fee wallet's ATAs (fee wallet `5U29gHgfeY8rnLcttjcQVLba1KGub9YUt6MP4yDc55yD`, `:36-38`). This is manual/local, not a runtime service, and not Privy-managed.

### What's missing for programmatic on-chain actions (mint / create pool / claim fees / create vesting)
1. **A signing identity for the platform.** Options to evaluate:
   - **Privy server wallets** (`@privy-io/server-auth` walletApi / authorization keys) to provision and sign with platform-owned Solana wallets server-side.
   - **Privy delegated actions / session signers** so the platform can sign on a *user's* embedded wallet (needed if the user must be the mint/pool authority but signing should be automated). Today the user always signs interactively in-app — there is no delegation grant flow anywhere.
2. **Key management & authorization-key/quorum config** in the Privy dashboard + env (none present).
3. **Token-launch / AMM / vesting integration** — no Meteora/Raydium/pump SDK, no mint/createPool/claimFees/createVesting endpoints exist. All would be greenfield.
4. **Fee-claim signing** — claiming LP/creator fees programmatically requires a wallet that holds the fee/position authority and a server signer; neither exists.
5. **Fee-payer / sponsorship** — currently the user pays all fees (their pubkey is fee payer). Any sponsored/relayed model needs a funded platform signer.

---

## 5. Funding / Onramp (Fiat → Crypto)

Two parallel onramp implementations exist:

### A. Privy-native funding modal (current/preferred) — `apps/mobile/src/hooks/usePrivyFunding.ts`
- Uses `useFundWallet` (EVM) and `useFundSolanaWallet` (Solana) from `@privy-io/expo/ui` (`usePrivyFunding.ts:2, 33-34`).
- Solana: `fundSolanaWallet({ address, asset: 'USDC', cluster: { name: devnet|mainnet-beta }, defaultPaymentMethod: 'card', card: { preferredProvider: 'moonpay' }, moonpay: { useSandbox, uiConfig } })` (`usePrivyFunding.ts:64-76`).
- Sandbox/prod derived from `SOLANA_NETWORK`/`BASE_NETWORK` (no extra env). **Requires the MoonPay fiat-onramp plugin enabled in the Privy dashboard** (noted in code comments `usePrivyFunding.ts:20-24`).

### B. Legacy bespoke onramp URL builder (still shipped) — `apps/api/app/api/wallet/onramp/route.ts`
- `GET /api/wallet/onramp?provider=ramp|moonpay|transak&chain=...` returns a hosted-widget URL for a WebView. Supports Ramp, MoonPay, Transak (Transak has a 2-step token flow with caching) (`onramp/route.ts`). This duplicates Privy funding and is a candidate for removal post-migration.

---

## 6. Env Vars & App IDs

### Privy
- **Mobile:** `EXPO_PUBLIC_PRIVY_APP_ID` (`apps/mobile/src/config/env.ts:10`). Hard-coded in EAS build profiles as **`cmjbzyj4q00twlb0d1uc5w0sb`** (`apps/mobile/eas.json`, all profiles). Privy **clientId hard-coded in source** (`PrivyGuard.tsx:64`).
- **Backend:** `NEXT_PUBLIC_PRIVY_APP_ID` (or `PRIVY_APP_ID`) + `PRIVY_APP_SECRET` (`auth.ts:8-9`, `.env.local.example`). App ID **must match** mobile's (per `.env.local.example` comment).

### Solana / RPC
- Mobile: `EXPO_PUBLIC_SOLANA_RPC_URL`, `EXPO_PUBLIC_SOLANA_NETWORK` (`config/env.ts:13-16`). EAS uses a **Helius mainnet RPC with an embedded API key** (`eas.json`) — key is committed in repo.
- Backend: `SOLANA_RPC_URL` (`wallet/send/route.ts:20`), `SOLANA_NETWORK` (USDC mint switch, `wallet/send/route.ts:61`), `HELIUS_API_KEY` (`lib/helius.ts:4`).

### Fees / Swap
- `MOMENTO_FEE_WALLET`, `MOMENTO_PLATFORM_FEE_BPS` (default 400 = 4%), `JUPITER_API_KEY` (`.env.local.example`, `lib/jupiter.ts:44,74`). Fee wallet pubkey `5U29gH…55yD` referenced in script.

### Onramp
- `MOONPAY_API_KEY`/`MOONPAY_ENVIRONMENT`, `RAMP_API_KEY`/`RAMP_ENVIRONMENT`, `TRANSAK_API_KEY(_STAGING)`/`TRANSAK_API_SECRET(_STAGING)`/`TRANSAK_ENVIRONMENT` (`onramp/route.ts`, `.env.local.example`).

### KYC / other
- `VERIFF_API_KEY`, `VERIFF_SHARED_SECRET`, `SKIP_KYC` (`.env.local.example`, `lib/veriff.ts`).

### Base/EVM (to be removed in migration)
- Mobile: `EXPO_PUBLIC_BASE_RPC_URL`, `EXPO_PUBLIC_BASE_CHAIN_ID`, `EXPO_PUBLIC_BASE_NETWORK` (`config/env.ts:19-25`).
- Backend: `BASE_RPC_URL`, `BASE_CHAIN_ID`, `ALCHEMY_API_KEY`, `ZEROX_API_KEY`, `BASE_FEE_WALLET` (`.env.local.example`).

---

## 7. Migration Implications (Solana-only)

1. **Stop creating EVM wallets:** remove `config.embedded.ethereum` from `PrivyGuard.tsx:67` and the ETH auto-create + provider code in `useAuth.ts:106,133-159,218-228`.
2. **Strip Base from auth/schema:** `baseWalletAddress`/`primaryChain` in `schema.prisma` and `auth.ts`; `getWalletForChain`/`getChainParam` Base branches; the `chain==='base'` branches in `wallet/send` and `wallet/swap`; `lib/base.ts`, `lib/base-swap.ts`.
3. **Remove redundant onramp:** keep Privy `usePrivyFunding`; retire `/api/wallet/onramp` + Ramp/Transak/MoonPay URL builders.
4. **Build the signing layer (greenfield):** decide Privy **server wallets** vs **delegated/session signers** for programmatic mint/pool/fee-claim/vesting. Provision authorization keys, env, and a key-management story. This is the largest net-new workstream.
5. **Harden:** remove `/api/debug/auth`; move the hard-coded Privy `clientId` and committed Helius RPC API key out of source/`eas.json`.

---

## 8. Open Questions / Unknowns

- **Does the Privy dashboard config match the code?** `createOnLogin` policies, enabled login methods, **MoonPay onramp plugin enablement**, and whether **server wallets / delegated signing / authorization keys** are provisioned — none verifiable from the repo; needs dashboard access.
- **Who must be the on-chain authority** for token mint / pool / vesting — the platform (server wallet) or the creator (user embedded wallet via delegation)? This decision drives the entire signing architecture and is not implied anywhere in code.
- **Does `@privy-io/expo@0.63.9` support Solana delegated signing / session signers on RN?** SDK capability needs verification against current Privy docs.
- **Two address sources of truth** (Privy live vs DB `pending-` rows) — reconciliation strategy under Solana-only.
- **Fee model under automation:** currently user-paid fees + a 4% Jupiter swap fee to `MOMENTO_FEE_WALLET`; LP/creator fee claiming is not implemented and has no signer.

---

## Appendix — Key File Map

| Concern | File | Lines |
|---|---|---|
| Privy provider + dual-wallet config | `apps/mobile/src/providers/PrivyGuard.tsx` | 62-79 |
| Token-getter bridge | `apps/mobile/src/providers/AuthBridge.tsx` | 16-60 |
| Login UI (OAuth + email OTP) | `apps/mobile/app/login.tsx` | 40-89 |
| Auth hook + embedded wallet create/sign providers | `apps/mobile/src/hooks/useAuth.ts` | 93-258 |
| Privy fiat funding (MoonPay) | `apps/mobile/src/hooks/usePrivyFunding.ts` | 26-98 |
| Client signing (send) | `apps/mobile/src/components/features/SendModal.tsx` | 162-301 |
| Client signing (swap) | `apps/mobile/src/hooks/useSwap.ts` | 272-315 |
| Backend token verify + user/wallet mapping | `apps/api/lib/auth.ts` | 5-229 |
| Server builds unsigned tx (Solana/Base) | `apps/api/app/api/wallet/send/route.ts` | 75-297 |
| Server builds unsigned swap (Jupiter/0x) | `apps/api/app/api/wallet/swap/route.ts` | 24-185 |
| Legacy onramp URL builder | `apps/api/app/api/wallet/onramp/route.ts` | 18-298 |
| Debug auth echo route | `apps/api/app/api/debug/auth/route.ts` | 4-35 |
| User model (wallet fields) | `apps/api/prisma/schema.prisma` | 29-34 |
| Only server keypair (ops script) | `scripts/create-fee-atas-send.ts` | 105-121 |
| Env (mobile) | `apps/mobile/src/config/env.ts`, `apps/mobile/eas.json` | — |
| Env (api) | `apps/api/.env.local.example` | — |
