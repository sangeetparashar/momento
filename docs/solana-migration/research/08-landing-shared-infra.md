# 08 — Landing App, Shared Package & Build/Deploy Infra

**Audit scope:** `apps/landing`, `packages/shared`, root build/deploy infra, all `.env*` files, `scripts/`.
**Migration context:** ALL-IN on Solana; remove Ethereum/Base; add token launches, tax, LP, vesting, fiat onramp.
**Date:** 2026-06-23

---

## 1. Executive findings (read first)

1. **`packages/shared` is the single most important migration surface in this audit.** It hard-codes a dual-chain model (`base` + `solana`) that is consumed by **33 files across `apps/api` and `apps/mobile`**. Every chain type, the Base USDC/explorer config, and the EVM pool enum live here.
2. **The landing app is already ~90% Solana-positioned** and contains **zero "Base"/"Ethereum" mentions in user-facing copy.** Migration impact on landing is small — mostly removing stale messaging (e.g. "4 Blockchain Partners") and adding token-launch/onramp positioning. **But note: most landing components are dead code** (not imported) — only one tree (`CreatorLanding → AppShowcaseFlow`) actually renders.
3. **Env files need ~10 new vars (Meteora/Bags/Streamflow/Moonpay/LP/vesting) and ~7 Base/EVM vars removed.** Onramp scaffolding (Ramp/Transak/MoonPay) already exists in `apps/api/.env.local.example`.
4. **Infra is clean and Solana-ready** — no Base/EVM references in any build/deploy config. The deploy pipeline is two Vercel projects (api + landing) + EAS for mobile. Main infra risk is a misconfigured/ambiguous root `vercel.json`.

---

## 2. `packages/shared` — complete catalogue (HIGH PRIORITY)

Package: `@momento/shared` (`packages/shared/package.json`). Entry `src/index.ts` re-exports `./types` and `./constants`. Consumed via `workspace:*`; `apps/api/next.config.js:3` `transpilePackages: ['@momento/shared']`. Points `main`/`types` at raw `src/index.ts` (TS source, not built `dist/`).

### 2.1 `src/types.ts` — full inventory

| Symbol | Line(s) | Migration action |
|---|---|---|
| `enum UserRole` (USER, CREATOR) | 2–5 | Keep |
| `enum KycStatus` (NONE/PENDING/VERIFIED/REJECTED) | 7–12 | Keep |
| **`type ChainType = 'solana' \| 'base'`** | **14** | **CHANGE → `'solana'`** (or drop the union entirely). Highest-blast-radius single line. |
| `enum TokenStatus` (PENDING/DEPLOYING/ACTIVE/FAILED/GRADUATED) | 16–22 | Keep; `GRADUATED` maps to Meteora DBC graduation. |
| **`enum PoolType` (BONDING_CURVE, RAYDIUM, AERODROME)** | **24–28** | **CHANGE.** `AERODROME` is Base/EVM — remove. Likely add `METEORA_DBC`/`METEORA_DAMM`. `RAYDIUM` may stay or be replaced by Meteora. |
| `interface SocialLinks` | 37–45 | Keep |
| **`interface User`** — `walletAddress`, **`baseWalletAddress?`** (53), **`primaryChain: ChainType`** (54) | 49–74 | **CHANGE.** Remove `baseWalletAddress`; remove/retire `primaryChain` (always Solana). Coordinate with Prisma schema. |
| `interface CreatorToken` — **`chain: ChainType`** (79), `mintAddress?`, `poolType?: PoolType`, `bondingCurveParams` | 76–101 | **CHANGE** `chain`; revisit `bondingCurveParams` for Meteora DBC; add vesting/LP/tax fields as needed. |
| `interface PublicCreator` | 103–119 | Keep |
| `interface Post` / `PostWithCreator` | 122–143 | Keep |
| `interface Comment` | 146–158 | Keep |
| `interface TokenHolding` (`mint`, `symbol`…) | 161–171 | Keep (Solana-native) |
| **`interface WalletBalance`** — **`chain: ChainType`** (174), `nativeBalance`, `nativeSymbol`, `solBalance` | 173–184 | **SIMPLIFY.** With single chain, `native*` vs `sol*` duplication collapses. |
| `interface PricePoint` / `PortfolioPoint` | 186–197 | Keep |
| **`type OnrampProvider = 'ramp' \| 'moonpay' \| 'transak'`** | **200** | Keep/extend — confirm final provider set (MoonPay is in migration scope). |
| `type OnrampCoin = 'USDC'` | 201 | Keep |
| `interface OnrampUrlResponse` — `chain: ChainType` (208) | 203–209 | **CHANGE** `chain`. |
| `interface SwapQuote` — `chain: ChainType` (213) | 212–222 | **CHANGE** `chain`. |
| `SwapTransactionResponse` | 224–227 | Keep (Solana shape) |
| Leaderboard / Feed / API response types | 230–296 | Keep |
| `parseSocialLinks()` validator | 298–315 | Keep |

### 2.2 `src/constants.ts` — full inventory

```
SOCIAL_PLATFORMS         lines 1–9    — Keep (no chain coupling).
CHAIN_CONFIG             lines 11–34  — DUAL-CHAIN. Action required.
  .solana                lines 12–22  — KEEP. usdcAddress EPjFW…Dt1v (line 20), decimals 9, Solscan.
  .base                  lines 23–33  — REMOVE. ETH symbol, 18 decimals, Ξ icon, BaseScan,
                                        usdcAddress 0x833589fCD…02913 (line 31, EVM).
type ChainConfig         line 36      — Keep (re-derive from single-chain CHAIN_CONFIG).
```

**Recommended end state for `CHAIN_CONFIG`:** drop the `.base` key and (optionally) flatten so `CHAIN_CONFIG` is the Solana config object directly. Add Solana program/mint constants currently scattered in scripts (see §6): wSOL mint `So111…112`, USDC mint `EPjFW…Dt1v`, fee wallet, Meteora/Streamflow program IDs, platform fee BPS.

### 2.3 Consumer blast radius (why this is the critical path)

`ChainType` / `CHAIN_CONFIG` / `PoolType` / `baseWalletAddress` / `primaryChain` are referenced across **33 files**. Key consumers to migrate in lockstep:
- **mobile:** `src/providers/ChainProvider.tsx`, `src/components/features/ChainSwitcher.tsx` (whole component likely deleted), `useSwap.ts`, `useOnramp.ts`, `usePrivyFunding.ts`, `useAuth.ts`, `src/config/env.ts`, `app/(tabs)/wallet.tsx`, `app/wallet.tsx`, `SendModal.tsx`, `SwapModal.tsx`, `FundWalletModal.tsx`.
- **api:** `lib/base.ts`, `lib/base-swap.ts` (both DELETE), `lib/auth.ts`, `app/api/wallet/{balance,history,onramp,send,swap,transactions/log}/route.ts`, `prisma/schema.prisma`, migrations `…add_base_wallet_support`, `…add_creator_token`.

(These belong to other audit streams but are flagged here because the shared package is the contract that ties them together.)

---

## 3. `apps/landing` — purpose, structure, copy audit

### 3.1 What it is
Standalone Next.js 15.5 (React 19) marketing/waitlist site, `pnpm dev -p 3001`. Pure frontend except one API route. Tailwind, anime.js. No DB; no Privy; no chain SDKs.

### 3.2 Live vs. dead components (IMPORTANT)
`app/page.tsx` renders **only** `<CreatorLanding/>` → which renders **only** `<AppShowcaseFlow/>`. The actual rendered tree:

```
CreatorLanding (components/CreatorLanding.tsx)
  └─ AppShowcaseFlow (components/showcase/AppShowcaseFlow.tsx)
       Navbar, Hero(inline), TickerBanner, Manifesto,
       HomeFeedScreen, ExploreScreen, CreatorProfileScreen, WalletScreen,
       BetaJoinCTA, WaitlistForm, Footer(→TermsContent), Modal
```

**Dead/unimported components** (grep confirms no imports): `Hero.tsx`, `Proof.tsx`, `SocialProof.tsx`, `TokenEconomics.tsx`, `AppShowcase.tsx`, `AppPreview.tsx`, `HowItWorks.tsx`, `Product.tsx`, `ProblemHook.tsx`, `Team.tsx`, `WhyMomento.tsx`, `FinalCta.tsx`, `BetaJoinCTA`'s `Hero` sibling, `showcase/OwnershipScreen.tsx`, `showcase/ShowcaseSection.tsx`, `showcase/AppShowcase*` extras, `PrivacyContent.tsx` (privacy served from static `public/privacy.html`).
→ Editing these does NOT change the live site. Recommend deleting dead code during migration to avoid future confusion; **at minimum, do not waste effort updating copy in unused files** (e.g. `TokenEconomics.tsx`, `Proof.tsx`).

### 3.3 Chain/token/trading copy — every occurrence

**LIVE (rendered) copy needing review:**
- `app/layout.tsx:14` keywords include `'solana'`, `'crypto'`, `'tokens'` — already Solana-aligned. `:24` OG url `https://moment.network`.
- `components/showcase/WalletScreen.tsx` — renders static `public/screens/wallet.png` image of the in-app wallet (no text; image may show Base UI → re-export after mobile migration).
- `components/BetaJoinCTA.tsx:76` — "back them directly with **embedded Solana wallets**" ✅ on-message.
- `components/TickerBanner.tsx` — fake creator-token tickers ($DEEL 17X…) — chain-agnostic, fine.
- `components/Manifesto.tsx` — "Fans get likes. Not equity." — chain-agnostic.
- `components/TermsContent.tsx:34,63–70` — risk disclosure + "wash trading" prohibition; chain-agnostic, legally fine. **Contact email `sangeet@moment.network` (line 107).**

**DEAD copy (won't render, fix only if reviving):**
- `components/TokenEconomics.tsx:80` "Solana-powered", `:96` "Real-time trading", `:16` `$CREATOR` $0.10 — bonding-curve narrative. **If revived, aligns well with token-launch positioning.**
- `components/Proof.tsx:38` & `components/SocialProof.tsx:41` — **"4 Blockchain Partners"** stat. Stale/odd for Solana-all-in; remove or restate ("Built on Solana"). Currently not shown.
- `components/Hero.tsx:71–76` "Solana-powered" badge; `AppShowcase.tsx:185,193` "Solana-powered speed", "Embedded Solana wallet"; `showcase/OwnershipScreen.tsx:74` "Powered by Solana". All already Solana; none render.

**Static HTML (served directly, MUST update manually — not React):**
- `public/privacy.html` — multiple Solana/Privy/Helius mentions (lines 7, 405, 415, 459, 461–462, 472–473, 508). Already Solana-correct. **No Base mentions.** Update only if adding token-launch/onramp data-sharing disclosures (e.g. MoonPay as a subprocessor).
- `public/ios-launch-playbook.html` — internal launch doc; line 1810 "chain" is a shell-`&&` reference, not blockchain. Ignore.

**Positioning gaps for "Solana-all-in + token launches/onramp" (copy to ADD):**
- No mention of **creator token launches**, **fiat onramp / buy with card**, **liquidity/LP**, **vesting**, or **tax** anywhere in the *live* tree. The live AppShowcaseFlow sells feed/explore/profile/wallet only. New token-launch + onramp narrative should be added to `AppShowcaseFlow.tsx`'s `sections` array (`AppShowcaseFlow.tsx:16–45`) or by reviving `TokenEconomics.tsx`.

### 3.4 Waitlist (`app/api/waitlist/route.ts`)
POST `/api/waitlist`, email-validates, dedupes, writes JSON to `/tmp` on Vercel (ephemeral) or `data/` locally, logs to console as the durable record. **No DB, no chain coupling.** Migration impact: none, but note it is not production-grade persistence (flagged as infra risk).

### 3.5 Landing config
- `package.json`: next 15.5.14, react 19, animejs, tailwind. No chain deps.
- `next.config.js`: empty.
- `vercel.json`: framework nextjs, security headers, `rewrites /api/:path*` (no-op self-rewrite).
- `.env.development` / `.env.production`: **all vars commented out** (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MIXPANEL_TOKEN`, `NEXT_PUBLIC_GA_ID`). Landing runs with zero required env. No chain/onramp vars needed.

---

## 4. Build & deploy pipeline

### 4.1 Monorepo
pnpm@10.30.0 + Turbo 2. `pnpm-workspace.yaml`: `apps/*`, `packages/*`; `node-linker=hoisted` (`.npmrc`); `ignoredBuiltDependencies` for prisma/bufferutil/utf-8-validate. Root `tsconfig.json` extends `expo/tsconfig.base` (Expo base for whole repo). `turbo.json`: `build` (`^build`, outputs `.next/**` + `dist/**`), `dev` (no cache, persistent), `lint`.

**Root `package.json` quirks (infra notes):**
- Has top-level `@solana/web3.js` and `docx` as **root** dependencies (line ~12) — unusual for a monorepo root; supports the `scripts/` tooling. Keep; Solana-aligned.
- `create-fee-atas` script wired at root.

### 4.2 Vercel projects (two)
1. **API project** — driven by **root `vercel.json`**: `buildCommand: "cd apps/api && pnpm run vercel-build"`, `outputDirectory: apps/api/.next`, region `iad1`, CORS `*` on `/api/*`, `ENABLE_EXPERIMENTAL_COREPACK=1`. There is ALSO `apps/api/vercel.json` (buildCommand `pnpm vercel-build`, cron `/api/keep-warm` every 5 min). **Risk:** two vercel.json files (root + apps/api) with overlapping config — depends on which dir the Vercel project root is set to. The cron lives only in `apps/api/vercel.json`.
   - `apps/api/vercel-build` = `prisma generate && tsx scripts/apply-postgis.ts && next build`.
2. **Landing project** — `apps/landing/vercel.json`. Separate Vercel project, port-agnostic on Vercel.

No Base/EVM anything in any Vercel config. No infra changes strictly required for the chain migration beyond env var updates (§5). Recommend resolving the dual root/api `vercel.json` ambiguity.

### 4.3 Mobile (EAS) — `apps/mobile/eas.json`
- Node 22.12.0, pnpm 10.30.0. Profiles: development, preview, development-device, production. **All four profiles hard-code the same env block:** `EXPO_PUBLIC_API_URL=https://momento-api-ten.vercel.app/api`, `EXPO_PUBLIC_PRIVY_APP_ID`, `EXPO_PUBLIC_SOLANA_RPC_URL` (Helius, key inline), `EXPO_PUBLIC_SOLANA_NETWORK=mainnet-beta`.
- **No Base env vars in eas.json** — the Base vars only exist in the `.env.*` files (§5). So removing Base from eas.json is a no-op; it's already Solana-only at the EAS layer.
- `submit.production`: iOS appleId `brian@mylz.run`, ascAppId `6762237065`, teamId `9BJL3C9DHA`; Android internal track.
- Root `app.json` = `{"expo":{}}` (placeholder); real config in `apps/mobile/app.json` (bundleId `com.momento.network`).
- **`.easignore`**: excludes docs, scripts, native dirs (`ios/`, `android/`), `dist/`, `.expo/` (prevents ~540MB uploads). No chain coupling. No change needed.

### 4.4 Domain inconsistency (infra hygiene, not chain-related)
Mixed `moment.network` vs `momento.network` vs `momento-api-ten.vercel.app`:
- `apps/landing/app/layout.tsx:24` OG url `moment.network`; TermsContent/PrivacyContent email `sangeet@moment.network`.
- `apps/mobile/.env.production` & `.env.example` reference `api.momento.network`; but `eas.json` and `.env.development` use `momento-api-ten.vercel.app`.
- `apps/api/.env.local.example` comments mention `api.moment.network`.
Flag for cleanup during migration (not a chain blocker).

---

## 5. Environment variables — grouped by service

Files: `apps/api/{.env.development,.env.local.example}`, `apps/mobile/{.env.development,.env.example,.env.production}`, `apps/landing/{.env.development,.env.production}`.

> ⚠️ **SECURITY:** `apps/api/.env.development` contains **REAL committed secrets** — Supabase DB password (`Momento2025Begins!`), Privy app secret, Upstash token, Supabase service-role JWT, Helius API key, Veriff API key + shared secret. `apps/mobile/.env.development` and `eas.json` embed the live Helius key + Privy app id. **These should be rotated and removed from git** (out of scope for this stream but must be raised).

### 5.1 Existing vars by service

| Service | Vars | Files |
|---|---|---|
| **Database (Supabase PG)** | `DATABASE_URL`, `DIRECT_URL` | api |
| **Privy** | `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET` (api); `EXPO_PUBLIC_PRIVY_APP_ID` (mobile) | api, mobile |
| **Redis** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | api |
| **Storage** | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | api |
| **Helius / Solana RPC** | `HELIUS_API_KEY` (api); `EXPO_PUBLIC_SOLANA_RPC_URL`, `EXPO_PUBLIC_SOLANA_NETWORK` (mobile) | api, mobile |
| **Veriff (KYC)** | `VERIFF_API_KEY`, `VERIFF_SHARED_SECRET` | api |
| **Onramp (existing)** | `RAMP_API_KEY`/`RAMP_ENVIRONMENT`, `TRANSAK_API_KEY`/`TRANSAK_ENVIRONMENT`, `MOONPAY_API_KEY`/`MOONPAY_ENVIRONMENT` | api (`.env.local.example` only) |
| **Swap / fees** | `JUPITER_API_KEY`, `MOMENTO_FEE_WALLET`, `MOMENTO_PLATFORM_FEE_BPS=400` | api (`.env.local.example`) |
| **App config** | `NEXT_PUBLIC_API_URL`, `SKIP_KYC`, `NODE_ENV`, `EXPO_PUBLIC_API_URL` | api, mobile |
| **🔴 Base / EVM (REMOVE)** | `BASE_RPC_URL`, `BASE_CHAIN_ID`, `ALCHEMY_API_KEY`, `ZEROX_API_KEY`, `BASE_FEE_WALLET` (api); `EXPO_PUBLIC_BASE_RPC_URL`, `EXPO_PUBLIC_BASE_CHAIN_ID`, `EXPO_PUBLIC_BASE_NETWORK` (mobile, all 3 env files) | api, mobile |
| **Landing** | none required (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MIXPANEL_TOKEN`, `NEXT_PUBLIC_GA_ID` all commented) | landing |

### 5.2 Vars to REMOVE (Base/EVM)
`apps/api/.env.local.example`: `BASE_RPC_URL`, `BASE_CHAIN_ID`, `ALCHEMY_API_KEY`, `ZEROX_API_KEY`, `BASE_FEE_WALLET` (the entire "Base Chain (Ethereum L2)" block).
`apps/mobile/.env.{development,example,production}`: `EXPO_PUBLIC_BASE_RPC_URL`, `EXPO_PUBLIC_BASE_CHAIN_ID`, `EXPO_PUBLIC_BASE_NETWORK` (the entire "Base (Ethereum L2)" block in each).
`eas.json`: nothing to remove (no Base vars present).

### 5.3 Vars to ADD (Meteora / Bags / Streamflow / MoonPay + LP / vesting / tax)
Onramp scaffolding for MoonPay/Ramp/Transak already exists in `apps/api/.env.local.example`; **promote those into the real `apps/api/.env.development` and Vercel** (currently only Helius/Veriff/etc. are in the active dev file — onramp + Jupiter + fee vars are documented but NOT in `.env.development`). New vars to add (names indicative; confirm with token-launch/LP audit streams):

| Capability | Suggested env vars |
|---|---|
| **Meteora (DBC launch + DAMM LP)** | `METEORA_DBC_PROGRAM_ID`, `METEORA_DAMM_PROGRAM_ID`, `METEORA_API_URL` (or rely on on-chain program IDs in `packages/shared/constants.ts`) |
| **Bags (token launchpad)** | `BAGS_API_KEY`, `BAGS_API_URL` (+ `EXPO_PUBLIC_*` if mobile calls directly) |
| **Streamflow (vesting)** | `STREAMFLOW_PROGRAM_ID` (or `STREAMFLOW_API_KEY` if SaaS API used), partner/treasury wallet |
| **MoonPay (onramp)** | `MOONPAY_API_KEY`, `MOONPAY_SECRET_KEY` (URL signing), `MOONPAY_ENVIRONMENT`, `NEXT_PUBLIC_MOONPAY_PUBLISHABLE_KEY` (client) |
| **Tax / fees** | `MOMENTO_PLATFORM_FEE_BPS` (exists, 400), plus launch/LP/transfer-tax BPS + treasury wallet(s); consider moving fee constants into `packages/shared/constants.ts` |
| **LP** | LP-fee wallet + lock config; likely constants, not env |
| **Mobile mirror** | `EXPO_PUBLIC_MOONPAY_*`, `EXPO_PUBLIC_BAGS_*`, etc. for any client-initiated flows |

---

## 6. `scripts/` (repo root)

| File | Purpose | Migration note |
|---|---|---|
| `scripts/create-fee-atas.ts` | Builds (unsigned, base64) idempotent ATA-creation tx for the fee wallet's wSOL ATA. Fee wallet `5U29gHgf…55yD`, wSOL `So111…112`, expected ATA `Cnjif…tyBq`. Manual signing. | **Solana-native, keep.** Hard-codes program IDs (TOKEN `Tokenkeg…`, ATA `ATokenGP…`) and fee wallet — candidates to centralize into `packages/shared/constants.ts`. Note this fee wallet differs from `MOMENTO_FEE_WALLET` env — reconcile. |
| `scripts/create-fee-atas-send.ts` | Same but signs+submits via local keypair; creates ATAs for wSOL, USDC, and top Solana tokens so the 4% platform fee is collectible on all swap outputs. | **Keep.** Relevant to tax/fee work. Reconcile fee-wallet addresses & fee BPS with shared constants and env. |

No Base/EVM scripts exist. Both scripts are already Solana-only.

---

## 7. Consolidated migration action list

### `packages/shared` (do FIRST — it's the contract)
1. `types.ts:14` `ChainType` → `'solana'` only (or remove union).
2. `types.ts:24–28` `PoolType` → remove `AERODROME`; add Meteora pool variants.
3. `types.ts:53–54` remove `baseWalletAddress`, retire `primaryChain` from `User`.
4. `types.ts` `chain: ChainType` fields in `CreatorToken`(79), `WalletBalance`(174), `OnrampUrlResponse`(208), `SwapQuote`(213) — simplify; collapse `native*`/`sol*` duplication in `WalletBalance`.
5. `constants.ts:23–33` delete `CHAIN_CONFIG.base`; flatten/keep `.solana`. Add Solana program IDs, mints, fee wallet, fee BPS, Meteora/Streamflow IDs as new constants.
6. Migrate all **33 consuming files** in api+mobile in lockstep (delete `lib/base.ts`, `lib/base-swap.ts`, `ChainSwitcher.tsx`).

### `apps/landing`
7. Remove "4 Blockchain Partners" stat **if** `Proof`/`SocialProof` are ever revived (`Proof.tsx:38`, `SocialProof.tsx:41`).
8. Add token-launch + fiat-onramp + LP/vesting narrative to the **live** tree: `AppShowcaseFlow.tsx:16–45` `sections[]`, and/or revive `TokenEconomics.tsx`.
9. Re-export `public/screens/wallet.png` (and other screen pngs) after mobile UI loses Base/chain-switcher.
10. Update `public/privacy.html` subprocessor table if MoonPay/Bags/Streamflow added.
11. (Hygiene) Delete dead components; unify `moment.network` vs `momento.network` domains.

### Env
12. Remove all Base/EVM vars (§5.2).
13. Add Meteora/Bags/Streamflow/MoonPay/LP/vesting vars (§5.3); promote existing onramp+Jupiter+fee vars from `.env.local.example` into active `.env.development` + Vercel.
14. **Rotate the committed live secrets** in `apps/api/.env.development`, `apps/mobile/.env.development`, `eas.json` and remove from git.

### Infra
15. Resolve dual `vercel.json` (root vs `apps/api`) ambiguity.
16. Consider real persistence for the waitlist (currently `/tmp` + logs).
17. No EAS changes required for chain migration (already Solana-only).

---

## 8. Top risks

1. **Shared `ChainType`/`CHAIN_CONFIG` blast radius (33 files).** A change to `packages/shared` is a breaking API change that must land atomically with all api+mobile consumers + Prisma schema, or builds break repo-wide.
2. **Committed production secrets** in `apps/api/.env.development`, `apps/mobile/.env.development`, and `eas.json` (DB password, Privy secret, Supabase service-role JWT, Helius/Veriff keys). Must be rotated/removed — security incident risk independent of the migration.
3. **Dual `vercel.json` (root + apps/api)** with overlapping/conflicting build config; the keep-warm cron lives in only one. Misconfiguration could deploy the wrong build or drop the cron.
4. **Dead landing components mislead future edits** — easy to "fix" Solana copy in files that never render (e.g. `TokenEconomics.tsx`). Migration copy must go into `AppShowcaseFlow.tsx`, not the dormant tree.
5. **Onramp/fee env drift** — onramp + Jupiter + fee vars exist only in `.env.local.example`, not in the active `.env.development`/Vercel; new MoonPay/Meteora/Streamflow vars risk the same gap. Fee-wallet address mismatch between scripts (`5U29…`) and `MOMENTO_FEE_WALLET` env needs reconciliation.
