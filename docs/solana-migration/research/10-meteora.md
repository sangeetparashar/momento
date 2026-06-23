# Meteora — Implementation Research Report

> **For:** Momento (Solana migration). Goal: launch creator-token pairs and **keep most trading fees for the creator + the Momento app**, not the launchpad.
> **Compiled:** 2026-06-23. **Status:** implementation-oriented; every claim cited inline. Uncertain/version-dependent items flagged with ⚠️.

## TL;DR recommendation

- **To launch a brand-new creator token from zero → use DBC (Dynamic Bonding Curve)**, with Momento configured as the **partner / `feeClaimer`**. During the bonding phase Meteora takes a **flat 20% of trading fees**; the remaining **80% is split between partner (Momento) and creator** via `creatorTradingFeePercentage`. Set `migrationOption = DAMM v2` so graduated tokens land in the modern AMM.
- **To run the ongoing pair after graduation → DAMM v2** (constant-product + concentrated range, NFT positions, fee scheduler, market-cap fee curves). DBC auto-migrates into it.
- **Use DLMM only for special cases** (e.g. a tightly-ranged stable pair, or if you want bin-level control and dynamic anti-sniper fees on an *already-established* token). It is not the launch primitive.
- **Token-2022 tax design (1% / 10%):** ✅ **Transfer Fee** is supported permissionlessly across DBC, DAMM v2, and DLMM. ✅ **Transfer Hook** is now supported too — DBC has dedicated transfer-hook configs (`createConfigWithTransferHook` / `createPoolWithTransferHook`); DAMM v2 & DLMM support it permissionlessly **only if the hook program + hook authority are revoked**, else it needs a Meteora admin "token badge" whitelist. See §6 — verify against the deployed program version.
- **SDKs:** all three are TypeScript on **`@solana/web3.js` v1** (NOT v2/`@solana/kit`). DBC `@meteora-ag/dynamic-bonding-curve-sdk@1.5.10`, DAMM v2 `@meteora-ag/cp-amm-sdk@1.4.3`, DLMM `@meteora-ag/dlmm@1.9.10`. All work on devnet (same program IDs as mainnet).

---

## Sourcing note (read this)

`docs.meteora.ag` is a client-side-rendered GitBook that returns **HTTP 404/403 to direct programmatic fetches**. Doc-page claims below were obtained via search-engine indexing of those exact URLs and **cross-verified against first-hand reads** of the GitHub program source, SDK type files, READMEs/CHANGELOGs (`raw.githubusercontent.com`), the npm **registry API** (`registry.npmjs.org`, authoritative for versions/deps), and the August 2025 Code4rena audit. Where only a doc page or third-party article supports a claim, it is flagged. **Re-verify exact numeric constants against the live program/IDL for the version you deploy.**

---

# 1. The 2026 product lineup

Meteora ships a stack of three liquidity products plus a launch protocol:

| Product | What it is | Best for |
|---|---|---|
| **DLMM** (Dynamic Liquidity Market Maker) | Concentrated liquidity in **discrete price bins**; constant-sum *within* a bin, dynamic volatility fees | Stable/tight pairs, active LPs, anti-sniper fee dynamics on established tokens |
| **DAMM v2** (Dynamic AMM v2, program "MCPA") | Constant-product with an optional **price range** (minimal concentrated liquidity); **NFT-backed positions**; fee scheduler; in-built farming; vesting/locking | **Ongoing creator-token pairs**; the migration target for DBC launches |
| **DBC** (Dynamic Bonding Curve) | **Launch-pool protocol**: customizable virtual bonding curve, fully on-chain price discovery, auto-graduation to DAMM | **Launching a brand-new token from zero** |
| DAMM v1 (legacy) | Constant-product, infinite range, **idle-asset lending via Dynamic Vaults** | Legacy; still a valid migration target |

Sources: <https://github.com/MeteoraAg/damm-v2> · <https://github.com/MeteoraAg/dynamic-bonding-curve> · <https://docs.meteora.ag/overview/products/dlmm/what-is-dlmm> · <https://docs.meteora.ag/overview/products/damm-v2/what-is-damm-v2>

⚠️ **Common misconception:** "idle assets auto-lent to lending protocols" (Dynamic Vaults) is a **DAMM v1** feature, **not DAMM v2**. Many third-party 2026 articles conflate them. Trust the official what-is-damm-v2 page. Source: <https://docs.meteora.ag/overview/products/damm-v2/what-is-damm-v2>

### Which fits Momento

- **(a) Launching a brand-new creator token from zero → DBC.** It needs no seed liquidity (trades against a virtual curve), gives on-chain price discovery, lets Momento (as partner) and the creator split fees, and auto-migrates to DAMM v2 at a raise threshold. §3, §5.
- **(b) Running an ongoing liquidity pair → DAMM v2.** It is the modern AMM DBC graduates into; supports USDC-quoted pools, fee schedulers, and fee accrual on locked LP positions that Momento + creator each own. §7.

---

# 2. DLMM (concentrated liquidity)

### How it works
- Liquidity is organized into **discrete price bins** rather than a continuous curve. The price gap between two consecutive bins is the **bin step** (set in basis points by the pool creator). Source: <https://docs.meteora.ag/overview/products/dlmm/what-is-dlmm>
- **Within a bin**, trades execute at a fixed price via a constant-sum rule `X + Y = k` → **zero slippage inside a bin**; slippage only occurs when a swap crosses bins. Source: <https://docs.meteora.ag/overview/products/dlmm/what-is-dlmm>
- The **active bin** is the single bin holding reserves of both tokens; **only the active bin earns trading fees**. Source: <https://docs.meteora.ag/overview/products/dlmm/dlmm-concepts>
- LPs provide **concentrated liquidity** within a chosen price range, with distribution shapes (Spot, Curve, BidAsk). Source: <https://docs.meteora.ag/overview/products/dlmm/what-is-dlmm> · <https://github.com/MeteoraAg/dlmm-sdk>

### Fees
- **Total fee = base fee + variable (dynamic) fee.** Source: <https://docs.meteora.ag/overview/products/dlmm/4-dlmm-fee-calculation>
- **Base fee** = `base_factor × bin_step`. Configured by the pool creator. **Range ~0.01% to 5%** (higher bin step allows higher base fee; Token-2022 / higher-fee pools use `PresetParameter2`). Sources: <https://docs.meteora.ag/product-overview/dlmm-overview/dynamic-fees> · <https://github.com/MeteoraAg/dlmm-sdk>
- **Variable fee** = volatility surcharge driven by a **volatility accumulator** (number of bin changes over time). High-frequency trades stack volatility → higher fee; this deters snipers at launch. Source: <https://docs.meteora.ag/product-overview/dlmm-overview/dynamic-fees>
- **Who collects:** the **LP position owner**, and only for the active bin. ⚠️ DLMM historically charges **0% protocol fee** (LPs keep all fees); a governance proposal to add protocol fees exists — verify current state. Source: <https://proposals.meteora.ag/t/add-protocol-fees-to-dynamic-and-dlmm-meteora-pools-draft/894>

### Create + claim (SDK)
- Pool creation: `createLbPair`, `createLbPair2` (Token-2022, requires `PresetParameter2`), `createCustomizablePermissionlessLbPair` / `…2` (custom bin step, fee, activation point). Source: <https://www.npmjs.com/package/@meteora-ag/dlmm>
- Fee claim: `claimSwapFee({ owner, position })`, `claimAllSwapFee({ owner, positions })`; `removeLiquidity` has a `shouldClaimAndClose` flag. Source: <https://www.npmjs.com/package/@meteora-ag/dlmm>

### Trade-offs
- **Pros:** zero in-bin slippage, very high capital efficiency, anti-sniper dynamic fees, granular price control.
- **Cons:** only the active bin earns fees (out-of-range liquidity idle); small bin steps need active rebalancing; IL/management burden. **Not a launch primitive** — there is no built-in fundraise/graduation. Source: <https://docs.meteora.ag/overview/products/dlmm/dlmm-concepts>

---

# 3. DAMM v2 (Dynamic AMM v2)

### How it works
- Constant-product with an **optional price range** ("minimal concentrated liquidity"); full-range `x·y=k` is a special case. Source: <https://github.com/MeteoraAg/damm-v2>
- **Positions are NFT-backed accounts** — whoever holds the position NFT owns the position and claims its fees; positions are **transferable**. Source: <https://github.com/MeteoraAg/damm-v2> · <https://docs.meteora.ag/overview/products/damm-v2/what-is-damm-v2>
- **Vesting/locking** endpoints: `lock_position` (cliff + linear schedules), `permanent_lock_position`, `refresh_vesting` (releases vested liquidity). ⚠️ A specific "January 2026 vesting refresh" date could not be confirmed in the primary CHANGELOG — the `refresh_vesting` instruction exists but the date is unverified. Source: <https://github.com/MeteoraAg/damm-v2>
- **In-built farming** (v1 used a separate program). Source: <https://docs.meteora.ag/overview/products/damm-v2/what-is-damm-v2>

### Fees — base fee, scheduler, dynamic fee
- **Base fee modes** (SDK enum `BaseFeeMode`): `0 FeeTimeSchedulerLinear`, `1 FeeTimeSchedulerExponential`, `2 RateLimiter`, `3 FeeMarketCapSchedulerLinear`, `4 FeeMarketCapSchedulerExponential`. Source (verbatim): <https://raw.githubusercontent.com/MeteoraAg/damm-v2-sdk/main/src/types.ts>
- **Fee Scheduler (time decay):** linear or exponential decay from a high starting fee to a floor, via `cliffFeeNumerator`, `numberOfPeriod`, `periodFrequency`, `reductionFactor` — anti-sniper at launch. Source: <https://github.com/MeteoraAg/damm-v2-sdk/blob/main/docs.md> · <https://docs.meteora.ag/developer-guide/guides/damm-v2/pool-fee-configs>
- **Market-cap fee scheduler** (modes 3/4, live mid-2026): fee decays as **price/market cap rises** instead of over time (`sqrtPriceStepBps`). Sources: <https://github.com/MeteoraAg/damm-v2> (CHANGELOG) · <https://x.com/MeteoraAG/status/2004469767483359562>
- **Rate Limiter** (mode 2): higher fee for larger buys; valid only for quote-token-only fee collection on buys.
- **Dynamic fee** (optional volatility surcharge): adds **at most 20% of the (minimum) base fee**; default config is 20% when enabled with null config. Source: <https://docs.meteora.ag/developer-guide/guides/damm-v2/pool-fee-configs>
- **Base fee bounds:** max base fee = **50% (5000 bps)**. Source: <https://github.com/MeteoraAg/meteora-invent/blob/main/studio/config/damm_v2_config.jsonc>
- **Collect Fee Mode** (`CollectFeeMode` enum): `0 BothToken`, `1 OnlyB` (quote-only, e.g. USDC), `2 Compounding` (a configurable `compounding_fee_bps` of fees auto-reinvests into reserves; the rest stays LP-claimable). Source (verbatim): <https://raw.githubusercontent.com/MeteoraAg/damm-v2-sdk/main/src/types.ts> · <https://github.com/MeteoraAg/damm-v2> (CHANGELOG)
- **Protocol fee:** subtracted from total trading fee first: `protocol_fee = fee × protocol_fee_percent`. There is also a **referral fee** (carved from protocol fee). ⚠️ The exact protocol-fee percentage for standalone DAMM v2 pools was not confirmed from a primary numeric source (the program exposes `claim_protocol_fee`/`claim_protocol_fee2` to a protocol authority). Source: <https://github.com/MeteoraAg/damm-v2> · <https://docs.meteora.ag/overview/products/damm-v2/damm-v2-fee-calculation>
- **Who claims:** the **position-NFT owner** claims LP fees (`claimPositionFee`/`claimPositionFee2`); protocol authority claims protocol fees. Source: <https://github.com/MeteoraAg/damm-v2-sdk/blob/main/docs.md>

### ⚠️ CRITICAL — splitting fees between creator + platform on DAMM v2
- **DAMM v2's built-in partner fee split was REMOVED in program v0.2.0** ("Removed `partner` field from Pool struct", "Removed unused `partner_fee` feature and the `claim_partner_fee` endpoint"). The current SDK `PoolFeesParams` has only `baseFee`, `compoundingFeeBps`, `padding`, `dynamicFee` — **no partner/creator numerator**. Sources: <https://github.com/MeteoraAg/damm-v2> (CHANGELOG) · <https://raw.githubusercontent.com/MeteoraAg/damm-v2-sdk/main/src/types.ts>
- **So you split fees in one of two ways:**
  1. **Launch via DBC** and use the DBC config `creatorTradingFeePercentage` + `feeClaimer` (partner) — this is the launch-time split mechanism. §5.
  2. **Hold liquidity in two locked positions (two NFTs)** — one owned by Momento, one by the creator — each claims its own share of fees. DAMM v2 lets you permanently lock a position while still claiming its fees, and the fee-claim right is the NFT itself (transferable). Real example: the elizaOS case study collected "10% of fees via a separate platform address." Sources: <https://github.com/MeteoraAg/damm-v2> · <https://meteoraag.medium.com/damm-v2-case-study-elizaos-e5a30f19b9bf>
- **Bottom line:** do **not** expect a single DAMM v2 pool field with two fee recipients. Direct fees via (i) DBC launch config, or (ii) position-NFT ownership across multiple locked positions. This is the area most likely to drift between versions — verify against your target version.

### Create pool with USDC quote + set fees + claim (SDK)
- Pass USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` as `tokenBMint` (price = USDC per token A). Source: <https://github.com/MeteoraAg/damm-v2-sdk/blob/main/docs.md>
- **Config keys:** *static* config = anyone can create a pool with it; *dynamic* config = only `pool_creator_authority` may create (prevents launch front-running). Source: <https://docs.meteora.ag/overview/products/damm-v2/what-is-damm-v2>
- Fees are set **at pool creation** via `poolFees` on `createCustomPool` / `createCustomPoolWithDynamicConfig`. ⚠️ **There is no top-level `setFees`/`setPoolFees` method on `CpAmm`** — you configure fees at creation, not mutate them afterward (the program does expose `update_pool_fees` for `compounding_fee_bps` since v0.2.1). Source: <https://github.com/MeteoraAg/damm-v2-sdk/blob/main/src/CpAmm.ts>

### Trade-offs
- **Pros:** modern, USDC-quotable, fee scheduler + market-cap fees for launches, locked-LP fee accrual (perfect for creator+platform split), the canonical DBC migration target.
- **Cons:** no native two-recipient fee field (use locked positions); concentrated-range management; some features (compounding, market-cap fees) are recent — confirm program version.

---

# 4. DBC (Dynamic Bonding Curve) — the launch primitive

### How it works
- A **launch-pool protocol**: partners (Momento) let users launch tokens on **customizable virtual curves** with no seed liquidity. Tokens trade against the virtual pool until a graduation threshold, then **auto-migrate to DAMM v1 or v2**. Source: <https://github.com/MeteoraAg/dynamic-bonding-curve>
- **Pricing:** constant-product `x·y = liquidity²` over a **multi-segment (piecewise) curve** defined by `[liquidity, priceRange]` points. ⚠️ README says **up to 20 price ranges**; an older indexed snippet said 16 — confirm `MAX_CURVE_POINT` in source. Source: <https://github.com/MeteoraAg/dynamic-bonding-curve>
- `activation_type`: Slot (0) or Timestamp (1). Token decimals limited to **6–9**. Sources: <https://github.com/MeteoraAg/dynamic-bonding-curve> · <https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/customizable-pool-configuration>

### Bonding-curve → AMM migration
- **Threshold:** `migration_quote_threshold` — the amount of **quote token** (SOL/USDC) the virtual pool must accumulate. When reserves reach it, the token **graduates**. Source: <https://github.com/MeteoraAg/dynamic-bonding-curve>
- **Migration target enum (`MigrationOption`)** — confirmed from program source `state/config.rs`:
  - `0 = MeteoraDamm` → **DAMM v1**
  - `1 = DammV2` → **DAMM v2**
  Source: <https://github.com/MeteoraAg/dynamic-bonding-curve> (state/config.rs)
  ⚠️ The Aug-2025 Code4rena audit listed "option 2 = DAMM v2"; the **current source says `1`**. The SDK uses a named enum (`MigrationOption.MET_DAMM_V2`) so prefer the named constant. Sources: <https://code4rena.com/reports/2025-08-meteora-dynamic-bonding-curve> · <https://github.com/MeteoraAg/dynamic-bonding-curve-sdk>
- **Migrator keeper:** Meteora runs auto-migrator keepers that watch on-chain threshold state, then create pool metadata, initialize the DAMM pool, and lock LP per config. ⚠️ Keepers have **minimum threshold requirements** to qualify for the managed service — the exact minimum SOL values are shown as placeholders in indexed docs and could **not** be confirmed. Self-migration via SDK (`migrateToDammV1`/`migrateToDammV2`) is available. Sources: <https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/dbc-migrator-keeper> · <https://github.com/MeteoraAg/dynamic-bonding-curve-sdk>
- **Migration fee tiers** (`migration_fee_option` = swap fee of the *graduated* DAMM pool): **0.25%, 0.3%, 1%, 2%, 4%, 6%**, plus a **Customizable** option (DAMM v2 only). Source: <https://github.com/MeteoraAg/dynamic-bonding-curve>

### Post-migration LP / fees
- After graduation, LP (DAMM v1) or LP **position NFTs** (DAMM v2) are **locked or claimable for both partner and creator**, per four config fields:
  - `partner_lp_percentage`, `creator_lp_percentage` (claimable/unlocked)
  - `partner_locked_lp_percentage`, `creator_locked_lp_percentage` (locked; fees claimable, principal locked)
  Both parties claim trading fees from their locked LP on the DAMM pool. Token creators' locked vesting migrates to Jupiter Lock. Sources: <https://github.com/MeteoraAg/dynamic-bonding-curve> · <https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/customizable-pool-configuration>
- **Surplus:** the final swap that crosses the threshold creates a **quote-token surplus**, shared between partner and protocol. ⚠️ Exact partner/protocol surplus split % not found in any primary source — confirm in program constants. Source: <https://github.com/MeteoraAg/dynamic-bonding-curve>

### Fee economics — what Meteora keeps vs Momento + creator
During the **bonding phase**, every buy/sell pays a trading fee, split:
- **Protocol fee = fixed 20% of the trading fee** → kept by Meteora.
- **Referral fee = 20% of the protocol fee** (i.e. ≤ 4% of total) → paid to swap hosts (Jupiter, bots) that pass a referral account; **carved from Meteora's 20%, not from the LP share**.
- **LP fee = remaining 80%** → split between **partner (Momento) and creator** by `creatorTradingFeePercentage`.

**Worked example:** if `creatorTradingFeePercentage = 20%`, then of the total fee: **partner 64%, creator 16%, protocol 20%** (creator's 20% applies to the 80% LP portion). Sources: <https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/customizable-pool-configuration> · <https://github.com/MeteoraAg/dynamic-bonding-curve>

**Net for Momento:** Meteora keeps a **flat 20%** during bonding; **Momento + creator keep 80%**, split however you set `creatorTradingFeePercentage`. Post-migration, Momento + creator own the locked LP and earn the chosen migration fee tier; docs do not indicate Meteora takes an ongoing cut of post-migration DAMM LP fees beyond standard DAMM mechanics. This directly satisfies Momento's "keep most fees for creator + app" goal.

**Base fee (bonding phase):** fixed or via fee scheduler. Min fee numerator `100_000` = **0.01% (1 bps)**; fixed base fee range **0.01%–99%**. `collect_fee_mode`: `0` = quote-token only, `1` = both tokens. Sources: <https://code4rena.com/reports/2025-08-meteora-dynamic-bonding-curve> · <https://docs.meteora.ag/integration/dynamic-bonding-curve-dbc-integration/dbc-fee-scheduler-formula>

### Partner / creator / fee-recipient designation
- `feeClaimer` = the **partner address** (Momento) that claims trading fees from virtual pools and from locked LP.
- `creator` = the token creator, claims their share separately (`creatorTradingFeePercentage`).
- `leftoverReceiver` = receives leftover tokens.
- Creator role is reassignable via `transferPoolCreator`.
Sources: <https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/customizable-pool-configuration> · <https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/docs.md>

---

# 5. Token-2022 compatibility (critical for Momento's 1% / 10% tax)

| Extension | DBC | DAMM v2 | DLMM |
|---|---|---|---|
| **Transfer Fee** | ✅ supported | ✅ permissionless | ✅ permissionless |
| **Transfer Hook** | ✅ via dedicated transfer-hook configs | ⚠️ permissionless only if hook program + authority revoked, else needs admin token badge | ⚠️ supported; same revoked/whitelist condition |
| Metadata Pointer / Token Metadata | ✅ | ✅ permissionless | ✅ permissionless |

**DBC (the launch path):** the program has a **`ConfigWithTransferHook`** state struct (adds `transfer_hook_program`) and `TokenType` = `{ SplToken=0, Token2022=1 }`. `TokenAuthorityOption` includes `CreatorUpdateAndMintAuthority` and `PartnerUpdateAndMintAuthority` that are **"only allowed for transfer-hook configs"** (options 3 and 4). The SDK exposes first-class transfer-hook methods: `createConfigWithTransferHook`, `createConfigAndPoolWithTransferHook`, `createPoolWithTransferHook`, `swap2WithTransferHook`, etc. Sources: <https://github.com/MeteoraAg/dynamic-bonding-curve> (state/config.rs) · <https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/src/services/partner.ts>

**DAMM v2 & DLMM:** "All token2022 with metadata pointer and transfer fee extensions are supported permissionlessly." **Transfer Hook** is supported **permissionlessly only if both the hook program and the hook authority are revoked** (DAMM v2 v0.1.5); otherwise the mint's extensions must be **whitelisted by Meteora admin via `create_token_badge`**. DLMM uses `createLbPair2`/`createCustomizablePermissionlessLbPair2` + `PresetParameter2` for Token-2022. Sources: <https://github.com/MeteoraAg/damm-v2> (README + CHANGELOG) · <https://docs.meteora.ag/overview/products/dlmm/token-2022-extensions>

### ⚠️ Implication for Momento's tax design
- **A simple Transfer-Fee tax (1% / 10%) is the safest, most compatible choice** — supported permissionlessly everywhere (DBC, DAMM v2, DLMM). Transfer Fee is the native Token-2022 way to levy a percentage on every transfer, including swaps, and routes the fee to a withdraw-authority you control.
- **A Transfer-Hook-based tax is possible** (DBC has explicit support), but for the *post-migration* DAMM v2/DLMM pool you must either **revoke the hook program + authority** (which neuters a dynamic hook) or get a **Meteora admin token badge** whitelist. If your tax logic must remain active *and* dynamic post-graduation, this is a real constraint — engage Meteora for a token badge, or implement the tax as a Transfer Fee instead.
- ⚠️ This is the **single most important item to re-verify against the deployed program version** before committing the tax architecture. The Aug-2025 audit's extension allowlist was metadata-only; transfer-hook support is a **newer addition** — confirm it is live on the program version you target.

---

# 6. SDKs — packages, versions, methods, snippets

All versions are the `latest` npm dist-tag as of 2026-06-23 (from the npm registry API; npmjs.com 403'd to direct fetch). **All three use `@solana/web3.js` v1 as a regular dependency — none use v2 / `@solana/kit`.** Anchor pinned to `0.31.0`.

| SDK | Package | Version | web3.js | Repo |
|---|---|---|---|---|
| DBC | `@meteora-ag/dynamic-bonding-curve-sdk` | **1.5.10** (2026-06-08) | `^1.98.0` | <https://github.com/MeteoraAg/dynamic-bonding-curve-sdk> |
| DAMM v2 | `@meteora-ag/cp-amm-sdk` | **1.4.3** (2026-04-24) | `^1.95.3` | <https://github.com/MeteoraAg/damm-v2-sdk> |
| DLMM | `@meteora-ag/dlmm` | **1.9.10** (2026-05-18) | `^1.91.6` | <https://github.com/MeteoraAg/dlmm-sdk> |
| DAMM v1 (legacy) | `@meteora-ag/dynamic-amm-sdk` | 1.4.1 (2025-08-11) | `1.98.0` | <https://github.com/MeteoraAg> |

Sources: <https://registry.npmjs.org/@meteora-ag/dynamic-bonding-curve-sdk/latest> · <https://registry.npmjs.org/@meteora-ag/cp-amm-sdk/latest> · <https://registry.npmjs.org/@meteora-ag/dlmm/latest>

**web3.js v1 vs v2:** caret on a v1 spec (`^1.98.0`) will never resolve to v2. To use these SDKs, stay on web3.js v1 (`Connection`, `PublicKey`, `Transaction`, `Keypair` from `@solana/web3.js`). They are **not** compatible with the `@solana/kit` (v2) API without an adapter; mixing a v2 app with these means two web3.js copies in the tree.

**Devnet:** all three work on devnet — point `Connection` at a devnet RPC; **same program IDs as mainnet**:
- DBC: `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` (mainnet = devnet)
- DAMM v2: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` (mainnet = devnet)
- DLMM: `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` (mainnet = devnet; localhost differs)
Sources: <https://github.com/MeteoraAg/dynamic-bonding-curve-sdk> · <https://github.com/MeteoraAg/damm-v2-sdk> · <https://github.com/MeteoraAg/dlmm-sdk/blob/main/ts-client/src/dlmm/constants/index.ts>

### DBC client structure
`new DynamicBondingCurveClient(connection, commitment)` exposes 5 namespaces: `client.pool` (swaps/quotes), `client.partner` (config + partner fees), `client.creator` (pool/token launch + creator fees), `client.migration`, `client.state`. ⚠️ **`createPool` lives on `creator` (and `partner`), NOT `pool`** — the `pool` service is swap/quote only. Source: <https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/src/client.ts>

Key methods:
- **Partner:** `createConfig`, `createConfigWithTransferHook`, `createConfigAndPool…`, `claimPartnerTradingFee`, `claimPartnerTradingFeeToReceiver`, `partnerWithdrawSurplus`.
- **Creator:** `createPool`, `createPoolWithTransferHook`, `createPoolWithFirstBuy`, `claimCreatorTradingFee`, `claimCreatorTradingFeeToReceiver`, `creatorWithdrawSurplus`, `transferPoolCreator`.
- **Migration:** `createDammV1MigrationMetadata`, `migrateToDammV1`, `lockDammV1LpToken`, `claimDammV1LpToken`, `migrateToDammV2`, `createLocker`.
Source: <https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/src/services/>

### Snippet — DBC: build curve + create config (verbatim, Token-2022)
```typescript
import { Connection } from '@solana/web3.js'
import {
  DynamicBondingCurveClient, buildCurveWithMarketCap,
  TokenType, TokenDecimal, TokenAuthorityOption, BaseFeeMode,
  CollectFeeMode, MigrationOption, MigrationFeeOption,
  MigratedCollectFeeMode, DammV2DynamicFeeMode, ActivationType,
} from '@meteora-ag/dynamic-bonding-curve-sdk'

const connection = new Connection('https://api.mainnet-beta.solana.com')
const client = new DynamicBondingCurveClient(connection, 'confirmed')

const curveConfig = buildCurveWithMarketCap({
  token: {
    tokenType: TokenType.Token2022,        // launch a Token-2022 mint
    tokenBaseDecimal: TokenDecimal.SIX,
    tokenQuoteDecimal: TokenDecimal.NINE,
    tokenAuthorityOption: TokenAuthorityOption.Immutable,
    totalTokenSupply: 1_000_000_000, leftover: 0,
  },
  fee: {
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: { startingFeeBps: 120, endingFeeBps: 120, numberOfPeriod: 0, totalDuration: 0 },
    },
    dynamicFeeEnabled: true,
    collectFeeMode: CollectFeeMode.QuoteToken,
    creatorTradingFeePercentage: 20,        // creator's share of the 80% LP fee; rest -> feeClaimer (Momento)
    poolCreationFee: 0,
    enableFirstSwapWithMinFee: true,
  },
  migration: {
    migrationOption: MigrationOption.MET_DAMM_V2,  // graduate to DAMM v2
    migrationFeeOption: MigrationFeeOption.Customizable,
    migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    migratedPoolFee: {
      collectFeeMode: MigratedCollectFeeMode.QuoteToken,
      dynamicFee: DammV2DynamicFeeMode.Enabled, poolFeeBps: 120,
    },
  },
  liquidityDistribution: {
    partnerLiquidityPercentage: 55, partnerPermanentLockedLiquidityPercentage: 0,
    creatorLiquidityPercentage: 0,  creatorPermanentLockedLiquidityPercentage: 0,
  },
  lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
  activationType: ActivationType.Timestamp,
  initialMarketCap: 100, migrationMarketCap: 3000,
})

const tx = await client.partner.createConfig({
  config: configKeypair.publicKey,
  feeClaimer: momentoWallet.publicKey,     // Momento = partner / fee recipient
  leftoverReceiver: momentoWallet.publicKey,
  payer: momentoWallet.publicKey,
  quoteMint: USDC_MINT,                     // USDC-quoted launch
  ...curveConfig,
})
```
Source: <https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/docs.md>

### Snippet — DBC: claim fees (verbatim)
```typescript
// Creator's share
await client.creator.claimCreatorTradingFee({
  pool, creator, payer,
  maxBaseAmount: new BN(1_000_000), maxQuoteAmount: new BN(1_000_000),
})
// Partner (Momento) share
await client.partner.claimPartnerTradingFee({
  pool, feeClaimer, payer,
  maxBaseAmount: new BN(1_000_000), maxQuoteAmount: new BN(1_000_000),
})
```
Source: <https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/docs.md>

### Snippet — DAMM v2: create USDC-quoted pool + claim fees (verbatim)
```typescript
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
const cpAmm = new CpAmm(connection)

const createPoolTx = await cpAmm.createPool({
  payer: wallet.publicKey, creator: wallet.publicKey, config: configAddress,
  positionNft: positionNftMint,
  tokenAMint,                                  // creator token
  tokenBMint: USDC_MINT,                        // EPjFWdd5...Dt1v  (USDC quote)
  activationPoint: null,
  tokenAAmount: new BN(5_000_000_000), tokenBAmount: new BN(50_000_000_000),
  initSqrtPrice, liquidityDelta, tokenAProgram, tokenBProgram,
})
// Fees set at creation via createCustomPool({ ..., poolFees, collectFeeMode }) — no setFees() method.

const claimFeeTx = await cpAmm.claimPositionFee({
  owner: wallet.publicKey, pool: poolAddress, position: positionAddress,
  positionNftAccount, tokenAVault: poolState.tokenAVault, tokenBVault: poolState.tokenBVault,
  tokenAMint: poolState.tokenAMint, tokenBMint: poolState.tokenBMint, tokenAProgram, tokenBProgram,
})
```
Source: <https://github.com/MeteoraAg/damm-v2-sdk/blob/main/docs.md>

### Snippet — DLMM: claim swap fees (verbatim)
```typescript
import DLMM from '@meteora-ag/dlmm'
const dlmmPool = await DLMM.create(connection, POOL_PUBKEY)
const claimFeeTx  = await dlmmPool.claimSwapFee({ owner: user.publicKey, position: pos.publicKey })
const claimFeeTxs = await dlmmPool.claimAllSwapFee({ owner: user.publicKey, positions: userPositions })
```
Source: <https://github.com/MeteoraAg/dlmm-sdk/blob/main/ts-client/README.md>

---

# 7. Costs & gotchas

- **DBC protocol fee:** flat **20% of trading fees** during bonding (referral carved from it). Source: <https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/customizable-pool-configuration>
- **Migration fee tier:** 0.25%–6% or customizable — this is the post-graduation DAMM swap fee, not a one-time charge. Source: <https://github.com/MeteoraAg/dynamic-bonding-curve>
- **DAMM v2 base fee:** up to 50%; dynamic fee adds ≤20% of base. Sources above.
- **DLMM:** ~0.01%–5% base + variable; historically 0% protocol fee (governance may change this).
- ⚠️ **Rent / account-creation lamport costs:** no specific SOL figures found in primary sources. Standard Solana rent applies to config, virtual pool, mint, and (at migration) DAMM pool + position accounts. Whether Meteora's keeper absorbs migration rent or it's funded from pool reserves/surplus was **not confirmed** — verify in the technical FAQ. Source: <https://docs.meteora.ag/integration/dynamic-bonding-curve-dbc-integration/technical-faq>

### Gotchas
1. `createPool` is on the DBC **`creator`/`partner`** namespaces, not `pool`.
2. DAMM v2 has **no `setFees` method** — fees set at creation; only `compounding_fee_bps` is mutable (`update_pool_fees`).
3. DAMM v2 **removed the native partner fee split** (v0.2.0) — use DBC config split or locked-NFT positions.
4. All SDKs are **web3.js v1**; do not assume `@solana/kit`.
5. Token-2022 **Transfer Hook** post-migration requires revoked hook authority **or** a Meteora token badge.
6. `MigrationOption` enum is `1` for DAMM v2 in current source (audit said 2) — use the SDK's named constant.

---

# 8. Open unknowns to confirm before build (ranked)

1. **Token-2022 Transfer Hook** live status & exact post-migration conditions on the deployed DAMM v2/DLMM version (highest impact for the tax design). Confirm whether Momento needs a Meteora token badge, or whether Transfer Fee alone meets the 1%/10% requirement.
2. **DBC migrator keeper minimum thresholds** (docs show placeholders) and whether sub-threshold pools must self-migrate.
3. **Surplus split %** between partner and protocol at graduation.
4. **DAMM v2 standalone protocol-fee %** (the exact `protocol_fee_percent`).
5. **Rent / account-creation costs** and who funds migration rent.
6. **Max DBC curve segments** (16 vs 20) — confirm `MAX_CURVE_POINT`.

---

## Primary source index
- DBC program: <https://github.com/MeteoraAg/dynamic-bonding-curve>
- DBC SDK + docs.md + services: <https://github.com/MeteoraAg/dynamic-bonding-curve-sdk>
- DAMM v2 program (README/CHANGELOG): <https://github.com/MeteoraAg/damm-v2>
- DAMM v2 SDK docs + types: <https://github.com/MeteoraAg/damm-v2-sdk/blob/main/docs.md> · <https://raw.githubusercontent.com/MeteoraAg/damm-v2-sdk/main/src/types.ts>
- DLMM SDK: <https://github.com/MeteoraAg/dlmm-sdk> · <https://www.npmjs.com/package/@meteora-ag/dlmm>
- npm registry: <https://registry.npmjs.org/@meteora-ag/dynamic-bonding-curve-sdk/latest> · <https://registry.npmjs.org/@meteora-ag/cp-amm-sdk/latest> · <https://registry.npmjs.org/@meteora-ag/dlmm/latest>
- Code4rena audit (Aug 2025): <https://code4rena.com/reports/2025-08-meteora-dynamic-bonding-curve>
- Docs: <https://docs.meteora.ag/overview/products/dlmm/what-is-dlmm> · <https://docs.meteora.ag/overview/products/damm-v2/what-is-damm-v2> · <https://docs.meteora.ag/product-overview/dynamic-bonding-curve-dbc-overview/customizable-pool-configuration>
- Case study (fee-split example): <https://meteoraag.medium.com/damm-v2-case-study-elizaos-e5a30f19b9bf>
