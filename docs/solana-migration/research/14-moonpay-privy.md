# 14 — MoonPay via Privy: Fiat Onramp Integration Research

> Research date: **2026-06-23**. Scope: how Momento funds Privy embedded **Solana** wallets (USDC/SOL) with fiat via **MoonPay through Privy**, vs. going to MoonPay directly. Integration-oriented; every claim cited.
> Repo context audited in `09-onramp-current.md`. Momento = Expo React Native app, `@privy-io/expo@^0.63.9`, embedded Solana + Base wallets.
>
> **Version-sensitivity warning:** Privy ships funding changes weekly and explicitly labels the onramp APIs **experimental** ("may change as we iterate") [[fiat-onramp]](https://docs.privy.io/wallets/funding/fiat-onramp). Pin SDK versions and re-verify exact hook/param names against the changelog before relying on this doc. Several detail pages (e.g. `recipes/card-based-funding`) returned 404/redirects during research and could not be fully re-fetched — flagged inline.

---

## 0. TL;DR / Recommendation

**Recommendation: stay on MoonPay-via-Privy (the already-wired `useFundSolanaWallet` path).** It is the lowest-effort, no-merchant-account route to funding USDC on Solana, and it is what the codebase already implements. The single remaining blocker is operational, not code: enable the **MoonPay Fiat On-Ramp** plugin in the Privy dashboard (request-and-wait) [[privy-onramp-setup.md]](../../privy-onramp-setup.md).

**The one strategic catch:** going through Privy's *native funding hooks* gives you **no developer/ecosystem fee** — you cannot add a markup or earn revenue share on the onramp itself through that path [[onramp-flow decision]](../../privy-onramp-flow.html). If onramp revenue ever matters, you must either (a) go **direct to MoonPay** with your own partner account and set an Ecosystem Fee in the MoonPay dashboard [[partner-pricing]](https://support.moonpay.com/en/articles/694907-partner-pricing-fees-and-the-removed-paywall), or (b) use Privy's separate **Bridge** onramp path (bank-rails, supports a dev fee but no cards) [[onramp-flow]](../../privy-onramp-flow.html). The team already decided (2026-05-31) to skip the onramp fee and monetize via the live 4% Jupiter trading fee instead.

**Top unknowns** (see §8): exact `useFiatOnramp` vs `useFundWallet` future for Expo; whether MoonPay's Ecosystem Fee can be threaded through Privy's wrapped flow at all (evidence says no); MoonPay max card limits for new KYC tier; whether Privy itself takes any spread.

---

## 1. Privy's funding / onramp system (2026)

### 1.1 What Privy "funding" actually is

Privy's funding system is a **prebuilt modal** that aggregates multiple funding methods and **routes fiat purchases through third-party onramp providers**. The providers behind it are **Meld, MoonPay, and Coinbase**, selected automatically "based on availability and the user's region" [[fiat-onramp]](https://docs.privy.io/wallets/funding/fiat-onramp). For bank-deposit (ACH/SEPA/wire) funding Privy uses the **Bridge** API; for crypto deposits it shows deposit addresses [[funding overview]](https://docs.privy.io/wallets/funding/overview).

So there are really three Privy funding rails:
| Rail | Provider(s) | Methods | Notes |
|---|---|---|---|
| Fiat onramp (cards) | **MoonPay / Coinbase / Meld** | Card, Apple Pay, Google Pay | The "Buy USDC" path Momento uses |
| Bank deposits | **Bridge** | ACH / SEPA / wire | Supports a developer fee [[onramp-flow]](../../privy-onramp-flow.html) |
| Crypto deposit | n/a | external wallet transfer | **Not yet supported on React Native** [[configuration]](https://docs.privy.io/guide/react/wallets/usage/funding/configuration) |

### 1.2 Is MoonPay the "default/native" provider?

There is **no single hard-coded default** — Privy routes by region/availability across Meld/MoonPay/Coinbase [[fiat-onramp]](https://docs.privy.io/wallets/funding/fiat-onramp). **However**, you can express a preference per-call via `card.preferredProvider: 'moonpay' | 'coinbase'` (see §2), which is exactly what Momento does. MoonPay is the most globally available card provider (160+ countries, see §4), so in practice it is the one that surfaces for most users. Coinbase Onramp was added "out of the box" in 2024 and lets already-verified Coinbase users buy with their CB account/card/bank [[Privy CB launch]](https://x.com/privy_io/status/1815455945691943198).

**To make MoonPay actually appear, you must enable it in the dashboard.** Some funding providers require API keys / enablement; the Dashboard prompts for these when you toggle a method on at **Account Funding** (`dashboard.privy.io/apps?page=funding`) [[configuration]](https://docs.privy.io/guide/react/wallets/usage/funding/configuration). For Momento specifically this is the **MoonPay Fiat On-Ramp plugin → Request Access** step, which Privy reviews and may attach a light MoonPay KYB questionnaire to — **you are not opening a MoonPay merchant account** in this path [[privy-onramp-setup.md]](../../privy-onramp-setup.md).

### 1.3 Configuring provider / assets / chains

- **Provider preference:** `card.preferredProvider` per funding call (`'moonpay' | 'coinbase'`) [[expo funding]](https://docs.privy.io/guide/expo/embedded/funding/prompting).
- **Dashboard config:** which methods are enabled, plus provider API keys, set at Account Funding [[configuration]](https://docs.privy.io/guide/react/wallets/usage/funding/configuration). On web you can also set `config.fundingMethodConfig.moonpay` on `PrivyProvider` for additional MoonPay options (web SDK detail; RN uses per-call `moonpay` config instead — see §2).
- **Asset:** `asset: 'native-currency' | 'USDC' | { tokenAddress: string }` [[expo funding]](https://docs.privy.io/guide/expo/embedded/funding/prompting). So **USDC and SOL are both fundable** (SOL = native currency on Solana; USDC = the `'USDC'` literal).
- **Chain (web `useFiatOnramp`):** `destination.chain` takes a **CAIP-2** identifier — `solana:mainnet` for Solana, `eip155:8453` for Base [[fiat-onramp]](https://docs.privy.io/wallets/funding/fiat-onramp).
- **Chain (Expo):** the Expo Solana hook takes a **`cluster` object** (`{ name, rpcUrl? }`), not CAIP-2 (see §2) — this is the form Momento already uses.

### 1.4 Native USDC-on-Solana support — confirmed

Privy shipped **native USDC funding on Solana** (Apple Pay / card / exchange) in 2025 [[Privy announcement]](https://x.com/privy_io/status/1913352170440933527). Changelog corroborates: **v0.36.0** "Add support for purchasing USDC on Solana with Coinbase Onramp" and **v0.44.0** "Add support for `defaultPaymentMethod` for solana funding" [[expo changelog]](https://docs.privy.io/reference/sdk/expo/changelog). **Momento's `@privy-io/expo@0.63.9` is well past both** — the Solana USDC card path is fully available in the installed version.

**Mainnet-only caveat:** "Card and fiat on-ramp purchases are supported on mainnets only. On testnets … on-ramps cannot purchase testnet tokens." [[funding overview]](https://docs.privy.io/wallets/funding/overview). Momento derives sandbox/mainnet from `SOLANA_NETWORK`; on devnet the MoonPay **sandbox** is used (test cards), not real settlement.

---

## 2. React Native / Expo: the exact funding APIs

> **Key disambiguation (corrects prior docs):** There are **two different hook families**, and they are NOT interchangeable across SDKs:
> - **`@privy-io/expo/ui`** → `useFundWallet()` (EVM) and `useFundSolanaWallet()` (Solana). **This is the React Native / Expo path. This is what Momento uses and what works.**
> - **`@privy-io/react-auth`** → `useFiatOnramp()` (the newer unified web hook with `source`/`destination`/CAIP-2). Evidence indicates **`useFiatOnramp` is the web SDK hook and is not the Expo entrypoint** [[fiat-onramp]](https://docs.privy.io/wallets/funding/fiat-onramp). The `privy-onramp-flow.html` design doc said "`useFiatOnramp` (or `useFundWallet`)" as an open Phase-0 question — **this research resolves it: on Expo use `useFundWallet`/`useFundSolanaWallet`.**

### 2.1 Required setup

1. **`<PrivyElements/>` must be mounted** in the tree or `fundWallet()` throws `privy_elements_not_ready` [[expo funding]](https://docs.privy.io/guide/expo/embedded/funding/prompting). Momento mounts it in `PrivyGuard.tsx`. PrivyElements also renders Privy's themed login/signing modals.
2. **Native build required** — funding hooks need Privy's native module (`@privy-io/expo-native-extensions`), absent in Expo Go. Momento already guards for this (guest mode in Expo Go) [[privy-onramp-setup.md]](../../privy-onramp-setup.md).
3. **UI moved to `/ui` entrypoint in v0.51.0** — `useFundWallet`, `useFundSolanaWallet`, `FundingConfig`, `FundingSolanaConfig` import from `@privy-io/expo/ui` (breaking change; Momento at 0.63.9 is correct) [[expo changelog]](https://docs.privy.io/reference/sdk/expo/changelog).
4. **No special permissions** beyond a normal native build. Apple Pay support is provided through MoonPay/Coinbase inside the webview; no separate Apple Pay entitlement is documented for the Privy funding flow (the provider handles the payment sheet). *Flag: re-confirm if you ever switch to a fully native Apple Pay sheet.*

### 2.2 `useFundWallet` (EVM / Base) — verified signature

```tsx
import { useFundWallet } from '@privy-io/expo/ui';

const { fundWallet } = useFundWallet();

await fundWallet({
  address: '0x2F3e…',                 // required, destination wallet
  asset: 'USDC',                       // 'native-currency' | 'USDC' | { tokenAddress }
  chain: base,                         // a viem/chains object; testnets unsupported
  amount: '1',                         // decimal string; required when asset is set
  defaultPaymentMethod: 'card',        // 'card' | 'exchange' — skips method picker
  card: { preferredProvider: 'moonpay' }, // 'coinbase' | 'moonpay'
});
```
Params verified against [[expo funding docs]](https://docs.privy.io/guide/expo/embedded/funding/prompting). `defaultPaymentMethod` hides the funding-method selection screen (changelog v0.55.5) [[expo changelog]](https://docs.privy.io/reference/sdk/expo/changelog).

### 2.3 `useFundSolanaWallet` (Solana) — the Momento path

```tsx
import { useFundSolanaWallet } from '@privy-io/expo/ui';

const { fundWallet } = useFundSolanaWallet();

await fundWallet({
  address: solanaAddress,
  asset: 'USDC',                       // 'USDC' for USDC-SOL; omit/native for SOL
  cluster: { name: 'mainnet-beta' },   // SolanaCluster object, NOT a CAIP-2 string
  defaultPaymentMethod: 'card',
  card: { preferredProvider: 'moonpay' },
  moonpay: {
    useSandbox: false,                 // true on devnet
    uiConfig: { theme: 'dark', accentColor: '#00FF88' },
  },
});
```
This is **exactly the call in `apps/mobile/src/hooks/usePrivyFunding.ts`** (Solana branch). The `cluster` object form and the per-call `moonpay` config block are Expo-specific. *Flag: the precise shape of `moonpay.uiConfig` is sparsely documented for RN; it works in the repo today but is the kind of field most likely to drift between versions — re-verify on upgrade.*

### 2.4 Return value & completion

- **Expo hooks:** `fundWallet()` returns a promise. Momento treats resolve as `'completed'` and a `cancel`-containing error code as `'cancelled'`. There is **no on-chain confirmation in the promise** — funds "may take a few minutes to a few days to arrive" [[funding overview]](https://docs.privy.io/wallets/funding/overview), so Momento invalidates the balance query and lets polling catch the deposit. This is correct behavior; do **not** treat resolve as "USDC landed."
- **Web `useFiatOnramp`** resolves with `'confirmed'` (completed) or `'submitted'` (user exited before final confirm) [[fiat-onramp]](https://docs.privy.io/wallets/funding/fiat-onramp) — different contract; don't copy web status strings into RN.

---

## 3. MoonPay specifics

### 3.1 Account / API keys / KYB

- **Direct integration** needs a MoonPay **partner account** with **KYB completed before API keys are issued**; keys come from the MoonPay dashboard [[on-ramp overview]](https://dev.moonpay.com/docs/on-ramp-overview). Keys are a **publishable key** (used in the widget URL) and a **secret key** (used to *sign* the widget URL server-side). The legacy Momento server route (`buildMoonPayUrl`) uses `MOONPAY_API_KEY` and a sandbox/prod base — but note **production MoonPay requires URL signing with the secret key**, which the current `route.ts` does not do (it only appends `apiKey`); that path would need a signature added for live use.
- **Via Privy** you do **not** open a MoonPay merchant account. Privy's plugin enablement carries a light MoonPay KYB questionnaire about your product, handled through Privy [[privy-onramp-setup.md]](../../privy-onramp-setup.md). **No MoonPay keys to manage in this path.**
- **As of 2026-04-16 MoonPay removed the partner paywall** — no monthly subscription to access the dashboard or onboard; transaction fees are the only ongoing partner cost [[partner-pricing]](https://support.moonpay.com/en/articles/694907-partner-pricing-fees-and-the-removed-paywall).

### 3.2 KYC (end-user)

MoonPay runs all end-user KYC itself inside its widget — "Go through KYC, if the user is new to MoonPay"; MoonPay "assumes full responsibility for all fraud disputes and chargebacks" and all customers pass MoonPay's KYC/risk procedures [[on-ramp overview]](https://dev.moonpay.com/docs/on-ramp-overview). **Momento carries zero KYC burden** in either path. KYC tier sets limits (see §3.5).

### 3.3 Fees MoonPay charges the user

Three components [[pricing disclosure]](https://www.moonpay.com/legal/pricing_disclosure):
- **MoonPay fee:** **up to 4.5%** for cards/mobile pay, **min $3.99** (direct) / **$4.50** (partner-referred). Non-USD currencies add 0.25%–10%. Bank transfers ~1%.
- **Network fee:** variable on-chain transfer cost (low on Solana).
- **Ecosystem fee:** the **partner-set markup** (see §3.4).
- Plus a built-in **spread** in the displayed asset price.

Independent comparisons put MoonPay card onramp at ~**4.5%** and bank ~**1%** [[eco.com comparison]](https://eco.com/support/en/articles/15210390-best-stablecoin-onramps-2026-moonpay-transak-coinbase-onramp-compared).

### 3.4 Platform fee / revenue share for Momento — **the key monetization question**

- **Direct MoonPay:** partners set an **Ecosystem Fee** — "a percentage charge … applied to a transaction amount by MoonPay on behalf of … partners. This Ecosystem Fee is set by each partner" [[pricing disclosure]](https://www.moonpay.com/legal/pricing_disclosure). It is configured in the **Partner Dashboard → On-ramp → Fees** [[partner-pricing]](https://support.moonpay.com/en/articles/694907-partner-pricing-fees-and-the-removed-paywall). MoonPay confirms "partners have the option to include an affiliate fee for each transaction" with no integration fee [[partner FAQs]](https://support.moonpay.com/en/articles/388702-moonpay-partner-faqs). **This is the path that lets Momento earn onramp revenue.** *Flag: the exact max-allowed Ecosystem Fee % and payout mechanics were not published on the pages reachable — confirm directly with MoonPay (§8).*
- **Via Privy:** the Privy *native funding hooks* expose **no developer-fee parameter**, and Privy's own design analysis states the widget/onramp path "exposes no developer fee" [[onramp-flow]](../../privy-onramp-flow.html). So **you cannot add a markup through `useFundSolanaWallet`.** To earn on the onramp you must go direct to MoonPay (own account + Ecosystem Fee) or use Privy's Bridge bank path (supports ~0.5–1% dev fee, but bank-only, no cards) [[onramp-flow]](../../privy-onramp-flow.html).

### 3.5 Supported countries, min/max, settlement

- **Countries:** 160+ supported; **USDC (SOL) available globally** in supported territories, **excluding NY, Hawaii, Rhode Island, US Virgin Islands** [[USDC-SOL newsroom]](https://www.moonpay.com/en-gb/newsroom/usdc-solana-moonpay). Unsupported-country list maintained at [[unsupported countries]](https://support.moonpay.com/en/articles/380968-moonpay-s-unsupported-countries).
- **Min:** **$20** minimum buy (or fiat equivalent) [[payment methods & limits]](https://support.moonpay.com/en/articles/389117-payment-methods-settlement-times-and-limits); MoonPay's USDC page also advertises "as little as $20" [[buy USDC]](https://www.moonpay.com/buy/usdc).
- **Max (KYC-tiered):** ~L1 $1,000/tx & $5,000/mo; L2 $5,000/tx & $20,000/mo; L3 $50,000/tx & $100,000/mo [[account limits]](https://support.moonpay.com/en/articles/384264-account-limits-faq). *Flag: tier thresholds vary by region/payment method and change — treat as indicative.*
- **Settlement:** card / Apple Pay / Google Pay / PayPal / Venmo are **"Instant"**; bank transfers 1–3 business days [[payment methods & limits]](https://support.moonpay.com/en/articles/389117-payment-methods-settlement-times-and-limits). USDC settles **directly to the embedded wallet address** Momento passes — no intermediate custody.

---

## 4. Direct MoonPay SDK vs. through Privy

| Dimension | **MoonPay via Privy** (current) | **Direct MoonPay** (own account) |
|---|---|---|
| Account / KYB | None (Privy's plugin handles it) [[setup]](../../privy-onramp-setup.md) | Full partner KYB before keys [[on-ramp overview]](https://dev.moonpay.com/docs/on-ramp-overview) |
| API keys / URL signing | None to manage | pk + secret; **must sign widget URL server-side** [[on-ramp overview]](https://dev.moonpay.com/docs/on-ramp-overview) |
| Code in app | 1 hook call (`useFundSolanaWallet`) | Server URL builder + signing + WebView (Momento's legacy `route.ts`) |
| Provider fallback | Auto: Meld/MoonPay/Coinbase by region [[fiat-onramp]](https://docs.privy.io/wallets/funding/fiat-onramp) | MoonPay only |
| **Developer fee / revenue** | **None possible** [[onramp-flow]](../../privy-onramp-flow.html) | **Yes — Ecosystem Fee** [[pricing]](https://www.moonpay.com/legal/pricing_disclosure) |
| Branding/theming | `moonpay.uiConfig` (theme + accent) | Full widget theming + URL params |
| Maintenance | Privy absorbs provider API churn | You own currency-code/version drift |
| Does Privy take a cut? | **Not documented** — no published Privy spread/markup on the native funding hooks. *Flag (§8).* | n/a |

**Net:** Privy wins decisively on speed/maintenance/conversion (cards + auto-routing + zero accounts). Direct MoonPay wins only on **monetization** (Ecosystem Fee) and full branding control. Given the team's standing decision to monetize via the 4% Jupiter trading fee rather than the onramp [[onramp-flow]](../../privy-onramp-flow.html), **Privy is the right pick now**; keep the direct-MoonPay server route as a documented upgrade if onramp revenue becomes a priority.

---

## 5. Concrete Expo config (what's already correct + what to verify)

The wiring in `apps/mobile/src/hooks/usePrivyFunding.ts` + `PrivyGuard.tsx` matches the verified 2026 Expo API. Minimal reference:

```tsx
// PrivyGuard.tsx — REQUIRED: mount PrivyElements (themed)
import { PrivyProvider } from '@privy-io/expo';
import { PrivyElements } from '@privy-io/expo/ui';

<PrivyProvider appId={ENV.PRIVY_APP_ID} clientId="client-…"
  config={{ embedded: { solana: { createOnLogin: 'users-without-wallets' } } }}>
  {children}
  <PrivyElements config={{ appearance: { colorScheme: 'dark', accentColor: '#00FF88' } }} />
</PrivyProvider>
```

```tsx
// usePrivyFunding.ts — Solana USDC via MoonPay
import { useFundSolanaWallet } from '@privy-io/expo/ui';
const { fundWallet } = useFundSolanaWallet();

await fundWallet({
  address: solanaWalletAddress,
  asset: 'USDC',
  cluster: { name: useSandbox ? 'devnet' : 'mainnet-beta' },
  defaultPaymentMethod: 'card',
  card: { preferredProvider: 'moonpay' },
  moonpay: { useSandbox, uiConfig: { theme: 'dark', accentColor: '#00FF88' } },
});
```

**Activation checklist (the actual remaining work):**
1. Privy Dashboard → **Account Funding / Plugins → MoonPay Fiat On-Ramp → Request Access**; wait for enablement + toggle on [[setup]](../../privy-onramp-setup.md) [[configuration]](https://docs.privy.io/guide/react/wallets/usage/funding/configuration).
2. Verify in a **dev/native build** (not Expo Go): modal opens themed, MoonPay sandbox card accepted on devnet.
3. Flip to **mainnet** (`SOLANA_NETWORK=mainnet-beta`) → `useSandbox` auto-false → live MoonPay.
4. Confirm balance refresh after the (delayed) settlement.

---

## 6. Mapping the existing "Buy USDC" modal → MoonPay

The "Buy USDC" RECOMMENDED card in `FundWalletModal.tsx` → `usePrivyFunding().fund()` → `useFundSolanaWallet().fundWallet({ card: { preferredProvider: 'moonpay' } })` → Privy's native modal → **MoonPay** card flow → USDC-SOL settled to the embedded wallet. **This is already a correct MoonPay-via-Privy implementation.** The greyed-out "MoonPay / Ramp (COMING SOON)" cards are the *legacy* WebView path (server-built signed URLs) and are redundant with the Privy path — safe to remove once the plugin is live (keep `route.ts` as a fallback during transition).

---

## 7. Privy cost / does Privy take a cut?

No Privy fee or spread on the native funding hooks is documented on any reachable page [[fiat-onramp]](https://docs.privy.io/wallets/funding/fiat-onramp) [[funding overview]](https://docs.privy.io/wallets/funding/overview); the user pays MoonPay's fees, and the team's internal analysis assumes the user "buys USDC at the provider's rate; Momento takes nothing on the onramp" [[onramp-flow]](../../privy-onramp-flow.html). **Flag:** absence of a documented fee ≠ guaranteed zero — confirm with Privy whether they take any rev-share/spread on the wrapped MoonPay flow (Privy is now a Stripe company [[ainvest]](https://www.ainvest.com/news/stripe-privy-acquisition-paving-path-crypto-fiat-convergence-2506/), and Stripe-crypto onramp economics may evolve).

---

## 8. Top unknowns / things to verify before shipping

1. **Privy's own cut (if any)** on the wrapped MoonPay flow — not published; ask Privy.
2. **Ecosystem Fee max % + payout mechanics** if you ever go direct MoonPay — not on reachable pages; ask MoonPay [[partner-pricing]](https://support.moonpay.com/en/articles/694907-partner-pricing-fees-and-the-removed-paywall).
3. **Can the MoonPay Ecosystem Fee be threaded through Privy at all?** Evidence says **no** for the native funding hooks. Confirm before assuming onramp revenue is reachable without a direct account.
4. **`useFiatOnramp` on Expo** — currently web-only (`@privy-io/react-auth`); Privy may unify it into Expo later. Re-check changelog on upgrade; **stay on `useFundSolanaWallet` for now.**
5. **`moonpay.uiConfig` RN shape & `cluster` form** — sparsely documented, most likely to drift across Privy versions. Re-verify on every SDK bump (APIs are flagged **experimental**) [[fiat-onramp]](https://docs.privy.io/wallets/funding/fiat-onramp).
6. **MoonPay max card limits** for a new user's KYC tier in target regions — tier numbers vary regionally and change [[account limits]](https://support.moonpay.com/en/articles/384264-account-limits-faq).
7. **Production URL signing** in the legacy `route.ts` MoonPay builder (missing the secret-key signature) — only relevant if you keep/revive the direct path.

---

## Sources

- Privy — Fiat-to-crypto onramps: https://docs.privy.io/wallets/funding/fiat-onramp
- Privy — Funding overview: https://docs.privy.io/wallets/funding/overview
- Privy — Configuring funding methods: https://docs.privy.io/guide/react/wallets/usage/funding/configuration
- Privy — Expo funding (prompting): https://docs.privy.io/guide/expo/embedded/funding/prompting
- Privy — Expo SDK changelog: https://docs.privy.io/reference/sdk/expo/changelog
- Privy — Coinbase Onramp launch: https://x.com/privy_io/status/1815455945691943198
- Privy — Native USDC on Solana: https://x.com/privy_io/status/1913352170440933527
- @privy-io/expo (npm): https://www.npmjs.com/package/@privy-io/expo
- MoonPay — On-ramp overview (dev docs): https://dev.moonpay.com/docs/on-ramp-overview
- MoonPay — Pricing disclosure: https://www.moonpay.com/legal/pricing_disclosure
- MoonPay — Partner pricing & removed paywall: https://support.moonpay.com/en/articles/694907-partner-pricing-fees-and-the-removed-paywall
- MoonPay — Partner FAQs: https://support.moonpay.com/en/articles/388702-moonpay-partner-faqs
- MoonPay — Payment methods, settlement times & limits: https://support.moonpay.com/en/articles/389117-payment-methods-settlement-times-and-limits
- MoonPay — Account limits FAQ: https://support.moonpay.com/en/articles/384264-account-limits-faq
- MoonPay — USDC (SOL) global support: https://www.moonpay.com/en-gb/newsroom/usdc-solana-moonpay
- MoonPay — Unsupported countries: https://support.moonpay.com/en/articles/380968-moonpay-s-unsupported-countries
- MoonPay — Buy USDC: https://www.moonpay.com/buy/usdc
- Stablecoin onramps compared 2026 (eco.com): https://eco.com/support/en/articles/15210390-best-stablecoin-onramps-2026-moonpay-transak-coinbase-onramp-compared
- Stripe/Privy acquisition context: https://www.ainvest.com/news/stripe-privy-acquisition-paving-path-crypto-fiat-convergence-2506/
- Repo: `docs/privy-onramp-setup.md`, `docs/privy-onramp-flow.html`, `docs/solana-migration/research/09-onramp-current.md`
