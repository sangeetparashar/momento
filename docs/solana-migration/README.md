# Momento → Solana-All-In: Migration Architecture & Roadmap

**Status:** Discovery + research complete (2026-06-23). Awaiting product decisions before implementation.
**Branch:** `claude/gifted-pascal-fcyskz`
**Author:** Senior-engineer + solution-architect agent fleet (19 Opus agents). Per-topic detail in [`research/`](./research).

---

## 0. How to read this

This document is the synthesis. The evidence lives in `research/01–16`. Each claim below points to the
report that substantiates it. Two things to internalize first:

1. **The codebase is further along than its README admits.** Momento is a shipped social app (iOS
   TestFlight, ~38 beta users) with working Privy auth + embedded Solana wallets, live Jupiter swaps
   (flat 4% fee), sends, balances, history, and a **MoonPay-via-Privy onramp that is already code-complete.**
2. **One core requirement is not literally achievable on Solana** (the 1%/10% on-token tax). We have a
   strong alternative that delivers the *intent*. This needs your decision (§7, §14).

---

## 1. Executive summary

Momento is pivoting from a **dual-chain (Solana + Base/EVM)** creator app to **Solana-only**, and adding a
creator-token economy: streamlined token launches, threshold-based fundraising into a USDC liquidity pool
with configurable splits, vesting, and a fee model that keeps **most trading fees with the creator + Momento**
rather than a third-party launchpad.

The research converges hard on a single answer for the on-chain rail:

> **Build on Meteora directly as a Partner: launch via Dynamic Bonding Curve (DBC) → graduate to DAMM v2.**
> Meteora takes a flat **20%** of trading fees; the remaining **80%** is split between **Momento (partner)
> and the creator** on a knob we control. This beats Bags (which is itself just a DBC front-end that keeps
> ~50%) and pump.fun/Raydium on fee capture — exactly the "keep most fees" goal. (`10`,`11`,`15`)

The biggest constraints:
- **The literal 1%/10% on-token tax is impossible.** Achieve the intent by routing in-app trades through
  our own ~1% path and letting inferior external liquidity + normal DEX fees be the "elsewhere" cost. (`12`)
- **No server-side signing exists yet** — the keystone build item for programmatic mint/pool/claim/vesting. (`04`)
- **Committed live secrets** in `apps/api/.env.development`, `apps/mobile/.env.development`, `eas.json`
  (+ hardcoded Privy clientId, Helius key) — rotate regardless of the migration. (`04`,`06`,`08`)

---

## 2. Current state — what is actually built (discovery)

| Area | Today | Source |
|---|---|---|
| **App shape** | Expo RN app + Next.js API + Next landing, pnpm/turbo monorepo, `packages/shared` | `01`,`02`,`08` |
| **Auth/wallets** | Privy OAuth/email; **auto-creates BOTH Solana + ETH embedded wallets**; backend verifies Privy JWT, JIT-creates `User` | `04` |
| **Chains** | **Dual-chain**: `chain` (`solana`\|`base`) param threaded through `auth.ts`, `lib/`, all `wallet/*` routes | `02`,`06` |
| **Trading** | Live in-app swaps — Jupiter (Solana) / KyberSwap (Base) — **client-signed** (API builds unsigned tx, mobile signs) | `02`,`05` |
| **Fees** | Single **flat 4%** swap fee (`MOMENTO_PLATFORM_FEE_BPS=400`) to one hardcoded wallet via Jupiter `platformFee`; **fee ATAs never created on mainnet → currently earning 0%** | `05`,`07` |
| **Onramp** | **MoonPay-via-Privy already wired** (`usePrivyFunding.ts`, provider pinned `moonpay`, asset USDC). Blocked only on enabling the MoonPay plugin in Privy dashboard + going mainnet | `09`,`14` |
| **Creator tokens** | `creator_tokens` model + `TokenStatus`/`PoolType` enums exist but are **dormant & 100% unwired**; all buy/sell UI is "Coming Soon" with a hardcoded `$0.004` price | `02`,`03`,`05` |
| **Token standard** | **Classic SPL** (`Tokenkeg…`), not Token-2022 | `05` |
| **On-chain economics** | No mint, pool, fee-claim, tax, vesting, or LP-split code anywhere — **all greenfield** | `02`,`05` |
| **Signing** | **No server-side / delegated signing** — every tx is user-signed today | `04` |
| **Deploy** | Vercel (api+landing) + EAS (mobile); infra is Solana-clean | `08` |

**The prior multi-chain effort actually *built* Base** (KyberSwap swaps, dual wallets, ChainSwitcher, SIWE,
chain-aware routes) — it is the main body of work this pivot supersedes and must be torn out. (`06`,`07`)

---

## 3. Target architecture (Solana-only)

```
Mobile (Expo RN)                    API (Next.js)                    Solana / Services
─────────────────                   ──────────────                   ─────────────────
Privy embedded wallet  ──signs──►  /wallet/* (de-branched)  ──────►  Helius RPC / DAS / Webhooks / Sender
Launch wizard UI       ──relay──►  /tokens/launch           ──────►  Meteora DBC (create curve)
Trade (~1% in-app)     ──────────► /tokens/trade            ──────►  Meteora DBC/DAMM v2 (our pool)
Vesting view           ──────────► /tokens/vesting          ──────►  Streamflow / Jupiter Lock
Buy USDC (MoonPay)     ──────────► (Privy native funding)   ──────►  MoonPay
                                    Privy Server Wallet ────────────►  mint / migrate / claim fees / vest
                                    Cron + Helius webhooks ─────────►  fee sweeps, threshold/graduation, accounting
```

- **Quote asset = USDC** everywhere (aligns with the onramp, dollar-native accounting, price stability). (`15`)
- **Signing:** Privy **Server Wallets** (`@privy-io/node`) for platform/treasury actions; client
  `signTransaction` + **backend relay & self-submit via Helius Sender** for user actions. (`04`,`16`)
- **Client lib:** stay on **`@solana/web3.js` v1** — Meteora, Streamflow, Privy are all v1. (`16`)

---

## 4. Core economic model — launch, fundraise, LP splits

**Rail:** Meteora **DBC** (launch) → **DAMM v2** (ongoing), Momento configured as **`feeClaimer`/partner**. (`10`,`15`)

**Lifecycle:**
1. **Mint** a Token-2022 mint (USDC-quoted DBC config). (`05`,`16`)
2. **Bonding curve:** token trades on the curve; fees accrue split 20% Meteora / 80% (partner+creator).
3. **Graduation** at `migration_quote_threshold` (e.g., ~$12k USDC, configurable): liquidity migrates to a
   DAMM v2 pool seeded by the raised USDC.
4. **Configurable splits at graduation** (the requirement — all are real DBC knobs):
   - `partner_lp_percentage` / `partner_locked_lp_percentage` — value bound as **LP** (ours, locked).
   - `creator_lp_percentage` / `creator_locked_lp_percentage` — LP returned to/locked for the creator.
   - `leftover_receiver` — direct **tokens returned to the creator**.
   - `creator_trading_fee_percentage` — ongoing fee split.
   - `migration_fee_option`, `token_supply` — pool fee tier + supply allocation.
5. **Permanently-locked LP still earns claimable fees forever** → ongoing revenue for creator + Momento.
   Claim via `claimPartnerTradingFee` (Momento) / `claimCreatorTradingFee` (creator). (`10`)

**Example fee economics** (every $100 of trading fees): **$20 Meteora / $40 Momento / $80×split creator** —
default proposal **20/40/40**. Referral/host fee is carved from Meteora's 20%, never our 80%. (`15`)

**Why not Bags:** Bags is a thin front-end over this same Meteora DBC stack but **keeps ~50% of fees** and
exposes no Token-2022 tax path. Building directly captures the difference. Optionally prototype on Bags to
validate demand. (`11`)

---

## 5. Data model changes (Prisma) — see `03`

**Remove (EVM):** `users.baseWalletAddress`, `users.primaryChain`, `PoolType.AERODROME`, `chain` columns on
`creator_tokens`/`portfolio_snapshots`/`wallet_transactions` (collapse uniques/indexes). ⚠️ PostGIS
geography columns/triggers live *outside* `schema.prisma` — never `db push`; use forward migrations only.

**Add (new):** `TokenFundraise` + `FundraiseContribution`, `LpPosition`, `TokenFeeConfig` + `FeeEvent`
(`FeeSource = IN_APP | EXTERNAL`), `VestingSchedule`, `Trade` (+ optional `TokenPriceSnapshot`). Concrete
Prisma sketches in `research/03-database.md`.

---

## 6. EVM/Base removal plan — see `06`

Base is a **chain-parameterized abstraction**, not a separate stack — removal is mostly stripping
`if (chain === 'base')` branches + deleting a few pure-EVM files. **No EVM npm libs are installed**
(Base was raw JSON-RPC + manual ABI).

- **Delete (5):** `apps/api/lib/base.ts`, `lib/base-swap.ts`, mobile `ChainProvider.tsx`, `ChainSwitcher.tsx`, `useChain.ts`.
- **Strip branches:** 8 API wallet routes, `lib/auth.ts` (ETH wallet + `getWalletForChain`), 8 mobile hooks/components, both wallet screens, `PrivyGuard` (`ethereum` embedded wallet).
- **Deps:** drop `@ethersproject/shims` + its polyfill. **Env:** all `BASE_*`, `ALCHEMY_API_KEY`, `ZEROX_API_KEY`, `KYBER_*`, `EXPO_PUBLIC_BASE_*`.
- **Schema:** forward migration dropping `baseWalletAddress` + `AERODROME`.
- **Docs:** archive `docs/multi-chain/*`, `MULTI_CHAIN_PLAN.md`, `HANDOFF_MULTICHAIN.md`.
- ⚠️ **Collapse, don't delete** `ChainType`/`CHAIN_CONFIG` in `packages/shared` (a 1-member union makes `tsc`
  surface every missed `=== 'base'` branch across 33 consumer files). Keep `chain`/`nativeBalance` DB columns
  (they back Solana data now) defaulting to `'solana'`. Never edit applied migrations.

---

## 7. The tax model (1% in-app / 10% elsewhere) — see `12` ⚠️ DECISION NEEDED

**Hard finding:** No Solana mechanism can meter a fee by *where* a trade happens.
- **Token-2022 Transfer Fee** = flat, per-mint, context-blind.
- **Transfer Hook** can only approve/revert (never charge a differential fee) and **breaks composability**
  (DEXs gate hook tokens behind allowlists → "tax elsewhere" *blocks* external trading rather than taxing it).
- A ≥10% transfer fee is a textbook **honeypot signature** (wallet warnings, delistings, Jupiter blocks limit orders).

**Three implementable options (pick one — §14):**
- **(A) In-app routing only [recommended].** All in-app trades route through our pool/program at **~1%**
  (PumpSwap/LetsBonk model). No punitive on-token tax → token stays fully tradable & reputable; "elsewhere"
  cost is just worse liquidity + standard DEX fees. Maximizes adoption & composability.
- **(B) Moderate transfer fee + in-app rebate.** Add a **3–5%** Token-2022 transfer fee, rebate in-app users
  down to ~1%. Real premium on external trades, still tradable. Adds rebate accounting + AML surface; Momento
  unilaterally defines "in-app."
- **(C) Hook-based walled garden [not recommended].** Transfer hook allowlisting only Momento venues → token
  is essentially untradeable elsewhere. Maximum control, minimum composability/reputation.

---

## 8. Vesting — see `13`

- **Creator/team vesting (cliff/linear):** **Streamflow** `@streamflow/stream` — Privy-signable via
  `prepareCreateInstructions`; ~0.17 SOL/contract. Validate the ephemeral-`metadata`-Keypair multi-signer
  create flow on devnet first.
- **LP / retained-allocation lock:** **Jupiter Lock** (free, audited) to avoid Streamflow's 0.5% lock fee.
- Watch transfer-fee impact: recipients of vested fee-tokens receive slightly less than nominal.

## 9. Onramp — see `09`,`14`

Keep **MoonPay-via-Privy** (already wired). Remaining work is operational, not architectural:
1. Enable the **MoonPay Fiat On-Ramp plugin** in the Privy dashboard.
2. Verify in a native build; flip `SOLANA_NETWORK=mainnet-beta`.
3. Remove the dormant legacy WebView onramp (`/api/wallet/onramp`, Ramp/Transak).
Note: Privy native funding exposes **no developer fee** — onramp revenue would require a direct MoonPay
partner account. Team already chose to monetize via trading fees, so Privy is the right call.

## 10. Recommended SDK stack — see `16`

web3.js v1 · Helius (RPC/DAS/Priority-Fee/Webhooks/Sender) · `@solana/spl-token` (Token-2022) · Metaplex
metadata · Privy (`@privy-io/expo` mobile, **`@privy-io/node`** backend — `server-auth` is deprecated) ·
Meteora (`dynamic-bonding-curve-sdk` + `cp-amm-sdk`) · Streamflow + Jupiter Lock · Anchor 1.0.2 / Pinocchio
only if a custom program is needed.

---

## 11. Phased roadmap

- **Phase 0 — Decisions & hygiene:** lock the tax model (§7), launch rail, and quote asset; **rotate
  committed secrets**; enable MoonPay plugin + go mainnet; create mainnet fee ATAs (fix the 0% earnings bug).
- **Phase 1 — EVM removal:** collapse `packages/shared` chain types; delete EVM files; de-branch routes;
  forward migration; archive multi-chain docs. (Self-contained, low-risk, unblocks everything.)
- **Phase 2 — Signing infra:** Privy Server Wallets (`@privy-io/node`) + client-relay/self-submit via Helius
  Sender; fee-accounting foundation (`FeeEvent`, webhooks).
- **Phase 3 — Launch + LP/fundraise:** Meteora DBC integration as partner; `TokenFundraise`/`LpPosition`
  models; threshold + configurable splits; graduation → DAMM v2; fee-claim jobs.
- **Phase 4 — In-app trading at ~1%:** route trades through our pool; implement chosen tax model; replace the
  flat-4%/Coming-Soon UI.
- **Phase 5 — Vesting + creator launch wizard:** Streamflow/Jupiter Lock; mobile launch wizard, vesting view,
  fee/tax disclosure UI; pick canonical wallet screen (`app/wallet.tsx`).
- **Phase 6 — Analytics, compliance, polish:** Helius webhook analytics; **legal read** on token issuance +
  fee custody (flagged repeatedly); landing copy refresh (fix "4 Blockchain Partners").

---

## 12. Open decisions & top risks

| # | Decision / Risk | Recommendation |
|---|---|---|
| D1 | **Tax model** (§7) | Option A (~1% in-app routing); add B's 3–5% transfer fee only if a real external premium is required |
| D2 | **Launch rail** | Meteora DBC direct as partner; optionally prototype on Bags first |
| D3 | **Quote asset** | USDC |
| D4 | **Signing** | Privy Server Wallets + client-relay |
| R1 | **Committed live secrets** | Rotate immediately (independent of migration) |
| R2 | **Compliance** | Token issuance + fee custody = materially larger regulatory surface — legal read before launch |
| R3 | **Token-2022 + Meteora hooks** | Transfer-fee OK; verify hook support with Meteora at build time |
| R4 | **PostGIS out-of-schema state** | Forward migrations only; never `prisma db push` |
| R5 | **Privy server signing unproven for our flows** | Spike DBC create + fee-claim on devnet early (Phase 2) |

---

## 13. Research index

| # | Report | Focus |
|---|---|---|
| 01 | `research/01-mobile-app.md` | Mobile app inventory |
| 02 | `research/02-api-backend.md` | API routes & lib |
| 03 | `research/03-database.md` | Prisma schema + new models |
| 04 | `research/04-wallet-auth-privy.md` | Privy/auth/signing |
| 05 | `research/05-token-fee-lp-onchain.md` | Existing token/fee/LP code |
| 06 | `research/06-evm-removal-surface.md` | EVM removal checklist |
| 07 | `research/07-docs-synthesis.md` | Prior docs synthesis |
| 08 | `research/08-landing-shared-infra.md` | Landing/shared/infra |
| 09 | `research/09-onramp-current.md` | Current onramp |
| 10 | `research/10-meteora.md` | Meteora DBC/DAMM v2/DLMM |
| 11 | `research/11-bags.md` | Bags.fm |
| 12 | `research/12-tax-mechanism.md` | 1%/10% tax feasibility |
| 13 | `research/13-streamflow.md` | Vesting |
| 14 | `research/14-moonpay-privy.md` | MoonPay via Privy |
| 15 | `research/15-lp-economics.md` | LP/fundraise economics |
| 16 | `research/16-solana-stack.md` | Recommended SDK stack |
