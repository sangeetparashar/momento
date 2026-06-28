# 15 — LP Economics: Threshold Fundraising → Configurable LP/Treasury/Creator Splits (Solana, 2026)

> Mechanism-design research for Momento's Solana launchpad + liquidity leg.
> Goal: a **configurable, threshold-based fundraising → LP** design that **keeps most trading fees with the CREATOR + MOMENTO**.
> Date: 2026-06-23. Every claim is URL-cited. All figures verified against current (mid-2026) docs/source.

---

## 0. TL;DR

- The dominant Solana pattern is **bonding curve → "graduation"/migration to an AMM pool** (pump.fun → PumpSwap; Meteora **DBC** → **DAMM v2**; Raydium **LaunchLab** → CPMM). Token trades on a curve until it raises a **quote-asset threshold** (`migration_quote_threshold`), then liquidity auto-migrates. ([Meteora DBC](https://docs.meteora.ag/overview/products/dbc/what-is-dbc), [PumpSwap review 2026](https://cryptoadventure.com/pumpswap-review-2026-pump-funs-solana-amm-bonding-curve-graduation-and-trader-risk/))
- **Meteora DBC is the only rail that exposes all three knobs Momento wants at migration** — (a) how much value/supply is **bound as LP**, (b) how much quote/token the **platform keeps**, (c) how much is **returned to the creator** — via `partner_lp_percentage`, `partner_locked_lp_percentage`, `creator_lp_percentage`, `creator_locked_lp_percentage`, `creator_trading_fee_percentage`, `leftover_receiver`, `token_supply`, and `migration_fee_option`. ([DBC config-key params](https://docs.meteora.ag/overview/products/dbc/dbc-config-key), [customizable config](https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/customizable-pool-configuration))
- **Fee capture for the launchpad (Momento) is best on Meteora DBC: protocol takes a fixed 20%, and the remaining 80% (the "LP fee") is split between PARTNER (=Momento) and CREATOR** via `creator_trading_fee_percentage`. A swap host/referrer is paid out of the protocol's 20%, **not** out of the 80%. ([Meteora DBC fee split](https://docs.meteora.ag/overview/products/dbc/what-is-dbc))
- **USDC-quoted pairs are now first-class** (pump.fun launched USDC pairs May 21 2026; DBC supports SOL/USDC/JUP). USDC removes SOL beta from token price, aligns with Privy USDC onramp, and makes fee accounting dollar-native. ([pump.fun USDC pairs](https://thedefiant.io/news/defi/pump-fun-launches-usdc-paired-liquidity-pools-gi72da), [DBC quote support](https://www.dextools.io/tutorials/what-is-meteora-dlmm-dynamic-bonding-curve-2026))
- **Permanently locked LP can still earn claimable fees forever** on Meteora — LP tokens are sent to a lock token account (not burned), and fees accrue claimably to whoever holds the lock account. This is the engine that lets Momento + creator earn ongoing post-graduation fees. ([Meteora locked-fee mechanism](https://docs.meteora.ag/user-faq/dynamic-amm-faq/claiming-fees-from-permanently-locked-liquidity))
- **Recommendation:** Solana + **Meteora DBC → DAMM v2**, USDC-quoted, with a single Momento **partner config key**. Defaults: **fee_claimer = Momento**, **creator_trading_fee_percentage = 50%**, **LP 100% permanently locked** at migration, split **partner_locked 50% / creator_locked 50%**, **leftover_receiver = creator**, **migration_fee_option = 1%**. This reconciles 1:1 with `docs/lp-trading-fees-design.html`.

---

## 1. Threshold-based fundraising → LP (the bonding-curve → graduation pattern)

### 1.1 The general pattern

A token launches **with no AMM pool**. Instead it trades against a **bonding curve**: a deterministic price function where price rises as supply is bought. Buyers send quote (SOL or USDC); the curve mints/releases token. There's no counterparty LP yet — the curve *is* the market maker. Once cumulative quote raised hits a **threshold**, the token **"graduates"**: the curve closes and the accumulated liquidity is migrated into a real AMM pool where normal two-sided trading begins. ([Cube — what is a bonding curve](https://www.cube.exchange/what-is/bonding-curve), [oodles pump.fun explainer](https://blockchain.oodles.io/pump-fun/))

### 1.2 pump.fun → PumpSwap (the reference implementation)

- Tokens trade on the curve; **graduation happens when the bonding curve is fully sold out** (historically ≈ **$69k market cap**, treated as guidance, not a hard rule). 100% of the ~800M tradable tokens must be bought. ([CoinMarketCap pump.fun](https://coinmarketcap.com/cmc-ai/pump-fun/what-is/), [PumpSwap review 2026](https://cryptoadventure.com/pumpswap-review-2026-pump-funs-solana-amm-bonding-curve-graduation-and-trader-risk/))
- At graduation the platform **auto-creates a PumpSwap pool immediately** (no waiting period; the old 6-SOL Raydium migration fee was eliminated; graduation now costs ~0.015 SOL). ([blocmates PumpSwap](https://www.blocmates.com/news-posts/pump-fun-introduces-pumpswap-a-new-dex-for-graduated-token-listings), [PumpSwap review 2026](https://cryptoadventure.com/pumpswap-review-2026-pump-funs-solana-amm-bonding-curve-graduation-and-trader-risk/), [pump.fun fees](https://pump.fun/docs/fees))
- The **raised quote** seeds the new pool's liquidity (constant-product AMM, Uniswap-v2-style). ([madeonsol PumpSwap](https://madeonsol.com/blog/what-is-pumpswap))

### 1.3 Meteora DBC → DAMM (the configurable implementation Momento should use)

- DBC uses a **configurable multi-segment bonding curve** selling tokens until the **`migration_quote_threshold`** is reached: *"the threshold for quote token, that after the virtual pool reserve gets such quote token amount, the token will graduate from the launch pool and be migrated."* ([DBC config params](https://docs.meteora.ag/overview/products/dbc/dbc-config-key), [DBC what-is](https://docs.meteora.ag/overview/products/dbc/what-is-dbc))
- When the threshold is hit the **pool becomes non-swappable**, and Meteora's **auto-migrator keeper** cranks a transaction that **creates a Meteora DAMM v1 or v2 pool** and seeds it from the accumulated reserves. ([DBC migrator keeper](https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/dbc-migrator-keeper), [Meteora on migration](https://x.com/MeteoraAG/status/1991420301176107104))
- **What happens to the raised quote at graduation:**
  - The bulk of the raised quote + the migration token allocation is **paired into the new DAMM pool as LP**.
  - **Leftover tokens** (if `token_supply` is fixed pre/post-migration) are returned to **`leftover_receiver`**. ([DBC config params](https://docs.meteora.ag/overview/products/dbc/dbc-config-key))
  - **The last swap creates a quote-token surplus that is shared between the partner and the protocol.** ([DBC graduation surplus](https://www.dextools.io/tutorials/what-is-meteora-dlmm-dynamic-bonding-curve-2026))
  - **At least 10% of liquidity must remain locked** for day 1 (86,400s) post-migration (a DBC config constraint). ([DBC migration constraint](https://www.dextools.io/tutorials/what-is-meteora-dlmm-dynamic-bonding-curve-2026))
- DBC supports **SOL, USDC, JUP and other quote tokens**. ([DBC quote support](https://www.dextools.io/tutorials/what-is-meteora-dlmm-dynamic-bonding-curve-2026))

### 1.4 Raydium LaunchLab → CPMM (the comparison)

- "JustSendIt" mode graduates at **85 SOL raised**; SOL + token migrate to a Raydium AMM pool. ([Raydium LaunchLab](https://docs.raydium.io/raydium/launchlab/launchlab))
- "LaunchLab mode" lets the platform customize the curve and a **"Post-Migration Fee Share"** that mints a **"Fee Key" NFT** granting the holder a claim on **10% of post-graduation LP fees**. ([Raydium creator fees](https://docs.raydium.io/raydium/launchlab/how-creator-fees-work))

---

## 2. Configurable splits at graduation — what's actually parameterizable

This is the heart of Momento's requirement. The table below maps Momento's three asks to **Meteora DBC config-key fields** (set once per partner config; every token launched under that key inherits them). ([DBC config-key](https://docs.meteora.ag/overview/products/dbc/dbc-config-key), [customizable config](https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/customizable-pool-configuration))

| Momento ask | DBC parameter(s) | What it controls | Configurable? |
|---|---|---|---|
| **(a) Value/supply bound as LP** | `migration_quote_threshold`, `token_supply` (pre/post), `sqrt_start_price`, `migration_option`, `migration_fee_option` | How much quote must be raised before graduation; the fixed supply split between curve sale and migration LP; starting price; which AMM (DammV1=0 / DammV2=1); graduated-pool fee tier (0.25%/0.3%/1%/2%/4%/6% or custom for DammV2) | **Yes** ([DBC config params](https://docs.meteora.ag/overview/products/dbc/dbc-config-key), [Meteora migration fee options](https://docs.meteora.ag/integration/dynamic-bonding-curve-dbc-integration/dbc-sdk/dbc-rust-sdk)) |
| **(b) Value KEPT by platform/treasury** | `partner_lp_percentage`, `partner_locked_lp_percentage`, `fee_claimer`, plus the **surplus** share | % of migration LP the partner can **claim** vs is **locked**; the partner wallet that claims trading fees + locked-LP fees; partner's share of the last-swap surplus | **Yes** ([DBC config params](https://docs.meteora.ag/overview/products/dbc/dbc-config-key), [surplus](https://www.dextools.io/tutorials/what-is-meteora-dlmm-dynamic-bonding-curve-2026)) |
| **(c) Value RETURNED to creator** | `creator_lp_percentage`, `creator_locked_lp_percentage`, `creator_trading_fee_percentage`, `leftover_receiver`, `locked_vesting` | % of migration LP creator can claim vs is locked; creator's % of the 80% trading-fee + surplus pool; who receives leftover supply; optional creator vesting (migrated to Jupiter lock) | **Yes** ([DBC config params](https://docs.meteora.ag/overview/products/dbc/dbc-config-key)) |

**Hard constraints (NOT configurable):**

- **Protocol fee = fixed 20%** of every DBC trading fee; the **remaining 80% is the "LP fee"** split between partner + creator. ([DBC fee split](https://docs.meteora.ag/overview/products/dbc/what-is-dbc))
- **Host/referral fee is fixed 20% of the protocol's 20%** (i.e. carved out of Meteora's cut, not Momento's). ([DBC fee split](https://docs.meteora.ag/overview/products/dbc/what-is-dbc))
- **≥10% of liquidity must be locked** for the first day post-migration. ([DBC migration constraint](https://www.dextools.io/tutorials/what-is-meteora-dlmm-dynamic-bonding-curve-2026))
- The LP percentages must sum to 100%: `partner_lp + partner_locked_lp + creator_lp + creator_locked_lp = 100`. ([DBC config params](https://docs.meteora.ag/overview/products/dbc/dbc-config-key))

**Raydium LaunchLab equivalent (less granular):** at platform-config creation you set a **platform fee rate** (e.g. 1% on curve trades) and a **creator fee rate**; Raydium takes a **flat 0.25% protocol fee** off the top. Post-migration creator fee is a fixed **10%** via the Fee Key NFT, and platforms can call `updatePlatformCpCreator`/`collectMultiCreatorFees` to redirect creator fees to a platform PDA and redistribute on custom terms — but config updates are throttled to **once per epoch (~2-3 days)**. ([Raydium LaunchLab fee ref](https://docs.raydium.io/raydium/build/tips-and-gotchas/launchlab-and-cpmm-fee-reference), [redistribute creator fees](https://docs.raydium.io/raydium/build/tips-and-gotchas/how-to-redistribute-creator-fees), [creating a platform](https://docs.raydium.io/raydium/build/developer-guides/index/creating-a-platform))

---

## 3. USDC-quoted pairs vs SOL

USDC quoting is now a first-class option (pump.fun shipped USDC-paired pools **May 21, 2026**; DBC supports USDC natively). ([pump.fun USDC](https://thedefiant.io/news/defi/pump-fun-launches-usdc-paired-liquidity-pools-gi72da), [solanafloor](https://solanafloor.com/news/pump-fun-to-introduce-usdc-pairing-new-tokens-may-21))

| Dimension | SOL-quoted | USDC-quoted |
|---|---|---|
| **Price stability** | Token inherits **SOL's volatility** — when SOL falls, the dollar value of the curve/pool falls too | Removes SOL beta entirely; token price reflects **only its own** buy/sell pressure ([cryptodaily](https://cryptodaily.co.uk/2026/05/pumpfun-usdc-pairs-solana-memecoins)) |
| **Onramp alignment** | Requires SOL on hand | Aligns with **Privy USDC onramp** — funded USDC flows straight into launches/trades with no SOL conversion (matches Momento's existing onramp design) ([pump.fun USDC pairs](https://cryptobriefing.com/pump-fun-usdc-liquidity-pools/)) |
| **Price discovery / accounting** | Must mentally convert SOL while chart moves; mcap drifts with SOL | "A $4,000 starting mcap is a $4,000 starting mcap" — **dollar-native fee accounting** and reconciliation ([cryptodaily](https://cryptodaily.co.uk/2026/05/pumpfun-usdc-pairs-solana-memecoins)) |
| **Entry cost / fairness** | Cheaper to bond (~$7,276); SOL drops let early buyers grab supply cheaply ("low ceiling") | Higher fixed entry (~$12,161 to bond, +67%); start mcap ~$4k vs ~$2k; threshold ~$58,783 — positioned as **anti-supply-abuse** ([cryptodaily](https://cryptodaily.co.uk/2026/05/pumpfun-usdc-pairs-solana-memecoins), [startupfortune](https://startupfortune.com/pumpfun-launches-usdc-pools-raises-memecoin-launch-costs/)) |

**Implication for Momento:** USDC quoting is the better fit — Momento already onramps users into **USDC** via Privy, the trading-fee leg already denominates in the output token, and a USDC pair makes the LP-fee dashboard reconciliation dollar-native. The cost is a higher bonding threshold (less "lottery ticket" cheapness for buyers).

---

## 4. LP ownership & locking — how locked liquidity still pays fees

This is the mechanism that lets Momento + creator earn **ongoing, post-graduation** fees.

- On Meteora, **permanently locking LP does not burn it** — the LP tokens are sent to a **lock token account**; the underlying liquidity is forever non-withdrawable, but **fees remain claimable forever** by whoever holds the lock account. ([Meteora locked-fee FAQ](https://docs.meteora.ag/user-faq/dynamic-amm-faq/claiming-fees-from-permanently-locked-liquidity), [memecoin-pool perma-lock](https://docs.meteora.ag/product-overview/other-products/memecoin-pool-overview/memecoin-pool-v1/permanently-locking-liquidity))
- **Fee-claim rights are assignable:** *"User A deposits liquidity, gets an LP token, and permanently sends it to User B's lock token account, so that User B claims fees forever."* This is how a launchpad splits a single migrated pool between **partner** and **creator** lock accounts. ([Meteora locked-fee FAQ](https://docs.meteora.ag/user-faq/dynamic-amm-faq/claiming-fees-from-permanently-locked-liquidity))
- **DAMM v2** decouples fee accrual from the locked position entirely: *"fee is not compounded on LP,"* so a position can be **permanently locked** (`permanent_lock_position`) and still **`claim_position_fee`** indefinitely. ([DAMM v2 repo](https://github.com/MeteoraAg/damm-v2))
- **DAMM v1** (compounding) claimable amount formula: `total_locked_lp * (v2 - v1) / v2`, where `v1` = virtual price at lock, `v2` = virtual price at claim. ([Meteora locked-fee FAQ](https://docs.meteora.ag/product-overview/meteora-liquidity-pools/dynamic-amm-overview/claiming-fees-from-permanently-locked-liquidity))
- After graduation, **LP is locked for both the partner and the creator at the ratio set in the config key**, and **both can claim fees from the locked LP** on DAMM v1/v2. ([DBC what-is](https://docs.meteora.ag/overview/products/dbc/what-is-dbc))
- **Who claims:** the `fee_claimer` wallet claims partner trading fees AND partner locked-LP fees; the creator claims their `creator_*` shares. The SDK method is `claimPartnerTradingFee` → `fee_claimer`. ([DBC config params](https://docs.meteora.ag/overview/products/dbc/dbc-config-key), [DBC repo](https://github.com/MeteoraAg/dynamic-bonding-curve))

**Real-world proof:** Moonshot locks migrated LP forever and airdrops fees to top holders daily; Bags pays creators 1% of volume "forever" off locked LP — both run on Meteora DBC/DAMM. ([Meteora x Moonshot](https://meteoraag.medium.com/meteora-x-moonshot-a-new-meta-for-memecoin-launchpads-9917b833a940), [Bags on Meteora](https://docs.bitquery.io/docs/blockchain/Solana/bags-fm-api/))

---

## 5. Fee economics comparison (2026) — who keeps what

> Key distinction: **"launchpad/platform keep"** = what the integrating platform (the role Momento wants) earns. Several rails have **no platform-share API** — there you can only bolt a fee onto your own UI.

| Rail | Curve/launch trading fee | Post-graduation pool fee | **Launchpad/platform keep** | Creator keep | Protocol keep | Config granularity |
|---|---|---|---|---|---|---|
| **Meteora DBC** | Partner-set (0.25%–99%), fee scheduler | DAMM v2 pool, partner-set tier (0.25%–6%) | **Partner share of the 80% "LP fee"** — e.g. 80% of total if creator=0; locked-LP fees too | `creator_trading_fee_percentage` of the 80% + creator-locked-LP | **Fixed 20%** (host referral carved from this 20%) | **Highest** — all splits + LP lock + leftover configurable ([DBC fee split](https://docs.meteora.ag/overview/products/dbc/what-is-dbc), [config params](https://docs.meteora.ag/overview/products/dbc/dbc-config-key)) |
| **Meteora DAMM v2** (post-grad) | n/a | base + dynamic fee, configurable | Partner share of LP fee via locked position | Creator share of locked position | Protocol fee % (config); fixed 20% in DBC-migrated pools | High ([DAMM v2 repo](https://github.com/MeteoraAg/damm-v2)) |
| **Raydium LaunchLab** | **1%** total (platform-set platform fee + creator fee) | CPMM pool fees | **Platform fee** (you set it) — can also redirect creator fees via PDA | 10% post-migration (Fee Key NFT) | **Flat 0.25%** off the top | Medium; config throttled to 1×/epoch ([LaunchLab fee ref](https://docs.raydium.io/raydium/build/tips-and-gotchas/launchlab-and-cpmm-fee-reference), [creator fees](https://docs.raydium.io/raydium/launchlab/how-creator-fees-work)) |
| **pump.fun / PumpSwap** | **1.25%** on curve (creator 0.30% + protocol 0.95% + LP 0%) | **0.30%** canonical (LP 0.20% + protocol 0.05% + **creator 0.05%**); dynamic by mcap up to 1.25% | **None for third-party integrators** — pump.fun keeps the protocol fee; no white-label partner API | 0.05%–0.95% (mcap-tiered; sharable to ≤10 wallets since Jan 9 2026) | pump.fun protocol fee | Low for integrators ([pump.fun fees](https://pump.fun/docs/fees), [creator fee sharing](https://www.mexc.com/news/449516)) |
| **Moonshot** | Dynamic **0.15%–15%** | Migrates to Meteora, LP locked forever | **DexScreener keeps 10%** of the captured 80% (Moonshot is the platform here, not you) | **20%** to creator forever | Meteora 20% | Low for outside integrators ([Meteora x Moonshot](https://meteoraag.medium.com/meteora-x-moonshot-a-new-meta-for-memecoin-launchpads-9917b833a940), [Moonshot fees](https://support.moonshot.com/trade/fees)) |
| **Bags** | Runs on Meteora DBC | DAMM-locked LP | Platform share of DBC partner fee (configurable multi-recipient) | **1% of volume forever**; multi-wallet fee share | Meteora 20% | Medium (inherits DBC) ([Bags](https://dev.to/sivarampg/bagsfm-the-solana-launchpad-thats-changing-creator-monetization-4g7n), [Bags on Meteora](https://docs.bitquery.io/docs/blockchain/Solana/bags-fm-api/)) |

### Which rail maximizes **creator + platform** fee capture?

**Meteora DBC.** Of every trading fee, **80% stays with creator + partner** (only 20% to protocol, and the host-referral comes out of *that* 20%, never out of the 80%). Critically, **Momento controls the partner/creator split** via `creator_trading_fee_percentage`, and **both legs keep earning post-graduation** off permanently-locked LP. pump.fun has the most volume but **no third-party platform economics**; Raydium gives you a platform fee but burns a flat 0.25% and throttles config; Moonshot/Bags are *peers* running the very DBC stack Momento should integrate directly. ([DBC fee split](https://docs.meteora.ag/overview/products/dbc/what-is-dbc), [pump.fun fees](https://pump.fun/docs/fees), [LaunchLab fee ref](https://docs.raydium.io/raydium/build/tips-and-gotchas/launchlab-and-cpmm-fee-reference))

---

## 6. Recommended model for Momento

**Rail:** Solana + **Meteora DBC → DAMM v2**, **USDC-quoted**, one Momento **partner config key** (all launches inherit it). Reconciles directly with `docs/lp-trading-fees-design.html`, which already names Meteora DBC as the top pick, sets `fee_claimer = MOMENTO_LP_FEE_CLAIMER`, and proposes `MOMENTO_CREATOR_FEE_PCT` → `creator_trading_fee_percentage`.

### 6.1 Recommended defaults

| Parameter | Default | Rationale |
|---|---|---|
| Quote asset | **USDC** | Onramp alignment (Privy), dollar-native accounting, price stability (§3) |
| `migration_quote_threshold` | **$12,000 USDC** | Comparable to pump.fun's USDC bonding (~$12,161); tunable per tier |
| `migration_option` | **1 (DammV2)** | Decoupled fees → lock + claim forever cleanly (§4) |
| `migration_fee_option` | **1% (100 bps)** | Sustainable graduated-pool fee; balances volume vs capture |
| Curve trading fee | **2%** (via fee scheduler) | Of which 20% → protocol, 80% → Momento+creator |
| `creator_trading_fee_percentage` | **50%** | Momento and creator split the 80% LP-fee evenly (comps: pump.fun ~50%, Jupiter 50%) |
| `fee_claimer` | **Momento treasury wallet** | Where the partner 40%-of-total accrues + partner locked-LP fees |
| LP at migration | **100% permanently locked** | Trust signal (no rug), still fee-claimable forever (§4) |
| `partner_locked_lp_percentage` | **50%** | Momento's locked-LP fee stream |
| `creator_locked_lp_percentage` | **50%** | Creator's locked-LP fee stream |
| `partner_lp_percentage` / `creator_lp_percentage` | **0 / 0** | Nothing withdrawable → maximally credible liquidity |
| `leftover_receiver` | **Creator** | Direct token return to creator = the "tokens kept by creator" leg |
| `locked_vesting` | **Off (configurable)** | Optional creator vesting via Jupiter lock for higher-trust launches |

### 6.2 Resulting fee flow (per $100 of trading fees, 2% curve fee)

- **$100 total trading fee** →
  - **$20 → Meteora protocol** (fixed 20%; any swap-host referral comes out of this $20)
  - **$80 → LP fee** split by `creator_trading_fee_percentage = 50%`:
    - **$40 → Momento** (`fee_claimer`)
    - **$40 → Creator**
- **Net: creator + Momento keep 80% of all trading fees; Momento keeps 40% of every dollar of fees on every token it launches, on every trade anywhere — not just in-app.** ([DBC fee split](https://docs.meteora.ag/overview/products/dbc/what-is-dbc))

### 6.3 Worked migration example (raise → LP / treasury / creator)

Token launched USDC-quoted, `migration_quote_threshold = $12,000`, fixed `token_supply = 1,000,000,000`, 800M sold on the curve, 200M reserved for migration, `leftover_receiver = creator`, LP 100% locked split 50/50.

| At graduation | Amount | Where it goes |
|---|---|---|
| **Quote raised** | ~$12,000 USDC | Paired into the new DAMM v2 pool as LP |
| **Token to LP** | 200,000,000 tokens | Paired against the USDC as LP |
| **LP token** | 100% locked | Sent to two lock accounts: 50% Momento, 50% creator (fee-claimable forever) |
| **Last-swap surplus** | small quote residual | Shared **partner (Momento) + protocol** |
| **Leftover supply** | any unsold/unallocated tokens | Returned to **creator** (`leftover_receiver`) — the "creator keeps N tokens" leg |
| **Ongoing (post-grad)** | 1% pool fee, 80% to LP | Of LP fees: ~50% Momento, ~50% creator (via locked positions); 20% protocol |

So a single launch yields Momento: (a) ~40% of all pre-graduation curve fees, (b) a permanently-locked 50% LP fee claim post-graduation, (c) a share of the migration surplus — with the creator getting the mirror image plus leftover tokens.

### 6.4 Config surface (extends the existing design doc)

- `MOMENTO_LP_FEE_CLAIMER` — Solana wallet = DBC `fee_claimer` (partner share sink). *(already proposed in lp-trading-fees-design.html)*
- `MOMENTO_CREATOR_FEE_PCT` — drives `creator_trading_fee_percentage` (default 50). *(already proposed)*
- **New:** `MOMENTO_QUOTE_MINT` — default USDC mint (vs SOL).
- **New:** `MOMENTO_MIGRATION_THRESHOLD_USDC` — default 12000; per-tier overridable.
- **New:** `MOMENTO_LP_LOCK_SPLIT` — partner/creator locked-LP split (default 50/50).
- **New table** `fee_events` (additive raw SQL) — log every accrual/claim for the reconciliation dashboard. *(already proposed)*
- Maps onto existing `CreatorToken` schema: `BONDING_CURVE → GRADUATED`, `bondingCurveParams`, `graduatedAt`, `poolType`. *(existing)*

### 6.5 Reconciliation with `docs/lp-trading-fees-design.html`

The existing doc already concluded **Solana + Meteora DBC**, verified the **20% protocol / 80% partner-LP** split, named `fee_claimer`/`creator_trading_fee_percentage`, and flagged the open questions (chain, launch model, creator split %, trading-config scope, legal). This report **closes those questions** with current 2026 data and concrete defaults, and adds the migration-LP allocation detail (`partner/creator_lp_percentage`, `locked` variants, `leftover_receiver`, `migration_fee_option`) plus the **USDC-quote** recommendation that the prior doc did not specify. The compliance flag from that doc still stands: launching tokens + holding fee-claim authority is a materially larger regulatory surface — **get a legal read before shipping the launchpad leg.**

---

## 7. Top unknowns / Phase-0 to verify

1. **Exact DAMM v2 default protocol-fee %** for DBC-migrated pools — DBC's curve fee is a fixed 20% protocol; confirm whether the migrated DAMM v2 pool inherits the same 20% or a separately-configured `protocol_fee_percent`. ([DAMM v2 repo](https://github.com/MeteoraAg/damm-v2) does not state the constant.)
2. **Privy embedded-wallet claim** — can a Privy embedded Solana wallet hold the `fee_claimer` authority and sign `claimPartnerTradingFee`? Needs a devnet spike.
3. **USDC migration-threshold mechanics on DBC specifically** — pump.fun's USDC numbers (~$12,161 bond, ~$58,783 threshold) are pump-specific; confirm DBC USDC curve sizing in the SDK.
4. **Surplus split exact %** — "surplus shared between partner and protocol" is stated but the precise ratio isn't documented; read from program source.
5. **Securities/MSB exposure** — creator-token issuance + fee custody legal read (carried over from the prior doc).

---

### Sources

- Meteora DBC — what is DBC: https://docs.meteora.ag/overview/products/dbc/what-is-dbc
- Meteora DBC config key: https://docs.meteora.ag/overview/products/dbc/dbc-config-key
- Meteora DBC customizable config: https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/customizable-pool-configuration
- Meteora DBC migrator keeper: https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/dbc-migrator-keeper
- Meteora DBC Rust SDK (migration fee options): https://docs.meteora.ag/integration/dynamic-bonding-curve-dbc-integration/dbc-sdk/dbc-rust-sdk
- Meteora DBC repo: https://github.com/MeteoraAg/dynamic-bonding-curve
- Meteora DAMM v2 repo: https://github.com/MeteoraAg/damm-v2
- Meteora locked-liquidity fee claims (FAQ): https://docs.meteora.ag/user-faq/dynamic-amm-faq/claiming-fees-from-permanently-locked-liquidity
- Meteora locked-liquidity fee formula: https://docs.meteora.ag/product-overview/meteora-liquidity-pools/dynamic-amm-overview/claiming-fees-from-permanently-locked-liquidity
- Meteora memecoin-pool perma-lock: https://docs.meteora.ag/product-overview/other-products/memecoin-pool-overview/memecoin-pool-v1/permanently-locking-liquidity
- Meteora x Moonshot: https://meteoraag.medium.com/meteora-x-moonshot-a-new-meta-for-memecoin-launchpads-9917b833a940
- DEXTools — Meteora DLMM/DAMM v2/DBC 2026 (surplus, 10% lock, quote support): https://www.dextools.io/tutorials/what-is-meteora-dlmm-dynamic-bonding-curve-2026
- pump.fun fees: https://pump.fun/docs/fees
- pump.fun creator fee sharing (Jan 2026): https://www.mexc.com/news/449516
- pump.fun USDC pairs (The Defiant): https://thedefiant.io/news/defi/pump-fun-launches-usdc-paired-liquidity-pools-gi72da
- pump.fun USDC pairs (Crypto Briefing): https://cryptobriefing.com/pump-fun-usdc-liquidity-pools/
- pump.fun USDC analysis (CryptoDaily): https://cryptodaily.co.uk/2026/05/pumpfun-usdc-pairs-solana-memecoins
- pump.fun USDC cost (Startup Fortune): https://startupfortune.com/pumpfun-launches-usdc-pools-raises-memecoin-launch-costs/
- pump.fun USDC date (SolanaFloor): https://solanafloor.com/news/pump-fun-to-introduce-usdc-pairing-new-tokens-may-21
- PumpSwap review 2026: https://cryptoadventure.com/pumpswap-review-2026-pump-funs-solana-amm-bonding-curve-graduation-and-trader-risk/
- PumpSwap intro (blocmates): https://www.blocmates.com/news-posts/pump-fun-introduces-pumpswap-a-new-dex-for-graduated-token-listings
- PumpSwap (madeonsol): https://madeonsol.com/blog/what-is-pumpswap
- pump.fun explainer (oodles): https://blockchain.oodles.io/pump-fun/
- pump.fun what-is (CoinMarketCap): https://coinmarketcap.com/cmc-ai/pump-fun/what-is/
- Raydium LaunchLab & CPMM fee reference: https://docs.raydium.io/raydium/build/tips-and-gotchas/launchlab-and-cpmm-fee-reference
- Raydium how creator fees work: https://docs.raydium.io/raydium/launchlab/how-creator-fees-work
- Raydium redistribute creator fees: https://docs.raydium.io/raydium/build/tips-and-gotchas/how-to-redistribute-creator-fees
- Raydium creating a platform: https://docs.raydium.io/raydium/build/developer-guides/index/creating-a-platform
- Raydium LaunchLab overview: https://docs.raydium.io/raydium/launchlab/launchlab
- Moonshot fees: https://support.moonshot.com/trade/fees
- Bags.fm overview (DEV): https://dev.to/sivarampg/bagsfm-the-solana-launchpad-thats-changing-creator-monetization-4g7n
- Bags on Meteora (Bitquery): https://docs.bitquery.io/docs/blockchain/Solana/bags-fm-api/
- Bonding curve primer (Cube): https://www.cube.exchange/what-is/bonding-curve
- Meteora migration thread (X): https://x.com/MeteoraAG/status/1991420301176107104
