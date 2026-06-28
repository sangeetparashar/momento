# Hardening audit — API AuthZ / abuse (on-chain & financial routes)

> Scope: authn/authz and abuse on the NEW Phase 2/3 API routes — tokens/launch,
> tokens/[mint](+buy/sell/submit/trades/fees), creators/[id]/fees(+claim),
> cron/{graduate,fee-claim}, vesting/*, webhooks/helius.
> Focus dimension: AuthZ/abuse (authn gates, ownership/IDOR, cron bearer,
> input validation, rate limits, error/secret leakage, cross-user trade/vesting).
> Method: static read of committed code, cross-referenced against the Phase 3A
> REVIEW-security.md (whose P0-1/P0-3/P1-6/P1-9 etc. are now largely IMPLEMENTED)
> to avoid re-reporting fixed issues. Date: 2026-06-24.

## What is already SOLID (verified, not re-reported)

- **Cron auth** (`cron/graduate`, `cron/fee-claim`): SHA-256 + `timingSafeEqual`,
  FAIL-CLOSED on missing `CRON_SECRET`; the only bypass is an explicit
  `ALLOW_INSECURE_CRON=1 && NODE_ENV!=='production'` dev opt-in. Correct.
- **Helius webhook auth**: bearer OR HMAC, constant-time `safeEqual`, fail-closed
  when `HELIUS_WEBHOOK_SECRET` unset; body-size + batch-cardinality DoS guards;
  no leak of which check failed. Correct.
- **Trade submit IDOR / binding** (REVIEW P0-1 / P1-9): `submitTrade` enforces
  `Trade.userId === userId`, cross-checks the `[mint]` path param vs the intent
  token, and `assertTxMatchesIntent` binds feePayer==traderWallet + pool + swap
  program before broadcast. Confirmed implemented.
- **Vesting create authZ** (REVIEW P0-3): `requireCreator` + token-ownership +
  mint match + base58 recipient validation + per-token supply ceiling. Implemented.
- **Vesting withdraw**: recipient-only (`beneficiaryWallet === wallet`), 403 on
  mismatch, recipient signs. Correct.
- **Admin fee-claim**: `requireAdmin`, `[id]` uuid-bounded, all target tokens
  ownership-scoped to creator `[id]`, audit row. Correct.
- **Read endpoints** (`tokens/[mint]`, `/fees`, `/trades`, `creators/[id]/fees`):
  `claimable` block gated to owner/admin via optional `getAuthUser`. Correct.

---

## NEW / still-open findings

### P1-A — Money-path rate limits are IP-keyed off a spoofable `x-forwarded-for`, NOT per-user (defeats the documented "5/min per user" swap cap; enables rebate/volume farming + cross-tenant DoS)
**Module:** trade (primary) + launch + vesting + read-endpoints (same bug class).
**Files:**
- `apps/api/app/api/tokens/[mint]/buy/route.ts:33`
- `apps/api/app/api/tokens/[mint]/sell/route.ts:28`
- `apps/api/app/api/tokens/[mint]/buy/submit/route.ts:22`
- `apps/api/app/api/tokens/[mint]/sell/submit/route.ts:22`
- `apps/api/app/api/tokens/launch/route.ts:49`
- `apps/api/app/api/vesting/create/route.ts:84`, `vesting/[id]/withdraw/route.ts:29`, `vesting/list/route.ts:23`
- root cause: `apps/api/lib/ratelimit.ts:94-99,105-114` (`getRateLimitId` falls
  back to `ip:<x-forwarded-for>` whenever `userId` is omitted).

**Problem:** Every in-scope route calls `applyRateLimit(request, <limiter>)` with
NO `userId` arg. `swapLimiter()`/`writeLimiter()` are documented as "per user"
(ratelimit.ts:43,46) but with `userId` omitted the key is `ip:<x-forwarded-for[0]>`.
Two consequences:
1. **Bypass / farming:** an authenticated user rotates the `X-Forwarded-For`
   header to get a fresh bucket per request, defeating the swap cap entirely. On
   the money path this directly enables rebate-farming volume and graduation-raise
   inflation at scale (the per-trade rebate basis is recorded per buy/sell call).
2. **Cross-tenant DoS:** all users behind one NAT/egress IP share a single
   5/min swap bucket, so one user can starve others; and an unauthenticated
   attacker can pre-burn the IP bucket *before* `requireAuth` runs (the limiter is
   the first thing each route does), denying real users.

The admin route at `admin/users/[id]/promote-creator/route.ts:27-33` documents the
EXACT correct pattern and reasons about this verbatim ("Auth FIRST so the
rate-limit key is the admin's userId, not their IP… rotating IPs… same NAT"), but
the money routes do not follow it.

**Fix:** Move `applyRateLimit` to AFTER `requireAuth`/`requireCreator` and pass
the identity: `applyRateLimit(request, swapLimiter, user.id, { failClosed: true })`
on the trade/launch/vesting write paths (failClosed so a Redis outage can't
silently disable the cap on a money route). Keep an IP-keyed coarse pre-auth
limiter only if you also want unauth protection, but the authoritative per-user
cap must key on `user.id`. Also stop trusting raw `x-forwarded-for[0]` (use the
platform's trusted client-IP, e.g. the last hop / `request.ip`).

### P1-B — Vesting confirm contract is unimplemented: `/api/wallet/transactions/log` rejects `vest_create`/`vest_withdraw`, so client-path schedules never flip ACTIVE/COMPLETED and `releasedBaseUnits` is never persisted
**Module:** vesting (contract owner) — the consuming route is mobile/wallet-owned.
**Files:** `apps/api/app/api/wallet/transactions/log/route.ts:37` (validTypes =
`['swap','send','receive','fund']`, no vesting handling, no `VestingSchedule`
write); contract in `apps/api/app/api/vesting/create/route.ts:11` and
`vesting/[id]/withdraw/route.ts:9` (both say the log route bumps state);
`docs/.../phase3/D-vesting.md:348-349`.

**Problem:** D-vesting §4.3 and both vesting routes document that the client-relay
create confirm and every withdraw confirm POST `/api/wallet/transactions/log` with
`type: 'vest_create' | 'vest_withdraw'` to flip `status`/`createSignature` and bump
`releasedBaseUnits`. The log route does not accept those types (returns 400 "Invalid
type") and never touches `VestingSchedule`. Net effects:
(a) client-path `VestingSchedule` rows are stranded in PENDING forever (the server
path flips ACTIVE inline, but the documented Privy-co-sign fallback path does not);
(b) `releasedBaseUnits` is never written, so the persisted withdrawn total is always
stale. The live `getVestingState` masks (b) by reading on-chain `withdrawnAmount`,
but any DB-only read (and the `/vesting/list` fallback-on-RPC-error branch at
`vesting/list/route.ts:74,83-85`) reports `withdrawnBase = 0`, i.e. the schedule
looks fully unwithdrawn after a real withdrawal — a correctness/integrity defect on
a fund-tracking path.
**Fix (vesting-owned half):** Have the vesting module own a confirm path rather
than relying on the generic wallet log. Either add a dedicated
`/api/vesting/[id]/confirm` (recipient/creator-authorized, re-derives the confirmed
withdrawn/created state from the signature's tx meta and updates the row), or
explicitly document that `getVestingState` is the sole source of truth and remove
the "handled by /api/wallet/transactions/log" claims so no caller relies on a
non-existent bump. Do NOT trust a client-supplied `releasedBaseUnits`; re-derive
from chain.

### P2-A — `/vesting/list` fans out one on-chain RPC per schedule with no per-request cap (RPC amplification / cost-DoS)
**Module:** vesting.
**File:** `apps/api/app/api/vesting/list/route.ts:71-99` (Promise.all over all
matched schedules) → `lib/vesting.getVestingState` (one getOne/escrow fetch each).
**Problem:** `readLimiter` bounds request rate but each list call issues N RPC
reads where N = number of schedules the caller can see (recipient OR sender role).
A creator (sender role) with many tokens/schedules, or anyone who accumulates many
recipient rows, turns one authorized request into many RPC calls — amplification
against the RPC provider (cost + rate-limit exhaustion). (Carried from REVIEW
P2-5; still open.)
**Fix:** Paginate and cap live-state lookups per request (e.g. max 25); cache
`getVestingState` results with a short TTL keyed on streamId.

### P2-B — `tradeSubmitSchema.transaction` is only `z.string().min(1)` (no base64 / size bound); a malformed blob reaches `Transaction.from` and an oversized one is decoded before any per-user cap applies
**Module:** schema-shared (validator) + trade (consumer).
**Files:** `apps/api/lib/validation.ts:133-137`; consumed at
`tokens/[mint]/buy/submit/route.ts:38` / `sell/submit/route.ts` →
`lib/trade.assertTxMatchesIntent` (`TransactionImpl.from(Buffer.from(...,'base64'))`).
**Problem:** `transaction` and `idempotencyKey` are unbounded strings. A huge
`transaction` is base64-decoded and deserialized server-side; combined with P1-A
(IP-keyed cap, XFF-bypassable) this is a cheap CPU/allocation amplification on the
submit path. `assertTxMatchesIntent` does catch decode errors (→ 400), so this is
abuse/DoS hardening, not a bypass.
**Fix:** Add a max length to `transaction` (a relayed swap tx is < ~3 KB → base64
< ~4 KB; cap at e.g. 8 KB) and a sane cap on `idempotencyKey`; optionally validate
base64 shape in the schema so a bad blob is rejected before the decode.

### P2-C — `amountInBase` / `amountBase` have no upper bound (huge values flow into quote + recorded rebate/raise basis before any on-chain reality check)
**Module:** schema-shared.
**Files:** `apps/api/lib/validation.ts:129` (`tradeOrderSchema.amountInBase`
`/^[1-9]\d*$/`, no max), `:151` (`vestingCreateSchema.amountBase`), `:160`
(`vestingWithdrawSchema.amountBase`).
**Problem:** Carried from REVIEW P2-7, still open. An arbitrarily large
`amountInBase` is self-limiting on-chain (the swap fails on balance) but it is
written into `Trade.amountInBaseUnits` / `rebateBaseUnits` from the *quote* before
that, feeding the rebate basis and the confirmed-raise sum. The vesting allocation
ceiling (create route) now bounds vesting; the trade path has no equivalent.
**Fix:** Add a sane per-trade max to `tradeOrderSchema.amountInBase` (e.g.
length/value bound consistent with the launch `totalSupply.length<=15` guard) so
absurd amounts are rejected pre-quote.

---

## Summary of counts (this audit, NEW/still-open only)
- **P1: 2** (IP-keyed money-path rate limits bypassable via XFF; unimplemented
  vesting confirm contract → stranded/stale schedule state)
- **P2: 3** (vesting-list RPC amplification; unbounded submit `transaction`;
  unbounded trade/vesting amounts)

The previously-documented P0s (rebate-from-quote, unbound submit, unconstrained
vesting recipient/amount) are now implemented and were NOT re-reported. The two
DEVNET BLOCKERS (DBC transfer-fee-on-mint; Privy ephemeral co-sign) remain
offline-unverifiable and are out of this AuthZ scope.
