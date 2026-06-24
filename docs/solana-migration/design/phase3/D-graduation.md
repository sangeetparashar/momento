# D — Threshold Fundraise, Graduation & LP-Split Realization (Phase 3A)

> Module owner: **T-graduation** (`apps/api/lib/graduation.ts` + the keeper cron).
> Builds on committed Phase 2: `prisma/schema.prisma` (TokenFundraise / FundraiseContribution /
> LpPosition / CreatorToken), `lib/solana/*` (server wallet, signer, submit, idempotency),
> `lib/fees.ts` (`attribute2080`), `lib/helius-webhook.ts` (raised tracking).
> Ground truth: `scripts/spikes/spike-b-meteora-dbc.ts` (`migrateToDammV2` → two locked-LP position
> NFT keypairs; cp-amm `permanentLockPosition` / `claimPositionFee`), `spike-c-vesting-lock.ts`
> (Jupiter Lock), `research/15-lp-economics.md`.
> **DESIGN ONLY** — no implementation here. On-chain specifics that the spikes flag
> `// TODO verify` are repeated here as `TODO(verify-devnet)`.

---

## 0. TL;DR / cross-cutting decisions

- **Two responsibilities, one module.** (1) Track `raisedBaseUnits` toward `thresholdBaseUnits`
  and flip `TokenFundraise.status` `ACTIVE → THRESHOLD_MET`. (2) An **idempotent keeper**
  (`GET /api/cron/graduate`) that, when the threshold is met, calls Meteora
  `migration.migrateToDammV2`, realizes the configurable LP/treasury/creator splits, locks the LP,
  persists **both** `LpPosition` rows (PARTNER + CREATOR), and finalizes
  `CreatorToken.status = GRADUATED` + `TokenFundraise.status = COMPLETED`.
- **Raised tracking sources from confirmed quote (USDC) movement only.** The webhook already
  verifies on-chain and writes `Trade` / `FundraiseContribution` rows; graduation derives
  `raisedBaseUnits` from those *confirmed* rows (`blockTime != null`), never from a payload float.
- **The split is fixed at config-creation, realized at migration.** The four LP knobs
  (`partnerLpBps` / `creatorLpBps` / `partnerLockedLpBps` / `creatorLockedLpBps`) + `leftoverReceiver`
  live on `TokenFundraise` and were baked into the DBC config at launch (Phase 3 launch module).
  Graduation does **not** choose the split — it migrates and then *records* what the program produced.
- **Migration is the program's job; we do not re-implement the split on-chain.** `migrateToDammV2`
  itself seeds the DAMM v2 pool and emits the **two locked position NFTs** (partner + creator) per the
  config's percentages. The keeper's on-chain work is: build the migrate tx, sign with the **server
  wallet**, self-submit, then (if the program does not auto-perma-lock) issue
  `permanentLockPosition` and/or a Jupiter Lock. **`attribute2080` is NOT used here** — it splits a
  *fee dollar* during trading; LP allocation is governed by the LP bps, a different axis.
- **Idempotency is layered and fail-closed.** A DB status guard (`FINALIZING` claim) +
  `finalizeSignature` unique + the durable Redis idempotency store in `submit()` together make
  "never double-migrate" hold across overlapping cron ticks and serverless fan-out.
- **Worked example** (§6): raise $12,000 → ~$12,000 USDC + 200M tokens paired as LP (100% locked
  50/50 partner/creator), leftover tokens → creator, surplus → partner+protocol.

---

## 1. Scope & non-goals

**In scope (build in Phase 3A):**
1. `lib/graduation.ts` — raised-progress read model, threshold detection, the graduation orchestrator,
   and the LP-split realization + persistence.
2. `GET /api/cron/graduate` keeper entry (new cron alongside `cron/fee-claim`).
3. Idempotency + partial-failure recovery state machine.

**Out of scope (other modules / later):**
- DBC config creation + `createPool` (token launch) — Phase 3 **launch** module (`lib/launch.ts`).
  Graduation assumes the config already encodes the split and `dbcPoolAddress` is set.
- Contribution / buy tx building (Phase 3 trade module) — graduation only *reads* their confirmed rows.
- Post-graduation fee **claiming** (`claimPartnerTradingFee` / `claimPositionFee`) — owned by the
  fee-claim cron (Phase 2 seam, executed Phase 3). Graduation persists the position NFTs that the
  claim job later reads.
- Refunds on a failed/expired fundraise (`FAILED → REFUNDED`) — fundraise lifecycle module.
- Creator-token **vesting** (Streamflow) — separate from LP locking; `spike-c` covers it.

---

## 2. The graduation state machine

Authoritative status lives on **`TokenFundraise.status`** (`FundraiseStatus`) with
`CreatorToken.status` (`TokenStatus`) shadowing the terminal transition. Both already exist in the
committed schema — **no schema change required** for the happy path (one optional additive field in §8).

```
                 contributions/buys confirmed (webhook)
                 raised >= threshold
   DRAFT ──launch──> ACTIVE ───────────────────────────────> THRESHOLD_MET
                       │                                          │
                       │ endsAt passed && raised < threshold      │ keeper claims it
                       ▼                                          ▼
                     FAILED ──(refund module)──> REFUNDED      FINALIZING ──(migrate tx fails)──┐
                                                                  │                              │
                                          migrate confirmed +     │   <─ retry next tick ────────┘
                                          both LpPositions saved + │      (idempotent; re-enters
                                          locks done              │       FINALIZING, never re-migrates)
                                                                  ▼
                                                              COMPLETED
                                                       (CreatorToken.status = GRADUATED,
                                                        TokenFundraise.finalizeSignature set,
                                                        finalizedAt set)
```

State semantics:

| Status | Set by | Meaning | Keeper action |
|---|---|---|---|
| `DRAFT` | launch module | fundraise row exists, curve not live | none |
| `ACTIVE` | launch module | curve live, accepting quote | accumulate `raisedBaseUnits`; check threshold |
| `THRESHOLD_MET` | **graduation (§3)** | `raised >= threshold`, pool now non-swappable | keeper picks up → `FINALIZING` |
| `FINALIZING` | **keeper (§4), atomic claim** | migration in flight (lease held) | exactly one worker proceeds; others skip |
| `COMPLETED` | **keeper (§4)** | migrated, LP locked, both positions persisted | terminal; idempotent no-op |
| `FAILED` | fundraise lifecycle | `endsAt` passed under threshold | refund module (out of scope) |
| `REFUNDED` | refund module | contributions returned | terminal |

`FINALIZING` is the **lease** that prevents double-migration: it is claimed by a conditional update
(§4.2) and is *recoverable* — a crashed tick leaves the row in `FINALIZING`, and a later tick
re-enters it (the on-chain idempotency guards make the re-attempt safe).

---

## 3. Raised tracking & threshold detection

### 3.1 Source of truth

`raisedBaseUnits` is the cumulative **confirmed quote (USDC)** that entered the curve toward
`migration_quote_threshold`. Two confirmed sources, both already produced by `helius-webhook.ts`:

- **`FundraiseContribution`** rows (`blockTime != null`, `refunded = false`) — direct contributions.
- **`Trade`** rows on the curve venue (`venue = METEORA_DBC`, `side = BUY`, `blockTime != null`)
  where the **quote-in** is USDC — `amountInMint == quoteMint` ⇒ `amountInBaseUnits` is the USDC raised.

> **Why both:** a DBC launch raises quote via curve *buys*; a Momento threshold *fundraise* may also
> take explicit contributions. The webhook writes BUY trades today; the contribution table is the
> fundraise-specific ledger. Graduation reads whichever the launch configured (a fundraise sums
> contributions; a pure-curve launch sums BUY quote-in). Summing across the two is safe because both
> are USDC base units in the **same quote mint**; never sum base units across mints
> (`lib/fees.ts` invariant).

The keeper does **not** trust the running `TokenFundraise.raisedBaseUnits` counter for the *decision*;
it recomputes from confirmed rows so a lost webhook increment cannot strand a graduation, and a
double-counted increment cannot trigger a premature one. The counter is a cached display value
(updated opportunistically by the webhook); the **authoritative** sum is the keeper's query.

### 3.2 Webhook increment (small additive hook — coordinate with T-fees)

When `ingestHeliusEvents` persists a confirmed USDC-in contribution/curve-buy on a watched fundraise
mint, it should `increment` `TokenFundraise.raisedBaseUnits` and `contributorCount` inside the same
`$transaction` that writes the row (so the counter never drifts from the ledger within a delivery).
This is the only edit graduation needs in `helius-webhook.ts`; it is **additive** and idempotent via
the existing per-row unique keys (a deduped re-delivery does no increment because the insert is skipped).

> `TODO(verify-devnet)`: confirm the DBC curve buy surfaces USDC as a `tokenTransfer` Helius can see
> (it should — `collectFeeMode = QuoteToken`, quote = USDC), so `verifyOnChain` derives the quote-in
> base units. If the curve's quote leg is not in `pre/postTokenBalances` as a plain SPL transfer,
> fall back to reading the DBC virtual-pool quote reserve via `client.state` in the keeper (§3.3).

### 3.3 Threshold check & flip to `THRESHOLD_MET`

`detectThresholdMet()` (called by the keeper, and optionally inline by the webhook):

```
raised   = sum(confirmed USDC contributions) + sum(confirmed curve BUY quote-in)   // bigint
threshold = BigInt(TokenFundraise.thresholdBaseUnits)
if status == ACTIVE && raised >= threshold:
    conditional update: WHERE id=? AND status='ACTIVE'  SET status='THRESHOLD_MET'
```

The conditional `WHERE status='ACTIVE'` makes the flip idempotent (a second tick sees `THRESHOLD_MET`
and the update affects 0 rows). On-chain reality: once the curve hits the threshold the DBC pool
becomes **non-swappable** and Meteora's managed migrator keeper *may* auto-migrate. We do **not** rely
on the managed keeper (spike-b: it "may not run on devnet and has minimum-threshold requirements"); we
**self-migrate** in §4. A cross-check read of the DBC virtual-pool quote reserve vs the stored
config's `migration_quote_threshold` is the on-chain confirmation that our off-chain sum is correct.

> `TODO(verify-devnet)`: exact `client.state` reader for the virtual pool's quote reserve and the
> stored `migration_quote_threshold` (spike-b resolves the pool via
> `client.state.getPoolByBaseMint` / `deriveDbcPoolAddress`). Reconcile reserve >= threshold before
> migrating; if the program already auto-migrated, skip to §4.4 (detect-existing-pool path).

---

## 4. The keeper (graduation trigger)

### 4.1 Entry point

New cron `GET /api/cron/graduate`, same auth + fail-closed pattern as `cron/fee-claim`
(`Authorization: Bearer ${CRON_SECRET}`, constant-time; `ALLOW_INSECURE_CRON` dev opt-in only).
Add to `apps/api/vercel.json` `crons` (suggest `*/5 * * * *`; graduation is latency-sensitive vs the
30-min fee-claim). The route is a thin auth shell that calls `runGraduationSweep()` in `lib/graduation.ts`
and returns counts `{ detected, finalized, retried, failed }`.

### 4.2 Per-token flow (idempotent)

For each candidate (`status IN ('THRESHOLD_MET','FINALIZING')`, bounded `take`):

1. **Recompute raised** (§3.1) and re-confirm `raised >= threshold`. (Guards a wrongly-flipped row.)
2. **Claim the lease** — atomic conditional update:
   `UPDATE TokenFundraise SET status='FINALIZING' WHERE id=? AND status IN ('THRESHOLD_MET','FINALIZING')
    AND (finalizeStartedAt IS NULL OR finalizeStartedAt < now()-LEASE_TTL)`.
   If 0 rows updated → another worker holds a fresh lease → **skip**. (`finalizeStartedAt` = the §8
   additive field; `LEASE_TTL` ~10 min covers a blockhash window + slack.)
3. **Short-circuit if already done** — if `finalizeSignature` is set, re-run §4.3 *persistence only*
   from the recorded signature/NFT mints (recovery), then mark `COMPLETED`. Never re-migrate.
4. **Migrate** (§4.3).
5. **Realize + lock + persist** (§4.3).
6. **Finalize** — atomic: `TokenFundraise.status='COMPLETED' + finalizeSignature + finalizedAt`;
   `CreatorToken.status='GRADUATED' + graduatedAt + poolType=METEORA_DAMM_V2 + poolAddress=<damm v2>`.

### 4.3 On-chain migration + LP realization (reuse spike-b verbatim)

```ts
const client = DynamicBondingCurveClient.create(connection, 'confirmed');
const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[migrationFeeOption];   // from TokenFundraise.migrationFeeBps → tier

// 1. Build migrate tx. Returns the TWO locked-LP position-NFT keypairs.
const mig = await client.migration.migrateToDammV2({
  payer: serverWallet.address,   // Momento partner / fee-payer (platform action)
  pool:  dbcPoolAddress,
  dammConfig,
});
// mig.firstPositionNftKeypair  -> PARTNER (Momento) locked LP
// mig.secondPositionNftKeypair -> CREATOR locked LP

// 2. Sign + self-submit via the Phase-2 layer. The two NFT keypairs are EPHEMERAL co-signers.
const built: BuiltTx = {
  tx: mig.transaction,
  signers: [serverSigner(), ephemeralSigner(mig.firstPositionNftKeypair), ephemeralSigner(mig.secondPositionNftKeypair)],
  label: `graduate:migrate:${tokenId}`,
};
const res = await submit(built, { route: 'sender', idempotencyKey: `graduate:migrate:${tokenId}` });
```

- **Signer composition is exactly the proven pattern**: `serverSigner()` (Privy server wallet,
  partner/fee-payer) + two `ephemeralSigner(keypair)` for the position NFTs — same shape as spike-b's
  `signAndSend(conn, mig.transaction, partner, [partnerPositionNft, creatorPositionNft])` and the
  Streamflow `[payer, metadata]` co-sign that `applySigners` already supports.
- **Caller-supplied `idempotencyKey = graduate:migrate:<tokenId>`** — stable across retries and
  independent of blockhash, so a re-tick after a transport hiccup short-circuits on the durable store
  instead of broadcasting a second migrate. `submit()` is **fail-closed**: it refuses a server-signed
  broadcast without the Redis store, which is exactly the at-most-once guarantee graduation needs.
- **Resolve the DAMM v2 pool** (spike-b `resolveDammV2Pool` via `cpAmm.getPositionsByUser` /
  `deriveDammV2PoolAddress`). `TODO(verify-devnet)`: position→pool field name.

**Locking (per the split):**
- The migrate per the config's `*PermanentLockedLiquidityPercentage` typically perma-locks at the
  program level, producing the two NFTs already permanently locked. Verify with
  `cpAmm.isPermanentLockedPosition(positionState)` (spike-b STEP 5). If a position is **not** already
  perma-locked (e.g. a config with an unlocked `*LiquidityPercentage` leg that Momento still wants
  bound), issue `cpAmm.permanentLockPosition({ owner, position, positionNftAccount, pool,
  unlockedLiquidity })` and/or a **Jupiter Lock** (`spike-c`, zero-fee, ephemeral `base` co-signer)
  for any leg that should be time-locked-with-claimable-fees rather than perma-locked.
- `TODO(verify-devnet)`: whether DBC migrate emits the NFTs already perma-locked for the
  `partner_locked_lp` / `creator_locked_lp` legs, or whether the keeper must call
  `permanentLockPosition` explicitly. spike-b inspects but does not assert it.

**Persist BOTH `LpPosition` rows** (committed schema, `@@unique([tokenId, owner])`):

| field | PARTNER row | CREATOR row |
|---|---|---|
| `owner` | `PARTNER` | `CREATOR` |
| `ownerWallet` | Momento `fee_claimer` (treasury) | creator wallet |
| `provider` | `METEORA_DAMM_V2` | `METEORA_DAMM_V2` |
| `poolAddress` | DAMM v2 pool | DAMM v2 pool |
| `positionNftMint` | `firstPositionNftKeypair.publicKey` | `secondPositionNftKeypair.publicKey` |
| `positionAddress` | derived position PDA | derived position PDA |
| `locked` | `true` | `true` |
| `lockedUntil` | `null` (perma) or Jup-Lock end | `null` or Jup-Lock end |
| `createSignature` | migrate tx signature | migrate tx signature (same tx) |

Both rows share the **same `createSignature`** (one migrate tx creates both). The `positionNftMint`
unique + `@@unique([tokenId, owner])` make the persist idempotent: re-running §4.3 upserts the same
two rows. `liquidity` / reserve fields are best-effort from `cpAmm.fetchPoolState` /
`getUserPositionByPool` (`TODO(verify-devnet)` field names).

### 4.4 Detect-existing-pool path

If `migrateToDammV2` throws "already migrated" (the managed keeper beat us), the keeper does **not**
treat it as failure: resolve the existing DAMM v2 pool + the two positions (`getUserPositionByPool`
for partner + creator wallets), persist the `LpPosition` rows from on-chain state, and finalize. This
is the §4.2-step-3 recovery path generalized to "someone else migrated".

---

## 5. Partial-graduation failure handling & idempotency

The migrate-then-lock-then-persist sequence can fail at any point. The recovery contract:

| Failure point | Observable state | Recovery on next tick |
|---|---|---|
| Before migrate broadcast | `FINALIZING`, no `finalizeSignature` | re-enter §4.3; `submit()` idempotency key reserves once |
| Migrate broadcast, confirm unknown (`TIMEOUT`) | `FINALIZING`, store may hold sig | `submit()` dedups on the key → returns landed sig; proceed to persist |
| Migrate confirmed, crash before persist | `FINALIZING`, on-chain pool exists | §4.4 detect-existing-pool → persist from chain → finalize |
| One `LpPosition` saved, other not | `FINALIZING`, one row present | upsert both (idempotent on `positionNftMint`); finalize |
| Locked, persisted, crash before finalize | `FINALIZING`, both rows present, no `COMPLETED` | re-derive from rows → set `COMPLETED` (no on-chain work) |
| Lock leg failed (perma-lock/Jup-Lock) | `FINALIZING`, positions exist unlocked | retry lock ix (idempotent: `isPermanentLockedPosition` check first) |

**Three idempotency layers, all required:**
1. **DB lease** (`FINALIZING` + `finalizeStartedAt`, §4.2) — one worker per token per LEASE_TTL;
   prevents concurrent migrates across overlapping cron ticks.
2. **`submit()` durable Redis store** — at-most-once *broadcast* of the migrate tx across serverless
   instances (fail-closed; reuses Phase-2 `idempotency.ts`).
3. **On-chain + unique constraints** — `finalizeSignature` unique, `positionNftMint` unique,
   `@@unique([tokenId, owner])`, and the program's own "already migrated" rejection are the durable
   backstop if both software layers are bypassed.

**Never double-migrate** is the conjunction: even if the lease and Redis both fail, the DBC program
rejects a second migrate on a graduated pool, and §4.4 converts that into the recovery path.

Errors are surfaced (route returns counts incl. `failed`; structured log per token) so monitoring
fires; a token stuck in `FINALIZING` past N ticks is an alert, not a silent loop.

---

## 6. Worked $-example (raise $X → LP $Y / treasury $Z / creator N tokens)

Config (research/15 §6.3 defaults): USDC-quoted, `thresholdBaseUnits = 12_000_000000` ($12,000 at
6 dp), `token_supply = 1,000,000,000`, 800M sold on curve / 200M reserved for migration,
`leftoverReceiver = creator`, LP **100% locked split 50/50**
(`partnerLockedLpBps=5000`, `creatorLockedLpBps=5000`, `partnerLpBps=0`, `creatorLpBps=0`),
`migrationFeeBps = 100` (1% graduated-pool swap fee).

| At graduation | Amount | Destination | Persisted as |
|---|---|---|---|
| Quote raised (X) | ~$12,000 USDC | paired into DAMM v2 pool as LP | `LpPosition.quoteReserveBaseUnits` (split across 2 rows) |
| Token to LP (Y, token side) | 200,000,000 tokens | paired against the USDC | `LpPosition.baseReserveBaseUnits` |
| LP — partner leg | 50% of LP, perma-locked | Momento `fee_claimer`, fees claimable forever | PARTNER `LpPosition` (`positionNftMint = first…`, `locked=true`) |
| LP — creator leg | 50% of LP, perma-locked | creator wallet, fees claimable forever | CREATOR `LpPosition` (`positionNftMint = second…`, `locked=true`) |
| Last-swap surplus (Z, treasury) | small USDC residual | partner (Momento) + Meteora protocol | observed later via fee-claim cron (`SURPLUS` FeeEvent) |
| Leftover supply (N tokens → creator) | any unsold/unallocated | `leftoverReceiver` = creator (direct tokens) | not an LpPosition; direct transfer the program performs |

So a single launch yields Momento (a) ~40% of pre-grad curve fees (the 80% LP-fee × 50% partner share,
recorded by `attribute2080` during trading — *separate* from this module), (b) a perma-locked 50% LP
fee claim post-grad, (c) a slice of the migration surplus; the creator gets the mirror image **plus**
the leftover tokens. **This module's job is to land (b) on-chain and record both `LpPosition` rows so
the fee-claim cron can realize the ongoing streams.**

> Note the two axes do not mix: the **fee** 20/80 split (`attribute2080`, `creator/partnerTradingFeeBps`)
> governs *trading-fee dollars*; the **LP** split (`*LpBps`) governs *which lock account owns the
> migrated liquidity*. Graduation touches only the second.

---

## 7. `lib/graduation.ts` interface (paste-ready signatures)

```ts
// apps/api/lib/graduation.ts — T-graduation (Phase 3A)
import type { SubmitResult } from '@/lib/solana';

/** Authoritative confirmed raise (bigint base units, quote mint) for a fundraise. */
export interface RaisedProgress {
  tokenId: string;
  quoteMint: string;
  raisedBaseUnits: string;      // confirmed sum (contributions + curve BUY quote-in)
  thresholdBaseUnits: string;
  pct: number;                  // 0..100, display
  thresholdMet: boolean;
  contributorCount: number;
  status: 'DRAFT'|'ACTIVE'|'THRESHOLD_MET'|'FINALIZING'|'COMPLETED'|'FAILED'|'REFUNDED';
}

/** Recompute confirmed raise from Trade + FundraiseContribution rows (§3.1). */
export function getRaisedProgress(tokenId: string): Promise<RaisedProgress>;

/** Flip ACTIVE → THRESHOLD_MET when confirmed raise >= threshold (idempotent, conditional). */
export function detectThresholdMet(tokenId: string): Promise<boolean>;

/** Result of graduating ONE token. */
export interface GraduationResult {
  tokenId: string;
  outcome: 'finalized' | 'retried' | 'skipped' | 'already-completed' | 'failed';
  migrateSignature?: string;
  dammV2Pool?: string;
  partnerPositionNftMint?: string;
  creatorPositionNftMint?: string;
  error?: string;
}

/**
 * Graduate ONE token end-to-end (idempotent): lease → migrate → lock → persist
 * both LpPositions → finalize. Safe to call repeatedly; never double-migrates.
 */
export function graduateToken(tokenId: string): Promise<GraduationResult>;

/** Keeper sweep: detect threshold, then graduate all THRESHOLD_MET/FINALIZING tokens. */
export function runGraduationSweep(opts?: { limit?: number }): Promise<{
  detected: number; finalized: number; retried: number; failed: number;
  results: GraduationResult[];
}>;
```

Keeper route (`apps/api/app/api/cron/graduate/route.ts`) is a thin auth shell over
`runGraduationSweep()` — mirror `cron/fee-claim/route.ts` auth + response envelope exactly.

---

## 8. Schema delta (one additive field) & env

Additive only (forward migration; never `db push` — Phase-2 R4 discipline):

```prisma
model TokenFundraise {
  // ...existing...
  finalizeStartedAt DateTime?   // graduation lease timestamp (§4.2 idempotency)
}
```

Everything else reuses committed fields: `raisedBaseUnits`, `thresholdBaseUnits`, `status`,
`partnerLpBps`/`creatorLpBps`/`partnerLockedLpBps`/`creatorLockedLpBps`, `migrationFeeBps`,
`leftoverReceiver`, `finalizeSignature`, `finalizedAt`; `LpPosition.*`; `CreatorToken.status`/
`graduatedAt`/`poolType`/`poolAddress`. No new enums.

Env: reuses `CRON_SECRET`, Privy server-wallet vars, `UPSTASH_REDIS_*` (durable idempotency,
fail-closed), Helius RPC. New cron entry in `vercel.json` only.

---

## 9. Cross-module dependencies

| Depends on | Why | Status |
|---|---|---|
| `lib/solana` (`serverSigner`, `ephemeralSigner`, `submit`, `getConnection`, durable idempotency) | sign + self-submit the migrate tx (platform action); at-most-once broadcast | committed Phase 2 (live Privy wiring = `TODO(ops)`) |
| `helius-webhook.ts` | source of confirmed contributions / curve BUYs; needs the additive `raisedBaseUnits` increment (§3.2) | committed; one additive edit (coordinate with **T-fees**) |
| Phase 2 schema (`TokenFundraise`, `LpPosition`, `CreatorToken`, `FundraiseContribution`, `Trade`) | reads raise, writes both positions + finalize | committed; +1 additive field (§8) |
| `@meteora-ag/dynamic-bonding-curve-sdk` / `@meteora-ag/cp-amm-sdk` | `migrateToDammV2`, `permanentLockPosition`, position/pool readers | versions pinned in spike-b (1.5.10 / 1.4.3) |
| Jupiter Lock (Anchor + IDL) | optional time-lock-with-claimable-fees leg | spike-c; `JUP_LOCK_*` env |

| Depended on by | Why |
|---|---|
| Fee-claim cron (Phase 2 seam → Phase 3) | reads the two `LpPosition` rows to `claimPositionFee` / `claimPartnerTradingFee` post-grad |
| Token launch module (Phase 3) | must bake the same `*LpBps` / `leftoverReceiver` into the DBC config so the migrate produces the split this module records |
| Mobile/API token detail | `getRaisedProgress` powers the fundraise progress UI |

---

## 10. Open items / `TODO(verify-devnet)`

1. **Curve quote-in visibility** — does the DBC buy surface USDC in Helius `tokenTransfers`
   (`verifyOnChain`)? If not, read the virtual-pool quote reserve via `client.state` (§3.2/§3.3).
2. **Auto perma-lock** — does `migrateToDammV2` emit the partner/creator NFTs already
   perma-locked for the `*_locked_lp` legs, or must the keeper call `permanentLockPosition`? (§4.3)
3. **`DAMM_V2_MIGRATION_FEE_ADDRESS` index** vs `migrationFeeBps` tier mapping (spike-b STEP 5 TODO).
4. **Pool/position readers** — `resolveDammV2Pool` position→pool field; `fetchPoolState` /
   `getUserPositionByPool` field names for reserve/liquidity persistence (spike-b TODOs).
5. **Managed migrator race** — confirm devnet behavior; if Meteora's keeper auto-migrates, §4.4
   detect-existing-pool must reliably find both positions by partner + creator wallet.
6. **Privy multi-signer** (carried from Phase 2 OPEN) — `submit()`/`applySigners` re-attach the
   ephemeral NFT signatures after the server sign; must verify `@privy-io/node` preserves them, else
   route the migrate through a fallback (D-signer §4). Blocks live graduation.
7. **Surplus split %** — partner vs protocol residual ratio (research/15 §7); recorded by fee-claim
   cron, not this module, but affects the worked-example treasury (Z) line.
