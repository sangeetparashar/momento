# 13 — Streamflow: Token Vesting & LP Locking on Solana

**Research date:** 2026-06-23
**Author:** Solana tooling research (Momento migration)
**Scope:** Programmatic token vesting (creator/team), LP / retained-allocation locking, and optional investor vesting — integrated via SDK and signed by Privy wallets.

> **Confidence note:** All version numbers, dependencies, fees, and signing details below are cited. Where a claim is from a secondary source or could not be confirmed from a primary source, it is flagged **[UNCERTAIN]**. Fees in particular change frequently — re-verify against the live fees doc before launch.

---

## 0. TL;DR Recommendation

| Use case | Recommendation | Why |
|---|---|---|
| **Creator / team vesting (with cliff)** | **Streamflow** | Best-in-class Solana-native SDK, cliff + periodic unlock, cancelable/transferable flags, instructions-only flow for Privy signing. Cost is a flat ~0.17 SOL/contract — trivial vs. % models. |
| **LP / retained-allocation locking** | **Jupiter Lock** (zero-fee) for pure locks; **Streamflow** if you want it in one SDK/dashboard | Jupiter Lock charges **0 fees**; Streamflow Token Locks add **0.5% of locked tokens** which is real value leakage at scale. Trade-off is a second integration. |
| **Investor vesting from a raise** | **Streamflow** | Same flat-fee vesting; transferable/cancelable + auditable on-chain schedule investors can verify. Magna only if you need off-chain cap-table/compliance tooling. |

**Do NOT build a custom vesting program** for v1 — both Streamflow and Jupiter Lock are audited, battle-tested, and the flat fees are negligible vs. audit + maintenance cost of a custom Anchor program.

---

## 1. What Streamflow Offers

Streamflow is the Solana-native token-operations platform (vesting, locks, airdrops, staking, payments), used by 40k+ projects and the only vesting provider listed in Solana's own docs. ([streamflow.finance](https://streamflow.finance/), [Umbra/Streamflow announcement](https://coinmarketcap.com/academy/article/umbra-streamflow-private-token-vesting-solana))

**Capabilities:**
- **Token vesting** — lock & gradually release to team/investors/advisors. ([vesting docs](https://docs.streamflow.finance/en/articles/9339223-token-vesting))
- **Cliffs** — "a defined date when a chosen amount of tokens unlocks all at once, and regular vesting continues from that point." ([vesting docs](https://docs.streamflow.finance/en/articles/9339223-token-vesting))
- **Linear / periodic unlocks** — driven by `period` (seconds) + `amountPerPeriod` params. Linear = small period; periodic = larger interval. ([SDK README](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/README.md))
- **Initial allocation** — upfront amount released immediately at creation. ([vesting docs](https://docs.streamflow.finance/en/articles/9339223-token-vesting))
- **Cancelable streams** — `cancelableBySender` / `cancelableByRecipient` flags; also a `requestCancel` / `withdrawCancelRequest` two-step flow. ([README](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/README.md), confirmed in [StreamClient source](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/solana/StreamClient.ts))
- **Transferable / tradable streams** — `transferableBySender` flag; contracts can be listed for sale on a secondary market. ([vesting docs](https://docs.streamflow.finance/en/articles/9339223-token-vesting))
- **Token Locks** — dedicated lock product (single recipient = self, full amount, no early unlock). ([token-locks](https://streamflow.finance/token-locks))
- **Airdrops / Distributor** — Merkle-based airdrops to thousands/millions of recipients (separate package). ([js-sdk](https://github.com/streamflow-finance/js-sdk))
- **Auto-claim** — tokens pushed to recipient on unlock (extra fee, see below). ([vesting docs](https://docs.streamflow.finance/en/articles/9339223-token-vesting))
- **Top-up** — `canTopup` flag to add tokens later. ([README](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/README.md))
- **Aligned / price-based unlocks** — proxy program where unlock rate scales with token price via oracle (the SDK ships `streamflow_aligned_unlocks` IDL). ([npm package exports](https://registry.npmjs.org/@streamflow/stream/latest), [aligned unlocks blog/docs](https://streamflow.finance/))

**Token-2022 support:** **Yes [partially confirmed].** Streamflow states it supports both SPL and Token-2022 variants and recommends Token-2022 extensions for advanced transfer controls; LP tokens tied to DEX pools are also supported. The SDK uses `@solana/spl-token@0.4.9` which includes Token-2022 primitives. ([search result citing streamflow.finance](https://streamflow.finance/), [npm deps](https://registry.npmjs.org/@streamflow/stream/latest)) **[UNCERTAIN]** — Token-2022 with *transfer hooks* specifically may need testing; the vesting help article does not explicitly call out Token-2022, so validate on devnet with your exact mint config.

---

## 2. SDK: Packages, Versions, Methods

### Packages (all currently **v12.4.0**, verified via npm registry)
| Package | Purpose | Latest |
|---|---|---|
| `@streamflow/stream` | Core vesting / lock / stream client | **12.4.0** ([npm registry](https://registry.npmjs.org/@streamflow/stream/latest)) |
| `@streamflow/common` | Shared utils, RPC, types | **12.4.0** ([npm](https://registry.npmjs.org/@streamflow/common/latest)) |
| `@streamflow/distributor` | Merkle airdrops | **12.4.0** ([npm](https://registry.npmjs.org/@streamflow/distributor/latest)) |

> Note: an earlier web summary suggested "v9.0.x" as current — that is **wrong**; the npm registry confirms **12.4.0** is latest. ([npm registry](https://registry.npmjs.org/@streamflow/stream/latest))

### Dependencies (from `@streamflow/stream@12.4.0` package.json) ([npm registry](https://registry.npmjs.org/@streamflow/stream/latest))
- `@solana/web3.js`: **1.98.4** — **web3.js v1**, NOT the new v2/`@solana/kit`. Important: Momento's other Solana code must stay on web3.js v1 to interop directly, or bridge between v1 `TransactionInstruction` and v2.
- `@coral-xyz/anchor`: `^0.32.1`
- `@solana/spl-token`: `0.4.9` (Token-2022 capable)
- `@solana/wallet-adapter-base`: `0.9.19`
- `bn.js`: `5.2.3`
- Node `>=18`. ESM + CJS dual build.

```bash
npm i @streamflow/stream @streamflow/common bn.js
```

### Key methods (from `SolanaStreamClient` / `StreamClient.ts`) ([source](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/solana/StreamClient.ts), [README](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/README.md))
- **Create:** `create()`, `createMultiple()`, `createMultipleSequential()`, `createUnchecked()`
- **Instructions-only (for external signers like Privy):** `prepareCreateInstructions(data, { sender: { publicKey } })`
- **Manage:** `withdraw()`, `cancel()`, `transfer()`, `topup()`, `update()`, `requestCancel()`, `withdrawCancelRequest()`
- **Query:** `getOne({ id })`, `get()` (filtered list), `searchStreams()`

### Cluster / Devnet support
Program IDs are published for both clusters — **Devnet:** `HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ`, **Mainnet:** `strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m`. Pass a devnet RPC URL + `cluster: "devnet"` to the client. ([README](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/README.md))

### Snippet — create a **vesting** contract (cliff + monthly linear)
```ts
import { StreamflowSolana, getBN } from "@streamflow/stream";
import { ICreateStreamData } from "@streamflow/stream";
import BN from "bn.js";

const client = new StreamflowSolana.SolanaStreamClient(
  "https://api.devnet.solana.com",
  "devnet",
);

const now = Math.floor(Date.now() / 1000);
const params: ICreateStreamData = {
  recipient: "<team_member_pubkey>",
  tokenId: "<mint_pubkey>",
  start: now,
  amount: getBN(1_000_000, 9),          // total, decimals=9
  period: 2_592_000,                      // 30 days -> monthly unlock
  cliff: now + 31_536_000,                // 12-month cliff
  cliffAmount: getBN(250_000, 9),         // 25% at cliff
  amountPerPeriod: getBN(62_500, 9),      // remaining over 12 periods
  name: "Team vesting",
  canTopup: false,
  cancelableBySender: true,
  cancelableByRecipient: false,
  transferableBySender: false,
  transferableByRecipient: true,
};

// Privy-friendly: get instructions, sign elsewhere
const { ixs, metadata } = await client.prepareCreateInstructions(params, {
  sender: { publicKey: senderPubkey },    // PublicKey only, no signing here
});
// `metadata` is a Keypair that MUST co-sign the create tx (see §4).
```

### Snippet — create a **token lock** (e.g. LP / retained allocation)
A lock is a vesting stream that releases everything at one future time with no early exit:
```ts
const lockParams: ICreateStreamData = {
  recipient: ownTreasuryPubkey,           // lock to self
  tokenId: lpOrTokenMint,
  start: now,
  amount: getBN(totalToLock, 9),
  period: 1,
  cliff: now + 15_768_000,                // 6-month lock
  cliffAmount: getBN(totalToLock, 9).sub(new BN(1)),
  amountPerPeriod: new BN(1),
  name: "LP lock",
  canTopup: false,
  cancelableBySender: false,              // non-cancelable = real lock
  cancelableByRecipient: false,
  transferableBySender: false,
};
const { ixs, metadata } = await client.prepareCreateInstructions(lockParams, {
  sender: { publicKey: senderPubkey },
});
```
(Lock pattern from [README](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/README.md). Streamflow also exposes a dedicated [Token Locks](https://streamflow.finance/token-locks) product/UI — but note its 0.5% fee, §3.)

### Snippet — query
```ts
const stream = await client.getOne({ id: contractId });
const unlockedNow = stream.unlocked(Math.floor(Date.now()/1000));
const remaining   = stream.remaining(9);
```
([README](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/README.md))

---

## 3. Fees (verify before launch — these change)

From the official **Costs of using Streamflow** doc ([docs](https://docs.streamflow.finance/en/articles/9675153-costs-of-using-streamflow)):

| Product | Streamflow service fee | Network/rent | When charged |
|---|---|---|---|
| **Vesting contract** | **0.16 SOL flat** | ~0.0147 SOL | On **creation** (~**0.1747 SOL total**) |
| **Token Lock** | **0.16 SOL + 0.5% of locked tokens** | ~0.0147 SOL | On **creation** |
| **Airdrop / Distributor** | none on create; **0.009–0.017 SOL per claim** (flat) | network only | On **claim** |
| **Clawback (Business)** | 1.70% of returned tokens + 0.00204 SOL | — | On clawback |
| **Staking pool (Business)** | 1.30 SOL flat | ~0.0147 SOL | On pool creation |
| **Auto-claim add-on** | 0.25 SOL upfront + 0.000005 SOL/withdrawal | — | Per stream / per withdrawal |

**Key takeaways for "maximize value kept":**
- **Vesting is flat** (~0.17 SOL ≈ a few dollars) regardless of amount — negligible. **Withdrawals are free** (just network fees) unless you opt into auto-claim.
- **Token Locks take 0.5% of the locked tokens** — for a large LP/allocation lock this is meaningful value leakage. This is the single biggest reason to prefer **Jupiter Lock (0 fees)** for pure locking. ([docs](https://docs.streamflow.finance/en/articles/9675153-costs-of-using-streamflow))
- Secondary source quoted "0.19–0.25% of distributed amounts" for vesting ([withdrawalfees.com via search]) — this **conflicts** with the official flat-fee doc. **[UNCERTAIN]** Trust the official doc, but confirm in a devnet/mainnet dry run.

---

## 4. Signing — Privy compatibility (the important part)

Streamflow's SDK supports **two signing modes** ([types.ts source](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/solana/types.ts), [StreamClient.ts](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/solana/StreamClient.ts)):

1. **SDK signs** — pass `sender: SignerWalletAdapter | Keypair` to `create()` / `withdraw()` (uses `invoker` for interactions). Good for server keypairs.
2. **Instructions-only** — `prepareCreateInstructions(data, { sender: { publicKey } })` and the prepare-variants of withdraw/cancel/transfer (`{ invoker: { publicKey } }`) return raw `TransactionInstruction[]`. You assemble the tx and sign with **any external signer — including Privy.** This is the recommended path for Momento.

**Privy fit:**
- **Privy embedded wallet** — build the tx from `ixs`, then `useSignTransaction` / `signAndSendTransaction`. ([Privy sign-a-transaction](https://docs.privy.io/wallets/using-wallets/solana/sign-a-transaction), [signAndSendTransaction](https://docs.privy.io/api-reference/wallets/solana/sign-and-send-transaction))
- **Privy server wallet** — sign server-side via Privy's Node SDK with an authorization key in the `privy-authorization-signature` header. Good for automated/treasury-controlled vesting creation. ([Privy server signers](https://docs.privy.io/recipes/wallets/user-and-server-signers))

> **Critical nuance:** Creating a stream/lock generates an on-chain `metadata` account whose **Keypair must co-sign the create transaction**. `prepareCreateInstructions` returns this `metadata` Keypair — your tx therefore has **two signers**: the Privy wallet (sender/fee-payer) **and** the ephemeral `metadata` Keypair. Make sure your Privy flow allows adding the metadata partial-signature (sign locally with the Keypair, then have Privy add the sender signature). Withdraw/cancel/transfer need only the Privy signer. ([StreamClient.ts](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/solana/StreamClient.ts)) **[Verify this multi-signer flow on devnet early — it's the highest-risk integration detail.]**

**Partner-fee opportunity:** the SDK exposes `partner` / `partnerLink` / `partnerFee` fields — if Momento becomes a Streamflow partner, you can route a fee share through your own integration. ([types.ts](https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/solana/types.ts), [v12.1.0 release notes adding `feePartner`](https://github.com/streamflow-finance/js-sdk/releases)) **[UNCERTAIN — requires a BD conversation with Streamflow.]**

---

## 5. Use cases for Momento

### (1) Creator / team token vesting with cliff → **Streamflow**
Direct fit. Cliff + periodic linear unlock, cancelable-by-sender (claw back unvested if a team member leaves), transferable-by-recipient if you want secondary liquidity. Flat ~0.17 SOL/contract. Use `prepareCreateInstructions` + Privy server wallet (treasury-controlled) or the creator's embedded wallet.

### (2) Locking LP / retained allocation → **Jupiter Lock (primary)**, Streamflow (if consolidating)
For a pure lock, **Jupiter Lock is free** vs. Streamflow's **0.5%-of-tokens** Token-Lock fee — at any meaningful size, choose Jupiter Lock. Use Streamflow only if you specifically want everything in one SDK + the public Streamflow dashboard for transparency, and accept the 0.5%. (Streamflow lock via the vesting `create` path may avoid the dedicated lock product's 0.5% — **[UNCERTAIN, test fee on devnet]**.)

### (3) Investor vesting from a raise → **Streamflow**
Same flat-fee vesting, on-chain and verifiable by investors, transferable/cancelable as negotiated. If investors demand off-chain cap-table, 83(b), TPA/compliance tooling, layer in **Magna**.

---

## 6. Alternatives (brief)

| Tool | Solana? | Fees | SDK / programmatic | Pros | Cons |
|---|---|---|---|---|---|
| **Streamflow** | Yes (native) | Vesting flat ~0.17 SOL; Lock +0.5% tokens; airdrop per-claim ([docs](https://docs.streamflow.finance/en/articles/9675153-costs-of-using-streamflow)) | **Mature TS SDK** v12.4.0 ([npm](https://registry.npmjs.org/@streamflow/stream/latest)) | Richest features, Solana-native, instructions-only signing, dashboard, partner fees | Lock fee is %; web3.js v1 only |
| **Jupiter Lock** | Yes (native) | **Zero fees**, open-source, 2 audits (Sec3, OtterSec) ([Jupiter X](https://x.com/JupiterExchange/status/1826959175089545604), [docs](https://developers.jup.ag/docs/lock)) | Anchor program `LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn`; CLI + IDL; **no first-party TS SDK** (use Anchor client) ([GitHub](https://github.com/jup-ag/jup-lock)) | Free, audited, ideal for locks/vesting | Fewer features (no cancel-on-leave secondary mkt, etc.); you build the TS client over the IDL **[UNCERTAIN on exact feature set]** |
| **Bonfida token-vesting** | Yes | Network only (open program) | Rust program `CChTq6...T743`; crank-based unlock; recipient-transferable ([GitHub](https://github.com/Bonfida/token-vesting)) | Free, simple, transferable | **Effectively legacy/unmaintained**, has a "deprecated" UI; no cliff/linear convenience; DIY tooling. Avoid for new builds. ([deprecated UI](https://deprecated-vesting.bonfida.org/)) |
| **Magna** | Yes (not native-first) | Enterprise / contact sales ([magna.so](https://www.magna.so/)) | API + on-chain; white-glove | Cap-table, compliance (83(b), TPA), $60B peak TVL; **acquired by Kraken 2025** ([The Block](https://www.theblock.co/post/390358/kraken-buys-token-vesting-platform-magna-hit-peak-tvl-60-billion-in-2025)) | Heavyweight, paid, not Solana-purpose-built; overkill unless you need compliance/cap-table |
| **Hedgey** | **No** (EVM only) | Free, non-custodial ([search]) | EVM SDK | Good on EVM | **Does not support Solana** — non-starter. Acquired by Anchorage Digital. |
| **Custom Anchor program** | Yes | Network only | You build it | Full control, no fees | Audit cost ($$$$), maintenance, security risk; reinvents Jupiter Lock. **Not worth it for v1.** |

---

## 7. Recommended approach per use case (final)

1. **Team / creator vesting (cliff):** **Streamflow** via `prepareCreateInstructions` + Privy (server wallet for treasury-issued grants, embedded wallet if the creator self-funds). Flat fee, full feature set.
2. **LP / retained-allocation lock:** **Jupiter Lock** (zero fee, audited) — write a thin Anchor TS client against its IDL. Fall back to Streamflow only to consolidate tooling and only if the 0.5% is acceptable.
3. **Investor vesting:** **Streamflow** (on-chain, verifiable, flat fee). Add **Magna** only if a raise requires off-chain cap-table/compliance.
4. **Airdrops (if needed later):** Streamflow `@streamflow/distributor` (Merkle, per-claim fee paid by claimer).

**Do not build custom.**

---

## 8. Top unknowns / things to verify before committing

1. **Privy multi-signer create flow** — the `metadata` Keypair must co-sign the create tx alongside the Privy wallet. Confirm this composes cleanly with Privy embedded + server signing on **devnet** first. (Highest risk.)
2. **Token-2022 with transfer hooks** — Streamflow claims Token-2022 support, but the vesting help doc doesn't spell it out; verify your exact mint (extensions/hooks) works on devnet. **[UNCERTAIN]**
3. **Real lock fee** — confirm whether a "lock" built via the vesting `create` path incurs the 0.5% token fee or only the flat fee; the 0.5% only appears under the dedicated Token-Lock product in the docs.
4. **Vesting fee model conflict** — official doc says **flat 0.16 SOL**; a third-party source says **0.19–0.25%**. Confirm with a live transaction. **[UNCERTAIN]**
5. **web3.js v1 vs v2** — SDK is pinned to web3.js **1.98.4**; align Momento's Solana stack or build a v1↔v2 bridge.
6. **Jupiter Lock feature parity** — confirm cliff/linear/cancelability/recipient-transfer support directly from the IDL/program before relying on it for LP locks. **[UNCERTAIN]**
7. **Streamflow partner program** — partner-fee revenue share requires a BD conversation; not self-serve. **[UNCERTAIN]**

---

## Sources
- Streamflow site & vesting: https://streamflow.finance/ , https://streamflow.finance/vesting , https://streamflow.finance/token-locks
- Vesting docs: https://docs.streamflow.finance/en/articles/9339223-token-vesting
- **Fees:** https://docs.streamflow.finance/en/articles/9675153-costs-of-using-streamflow
- SDK repo & README: https://github.com/streamflow-finance/js-sdk , https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/README.md
- SDK source (signing/types): https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/solana/types.ts , https://github.com/streamflow-finance/js-sdk/blob/master/packages/stream/solana/StreamClient.ts
- npm registry (versions/deps): https://registry.npmjs.org/@streamflow/stream/latest , https://registry.npmjs.org/@streamflow/common/latest , https://registry.npmjs.org/@streamflow/distributor/latest
- SDK releases (feePartner, requestCancel): https://github.com/streamflow-finance/js-sdk/releases
- Privy Solana signing: https://docs.privy.io/wallets/using-wallets/solana/sign-a-transaction , https://docs.privy.io/api-reference/wallets/solana/sign-and-send-transaction , https://docs.privy.io/recipes/wallets/user-and-server-signers
- Jupiter Lock: https://lock.jup.ag/ , https://developers.jup.ag/docs/lock , https://github.com/jup-ag/jup-lock , https://x.com/JupiterExchange/status/1826959175089545604
- Bonfida: https://github.com/Bonfida/token-vesting , https://deprecated-vesting.bonfida.org/
- Magna: https://www.magna.so/ , https://www.theblock.co/post/390358/kraken-buys-token-vesting-platform-magna-hit-peak-tvl-60-billion-in-2025
- Hedgey / comparison: https://streamflow.finance/blog/best-token-distribution-platforms-in-2026-top-5-solutions-compared
