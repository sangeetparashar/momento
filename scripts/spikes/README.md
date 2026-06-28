# Devnet Validation Spikes — Phase 0

Throwaway, runnable devnet scripts that **prove the locked Solana-migration decisions** before we build
the real Phase 3 modules. Each script prints a clear **GO / NO-GO** verdict. They are reference code, not
production — sign with a local keypair here; production swaps in **Privy** signing.

See: [`../../docs/solana-migration/README.md`](../../docs/solana-migration/README.md) ·
[`../../docs/solana-migration/PHASE-0-OPS-RUNBOOK.md`](../../docs/solana-migration/PHASE-0-OPS-RUNBOOK.md)

## What each spike proves

| Spike | File | Proves | Status |
|---|---|---|---|
| **A** | `spike-a-token2022-fee-rebate.ts` | Token-2022 **Transfer Fee (3–5%)** + harvest/withdraw + **in-app rebate to ~1%** (tax decision) | ✅ authored, ⏳ unrun |
| **B** | `spike-b-meteora-dbc.ts` | **Meteora DBC** create→buy→**graduate to DAMM v2**→**claim partner+creator fees** (launch + LP/fee economics) | ✅ authored, ⏳ unrun |
| **C** | `spike-c-vesting-lock.ts` | **Streamflow** vesting (cliff+linear, ephemeral metadata co-signer) + **Jupiter Lock** (zero-fee LP lock) | ✅ authored, ⏳ unrun |

## Prerequisites

1. Node + pnpm; run from repo root.
2. A **funded devnet keypair**. Set `SPIKE_KEYPAIR` to either a base58 secret key or a path to a Solana CLI
   JSON keypair file. The scripts airdrop devnet SOL if the balance is low (airdrop can be rate-limited —
   pre-fund via https://faucet.solana.com if needed).
3. A devnet RPC. `SPIKE_RPC_URL` defaults to `https://api.devnet.solana.com`; a **Helius devnet** URL is
   recommended for reliability.

## Install deps (not yet in package.json — install before running)

```bash
pnpm add -w \
  @solana/web3.js@^1.98 @solana/spl-token@^0.4 bs58@^5 bn.js@^5 \
  @coral-xyz/anchor@^0.31 \
  @streamflow/stream@^12.4.0 \
  @meteora-ag/dynamic-bonding-curve-sdk@1.5.10 @meteora-ag/cp-amm-sdk@1.4.3
```
> All SDKs are **`@solana/web3.js` v1** (NOT v2/`@solana/kit`) — keep the stack on v1 (see `research/16`).
> Verify exact versions with `npm view <pkg> version` before pinning.

## Run

```bash
SPIKE_KEYPAIR=~/.config/solana/id.json npx tsx scripts/spikes/spike-a-token2022-fee-rebate.ts
SPIKE_KEYPAIR=~/.config/solana/id.json npx tsx scripts/spikes/spike-b-meteora-dbc.ts
SPIKE_KEYPAIR=~/.config/solana/id.json npx tsx scripts/spikes/spike-c-vesting-lock.ts
```

### Env vars by spike
- **All:** `SPIKE_KEYPAIR` (required), `SPIKE_RPC_URL` (optional, default devnet).
- **B:** `SPIKE_QUOTE_MINT` (default devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` — mainnet `EPjFW…` does NOT exist on devnet), `SPIKE_CREATOR_KEYPAIR` (optional; defaults to the fee payer).
- **C:** `SPIKE_MINT`, `SPIKE_RECIPIENT`, `JUP_LOCK_PROGRAM_ID` (`LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn`), `JUP_LOCK_IDL_PATH` (omit → Jupiter Lock section runs DRY-RUN), `SPIKE_TRY_WITHDRAW=1` (optional).

## Key findings already surfaced while writing the spikes

- **Tax design is viable through the Meteora rail (Spike B):** DBC accepts **Token-2022 + Transfer Fee
  permissionlessly** end-to-end (DBC → DAMM v2 → DLMM). A Transfer **Hook** would instead need revoked
  authority or a Meteora token-badge whitelist post-migration → **use a Transfer Fee, not a hook.** This
  matches the locked decision.
- **Rebate accounting nuance (Spike A):** paying the in-app rebate *in the creator token* re-incurs the
  transfer fee → either **gross-up** the rebate or **rebate in SOL/USDC**. Product/accounting decision for
  the Phase 4 rebate module.
- **Vesting multi-signer (Spike C):** Streamflow `create()` generates an **ephemeral `metadata` Keypair**
  that must co-sign; Jupiter Lock uses the same ephemeral `base`-keypair pattern. Production must confirm
  **Privy can attach an extra local signer** to a tx it co-signs (caveat #1).
- **Fees:** Meteora protocol fee = **20%** (rest split partner/creator); Streamflow vesting ≈ **0.16 SOL
  flat/contract**; Streamflow token-lock **0.5%** → prefer **Jupiter Lock (zero-fee)** for LP locks.

## Open items to validate on a real devnet run (highest-value first)

1. **B:** Can DBC launch a curve over a **pre-existing taxed Token-2022 mint**, or does the SDK mint a fresh
   base mint? (Determines whether our taxed mint can be the pool's base token.) — the single most important check.
2. **A:** Confirm the on-chain program accepts the exact `fee` passed to `transferCheckedWithFee` and the
   gross-up math lands the in-app net at ~1%.
3. **C:** Confirm Jupiter Lock account names against the IDL fetched from its **devnet** deployment (the
   in-file names come from its test workspace, which is localnet).
4. **All:** swap the local-keypair signer for **Privy server-wallet** signing.

> These scripts have NOT been executed (no devnet wallet/network in the authoring sandbox). Treat the
> `// TODO verify` markers in each file as the run-time checklist.
