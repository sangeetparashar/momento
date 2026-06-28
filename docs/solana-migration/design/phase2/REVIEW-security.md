# REVIEW — Security & Abuse (Phase 2, Solana-only)

> Adversarial static review. Default-to-flag. Every endpoint assumed hostile-reachable.
> Scope: webhook auth, summary AUTHZ, cron auth, fee/rebate economics, fund custody, secret handling.
> Reviewer stance: we cannot run the code; all findings reasoned statically against
> `CONTRACTS.md` + `SPEC.md §8` (security model).

Severity: **P0** = exploitable now / fund or integrity loss; **P1** = serious gap, narrow precondition or
defense-in-depth missing vs spec; **P2** = hardening / latent risk.

---

## P0 — Forged webhook payloads inject arbitrary EXTERNAL trades & withheld-fee ledger rows

- **File:** `apps/api/lib/helius-webhook.ts:200-358` (`ingestHeliusEvents`), entered from
  `apps/api/app/api/webhooks/helius/route.ts:21-39`.
- **Attack/risk:** The ONLY authenticity control on the webhook is the shared secret
  (`verifyHeliusWebhook`). There is **no verification that the payload corresponds to a real on-chain
  transaction** — `signature`, `tokenTransfers[].mint/fromUserAccount/tokenAmount`, and `blockTime` are
  trusted verbatim from the request body and written straight into `Trade` / `FeeEvent`
  (`:297-320`, `:330-351`). Anyone who obtains/guesses `HELIUS_WEBHOOK_SECRET` (or any party in a
  position to replay a captured-but-valid delivery — see P1 replay) can fabricate unlimited fake
  `EXTERNAL` trades and `TRANSFER_FEE_WITHHELD` rows for any watched creator mint: inflate volume,
  unique-trader counts, fees-generated, and pollute the ledger that later drives rebate accrual and the
  Phase-3 claim CPI. Because amounts come from `tokenAmount` (a `number`) scaled by `10**decimals`
  (`:273`), an attacker also controls the magnitude of every injected fee leg.
- **Concrete fix:** Treat the webhook as low-trust even after the secret check. Before persisting,
  confirm each `signature` against chain via `getConnection().getSignatureStatuses` /
  `getTransaction` (the signer layer already exposes `getConnection()`), and only ingest mints/amounts
  that the confirmed tx actually contains. At minimum, gate persistence behind a Helius source-IP
  allowlist (SPEC §8 "Optional Helius IP allowlist" — make it mandatory in prod) AND rotate
  `HELIUS_WEBHOOK_SECRET` to a high-entropy value. Long term, the rebate/claim pipeline must never
  trust a webhook-asserted amount without on-chain reconciliation.

## P0 — In-process Map idempotency store → double-submit of treasury / fee-claim txns

- **File:** `apps/api/lib/solana/idempotency.ts:43-92` (`InMemoryIdempotencyStore`,
  `getIdempotencyStore`), consumed by `apps/api/lib/solana/submit.ts:192-229`.
- **Attack/risk:** `submit()` relies on `store.reserve()` / `store.get()` to guarantee a tx is broadcast
  at most once. The default store is a per-process `Map`. On Vercel/serverless every instance (and every
  cold start) has its own Map, so the "atomic reserve" only deduplicates within a single warm instance.
  Two concurrent invocations on different instances — or a retry after a cold start — both pass
  `reserve()` and **both broadcast the same treasury transaction** (fee claim, rebate send, migration).
  For platform actions signed by the Privy server wallet this is direct fund-custody risk: double
  fee-claim / double rebate / double tip spend. The code's own comment flags this
  (`idempotency.ts:8-15` "REQUIRED before any treasury/fee-claim action goes live"), but nothing
  enforces it.
- **Concrete fix:** Block any live (`STUB_SOLANA_SIGNER !== '1'`) `route:'sender'` / server-signed
  submit until `getIdempotencyStore()` is backed by a durable, atomic store (Redis `SET NX` or a
  Postgres unique row), exactly the pattern already in `lib/ratelimit.ts` / `helius-webhook.ts` Redis.
  Add a runtime guard in `submit()` that throws `CONFIG_MISSING` if a non-stub server-signed broadcast
  is attempted with the in-memory store. Pair every broadcast with a DB unique constraint on the
  derived idempotency key as the durable backstop.

---

## P1 — Webhook has no timestamp/replay-freshness window (SPEC §5.2 / D-fees §5.2 unmet)

- **File:** `apps/api/lib/helius-webhook.ts:31-35` (`getMaxAgeSeconds`), `:213-225` (Redis SETNX).
- **Attack/risk:** SPEC §5.2 and D-fees §5.2 mandate rejecting deliveries whose event
  `blockTime`/`timestamp` is older than `WEBHOOK_MAX_AGE`. The implementation uses `WEBHOOK_MAX_AGE`
  **only as the Redis SETNX TTL**, never as a freshness check on `ev.blockTime`. A captured valid
  delivery (correct secret/HMAC over its own body) can be **replayed indefinitely once the short Redis
  TTL expires** (default 600s) — and the HMAC stays valid forever because it is computed over the body,
  not over a timestamp. If Redis is down (`:222 catch` falls through), there is no dedupe at all and the
  DB unique key is the only guard. Combined with P0 (forged payloads), replay materially amplifies
  ledger pollution.
- **Concrete fix:** After parsing, drop any event whose `blockTime` is older than `now - WEBHOOK_MAX_AGE`
  (with an explicit admin back-fill path per the spec). Include a timestamp in the HMAC-signed material
  if Helius supports it, so an old body cannot be replayed with a still-valid signature.

## P1 — `safeEqual` hashes inputs, defeating real length/secret constant-time guarantees & enabling HMAC bypass shape

- **File:** `apps/api/lib/helius-webhook.ts:61-69` (`safeEqual`), used at `:88` and `:104`.
- **Attack/risk:** `safeEqual` SHA-256s both operands before `timingSafeEqual`. This is constant-time at
  the digest layer (fine), but note: (1) the bearer path at `:86-90` constant-time-compares the
  **entire `Authorization` header value when it does not start with `Bearer `** (`:87` falls back to the
  raw header) — acceptable, but means a client controls which branch runs. (2) More importantly, the
  HMAC branch (`:98-105`) is only reached when an `x-helius-signature`/`x-hmac-signature` header is
  present; an attacker who knows only that bearer mode is configured cannot downgrade, but if the secret
  is ever used as a *bearer* token an attacker who phishes it from logs/an error gets full access (the
  secret is a static credential, not a per-request signature). The hashing approach is sound; the risk is
  the static-bearer model itself. Flagging because the spec's "HMAC (parity with Veriff)" is the
  stronger mode and bearer should be discouraged.
- **Concrete fix:** Prefer HMAC mode in production; document bearer-static as devnet-only. Keep
  `safeEqual` (it is genuinely constant-time). Ensure the secret never appears in logs (see P1 below).

## P1 — Webhook batch is NOT persisted in one transaction; partial-failure + swallowed errors corrupt counts/ledger

- **File:** `apps/api/lib/helius-webhook.ts:284-351` (per-leg `update`/`upsert`/`createMany`, each
  `.catch(() => {})`).
- **Attack/risk:** SPEC §5.5 binds "Persist the batch in **one `prisma.$transaction`**". The
  implementation issues independent writes per mint/leg and **silently swallows every DB error**
  (`:289`, `:319`, `:351`). A partial failure leaves a `Trade` with no matching `FeeEvent` (or vice
  versa), and the response still reports `processed++` (`:356`) — the counts are not trustworthy and an
  attacker probing for write failures gets no signal while the ledger drifts. Swallowed errors also hide
  injection/DoS attempts from monitoring.
- **Concrete fix:** Wrap the per-event persistence in `prisma.$transaction([...])` using
  `createMany({ skipDuplicates: true })` for the idempotent inserts (as the spec and the file's own
  header claim). Do not swallow errors blanket-style; let unexpected errors surface as 5xx so Helius
  retries and monitoring fires. Only the known unique-violation should be treated as a no-op.

## P1 — Webhook never invalidates summary caches (stale-read / accounting-trust gap, SPEC §5.6)

- **File:** `apps/api/lib/helius-webhook.ts` (no `invalidateCache('feeSummary:*')` call anywhere);
  contrast `apps/api/app/api/kyc/webhook/route.ts:72`.
- **Attack/risk:** SPEC §5.6 requires invalidating affected summary caches after ingest. Without it, the
  public fee/trade summaries served by `getOrSetCache` can serve stale data; more importantly, if
  caching masks freshly-ingested adversarial rows it complicates detection. Lower direct exploitability
  but a defined-control omission.
- **Concrete fix:** Call `invalidateCache('feeSummary:*')` (and per-mint keys) after a successful batch,
  matching the kyc-webhook pattern.

## P1 — Route ignores `heliusWebhookSchema`; unbounded body → DoS

- **File:** `apps/api/app/api/webhooks/helius/route.ts:23-37`; schema defined but unused in
  `apps/api/lib/validation.ts:65-78`.
- **Attack/risk:** The receiver has **no rate limiter** (by design, machine caller) and **no body-size
  cap**. `request.text()` + `JSON.parse` + a per-event loop with per-event `prisma` round-trips means a
  single authenticated (or, pre-P0-fix, forged) request carrying a huge array can exhaust the function's
  time/memory and hammer the DB. `parseHeliusBatch` is defensive about shape but not about cardinality.
- **Concrete fix:** Enforce a max body size and a max array length (reject >N events with 413/400 before
  the loop). Optionally batch DB lookups (`findMany` once for all mints, already done; also resolve all
  existing trades in one query) to bound DB cost. Apply the defined `heliusWebhookSchema` as a cheap
  shape gate.

## P1 — Cron auth fail-OPEN when `CRON_SECRET` unset is dangerous in any deployed env

- **File:** `apps/api/app/api/cron/fee-claim/route.ts:27-40`.
- **Attack/risk:** When `CRON_SECRET` is unset the route runs with **no auth** (`if (secret) {...}` skips
  the check entirely). The constant-time compare itself is correct (`:33-36`). But "fail-open only in
  dev" is only true if dev is the only place the var is unset — a misconfigured prod deploy (var dropped,
  typo'd name) silently exposes a state-mutating endpoint that reclassifies trades and writes REBATE
  accrual rows (and in Phase 3/4 will move funds). The reclassify sweep is attacker-triggerable to force
  recomputation load.
- **Concrete fix:** Fail-CLOSED by default; only fail-open when an explicit `NODE_ENV !== 'production'`
  (or a dedicated `ALLOW_INSECURE_CRON=1` dev flag) is set. Never infer "dev" purely from a missing
  secret. SPEC §8 says "fail-open in dev only" — enforce the dev predicate, do not rely on absence.

## P1 — Rebate accrual driven by attacker-influenced `amountInBaseUnits` + `priceUsd`

- **File:** `apps/api/app/api/cron/fee-claim/route.ts:78-147`; math in `apps/api/lib/fees.ts:64-112`.
- **Attack/risk:** The reclassify→rebate path computes `rebateBaseUnits` from `trade.amountInBaseUnits`
  and `trade.priceUsd`. For EXTERNAL trades these originate from the webhook payload (P0), which is
  attacker-controllable if the secret leaks/replays. `rebateToUsdc` (`fees.ts:102-112`) multiplies by
  `trade.priceUsd` with **no sanity bound** on price — a forged trade with an inflated `priceUsd` (or
  inflated gross) yields an inflated owed-USDC `REBATE` accrual. Phase 4 is a "thin executor" of these
  rows, so a poisoned accrual becomes a real USDC payout. Idempotency on `internalRef`
  (`${tradeId}:TRADER:REBATE`, `:125`) prevents double-counting the *same* trade but not fabrication of
  many trades. `intentId` gating (`:62`) is the real guard today (only Momento-built intents reclassify),
  but `intentId` is settable by the same webhook write path if a future change allows it.
- **Concrete fix:** Recompute/true-up rebate amounts against on-chain confirmed gross + an
  independent price oracle at claim time (the `priceTs` true-up the design mentions but does not
  implement). Bound `priceUsd` to a sane band and reject/flag outliers. Keep rebate eligibility strictly
  tied to a Momento-originated `intentId` that the webhook path can never set.

## P1 — No length/charset validation on `[mint]` / `[id]` path params (injection surface + cache/DoS)

- **Files:** `apps/api/app/api/tokens/[mint]/trades/route.ts:21`,
  `apps/api/app/api/tokens/[mint]/fees/route.ts:24`,
  `apps/api/app/api/creators/[id]/fees/route.ts:21`.
- **Attack/risk:** `mint` and `id` are passed straight into `prisma.creatorToken.findUnique({ where: {
  mintAddress } })` / `findMany({ where: { userId } })` with no validation. Prisma parameterizes so SQLi
  is not the concern; the concerns are (a) attacker-controlled unbounded strings used as cache keys
  downstream (cache poisoning / memory) and (b) enumeration: a non-owner gets a deterministic public vs
  empty response, so `[id]`/`[mint]` are freely probeable. No IDOR for the *claimable* block (authz is
  correct — see below), but the public subset leaks existence/volume for arbitrary mints, which is by
  design but should still be input-bounded.
- **Concrete fix:** Validate `mint` as a base58 32–44 char string and `id` as a uuid/cuid before any DB
  or cache use; reject otherwise with 400.

## P1 — Auth-token preview logged on every failed verification

- **File:** `apps/api/lib/auth.ts:41` (`'Token preview:', token.substring(0, 20) + '...'`).
- **Attack/risk:** On any auth failure the first 20 chars of the bearer token are written to logs. Privy
  JWT prefixes are low-entropy, but logging any portion of a credential is a secret-in-logs anti-pattern;
  log aggregation exposure could aid token reconstruction/correlation. Not Phase-2-new but in the auth
  path the reviewed endpoints depend on.
- **Concrete fix:** Remove the token preview; log only a non-reversible correlation id or nothing.

---

## P2 — Findings

- **`apps/api/lib/helius-webhook.ts:339` — `TRANSFER_FEE_WITHHELD` recorded with `recipient:'PROTOCOL'`,
  but `getTokenFeeSummary` (`fees.ts:305-320`) filters `recipient in [CREATOR,PLATFORM]`** → withheld
  transfer fees never appear in `feesGenerated`. Accounting correctness gap (under-reports), not a breach,
  but means the public number and the ledger disagree — flag for reconciliation.
- **`apps/api/lib/helius-webhook.ts:270-273` — gross computed in floating point**
  (`grossWhole += Math.abs(tt.tokenAmount); BigInt(Math.round(grossWhole * 10**decimals))`). Violates
  CONTRACTS invariant #1 (integer base-units only; no float for on-chain amounts). Large amounts or high
  decimals lose precision / can overflow `Number` (2^53) before the BigInt conversion, skewing fee math.
  Fix: parse Helius `rawTokenAmount` (base-unit string) and use BigInt throughout.
- **`apps/api/lib/helius-webhook.ts:369-375` — `inferSide` always returns `BUY`** (dead `legs` branch).
  Cosmetic for display, but `buyCount/sellCount` in the public summary are meaningless and trivially
  skewable.
- **`apps/api/lib/fees.ts:102-112` — `rebateToUsdc` uses `Number()` on a bigint** (`Number(rebateOwedNet)`)
  then float multiply. Precision loss for large rebates; bound or use integer price scaling.
- **`apps/api/app/api/.../route.ts` 500 handlers** correctly return generic messages and `console.error`
  the raw error — verify the logged `error` objects never carry secrets (they currently do not for these
  routes; Solana layer errors include RPC messages but not creds). Keep it that way: never widen 500 bodies
  to include `error.message`.
- **`apps/api/lib/solana/submit.ts:138` — on-chain `st.err` mapped to `SIMULATION_FAILED` and the raw err
  JSON is put in the message.** Safe (no secrets), but the message is returned up the stack; ensure route
  handlers don't echo `SolanaTxError.message` to clients verbatim (could leak internal account hints).
- **Cron reclassify `take: 500` with no cursor** (`fee-claim/route.ts:66`) — overlapping ticks re-scan the
  same 500 rows; idempotent via `internalRef`, so correct, but unbounded-backlog rows starve. Add a Redis
  lease (SPEC §7 "optionally a Redis lease") to prevent concurrent ticks doing duplicate work.

---

## Authz verdict (summary endpoints) — CORRECT

- `tokens/[mint]/fees` (`:29-41`) and `creators/[id]/fees` (`:23-24`): `claimable` is gated to admin OR
  the token owner (`token.userId === user.id`) / the creator themselves (`user.id === id`). A non-owner
  authenticated user gets only the public subset. **No IDOR on claimable.** Optional-auth pattern
  (`getAuthUser` returning null → public subset) is correct. Rate-limit-first ordering is correct.

## Secret-handling verdict — MOSTLY CLEAN

- Server-wallet creds (`PRIVY_*`) are read lazily, never logged, never returned (`serverWallet.ts:78-98`).
- Stub mode cannot sign on mainnet: `signTransaction` throws `STUBBED` before any live call
  (`serverWallet.ts:101-109`); good seam.
- `CRON_SECRET` / `HELIUS_WEBHOOK_SECRET` are never echoed in responses or errors.
- One leak to fix: the auth token preview log (P1 above). No secret values appear in 500 bodies.

---

### Counts
- **P0: 2** (forged-payload ledger injection; non-durable idempotency → treasury double-submit)
- **P1: 9**
- **P2: 7**
</content>
</invoke>
