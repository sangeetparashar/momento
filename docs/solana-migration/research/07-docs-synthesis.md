# 07 — Documentation Synthesis: "What Has Been Planned & Built"

> **Author:** Solution Architect (docs synthesis pass)
> **Date:** 2026-06-23
> **Purpose:** Single coherent picture of everything the accumulated Momento documentation says has been *planned* and *built*, framed against the new **Solana-all-in pivot** (remove Ethereum/Base; add Meteora/Bags pair launches, 1%/10% tax, threshold LP with configurable splits, Streamflow vesting, creator token launches, Moonpay-via-Privy onramp).
> **Scope:** ~40 markdown docs across repo root, `docs/`, `docs/multi-chain/`. Citations use exact filenames throughout.

---

## 0. TL;DR

- The **core social platform is built and shipped** (iOS TestFlight approved 2026-05-21, ~38 beta users). Auth, feed, posts, KYC, wallet *view*, push, uploads are all real.
- The wallet is **already further along than the README admits**: real Solana balances (Helius DAS), **live Jupiter swaps with a flat 4% platform fee**, sends, portfolio snapshots, server-side transaction history, and a **Privy/MoonPay onramp ("Buy USDC")** that is code-complete and blocked only on a Privy-dashboard toggle.
- A **prior multi-chain effort added Base/Ethereum** (KyberSwap swaps, dual embedded wallets, ChainSwitcher UI, chain-aware routes). **This is the single biggest body of work the Solana-all-in pivot supersedes.**
- The **new pivot mechanics do not exist anywhere yet**: no creator token minting, no bonding/pair launches, no Meteora, no **Bags**, no **Streamflow vesting**, no **1%/10% tax**, no **threshold LP / configurable splits**. Every doc that mentions these treats them as *future/NOW-Beta roadmap*, never as built.

---

## 1. What's Actually Built & Shipped (status)

### 1.1 Core platform — BUILT & in production

Cross-confirmed by `docs/PHASE1_STATUS.md`, `docs/CURRENT_STATE_AUDIT.md`, `AGENT_MEMORY.md`, `codebase_plan.md`, `README.md`:

| Area | Status | Evidence |
|---|---|---|
| Privy auth (Google OAuth) + auto-created **embedded Solana wallet** | DONE | `AGENT_MEMORY.md` §8, `README.md` |
| Veriff KYC (session + HMAC webhook + admin approval), `SKIP_KYC` dev bypass | DONE | `docs/decisions.md` #13, `AGENT_MEMORY.md` §4.4 |
| Location feed (PostGIS geography + triggers, auto-expanding radius 5→100km, 5 sort modes) | DONE | `docs/decisions.md` #5/#9, `AGENT_MEMORY.md` §4.3 |
| Posts (text/image/video, Supabase presigned uploads), likes, comments, follows, saves | DONE | `docs/PHASE1_STATUS.md` |
| Push notifications (Expo, 7 event types) | DONE | `AGENT_MEMORY.md` §4.8 |
| Search + Explore (masonry, nearby creators) | DONE | `docs/PHASE1_STATUS.md` |
| API: **26 endpoints**, 8 Prisma models, Redis caching (location-quantized), rate limiters | DONE | `AGENT_MEMORY.md` §10, `codebase_plan.md` |
| Admin endpoints: `POST /api/admin/users/[id]/promote-creator`, `GET .../pending-creators` | DONE (shipped 2026-05-23/24) | `docs/improvements-backlog.md` #010/#011, `docs/handoff-2026-05-24.md` |
| **iOS TestFlight** build 1.0.0(1), Apple Beta-approved 2026-05-21, ~38 users | SHIPPED | `docs/handoff-2026-05-23.md`, `docs/handoff-2026-05-24.md` |
| Landing page + privacy policy + "Join Beta" CTA | SHIPPED | `docs/handoff-2026-05-23.md` |
| Media cache-control fix (OTA live), keep-warm cron (kills 700ms cold start) | SHIPPED | `docs/handoff-2026-05-24.md`, `docs/improvements-backlog.md` #001/#002 |

### 1.2 Wallet / DeFi — BUILT (more than README/PHASE1 claim)

The README and `PHASE1_STATUS.md` describe the wallet as **scaffold/dummy ("Coming Soon")**, but the later `HANDOFF_MULTICHAIN.md` (2026-04-11) — the most authoritative wallet doc — shows it was actually built out:

| Capability | Status | Source |
|---|---|---|
| Balance: SOL + SPL via **Helius DAS**, 30s Redis cache | DONE | `HANDOFF_MULTICHAIN.md` §2 |
| **Swaps: Jupiter (Solana)** with **4% platform fee** (`MOMENTO_PLATFORM_FEE_BPS` default 400), 30s quote-staleness guard | DONE | `HANDOFF_MULTICHAIN.md` §2/§3, `PLAN.md` L129/L375 |
| Sends: SOL/ETH native + USDC SPL/ERC-20, chain-aware validation | DONE | `HANDOFF_MULTICHAIN.md` §2 |
| Portfolio snapshots (per-chain, downsampled to 200 pts; schema `nativeBalance`/`nativeValueUsd`) | DONE | `HANDOFF_MULTICHAIN.md` §2/§3 |
| **Server-side transaction history**: `WalletTransaction` model, `POST /wallet/transactions/log` (idempotent upsert), `GET /wallet/transactions` (cursor paginated), `useWalletTransactions` hook w/ offline fallback | DONE | `HANDOFF_MULTICHAIN.md` §3 |
| **Fiat onramp ("Buy USDC")** via Privy built-in funding modal (`useFundSolanaWallet`/`useFundWallet`), MoonPay provider, themed; **no-service-account, no developer fee** | CODE-COMPLETE, blocked on Privy dashboard toggle | `docs/privy-onramp-setup.md` (2026-05-31) |

### 1.3 NOT built (despite roadmap mentions)

Per `HANDOFF_MULTICHAIN.md` §2 ("Not Yet Working") + §7 ("Remaining Work"), confirmed absent across all docs:

- **Creator token deployment** — no SPL mint code; `User.tokenSymbol` field exists but is *never populated*.
- **Automated pools / bonding curves** — *zero* pool management; no Meteora/Raydium/Orca integration; no custom AMM.
- **Creator-token trading** — swaps only work for DEX-listed tokens; unlisted creator tokens cannot trade.
- **Fee-wallet ATAs on mainnet** — scripts exist (`scripts/create-fee-atas-send.ts`) but **never run** → "swaps silently fall back to **0% fee**" (platform currently earns nothing on swaps).
- **RPC failover** — single point of failure on Helius.
- `/api/wallet/history` is **mis-named** — returns CoinGecko *price* history, not tx history.

---

## 2. Key Prior Decisions (especially those informing / contradicting the Solana-all-in pivot)

### 2.1 Decisions that REINFORCE the pivot

- **AGENT_MEMORY.md is effectively a Solana-token blueprint.** Its Phase-2 ("NOW — Beta") plan already names: *SPL Token 2022 + Metaplex metadata*, **bonding curves for fair launch (pump.fun reference)**, **Meteora DLMM or Raydium CLMM** liquidity pools, creator launch page (*supply, price curve, raise cap, duration*), and new models `CreatorToken` / `TokenLaunch` / `TokenTransaction`. Phase 5 adds a **fee-sharing model: platform fee + creator fee + optional nonprofit split** — directly anticipating the "configurable splits" idea.
- **`docs/TECHNICAL_OVERVIEW.md` / `docs/ROADMAP_MERMAID.md`** already list the live stack as "Solana via Helius RPC + DAS · **Jupiter v6 · Meteora DLMM · Raydium CLMM**" and justify Solana ("sub-second finality, <\$0.001/tx"). Ethereum appears **only** under far-future "Yield" (Aave/Lido/Yearn/Maker) and "Prediction Markets" (Polymarket/Augur/Gnosis) — i.e., already deprioritized.
- **Onramp decision (2026-05-31, `docs/privy-onramp-setup.md`):** deliberately chose the **no-service-account Privy/MoonPay** path and to **"monetize via the trading fee (already live, 4% on Jupiter swaps) instead"** of an onramp fee. This matches "Moonpay-via-Privy onramp" in the pivot — *that work is essentially done.*
- **Privy = chain-agnostic embedded wallet** (`docs/architecture.md`): "Every user gets an embedded Solana wallet on signup — no seed phrases." Nothing about the auth core needs to change for Solana-all-in.

### 2.2 Decisions that the pivot CONTRADICTS / overturns

- **The whole multi-chain ("Option B: both chains coexist") decision** in `MULTI_CHAIN_PLAN.md` and `HANDOFF_MULTICHAIN.md` is reversed. Notable now-obsolete choices: `type ChainType = 'solana' | 'base'`; `User.baseWalletAddress` + `User.primaryChain`; `?chain=solana|base` API convention; ChainContext/ChainSwitcher; **SIWE** external login; **KyberSwap** for Base swaps (chosen 2026-04-11 because "0x v1 API was deprecated/dead"); Transak/Ramp/MoonPay *Base* asset codes.
- **Flat 4% swap fee** (`MOMENTO_PLATFORM_FEE_BPS=400`) is the *only* fee model ever implemented. The pivot's **1% / 10% tax tiers** and **threshold-LP configurable splits** are a brand-new fee architecture with no precedent in any doc.
- **README/PHASE1 "Hardcoded ticker data / dummy prices / swap behind Coming Soon"** decisions (`docs/decisions.md` #11, `README.md`) are stale — superseded first by the multi-chain build (real swaps) and now again by the token-launch direction.

### 2.3 Durable architectural decisions (keep regardless of pivot)

From `docs/decisions.md`, `docs/architecture.md`, `ARCHITECTURE_ANALYSIS.md`: PostGIS-outside-Prisma + triggers; cursor pagination; denormalized counts; optimistic updates w/ rollback; dark-theme-only; `{success,data,error}` envelope; raw-TS shared package; location-quantized Redis cache. None are affected by the chain pivot.

---

## 3. Prior Fee / LP / Token / Launch / Onramp Design Intent

| Pivot concept | Prior design intent in docs | Gap vs. pivot |
|---|---|---|
| **Platform fee / tax** | Flat **4% (400 bps)** swap fee via `MOMENTO_FEE_WALLET` + `MOMENTO_PLATFORM_FEE_BPS` (`PLAN.md` L128-129; `HANDOFF_MULTICHAIN.md`). Phase-5 "fee sharing" concept (platform + creator + optional nonprofit) in `AGENT_MEMORY.md`. | **1%/10% tiered tax** is undocumented and unbuilt. The nonprofit-split idea is the closest precedent for "configurable splits." |
| **Liquidity pools / LP** | Named providers only — **Meteora DLMM** / **Raydium CLMM** (`AGENT_MEMORY.md`, `TECHNICAL_OVERVIEW.md`, `ROADMAP_MERMAID.md`). "Pool creation tied to creator token launch flow." | **No implementation.** **Threshold LP** and **configurable splits** never described. **Bags** never mentioned anywhere. |
| **Creator token launches** | `AGENT_MEMORY.md` Phase 2: SPL Token 2022 + Metaplex, bonding curve (pump.fun), launch page (supply/curve/raise cap/duration), models `CreatorToken`/`TokenLaunch`/`TokenTransaction`, routes `/tokens/launch`, `/tokens/{id}/buy|sell|holders`. `User.tokenSymbol` field exists. | Design intent is rich but **zero code**; `HANDOFF_MULTICHAIN.md` flags it as the "core product differentiator" still to build. |
| **Vesting** | **Streamflow appears in NO document.** | Entirely new. |
| **Onramp** | **Moonpay-via-Privy is built** (`docs/privy-onramp-setup.md`, 2026-05-31): "Buy USDC" card, `usePrivyFunding()`, `PrivyElements` mount, `@privy-io/expo@0.63.9`; sandbox/prod auto-derived from network flags. Older `PLAN.md` also lists Ramp/MoonPay/Transak env vars. | Matches pivot. Only cleanup: drop the **Base** funding branch (`useFundWallet`) and Ramp/Transak/Base asset codes. Pending manual step: enable MoonPay plugin in Privy dashboard. |
| **Swap engine** | **Jupiter v6** live on Solana (`HANDOFF_MULTICHAIN.md`, `AGENT_MEMORY.md`). | Keep. Will need extension for unlisted creator tokens (Meteora pools) — not yet supported. |

---

## 4. Documented Open Gaps & Backlog Relevant to the New Plan

**Blocking the pivot's revenue model:**
- **Fee-wallet ATAs not created on mainnet** → swaps currently take **0% fee** (`HANDOFF_MULTICHAIN.md` §7, High). Must run `scripts/create-fee-atas-send.ts` (≈0.02 SOL). Becomes more involved with 1%/10% tax model.
- **No creator-token deploy path** (SPL mint, Metaplex metadata, mint authority) — `HANDOFF_MULTICHAIN.md` calls for `CreatorToken` model + `POST /api/creators/[id]/deploy-token` + security audit.
- **No pool/bonding-curve mechanism** — choose pump.fun-style curve vs DEX pool (Meteora/Raydium); auto-seed liquidity; handle "graduation." This is where **Meteora/Bags/threshold-LP** slot in.

**Wallet polish carried over (still valid for Solana-only):**
- Slippage hardcoded at 50 bps → user-facing presets (`HANDOFF_MULTICHAIN.md`).
- `/api/wallet/history` mis-named (rename to `/price-history` or repurpose to Helius `getSignaturesForAddress`).
- RPC failover (add QuickNode/Alchemy fallback for Helius).
- Snapshots still carry a backward-compat `sol` response key to remove later.

**Platform-wide gaps (`docs/GAPS.md`, `docs/CURRENT_STATE_AUDIT.md`, `docs/PRODUCTION_READY.md`, `docs/improvements-backlog.md`):**
- **14 type-contract mismatches (T1–T14)** between `packages/shared/src/types.ts` and real API responses (note: some were *introduced* by multi-chain `nativeBalance`/`chain` field changes — pivot cleanup should resolve these).
- Rate limiting exists but historically not wired to every endpoint; CORS still `*`.
- Zero tests, no CI/CD, no Sentry/analytics (`docs/GAPS.md`).
- Video still partly served `no-cache`; **Cloudflare Stream migration** decision was pending (`docs/video-platform-decision.md`, `improvements-backlog.md` #012) — orthogonal to the chain pivot but live in the backlog.
- Upload cap raised to 250MB + `react-native-compressor` were built but **awaiting an EAS build** to reach users (`docs/handoff-2026-05-24.md`).

---

## 5. Docs SUPERSEDED by the Solana-All-In Pivot

### 5.1 Fully superseded (multi-chain / Base — archive these)
- **`MULTI_CHAIN_PLAN.md`** — entire "Solana + Base coexist" orchestration plan.
- **`HANDOFF_MULTICHAIN.md`** — still valuable as the **best record of what the wallet actually does**, but its dual-chain framing and Base "Remaining Work" are obsolete. *Mine it for Solana truth, then archive.*
- **All of `docs/multi-chain/`** (`00-overview.md`, `01`–`11` agent docs, `AGENT_PROMPTS*.md`, `HUMAN_DEVICE_TESTING.md`) — Base balance (`lib/base.ts`), Base swap via 0x→KyberSwap (`lib/base-swap.ts`), Base send/onramp asset codes, ChainProvider/ChainSwitcher, dual-wallet creation, SIWE. Recommend moving to `docs/archive/multi-chain-base/`.

**Code these docs imply should be deleted:** `apps/api/lib/base.ts`, `apps/api/lib/base-swap.ts`, `apps/mobile/src/providers/ChainProvider.tsx`, `apps/mobile/src/hooks/useChain.ts`, `apps/mobile/src/components/features/ChainSwitcher.tsx`; plus de-chain the wallet routes/hooks/modals, drop ETH embedded wallet + SIWE from `useAuth.ts`/`PrivyGuard.tsx`, remove the "Connect Base Wallet" button and `ChainProvider` from `_layout.tsx`. (Schema: `User.baseWalletAddress`/`primaryChain`, `chain` columns become vestigial.)

### 5.2 Partially superseded (update, don't delete)
- **`README.md`** — understates wallet (says swaps are Phase-2 placeholder; they're live) and lists Solana-only architecture that's actually accurate again *post-pivot*. Update the status table; fix fee model to 1%/10%.
- **`docs/decisions.md`** — #11 (dummy token data) and the "swap behind Coming Soon" posture are stale.
- **`PLAN.md`** (the Improvements & Deployment plan, despite README labeling "PLAN.md" as Part-1 build) — `MOMENTO_PLATFORM_FEE_BPS=400` (4%) and the env/endpoint tables predate the tax redesign and still list Base-era endpoints.
- **`docs/privy-onramp-setup.md`** — correct and current for Solana; just strip the "test on both chains / Base" instructions.
- **`AGENT_MEMORY.md`** — mostly forward-compatible (it *is* the Solana token roadmap) but its Phase-5 Ethereum yield/prediction-market references and "Solana + Base" implications need a pivot note.

### 5.3 Not affected (still valid)
`docs/architecture.md`, `ARCHITECTURE_ANALYSIS.md`, `docs/TECHNICAL_OVERVIEW.md`, `docs/costs.md`, `docs/patterns.md`, `docs/agent-guide.md`, `docs/engineering-starter-kit.md`, `docs/video-platform-decision.md`, `SCREEN_MAP.md`, `LANDING_PAGE_SPEC.md`, `docs/design/*`, `SETUP_GUIDE.md`/`docs/SETUP_GUIDE.md`, iOS/distribution docs, and the `CURSOR_INSTRUCTIONS*` build guides (which were always Solana-only and never mention Base, fees beyond 4%, Streamflow, Bags, or 1%/10% tax).

---

## 6. Cross-Reference: where each pivot element stands today

| Pivot element | Built? | Where documented | Action |
|---|---|---|---|
| All-in Solana / remove Base | Base is **built & must be torn out** | `MULTI_CHAIN_PLAN.md`, `docs/multi-chain/*`, `HANDOFF_MULTICHAIN.md` | Remove + archive (§5.1) |
| Creator token launches (SPL+Metaplex) | No | `AGENT_MEMORY.md` (intent), `TECHNICAL_OVERVIEW.md` | Build new |
| Meteora pair launches | No (named only) | `AGENT_MEMORY.md`, `TECHNICAL_OVERVIEW.md`, `ROADMAP_MERMAID.md` | Build new |
| **Bags** pair launches | No — **mentioned nowhere** | — | Net-new; no prior context |
| 1% / 10% tax | No (only flat 4%) | `PLAN.md`, `HANDOFF_MULTICHAIN.md` (4%) | New fee architecture |
| Threshold LP + configurable splits | No | `AGENT_MEMORY.md` (nonprofit-split idea is nearest) | Build new |
| **Streamflow** vesting | No — **mentioned nowhere** | — | Net-new |
| Moonpay-via-Privy onramp | **Yes (blocked on dashboard toggle)** | `docs/privy-onramp-setup.md` | Keep; drop Base branch; enable plugin |
| Jupiter swaps + platform fee plumbing | **Yes** (fee currently 0% until ATAs created) | `HANDOFF_MULTICHAIN.md`, `PLAN.md` | Run fee-ATA script; rework for tax tiers |

---

## 7. Recommendations for the migration effort

1. **Treat `HANDOFF_MULTICHAIN.md` + `AGENT_MEMORY.md` as the two source-of-truth docs**: the former for *what the wallet actually is*, the latter for *the intended Solana token roadmap*. Everything else is either downstream or stale.
2. **Sequence the Base teardown first** (it's well-specified and de-risks the type-contract mismatches T1–T14, several of which were introduced by the multi-chain field renames).
3. **The onramp is a quick win** — already code-complete; finish by enabling the MoonPay plugin and removing the Base funding path.
4. **The genuinely new, undocumented surface area** is: creator-token mint/launch, Meteora **+ Bags** pools, threshold LP w/ configurable splits, 1%/10% tax, and Streamflow vesting. None has prior code or design depth — these warrant their own dedicated research/design docs (the rest of this `docs/solana-migration/research/` series).
5. **Fix the silent 0% fee** before any tax redesign — the platform is currently earning nothing on swaps because fee-wallet ATAs were never created on mainnet.

---

*Docs reviewed:* `README.md`, `PLAN.md`, `PLAN-improvements-and-deployment.md`, `ARCHITECTURE_ANALYSIS.md`, `AGENT_MEMORY.md`, `codebase_plan.md`, `MULTI_CHAIN_PLAN.md`, `HANDOFF.md`, `HANDOFF_MULTICHAIN.md`, `LANDING_PAGE_SPEC.md`, `SCREEN_MAP.md`, `SETUP_GUIDE.md`; `docs/decisions.md`, `docs/architecture.md`, `docs/TECHNICAL_OVERVIEW.md`, `docs/CURRENT_STATE_AUDIT.md`, `docs/GAPS.md`, `docs/improvements-backlog.md`, `docs/video-platform-decision.md`, `docs/costs.md`, `docs/ROADMAP_MERMAID.md`, `docs/agent-guide.md`, `docs/patterns.md`, `docs/engineering-starter-kit.md`, `docs/PRODUCTION_READY.md`, `docs/PHASE1_STATUS.md`, `docs/privy-onramp-setup.md`, `docs/handoff-2026-05-23.md`, `docs/handoff-2026-05-24.md`, `docs/handoff-ios-enablement-2026-04-17.md`, `docs/multi-chain/*` (16 files), `CURSOR_INSTRUCTIONS*.md` (scanned for token/fee/chain content), `docs/design/*`.
