# Phase 0 + Phase 1 — Implementation Plan (file-level)

**Status:** Phase 1 (EVM removal) ✅ DONE (commit `3f00f5e`). Phase 0 in progress (secrets noted; spikes next).
**Date:** 2026-06-23 · **Branch:** `claude/gifted-pascal-fcyskz`

> **Progress log**
> - ✅ **Phase 1 EVM removal** — 60 files, −1,902/+361. Grep gate clean. Forward migration authored.
> - ✅ **Phase 0 secrets** — `.env` files annotated with ROTATE notes; values left as-is per team decision (see `SECRETS_REMEDIATION.md`).
> - ⏳ **Carry-over follow-ups (need network / a dev machine):**
>   1. `pnpm install` to refresh `pnpm-lock.yaml` (still lists `@ethersproject/shims`) — required before CI/EAS builds with `--frozen-lockfile`.
>   2. Run `tsc` + `turbo lint` across the monorepo as the final completeness gate (couldn't run here — no `node_modules`).
>   3. Decide dev `db push` vs prod `migrate deploy` sync before applying the new migration.
> - ⏭️ **Next:** Phase 0 devnet spikes (Token-2022 transfer-fee + rebate · Meteora DBC · Streamflow/Jupiter Lock).
**Source of truth for file:line detail:** [`research/06-evm-removal-surface.md`](./research/06-evm-removal-surface.md) (Phase 1) and the master [`README.md`](./README.md).

## Decisions locked (from product)

| # | Decision | Consequence for these phases |
|---|---|---|
| Tax | **~1% in-app + 3–5% Token-2022 transfer fee, rebated in-app to ~1%** | New creator tokens are **Token-2022** (not classic SPL). Phase 0 includes a devnet spike to prove transfer-fee + rebate. |
| Rail | **Meteora DBC direct, Momento as Partner** | Phase 0 spike: DBC create→graduate→claim. |
| Quote | **USDC** | Mainnet flip + MoonPay USDC alignment in Phase 0. |
| Signing | **Privy Server Wallets (`@privy-io/node`) + client relay/self-submit via Helius Sender** | Phase 0 sets up the server wallet. |
| Secrets | Checklist only (see `SECRETS_REMEDIATION.md`) | Phase 0.1 = rotation (ops). |

---

# PHASE 0 — Foundations & hygiene

Mostly ops + small de-risking spikes. Can run in parallel with Phase 1 (no code conflicts).

### 0.1 — Rotate exposed secrets (ops) 🔴
Owner: human/ops. Follow `SECRETS_REMEDIATION.md` §3. Migration work proceeds in parallel; do not block on history purge.

### 0.2 — Activate the onramp (ops + tiny code)
- Enable the **MoonPay Fiat On-Ramp plugin** in the Privy dashboard (app `cmjbzyj4q00twlb0d1uc5w0sb` / mobile clientId at `PrivyGuard.tsx:64`).
- Flip `EXPO_PUBLIC_SOLANA_NETWORK` / `SOLANA_NETWORK` → `mainnet-beta` (via EAS/Vercel env, not committed files).
- Verify "Buy USDC" in a **native build** (not Expo Go). Acceptance: a real USDC purchase settles to the embedded wallet on mainnet. (See `09`,`14`.)

### 0.3 — Fix the 0%-earnings bug (ops + script)
- Run `scripts/create-fee-atas.ts` against **mainnet** for the fee wallet so Jupiter `platformFee` actually lands (currently ATAs were never created on mainnet → 0% collected). (See `05`,`07`.)
- Reconcile the fee-wallet mismatch: hardcoded `5U29…` in the script vs `MOMENTO_FEE_WALLET` env (see `08`). Pick one canonical fee wallet.

### 0.4 — Stand up server-side signing
- Add `@privy-io/node` (server SDK; `@privy-io/server-auth@1.32.5` is deprecated — plan its migration).
- Provision a **Momento server/treasury wallet** via Privy; store its identity in env (Vercel).
- Acceptance: backend can build + sign + submit a trivial mainnet/devnet tx (e.g., a memo) via the server wallet, self-submitted through Helius. This is the keystone for all later on-chain features. (See `04`,`16`.)

### 0.5 — Devnet spikes (de-risk before Phase 3 build)
Run on devnet; throwaway code in `scripts/spikes/`. Each is a go/no-go gate.
- **Spike A — Tax model (Token-2022):** mint a Token-2022 with the **Transfer Fee** extension (3–5% bps), execute transfers, **withdraw withheld fees**, and prototype the **in-app rebate** (collect, refund delta to in-app trader). Proves tax option B end-to-end. (See `12`,`16`.)
- **Spike B — Meteora DBC:** with `@meteora-ag/dynamic-bonding-curve-sdk`, create a USDC-quoted curve, simulate graduation to DAMM v2 (`@meteora-ag/cp-amm-sdk`), and **claim partner + creator fees**, signed by the Privy server wallet. Verify configurable split knobs (`partner_*`, `creator_*`, `leftover_receiver`). Verify Token-2022 transfer-fee token is accepted by the pool. (See `10`,`15`.)
- **Spike C — Vesting/lock:** create a Streamflow vesting (`prepareCreateInstructions`, ephemeral metadata Keypair co-signer) and a Jupiter Lock LP lock, signed via Privy. (See `13`.)

### 0.6 — Stack standardization
- Pin `@solana/web3.js@^1.98` across api + mobile (do **not** adopt `@solana/kit` yet — Meteora/Streamflow/Privy are v1).
- Add `@solana/spl-token` (Token-2022), and Meteora/Streamflow SDKs as dev deps for the spikes.
- Record the chosen versions in `research/16-solana-stack.md`'s table once verified via `npm view`.

---

# PHASE 1 — EVM / Base removal

Self-contained, low-risk, unblocks everything. Detail at file:line in `research/06-evm-removal-surface.md`.
**Completeness gate:** collapse `ChainType` to a 1-member union early, then run `tsc` over the whole
monorepo — every missed `=== 'base'` branch surfaces as a dead-code/`never` error. Don't call Phase 1 done
until `tsc` + `turbo lint` are clean and the app builds.

### Recommended sequencing (dependency-safe)
Two parallel tracks (mobile vs api/shared) that converge at the type-check gate.

```
W1 mobile UI ─┐
W2 mobile hooks/auth ─┼─► W3 retire ChainProvider/deps/env ─┐
                      │                                      ├─► W-GATE (tsc + build) ─► W8 docs
W4 api routes ─┐      │                                      │
W5 api libs/auth ─────┼─► W6 shared collapse ─► W7 schema migration ─┘
```

### W1 — Mobile UI leaves (no dependents; strip Base branches, keep Solana)
Files: `src/components/features/SwapModal.tsx`, `SendModal.tsx`, `FundWalletModal.tsx`; `app/(tabs)/wallet.tsx`; `app/wallet.tsx`. Remove `ChainSwitcher` usages, `chain === 'base'` UI, KyberSwap/basescan/Coinbase/MetaMask copy. (06 §2d)
**Also decide the canonical wallet screen** — `app/wallet.tsx` (full) vs stale `app/(tabs)/wallet.tsx` — and converge on one. (01)

### W2 — Mobile hooks + auth
Files: `src/hooks/useSwap.ts` (delete the entire Base swap block + EVM helpers), `usePrivyFunding.ts` (keep only `useFundSolanaWallet`), `useOnramp.ts` (drop `chain`), `useWalletBalance.ts`, `useWalletTransactions.ts`, `useAuth.ts` (strip all ETH-wallet machinery), `src/providers/PrivyGuard.tsx:67` (remove `embedded.ethereum`). (06 §2d)

### W3 — Retire chain abstraction + deps/env (mobile)
- Delete `src/providers/ChainProvider.tsx`, `src/components/features/ChainSwitcher.tsx`, `src/hooks/useChain.ts` (after W1/W2 remove consumers).
- Remove `<ChainProvider>` from `app/_layout.tsx:11,107,199`.
- Remove `@ethersproject/shims` from `apps/mobile/package.json:14` + `index.js:7`; `pnpm install`.
- Remove Base fields in `src/config/env.ts:18-25` and `EXPO_PUBLIC_BASE_*` from `.env.{example,development,production}`. (06 §1,§2d,§3,§4)

### W4 — API routes de-branch
Files under `apps/api/app/api/wallet/`: `balance`, `swap`, `send` (delete `handleBaseSend()` `:215-297`), `onramp`, `history`, `snapshots`, `transactions`, `transactions/log`. Collapse every `chain === 'base'` to the Solana literal; hard-wire `getChainParam`→`'solana'`. (06 §2c)

### W5 — Delete API EVM libs + auth cleanup
- Delete `apps/api/lib/base.ts`, `apps/api/lib/base-swap.ts` (after W4 removes imports).
- `apps/api/lib/auth.ts`: strip `ethWallet` extraction, `baseWalletAddress`/`primaryChain` from selects/creates, collapse `getWalletForChain`/`getChainParam`. (06 §1,§2b)

### W6 — Shared package collapse (the blast-radius step — 33 consumers)
`packages/shared/src/types.ts`: `ChainType` → `'solana'` (**collapse, don't delete** — Risk R1), remove `PoolType.AERODROME`, drop `User.baseWalletAddress`/`primaryChain`. `constants.ts`: remove the `CHAIN_CONFIG.base` block, keep `solana`. (06 §2a,§6)
> Tip: do the 1-member-union collapse **first** to drive the `tsc` completeness gate for W1–W5.

### W7 — Schema forward migration
New migration `2026XXXX_remove_base_support`: `DROP COLUMN users.baseWalletAddress` + its unique index; remove `PoolType.AERODROME` (verify no `creator_tokens.poolType='AERODROME'` rows first — enum-value removal needs the type-swap dance). **Keep** `chain`/`nativeBalance`/`nativeValueUsd` columns defaulting to `'solana'` (Risk R2/R3). **Never edit applied migrations.** Confirm dev (`db push`) vs prod deploy strategy first. Then `prisma generate`. (06 §5)
⚠️ PostGIS geography columns/triggers live outside `schema.prisma` — forward migrations only, never `db push` against prod. (03)

### W-GATE — Verify
`tsc` (full monorepo) + `turbo lint` clean; mobile + api build; smoke-test login, balance, Solana swap/send, Buy USDC. The collapsed union makes `tsc` the completeness oracle for branch removal.

### W8 — Docs archive (lowest priority)
Add "SUPERSEDED 2026-06" banners / move to `archive/`: all of `docs/multi-chain/*`, `MULTI_CHAIN_PLAN.md`, `HANDOFF_MULTICHAIN.md`. Fix stale landing copy "4 Blockchain Partners" (`Proof.tsx:38`, dead but misleading). (06 §7, 08)

---

## Suggested coding-agent assignment

| Agent | Workstreams | Notes |
|---|---|---|
| Mobile-refactor agent | W1, W2, W3 | One agent owns mobile to avoid cross-file conflicts |
| API-refactor agent | W4, W5 | Owns `apps/api` |
| Shared+schema agent | W6, W7 | Runs the union-collapse first; coordinates the tsc gate |
| Docs agent | W8 | Independent, can run anytime |
| Phase-0 ops/spikes agent(s) | 0.2–0.6 | Parallel; spikes are throwaway `scripts/spikes/` |

## Risks carried from `06` (apply during execution)
- **R1** Collapse `ChainType`, don't delete (33 consumers). **R2/R3** Keep `chain`/`nativeBalance`/`solBalance` columns/fields (they back Solana). **R4** Forward migrations only (PostGIS + applied-migration checksums). **R5** Enum-value removal needs no `AERODROME` rows.

## Definition of done (Phases 0–1)
- [ ] 🔴/🟠 secrets rotated; gitignore fixed (separate security PR).
- [ ] MoonPay onramp works on mainnet in a native build; fee ATAs created (earning > 0%).
- [ ] Privy server wallet can sign+submit; all three devnet spikes pass (go/no-go for Phase 3).
- [ ] No `base`/EVM code paths remain; `tsc` + lint + builds clean; core Solana flows smoke-tested.
- [ ] Multi-chain docs archived.

**Next after this:** Phase 2 (signing infra hardening + fee accounting) → Phase 3 (Meteora launch + LP/fundraise module). See `README.md` §11.
