# 16 — Solana Developer Stack (Recommended, 2026)

> Consolidated from the stack-research wave (Privy signing, Helius infra, Anchor/Token-2022,
> Meteora & Streamflow SDK verification). All version numbers churn fast — re-verify with
> `npm view <pkg> version` / `crates.io` at implementation time. Sources cited inline.

## TL;DR — recommended stack

| Layer | Choice | Where used | Notes |
|---|---|---|---|
| RPC / indexing | **Helius** (RPC, DAS API, Priority Fee API, Enhanced Webhooks, Sender) | api backend | DAS indexes Token-2022 `mint_extensions`; webhooks watch transfers/fee-claims |
| Client lib | **`@solana/web3.js` v1 (1.98.x)** | api + mobile | **Stay on v1.** Meteora & Streamflow SDKs and Privy are all v1-based; `@solana/kit` (v2) has no ecosystem support yet |
| SPL | **`@solana/spl-token`** (Token-2022 / `token_interface`) | api | Token-2022 for transfer-fee tokens |
| Token metadata | **Metaplex Token Metadata** (primary) or Token-2022 metadata-pointer extension | api | Metaplex still the interoperable default in 2026 |
| Auth + wallets | **Privy** — `@privy-io/expo` (mobile), **`@privy-io/node`** (backend) | mobile + api | `@privy-io/server-auth` is **deprecated** → migrate to `@privy-io/node` |
| Launch / AMM | **Meteora** — `@meteora-ag/dynamic-bonding-curve-sdk` (launch) + `@meteora-ag/cp-amm-sdk` (DAMM v2, ongoing) | api | DLMM (`@meteora-ag/dlmm`) only for special cases |
| Vesting | **Streamflow** `@streamflow/stream` (rich vesting) + **Jupiter Lock** (free LP/allocation locks) | api | Streamflow ~0.17 SOL/contract; Jupiter Lock zero-fee |
| Custom program (only if needed) | **Anchor 1.0.2** (fast) or **Pinocchio 0.11.2 / native Rust** (CU-cheap) | on-chain | Only required if we build a transfer-hook or custom fee/routing program |

---

## Privy signing architecture (the keystone decision)

Findings from Privy research + re-verification:

- **Server SDK churn:** `@privy-io/server-auth` (Momento is on `1.32.5`) is **deprecated**; the new server SDK is **`@privy-io/node` (0.22.0)**. Plan a migration.
- **Mobile SDK:** `@privy-io/expo` latest is **0.69.4** (Momento on `0.63.9`). `signTransaction` for Solana was added in **v0.40.0** — so the installed version supports building/signing Solana txns client-side.
- **Gas sponsorship:** native Solana gas sponsorship via `sponsor: true` exists (since Sep 2025) **but is NOT supported in React Native / Expo** — to sponsor, the mobile app must relay the tx to the backend, which sponsors + submits.
- **Server API uses `caip2`** for cluster selection and exposes **no custom-RPC field** → for Helius/Jito control, use `signTransaction` and **self-submit** the signed tx through our own Helius/Sender path rather than letting Privy broadcast.
- **No `@solana/kit` support** in Privy — another reason to standardize on web3.js v1.

**Two viable signing models for platform-side actions (mint, create pool, claim fees, create vesting):**
1. **Privy Server Wallets** (`@privy-io/node`) — a Momento-owned wallet that signs platform/treasury actions server-side. Best for fee-claims, treasury LP, leftover routing.
2. **User-delegated / session signers** — user pre-authorizes the backend to sign specific actions on their embedded wallet. Needed if the *creator's own wallet* must be the on-chain authority (e.g., creator as `feeClaimer`).

> **Recommendation:** use **Privy Server Wallets** for all platform/treasury on-chain actions, and **client-side `signTransaction` + backend relay/self-submit** (via Helius Sender) for user-authorized actions. This is greenfield — no server-side signing exists today (see `04-wallet-auth-privy.md`).

---

## web3.js v1 vs v2 (`@solana/kit`)

- `@solana/kit` (v2) is production-ready in isolation, but **the entire DeFi ecosystem Momento depends on — Meteora, Streamflow, Privy — is v1-based.** Migrating to v2 now would strand us from those SDKs.
- **Decision: standardize on `@solana/web3.js` v1 (1.98.x)** for both backend and mobile. Revisit v2 only after the ecosystem moves.
- Mobile (Expo/Hermes) gotchas: requires `Buffer`/`crypto` polyfills (already present for the existing wallet); keep all on-chain SDK calls that build txns on v1 objects.

---

## Helius infrastructure (api backend)

- **RPC:** `https://mainnet.helius-rpc.com/?api-key=…` / devnet equivalent. Standard JSON-RPC + extensions. Paid plans get **staked connections by default** (SWQoS) for landing. (helius.dev/docs/api-reference/endpoints)
- **DAS API:** `getAsset`, `getAssetsByOwner`, `searchAssets` with `tokenType: fungible` + `displayOptions.showFungible`. **Indexes Token-2022 and returns `mint_extensions`** (incl. `TransferFeeConfig`). Perfect for surfacing our fee-token's extensions + holder balances. (helius.dev/docs/das-api, /das/fungible-token-extension)
- **Priority Fee API:** `getPriorityFeeEstimate` → micro-lamports/CU; feed into `ComputeBudgetProgram.setComputeUnitPrice`. (helius.dev/docs/priority-fee-api)
- **Sender:** ultra-low-latency dual-route (validators + Jito), `https://sender.helius-rpc.com/fast` (+ regional). **Requires a Jito tip** (min 0.0002 SOL; `?swqos_only=true` → 0.000005 SOL min). Must set `skipPreflight:true`, priority fee, `maxRetries:0`. Use for fee-claim / launch txns. (helius.dev/docs/sending-transactions/sender)
- **Webhooks:** Enhanced (parsed) / Raw / Discord. Watch the token mint + fee-collection accounts for `TRANSFER`/swap/fee-claim events — this is how we detect on-chain activity (incl. the basis for any "external trade" accounting). (helius.dev/docs/webhooks)

---

## Anchor / Token-2022 (only if we build a custom program)

- **Anchor 1.0.2** (2026-05-02; first stable major was 1.0.0 in Apr 2026). Canonical repo cited as `github.com/solana-foundation/anchor` (note: currently 301-redirects to `otter-sec/anchor`; **not** `anza-xyz`). Targets Agave/Solana 3.x split crates. Install via AVM.
- **`anchor-spl` 1.0.2** has `token_interface`, `token_2022`, `token_2022_extensions` — program-agnostic `InterfaceAccount<Mint/TokenAccount>`; enable features `["token_2022","token_2022_extensions"]`. Caveat: "not all extension instructions fully implemented" — some need manual CPI.
- **Transfer hooks** (only relevant if we pursue the hook-based tax, which `12-tax-mechanism.md` advises *against*): implement the Transfer Hook Interface `Execute` + `ExtraAccountMetaList` PDA (`spl-transfer-hook-interface` + `spl-tlv-account-resolution`, both `0.10.x`). Anchor's `#[interface]` macro simplifies the discriminator. For a program that runs on **every transfer**, **Pinocchio 0.11.2** or native Rust is more CU-efficient (Anchor is faster to ship). Reference repos: `solana-developers/program-examples`, `pawsengineer/spl-token-2022-transfer-hook-anchor`.
- **Verified builds:** `solana-verify` (0.4.x) → Explorer-integrated; use for a transparent on-chain fee/hook program.

---

## Meteora SDKs (verified)

- **DBC (launch):** `@meteora-ag/dynamic-bonding-curve-sdk` (~1.5.x). Configurable partner/creator fee split, `migration_quote_threshold`, graduation to DAMM v2.
- **DAMM v2 (ongoing pair):** `@meteora-ag/cp-amm-sdk` (~1.4.x). ⚠️ Package is **`cp-amm-sdk`, not `damm-v2`**. Supports permanently-locked liquidity with **claimable fees**, fee scheduler, dynamic fee. Note: DAMM v2 **removed the native partner-fee field** — fee split must come from DBC config or dual locked NFT positions.
- **DLMM:** `@meteora-ag/dlmm` (~1.9.x) — concentrated liquidity; special cases only.
- **Token-2022:** transfer-**fee** tokens supported; custom transfer-**hooks** are whitelist-gated/often unsupported on AMMs — **verify with Meteora before designing hook tokens.**
- All **web3.js v1**. See `10-meteora.md` for fee mechanics.

## Streamflow / Jupiter Lock SDKs (verified)

- **Streamflow:** `@streamflow/stream` (v12.4.0 per npm; some sources list v7/v8 — **verify**). `prepareCreateInstructions(...)` returns raw instructions → Privy-signable. Ephemeral `metadata` Keypair co-signs create (multi-signer flow — validate on devnet). web3.js v1, Anchor 0.32.1 dep. Fees: ~0.17 SOL/contract vesting; **0.5% token-lock fee**.
- **Jupiter Lock:** free, audited — preferred for LP / retained-allocation locks. See `13-streamflow.md`.

---

## Top version-churn flags
1. Privy: `server-auth` → `node` migration; Expo gas sponsorship unsupported (relay to backend).
2. Anchor repo org redirect churn (`solana-foundation` → `otter-sec`); toolchain matrix is examples-not-locked — pin via AVM.
3. Meteora DAMM v2 package name (`cp-amm-sdk`) and the removed native partner-fee field.
4. Streamflow major version (12 vs 7/8) — verify before coding.
5. Stay on web3.js v1 until Meteora/Streamflow/Privy ship `@solana/kit` support.
