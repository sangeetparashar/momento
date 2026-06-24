/**
 * apps/api/lib/graduation.ts — Phase 3A · P3-graduation (owner: this task)
 * =============================================================================
 * Threshold-fundraise tracking, graduation (DBC → DAMM v2), LP-split realization.
 *
 * Two responsibilities (D-graduation §0):
 *   1. Track the CONFIRMED quote (USDC) raise toward `thresholdBaseUnits` and flip
 *      `TokenFundraise.status` ACTIVE → THRESHOLD_MET (getRaisedProgress /
 *      detectThresholdMet). The authoritative raise is recomputed from confirmed
 *      `Trade` + `FundraiseContribution` rows — NEVER the cached
 *      `TokenFundraise.raisedBaseUnits` counter (D-graduation §3.1).
 *   2. An idempotent keeper (graduateToken / runGraduationSweep) that, when the
 *      threshold is met, calls Meteora `migration.migrateToDammV2`, locks the LP,
 *      persists BOTH `LpPosition` rows (PARTNER + CREATOR), and finalizes
 *      `CreatorToken.status=GRADUATED` + `TokenFundraise.status=COMPLETED`.
 *
 * IDEMPOTENCY (D-graduation §5, three layers, all required):
 *   1. DB lease — `status=FINALIZING` + `finalizeStartedAt` claimed by a
 *      conditional update (one worker per token per LEASE_TTL).
 *   2. `submit()` durable Redis store — at-most-once BROADCAST of the migrate tx
 *      (fail-closed; caller-supplied `idempotencyKey=graduate:migrate:<tokenId>`).
 *   3. On-chain + unique constraints — `finalizeSignature` unique,
 *      `positionNftMint` unique, `@@unique([tokenId, owner])`, and the program's
 *      own "already migrated" rejection (→ §4.4 detect-existing-pool recovery).
 *
 * Solana-only. @solana/web3.js v1. attribute2080 is NOT used here (that splits a
 * fee dollar during trading; LP allocation is a different axis — D-graduation §6).
 *
 * IMPORT-SAFE: the Meteora SDKs are imported at top-level (per the contract +
 * matching the sibling lib/launch.ts convention; dev-machine dep list, §g.3:
 * @meteora-ag/dynamic-bonding-curve-sdk@1.5.10, @meteora-ag/cp-amm-sdk@1.4.3).
 * NO env/network read happens at module top-level — every SDK client is
 * constructed with a Connection INSIDE a function.
 */

import { PublicKey } from '@solana/web3.js';
import type { Keypair, Transaction } from '@solana/web3.js';
// Meteora DBC SDK (@meteora-ag/dynamic-bonding-curve-sdk@1.5.10) — signatures
// verified verbatim in spike-b-meteora-dbc.ts.
import {
  DynamicBondingCurveClient,
  MigrationFeeOption,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
// Meteora DAMM v2 SDK (@meteora-ag/cp-amm-sdk@1.4.3) — locked-LP position reader.
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import prisma from '@/lib/prisma';
import {
  serverSigner,
  ephemeralSigner,
  submit,
  getConnection,
  SolanaTxError,
  classify,
  type BuiltTx,
  type Signer,
} from '@/lib/solana';

// ── Public interface (CONTRACTS-P3A §b.3 / D-graduation §7) ─────────────────

export interface RaisedProgress {
  tokenId: string;
  quoteMint: string;
  raisedBaseUnits: string; // confirmed sum (contributions + curve BUY quote-in)
  thresholdBaseUnits: string;
  pct: number; // 0..100, display
  thresholdMet: boolean;
  contributorCount: number;
  status: 'DRAFT' | 'ACTIVE' | 'THRESHOLD_MET' | 'FINALIZING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
}

export interface GraduationResult {
  tokenId: string;
  outcome: 'finalized' | 'retried' | 'skipped' | 'already-completed' | 'failed';
  migrateSignature?: string;
  dammV2Pool?: string;
  partnerPositionNftMint?: string;
  creatorPositionNftMint?: string;
  error?: string;
}

// ── Tunables ────────────────────────────────────────────────────────────────

/** `finalizeStartedAt` lease TTL (D-graduation §4.2). Env-overridable; default 10 min. */
function leaseTtlMs(): number {
  const raw = Number(process.env.GRADUATION_LEASE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 600_000;
}

/** Default candidates per sweep tick. */
const DEFAULT_SWEEP_LIMIT = 10;

// =============================================================================
// 1. Raised tracking & threshold detection (D-graduation §3)
// =============================================================================

/**
 * Sum the CONFIRMED quote (USDC) raise for a fundraise from the two confirmed
 * ledgers the webhook already produced (D-graduation §3.1). Both are USDC base
 * units in the SAME quote mint, so summing is safe (lib/fees.ts invariant: never
 * sum base units across mints):
 *   - FundraiseContribution: blockTime != null, refunded = false.
 *   - Trade: venue = METEORA_DBC, side = BUY, blockTime != null, amountInMint ==
 *     quoteMint (quote-in == USDC raised).
 *
 * Returns the bigint raise + a distinct-contributor count (wallets across both
 * ledgers). The cached `TokenFundraise.raisedBaseUnits` counter is NEVER trusted
 * for the decision — a lost increment must not strand a graduation, and a
 * double-counted one must not trigger a premature migrate.
 */
async function computeConfirmedRaise(
  tokenId: string,
  quoteMint: string,
): Promise<{ raised: bigint; contributorCount: number }> {
  const [contributions, buys] = await Promise.all([
    prisma.fundraiseContribution.findMany({
      where: { tokenId, refunded: false, blockTime: { not: null }, quoteMint },
      select: { amountBaseUnits: true, walletAddress: true },
    }),
    prisma.trade.findMany({
      where: {
        tokenId,
        venue: 'METEORA_DBC',
        side: 'BUY',
        blockTime: { not: null },
        amountInMint: quoteMint,
      },
      select: { amountInBaseUnits: true, traderWallet: true },
    }),
  ]);

  let raised = BigInt(0);
  const wallets = new Set<string>();

  for (const c of contributions) {
    raised += safeBigInt(c.amountBaseUnits);
    if (c.walletAddress) wallets.add(c.walletAddress);
  }
  for (const t of buys) {
    raised += safeBigInt(t.amountInBaseUnits);
    if (t.traderWallet) wallets.add(t.traderWallet);
  }

  return { raised, contributorCount: wallets.size };
}

/** Parse a base-unit string to bigint, defaulting to 0n on garbage (defensive). */
function safeBigInt(v: string | null | undefined): bigint {
  if (!v) return BigInt(0);
  try {
    return BigInt(v);
  } catch {
    return BigInt(0);
  }
}

/** 0..100 integer percent of raised/threshold (display only; clamps at 100). */
function pctOf(raised: bigint, threshold: bigint): number {
  if (threshold <= BigInt(0)) return raised > BigInt(0) ? 100 : 0;
  const pct = Number((raised * BigInt(10000)) / threshold) / 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Authoritative confirmed-raise read model (powers the fundraise progress UI and
 * the keeper's threshold decision). Recomputes from confirmed rows (§3.1).
 */
export async function getRaisedProgress(tokenId: string): Promise<RaisedProgress> {
  const fundraise = await prisma.tokenFundraise.findUnique({ where: { tokenId } });
  if (!fundraise) {
    throw new SolanaTxError('CONFIG_MISSING', `No TokenFundraise for token ${tokenId}`);
  }

  const { raised, contributorCount } = await computeConfirmedRaise(tokenId, fundraise.quoteMint);
  const threshold = safeBigInt(fundraise.thresholdBaseUnits);

  return {
    tokenId,
    quoteMint: fundraise.quoteMint,
    raisedBaseUnits: raised.toString(),
    thresholdBaseUnits: fundraise.thresholdBaseUnits,
    pct: pctOf(raised, threshold),
    thresholdMet: raised >= threshold,
    contributorCount,
    status: fundraise.status,
  };
}

/**
 * Flip ACTIVE → THRESHOLD_MET when the CONFIRMED raise >= threshold (§3.3).
 * Idempotent: the conditional `WHERE status='ACTIVE'` makes a second tick a 0-row
 * no-op (it already sees THRESHOLD_MET). Returns true iff THIS call performed the
 * flip. Does NOT migrate — that is the keeper's job (graduateToken).
 */
export async function detectThresholdMet(tokenId: string): Promise<boolean> {
  const fundraise = await prisma.tokenFundraise.findUnique({ where: { tokenId } });
  if (!fundraise || fundraise.status !== 'ACTIVE') return false;

  const { raised } = await computeConfirmedRaise(tokenId, fundraise.quoteMint);
  if (raised < safeBigInt(fundraise.thresholdBaseUnits)) return false;

  // Conditional update: only the worker that observes ACTIVE flips it.
  const res = await prisma.tokenFundraise.updateMany({
    where: { id: fundraise.id, status: 'ACTIVE' },
    data: { status: 'THRESHOLD_MET' },
  });
  return res.count === 1;
}

// =============================================================================
// 2. The keeper — graduate ONE token end-to-end (idempotent) (D-graduation §4)
// =============================================================================

/**
 * Graduate ONE token: lease → migrate → lock → persist both LpPositions →
 * finalize. Safe to call repeatedly; NEVER double-migrates (three idempotency
 * layers, §5). Returns a structured GraduationResult; never throws for an
 * expected on-chain failure (it records `outcome:'failed'` + `error` so the
 * sweep can surface counts for monitoring).
 */
export async function graduateToken(tokenId: string): Promise<GraduationResult> {
  const base: GraduationResult = { tokenId, outcome: 'skipped' };

  let fundraise = await prisma.tokenFundraise.findUnique({ where: { tokenId } });
  if (!fundraise) {
    return { ...base, outcome: 'failed', error: 'No TokenFundraise for token' };
  }

  // Terminal: already done. Idempotent no-op.
  if (fundraise.status === 'COMPLETED') {
    return { ...base, outcome: 'already-completed' };
  }

  // Only THRESHOLD_MET / FINALIZING are candidates (a FINALIZING row is a crashed
  // or in-flight prior attempt we re-enter; everything else we skip).
  if (fundraise.status !== 'THRESHOLD_MET' && fundraise.status !== 'FINALIZING') {
    return { ...base, outcome: 'skipped' };
  }

  // (§4.2.1) Re-confirm raise >= threshold from CONFIRMED rows. Guards a
  // wrongly-flipped row (e.g. a future refund path) from migrating.
  const { raised } = await computeConfirmedRaise(tokenId, fundraise.quoteMint);
  if (raised < safeBigInt(fundraise.thresholdBaseUnits)) {
    return { ...base, outcome: 'skipped', error: 'raise below threshold on re-check' };
  }

  // (§4.2.2) Claim the lease — atomic conditional update. A fresh lease held by
  // another worker → 0 rows → skip (no double-migrate across overlapping ticks).
  const claimed = await claimLease(fundraise.id);
  if (!claimed) {
    return { ...base, outcome: 'skipped', error: 'lease held by another worker' };
  }

  // Whether we re-entered a row that already held a lease (retry) vs. a fresh
  // THRESHOLD_MET claim (first attempt). Drives the result outcome.
  const isRetry = fundraise.status === 'FINALIZING';

  // Re-read post-claim so we see the freshest finalizeSignature for short-circuit.
  fundraise = await prisma.tokenFundraise.findUnique({ where: { tokenId } });
  if (!fundraise) {
    return { ...base, outcome: 'failed', error: 'fundraise vanished after lease claim' };
  }

  const token = await prisma.creatorToken.findUnique({ where: { id: tokenId } });
  if (!token || !token.dbcPoolAddress) {
    return { ...base, outcome: 'failed', error: 'token missing dbcPoolAddress (launch incomplete)' };
  }

  try {
    // (§4.2.3) Short-circuit: a recorded finalizeSignature means migrate already
    // landed in a prior tick — re-run persistence ONLY (recovery), never migrate.
    if (fundraise.finalizeSignature) {
      const recovered = await recoverFromChain(tokenId, token);
      // (SEC P1-2 / fix #4) Do NOT finalize unless the LP lock is VERIFIED for both
      // legs. An unverified or unlocked leg keeps the row FINALIZING (lease expires
      // → next tick retries); we never synthesize a locked/COMPLETED state.
      if (!isLockSatisfied(recovered)) {
        return {
          ...base,
          outcome: 'retried',
          error: lockBreadcrumb('recover', recovered),
          migrateSignature: fundraise.finalizeSignature,
          dammV2Pool: recovered.dammV2Pool ?? undefined,
          partnerPositionNftMint: recovered.partnerNftMint ?? undefined,
          creatorPositionNftMint: recovered.creatorNftMint ?? undefined,
        };
      }
      await finalize(tokenId, fundraise.finalizeSignature, recovered.dammV2Pool);
      return {
        ...base,
        outcome: 'retried',
        migrateSignature: fundraise.finalizeSignature,
        dammV2Pool: recovered.dammV2Pool ?? undefined,
        partnerPositionNftMint: recovered.partnerNftMint ?? undefined,
        creatorPositionNftMint: recovered.creatorNftMint ?? undefined,
      };
    }

    // (§4.3) Migrate + realize + lock + persist both LpPositions.
    const done = await migrateAndPersist(tokenId, token, fundraise);

    // (SEC P1-2 / fix #4) Gate finalize on a REAL migrate signature AND a VERIFIED
    // lock for both legs. The already-migrated recovery branch can return a null
    // signature (no sig of our own) — that alone keeps the row FINALIZING. We never
    // mark COMPLETED/GRADUATED on a fabricated signature or an unverified lock.
    if (!done.migrateSignature || !isLockSatisfied(done)) {
      return {
        ...base,
        outcome: 'retried',
        error: !done.migrateSignature
          ? 'no migrate signature resolved (already-migrated recovery); kept FINALIZING'
          : lockBreadcrumb('migrate', done),
        migrateSignature: done.migrateSignature ?? undefined,
        dammV2Pool: done.dammV2Pool ?? undefined,
        partnerPositionNftMint: done.partnerNftMint ?? undefined,
        creatorPositionNftMint: done.creatorNftMint ?? undefined,
      };
    }

    // (§4.2.6) Finalize: COMPLETED + finalizeSignature + GRADUATED + DAMM v2 pool.
    await finalize(tokenId, done.migrateSignature, done.dammV2Pool);

    return {
      ...base,
      outcome: isRetry ? 'retried' : 'finalized',
      migrateSignature: done.migrateSignature,
      dammV2Pool: done.dammV2Pool ?? undefined,
      partnerPositionNftMint: done.partnerNftMint ?? undefined,
      creatorPositionNftMint: done.creatorNftMint ?? undefined,
    };
  } catch (err) {
    const e = classify(err);
    // The row stays in FINALIZING (lease will expire after LEASE_TTL) so the next
    // tick re-enters and the idempotency layers make the re-attempt safe. We do
    // NOT release the lease here — a crashed/timed-out migrate must keep the lease
    // until TTL to avoid a competing concurrent broadcast within the same window.
    return { ...base, outcome: 'failed', error: `${e.code}: ${e.message}` };
  }
}

/**
 * Atomic lease claim (D-graduation §4.2 step 2):
 *   UPDATE TokenFundraise SET status='FINALIZING', finalizeStartedAt=now()
 *   WHERE id=? AND status IN ('THRESHOLD_MET','FINALIZING')
 *     AND (finalizeStartedAt IS NULL OR finalizeStartedAt < now()-LEASE_TTL)
 * 0 rows → another worker holds a fresh lease → caller skips.
 */
async function claimLease(fundraiseId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - leaseTtlMs());
  const res = await prisma.tokenFundraise.updateMany({
    where: {
      id: fundraiseId,
      status: { in: ['THRESHOLD_MET', 'FINALIZING'] },
      OR: [{ finalizeStartedAt: null }, { finalizeStartedAt: { lt: cutoff } }],
    },
    data: { status: 'FINALIZING', finalizeStartedAt: new Date() },
  });
  return res.count === 1;
}

// ── On-chain migration + LP realization (reuse spike-b verbatim) (§4.3) ──────

interface MigrateOutcome {
  migrateSignature: string | null;
  dammV2Pool: string | null;
  partnerNftMint: string | null;
  creatorNftMint: string | null;
  // Per-leg verified lock state + whether the verification itself succeeded.
  // `finalize` is gated on `lockVerified && partnerLocked && creatorLocked`
  // (SEC P1-2 / fix #4): an unverified or unlocked leg keeps the row FINALIZING.
  partnerLocked: boolean;
  creatorLocked: boolean;
  lockVerified: boolean;
}

/**
 * Build + sign + self-submit the migrate tx, lock the LP per the config split,
 * and persist BOTH LpPosition rows. Reuses spike-b verbatim:
 *   client.migration.migrateToDammV2({ payer, pool, dammConfig })
 *     -> { transaction, firstPositionNftKeypair (PARTNER), secondPositionNftKeypair (CREATOR) }
 *   signers = [serverSigner(), ephemeralSigner(first), ephemeralSigner(second)]
 *   submit(built, { route:'sender', idempotencyKey:`graduate:migrate:<tokenId>` })
 *
 * If migrateToDammV2 throws "already migrated" (the managed keeper beat us), we
 * fall through to the detect-existing-pool path (§4.4) instead of failing.
 */
async function migrateAndPersist(
  tokenId: string,
  token: { dbcPoolAddress: string | null },
  fundraise: { migrationFeeBps: number | null },
): Promise<MigrateOutcome> {
  // Env/network access stays inside the function (Connection-bound SDK clients).
  const connection = getConnection();
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const cpAmm = new CpAmm(connection);

  const dbcPool = new PublicKey(token.dbcPoolAddress as string);

  // migrationFeeBps → MigrationFeeOption tier → DAMM_V2_MIGRATION_FEE_ADDRESS[idx].
  const migrationFeeOption = migrationFeeOptionFor(fundraise.migrationFeeBps);
  // TODO(verify-devnet): exact DAMM_V2_MIGRATION_FEE_ADDRESS index semantics vs
  // the Customizable tier (spike-b STEP 5 TODO).
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[migrationFeeOption as number];

  const payer = serverSigner(); // Momento partner / fee-payer (platform action)

  let partnerNft: Keypair;
  let creatorNft: Keypair;
  let migrateTx: Transaction;

  try {
    // migrateToDammV2 returns the tx + the TWO locked-LP position-NFT keypairs.
    const mig = await client.migration.migrateToDammV2({
      payer: payer.publicKey,
      pool: dbcPool,
      dammConfig,
    });
    partnerNft = mig.firstPositionNftKeypair; // PARTNER (Momento) locked LP
    creatorNft = mig.secondPositionNftKeypair; // CREATOR locked LP
    migrateTx = mig.transaction;
  } catch (err) {
    // (§4.4) "already migrated" → the managed keeper beat us. Recover from chain.
    if (isAlreadyMigrated(err)) {
      const recovered = await recoverFromChain(tokenId, token);
      // We have NO migrate signature of our own. Use the existing finalizeSignature
      // if present, else NULL — never a synthetic `external-migrate:` placeholder
      // in the @unique column (correctness/SEC P1-6/P1-4). finalize() is gated on a
      // REAL finalizeSignature + verified lock, so a null sig here keeps the row
      // FINALIZING for the next tick rather than finalizing on a fabricated value.
      const existing = await prisma.tokenFundraise.findUnique({ where: { tokenId } });
      const sig = existing?.finalizeSignature ?? null;
      return {
        migrateSignature: sig,
        dammV2Pool: recovered.dammV2Pool,
        partnerNftMint: recovered.partnerNftMint,
        creatorNftMint: recovered.creatorNftMint,
        partnerLocked: recovered.partnerLocked,
        creatorLocked: recovered.creatorLocked,
        lockVerified: recovered.lockVerified,
      };
    }
    throw err;
  }

  // Signer composition is exactly the proven spike-b pattern: serverSigner
  // (Privy partner/fee-payer) + two ephemeralSigner(keypair) for the position
  // NFTs. submit() runs applySigners (ephemerals first; server signs; ephemeral
  // sigs re-attached + verified).
  const signers: Signer[] = [
    payer,
    ephemeralSigner(partnerNft),
    ephemeralSigner(creatorNft),
  ];
  const built: BuiltTx = {
    tx: migrateTx,
    signers,
    label: `graduate:migrate:${tokenId}`,
  };

  // Caller-supplied idempotencyKey is stable across retries and independent of
  // blockhash, so a re-tick after a transport hiccup short-circuits on the
  // durable store instead of broadcasting a SECOND migrate. submit() is
  // fail-closed: it refuses a server-signed broadcast without the Redis store —
  // exactly the at-most-once guarantee graduation needs.
  const res = await submit(built, {
    route: 'sender',
    idempotencyKey: `graduate:migrate:${tokenId}`,
  });
  const migrateSignature = res.signature;

  // Persist finalizeSignature EARLY (after broadcast confirms) so a crash before
  // persist still leaves the short-circuit recovery breadcrumb (§4.2 step 3).
  // finalizeSignature is @unique → idempotent across re-runs.
  await prisma.tokenFundraise.updateMany({
    where: { tokenId, finalizeSignature: null },
    data: { finalizeSignature: migrateSignature },
  });

  // Resolve the new DAMM v2 pool (spike-b resolveDammV2Pool via
  // getPositionsByUser). TODO(verify-devnet): position→pool field name.
  const dammV2Pool = await resolveDammV2Pool(cpAmm, payer.publicKey);

  // Lock per the split. The migrate per the config's
  // *PermanentLockedLiquidityPercentage typically perma-locks at the program
  // level, producing the two NFTs already permanently locked. We VERIFY and only
  // issue an explicit lock for a leg that is NOT already perma-locked.
  // TODO(verify-devnet): whether DBC migrate emits the NFTs already perma-locked
  // for the *_locked_lp legs, or whether the keeper must call
  // permanentLockPosition explicitly (spike-b STEP 5; D-graduation §4.3 / §10.2).
  await lockIfNeeded(cpAmm, payer, dammV2Pool, migrateSignature, tokenId);

  // Persist BOTH LpPosition rows (committed schema, @@unique([tokenId, owner])).
  const { partnerWallet, creatorWallet } = await resolveOwnerWallets(tokenId);
  const dammPoolStr = dammV2Pool ? dammV2Pool.toBase58() : '';
  const partnerNftMint = partnerNft.publicKey.toBase58();
  const creatorNftMint = creatorNft.publicKey.toBase58();

  // SEC P1-2 / fix #4: VERIFY the on-chain lock per leg; persist the honest state.
  // Do NOT blindly mark locked:true. `finalize` (the caller via graduateToken)
  // refuses to finalize unless BOTH legs verify locked, so an unverified lock
  // leaves the row FINALIZING for the next tick rather than synthesizing a locked
  // state.
  const lockState = await verifyLockState(cpAmm, dammV2Pool, payer.publicKey, creatorWallet);

  await persistLpPositions({
    tokenId,
    poolAddress: dammPoolStr,
    partnerWallet,
    creatorWallet,
    partnerNftMint,
    creatorNftMint,
    migrateSignature,
    partnerLocked: lockState.partnerLocked,
    creatorLocked: lockState.creatorLocked,
  });

  return {
    migrateSignature,
    dammV2Pool: dammV2Pool ? dammV2Pool.toBase58() : null,
    partnerNftMint,
    creatorNftMint,
    partnerLocked: lockState.partnerLocked,
    creatorLocked: lockState.creatorLocked,
    lockVerified: lockState.verified,
  };
}

/**
 * Map TokenFundraise.migrationFeeBps to the SDK MigrationFeeOption enum tier.
 * Tiers (spike-b): FixedBps25=0, FixedBps30=1, FixedBps100=2, FixedBps200=3,
 * FixedBps400=4, FixedBps600=5. Default tier = FixedBps100 (1%) per
 * MOMENTO_LAUNCH.DEFAULT_MIGRATION_FEE_BPS.
 * TODO(verify-devnet): confirm enum values against the installed SDK (§10.3).
 */
function migrationFeeOptionFor(migrationFeeBps: number | null | undefined): number {
  const M = MigrationFeeOption;
  switch (migrationFeeBps) {
    case 25:
      return M.FixedBps25;
    case 30:
      return M.FixedBps30;
    case 100:
      return M.FixedBps100;
    case 200:
      return M.FixedBps200;
    case 400:
      return M.FixedBps400;
    case 600:
      return M.FixedBps600;
    default:
      return M.FixedBps100; // 1% default (DEFAULT_MIGRATION_FEE_BPS)
  }
}

/** Heuristic for the DBC "already migrated" rejection (→ recovery path §4.4). */
function isAlreadyMigrated(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('already migrated') ||
    msg.includes('alreadymigrated') ||
    msg.includes('pool already') ||
    msg.includes('migration already') ||
    msg.includes('already graduated')
  );
}

/**
 * Best-effort: attempt to lock any LP leg that the migrate did not already
 * perma-lock (spike-b STEP 5). Idempotent: `isPermanentLockedPosition` check
 * first, so a re-tick that finds the positions already locked does nothing
 * (D-graduation §5 — "retry lock ix").
 *
 * NOTE (SEC P1-2 / fix #4): this is the ATTEMPT step only. The authoritative
 * finalize GATE is `verifyLockState` + `isLockSatisfied` in graduateToken — if a
 * leg cannot be confirmed locked here (e.g. the explicit lock ix is still a
 * TODO, or a creator leg the keeper cannot sign), the row is NOT finalized; it
 * stays FINALIZING and retries. So a no-op here can never produce a COMPLETED
 * token with an unlocked LP.
 *
 * TODO(verify-devnet): the exact permanentLockPosition arg shape
 * ({ owner, position, positionNftAccount, pool, unlockedLiquidity }) and the
 * `unlockedLiquidity` source field on positionState; and whether a Jupiter Lock
 * (spike-c) is wanted for any time-locked-with-claimable-fees leg instead of a
 * perma-lock. The committed split (50/50 partner/creator, 100% locked) maps to
 * the program's *_locked_lp legs which migrate perma-locks, so the common path
 * is a no-op verify. (D-graduation §4.3.)
 */
async function lockIfNeeded(
  cpAmm: any,
  owner: Signer,
  dammV2Pool: PublicKey | null,
  _migrateSignature: string,
  _tokenId: string,
): Promise<void> {
  if (!dammV2Pool) return;
  try {
    const positions = await cpAmm.getUserPositionByPool(dammV2Pool, owner.publicKey);
    for (const p of positions) {
      const alreadyLocked = cpAmm.isPermanentLockedPosition(p.positionState);
      if (alreadyLocked) continue;
      // TODO(verify-devnet): a not-already-locked leg needs an explicit
      // permanentLockPosition (or Jupiter Lock) issued + signed by the leg owner.
      // The migrate path for the committed 100%-locked split should leave nothing
      // here; we surface the gap rather than silently leaving an unlocked leg.
      // For an unlocked leg owned by the SERVER wallet we could issue:
      //   const lockTx = await cpAmm.permanentLockPosition({
      //     owner: owner.publicKey, position: p.position,
      //     positionNftAccount: p.positionNftAccount, pool: dammV2Pool,
      //     unlockedLiquidity: p.positionState.unlockedLiquidity,
      //   });
      //   await submit({ tx: lockTx, signers: [owner],
      //     label: `graduate:lock:${_tokenId}` },
      //     { route: 'sender', idempotencyKey: `graduate:lock:${_tokenId}:${p.position.toBase58()}` });
      // The creator-owned leg cannot be server-signed; a not-already-locked
      // creator leg must be locked by the creator wallet (out of the keeper's
      // signing authority) — left as TODO(verify-devnet) pending the on-chain
      // observation of whether migrate perma-locks both legs.
    }
  } catch {
    // Best-effort: an unreadable position set does not block finalize (the
    // positions are persisted from the NFT mints regardless). Lock verification
    // is re-attempted on the next tick if the row is still FINALIZING.
  }
}

/**
 * Read whether a single owner's LP leg in `pool` is permanently locked
 * (SEC P1-2 / fix #4 building block). Returns:
 *   { locked, read } — `read=true` only when the position reader actually returned
 *   a state we could classify; on any reader error `read=false` (the lock is
 *   UNVERIFIED, not "unlocked"). The caller must NOT finalize on `read=false`.
 *
 * TODO(verify-devnet): `getUserPositionByPool` element shape + the
 * `isPermanentLockedPosition(positionState)` classifier (spike-b STEP 5 / §10.2).
 */
async function isLegLocked(
  cpAmm: any,
  pool: PublicKey,
  owner: PublicKey,
): Promise<{ locked: boolean; read: boolean }> {
  try {
    const positions = await cpAmm.getUserPositionByPool(pool, owner);
    if (!positions || positions.length === 0) {
      // No position for this owner: nothing to lock for this leg. Treat as a
      // successful read (verified) reporting "not locked" — the caller decides
      // whether an absent leg is acceptable for finalize.
      return { locked: false, read: true };
    }
    // Locked iff EVERY position the owner holds in this pool is perma-locked.
    const allLocked = positions.every((p: any) => cpAmm.isPermanentLockedPosition(p.positionState));
    return { locked: allLocked, read: true };
  } catch {
    return { locked: false, read: false }; // UNVERIFIED — keep FINALIZING
  }
}

/**
 * Verify the on-chain lock state of BOTH LP legs (SEC P1-2 / fix #4). `verified`
 * is true only when we successfully READ both legs (a missing pool or a reader
 * error leaves `verified=false`, so the caller keeps the row FINALIZING rather
 * than synthesizing a locked state). The creator leg is treated as verified-locked
 * when the creator wallet is unknown (no leg to check) so the common server-only
 * path is not blocked by a missing creator wallet — but a present creator wallet
 * whose leg cannot be read leaves `verified=false`.
 */
async function verifyLockState(
  cpAmm: any,
  pool: PublicKey | null,
  partnerOwner: PublicKey,
  creatorWallet: string,
): Promise<{ partnerLocked: boolean; creatorLocked: boolean; verified: boolean }> {
  if (!pool) return { partnerLocked: false, creatorLocked: false, verified: false };

  const partner = await isLegLocked(cpAmm, pool, partnerOwner);

  let creator: { locked: boolean; read: boolean };
  if (creatorWallet) {
    try {
      creator = await isLegLocked(cpAmm, pool, new PublicKey(creatorWallet));
    } catch {
      creator = { locked: false, read: false }; // bad wallet string → unverified
    }
  } else {
    // No creator wallet to check (no creator leg) — verified, not locked-relevant.
    creator = { locked: true, read: true };
  }

  return {
    partnerLocked: partner.locked,
    creatorLocked: creator.locked,
    verified: partner.read && creator.read,
  };
}

/**
 * The finalize gate (SEC P1-2 / fix #4): the LP lock is satisfied ONLY when we
 * actually verified both legs AND both verified perma-locked. An unverified read
 * (readers down) or a leg that read as unlocked both return false → the caller
 * keeps the row FINALIZING and retries on the next tick.
 */
function isLockSatisfied(s: {
  partnerLocked: boolean;
  creatorLocked: boolean;
  lockVerified: boolean;
}): boolean {
  return s.lockVerified && s.partnerLocked && s.creatorLocked;
}

/** Human-readable breadcrumb explaining WHY finalize was deferred (ops/monitoring). */
function lockBreadcrumb(
  phase: 'migrate' | 'recover',
  s: { partnerLocked: boolean; creatorLocked: boolean; lockVerified: boolean },
): string {
  if (!s.lockVerified) {
    return `LP lock UNVERIFIED after ${phase} (position readers unavailable); kept FINALIZING for retry`;
  }
  const legs: string[] = [];
  if (!s.partnerLocked) legs.push('partner');
  if (!s.creatorLocked) legs.push('creator');
  return `LP leg(s) NOT perma-locked after ${phase}: ${legs.join('+')}; kept FINALIZING (do not finalize unlocked LP)`;
}

/**
 * Upsert BOTH LpPosition rows (PARTNER + CREATOR). Idempotent via
 * @@unique([tokenId, owner]) and the @unique positionNftMint — a re-run upserts
 * the same two rows (D-graduation §4.3).
 *
 * DEVIATION (documented): LpPosition.createSignature is @unique in the committed
 * schema, so the TWO rows CANNOT both carry the same migrate signature (the
 * contract's "shared createSignature" would violate the constraint). We record
 * the migrate signature on the PARTNER row's createSignature (the canonical
 * platform-signed migrate) and leave the CREATOR row's createSignature null; the
 * authoritative migrate signature for BOTH legs lives on
 * TokenFundraise.finalizeSignature (also @unique). This preserves idempotency and
 * the one-tx-creates-both semantics without violating the DB constraint.
 *
 * NULL-not-placeholder (correctness/SEC P1-6/P1-4): `positionNftMint` and
 * `createSignature` are BOTH @unique AND nullable. When the real on-chain value
 * is unknown (recovery with unavailable readers, or no migrate signature of our
 * own), we leave the column NULL — NEVER a synthetic `recovered-*` /
 * `external-migrate:*` string. Two NULLs do not collide on a unique index;
 * placeholder strings would pollute the audit trail and could collide / block the
 * real value from ever being recorded. On update we only WRITE a field when a real
 * value is provided, so a later tick that resolves the true mint/sig backfills it
 * without clobbering a previously-resolved real value with null.
 *
 * `locked` is passed through (NOT hard-coded true) so an unverified-lock leg is
 * persisted honestly as locked:false (SEC P1-2 / fix #4).
 */
async function persistLpPositions(args: {
  tokenId: string;
  poolAddress: string;
  partnerWallet: string;
  creatorWallet: string;
  partnerNftMint: string | null;
  creatorNftMint: string | null;
  migrateSignature: string | null;
  partnerLocked: boolean;
  creatorLocked: boolean;
}): Promise<void> {
  const {
    tokenId,
    poolAddress,
    partnerWallet,
    creatorWallet,
    partnerNftMint,
    creatorNftMint,
    migrateSignature,
    partnerLocked,
    creatorLocked,
  } = args;

  // Only include a @unique column in the write when we have a REAL value; a null
  // is left as-is on update (don't overwrite a previously-resolved value with null,
  // don't write a placeholder into a @unique column).
  const partnerNftField = partnerNftMint ? { positionNftMint: partnerNftMint } : {};
  const creatorNftField = creatorNftMint ? { positionNftMint: creatorNftMint } : {};
  // PARTNER row carries createSignature (canonical, @unique-safe) ONLY when the
  // migrate signature is a real signature (not null / not a placeholder).
  const createSigField = migrateSignature ? { createSignature: migrateSignature } : {};

  await prisma.lpPosition.upsert({
    where: { tokenId_owner: { tokenId, owner: 'PARTNER' } },
    create: {
      tokenId,
      provider: 'METEORA_DAMM_V2',
      owner: 'PARTNER',
      ownerWallet: partnerWallet,
      poolAddress,
      locked: partnerLocked,
      lockedUntil: null, // perma-locked (when locked)
      ...partnerNftField,
      ...createSigField,
    },
    update: {
      ownerWallet: partnerWallet,
      poolAddress,
      locked: partnerLocked,
      ...partnerNftField,
      ...createSigField,
    },
  });

  await prisma.lpPosition.upsert({
    where: { tokenId_owner: { tokenId, owner: 'CREATOR' } },
    create: {
      tokenId,
      provider: 'METEORA_DAMM_V2',
      owner: 'CREATOR',
      ownerWallet: creatorWallet,
      poolAddress,
      locked: creatorLocked,
      lockedUntil: null, // perma-locked (when locked)
      ...creatorNftField,
      // createSignature intentionally omitted — see DEVIATION above (@unique).
    },
    update: {
      ownerWallet: creatorWallet,
      poolAddress,
      locked: creatorLocked,
      ...creatorNftField,
    },
  });
}

/**
 * Resolve the PARTNER (Momento treasury / fee_claimer) + CREATOR ownerWallets
 * (D-graduation §4.3 table). Partner = feeConfig.feeClaimer (the Momento
 * treasury); creator = the creator's on-chain wallet. Best-effort with safe
 * fallbacks so persistence never blocks finalize on a missing display field.
 */
async function resolveOwnerWallets(
  tokenId: string,
): Promise<{ partnerWallet: string; creatorWallet: string }> {
  const token = await prisma.creatorToken.findUnique({
    where: { id: tokenId },
    include: { feeConfig: true, creator: true },
  });

  // PARTNER = Momento fee_claimer (treasury). Prefer the launch-baked
  // feeConfig.feeClaimer; fall back to env MOMENTO_LP_FEE_CLAIMER.
  const partnerWallet =
    token?.feeConfig?.feeClaimer || process.env.MOMENTO_LP_FEE_CLAIMER || '';

  // CREATOR = creator's wallet. Prefer the launch-baked creatorFeeWallet (the
  // wallet the creator trading fees route to == the creator's claim wallet);
  // fall back to the User.walletAddress (the creator's on-chain wallet).
  const creatorWallet =
    token?.feeConfig?.creatorFeeWallet || token?.creator?.walletAddress || '';

  return { partnerWallet, creatorWallet };
}

/**
 * Recover graduation state from the chain for the recovery / detect-existing-pool
 * paths (D-graduation §4.2 step 3 / §4.4). Resolves the DAMM v2 pool + the two
 * position NFTs and persists the LpPosition rows from on-chain state. Returns the
 * resolved identifiers (best-effort; nulls where the reader is unavailable).
 *
 * TODO(verify-devnet): getUserPositionByPool / getPositionsByUser field names for
 * the position NFT mint and the pool reference (spike-b TODOs; §10.4/§10.5).
 */
async function recoverFromChain(
  tokenId: string,
  token: { dbcPoolAddress: string | null },
): Promise<{
  dammV2Pool: string | null;
  partnerNftMint: string | null;
  creatorNftMint: string | null;
  partnerLocked: boolean;
  creatorLocked: boolean;
  lockVerified: boolean;
}> {
  void token;
  let dammV2Pool: string | null = null;
  let partnerNftMint: string | null = null;
  let creatorNftMint: string | null = null;
  let partnerLocked = false;
  let creatorLocked = false;
  // `lockVerified` flips true only when we actually READ the lock state for both
  // legs. If the readers are unavailable we leave it false so the caller
  // (graduateToken/finalize) does NOT finalize on an unverified lock (SEC P1-2).
  let lockVerified = false;

  try {
    const connection = getConnection();
    const cpAmm = new CpAmm(connection);

    const { partnerWallet, creatorWallet } = await resolveOwnerWallets(tokenId);
    const payer = serverSigner();

    const poolPk = await resolveDammV2Pool(cpAmm, payer.publicKey);
    dammV2Pool = poolPk ? poolPk.toBase58() : null;

    if (poolPk) {
      // Partner positions (owned by the Momento treasury == server wallet).
      try {
        const partnerPositions = await cpAmm.getUserPositionByPool(poolPk, payer.publicKey);
        partnerNftMint = positionNftMintOf(partnerPositions?.[0]);
      } catch {
        /* reader unavailable — leave null */
      }
      // Creator positions (owned by the creator wallet).
      if (creatorWallet) {
        try {
          const creatorPositions = await cpAmm.getUserPositionByPool(
            poolPk,
            new PublicKey(creatorWallet),
          );
          creatorNftMint = positionNftMintOf(creatorPositions?.[0]);
        } catch {
          /* reader unavailable — leave null */
        }
      }

      // Recovery reads positions from chain; VERIFY per-leg lock state so a
      // recovered leg is not blindly marked locked (SEC P1-2 / fix #4). We treat
      // the lock as verified only if BOTH reads succeeded.
      const lock = await verifyLockState(
        cpAmm,
        poolPk,
        payer.publicKey,
        creatorWallet,
      );
      partnerLocked = lock.partnerLocked;
      creatorLocked = lock.creatorLocked;
      lockVerified = lock.verified;

      // Persist what we resolved. Re-uses the upsert (idempotent on
      // @@unique([tokenId, owner])). Existing rows from a partial prior attempt
      // are preserved/updated; an unknown mint/sig is passed as NULL (NOT a
      // placeholder) so it never pollutes / collides on the @unique columns
      // (correctness/SEC P1-6/P1-4). A later tick that resolves the real values
      // backfills them. We only WRITE the real finalizeSignature; a missing one
      // stays null (no `external-migrate:` placeholder).
      const existing = await prisma.tokenFundraise.findUnique({ where: { tokenId } });
      const sig = existing?.finalizeSignature ?? null;
      await persistLpPositions({
        tokenId,
        poolAddress: dammV2Pool ?? '',
        partnerWallet,
        creatorWallet,
        partnerNftMint, // real mint or null (no placeholder)
        creatorNftMint, // real mint or null (no placeholder)
        migrateSignature: sig, // real finalizeSignature or null
        partnerLocked,
        creatorLocked,
      });
    }
  } catch {
    // Best-effort recovery: if the SDK/readers are unavailable, the resolved
    // identifiers stay null and lockVerified stays false. The caller keeps the row
    // FINALIZING (no finalize on unverified/synthetic state) for the next tick.
  }

  return { dammV2Pool, partnerNftMint, creatorNftMint, partnerLocked, creatorLocked, lockVerified };
}

/** Pull a position NFT mint from a getUserPositionByPool element (best-effort). */
function positionNftMintOf(
  p:
    | { positionState?: { nftMint?: { toBase58?: () => string } } }
    | undefined
    | null,
): string | null {
  // TODO(verify-devnet): exact field name for the position's NFT mint on
  // positionState (spike-b reads positionNftAccount/position; the NFT *mint* field
  // name is SDK-minor-sensitive).
  const mint = p?.positionState?.nftMint;
  return mint?.toBase58 ? mint.toBase58() : null;
}

/**
 * Best-effort resolve the graduated DAMM v2 pool the server wallet just got a
 * position in (spike-b resolveDammV2Pool via getPositionsByUser).
 * TODO(verify-devnet): position→pool field name.
 */
async function resolveDammV2Pool(cpAmm: any, owner: PublicKey): Promise<PublicKey | null> {
  try {
    const positions = await cpAmm.getPositionsByUser(owner);
    if (positions?.length) {
      const pool = positions[0]?.positionState?.pool;
      return pool ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Finalize the terminal transition (D-graduation §4.2 step 6), atomically across
 * the fundraise + token rows. Conditional on FINALIZING so a concurrent worker
 * cannot double-finalize. `finalizeSignature` is @unique → idempotent.
 */
async function finalize(
  tokenId: string,
  finalizeSignature: string,
  dammV2Pool: string | null,
): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // TokenFundraise: FINALIZING → COMPLETED + finalizeSignature + finalizedAt.
    // finalizeSignature may already be set (we persist it early in migrateAndPersist);
    // updateMany with a null-or-equal guard keeps the @unique constraint happy.
    await tx.tokenFundraise.updateMany({
      where: { tokenId, status: 'FINALIZING' },
      data: {
        status: 'COMPLETED',
        finalizedAt: now,
        // Only set finalizeSignature if not already recorded (avoid @unique churn).
      },
    });
    // Ensure finalizeSignature is recorded (idempotent; no-op if already equal).
    await tx.tokenFundraise.updateMany({
      where: { tokenId, finalizeSignature: null },
      data: { finalizeSignature },
    });

    // CreatorToken: → GRADUATED + graduatedAt + poolType=METEORA_DAMM_V2 + pool.
    await tx.creatorToken.update({
      where: { id: tokenId },
      data: {
        status: 'GRADUATED',
        graduatedAt: now,
        poolType: 'METEORA_DAMM_V2',
        ...(dammV2Pool ? { poolAddress: dammV2Pool } : {}),
      },
    });
  });
}

// =============================================================================
// 3. Keeper sweep (D-graduation §4.1) — thin orchestration over graduateToken
// =============================================================================

/**
 * Detect newly-met thresholds, then graduate all THRESHOLD_MET/FINALIZING tokens
 * (bounded by `limit`). Returns counts for the cron envelope. Never throws — a
 * per-token failure is captured in its GraduationResult and counted as `failed`
 * so monitoring fires (a token stuck FINALIZING past N ticks is an alert).
 */
export async function runGraduationSweep(opts?: { limit?: number }): Promise<{
  detected: number;
  finalized: number;
  retried: number;
  failed: number;
  results: GraduationResult[];
}> {
  const limit = opts?.limit ?? DEFAULT_SWEEP_LIMIT;

  // (1) Detect: flip any ACTIVE fundraise whose CONFIRMED raise now >= threshold.
  // Scan ACTIVE rows (bounded) and recompute authoritatively (do NOT trust the
  // cached counter — D-graduation §3.1).
  let detected = 0;
  const active = await prisma.tokenFundraise.findMany({
    where: { status: 'ACTIVE' },
    select: { tokenId: true },
    take: limit,
  });
  for (const row of active) {
    try {
      if (await detectThresholdMet(row.tokenId)) detected++;
    } catch {
      // a single bad row must not abort the sweep
    }
  }

  // (2) Graduate: every THRESHOLD_MET / FINALIZING candidate, bounded.
  const candidates = await prisma.tokenFundraise.findMany({
    where: { status: { in: ['THRESHOLD_MET', 'FINALIZING'] } },
    select: { tokenId: true },
    take: limit,
  });

  const results: GraduationResult[] = [];
  let finalized = 0;
  let retried = 0;
  let failed = 0;

  for (const row of candidates) {
    let result: GraduationResult;
    try {
      result = await graduateToken(row.tokenId);
    } catch (err) {
      const e = classify(err);
      result = { tokenId: row.tokenId, outcome: 'failed', error: `${e.code}: ${e.message}` };
    }
    results.push(result);
    if (result.outcome === 'finalized') finalized++;
    else if (result.outcome === 'retried') retried++;
    else if (result.outcome === 'failed') failed++;
    // 'skipped' / 'already-completed' are not counted in the cron envelope.

    // Structured per-token log so monitoring can fire on stuck/failed rows.
    if (result.outcome === 'failed') {
      // eslint-disable-next-line no-console
      console.error('graduation: token failed', {
        tokenId: result.tokenId,
        error: result.error,
      });
    } else if (result.outcome === 'retried' && result.error) {
      // A 'retried' with an error is a DEFERRED finalize (unverified/unlocked LP or
      // no resolved migrate signature — SEC P1-2 / fix #4). Surface it so a token
      // stuck deferring past N ticks alerts (it must NOT silently finalize unlocked).
      // eslint-disable-next-line no-console
      console.warn('graduation: finalize deferred', {
        tokenId: result.tokenId,
        error: result.error,
      });
    }
  }

  return { detected, finalized, retried, failed, results };
}
