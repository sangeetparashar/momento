# Agent Handoff: Momento — Ethereum/Base → Solana Token-Economy Migration
> Generated: 2026-06-28
> Session focus: Built the entire Solana token economy (Phases 1–3B), ran 2 adversarial hardening rounds, and a compile/build gate. Code-complete + type-checked; **nothing has run on a real cluster yet.**

## 0. ⚠️ READ THIS FIRST — repo state
- The work lives on branch **`claude/gifted-pascal-fcyskz`** (GitHub `sangeetparashar/momento`). Local clone: `/Users/sangeet/personal/momento`.
- **`main` (after PR #8) is MISSING the last 2 commits** — `9f3cbad` (api build-gate fixes + pinned SDK deps + lockfile) and `7126a15` (mobile slider dep + 2 vesting-hook type fixes). PR #8 merged at `d653d06`, *before* these.
- **ACTION 1 (do before anything):** merge `claude/gifted-pascal-fcyskz` into `main` again (or cherry-pick `9f3cbad 7126a15`). Without them, `tsc`/`next build` on `main` **fails** on the `graduate/route.ts` parse bug and the SDK deps won't be in `package.json`.
- Then on local: `git checkout main && git pull`.

## 1. Project Overview
Momento is a **Solana-only** location-based creator platform. The new economy lets creators **launch a Token-2022 token** (with a transfer fee), **trade it in-app**, **fundraise to a threshold then graduate to a real AMM pool**, **claim trading fees**, and **vest allocations**. Monorepo (pnpm 10.30 + turbo): `apps/api` (Next.js App Router + Prisma/Postgres+PostGIS), `apps/mobile` (Expo RN), `apps/landing` (Next.js), `packages/shared`. Stack: `@solana/web3.js` **v1** (not kit/v2), Privy (auth + embedded + server wallets), Helius (RPC/DAS/webhooks/Sender), Meteora (DBC + DAMM v2), Streamflow + Jupiter Lock, Token-2022.

## 2. Current State

### Working (in code, type-checked — NOT runtime-verified)
- **Phase 1 — EVM/Base removal**: fully Solana-only. Grep-gate clean.
- **Phase 2 — backend foundation**: data model (8 models), `apps/api/lib/solana/*` (Privy server signing + submit pipeline + multi-signer + durable Redis idempotency, fail-closed), `lib/fees.ts`, `lib/helius-webhook.ts` (on-chain-verified ingestion), summary endpoints.
- **Phase 3A — on-chain engine**: `lib/launch.ts`, `lib/trade.ts`, `lib/graduation.ts`, `lib/fee-claim.ts`, `lib/vesting.ts` + all routes.
- **Phase 3B — mobile UI**: launch wizard, token detail + trade, vesting, fee/tax disclosure.
- **2 hardening rounds**: every found P0 fixed + re-verified by an independent critic (incl. a regression the fix-phase introduced).
- **Build gate** (run in this session): `packages/shared` tsc ✅ clean; `apps/api` tsc ✅ **zero real errors** (65 remaining are 100% Prisma-not-generated — see §5); `apps/mobile` tsc ✅ all Phase-3B files clean.

### Not Yet Working / Unverified — the real remaining work
- **NOTHING has executed on a real cluster.** Zero on-chain runs (devnet or mainnet).
- **Two devnet BLOCKERS unresolved** (existential — see §5): (a) does Meteora DBC let the mint *it* creates carry our Token-2022 transfer fee; (b) does `@privy-io/node` preserve a pre-attached ephemeral signature.
- `prisma generate` was **not run here** (egress-blocked in the cloud sandbox; works locally) → the 65 api tsc errors are only cleared on a real machine.
- **Legal gate** `REBATE_LEGAL_APPROVED` is OFF (must stay off until a legal read on rebate disbursement).
- **Phase 0 ops not done**: rotate committed secrets, enable MoonPay plugin, flip mainnet, create mainnet fee ATAs, provision the Privy server wallet.

## 3. What Was Done This Session (high level — full trail in commit history + docs)
1. **Discovery + research** — 16 reports in `docs/solana-migration/research/01..16-*.md` (codebase audit + Meteora/Bags/Streamflow/MoonPay/tax/LP research). Decided the architecture.
2. **3 devnet spikes** — `scripts/spikes/spike-a/b/c-*.ts` (Token-2022 fee+rebate, Meteora DBC, Streamflow/JupLock) — verified the exact SDK signatures the code reuses.
3. **Phase 1** EVM removal (commit `3f00f5e`).
4. **Phase 2/3A/3B** built via design → binding-contract → partitioned-build → 4-reviewer adversarial verify → fix. Contracts in `docs/solana-migration/design/phase{2,3,3b}/CONTRACTS*.md`; reviews in `…/REVIEW-*.md`.
5. **2 hardening rounds** (`docs/solana-migration/hardening/`): audit → triage → module-fix → critic. Round-2 fixed a regression round-1 introduced.
6. **Validation runbook** `VALIDATION-WORKITEMS.{md,html}` — the human checklist (37 items, prioritized).
7. **Build gate** (commits `9f3cbad`, `7126a15`): fixed 2 real compile-breakers, pinned SDK deps, refreshed lockfile, fixed mobile vesting-hook types.

## 4. Key Decisions & Rationale

| Decision | Why | Alternatives considered |
|---|---|---|
| **Meteora DBC → DAMM v2, Momento as Partner/feeClaimer** | Keeps ~80% of fees with creator+platform (Meteora takes flat 20%); only rail exposing all LP-split knobs | Bags (just a DBC front-end, keeps ~50%); pump.fun (no partner economics); Raydium |
| **Token-2022 Transfer Fee (3–5%), NOT a transfer hook** | Transfer-fee is supported permissionlessly across DBC/DAMM/DLMM; hooks break composability + DEX listing | Hook-based "walled garden" (rejected); flat fee only |
| **In-app rebate to ~1%, paid in USDC** | Rebating in the token re-incurs the transfer fee (verified spike-a); USDC is fee-exempt + dollar-native | Gross-up in-token (documented fallback) |
| **USDC quote everywhere** | Aligns with the MoonPay onramp; dollar accounting | SOL quote |
| **Privy server wallets (`@privy-io/node`) for platform actions; client-sign + backend self-submit (Helius) for user actions** | No server signing existed; Privy server API has no custom-RPC field so we self-submit | Fully client-signed (can't do platform mint/claim) |
| **`@solana/web3.js` v1** | Meteora/Streamflow/Privy SDKs are all v1; v2/kit would strand us | `@solana/kit` (rejected for now) |
| **Idempotency = durable Upstash Redis, fail-closed for treasury txns** | Serverless double-broadcast risk; in-process Map is unsafe across instances | Per-process Map (dev/test only) |
| **`REBATE_LEGAL_APPROVED` + `REBATE_SEND_ENABLED` double-gate, OFF in prod** | Rebate sends move USDC from our vault → MSB/securities surface | — |
| **Design → binding CONTRACTS.md → partitioned build → adversarial verify → fix** | Prevents cross-module drift + catches fund bugs before they ship | Ad-hoc building |

## 5. Bugs, Failures & Lessons Learned (highest-value section)
- **Meteora DBC mints the base mint ITSELF** (`baseMint = Keypair.generate()` is a required signer — confirmed in `spike-b`). Therefore the Token-2022 TransferFeeConfig must be attached at **DBC config/createPool time**, not pre-minted. `lib/launch.ts` does this (Path A) and emits **both** nested + flat config shapes under `TODO(verify-devnet)`. **If `dynamic-bonding-curve-sdk@1.5.10` ignores transfer-fee fields, the entire tax design must change** (separate mint + different rail). → **Blocker #1.**
- **Privy ephemeral co-signer is unproven.** Graduation (2 position-NFT keypairs) and vesting (Streamflow `metadata` / JupLock `base`) attach an ephemeral signer alongside the Privy server signer. `lib/solana/applySigners` re-attaches the ephemeral sig after the server sign and raises `PARTIAL_SIGN_UNSUPPORTED`; vesting falls back to client co-sign. **Must devnet-verify whether `@privy-io/node` preserves a pre-attached signature.** → **Blocker #2.**
- **`prisma generate` engine download is egress-blocked in the cloud sandbox** (`binaries.prisma.sh` not on the allowlist; `ECONNRESET`). It works on a normal network. So the 65 remaining `apps/api` tsc errors (TS2305 `Prisma`/model imports, TS2339 on `{}`-typed `findUnique` results, TS7006 on `$transaction`/`.map` callbacks) are **all Prisma-not-generated and vanish on local `prisma generate`** — they are NOT real bugs (they appear in untouched pre-existing files too).
- **`graduate/route.ts` had a parse-aborting bug only `tsc` caught**: a JSDoc comment contained the cron literal `` `*/5 * * * *` `` — the `*/` **closed the block comment early** → unterminated template literal. Fixed by rewording. **Lesson: never put a cron expression containing `*/` inside a block comment.**
- **`onramp/route.ts:225` referenced `chain`** (removed in Phase 1) → `buildTransakDirectUrl(walletAddress, chain)`. Fixed. **Lesson: Phase-1 de-branching can leave dangling identifiers that only `tsc` surfaces.**
- **The Workflow tool's subagents failed once mid-session** (all tool args arrived `undefined` — a harness bug), wasting a full run. It worked later. **Lesson: before relying on the Workflow tool, run a 1-agent probe** (it recovered for Phases 3B + hardening).
- **Rebate integrity (caught by hardening, do not regress):** rebate must be re-derived from the **confirmed on-chain fill** (not the pre-trade quote), use a stable `rebate:<tradeId>` idempotency key, **reserve-before-send**, and the submit `finally` must **release** the reservation on a *known-failed* (`SIMULATION_FAILED`) tx but only `put()` the sig on status-unknown (TIMEOUT/blockhash). A round-1 fix got this wrong (recorded a failed sig → bricked retries); round-2 fixed it.
- **Graduation must never finalize on an unverified pool**: round-1 had it resolving `positions[0]` of the shared server wallet (wrong pool). Fixed to base-mint-filter + fail-closed (stays `FINALIZING` + retries).
- **NEVER `prisma db push`** — PostGIS geography columns/triggers live outside `schema.prisma` and would be dropped. Use `prisma migrate deploy`.
- **Money is always BigInt + base-unit strings.** Don't do `float × 10^decimals` (precision loss). The webhook raise counter uses atomic `$executeRaw` (String column, Prisma `increment` is numeric-only).
- **`main` was merged before the 2 build-fix commits** — see §0.

## 6. Codebase Map (only what the next agent will touch)
```
docs/solana-migration/
├── README.md                      — master architecture map (START HERE)
├── VALIDATION-WORKITEMS.{md,html} — THE remaining-work checklist (open the .html)
├── PHASE-{2,3A,3B}-STATUS.md      — per-phase what-shipped + dev-machine gate
├── PHASE-0-OPS-RUNBOOK.md         — mainnet ops (secrets, MoonPay, fee ATAs, server wallet)
├── SECRETS_REMEDIATION.md         — which committed secrets to rotate
├── AGENT-HANDOFF.md               — this file
├── research/01..16-*.md           — discovery + SDK research (reference)
├── design/phase{2,3,3b}/CONTRACTS*.md — BINDING interface/model/endpoint contracts
├── design/**/REVIEW-*.md          — adversarial review trail
└── hardening/{audit-*,FINDINGS,CRITIC,CRITIC-R2}.md — hardening trail
scripts/spikes/spike-a|b|c-*.ts    — VERIFIED SDK signatures (reuse, don't invent) + README.md
apps/api/
├── prisma/schema.prisma + migrations/2026062{3,4,5}_* — data model (additive; never db push)
├── lib/solana/*.ts                — signing/submit/idempotency/multi-signer (foundation)
├── lib/{fees,helius-webhook,launch,trade,graduation,fee-claim,vesting}.ts — the engine
├── lib/validation.ts, lib/constants? (see packages/shared/src/constants.ts MOMENTO_* + getUsdcMint())
└── app/api/{tokens/launch, tokens/[mint](+buy/sell/submit), creators/[id]/fees(+claim),
            cron/{graduate,fee-claim}, vesting/*, webhooks/helius}/route.ts
apps/mobile/src/
├── services/tokenApi(.types).ts, utils/{tokenAmount,solanaTx}.ts, hooks/useClientSignSubmit.ts + 11 hooks
├── app/{launch/*, token/[mint](+/trade), vesting(+/create)}.tsx
└── components/features/{TradePanel,TradeStatusSheet,Vesting*,Launch*}, composites/{FeeDisclosure,FundraiseProgress,...}
```

## 7. Remaining Work (ordered — the VALIDATION-WORKITEMS runbook is the authoritative list)

### High Priority (do in order)
- [ ] **Get the 2 build-fix commits onto `main`** (§0) — merge the branch or cherry-pick `9f3cbad 7126a15`.
- [ ] **Section A — green local build**: `pnpm install` → `prisma generate` (clears the 65 api errors) → `prisma migrate deploy` (NOT db push) → `tsc`/`turbo lint`. Restore secrets from the vault + add the new env vars from `apps/api/.env.local.example`.
- [ ] **Section B1 — the two devnet blockers** (Helius devnet RPC + funded keypair + Privy server wallet): verify DBC transfer-fee-on-mint and Privy ephemeral co-sign. These can change the architecture — have contingencies ready (separate-mint launch; client-relay-only signing).
- [ ] **Section B2/B3 — spikes + full e2e on devnet**: launch → trade → fundraise → graduate → claim → vest, watching the webhook + crons.

### Medium Priority
- [ ] **Section C** — fund-safety behavioral checks (idempotency fail-closed, rebate no-double-pay/drain, webhook forgery rejection, authz, custody).
- [ ] **Section D** — legal read; keep `REBATE_LEGAL_APPROVED` off until signed.
- [ ] **Section E** — Phase 0 ops (rotate secrets, MoonPay plugin, mainnet flip, fee ATAs, server wallet, webhook registration).
- [ ] **Section F** — mobile manual QA on device.

### Low Priority / Track (non-blocking — `VALIDATION-WORKITEMS.md` §G)
- [ ] Add a **test harness** to `apps/api` (none exists) + backfill rebate/claim/graduation idempotency tests — the highest-risk fund logic, currently unexercised.
- [ ] `VestingSchedule.tokenProgram` durable column (interim CreatorToken lookup works); HMAC the client-relay idempotency blob; `contributorCount` concurrency; rebate TWAP oracle.
- [ ] 5 pre-existing mobile tsc errors (`_layout`, `explore`, `profile` wallet-balance, `creator` kycStatus, `useKyc`) — advisory, Metro doesn't type-check.

## 8. Environment & Setup Notes
- **Toolchain:** node 22, pnpm 10.30. `packageManager: pnpm@10.30.0`.
- **Install:** `pnpm install` (SDK deps now pinned in `apps/api`/`apps/mobile` package.json — no manual `pnpm add` needed). Then `prisma generate` + `prisma migrate deploy` (migrations `20260623120000`, `20260624010000`, `20260625000000`). **Never `prisma db push`** (PostGIS).
- **Secrets:** not in the repo. Restore from `sangeetparashar/momento-secrets-vault` (README has the openssl decrypt). Add the new token-economy env from `apps/api/.env.local.example` (server wallet, `HELIUS_WEBHOOK_SECRET`, `*_ENABLED` flags, `USDC_MINT` override for devnet, `MOMENTO_REBATE_USDC_VAULT`, `MOMENTO_LP_FEE_CLAIMER`, cron secrets). These are dev keys.
- **Devnet vs mainnet USDC:** `MOMENTO_FEE.USDC_MINT` (packages/shared) is **mainnet**; `getUsdcMint()` resolves per `SOLANA_NETWORK` — consumers (launch/trade/fee-claim) already call it. Set `SOLANA_NETWORK=devnet` + a devnet USDC for devnet runs.
- **Run:** `pnpm dev` (api+landing). Mobile: `expo` / native build for Privy MoonPay (not Expo Go).
- **Gotcha:** Metro/Expo bundles via Babel (no type-check), so mobile runs despite tsc errors; Next *does* gate on tsc (no `ignoreBuildErrors` in `next.config.js`).

## 9. Reference Links
- Master map: `docs/solana-migration/README.md`. Runbook: `docs/solana-migration/VALIDATION-WORKITEMS.html`.
- Binding contracts: `docs/solana-migration/design/phase{2,3,3b}/CONTRACTS*.md`.
- Verified SDK usage: `scripts/spikes/{spike-a,spike-b,spike-c}-*.ts` + `scripts/spikes/README.md`.
- Hardening trail: `docs/solana-migration/hardening/{FINDINGS,CRITIC,CRITIC-R2}.md`.
- PR: `sangeetparashar/momento` #8 (merged at `d653d06`; needs `9f3cbad`+`7126a15` too).
- Meteora docs (DBC + DAMM v2), Streamflow `@streamflow/stream` v12.4.0, Jupiter Lock, Helius (DAS/Sender/priority-fee), Privy `@privy-io/node`.
