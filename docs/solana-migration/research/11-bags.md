# 11 — Bags (bags.fm) as a Solana Launch Rail

**Research date:** 2026-06-23
**Author:** Solana launchpad research
**Decision question:** Should Momento launch creator-token pairs on **Bags** (bags.fm), or build its own launch rail directly on **Meteora**, given the goal of keeping the **maximum share of trading fees for the creator + Momento** (not the launchpad)?

> **Reading guide.** Every claim is tagged:
> - **[VERIFIED]** — confirmed by official Bags/Meteora docs, the SDK, on-chain data, or DefiLlama.
> - **[REPORTED]** — stated by reputable secondary coverage but not in primary docs.
> - **[UNCERTAIN]** — conflicting or incomplete sources; treat as an open question.
> Launchpads change fast — re-verify fee numbers before committing engineering.

---

## 1. What Bags is & its launch model

**[VERIFIED] Bags is a Solana-native, creator-focused token launchpad** ("go public and earn") that lets anyone launch, trade, and discover tokens with no code, with the headline pitch that creators "earn royalties from every trade — forever." (https://bags.fm/ , https://support.bags.fm/en/articles/11917007-who-what-why-of-bags)

**[VERIFIED] Bags is built on Meteora's Dynamic Bonding Curve (DBC).** On-chain indexing (Bitquery) shows Bags tokens are created via the Meteora DBC program `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`, instruction `initialize_virtual_pool_with_spl_token`, with the Bags authority `BAGSB9TpGrZxQbEsrEznv5jXXdwyP6AXerN8aVRiAmcv`. Statement: "Bags FM tokens are launched on Meteora DBC." (https://docs.bitquery.io/docs/blockchain/Solana/bags-fm-api/) The Bags SDK also exports `METEORA_DBC_PROGRAM_ID` and `METEORA_DAMM_V2_PROGRAM_ID` constants. (https://www.npmjs.com/package/@bagsfm/bags-sdk)

**[VERIFIED] Launch model = bonding curve → migrate to Meteora AMM.** Meteora DBC is a configurable bonding curve that sells tokens until a migration threshold (`migration_quote_threshold`) is hit, then **automatically graduates the token to a Meteora DAMM v1 or DAMM v2 pool.** Bags uses the DBC (pre-migration) and **DAMM v2** (post-migration) path. (https://docs.meteora.ag/overview/products/dbc/what-is-dbc , https://defillama.com/protocol/bags) So: **Bags is essentially a hosted, creator-branded front-end + fee-routing layer on top of Meteora DBC/DAMM v2 — it is NOT its own AMM.** This is the single most important architectural fact for the build-vs-buy decision (see §5).

**[VERIFIED] So which AMM does it migrate to? Meteora (DAMM v2), not Raydium.** (https://defillama.com/protocol/bags , https://docs.meteora.ag/overview/products/dbc/what-is-dbc)

---

## 2. Fee & royalty model (the core reason Bags was named)

### 2.1 The creator-facing pitch
**[VERIFIED] "Creators earn 1% of all trading volume on their tokens — forever."** This is repeated across Bags' own surfaces and coverage. (https://bags.fm/ , https://support.bags.fm/en/articles/11917007-who-what-why-of-bags , https://dev.to/sivarampg/bagsfm-the-solana-launchpad-thats-changing-creator-monetization-4g7n)

### 2.2 What actually accrues (the real split) — partly UNCERTAIN
There are two readings in the sources; resolve before committing:

- **[VERIFIED via DefiLlama income statement] Bags keeps roughly half of total trading fees.** DefiLlama reports Bags annualized **Fees ≈ $60.6M** and annualized **Revenue ≈ $30.3M**, with the income statement structured as *Gross Protocol Revenue = Protocol Fees (≈50%, Bags' cut) + Creator Fees (≈50%, paid out to creators)*. Methodology: "Total trading fees paid by users when swapping against Bags DBC pools (pre-migration) and DAMMv2 pools (post-migration)… exclude the underlying Meteora protocol fee and DAMMv2 LP Fees and any referral fees." (https://defillama.com/protocol/bags) **Implication: roughly half the fee Bags collects is retained by Bags; the other half is the "creator" pool.** If the creator-side pool is ~1% of volume, the **total swap fee is on the order of ~2%** — but Bags does not publish this number explicitly. **[UNCERTAIN]**

- **[REPORTED, conflicting] "1% total fee, of which the creator share is configurable 10–90%."** One secondary write-up frames the total swap fee as **1%**, split between creator and protocol per the fee-share config (creator floor ~10%, fee-claimer up to ~90%). (https://alearesearch.substack.com/p/bags-launchpad) This conflicts with the "creator earns 1%" framing and with the DefiLlama 50/50 structure. **Treat the exact total-fee percentage as an open question.**

### 2.3 Fee-share / royalty splitting & claiming — VERIFIED mechanics
**[VERIFIED] Token Launch v2 makes fee-sharing mandatory and configurable in basis points (BPS).** (https://docs.bags.fm/changelog/changelog)
- Allocation is by **BPS that must sum to exactly 10,000 (100%)** across creator + all fee claimers. The creator must explicitly set their own BPS. (https://docs.bags.fm/how-to-guides/launch-token)
- **Up to 100 fee earners per token** (≥15 requires Address Lookup Tables, auto-managed by the SDK). (https://docs.bags.fm/changelog/changelog , https://docs.bags.fm/how-to-guides/launch-token)
- Fee claimers can be addressed by **social username** (`twitter`, `tiktok`, `kick`, `github`) and resolved to a wallet via `GET /token-launch/fee-share/wallet/v2`. This is Bags' signature "add any X user to your fee split by handle" feature. (https://docs.bags.fm/changelog/changelog , https://startupfortune.com/bagsapp-goes-live-with-tiktok-fee-sharing-that-lets-any-creator-earn-from-their-username-alone/)
- **Partner share** is supported via optional `partner` / `partnerConfig` parameters (this is the lever for a platform like Momento to take a cut). (https://docs.bags.fm/how-to-guides/launch-token)

Example BPS shape from the docs:
```ts
feeClaimers: [
  { provider: "twitter", username: "user1", bps: 3000 }, // 30%
  { provider: "twitter", username: "user2", bps: 3000 }, // 30%
  // creator gets the remaining 4000 bps (40%)
]
```
(https://docs.bags.fm/how-to-guides/launch-token)

**[VERIFIED] Claiming is pull-based and abstracted by the API.** Fees accrue to positions (virtual pool pre-migration, DAMM v2 post-migration, or a custom fee vault) and are claimed on demand:
- `sdk.fee.getAllClaimablePositions(wallet)` → lists claimable positions. (https://docs.bags.fm/how-to-guides/claim-fees , https://www.npmjs.com/package/@bagsfm/bags-sdk)
- `sdk.fee.getClaimTransactions(wallet, tokenMint)` → builds the claim tx; "automatically looks up your claimable position, determines the position type… and builds the appropriate claim transactions." (https://docs.bags.fm/how-to-guides/claim-fees)
- Underlying endpoints: `GET /token-launch/claimable-positions`, `POST /token-launch/claim-txs/v3`. (https://docs.bags.fm/how-to-guides/claim-fees)

**[VERIFIED] Optional "dividend" feature:** creators can auto-distribute a share of their fees to top-100 holders every 24h when ≥10 SOL is unclaimed. (https://dev.to/sivarampg/bagsfm-the-solana-launchpad-thats-changing-creator-monetization-4g7n) Optional; not relevant to fee maximization.

### 2.4 What Bags itself takes
**[VERIFIED] Bags takes the protocol/partner residual.** The DefiLlama income statement shows Bags' "Protocol Fees" ≈ 50% of total fees as Bags' own revenue. (https://defillama.com/protocol/bags) **[UNCERTAIN]** whether this 50% is fixed or whether large partners can negotiate it down — not publicly documented.

> **Anecdote ([REPORTED], illustrative only):** Steve Yegge writes that as the creator of "Gas Town" he received "99% of those trading fees" on `$GAS` — i.e. within the *creator-allocated* fee pool, one party can be assigned nearly all of it via BPS. This is the fee-share BPS feature, not a claim that Bags takes nothing. (https://steve-yegge.medium.com/bags-and-the-creator-economy-249b924a621a)

---

## 3. Public API / SDK

**[VERIFIED] Yes — there is a public REST API and an official TypeScript SDK.**

- **SDK:** `@bagsfm/bags-sdk` (npm). Node ≥18. Init: `new BagsSDK(BAGS_API_KEY, connection, "processed")`. Services: token launch, trade (quotes/swaps), fee (claim), config (fee-share + lookup tables), state, Jito bundles, Dexscreener listing. (https://www.npmjs.com/package/@bagsfm/bags-sdk , https://github.com/bagsfm/bags-sdk) **[UNCERTAIN]** exact latest version/last-publish date — npm and Socket.dev returned 403 to the fetcher; confirm with `npm view @bagsfm/bags-sdk version time` before relying on maintenance status.
- **Base URL:** `https://public-api-v2.bags.fm/api/v1` (https://docs.bags.fm/api-reference/create-token-launch-transaction)
- **Auth:** API key in `x-api-key` header, key from the Bags Developer Portal. (https://docs.bags.fm/api-reference/create-token-launch-transaction , https://docs.bags.fm/how-to-guides/launch-token)
- **Rate limit:** [REPORTED] ~1,000 requests/hour/user. (https://dev.to/sivarampg/bagsfm-the-solana-launchpad-thats-changing-creator-monetization-4g7n)

**(a) Launch a token** — `sdk.tokenLaunch.createTokenInfoAndMetadata()` (`POST /token-launch/create-token-info`) → `sdk.config.createBagsFeeShareConfig()` (`POST /fee-share/config`) → `sdk.tokenLaunch.createLaunchTransaction()` (`POST /token-launch/create-launch-transaction`). Launch tx params: `ipfs`, `tokenMint`, `wallet`, `initialBuyLamports`, `configKey`, optional `tipWallet`/`tipLamports`. (https://docs.bags.fm/how-to-guides/launch-token , https://docs.bags.fm/api-reference/create-token-launch-transaction)

**(b) Configure fee-share recipients** — via the fee-share config (BPS summing to 10,000; social-handle resolution via `sdk.state.getLaunchWalletV2()` / `GET /token-launch/fee-share/wallet/v2`; optional `partner`/`partnerConfig`). (https://docs.bags.fm/how-to-guides/launch-token)

**(c) Claim fees** — `sdk.fee.getAllClaimablePositions()` + `sdk.fee.getClaimTransactions()`; claim-events queryable via `/fee-share/token/claim-events` (supports time-range queries since v1.2.0, Jan 2026). (https://docs.bags.fm/how-to-guides/claim-fees , https://docs.bags.fm/changelog/changelog)

**Note:** The SDK builds **unsigned serialized transactions**; Momento (or the creator) signs and submits. Bags is non-custodial — keys never go to Bags. (https://docs.bags.fm/how-to-guides/claim-fees)

---

## 4. Token-2022 support & custom transfer fees / hooks (the 1%/10% tax idea)

This is decisive for Momento's "tax" idea, so separate the two layers:

- **[VERIFIED] The underlying Meteora DBC program DOES support Token-2022 and transfer hooks.** DBC config has `token_type` (`0 = SPL Token, 1 = Token2022`) and explicit "transfer-hook configs/pools" handling; "Meteora Dynamic Bonding Curve supports launching SPL tokens or Token 2022 tokens, with transfer fee and other extensions handled natively." (https://github.com/MeteoraAg/dynamic-bonding-curve , https://docs.meteora.ag/integration/dynamic-bonding-curve-dbc-integration/technical-faq)
- **[VERIFIED / inferred] Bags launches via the SPL-token path, not Token-2022.** Bags' on-chain create instruction is `initialize_virtual_pool_with_spl_token` (the SPL variant). (https://docs.bitquery.io/docs/blockchain/Solana/bags-fm-api/) **[UNCERTAIN]** — there is **no Bags documentation exposing a Token-2022 / transfer-fee / transfer-hook option** in its API or SDK. Searches of the Bags docs/SDK/changelog returned no Token-2022, transfer-fee, or transfer-hook configuration. **Working conclusion: a native protocol-level transfer tax (Token-2022 transfer-fee extension or a transfer-hook) is NOT a feature Bags currently exposes; Bags' "fee" is the swap/trading fee on its DBC/DAMM pools, not an on-transfer tax.**

**Implication for the 1%/10% tax idea:** If "tax" means **a fee on every transfer (including wallet-to-wallet)**, that requires the **Token-2022 transfer-fee extension or a transfer hook** — which Meteora DBC supports directly but **Bags does not appear to expose.** If "tax" means **a fee on every swap/trade** (the normal launchpad model), Bags' configurable swap-fee + BPS fee-share already covers it. **Clarify which one Momento wants — it changes the recommendation.**

---

## 5. Bags vs. building directly on Meteora — where does fee value accrue?

Because **Bags is itself a thin layer on Meteora DBC/DAMM v2**, this is really "use Meteora through Bags" vs. "use Meteora as your own Partner."

### Option A — Launch on Bags
- **Fee accrual:** Total swap fee → **Bags keeps ~50% as protocol revenue**; the remaining ~50% is the creator-allocated pool that Momento can split (creator + Momento-as-fee-claimer/partner) via BPS. (https://defillama.com/protocol/bags , https://docs.bags.fm/how-to-guides/launch-token) **The launchpad (Bags) captures the largest single slice. This directly conflicts with Momento's stated goal of NOT giving fees to the launchpad.**
- **Pros:** Fastest to ship (REST + TS SDK, non-custodial, social-handle fee splits, auto lookup tables, Jito, Dexscreener); distribution/brand of Bags; battle-tested.
- **Cons:** ~50% of fees leave to Bags; no exposed Token-2022/transfer-tax; you inherit Bags' fee policy and any future changes; partner economics not publicly negotiable.

### Option B — Build on Meteora DBC directly (Momento = the "Partner")
- **Fee math [VERIFIED]:** Meteora DBC takes a **fixed 20% protocol fee** of the trading fee; the **remaining 80% is the LP fee split between Partner and Creator** via `creator_trading_fee_percentage`. Example: with `creator_trading_fee_percentage = 20%`, partner gets 64% and creator gets 16% of the total trading fee. (https://github.com/MeteoraAg/dynamic-bonding-curve , confirmed in Meteora DBC overview: https://docs.meteora.ag/overview/products/dbc/what-is-dbc) **Momento, as the Partner, would keep up to ~80% of every trading fee (minus Meteora's 20%), and choose how much to give the creator** — versus Bags keeping ~50%.
- **Token-2022 [VERIFIED]:** Build-your-own can opt into Token-2022 + transfer-fee extension / transfer hooks for a true on-transfer tax. (https://github.com/MeteoraAg/dynamic-bonding-curve , https://docs.meteora.ag/integration/dynamic-bonding-curve-dbc-integration/technical-faq)
- **LP / vesting [VERIFIED]:** At migration, LP is locked for partner + creator per partner config (`partner_lp_percentage`, `partner_locked_lp_percentage`); both claim fees from locked LP on DAMM v1/v2. DAMM v2 supports lock-with-vesting or permanent lock while still claiming fees; Meteora Lock provides custom vesting schedules. (https://github.com/MeteoraAg/dynamic-bonding-curve , https://docs.meteora.ag/user-guide/usage/becoming-a-liquidity-provider)
- **Tooling:** Official `@meteora-ag/dynamic-bonding-curve-sdk`; Meteora Launchpad template. (https://www.npmjs.com/package/@meteora-ag/dynamic-bonding-curve-sdk , https://docs.meteora.ag/integration/dynamic-bonding-curve-dbc-integration/launchpad-template)
- **Cons:** More engineering (config creation, migration handling, fee-claim UX, LP-lock policy, social-handle resolution you'd build yourself); you own support/security; Code4rena-audited program reduces but doesn't remove smart-contract risk. (https://code4rena.com/reports/2025-08-meteora-dynamic-bonding-curve)

**Where fee value accrues — summary:**
| | Meteora protocol | Launchpad layer | Creator + Momento (your pool) |
|---|---|---|---|
| **Bags** | ~20% (excluded from Bags' reported fee) | **~50% to Bags** | ~50% split between creator + Momento (as fee-claimer/partner) |
| **Build on Meteora (Momento = partner)** | **20% fixed** | n/a (you ARE the layer) | **~80%**, split creator + Momento as you choose |

(Bags row per https://defillama.com/protocol/bags ; Meteora row per https://docs.meteora.ag/overview/products/dbc/what-is-dbc and the DBC README.)

---

## 6. Vesting / LP-lock features

- **[VERIFIED] LP lock at graduation** is a Meteora DBC feature inherited by Bags: LP locked for partner + creator per partner config; both claim fees from locked LP post-migration on DAMM v1/v2. (https://github.com/MeteoraAg/dynamic-bonding-curve)
- **[VERIFIED] DAMM v2 vesting/permanent lock** with continued fee claims; **Meteora Lock** for custom vesting schedules (team/investor lockups). (https://docs.meteora.ag/user-guide/usage/becoming-a-liquidity-provider)
- **[UNCERTAIN] Bags-specific creator-allocation vesting:** no dedicated Bags doc found exposing team-token vesting as a first-class Bags feature; third-party lockers (StakePoint, Team Finance, Meteora Lock) are the usual route. (https://stakepoint.app/blog/best-solana-token-locker-2026)

---

## 7. Recommendation (for the fee-maximization goal)

**Build directly on Meteora DBC with Momento as the Partner — do NOT route through Bags — IF fee maximization is the priority.** The decisive facts:
1. **Bags is itself just a Meteora DBC/DAMM v2 front-end**, so you gain no unique AMM tech by using it. (§1)
2. **Bags retains ~50% of total trading fees** as its own revenue. (§2.2) Momento's explicit goal is to keep fees for creator + Momento and **away** from the launchpad — Bags is structurally opposed to that goal.
3. **As the Meteora Partner, Momento keeps ~80% of the trading fee** (Meteora takes a fixed 20%) and decides the creator split — dramatically better fee capture. (§5)
4. **Only the build-your-own path unlocks Token-2022 transfer fees / hooks** for a true on-transfer tax, which Bags does not expose. (§4)

**Use Bags instead only if:** time-to-market and the social-handle fee-share UX outweigh giving up ~half the fees, OR Momento wants to validate the model fast before investing in its own rail. A pragmatic path: **prototype on Bags (days) to validate demand, build the Meteora-partner rail in parallel** for the economics that match the stated goal.

---

## 8. Top unknowns / things to verify before committing

1. **Exact total per-trade fee on Bags (~1% vs ~2%).** DefiLlama's 50/50 income statement implies a higher total than the "creator earns 1%" pitch; one secondary source says total = 1%. **Confirm the actual bps** from Bags' config/quote `platformFee` response or on-chain. (https://defillama.com/protocol/bags vs https://alearesearch.substack.com/p/bags-launchpad)
2. **Is Bags' ~50% protocol cut fixed or negotiable** for a partner/volume deal? Not documented.
3. **Whether Bags exposes ANY Token-2022 / transfer-fee / transfer-hook option** (current evidence: no). Confirm with Bags support before assuming an on-transfer tax is possible via Bags.
4. **Bags SDK maintenance status** — npm/Socket returned 403; verify latest version + last publish via `npm view @bagsfm/bags-sdk`.
5. **Meteora Partner economics in practice** — exact `creator_trading_fee_percentage` / `partner_lp_percentage` limits and any Meteora partner onboarding requirements/fees.
6. **Migration target nuance** — confirm DAMM v2 (vs v1) is the current default and the fee-claim UX on locked LP post-migration.

---

### Source index
- Bags site: https://bags.fm/ , https://support.bags.fm/en/articles/11917007-who-what-why-of-bags
- Bags docs: https://docs.bags.fm/how-to-guides/launch-token , https://docs.bags.fm/how-to-guides/claim-fees , https://docs.bags.fm/api-reference/create-token-launch-transaction , https://docs.bags.fm/changelog/changelog
- Bags SDK: https://www.npmjs.com/package/@bagsfm/bags-sdk , https://github.com/bagsfm/bags-sdk
- Fees/revenue: https://defillama.com/protocol/bags
- On-chain: https://docs.bitquery.io/docs/blockchain/Solana/bags-fm-api/
- Meteora DBC: https://docs.meteora.ag/overview/products/dbc/what-is-dbc , https://github.com/MeteoraAg/dynamic-bonding-curve , https://docs.meteora.ag/integration/dynamic-bonding-curve-dbc-integration/technical-faq , https://www.npmjs.com/package/@meteora-ag/dynamic-bonding-curve-sdk
- Meteora LP/vesting: https://docs.meteora.ag/user-guide/usage/becoming-a-liquidity-provider
- Audit: https://code4rena.com/reports/2025-08-meteora-dynamic-bonding-curve
- Coverage: https://dev.to/sivarampg/bagsfm-the-solana-launchpad-thats-changing-creator-monetization-4g7n , https://steve-yegge.medium.com/bags-and-the-creator-economy-249b924a621a , https://alearesearch.substack.com/p/bags-launchpad , https://startupfortune.com/bagsapp-goes-live-with-tiktok-fee-sharing-that-lets-any-creator-earn-from-their-username-alone/
