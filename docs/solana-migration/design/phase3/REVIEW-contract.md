# REVIEW-contract — Phase 3A Contract-Completeness & Scope Review

> Adversarial review of the Phase 3A implementation against the BINDING contract
> `CONTRACTS-P3A.md` (§b interfaces, §c file manifest, §d/§e endpoint shapes, §f
> cross-module contracts, §g env/constants) + `SPEC-P3A.md` open questions, cross-
> checked against the five per-module design docs (`D-*.md`).
> Method: read every Phase-3A file (6 libs, 11 routes, foundation shared edits),
> verified per-commit file ownership, and traced the cross-module data contracts.
> **No code was modified.**

**Verdict: PASS** (with 3 P2 cleanups; 0 P0, 0 P1).

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 3 |

The implementation faithfully realizes the binding contract. Every file in the §c
manifest exists; file ownership is partitioned exactly as specified (verified
commit-by-commit — no file appears under two tasks); the single additive migration
is correct; all five lib interfaces conform to §b; all eleven endpoints conform to
§d/§e; the on-chain CPIs ARE implemented (this is Phase 3); Phase-3B mobile UI is
correctly absent; the REBATE legal gate and creator-claim signer deferral are
present. Findings below are type-label/consistency cleanups, none blocking.

---

## 1. File manifest (§c) — PASS

Per-commit verification (`git show --name-status`):

| Task | Files | Status |
|---|---|---|
| P3-foundation (`b267e06`) | schema.prisma, migration, validation.ts, helius-webhook.ts, constants.ts, .env.local.example, vercel.json | ✅ all present, EDIT/CREATE as specified |
| P3-launch (`08ae169`) | lib/launch.ts, tokens/launch/route.ts | ✅ |
| P3-trade (`9d2796b`) | lib/trade.ts + 5 routes (detail, buy, sell, buy/submit, sell/submit) | ✅ |
| P3-graduation (`6d37fbd`) | lib/graduation.ts, cron/graduate/route.ts | ✅ |
| P3-feeclaim (`dede8c3`) | lib/fee-claim.ts, creators/[id]/fees/claim/route.ts, M cron/fee-claim/route.ts | ✅ |
| P3-vesting (`f2f0322`) | lib/vesting.ts + 3 routes (create, list, [id]/withdraw) | ✅ |

- **No file owned by two tasks.** The four formerly-contended files
  (validation.ts, helius-webhook.ts, schema.prisma+migration, shared+vercel.json)
  are all and only in `b267e06` (P3-foundation). `cron/fee-claim/route.ts` is
  modified solely by `dede8c3` (P3-feeclaim). Confirmed.
- **Nothing extra / out-of-scope.** No mobile UI (Phase 3B), no Phase-2 file
  mutated outside foundation. `getRpcUrl`/`getNetwork` consumed by vesting are
  pre-existing Phase-2 exports (`6abf561`), NOT added here.
- **Foundation shared edits all present & correct:**
  - schema.prisma diff = exactly one line (`finalizeStartedAt DateTime?`).
  - migration SQL is additive/nullable (see §6.1 for the one nit).
  - all six §e Zod schemas exported, Phase-2 schemas kept.
  - webhook increment is inside the existing per-event `$transaction`, gated on
    `legInsert.count === 1` (dedupe-safe), additive (string-bigint add for
    `raisedBaseUnits`, atomic `increment` for `contributorCount`), and a no-op
    for no-fundraise/terminal tokens. Verify/parse/classify untouched.
  - constants block (`MOMENTO_LAUNCH`/`MOMENTO_TRADE`/`MOMENTO_CLAIM`) verbatim
    per §g.2; `MOMENTO_FEE` kept.
  - all eight new env vars present in `.env.local.example` with the documented
    defaults; vercel cron `/api/cron/graduate` at `*/5 * * * *` added,
    fee-claim cron retained.

---

## 2. Interface conformance (§b) — PASS

- **launch.ts (§b.1):** `LaunchTokenInput`/`LaunchResult`/`LaunchContext`,
  `launchCreatorToken`, `buildCreateConfigTx`, `buildCreatePoolTx` — names,
  params, return types match exactly.
- **trade.ts (§b.2):** `TradeVenue`, `ResolvedToken`, `QuoteInput`, `TradeQuote`,
  `BuildTradeInput`, `BuiltTrade`, `SubmitTradeInput`, `SubmitTradeResult`,
  `TokenDetail`, `TradeError`/`TradeErrorCode`, and all five functions — exact
  match.
- **graduation.ts (§b.3):** `RaisedProgress`, `GraduationResult`,
  `getRaisedProgress`, `detectThresholdMet`, `graduateToken`,
  `runGraduationSweep` — exact match.
- **fee-claim.ts (§b.4):** `ClaimResult`, `RebateResult`, `claimTokenFees`,
  `runClaimSweep`, `payRebate`, `runRebateSweep` — exact match.
- **vesting.ts (§b.5):** `VestingKind`, `VestingPlan`, all builders + withdraw/
  cancel/state — signatures match. `VestingCreateInput` carries two EXTRA optional
  fields (`transferFeeBps?`, `isToken2022?`) beyond the contract — see §5
  (ACCEPTABLE; §b explicitly permits intentional optional-field extensions).

---

## 3. Endpoint conformance (§d/§e) — PASS

All eleven endpoints verified against §d for envelope, fields, status codes, auth
class, and limiter:

| Endpoint | Auth | Limiter | Shape | Verdict |
|---|---|---|---|---|
| POST /tokens/launch | requireCreator | writeLimiter | LaunchResult; DUPLICATE→200, SIM→400, INSUFFICIENT→402, TIMEOUT/BLOCKHASH→202, one-token→409 | ✅ |
| GET /tokens/[mint] | public | readLimiter | TokenDetail; 400 invalid mint, 404 not found | ✅ |
| POST /tokens/[mint]/{buy,sell} | requireAuth | swapLimiter | {intentId, transaction, idempotencyKey, venue, quote{…}}; wallet gate 400 | ✅ |
| POST /tokens/[mint]/{buy,sell}/submit | requireAuth | swapLimiter | SubmitTradeResult; non-owner→403, deduped | ✅ |
| GET /cron/graduate | CRON_SECRET (constant-time, fail-closed) | none | {detected,finalized,retried,failed} | ✅ |
| POST /creators/[id]/fees/claim | requireAdmin | none | ClaimResult\|ClaimResult[]; isValidUuid; audit row; DUPLICATE→200 | ✅ |
| POST /vesting/create | requireCreator | writeLimiter | signMode discriminator + transaction/createSignature | ✅ |
| GET /vesting/list | requireAuth | readLimiter | per-row live getVestingState; role/mint filters | ✅ |
| POST /vesting/[id]/withdraw | requireAuth (recipient) | writeLimiter | {transaction, claimableBase}; 403 non-beneficiary; 400 "Nothing to withdraw" | ✅ |

Order (`applyRateLimit → auth → mint/uuid guard → validateBody → work → envelope`,
`catch` re-throws `Response` else maps code) is honored in every route. Buy/sell
submit routes translate the wire field `transaction` → lib `txBase64`, and map the
lib's `WALLET_NOT_READY` (non-owner) → 403 per §d.4. The buy quote wire keys
(`expectedOutBase`/`minOutBase`/`feeBase`/`inAppRebateBase`/`effectiveFeeBps`)
match §d.3 exactly.

---

## 4. Phase / scope boundary — PASS

- **On-chain CPIs ARE implemented (correct for Phase 3):** launch
  `partner.createConfig`+`creator.createPool`; trade `pool.swap`/`cpAmm.swap`;
  graduation `migration.migrateToDammV2` + perma-lock; fee-claim
  `claimPartnerTradingFee`/`claimCreatorTradingFee`/`cpAmm.claimPositionFee` +
  Token-2022 harvest/withdraw + SPL rebate transfer; vesting Streamflow
  `prepareCreateInstructions` + Jupiter Lock `createVestingEscrowV2`.
- **Later-phase work correctly ABSENT:** no mobile UI (Phase 3B), no client-side
  signing UI; the two-call build→submit leaves the device-signing to the mobile
  layer as designed.
- **REBATE legal gate present (§9.5):** `cron/fee-claim` runs `runRebateSweep`
  ONLY when `REBATE_SEND_ENABLED === '1' && REBATE_LEGAL_APPROVED === '1'`
  (double-gated, both default OFF). ✅
- **Creator-claim signer deferral present (§9.4):** `buildCreatorTradingFeeClaim`
  and `buildLpFeeClaim` server-sign ONLY when the creator/owner wallet ==
  server wallet; otherwise return `{skip:'…needs-client-relay'}` instead of
  broadcasting an unsigned creator claim. ✅
- **poolCreator deferral present (§9.3):** launch defaults `poolCreator=treasury`
  (fully server-signed); the creator-as-poolCreator client-relay alt is a
  documented TODO, not shipped — acceptable per §9.3 ("Default = treasury").

---

## 5. Documented deviations — each judged

| # | Deviation | Reporter | Verdict | Reasoning |
|---|---|---|---|---|
| D1 | `LpPosition.createSignature` recorded on PARTNER row only; CREATOR row leaves it null (contract said "same createSignature" on both) | graduation | **ACCEPTABLE** | `createSignature` is `@unique` in the committed schema; both rows cannot carry the same value. The authoritative migrate sig lives on `TokenFundraise.finalizeSignature` (also `@unique`). Idempotency + one-tx-creates-both semantics preserved. Clearly documented in `persistLpPositions`. |
| D2 | `attribute2080()` NOT used for trading-fee legs | fee-claim | **ACCEPTABLE** | Implementation issues SEPARATE per-recipient CPIs (`claimPartnerTradingFee` / `claimCreatorTradingFee`), so each claim returns only that recipient's leg; an 80/20 re-split would be incorrect. The builder's reasoning ("the amount IS the leg amount") is sound. (But see P2-2 for the LP-leg type label.) |
| D3 | `VestingCreateInput` extra optional fields `transferFeeBps?`, `isToken2022?` | vesting | **ACCEPTABLE** | §b explicitly allows intentional optional-field extensions. Both drive the §6 Token-2022 net-deposit / ATA-program logic; the route populates them from the resolved `CreatorToken`. No wire/schema change. |
| D4 | `poolCreator = treasury` (not human creator) | launch | **ACCEPTABLE** | Matches §9.3 / D-launch §3 step 4 default (platform-action, fully server-signed). Human creator recorded via `TokenFeeConfig.creatorFeeWallet`. |
| D5 | USD price via direct Helius DAS `getAsset` fetch (local), degrades to 0 | trade | **ACCEPTABLE** | Display + rebate-snapshot only; `rebateToUsdc` treats price≤0 as 0 so a missing oracle never blocks a quote. Flagged `TODO(verify-devnet)` for devnet DAS price_info. |
| D6 | TransferFeeConfig attached via BOTH nested + flat field shapes (Path-A guess) | launch | **ACCEPTABLE (with the §9.2 BLOCKER caveat)** | The field names are unverifiable offline; the "never silently drop" both-shape approach is the right hedge and is loudly flagged as the §9.2 mainnet-gating blocker. Not a contract violation. |
| D7 | Launch fully server-signed (no client-relay alt path shipped); `/launch` returns landed sigs not `{transaction,…}` | launch | **ACCEPTABLE** | §d.1 default IS the server-signed shape; the `{transaction,…}` alt is explicitly the §9.3 fallback, deferred. |

---

## 6. Cross-module data contracts (§f) — PASS, with 3 P2 nits

- **f.2 launch→graduation bake — ✅** Launch SETS `TokenFundraise.{partnerLpBps,
  creatorLpBps, partnerLockedLpBps, creatorLockedLpBps, migrationFeeBps,
  leftoverReceiver, thresholdBaseUnits}` AND bakes the SAME `*LpBps` /
  `leftoverReceiver` / `migrationFee` into the DBC config (`buildCreateConfigTx`
  `liquidityDistribution` + `migratedPoolFee.poolFeeBps`). Graduation reads
  `TokenFundraise.migrationFeeBps` → `migrationFeeOptionFor` →
  `DAMM_V2_MIGRATION_FEE_ADDRESS` and records the two `LpPosition` rows.
  Graduation never chooses the split. Consistent.
- **f.3 intentId loop — ✅** `buildTrade` writes `Trade{intentId, source:IN_APP,
  signature:null, blockTime:null}` pre-signature; `submitTrade` patches
  `{signature, blockTime}`; webhook joins on `signature`; cron recon gated by
  `INTENT_RECON`; `runRebateSweep` pays `source=IN_APP, rebatePaid=false`. Loop
  closed and consistent.
- **f.1 FeeEvent type/recipient — mostly ✅:** writers conform for
  PARTNER_TRADING_FEE/PLATFORM, CREATOR_TRADING_FEE/CREATOR, CLAIMED (audit, NOT
  in reader filter), TRANSFER_FEE_WITHHELD/PROTOCOL (webhook), REBATE/TRADER.
  Idempotency split (on-chain `signature` XOR off-chain `internalRef`) is honored,
  including the exact `internalRef` formats. **One leg is mislabeled — see P2-2.**

---

## Findings

### P2-1 — migration uses `IF NOT EXISTS` (contract SQL is bare `ADD COLUMN`)
- **Location:** `apps/api/prisma/migrations/20260625000000_add_finalize_started_at/migration.sql:31`
- **Divergence:** Contract §a.2 specifies `ALTER TABLE "token_fundraises" ADD
  COLUMN "finalizeStartedAt" TIMESTAMP(3);`. Implementation adds `IF NOT EXISTS`.
- **Assessment:** Functionally equivalent and strictly safer (idempotent re-apply);
  Prisma `migrate deploy` tolerates it. Does not alter the resulting schema.
- **Fix (optional):** Drop `IF NOT EXISTS` to match the contract verbatim, or
  accept as a deliberate safety improvement. No action required.

### P2-2 — DAMM v2 locked-LP fees recorded as `*_TRADING_FEE`, never `LOCKED_LP_FEE`
- **Location:** `apps/api/lib/fee-claim.ts` — `claimTokenFees` §3c loop (≈L765)
  routes LP-fee recording through `recordTradingFeeClaim`, whose `legType` is
  hardcoded `PARTNER_TRADING_FEE | CREATOR_TRADING_FEE` (L254).
- **Divergence:** §f.1 and D-fee-claim §1 (L45) require LP-fee legs to be
  `type: LOCKED_LP_FEE` (recipient PLATFORM **or** CREATOR by NFT owner). The
  implementation writes no `LOCKED_LP_FEE` row at all.
- **Impact:** Bounded. The `fees.ts` reader filter includes `LOCKED_LP_FEE`
  alongside the two trading-fee types, and LP fees are USDC-denominated (same mint),
  so the dollar accounting still reads correctly — **no double-count, no money
  error.** The harm is semantic: any consumer that filters specifically on
  `LOCKED_LP_FEE` (or distinguishes curve-phase trading fees from post-graduation
  LP fees) sees the LP fees mislabeled as DBC trading fees, and `internalRef`
  collisions are theoretically possible if both a DBC trading-fee claim and an LP
  claim for the same recipient ever share a `claimSignature` (they won't —
  separate txns/signatures — so idempotency holds in practice).
- **Fix:** Pass the intended `type` into `recordTradingFeeClaim` (or branch) so
  the §3c LP legs record `type: 'LOCKED_LP_FEE'` while §3b legs keep
  `*_TRADING_FEE`. The recipient/amount/internalRef logic is otherwise correct.

### P2-3 — JUP_LOCK_* env vars not added to `.env.local.example`
- **Location:** `apps/api/.env.local.example` (foundation); consumed by
  `apps/api/lib/vesting.ts:61,211` (`JUP_LOCK_PROGRAM_ID`, `JUP_LOCK_IDL_PATH`).
- **Divergence:** §g.1 lists `JUP_LOCK_*` under "Reused (already present)", but
  grep shows no `JUP_LOCK_*` (nor `STREAMFLOW_*`) in the env example. The vesting
  lib reads `JUP_LOCK_PROGRAM_ID` (has a mainnet default) and **requires**
  `JUP_LOCK_IDL_PATH` (throws `CONFIG_MISSING` when unset — every Jupiter-Lock
  `kind:'lock'` create/withdraw/state path fails without it).
- **Impact:** No runtime break for the Streamflow `kind:'vesting'` path; the
  Jupiter-Lock path is non-functional until an operator knows to set
  `JUP_LOCK_IDL_PATH`. Documentation gap, not a code defect.
- **Fix:** Add `JUP_LOCK_PROGRAM_ID` and `JUP_LOCK_IDL_PATH` (and optionally a
  Streamflow RPC note) to `apps/api/.env.local.example` with comments, since
  foundation owns env docs and §g.1 promised they'd be present.

---

## Notes (non-findings, for the record)

- The §9.1 Privy ephemeral co-sign BLOCKER is correctly surfaced (not resolved —
  it's a devnet item) and the client-relay fallback is wired for launch (alt),
  graduation (recovery), and vesting (`PARTIAL_SIGN_UNSUPPORTED` →
  `buildClientResponse`, plus `VESTING_FORCE_CLIENT_COSIGN`).
- The §9.2 transfer-fee-on-DBC-mint BLOCKER is the highest mainnet risk and is
  loudly documented; not a contract-completeness defect.
- Admin fee-claim `{}` selector claims GRADUATED **and ACTIVE** tokens; §d.6 says
  "graduated", but this matches `claimTokenFees` eligibility (ACTIVE tokens have
  claimable DBC bonding-phase fees) and the broader scope is harmless/consistent.
  Acceptable.
- Graduation `runGraduationSweep` does not surface `skipped`/`already-completed`
  in the cron envelope (only detected/finalized/retried/failed) — matches §d.5
  exactly.
