# Momento Solana Migration — Human Validation Work-Items

**Purpose:** Everything a human/team must do to validate and ship the Solana token economy that was built
in code (Phases 1, 2, 3A, 3B + 2 hardening rounds). The agent fleet built and self-reviewed the code but
**could not compile, run, or touch a real cluster.** This is the runbook that closes that gap.

**How to read:** Work the sections **A → G in order**. Each item has a checkbox, the action, and an
**acceptance criterion** (how you know it's done). Priority: 🔴 **BLOCKER** (cannot ship without) ·
🟠 **HIGH** · 🟡 **MED** · ⚪ **TRACK** (non-blocking).

> Companion docs: `PHASE-{2,3A,3B}-STATUS.md`, `PHASE-0-OPS-RUNBOOK.md`, `SECRETS_REMEDIATION.md`,
> `hardening/FINDINGS.md`, `hardening/CRITIC.md`, `hardening/CRITIC-R2.md`, `scripts/spikes/README.md`.

---

## A. Make the build green (dev machine) — 🔴 do this first

The code was written without `node_modules`/network, so it is **not yet compiled**. Nothing below this
section is trustworthy until A passes.

- [ ] 🔴 **Refresh the lockfile + install.** `pnpm install` at the repo root. Phase 1 removed
  `@ethersproject/shims` from `package.json` but not the lockfile — `--frozen-lockfile` CI/EAS builds
  fail until this runs. **Accept:** clean install, lockfile updated.
- [ ] 🔴 **Add the on-chain SDK deps** (api): `@meteora-ag/dynamic-bonding-curve-sdk@1.5.10`,
  `@meteora-ag/cp-amm-sdk@1.4.3`, `@streamflow/stream@12.4.0`, `@coral-xyz/anchor`, `@solana/spl-token`,
  `bn.js`, `@privy-io/node`, and `@upstash/redis` (if not already present). **Accept:** `pnpm ls` shows them.
- [ ] 🟠 **Add the mobile dep:** `pnpm --filter @momento/mobile add @react-native-community/slider`
  (used by `PercentSlider`). **Accept:** installs; launch wizard slider renders.
- [ ] 🔴 **Prisma:** `pnpm --filter @momento/api exec prisma validate` then **`prisma migrate deploy`**
  (applies `20260624010000_add_token_economy` + `20260625000000_add_finalize_started_at`). Then
  `prisma generate`. **NEVER `prisma db push`** — PostGIS geography columns/triggers live outside
  `schema.prisma` and `db push` would drop them. **Accept:** migrate succeeds; `prisma generate` clean.
- [ ] 🔴 **Type-check + lint** the whole monorepo: `pnpm -w exec tsc --noEmit` (per app) + `turbo lint`.
  Expect to fix residual type errors at the `TODO(verify-devnet)` SDK call sites once the real SDK types
  are present (the agents matched the published `.d.ts` from the spikes but couldn't compile). **Accept:**
  `tsc` + `lint` clean across api / mobile / shared / landing.
- [ ] 🟠 **Builds:** `pnpm --filter @momento/api build` (Next) and `expo export` / `expo prebuild` (mobile).
  **Accept:** both build.

---

## B. Devnet validation — 🔴 the two blockers + end-to-end

Spin up a **devnet** environment (Helius devnet RPC, a funded devnet keypair `SPIKE_KEYPAIR`, a Privy
**server wallet**, `SOLANA_NETWORK=devnet`). Then:

### B1. The two architecture blockers (resolve these or the design changes)
- [ ] 🔴 **DBC transfer-fee-on-mint.** Confirm `@meteora-ag/dynamic-bonding-curve-sdk@1.5.10` accepts a
  **Token-2022 `TransferFeeConfig` on the base mint it creates** (`lib/launch.ts` emits both nested + flat
  config shapes under `TODO(verify-devnet)`). Run `scripts/spikes/spike-b-meteora-dbc.ts` on devnet and a
  real launch via `POST /api/tokens/launch`; inspect the minted base mint's extensions (Helius DAS
  `mint_extensions`). **Accept:** the launched mint carries the transfer fee. **If NOT:** the 3–5% tax
  cannot ride DBC — escalate (separate mint + post-init extension, or a different launch rail). This gates
  the entire tax design.
- [ ] 🔴 **Privy ephemeral co-signer.** Confirm `@privy-io/node` **preserves a pre-attached ephemeral
  signature** when the server wallet signs (graduation's 2 position-NFT keypairs; vesting's Streamflow
  `metadata` / Jup-Lock `base`). `lib/solana/applySigners` re-attaches + raises `PARTIAL_SIGN_UNSUPPORTED`;
  vesting then falls back to client co-sign (`signMode:'client'`). **Accept:** either the server path lands
  a multi-signer tx on devnet, OR the client-relay fallback does. Decide the canonical path per surface.

### B2. Spikes (GO/NO-GO)
- [ ] 🟠 Run `scripts/spikes/spike-a-token2022-fee-rebate.ts` — transfer fee + harvest/withdraw + rebate math. **Accept:** GO.
- [ ] 🟠 Run `scripts/spikes/spike-b-meteora-dbc.ts` — DBC create → graduate → claim. **Accept:** GO.
- [ ] 🟠 Run `scripts/spikes/spike-c-vesting-lock.ts` — Streamflow + Jup-Lock (metadata/base co-signer). **Accept:** GO.

### B3. Full end-to-end on devnet
- [ ] 🔴 **Launch:** create a creator token. **Accept:** `CreatorToken` row ACTIVE; DBC config+pool on chain; mint taxed; quote mint = **devnet** USDC (verify `getUsdcMint()` resolved correctly).
- [ ] 🔴 **Trade:** buy + sell via the app flow (build → Privy `signTransaction` → `/submit` → confirm).
  **Accept:** `Trade` row gets `intentId` then `signature`/`blockTime`; webhook classifies IN_APP;
  `TradeStatusSheet` shows PENDING→CONFIRMED correctly (never "CONFIRMED" on a pending submit).
- [ ] 🔴 **Fundraise → graduation:** drive raise to threshold; let the `/api/cron/graduate` keeper run.
  **Accept:** `raisedBaseUnits` tracks confirmed buys; on threshold it migrates to DAMM v2, persists BOTH
  `LpPosition` rows pointing at the **correct base-mint pool**, locks LP, sets `GRADUATED`/`COMPLETED`. Force
  a partial failure and confirm it stays `FINALIZING` and retries (never finalizes on a wrong/unlocked pool).
- [ ] 🟠 **Fee claim:** run `/api/cron/fee-claim` (`FEE_CLAIM_ENABLED=1`). **Accept:** partner+creator
  trading fees + Token-2022 withheld harvested/withdrawn; `FeeEvent` rows with correct `type`/`recipient`;
  no double-claim on a second tick.
- [ ] 🟠 **Vesting:** create (cliff+linear) and, after cliff, withdraw. **Accept:** `VestingSchedule`
  ACTIVE; client calls `/api/vesting/[id]/confirm` so status/`releasedBaseUnits` update; recipient-only
  withdraw enforced; non-recipient gets a friendly 403; zero-claimable is gated.

---

## C. Fund-safety behavioral checks (devnet) — 🟠 verify the hardening holds at runtime

These confirm the round-1/round-2 hardening fixes behave correctly against a live cluster.

- [ ] 🟠 **Idempotency is durable + fail-closed.** Set Upstash env; confirm a server/treasury tx with a
  missing idempotency store **fails closed** (`CONFIG_MISSING`), not a double-broadcast. Replay the same
  `/submit` and confirm dedup (no second on-chain tx).
- [ ] 🔴 **Rebate cannot be double-paid / drained.** With `REBATE_SEND_ENABLED=1` + `REBATE_LEGAL_APPROVED=1`
  on devnet only: force a rebate tx to **land-and-fail** → confirm the reservation is **released** (R-1 fix)
  and the next tick **re-sends** (not marked "paid" against a failed sig). Confirm rebate is sized from the
  **confirmed fill** (not the pre-trade quote) and bounded by the price band + per-trade/per-wallet cap;
  a `price=0` oracle defers the rebate (`rebate-deferred-no-price`) rather than sizing off zero.
- [ ] 🟠 **Webhook rejects forged input.** POST a fabricated event with no real on-chain tx → confirm it is
  **skipped** (on-chain `getTransaction` verify gate), never persisted, never drives a rebate/raise. Verify
  the shared-secret auth (`timingSafeEqual`) + replay window.
- [ ] 🟠 **Authz.** Confirm: per-user **fail-closed** rate limits on launch/trade/vesting (XFF rotation
  doesn't bypass); a user cannot submit another user's trade intent; a non-recipient cannot withdraw a
  vesting; crons reject a missing/!wrong `CRON_SECRET` (constant-time, fail-closed).
- [ ] 🟡 **Server wallet custody.** Confirm fee/withheld claims **skip** (not mis-sign) when the
  authority/owner isn't the Momento server wallet (`needs-custody` deferral).

---

## D. Legal & compliance — 🔴 before any mainnet money movement

- [ ] 🔴 **Legal/regulatory read** on: token issuance, ongoing fee custody (we hold the `feeClaimer`),
  and **rebate disbursement** (USDC sends from our vault). Likely MSB/securities surface. Keep
  `REBATE_LEGAL_APPROVED` **OFF in prod** until sign-off (claims are unaffected; only rebate *sends* gate on it).
  **Accept:** written legal sign-off filed; gate flipped intentionally.

---

## E. Mainnet ops & go-live (Phase 0) — 🟠 see `PHASE-0-OPS-RUNBOOK.md`

- [ ] 🔴 **Rotate the committed secrets** (`SECRETS_REMEDIATION.md`): Supabase service-role, DB password,
  Privy app secret, Veriff keys, Upstash token, Helius key. Move to Vercel/EAS env; add `.gitignore` entries.
  **Accept:** new keys live, old keys revoked.
- [ ] 🟠 **MoonPay onramp:** enable the MoonPay Fiat On-Ramp plugin in the Privy dashboard; set
  `SOLANA_NETWORK=mainnet-beta`; verify "Buy USDC" settles in a **native** build. **Accept:** real USDC lands.
- [ ] 🟠 **Fix the 0%-fee bug:** reconcile the canonical fee wallet (hardcoded `5U29…` vs `MOMENTO_FEE_WALLET`)
  and run `scripts/create-fee-atas.ts` on **mainnet**. **Accept:** a test swap routes the platform fee (non-zero).
- [ ] 🔴 **Provision the Privy server wallet** and set every new env var (`PRIVY_AUTHORIZATION_KEY`,
  `PRIVY_SERVER_WALLET_ID`, `MOMENTO_REBATE_USDC_VAULT`, `MOMENTO_LP_FEE_CLAIMER`, `HELIUS_WEBHOOK_SECRET`,
  cron secrets, the `*_ENABLED` flags, `USDC_MINT` override if needed). **Accept:** backend signs+lands a memo
  tx via the server wallet.
- [ ] 🟠 **Register the Helius webhook** for the token mints / fee accounts → `/api/webhooks/helius`.
  **Accept:** a real transfer shows up as a `FeeEvent`/`Trade`.
- [ ] 🟡 Confirm `protocolFeeBps=2000` matches the deployed Meteora program; confirm the CAIP-2 cluster string.

---

## F. Mobile manual QA — 🟠 on device / simulator

- [ ] 🟠 Launch wizard end-to-end (6 steps; LP percentages sum to 100; fee/tax disclosure accurate ~1% vs ~4%).
- [ ] 🟠 Token detail + buy/sell: slippage control works; MAX floors correctly; PENDING vs CONFIRMED states;
  RETRY rebuilds a fresh tx; the old "Coming Soon"/`$0.004` placeholder is gone.
- [ ] 🟠 Vesting: list shows correct amounts at the token's real decimals; withdraw gates zero-claimable +
  403; confirm call updates status.
- [ ] 🟡 Design-system fidelity pass against `docs/design/` (black/green, all-caps mono, brand display font on hero).

---

## G. Known deferred / future hardening — ⚪ track (non-blocking)

- [ ] ⚪ **`VestingSchedule.tokenProgram` durable column** (additive migration). Today the withdraw/confirm
  path resolves the token program via a `CreatorToken.tokenProgram` lookup (works); the column avoids the join.
- [ ] ⚪ **Signing P1-D:** the client-relay `idempotencyKey` blob (`lvbh`/`pf`) is unauthenticated — worst
  case is a wrong confirmation window / mis-reported telemetry (never moves funds). HMAC it if desired.
- [ ] ⚪ **`contributorCount` concurrency:** two same-wallet first-buys in concurrent txns can +1 over-count
  (cached display only; `graduation.getRaisedProgress` recomputes the authoritative distinct count).
- [ ] ⚪ **Rebate price oracle:** currently pool/fill-implied median + deviation band; consider a dedicated
  TWAP/oracle before high-volume mainnet rebates.
- [ ] ⚪ **Test harness:** `apps/api` has no test runner; add one and backfill tests for the rebate/claim/
  graduation idempotency paths (the highest-risk fund logic).

---

### Sign-off
Migration is **ready for production** when **A, B, C, D, E** are fully checked and **F** has no open
🔴/🟠. **G** can trail into post-launch hardening.
