# Privy Fiat Onramp — Setup & Activation Checklist

> **Status:** Code shipped (uncommitted→committed 2026-05-31). **Blocked on one dashboard step you must complete** (see Step 1).
> The "Buy USDC" button is live in the app's Fund modal, but the payment provider will not appear until the MoonPay plugin is enabled in the Privy dashboard.

This is the **no-service-account** onramp path: Privy's built-in funding modal (`useFundWallet` / `useFundSolanaWallet`), themed to Momento. No Bridge account, no MoonPay merchant account, no API keys to manage, **no developer fee** (deferred by design — see `docs/privy-onramp-flow.html`).

---

## ✅ Step 1 — Enable the MoonPay Fiat On-Ramp plugin (YOU — required, ~5 min + review wait)

This is the **only thing standing between the current code and a working onramp.**

1. Go to **[dashboard.privy.io](https://dashboard.privy.io)** → log in.
2. Select the **Momento** app from the App dropdown (App ID `cmjbzyj4q00twlb0d1uc5w0sb`).
3. Left sidebar → **Plugins**.
4. Find **MoonPay Fiat On-Ramp** → click **Request Access**.
5. Privy's team reviews the request and enables it. **They may ask for basic information about Momento** to satisfy MoonPay's KYB (Know-Your-Business) compliance — this is Privy/MoonPay's process, **not** you opening a MoonPay merchant account.
6. Once enabled, the **Request Access** button becomes a **toggle** on the Plugins page. Turn it **on**.

> ⏳ This is request-and-wait. Until it's approved + toggled on, tapping "Buy USDC" opens the Privy modal but shows no working provider.

---

## ✅ Step 2 — (Optional) Confirm appearance / supported regions

- The modal is themed in code: dark surface + Momento green (`#00FF88`) via `PrivyElements` config in `PrivyGuard.tsx`.
- MoonPay supports cards, Apple Pay, Google Pay across 180+ countries. Coinbase is the alternate provider Privy may route to.
- Sandbox vs production is auto-derived from the app's network flags (`SOLANA_NETWORK` / `BASE_NETWORK`) — **no new env var.** In dev builds it uses MoonPay sandbox; in production builds (mainnet) it uses live MoonPay.

---

## ✅ Step 3 — Device verification (after Step 1 is approved)

> Onramp hooks only work in a **dev/native build** — Expo Go lacks Privy's native module (the app already guards for this and runs in guest mode there).

1. Build/run a dev or TestFlight build.
2. Open **Wallet → Add Funds → "Buy USDC"** (the green RECOMMENDED card).
3. Confirm:
   - [ ] Privy modal opens, themed dark/green.
   - [ ] A provider (MoonPay) loads and accepts a sandbox card.
   - [ ] On completion, the modal closes and the USDC balance refreshes.
4. Test on **both chains** — switch the app's chain selector to Solana and to Base and repeat. `useFundWallet` handles Base; `useFundSolanaWallet` handles Solana.

---

## How it's wired (for future reference)

| Piece | File | Role |
|---|---|---|
| `<PrivyElements>` mount | `apps/mobile/src/providers/PrivyGuard.tsx` | **Required** — funding hooks throw `privy_elements_not_ready` without it. Themed here. |
| `usePrivyFunding()` | `apps/mobile/src/hooks/usePrivyFunding.ts` | Picks `useFundWallet` (Base) vs `useFundSolanaWallet` (Solana) by active chain; passes `asset: 'USDC'`, wallet address, sandbox flag; refreshes balance. |
| "Buy USDC" card | `apps/mobile/src/components/features/FundWalletModal.tsx` | RECOMMENDED method; calls `fund()` directly (Privy modal renders over the sheet). |

**SDK:** `@privy-io/expo@0.63.9`, hooks imported from `@privy-io/expo/ui`.

---

## If you later want the onramp FEE

Taking a cut **on the onramp itself** requires the **Bridge** path instead — which **does** require a separate Bridge account + business KYB + a USD payout account, plus server routes + webhooks. Full comparison and flow in **`docs/privy-onramp-flow.html`**. Decision on record (2026-05-31): skip the onramp fee for a fast, no-account rollout; **monetize via the trading fee** (already live, 4% on Jupiter swaps) instead.

---

## Quick reference

- **Privy dashboard:** https://dashboard.privy.io → Momento → Plugins → MoonPay Fiat On-Ramp
- **App ID:** `cmjbzyj4q00twlb0d1uc5w0sb`
- **Design doc:** `docs/privy-onramp-flow.html`
- **Decision:** widget onramp, no fee, no service account
