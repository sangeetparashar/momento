# REVIEW — Phase 2 Contract-Completeness (adversarial)

> Reviewer pass against the BINDING contract `CONTRACTS.md` (§a–§e) + `SPEC.md §10`.
> Scope: file manifest, interface conformance, model conformance, endpoint conformance,
> env/constants, phase boundary, open questions. **No code was modified.**
>
> **Verdict: PASS.** The implementation matches the binding contract with zero P0s. The
> findings below are P1/P2 nits and forward-looking risks; none violate the contract as written.
>
> **P0: 0 · P1: 2 · P2: 5**

---

## 1. File manifest (§c)

**Conforms.** Every file listed for T-foundation / T-signer / T-fees exists; nothing
out-of-scope was added.

- T-foundation: `schema.prisma` (EDIT), `migrations/20260624010000_add_token_economy/migration.sql`,
  `migrations/migration_lock.toml` (`provider = "postgresql"`), `packages/shared/src/types.ts`,
  `packages/shared/src/constants.ts`, `apps/api/.env.local.example` — all present.
- T-signer: all 10 `apps/api/lib/solana/*` files present (`index, types, connection, serverWallet,
  signer, priorityFee, sender, submit, idempotency, errors`).
- T-fees: `lib/fees.ts`, `lib/helius-webhook.ts`, `app/api/webhooks/helius/route.ts`,
  `app/api/tokens/[mint]/trades/route.ts`, `app/api/tokens/[mint]/fees/route.ts`,
  `app/api/creators/[id]/fees/route.ts`, `app/api/cron/fee-claim/route.ts`,
  `lib/validation.ts` (EDIT), `vercel.json` (EDIT) — all present.
- Phase-3 endpoints (`tokens/launch`, `tokens/[mint]`, `.../buy`, `.../sell`,
  `creators/[id]/fees/claim`, `vesting/*`) and Phase-3 consumer libs (`lib/launch.ts`,
  `lib/trade.ts`, `lib/vesting.ts`) are correctly **absent**.

---

## 2. Interface conformance (§b)

**Conforms.** Exported surfaces of `lib/solana/*` match §b.1–b.10 verbatim (Signer/BuiltTx/
SubmitRoute/SubmitOptions/SubmitResult; ServerWallet + getServerWallet; serverSigner/
ephemeralSigner/clientRelaySigner/applySigners; submit/buildUnsignedForClient/submitClientSigned;
getConnection; getPriorityFeeEstimate/computeBudgetIxs; sendViaSender/jitoTipIx;
IdempotencyStore + getIdempotencyStore + deriveIdempotencyKey; SolanaTxError + classify).
The §b.10 barrel re-exports exactly the contracted set. `lib/fees.ts` matches §b.11 and
`lib/helius-webhook.ts` matches §b.12 (names, signatures, interfaces).

### P2 — Extra (additive) exports beyond §b
- **Location:** `solana/connection.ts` (`getNetwork`, `getRpcUrl`, `resetConnection`),
  `solana/serverWallet.ts` (`resetServerWallet`), `solana/idempotency.ts` (`setIdempotencyStore`),
  `solana/sender.ts` (`getSenderUrl`, `getDefaultTipLamports`, `lamportsToSol`),
  `solana/priorityFee.ts` (`DEFAULT_COMPUTE_UNIT_LIMIT`).
- **Divergence:** Contract §b lists a smaller surface per file; these helpers are extra.
- **Fix:** None required — they are not re-exported through the §b.10 barrel, are reasonable
  test/internal helpers, and add no new files. Acceptable. Noted only for completeness.

---

## 3. Model conformance (§a)

**Conforms exactly.** All 10 enums (§a.1) present with exact members & order; `PoolType` gains
`METEORA_DBC`/`METEORA_DAMM_V2`. `CreatorToken` (§a.2) gains all 8 fields + 7 relations, keeps
the three required indexes, and adds the optional `@@index([status])`. `User` (§a.3) gains the
three back-relations. All 7 models (§a.4–a.10) match field names, types, attributes, `@default`s,
`@unique`s, `@@index`es, `@@unique`s, `@@map`s, and `onDelete` regimes (Cascade from
`CreatorToken`; `SetNull` on user FKs). The hand-written migration SQL mirrors the schema:
`CREATE TYPE` ×10, `ALTER TYPE PoolType ADD VALUE … IF NOT EXISTS` ×2, additive
`ALTER TABLE creator_tokens`, `CREATE TABLE` ×7, all indexes/uniques/FKs with matching
`ON DELETE CASCADE` / `SET NULL`. Migration discipline (§a.11) is documented in the SQL header.

### P2 — `db push` caveat acknowledged but live
- **Location:** `migration.sql` header ("DEV vs PROD CAVEAT", lines 29–36).
- **Divergence:** Contract §a.11 says **NEVER** `prisma db push` against data envs; the comment
  states the repo "uses BOTH a migrations/ folder AND prisma db push in dev/CI."
- **Fix:** Confirm CI never runs `db push --accept-data-loss` against a PostGIS-bearing DB; the
  comment correctly warns, but the dual-path workflow is the contract's named hazard. Ops note only.

---

## 4. Endpoint conformance (§e)

**Conforms.** All 5 build-now endpoints match request/response shapes, envelope, auth class,
and limiter:
- `POST /api/webhooks/helius` — secret-only (bearer/HMAC constant-time), no limiter, 401 on bad
  secret, `{received,processed,skipped}` data, always 200 for verified/already-seen (skipped++).
- `GET /api/tokens/[mint]/trades` — public, `readLimiter`, `tradeRangeSchema`
  (range default 24H, granularity hour|day, limit default 50 max 200), response shape matches §e.2.
- `GET /api/tokens/[mint]/fees` — public + owner/admin-widened `claimable` via optional auth,
  `readLimiter`, range default ALL, shape matches §e.3.
- `GET /api/creators/[id]/fees` — public + owner/admin-widened, `readLimiter`, shape matches §e.4.
- `GET /api/cron/fee-claim` — `Bearer ${CRON_SECRET}` constant-time, fail-open only when unset,
  no limiter, `{reclassified,rebatesQueued,claimsRecorded,harvestNoted}`, P3/P4 seams as TODOs.
- `vercel.json` cron entry `*/30 * * * *` for `/api/cron/fee-claim` present.

### P1 — Fee-summary recipient mapping diverges from §3.5 ledger model
- **Location:** `lib/fees.ts` `getTokenFeeSummary` / `getCreatorFeeSummary` (the `recipient`
  filters), and `helius-webhook.ts` `ingestHeliusEvents`.
- **Divergence:** The summaries compute Momento's claimable from `recipient = PLATFORM`, but
  SPEC §3.5 / §0.2 records Momento's LP cut as `type = PARTNER_TRADING_FEE` (with the recipient
  being the partner). No writer in Phase 2 ever emits a `PARTNER_TRADING_FEE` / `CREATOR_TRADING_FEE`
  / `LOCKED_LP_FEE` row (those are the Phase-3 claim CPI). The only fee rows Phase 2 writes are
  `TRANSFER_FEE_WITHHELD` (recipient `PROTOCOL`, excluded from the summary) and `REBATE`
  (recipient `TRADER`). **Net effect:** `feesGenerated*` and `claimable` will read 0 until Phase 3
  — functionally fine for Phase 2, but the recipient/type filter pairing (`PLATFORM` +
  `PARTNER_TRADING_FEE`) is internally inconsistent with how §3.5 says the partner leg is keyed.
- **Fix:** Align the read-model filter with the §3.5 write convention before Phase 3 emits LP-fee
  rows — decide whether Momento's leg is identified by `recipient=PLATFORM` or by
  `type=PARTNER_TRADING_FEE`, and make the webhook/cron writers and the summary reader agree.
  Not contract-breaking now (no such rows exist yet); flagged so Phase 3 doesn't silently double- or
  zero-count.

### P2 — `granularity` query param is validated but unused
- **Location:** `tokens/[mint]/trades/route.ts` + `getTokenTradeSummary`.
- **Divergence:** §e.2 marks `granularity` optional; the route parses it but discards it
  (series bucketing is derived from `range` instead). Contract says "optional," so this is allowed.
- **Fix:** None required; either wire `granularity` into the bucket size or leave as-is.

---

## 5. Env / constants (§d)

**Conforms.** All §d.1 vars present in `.env.local.example`: `PRIVY_AUTHORIZATION_KEY`,
`PRIVY_SERVER_WALLET_ID`, `SOLANA_RPC_URL`, `SOLANA_NETWORK` (=devnet), `HELIUS_SENDER_URL`
(default URL), `JITO_TIP_LAMPORTS` (=200000), `JITO_TIP_ACCOUNT`, `STUB_SOLANA_SIGNER`,
`HELIUS_WEBHOOK_SECRET`, `WEBHOOK_MAX_AGE` (=600), `MOMENTO_REBATE_USDC_VAULT`,
`MOMENTO_LP_FEE_CLAIMER`, `MOMENTO_CREATOR_FEE_PCT` (=50), `CRON_SECRET`. Reused vars
(`NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `HELIUS_API_KEY`, `UPSTASH_REDIS_REST_*`,
`MOMENTO_FEE_WALLET`, `MOMENTO_PLATFORM_FEE_BPS`) present. `MOMENTO_FEE` constant block in
`packages/shared/src/constants.ts` matches §d.2 exactly (mints, decimals, program IDs, all bps).

### P2 — `PRIVY_APP_ID` not separately present (only `NEXT_PUBLIC_PRIVY_APP_ID`)
- **Location:** `.env.local.example`; `serverWallet.ts` reads
  `NEXT_PUBLIC_PRIVY_APP_ID || PRIVY_APP_ID`.
- **Divergence:** §d lists `PRIVY_APP_ID`/`NEXT_PUBLIC_PRIVY_APP_ID` as reused; only the
  `NEXT_PUBLIC_` form is in the example file. The code's `||` fallback handles both, so no breakage.
- **Fix:** Optional — add a commented `PRIVY_APP_ID` line for parity. Cosmetic.

---

## 6. Phase boundary (§9 / §e)

**Conforms.** No real Meteora/Streamflow/Jupiter-Lock on-chain CPI exists — the only references
are `TODO(Phase 3)` / `TODO(Phase 4)` comment seams (`cron/fee-claim/route.ts`, `serverWallet.ts`,
SPEC §7). No `@meteora-ag/*`, `@streamflow/*`, or DBC SDK imports anywhere. Phase-3 endpoints are
not built. **Import-safety holds:** no module-level `process.env` assignments, no top-level
`new Connection/Redis/PrivyClient`, no import-time throws; every env read, network call, and throw
is inside an exported function. `STUB_SOLANA_SIGNER=1` short-circuits live signing/submit at call
time (synthetic signature in `submitSignedTail`).

### P1 — `submitClientSigned` reports `priorityFeeMicroLamports: 0`
- **Location:** `submit.ts` `submitClientSigned` (line ~421).
- **Divergence:** `SubmitResult.priorityFeeMicroLamports` is a required field in §b.1. On the
  client-relay path the budget ixs are baked at `buildUnsignedForClient` time, so the value is not
  re-derived and is reported as `0` (unless an override is passed). This is a slightly misleading
  telemetry value, not a shape violation — the field is present and typed.
- **Fix:** Thread the build-time priority fee through to the submit step (e.g. return it from
  `buildUnsignedForClient` and pass via `opts`) so the result reflects the actual fee. Low priority;
  no consumer in Phase 2.

---

## 7. Open questions (SPEC §10)

**All handled as explicit seams — none silently resolved wrong.**

1. **Privy multi-signer (blocks vesting):** surfaced as `SolanaTxError` code
   `PARTIAL_SIGN_UNSUPPORTED`; `applySigners` signs ephemerals first; `serverWallet.ts` carries the
   `TODO(verify-devnet)` note. Vesting module not built. ✅ open seam.
2. **Idempotency store:** in-process `Map` default with `IdempotencyStore` seam + `setIdempotencyStore`
   and `TODO(ops): Prisma/Redis`. ✅ open seam.
3. **`protocolFeeBps` default 2000:** present in constants/schema with "confirm vs deployed program"
   comment. ✅ left as documented assumption.
4. **Meteora split granularity (observed vs computed):** `attribute2080` exists as the *computed*
   fallback; SPEC §3.5 says prefer observed. No Phase-2 writer commits LP-fee splits yet (Phase 3).
   ✅ deferred. (Related to the §4 P1 above.)
5. **caip2 cluster string:** `serverWallet.caip2()` hardcodes devnet/mainnet strings with a
   `TODO(verify-devnet)`. ✅ open seam.
6. **Compliance (legal before Phase 4):** rebate *send* is `TODO(Phase 4)`; Phase 2 only ledgers.
   ✅ deferred.

---

## Summary of findings

| # | Sev | Location | Divergence | Fix |
|---|-----|----------|-----------|-----|
| 1 | P1 | `lib/fees.ts` summaries + `helius-webhook.ts` | Momento leg keyed by `recipient=PLATFORM`, but §3.5 records partner leg via `type=PARTNER_TRADING_FEE`; reader/writer convention not yet aligned | Reconcile read-model filter with §3.5 write convention before Phase-3 LP-fee rows land |
| 2 | P1 | `submit.ts` `submitClientSigned` | `priorityFeeMicroLamports` reported as 0 on the client path | Thread build-time fee through to the result |
| 3 | P2 | `solana/*` modules | Extra additive helper exports beyond §b (not in barrel) | None — acceptable |
| 4 | P2 | `migration.sql` header | Dual `db push`/`migrate` dev path is the contract's named hazard | Ensure CI never `db push --accept-data-loss` |
| 5 | P2 | `trades` route + `getTokenTradeSummary` | `granularity` validated but unused (contract allows optional) | Optional: wire it or drop it |
| 6 | P2 | `.env.local.example` | `PRIVY_APP_ID` not present (only `NEXT_PUBLIC_` form); code falls back | Optional cosmetic add |
| 7 | P2 | `serverWallet.address` getter | Sync getter throws until ops async-warms it (documented) | Ops warmup before hot-path read (already noted in-code) |

**No P0 findings. The Phase 2 implementation is contract-complete and respects the phase boundary.**
