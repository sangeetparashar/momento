# Phase 2 — Status (Foundation: data model + signing + fee accounting)

**Status:** Implemented + adversarially reviewed + fixes applied. **NOT yet runtime-verified**
(no `node_modules`/network/devnet in the build sandbox — see §Dev-machine gate).
**Branch:** `claude/gifted-pascal-fcyskz` · **Date:** 2026-06-24

> Phase 2 = the **foundation** the token economy is built on. Real Meteora/Streamflow on-chain CPIs are
> Phase 3 and exist here only as typed `TODO(Phase 3/4)` seams.

## How it was built (multi-agent, design→build→verify)
Workflow tool's subagents hit a harness arg-marshalling bug this session, so the whole pipeline ran on the
**Agent tool** instead (same structure): 4 design agents → 1 synthesis (binding `CONTRACTS.md`) → 3 implementers
(T-foundation / T-signer / T-fees, non-overlapping files) → 4 adversarial reviewers → 2 fix agents → 1 manual fix.

## What shipped
- **Data model** (`prisma/schema.prisma` + migration `20260624010000_add_token_economy`): 10 enums, 7 new
  models (`TokenFeeConfig`, `Trade`, `FeeEvent`, `TokenFundraise`, `FundraiseContribution`, `LpPosition`,
  `VestingSchedule`) + extended `CreatorToken`/`User`. Schema↔migration verified field-for-field.
- **Shared types/constants** (`packages/shared`): mirrored TS enums/interfaces + `MOMENTO_FEE` block.
- **Signing layer** (`apps/api/lib/solana/*`, 10 files): Privy server-wallet abstraction, build→priority-fee
  →(optional Jito tip)→sign→self-submit→confirm pipeline, multi-signer support, durable Redis idempotency,
  client-relay path. Import-safe with a `STUB_SOLANA_SIGNER` seam.
- **Fee accounting** (`lib/fees.ts`, `lib/helius-webhook.ts`): spike-a rebate math, 20/80 attribution,
  on-chain-verified Helius webhook ingestion, Trade/FeeEvent read-model summaries.
- **Endpoints:** `POST /api/webhooks/helius`; `GET /api/tokens/[mint]/{trades,fees}`;
  `GET /api/creators/[id]/fees`; `GET /api/cron/fee-claim` (scaffold).

## Review outcome
Totals across 4 reviewers: **2 P0 · 21 P1 · 19 P2.** Contract review: PASS.
- **Both P0 fixed:** (1) webhook now verifies every event **on-chain** and derives amounts from confirmed
  tx meta (unverified events never feed money); (2) idempotency store is **durable Redis**, **fail-closed**
  for treasury txns (no per-process Map fallback).
- **High-value P1 fixed:** ephemeral-signature re-attach + verify; cron **fail-closed** on missing
  `CRON_SECRET`; integer money-math (no `float×10^dec`); `rebateToUsdc` bigint; replay window + transactional
  batch + payload caps; param validation; `lastValidBlockHeight`/priority-fee telemetry; swqos tip floor;
  removed auth-token preview logging (`lib/auth.ts:41`).
- Full findings: `design/phase2/REVIEW-{correctness,sdk,security,contract}.md`.

## Deferred (intentional)
- **Privy ephemeral co-sig preservation** — defensive re-attach is in place, but whether `@privy-io/node`
  preserves a pre-attached ephemeral signature **must be devnet-verified before vesting (Phase 3) ships**
  (`signer.ts` TODO(verify-devnet)). Fallback: route co-signed txns through the client wallet.
- **`getIdempotencyStore(): … | null`** — minor documented drift from CONTRACTS §b.8, required for fail-closed
  (not in the public barrel).
- **Fee-summary leg key** (`PLATFORM` vs `PARTNER_TRADING_FEE`) — reconcile when Phase 3 writes LP-fee rows
  (reads 0 today, no live impact).
- **Real Meteora/Streamflow CPIs + rebate execution** — Phase 3/4 (`cron/fee-claim` seams).

## Dev-machine gate (MUST run before relying on Phase 2 — could not run in-sandbox)
1. `pnpm install` — also refreshes the lockfile (Phase 1 dropped `@ethersproject/shims`); add new deps
   when wiring live Privy: `@privy-io/node`, `@solana/spl-token`, `@upstash/redis` (if not present).
2. `pnpm --filter @momento/api exec prisma validate` then **`prisma migrate deploy`** (NEVER `db push` —
   PostGIS). Then `prisma generate`.
3. `pnpm -w exec tsc --noEmit` (per-app) + `pnpm lint` — the static completeness gate I couldn't run.
4. Devnet smoke: set `SPIKE_KEYPAIR` + Helius devnet RPC; run the 3 spikes (`scripts/spikes/README.md`);
   then smoke the webhook (`verifyOnChain`) and a `STUB_SOLANA_SIGNER=1` submit.
5. Provision the Privy **server wallet** + set the new env vars (see `.env.local.example`), then verify a
   real server-signed memo tx lands via Helius.

## Open product/ops decisions (from design)
Privy ephemeral co-sig (devnet); confirm Meteora `protocolFeeBps=2000` vs deployed program; devnet vs mainnet
USDC mint (constant is mainnet — override via env on devnet); **legal read before any rebate execution (Phase 4)**.

**Next:** Phase 3 — token launch + trading + rebate execution + fundraise/graduation + vesting + mobile UI,
built on this foundation as another design→build→verify cycle.
