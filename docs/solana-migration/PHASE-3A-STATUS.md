# Phase 3A — Status (On-chain economic engine: launch · trade · graduation · fee-claim · vesting)

**Status:** Implemented + adversarially reviewed (4 reviewers) + fixes applied. **NOT runtime-verified**
(no `node_modules`/network/devnet here — see §Dev-machine gate). **Branch:** `claude/gifted-pascal-fcyskz` · **Date:** 2026-06-24

> Phase 3A is the backend engine. **Phase 3B (mobile UI)** is the remaining piece of Phase 3.

## How it was built (multi-agent: design → synthesize → build → verify → fix)
~30 Opus agents via the Agent tool (the Workflow tool's subagents hit a harness arg bug this session):
5 module designers → 1 synthesis (binding `CONTRACTS-P3A.md`) → P3-foundation + 5 module builders
(non-overlapping files) → 4 adversarial reviewers → 5 fix agents + 2 foundation fixes.

## What shipped
- **P3-foundation:** `TokenFundraise.finalizeStartedAt` + migration `20260625000000`; 6 Zod schemas; webhook
  `raisedBaseUnits`/`contributorCount` increment (deduped to first-BUY-per-wallet); `MOMENTO_LAUNCH/TRADE/CLAIM`
  constants; 8 env flags; `/api/cron/graduate`.
- **P3-launch** (`lib/launch.ts` + `POST /tokens/launch`): Token-2022 mint w/ TransferFeeConfig (born taxed via
  DBC) → DBC createConfig → createPool; server+ephemeral signers; idempotent, taxed-mint-last rollback.
- **P3-trade** (`lib/trade.ts` + detail/buy/sell/submit): venue by status (DBC curve / DAMM v2); `intentId`
  provenance; client-sign relay; verifies client tx matches intent; records **confirmed fill**; rebate computed/recorded.
- **P3-graduation** (`lib/graduation.ts` + `cron/graduate`): authoritative raise recompute; `FINALIZING` lease;
  `migrateToDammV2` (server + 2 NFT signers); **finalize only when both LP legs verify as locked**.
- **P3-feeclaim** (`lib/fee-claim.ts` + cron + admin claim): Token-2022 harvest/withdraw + Meteora partner/creator
  claims; rebate execution re-derived from confirmed fill; 3-layer anti-double-pay; `REBATE_LEGAL_APPROVED` gate.
- **P3-vesting** (`lib/vesting.ts` + create/list/withdraw): Streamflow + Jup-Lock; server/ephemeral primary →
  client-relay fallback; allocation ceiling + recipient validation; Token-2022 net handling.

## Review outcome
4 reviewers: **5 P0 · 26 P1 · 23 P2** (contract review PASS).
- **All 5 P0 fixed:** fee-claim withheld custody gate; fee-claim correct token-program for claim ATAs; rebate
  re-derived from confirmed fill (not the quote); rebate `rebate:<tradeId>` idempotency (no double-pay);
  vesting create constrained (recipient/amount/ceiling/trust model).
- **High-value P1 fixed:** trade↔submit intent binding + confirmed-fill recording; `QUOTE_STALE` price-drift;
  `cpAmm.getQuote` (invented) → pool-state estimate; graduation no-placeholder-in-`@unique` + fail-safe finalize;
  launch `totalSupply` single interpretation + overflow guard; `maximumFee` field; vesting `submit()` label
  compile error; webhook contributorCount dedup; `JUP_LOCK_*` env.
- Findings: `design/phase3/REVIEW-{sdk,correctness,security,contract}.md`.

## ⛔ Standing BLOCKERS — must be resolved on devnet before mainnet
1. **DBC transfer-fee-on-mint** — the Meteora DBC SDK mints the base mint itself; whether
   `dynamic-bonding-curve-sdk@1.5.10` accepts a `TransferFeeConfig` on that mint decides whether the 3–5% tax
   can ride the Meteora rail. Code emits both config shapes + uses verified `maximumFee`, flagged
   `TODO(verify-devnet)`. **If unsupported, the tax architecture must change** (separate mint, or a different rail).
2. **Privy ephemeral co-signer** — graduation/vesting attach an ephemeral Keypair alongside the Privy server
   signer; if `@privy-io/node` strips a pre-attached signature, the server path raises `PARTIAL_SIGN_UNSUPPORTED`
   and vesting falls back to client co-sign. Must confirm which path works on devnet.

## Pre-mainnet checklist (also see each `TODO(verify-devnet)`)
- [ ] **Legal read** before flipping `REBATE_LEGAL_APPROVED=1` (rebate sends move USDC from our vault).
- [ ] Add **`VestingSchedule.tokenProgram`** column (additive) so T2022 vest withdraw/claim work (currently
      fails safely / reverts for T2022 mints — vesting fix flagged `TODO(schema)`).
- [ ] Confirm Meteora/Streamflow/Jup-Lock SDK shapes on devnet: `cpAmm.swap`/pool-state fields, DBC `swapQuote`,
      `migrateToDammV2`, `claim*TradingFee`, `permanentLockPosition`/`isPermanentLockedPosition`, Streamflow
      `prepareWithdraw/Cancel`, Jup-Lock `claimV2`.
- [ ] Trade submit-time **amount/minOut ix-data binding** (currently feePayer/pool/program bound; amount bound
      via confirmed-fill re-derivation — full ix-data decode is `TODO`).
- [ ] **Rebate price source** — USDC sizing uses `trade.priceUsd` (DAS); harden against thin-pool manipulation
      (pool/curve price + sanity band) before enabling rebates.
- [ ] Confirm `protocolFeeBps=2000` vs the deployed Meteora program; CAIP-2 cluster string.

## Dev-machine gate (could not run in-sandbox)
1. `pnpm add` the Phase 3 SDKs: `@meteora-ag/dynamic-bonding-curve-sdk@1.5.10`, `@meteora-ag/cp-amm-sdk@1.4.3`,
   `@streamflow/stream@12.4.0`, `@coral-xyz/anchor`, `@solana/spl-token`, `bn.js`, `@privy-io/node`; then `pnpm install`.
2. `prisma validate` + **`prisma migrate deploy`** (migrations `20260624010000` + `20260625000000`; NEVER `db push` — PostGIS).
3. `tsc --noEmit` + `turbo lint` per app — the static gate I couldn't run; fix any residual type errors
   (esp. the SDK calls flagged `TODO(verify-devnet)` once the real types are present).
4. Devnet end-to-end with `SPIKE_KEYPAIR` + Privy server wallet: launch → buy/sell → threshold → graduate →
   claim → vest, watching the webhook + crons. This is where the two blockers get resolved.

**Next:** Phase 3B — mobile UI (launch wizard, token detail + trade, fundraise progress, vesting view, tax
disclosure) wiring these endpoints, as its own design→build→verify cycle.
