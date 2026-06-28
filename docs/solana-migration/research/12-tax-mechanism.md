# 12 — The 1%/10% Tax Mechanism (in-app vs. elsewhere)

**Research question:** Can Momento ship a creator token where a trade **inside the Momento app** is taxed ~1%, but a trade **anywhere else** (other DEXs/wallets) is taxed ~10%? If so, how — and what breaks?

**Date:** 2026-06-23 · **Status:** Research / recommendation. No code in this repo implements any token-level tax (see `05-token-fee-lp-onchain.md`). Today's only shipped fee is an **app-side 4% Jupiter `platformFee`** taken from swap output — that is the model this report builds on.

> ⚠️ **Confidence flags are inline.** The single most load-bearing finding is the **composability** section (§4): how external venues treat Token-2022 Transfer Fee vs. Transfer Hook tokens. I verified it against DEX *source code / docs* (Orca, Meteora), not just blog posts, because it determines whether "tax elsewhere" is even possible.

---

## TL;DR / Bottom line

1. **No Token-2022 extension can natively charge a *different* fee depending on *where* the trade happens.** The Transfer Fee extension is a **flat, per-mint** percentage applied to *every* transfer regardless of who initiates it. **Confirmed.** ([Solana docs](https://solana.com/developers/guides/token-extensions/transfer-fee), [QuickNode](https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/transfer-fees))

2. **A Transfer Hook *cannot* charge a differential fee out of the trade either** — the hook runs *after* the transfer, all accounts are *read-only*, the **sender's signer privilege is stripped**, and the hook **cannot modify the transfer amount**. It can only *approve or revert*. So a hook can **allow/deny** (block external venues) but cannot **meter a 1% vs 10% cut** from the swap itself. **Confirmed against Orca's program code.** ([Orca TokenExtensions docs](https://docs.orca.so/), [Solana docs](https://solana.com/developers/guides/token-extensions/transfer-hook), [Neodyme](https://neodyme.io/en/blog/token-2022/))

3. **Therefore the differential is achieved off the token, not on it.** The only realistic way to get "1% in-app, 10% elsewhere" is: set the **token-level transfer fee to the *high* rate (the effective "elsewhere" tax)**, and **rebate the difference to in-app users** (approach **a**); and/or **route in-app trades through Momento's own pool/program at a low fee while letting the high transfer fee + external pool fees be the "elsewhere" cost** (approach **c**). A Transfer Hook (approach **b**) is only useful as an **allowlist/blocker**, not as a fee meter — and it carries the worst composability cost.

4. **Composability is the real constraint.** Transfer-Fee tokens are **broadly tradable** (Jupiter/Raydium/Orca/Meteora all support them; the fee is just slippage the venue accounts for). **Transfer-Hook tokens are *gated*:** Orca and Raydium require an admin-issued **TokenBadge** allowlist; Meteora is mixed. So a hook-based "tax elsewhere" tends to **block external trading entirely** rather than tax it — which may or may not be acceptable.

5. **Reputation risk is severe.** A ≥10% transfer fee is a textbook **honeypot signal**; RugCheck/Phantom-class scanners flag high fee-on-transfer and "custom transfer hook detected," which depresses external listing and scares wallets. ([DEXTools](https://www.dextools.io/tutorials/how-to-trade-solana-meme-coins-safely-using-on-chain-tools), [RugCheck](https://rugcheck.xyz/))

**Recommendation (detail in §6):** Do **NOT** use a high token-level transfer tax as the primary mechanism. Use the **PumpSwap-style model**: Momento token trades on **Momento's own pool/program** with a **low (~1%) protocol fee** in-app, and rely on the app-side `platformFee` you already ship. If a true *punitive* "elsewhere" tax is a hard product requirement, layer a **moderate Token-2022 Transfer Fee (the "elsewhere" rate) + an in-app rebate** (approach **a**), accepting that the rebate is a centralized, off-token process. Reserve the **Transfer Hook only as an optional allowlist** if you want to *block* (not tax) external venues — and know it kills most composability.

---

## 1. Token-2022 Transfer Fee extension — exactly how it works

The `TransferFeeConfig` mint extension applies a fee to **every** transfer of that mint, computed inside the Token-2022 program. ([Solana docs](https://solana.com/developers/guides/token-extensions/transfer-fee), [QuickNode](https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/transfer-fees))

| Parameter | Meaning |
|---|---|
| `transferFeeBasisPoints` | Fee as basis points of the transfer amount. `fee = transferAmount * bps / 10_000`. |
| `maximumFee` | Absolute per-transfer cap so huge transfers don't pay absurd fees. Default `0` = no fee. |
| `transferFeeConfigAuthority` | Can change the fee via `SetTransferFee`; **change takes effect 2 epochs later (~4 days)**; can be set to `None` to lock the fee. |
| `withdrawWithheldAuthority` | Can pull collected fees. Can be set to `None`. |

**Mechanics of collection:**
- The fee is **withheld on the *destination/recipient* token account** (via the `TransferFeeAmount` account-extension), not sent anywhere immediately. The recipient cannot spend the withheld portion. ([Solana docs](https://solana.com/developers/guides/token-extensions/transfer-fee))
- `HarvestWithheldTokensToMint` (permissionless) sweeps withheld amounts from many accounts into the mint's accumulator; then `WithdrawWithheldTokensFromMint` (or `WithdrawWithheldTokensFromAccounts`) pulls them to a fee receiver — both require the `withdrawWithheldAuthority`. ([Solana docs](https://solana.com/developers/guides/token-extensions/transfer-fee))

**Limits / footguns:**
- Basis points range is `0 ≤ r ≤ 10000` (i.e. **up to 100%** is technically allowed). A 100% / very-high fee is the classic **honeypot** construction. ([Neodyme](https://neodyme.io/en/blog/token-2022/), basis-points definition per Solana/QuickNode docs)
- **Known bypass:** the fee check happens on the *source* account; a holder who created their accounts *before* the fee was enabled (or via a mint-reinit trick) can sometimes transfer fee-free. Don't assume the fee is unevadable by sophisticated actors. ([Neodyme](https://neodyme.io/en/blog/token-2022/))

**❗Critical confirmation:** the Transfer Fee is **flat and context-blind**. There is **no field** for "different rate for sender X" or "different rate when called by program Y." It **cannot** natively distinguish in-app vs. elsewhere. Every search and the canonical docs agree. **(High confidence.)**

---

## 2. Token-2022 Transfer Hook extension — what it can and cannot do

The `TransferHook` extension makes Token-2022 **CPI into a custom program on every transfer**. ([Solana docs](https://solana.com/developers/guides/token-extensions/transfer-hook), [QuickNode](https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/transfer-hooks))

**How it's wired:**
- The hook program implements the `spl-transfer-hook-interface` `Execute` instruction.
- An **`ExtraAccountMetaList` PDA** (seeds `["extra-account-metas", mint]`, owned by the hook program) declares the extra accounts the hook needs; clients/DEXs resolve them automatically at transfer time. ([Solana docs](https://solana.com/developers/guides/token-extensions/transfer-hook), [docs.rs spl-transfer-hook-interface](https://docs.rs/crate/spl-transfer-hook-interface/latest))

**Hard constraints (these kill the "differential fee" idea) — confirmed against Orca's on-chain program** ([Orca docs](https://docs.orca.so/)):
1. **Called *after* core transfer logic** — accounts reflect the *end state* of the transfer.
2. **Cannot modify the transfer amount.** (Orca: *"TransferHook program cannot modify transfer amount and will be called AFTER token transfer processing."*)
3. **All transfer accounts are read-only; signer + writable flags of source/destination/owner are stripped.** The sender's signature is **not** available to the hook. ([Solana docs](https://solana.com/developers/guides/token-extensions/transfer-hook), [Neodyme](https://neodyme.io/en/blog/token-2022/))
4. **Indirect re-entrance is rejected** — the hook cannot CPI back into the calling DEX program. (Orca)
5. **It can revert** the transfer (→ effectively *block* it) and run arbitrary read-only validation, but it **cannot pull funds from the sender** without a *pre-existing delegate approval*.

**The "delegate pattern" (the only way a hook moves funds) — and why it doesn't work for DEX flows:**
To charge a fee, the sender must have **pre-approved a hook-owned PDA as a delegate** on a *separate* funded account (typically wSOL); the hook then signs as that PDA to move the fee. ([Chainstack](https://chainstack.com/solana-transfer-hooks-anchor-token-2022/), [Solana advanced example](https://solana.com/developers/guides/token-extensions/transfer-hook)) This requires the user to fund a wSOL account and grant a delegate *ahead of time* — which **arbitrary DEX/wallet flows do not do**, so it is unusable as a general "tax elsewhere" mechanism. **(High confidence this is a dead end for differential fees.)**

**Can a hook detect *which venue* is trading (to whitelist Momento)?** Partially, via **instruction introspection** (the `Instructions` sysvar: `load_current_index_checked`, `load_instruction_at_checked`) the hook can read other top-level instructions in the same transaction and check program IDs/discriminators. ([Solana instruction-introspection docs](https://solana.com/docs/core/instructions/instruction-introspection), [RareSkills](https://rareskills.io/post/solana-instruction-introspection)) **But** (a) Jupiter/aggregator routes wrap swaps in ways that make "is this Momento's pool" brittle to detect, (b) introspection-based allowlists are spoofable/fragile, and (c) the hook can still only **revert**, not meter a fee. So at best this yields **allow-Momento / block-others**, not 1%-vs-10%. **(Medium confidence; flagged as fragile.)**

**Net:** A Transfer Hook is an **allow/deny gate**, not a fee splitter. Useful only if the goal is *"block external trading"* rather than *"tax it more."*

---

## 3. The four candidate approaches — feasibility verdicts

### (a) High token-level Transfer Fee (the "elsewhere" rate) + in-app rebate — ✅ **VIABLE (but centralized)**
- Set `transferFeeBasisPoints` to the **high rate** (~10%, or somewhat lower — see risks). Everyone everywhere pays it.
- For **in-app** trades, Momento **refunds the difference** (~9%) back to the user — either by detecting in-app fills server-side and sending a rebate, or by Momento (as `withdrawWithheldAuthority`) collecting the withheld fee and crediting in-app users.
- **Pros:** Uses a *natively composable* extension (transfer-fee tokens trade on all major venues, §4). The differential is real economically.
- **Cons:** The rebate is an **off-chain / centralized** process (Momento decides who is "in-app"); rebate accounting is non-trivial (fees are *withheld on recipient accounts*, must be harvested then redistributed); a visible ~10% fee-on-transfer is a **honeypot red flag** that suppresses external listings and may trigger wallet warnings (§5). Sophisticated actors may **evade** the fee (§1). Fee changes lag **2 epochs**.
- **Verdict:** The most *honest* way to get a true differential while keeping the token tradable elsewhere. Best if "elsewhere" should be **expensive but possible**.

### (b) Transfer-Hook program enforcing differential fee / allowlist — ❌ **NOT VIABLE as a fee meter; only as a blocker**
- A hook **cannot** charge 1% vs 10% from the swap (§2: read-only, post-transfer, can't move sender funds, can't change amount).
- A hook **can** be coded to **revert any transfer not originating from a Momento-allowlisted context** (via introspection or an allowlisted source/destination set) — i.e. **block external trading entirely**.
- **Cons:** Most external venues **gate or refuse** hook tokens (§4); allowlist detection is fragile; "custom transfer hook detected" is a loud scam signal (§5); it makes the token **soulbound-ish** outside Momento.
- **Verdict:** Only choose this if the product intent is *"trading is essentially Momento-only"* (a walled garden), not *"taxed more elsewhere."*

### (c) Route ALL in-app trades through Momento's own pool/program at low fee; let transfer-fee + external pool fees be the "elsewhere" cost — ✅ **MOST VIABLE / RECOMMENDED CORE**
- This is the **PumpSwap / LetsBonk model**: the launchpad runs its **own AMM/program** and charges a **low protocol fee in-app** (PumpSwap ~0.25%/swap; pump.fun bonding curve 1%; Bonk.fun ~0.1%). ([blocmates](https://www.blocmates.com/news-posts/pump-fun-introduces-pumpswap-a-new-dex-for-graduated-token-listings), [The Block](https://www.theblock.co/post/347360/pump-fun-launches-dex-called-pumpswap-to-instantly-migrate-graduated-tokens), [pump.fun fees](https://pump.fun/docs/fees), [Smithii pump vs bonk](https://smithii.io/en/pump-fun-vs-letsbonk/))
- The "elsewhere" cost arises **naturally**: external pools have their own LP/AMM fees, worse liquidity, and — if you *also* add a **moderate** token transfer fee — that stacks on top everywhere. Combined with Momento's existing **app-side `platformFee`** (already 4% on Jupiter output, see `05-token-fee-lp-onchain.md`), the in-app path is the cheapest/best-routed.
- **Pros:** No honeypot signature if transfer fee is omitted or modest; full composability; matches proven Solana launchpad economics; Momento captures fees at the venue layer it controls.
- **Cons:** Doesn't by itself guarantee a *fixed* 10% "elsewhere" number — "elsewhere" cost = market structure, not a programmed tax. If a *hard* punitive number is required, combine with (a).
- **Verdict:** This should be the **backbone**. The 1% "in-app" is your pool/protocol fee.

### (d) Combination — ✅ **RECOMMENDED: (c) + a *modest* (a)**
- Momento pool at ~1% in-app (c) **+** a **moderate** Token-2022 Transfer Fee (say 3–5%, *not* 10%) as the baseline "everywhere" tax, with an **in-app rebate** down to ~1% effective (a).
- Gives a *real* differential, keeps the token tradable externally, and avoids the worst honeypot optics of a double-digit fee. **Do NOT add a Transfer Hook** unless you explicitly want to wall-garden.

---

## 4. CRITICAL composability check — do venues support these tokens?

This determines whether "tax elsewhere" means *"more expensive elsewhere"* or *"impossible elsewhere."*

### Transfer **Fee** tokens — ✅ broadly supported (tradable everywhere, fee is just accounted-for slippage)
- **Orca Whirlpools:** `TransferFeeConfig` is in the **always-supported** list (no TokenBadge needed). Orca computes the fee into swap math. *(Source: Orca's `is_supported_token_mint()` program logic.)* ([Orca docs](https://docs.orca.so/), [whirlpools repo](https://github.com/orca-so/whirlpools))
- **Meteora DLMM/DAMM:** Transfer Fee (+ metadata/metadata-pointer) supported **permissionlessly**. ([Meteora docs](https://docs.meteora.ag/overview/products/dlmm/token-2022-extensions))
- **Raydium:** CPMM supports Token-2022 incl. transfer-fee assets. ([Raydium](https://raydium.medium.com/raydium-support-for-token-2022-932f9fae966b))
- **Jupiter:** aggregates the above, so transfer-fee tokens route in normal swaps. **Caveat:** Jupiter **excludes transfer-tax Token-2022 from Limit Orders** (because creators can change the tax), and there are **trip-wires** — see risks. ([Jupiter support](https://support.jup.ag/hc/en-us/articles/22628276785820-Are-all-kinds-of-tokens-supported-on-Jupiter-s-Limit-order))

### Transfer **Hook** tokens — ⚠️ GATED, often blocked
- **DEXs do NOT "bypass" hooks** — that's a myth I saw in low-quality sources and it's *false*; the hook is enforced by Token-2022 on every transfer, so a DEX swap *must* run it. What DEXs actually do is **refuse to list hook tokens unless the hook is allowlisted.** **(Corrected; high confidence — verified against Orca program code.)**
- **Orca:** `TransferHook` is **conditionally supported "only if a TokenBadge is initialized"** (an Orca-admin allowlist). Best-practice criteria: hook source public + verifiable build. ([Orca docs](https://docs.orca.so/), [whirlpools repo](https://github.com/orca-so/whirlpools))
- **Raydium:** if either mint has a transfer hook, swaps depend on/are constrained by that hook; treated as elevated risk and effectively gated. ([Raydium CPMM docs](https://docs.raydium.io/raydium/for-liquidity-providers/pool-types/cpmm-constant-product))
- **Meteora:** docs indicate DLMM can take some hooks more permissively, but permissioned extensions require a **`token_badge`** via a request form + Discord review. **Treat as case-by-case / not guaranteed.** ([Meteora docs](https://docs.meteora.ag/overview/products/dlmm/token-2022-extensions)) *(Medium confidence — Meteora's exact hook policy was inconsistent across sources; verify directly before relying on it.)*
- **Wallet transfers (Phantom etc.):** a plain wallet-to-wallet send of a hook token must still satisfy the hook (provide the extra accounts, pass validation) or it **fails**. Many wallets handle this poorly for arbitrary hooks → broken/blocked sends and **scary warnings**.

**Implication:** A **Transfer-Hook** "tax elsewhere" would, in practice, **block** most external trading (no TokenBadge → no Raydium/Orca pool; aggregators won't route) rather than tax it. A **Transfer-Fee** "tax elsewhere" *keeps* external trading working, just more expensive. **This is the decisive reason to prefer Transfer Fee over Transfer Hook for the tax goal.**

### Where extensions are/aren't allowed — quick matrix

| Extension | Orca | Raydium CPMM | Meteora DLMM | Jupiter routing |
|---|---|---|---|---|
| **Transfer Fee** | ✅ always | ✅ | ✅ permissionless | ✅ swaps (❌ limit orders) |
| **Transfer Hook** | ⚠️ TokenBadge only | ⚠️ gated/risk | ⚠️ token_badge (case-by-case) | depends on venue listing |
| Permanent Delegate | ⚠️ TokenBadge | varies | whitelist | varies |
| NonTransferable | ❌ blocked | ❌ | ❌ | ❌ |

Sources: [Orca](https://docs.orca.so/), [Raydium](https://docs.raydium.io/raydium/for-liquidity-providers/pool-types/cpmm-constant-product), [Meteora](https://docs.meteora.ag/overview/products/dlmm/token-2022-extensions), [Jupiter](https://support.jup.ag/hc/en-us/articles/22628276785820-Are-all-kinds-of-tokens-supported-on-Jupiter-s-Limit-order).

---

## 5. Legal / UX / reputation caveats

- **Honeypot perception.** A high fee-on-transfer (esp. ≥10%) is one of the *defining* signatures scanners use to label tokens as scams/honeypots; ~25–30% of rug incidents involve buy-but-can't-sell or punitive-sell tokens. ([DEXTools risk checklist](https://www.dextools.io/tutorials/how-to-trade-solana-meme-coins-safely-using-on-chain-tools), [Kerberus honeypot guide](https://www.kerberus.com/learn/honeypot-crypto-scam/))
- **Scanner/wallet flags.** RugCheck and similar surface freeze authority, transfer restrictions, fee-on-transfer %, and **"Custom Transfer Hook detected → proceed with extreme caution."** A live transfer fee that the authority *can change* is a standing red flag (this is exactly why Jupiter bars such tokens from limit orders). ([RugCheck](https://rugcheck.xyz/), [Jupiter](https://support.jup.ag/hc/en-us/articles/22628276785820-Are-all-kinds-of-tokens-supported-on-Jupiter-s-Limit-order))
- **Mitigations:** keep the transfer fee *moderate*; consider **revoking the fee-config authority** (set to `None`) after launch so it can't be raised (reduces honeypot suspicion but removes your ability to tune); publish/verify any hook program; lead with the **pool-fee model** so the *token itself* looks clean.
- **Legal (not legal advice):** a deliberately punitive "tax everyone but us" can read as designed lock-in/market manipulation and may attract regulatory/marketplace scrutiny; the **rebate (approach a)** also creates an accounting/AML surface (you're moving value to specific users). Loop in counsel before shipping double-digit taxes.

---

## 6. Recommendation + concrete technical sketch

### Recommended: **(c) own-pool model as the backbone, optionally + a *modest* (a) transfer fee with in-app rebate.** Avoid (b)/hooks unless you intend a walled garden.

**Why:** It's the only design that (i) actually produces a fee differential, (ii) keeps the token tradable on Jupiter/Raydium/Orca/Meteora, (iii) avoids the honeypot signature of a hook or a 10% fee, and (iv) mirrors the *proven* PumpSwap/LetsBonk economics and Momento's *existing* app-side `platformFee`.

### Technical sketch

**A. In-app 1% (the cheap path) — venue-layer fee, no token tax needed**
- Launch each creator token as a **standard SPL or Token-2022 mint with *no* transfer fee** (cleanest optics) — or a *modest* transfer fee if you adopt the differential (below).
- Trade in-app via **either**:
  - **Momento's own pool/program** (PumpSwap-style) with a ~1% protocol fee, **or**
  - the **existing Jupiter integration** with Momento's `platformFee` set low (~1%) for the in-app route (you already wire `platformFeeBps` + fee-wallet ATAs — `apps/api/lib/jupiter.ts`, `05-token-fee-lp-onchain.md` §1–2).
- **Accounts/SDK:** reuse current path — Jupiter quote with `platformFeeBps`, fee-wallet **output-mint ATA** as `feeAccount`, Privy embedded wallet signs. For a bespoke pool, a small Anchor AMM program + pool PDA + fee-vault PDA.

**B. (Optional) "elsewhere" premium via *modest* Transfer Fee + rebate (approach a)**
- On the mint, set `TransferFeeConfig`: `transferFeeBasisPoints = 300–500` (3–5%, **not** 10%), `maximumFee` capped sanely; **assign `withdrawWithheldAuthority` to a Momento PDA/treasury.**
- This fee applies *everywhere* (in-app + external). For **in-app fills**, the backend issues a **rebate** so net in-app cost ≈ 1%:
  - Periodically `HarvestWithheldTokensToMint` → `WithdrawWithheldTokensFromMint` to a Momento treasury ATA (any signer can harvest; only the authority withdraws).
  - Backend identifies in-app trades (it builds/sponsors those txns) and **credits the rebate** (transfer tokens/SOL back).
- **Accounts:** mint w/ `TransferFeeConfig`; treasury ATA for the mint; `withdrawWithheldAuthority` keypair/PDA; per-user rebate ledger (off-chain DB, cf. existing `CreatorToken` schema).
- Consider **revoking `transferFeeConfigAuthority`** post-launch to fix the rate and reduce honeypot flags (trade-off: no future tuning; 2-epoch lag if kept).

**C. (Only if walled-garden desired) Transfer Hook as allowlist (approach b) — NOT recommended**
- Anchor program implementing `spl-transfer-hook-interface`; `ExtraAccountMetaList` PDA at `["extra-account-metas", mint]`; hook **reverts** transfers whose source/destination isn't a Momento-allowlisted account/pool (or fails introspection check of the calling program).
- **Accepts the cost:** must obtain **TokenBadge** on Orca and equivalent on Raydium/Meteora *or* be un-listable; expect wallet warnings; external trading effectively off.

### Explicit list of what BREAKS / degrades per choice

- **Any token-level transfer fee (B):** Jupiter **Limit Orders** unavailable for the token; some integrations mis-handle fee-on-transfer slippage; honeypot/scanner flags; sophisticated fee-evasion possible; **2-epoch delay** on fee changes; rebate is centralized + an accounting/AML surface.
- **Transfer Hook (C):** Raydium/Orca/Meteora require **allowlist (TokenBadge)** → without it, **no external pools, aggregators won't route, plain wallet sends may fail**; loud "transfer hook detected" warnings; hook can only **block**, never **meter** a fee; introspection-based allowlisting is **fragile/spoofable**.
- **Own-pool only (A):** no *programmed* "elsewhere" tax — "elsewhere" is just worse liquidity/normal DEX fees; if you need a guaranteed 10% number, you must add B.
- **Crucially, the literal spec "1% in-app, exactly 10% elsewhere, all on the token" is NOT achievable on Solana** — no extension meters fees by venue. The closest faithful implementation is **B (flat high-ish fee) + rebate**, and it is centralized + reputationally costly.

---

## 7. Sources

- Solana — Transfer Fees guide: https://solana.com/developers/guides/token-extensions/transfer-fee
- Solana — Transfer Hook guide: https://solana.com/developers/guides/token-extensions/transfer-hook
- Solana — Instruction Introspection: https://solana.com/docs/core/instructions/instruction-introspection
- QuickNode — Transfer Fees: https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/transfer-fees
- QuickNode — Transfer Hooks: https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/transfer-hooks
- Neodyme — Token-2022 footguns: https://neodyme.io/en/blog/token-2022/
- Offside — Token-2022 security best practices (extensions): https://blog.offside.io/p/token-2022-security-best-practices-part-2
- Chainstack — Transfer Hooks (Anchor 0.31): https://chainstack.com/solana-transfer-hooks-anchor-token-2022/
- docs.rs — spl-transfer-hook-interface: https://docs.rs/crate/spl-transfer-hook-interface/latest
- Orca — TokenExtensions support / docs: https://docs.orca.so/  · program: https://github.com/orca-so/whirlpools
- Raydium — Token-2022 support: https://raydium.medium.com/raydium-support-for-token-2022-932f9fae966b · CPMM docs: https://docs.raydium.io/raydium/for-liquidity-providers/pool-types/cpmm-constant-product
- Meteora — Token-2022 extensions (DLMM): https://docs.meteora.ag/overview/products/dlmm/token-2022-extensions
- Jupiter — Token support (limit orders / transfer tax): https://support.jup.ag/hc/en-us/articles/22628276785820-Are-all-kinds-of-tokens-supported-on-Jupiter-s-Limit-order
- pump.fun fees: https://pump.fun/docs/fees · PumpSwap: https://www.blocmates.com/news-posts/pump-fun-introduces-pumpswap-a-new-dex-for-graduated-token-listings · https://www.theblock.co/post/347360/pump-fun-launches-dex-called-pumpswap-to-instantly-migrate-graduated-tokens
- Pump vs Bonk fees: https://smithii.io/en/pump-fun-vs-letsbonk/
- DEXTools risk checklist: https://www.dextools.io/tutorials/how-to-trade-solana-meme-coins-safely-using-on-chain-tools · RugCheck: https://rugcheck.xyz/ · Kerberus honeypot guide: https://www.kerberus.com/learn/honeypot-crypto-scam/

> **Uncertainty flags:** (1) Meteora's exact Transfer-Hook policy was inconsistent across sources — verify directly before relying on permissionless hook support. (2) Introspection-based venue allowlisting is technically possible but fragile/spoofable; do not treat it as robust. (3) DEX/aggregator support policies change frequently — re-confirm Orca TokenBadge, Raydium gating, and Jupiter routing rules at implementation time.
