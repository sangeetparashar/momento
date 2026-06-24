/**
 * apps/api/lib/fee-claim.ts — P3-feeclaim (CONTRACTS-P3A §b.4, D-fee-claim.md)
 * ============================================================================
 * Fee-claim + rebate EXECUTION engine. Pure functions over `prisma` +
 * `lib/solana/*` (server-signed broadcast) + `lib/fees.ts` (math/attribution).
 *
 * Solana-only · @solana/web3.js v1. All on-chain CPI orchestration lives here;
 * the cron route + the admin endpoint are thin shells over this module.
 *
 * GROUND TRUTH (reused EXACTLY):
 *   - scripts/spikes/spike-b-meteora-dbc.ts
 *       client.partner.claimPartnerTradingFee / client.creator.claimCreatorTradingFee
 *       cpAmm.fetchPoolState / getUserPositionByPool / claimPositionFee
 *   - scripts/spikes/spike-a-token2022-fee-rebate.ts
 *       harvest (createHarvestWithheldTokensToMintInstruction) +
 *       withdraw (createWithdrawWithheldTokensFromMintInstruction)
 *
 * IMPORT-SAFE: top-level SDK imports are allowed (CONTRACTS constraint), but
 * EVERY env read / network call / connection is INSIDE a function — never at
 * module top-level — so importing this file is side-effect-free.
 *
 * THREE-LAYER ANTI-DOUBLE-PAY (D-fee-claim §5), implemented below:
 *   1. submit-layer  — `submit()` derives a per-message idempotency key in the
 *      durable Redis store (fail-closed); a retried claim/rebate returns the
 *      prior signature instead of a second on-chain tx (`deduped`).
 *   2. DB unique key — every CLAIMED / accrual / REBATE row carries a UNIQUE
 *      `signature` (on-chain) XOR `internalRef` (off-chain); all writes use
 *      `createMany({ skipDuplicates:true })` / scoped `updateMany`.
 *   3. state CAS     — rebates RESERVE via `updateMany(rebatePaid:false ->
 *      rebatePaid:true)` BEFORE building the tx; claims gate on the accrual
 *      row's `claimed=false` + the CLAIMED row's `@unique signature`.
 *
 * TODO(verify-devnet): all on-chain CPI shapes (Meteora DBC + cp-amm + the
 * Token-2022 harvest/withdraw authority/sources) are unverifiable offline; the
 * SDK signatures are taken verbatim from the spikes. Re-verify on devnet before
 * mainnet (esp. SDK-minor-sensitive readers — fetchPoolState / position readers
 * / DAMM_V2_MIGRATION_FEE_ADDRESS index / token-program flag).
 */

import {
  Transaction,
  PublicKey,
  type TransactionInstruction,
} from '@solana/web3.js';
import BN from 'bn.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  createHarvestWithheldTokensToMintInstruction,
  createWithdrawWithheldTokensFromMintInstruction,
} from '@solana/spl-token';

// Meteora SDKs (CONTRACTS §g.3 — added by the consuming module). Top-level import
// is OK per task constraints; the clients are CONSTRUCTED inside functions only.
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm, getTokenProgram } from '@meteora-ag/cp-amm-sdk';

import prisma from './prisma';
import { grossUpTokenRebate, computeRebate, rebateToUsdc } from './fees';
import {
  submit,
  serverSigner,
  getConnection,
  SolanaTxError,
  classify,
  type BuiltTx,
  type SubmitResult,
} from './solana';
import { MOMENTO_FEE, MOMENTO_CLAIM } from '@momento/shared';
import type { CreatorToken, TokenFeeConfig, LpPosition } from '@prisma/client';

// ════════════════════════════════════════════════════════════════════════════
//  Public surface (CONTRACTS-P3A §b.4 — paste-ready signatures)
// ════════════════════════════════════════════════════════════════════════════

export interface ClaimResult {
  tokenId: string;
  mint: string;
  partnerTradingFeeSig?: string; // DBC claimPartnerTradingFee
  creatorTradingFeeSig?: string; // DBC claimCreatorTradingFee
  partnerLpFeeSig?: string; // DAMM v2 claimPositionFee (partner NFT)
  creatorLpFeeSig?: string; // DAMM v2 claimPositionFee (creator NFT)
  withdrawWithheldSig?: string; // Token-2022 harvest+withdraw
  recorded: number; // FeeEvent rows written (CLAIMED + attributed legs)
  skipped: string[]; // human reasons (no-fees, deduped, not-graduated, …)
}

export interface RebateResult {
  attempted: number;
  sent: number;
  deduped: number;
  failed: number;
  signatures: string[];
}

// ════════════════════════════════════════════════════════════════════════════
//  small helpers
// ════════════════════════════════════════════════════════════════════════════

const U64_MAX = new BN('18446744073709551615'); // claim ALL available (spike-b)
const COMMITMENT = 'confirmed' as const;

function tokenProgramId(t: CreatorToken): PublicKey {
  return t.tokenProgram === 'TOKEN_CLASSIC'
    ? new PublicKey(MOMENTO_FEE.TOKEN_CLASSIC_PROGRAM_ID)
    : new PublicKey(MOMENTO_FEE.TOKEN_2022_PROGRAM_ID);
}

const CLASSIC_PROGRAM = new PublicKey(MOMENTO_FEE.TOKEN_CLASSIC_PROGRAM_ID);
const TOKEN_2022_PROGRAM = new PublicKey(MOMENTO_FEE.TOKEN_2022_PROGRAM_ID);

/**
 * Resolve the SPL token PROGRAM that owns `mint` so we derive the correct ATA for
 * the balance-delta read (SDK P0-2 / correctness P1-5). A wrong program id yields
 * a wrong ATA → `claimedAmountFromMeta` reads 0 → the claimed fee is silently
 * under-recorded. USDC is classic SPL and is the safe, known default (the rebate-
 * quote mint is USDC by spec); for any other mint we resolve the on-chain owner
 * program (Token-2022 vs classic) via getAccountInfo.
 *
 * TODO(verify-devnet): the getAccountInfo owner read is offline-unverifiable; the
 * USDC fast-path is the only path exercised while quoteMint==USDC(classic).
 */
async function resolveMintProgramId(mint: string): Promise<PublicKey> {
  // Known fee-exempt classic mint — skip the RPC round-trip on the common path.
  if (mint === MOMENTO_FEE.USDC_MINT) return CLASSIC_PROGRAM;
  try {
    const info = await getConnection().getAccountInfo(new PublicKey(mint), COMMITMENT);
    if (info?.owner) {
      if (info.owner.equals(TOKEN_2022_PROGRAM)) return TOKEN_2022_PROGRAM;
      if (info.owner.equals(CLASSIC_PROGRAM)) return CLASSIC_PROGRAM;
      // Any other owner is not an SPL mint we can derive an ATA for; fall back to
      // classic (safe default — never crashes the claim, only the amount probe).
      return CLASSIC_PROGRAM;
    }
  } catch {
    /* fall through to classic default */
  }
  return CLASSIC_PROGRAM;
}

/** Read a required env wallet lazily; throw CONFIG_MISSING (mapped to 500) when absent. */
function requiredWallet(name: string): PublicKey {
  const raw = process.env[name]?.trim();
  if (!raw) {
    throw new SolanaTxError('CONFIG_MISSING', `Missing ${name} environment variable`);
  }
  try {
    return new PublicKey(raw);
  } catch {
    throw new SolanaTxError('CONFIG_MISSING', `${name} is not a valid Solana address`);
  }
}

/**
 * Authoritative base-unit amount that landed in `destinationAta` from a confirmed
 * claim/withdraw tx — derived from the confirmed tx meta (NEVER the SDK u64::MAX
 * sentinel). Same pattern as helius-webhook.ts verifyOnChain: positive post-pre
 * delta on the destination ATA. Returns 0 when the tx/meta is unavailable.
 */
async function claimedAmountFromMeta(
  signature: string,
  destinationAta: PublicKey,
): Promise<bigint> {
  let tx: any;
  try {
    tx = await getConnection().getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
  } catch {
    return BigInt(0);
  }
  if (!tx || tx.meta == null || tx.meta.err != null) return BigInt(0);

  const pre: any[] = Array.isArray(tx.meta.preTokenBalances) ? tx.meta.preTokenBalances : [];
  const post: any[] = Array.isArray(tx.meta.postTokenBalances) ? tx.meta.postTokenBalances : [];
  const keys: any[] =
    tx.transaction?.message?.staticAccountKeys ??
    tx.transaction?.message?.accountKeys ??
    [];

  const destB58 = destinationAta.toBase58();
  const rawOf = (b: any): bigint => {
    try {
      return BigInt(b?.uiTokenAmount?.amount ?? '0');
    } catch {
      return BigInt(0);
    }
  };
  const idxIsDest = (idx: number): boolean => {
    const k = keys[idx];
    if (!k) return false;
    const s = typeof k === 'string' ? k : k.toBase58?.() ?? String(k);
    return s === destB58;
  };

  const preByIdx = new Map<number, any>();
  for (const b of pre) if (typeof b?.accountIndex === 'number') preByIdx.set(b.accountIndex, b);

  let credited = BigInt(0);
  for (const b of post) {
    if (typeof b?.accountIndex !== 'number') continue;
    if (!idxIsDest(b.accountIndex)) continue;
    const delta = rawOf(b) - rawOf(preByIdx.get(b.accountIndex));
    if (delta > BigInt(0)) credited += delta;
  }
  return credited;
}

// ════════════════════════════════════════════════════════════════════════════
//  Recording (atomic, idempotent — per claim tx) — D-fee-claim §3d
// ════════════════════════════════════════════════════════════════════════════

interface RecordTradingFeeArgs {
  tokenId: string;
  feeConfig: TokenFeeConfig;
  /** PLATFORM (partner) | CREATOR — WHO claims (and which leg this CLAIMED row sweeps). */
  recipient: 'PLATFORM' | 'CREATOR';
  /**
   * Accrual leg type. DBC trading-fee claims (§3b) record PARTNER/CREATOR_TRADING_FEE;
   * post-graduation DAMM v2 locked-LP fee claims (§3c) record LOCKED_LP_FEE
   * (contract P2 / §f.1). When omitted, defaults to the recipient's trading-fee leg.
   */
  legType?: 'PARTNER_TRADING_FEE' | 'CREATOR_TRADING_FEE' | 'LOCKED_LP_FEE';
  /** sweep destination wallet recorded on the CLAIMED row. */
  destinationWallet: string;
  /** quote (USDC) mint the fees are denominated in (CollectFeeMode.QuoteToken). */
  amountMint: string;
  /** authoritative claimed amount (base units) from confirmed tx meta. */
  amountBaseUnits: bigint;
  /** the claim tx signature (unique idempotency anchor). */
  claimSignature: string;
  blockTime: number | null;
}

/**
 * In ONE prisma.$transaction:
 *   - createMany({skipDuplicates}) the attributed accrual leg
 *     (PARTNER_TRADING_FEE/PLATFORM or CREATOR_TRADING_FEE/CREATOR) keyed by
 *     `internalRef = ${tokenId}:${recipient}:${type}:${claimSignature}`,
 *   - createMany({skipDuplicates}) ONE CLAIMED audit row keyed by `signature`
 *     (the claim tx — @unique),
 *   - updateMany flips the previously-unclaimed accrual rows for THIS leg to
 *     claimed=true, claimedAt=now, claimSignature.
 *
 * Returns the count of fee rows actually inserted (accrual + CLAIMED).
 */
async function recordTradingFeeClaim(args: RecordTradingFeeArgs): Promise<number> {
  const {
    tokenId,
    feeConfig,
    recipient,
    legType: legTypeArg,
    destinationWallet,
    amountMint,
    amountBaseUnits,
    claimSignature,
    blockTime,
  } = args;

  if (amountBaseUnits <= BigInt(0)) {
    // Nothing landed — still write the CLAIMED audit anchor so a retick is a
    // no-op, but there is no accrual to attribute.
    const res = await prisma.feeEvent.createMany({
      data: [
        {
          tokenId,
          type: 'CLAIMED',
          source: 'IN_APP',
          recipient,
          recipientWallet: destinationWallet,
          grossBaseUnits: '0',
          feeBaseUnits: '0',
          netBaseUnits: '0',
          amountMint,
          signature: claimSignature,
          claimed: true,
          claimedAt: new Date(),
          claimSignature,
          blockTime: blockTime != null ? new Date(blockTime * 1000) : null,
        },
      ],
      skipDuplicates: true,
    });
    return res.count;
  }

  // The amount we received is the 80% LP leg WE actually got for this recipient
  // (Meteora withholds its 20% on its side). We attribute the per-leg accrual:
  // for the PLATFORM (partner) sweep we record PARTNER_TRADING_FEE; for CREATOR
  // we record CREATOR_TRADING_FEE; for a post-graduation DAMM v2 locked-LP claim
  // the caller passes LOCKED_LP_FEE (contract P2 / §f.1). The amount IS the leg
  // amount (single recipient claimed it), so we record it directly without re-split.
  const legType =
    legTypeArg ?? (recipient === 'PLATFORM' ? 'PARTNER_TRADING_FEE' : 'CREATOR_TRADING_FEE');
  const internalRef = `${tokenId}:${recipient}:${legType}:${claimSignature}`;
  const now = new Date();

  return prisma.$transaction(async (txc) => {
    let recorded = 0;

    // (a) attributed accrual leg (off-chain computed → internalRef, no signature).
    const accrual = await txc.feeEvent.createMany({
      data: [
        {
          tokenId,
          type: legType,
          source: 'IN_APP',
          recipient,
          recipientWallet: destinationWallet,
          grossBaseUnits: '0',
          feeBaseUnits: amountBaseUnits.toString(),
          netBaseUnits: amountBaseUnits.toString(),
          amountMint,
          feeBps: recipient === 'PLATFORM' ? feeConfig.partnerTradingFeeBps : feeConfig.creatorTradingFeeBps,
          internalRef,
          // This accrual is realized AND swept in the same claim → mark claimed.
          claimed: true,
          claimedAt: now,
          claimSignature,
        },
      ],
      skipDuplicates: true,
    });
    recorded += accrual.count;

    // (b) ONE CLAIMED audit/idempotency row keyed by the claim signature.
    const claimedRow = await txc.feeEvent.createMany({
      data: [
        {
          tokenId,
          type: 'CLAIMED',
          source: 'IN_APP',
          recipient,
          recipientWallet: destinationWallet,
          grossBaseUnits: '0',
          feeBaseUnits: amountBaseUnits.toString(),
          netBaseUnits: amountBaseUnits.toString(),
          amountMint,
          signature: claimSignature,
          claimed: true,
          claimedAt: now,
          claimSignature,
          blockTime: blockTime != null ? new Date(blockTime * 1000) : null,
        },
      ],
      skipDuplicates: true,
    });
    recorded += claimedRow.count;

    // (c) flip any PRIOR unclaimed accrual rows for this leg (e.g. webhook-
    // observed accruals) to claimed in this sweep.
    await txc.feeEvent.updateMany({
      where: {
        tokenId,
        recipient,
        type: legType,
        claimed: false,
      },
      data: { claimed: true, claimedAt: now, claimSignature },
    });

    return recorded;
  });
}

/**
 * Record a Token-2022 withheld-fee withdraw (the protocol/withheld pool, in the
 * creator-token mint). NOT attributed to creator/partner — `recipient=PROTOCOL`,
 * `type=CLAIMED`, keyed by the withdraw signature (D-fee-claim §3a). Also flips
 * the consumed TRANSFER_FEE_WITHHELD accrual rows to claimed.
 */
async function recordWithheldWithdraw(args: {
  tokenId: string;
  destinationWallet: string;
  mint: string;
  amountBaseUnits: bigint;
  withdrawSignature: string;
  blockTime: number | null;
}): Promise<number> {
  const { tokenId, destinationWallet, mint, amountBaseUnits, withdrawSignature, blockTime } = args;
  const now = new Date();

  return prisma.$transaction(async (txc) => {
    const inserted = await txc.feeEvent.createMany({
      data: [
        {
          tokenId,
          type: 'CLAIMED',
          source: 'IN_APP',
          recipient: 'PROTOCOL',
          recipientWallet: destinationWallet,
          grossBaseUnits: '0',
          feeBaseUnits: amountBaseUnits.toString(),
          netBaseUnits: amountBaseUnits.toString(),
          amountMint: mint, // withheld pool is denominated in the creator-token mint
          signature: withdrawSignature,
          claimed: true,
          claimedAt: now,
          claimSignature: withdrawSignature,
          blockTime: blockTime != null ? new Date(blockTime * 1000) : null,
        },
      ],
      skipDuplicates: true,
    });

    // Mark the withheld accrual rows we just swept as claimed.
    await txc.feeEvent.updateMany({
      where: { tokenId, type: 'TRANSFER_FEE_WITHHELD', claimed: false },
      data: { claimed: true, claimedAt: now, claimSignature: withdrawSignature },
    });

    return inserted.count;
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  CLAIM — per-source builders + claimTokenFees (D-fee-claim §3)
// ════════════════════════════════════════════════════════════════════════════

/**
 * 3a. Token-2022 withheld transfer fee → Momento fee vault.
 *
 * Build the harvest+withdraw instruction list (spike-a path, but server-signed
 * so we do NOT use the all-in-one sendAndConfirm helpers): harvest withheld
 * tokens FROM the holder ATAs TO the mint, then withdraw FROM the mint TO the
 * Momento fee vault. authority = feeConfig.withdrawWithheldAuthority (server
 * wallet). Server-signed; submit({route:'sender'}). Returns null when there is
 * nothing to harvest (no source ATAs).
 *
 * TODO(verify-devnet): `sources[]` = the recipient ATAs carrying withheld fees.
 * We resolve holder ATAs from the confirmed tx meta referenced by the
 * TRANSFER_FEE_WITHHELD FeeEvent rows; an exhaustive sweep would scan via
 * getProgramAccounts filtered on withheld>0. Confirmed offline-unverifiable.
 */
async function buildWithheldClaim(
  token: CreatorToken,
  feeConfig: TokenFeeConfig,
): Promise<{ built: BuiltTx; destination: PublicKey } | { skip: string } | null> {
  if (!token.mintAddress) return null;
  const programId = tokenProgramId(token);
  const mint = new PublicKey(token.mintAddress);

  // Destination = Momento fee vault ATA (owned by the withdraw-withheld authority
  // = server wallet). We send withheld tokens here.
  const signer = serverSigner();
  const feeVaultOwner = feeConfig.withdrawWithheldAuthority
    ? new PublicKey(feeConfig.withdrawWithheldAuthority)
    : signer.publicKey;

  // SDK P0-1 — CUSTODY GATE (mirror §3b/§3c). The withdraw-withheld instruction
  // marks `feeVaultOwner` as a REQUIRED SIGNER. We can only fill that slot when it
  // IS the server wallet. If a token was launched with a non-server
  // withdrawWithheldAuthority, building the tx anyway produces an unsignable tx
  // (applySigners → SIGNER_REJECTED) or, worse, lands the harvest half and fails
  // the withdraw. Skip with a clear reason instead.
  if (!feeVaultOwner.equals(signer.publicKey)) {
    return { skip: 'withheld:needs-custody' };
  }

  const destination = getAssociatedTokenAddressSync(mint, feeVaultOwner, true, programId);

  // Resolve the source ATAs carrying withheld fees from the recorded
  // TRANSFER_FEE_WITHHELD legs' on-chain signatures (the holder accounts).
  const withheldRows = await prisma.feeEvent.findMany({
    where: { tokenId: token.id, type: 'TRANSFER_FEE_WITHHELD', claimed: false },
    select: { recipientWallet: true, signature: true },
    take: 50,
  });

  const sources = new Set<string>();
  for (const row of withheldRows) {
    // The withheld fee accrues on the RECIPIENT account. When the row recorded a
    // recipient wallet (owner), derive its ATA; otherwise inspect tx meta.
    if (row.recipientWallet) {
      try {
        const owner = new PublicKey(row.recipientWallet);
        sources.add(getAssociatedTokenAddressSync(mint, owner, true, programId).toBase58());
        continue;
      } catch {
        /* fall through to meta scan */
      }
    }
    if (row.signature) {
      try {
        const tx: any = await getConnection().getTransaction(row.signature, {
          maxSupportedTransactionVersion: 0,
        });
        const post: any[] = Array.isArray(tx?.meta?.postTokenBalances)
          ? tx.meta.postTokenBalances
          : [];
        const keys: any[] =
          tx?.transaction?.message?.staticAccountKeys ??
          tx?.transaction?.message?.accountKeys ??
          [];
        for (const b of post) {
          if (String(b?.mint) !== token.mintAddress) continue;
          const k = keys[b.accountIndex];
          if (!k) continue;
          const s = typeof k === 'string' ? k : k.toBase58?.() ?? String(k);
          if (s) sources.add(s);
        }
      } catch {
        /* skip unresolvable source */
      }
    }
  }

  if (sources.size === 0) return null;

  const sourceKeys = Array.from(sources).map((s) => new PublicKey(s));
  const ixs: TransactionInstruction[] = [];

  // Ensure the fee vault ATA exists (idempotent).
  ixs.push(
    createAssociatedTokenAccountIdempotentInstruction(
      serverSigner().publicKey, // payer
      destination,
      feeVaultOwner,
      mint,
      programId,
    ),
  );
  // Harvest withheld fees from the holder ATAs into the mint.
  ixs.push(
    createHarvestWithheldTokensToMintInstruction(mint, sourceKeys, programId),
  );
  // Withdraw withheld fees from the mint into the fee vault (authority signs =
  // the server wallet via serverSigner).
  ixs.push(
    createWithdrawWithheldTokensFromMintInstruction(
      mint,
      destination,
      feeVaultOwner, // withdraw-withheld authority (server wallet)
      [],
      programId,
    ),
  );

  const tx = new Transaction().add(...ixs);
  return {
    built: { tx, signers: [serverSigner()], label: `withheld:${token.id}` },
    destination,
  };
}

/** 3b. DBC partner trading fee → Momento (feeClaimer = server wallet). spike-b. */
async function buildPartnerTradingFeeClaim(
  token: CreatorToken,
  feeConfig: TokenFeeConfig,
): Promise<BuiltTx | null> {
  if (!token.dbcPoolAddress) return null;
  const conn = getConnection();
  const client = DynamicBondingCurveClient.create(conn, COMMITMENT);
  const signer = serverSigner();

  const feeClaimer = feeConfig.feeClaimer ? new PublicKey(feeConfig.feeClaimer) : signer.publicKey;

  const tx: Transaction = await client.partner.claimPartnerTradingFee({
    feeClaimer, // Momento
    payer: signer.publicKey,
    pool: new PublicKey(token.dbcPoolAddress),
    maxBaseAmount: U64_MAX,
    maxQuoteAmount: U64_MAX,
  });

  return { tx, signers: [signer], label: `dbc.partner:${token.id}` };
}

/**
 * 3b. DBC creator trading fee. spike-b. Signer policy (D-fee-claim §3b, OPEN
 * §8): Phase-3A server-signs ONLY when `creatorFeeWallet` is a Momento-custodied
 * address (== server wallet). Otherwise the creator must sign as `creator` and
 * the claim is deferred to a creator-initiated / client-relay path — we skip it
 * here (recorded in skipped[]) rather than broadcast an unsigned creator claim.
 */
async function buildCreatorTradingFeeClaim(
  token: CreatorToken,
  feeConfig: TokenFeeConfig,
): Promise<{ built: BuiltTx } | { skip: string } | null> {
  if (!token.dbcPoolAddress) return null;
  if (!feeConfig.creatorFeeWallet) return { skip: 'creator-fee-wallet-missing' };

  const signer = serverSigner();
  const creator = new PublicKey(feeConfig.creatorFeeWallet);

  // Only server-sign when the creator fee wallet is Momento-custodied (== server
  // wallet). Else the creator must co-sign — defer (open signer-policy item).
  if (!creator.equals(signer.publicKey)) {
    return { skip: 'creator-claim-needs-client-relay' };
  }

  const conn = getConnection();
  const client = DynamicBondingCurveClient.create(conn, COMMITMENT);
  const tx: Transaction = await client.creator.claimCreatorTradingFee({
    creator,
    payer: signer.publicKey,
    pool: new PublicKey(token.dbcPoolAddress),
    maxBaseAmount: U64_MAX,
    maxQuoteAmount: U64_MAX,
  });

  return { built: { tx, signers: [signer], label: `dbc.creator:${token.id}` } };
}

/**
 * 3c. DAMM v2 locked-LP fee for ONE position (partner OR creator). spike-b
 * fetchPoolState → getUserPositionByPool → claimPositionFee. Partner position →
 * server-signs (PLATFORM). Creator position → same signer policy as §3b (skip
 * when not Momento-custodied).
 */
async function buildLpFeeClaim(
  token: CreatorToken,
  position: LpPosition,
): Promise<{ built: BuiltTx } | { skip: string } | null> {
  if (!position.poolAddress) return null;
  const signer = serverSigner();
  const owner = new PublicKey(position.ownerWallet);

  if (!owner.equals(signer.publicKey)) {
    // Creator-owned (or any non-custodied) position: defer to client-relay.
    return { skip: `lp-${position.owner.toLowerCase()}-needs-client-relay` };
  }

  const conn = getConnection();
  const cpAmm = new CpAmm(conn);
  const pool = new PublicKey(position.poolAddress);

  const poolState: any = await cpAmm.fetchPoolState(pool);
  const positions: any[] = await cpAmm.getUserPositionByPool(pool, owner);
  if (!positions || positions.length === 0) return { skip: `lp-${position.owner.toLowerCase()}-no-position` };

  // Prefer the recorded position; fall back to the first one on the pool.
  const target =
    (position.positionAddress &&
      positions.find((p) => p.position?.toBase58?.() === position.positionAddress)) ||
    positions[0];

  const tx: Transaction = await cpAmm.claimPositionFee({
    owner,
    position: target.position,
    pool,
    positionNftAccount: target.positionNftAccount,
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram: getTokenProgram(poolState.tokenAFlag),
    tokenBProgram: getTokenProgram(poolState.tokenBFlag),
  });

  return { built: { tx, signers: [signer], label: `damm.lp.${position.owner.toLowerCase()}:${token.id}` } };
}

/**
 * Claim ALL fee sources for ONE graduated/active token. Each source is its OWN
 * tx with its OWN idempotency key (submit-layer), so a partial failure never
 * blocks the others (D-fee-claim §3). Never throws on a single-source failure —
 * collects the reason into `skipped[]` and continues.
 */
export async function claimTokenFees(
  tokenId: string,
  _opts?: { actor?: string },
): Promise<ClaimResult> {
  const token = await prisma.creatorToken.findUnique({
    where: { id: tokenId },
    include: { feeConfig: true, lpPositions: true },
  });

  const result: ClaimResult = {
    tokenId,
    mint: token?.mintAddress ?? '',
    recorded: 0,
    skipped: [],
  };

  if (!token) {
    result.skipped.push('token-not-found');
    return result;
  }
  if (!token.feeConfig) {
    result.skipped.push('fee-config-missing');
    return result;
  }
  // Eligible: GRADUATED (DAMM v2 LP) or ACTIVE (DBC bonding-phase fees).
  if (token.status !== 'GRADUATED' && token.status !== 'ACTIVE') {
    result.skipped.push(`not-eligible-status:${token.status}`);
    return result;
  }

  const feeConfig = token.feeConfig;
  const quoteMint = token.quoteMint ?? feeConfig.rebateMint ?? MOMENTO_FEE.USDC_MINT;

  // ── 3a. Token-2022 withheld → fee vault ───────────────────────────────────
  try {
    const wh = await buildWithheldClaim(token, feeConfig);
    if (!wh) {
      result.skipped.push('withheld:no-fees');
    } else if ('skip' in wh) {
      result.skipped.push(wh.skip);
    } else {
      const res = await submit(wh.built, { route: 'sender' });
      result.withdrawWithheldSig = res.signature;
      if (res.deduped) {
        result.skipped.push('withheld:deduped');
      } else {
        const amt = await claimedAmountFromMeta(res.signature, wh.destination);
        result.recorded += await recordWithheldWithdraw({
          tokenId: token.id,
          destinationWallet: wh.destination.toBase58(),
          mint: token.mintAddress!,
          amountBaseUnits: amt,
          withdrawSignature: res.signature,
          blockTime: null,
        });
      }
    }
  } catch (err) {
    result.skipped.push(`withheld:${classify(err).code}`);
  }

  // ── 3b. DBC partner trading fee → Momento (PLATFORM) ──────────────────────
  try {
    const built = await buildPartnerTradingFeeClaim(token, feeConfig);
    if (!built) {
      result.skipped.push('partner:no-pool');
    } else {
      const res = await submit(built, { route: 'sender' });
      result.partnerTradingFeeSig = res.signature;
      if (res.deduped) {
        result.skipped.push('partner:deduped');
      } else {
        const dest = feeConfig.feeClaimer
          ? new PublicKey(feeConfig.feeClaimer)
          : serverSigner().publicKey;
        // SDK P0-2: derive the quote-mint ATA under the CORRECT token program
        // (not a hard-coded classic id) so the balance-delta is read from the
        // real ATA — a wrong program silently records the fee as 0.
        const quoteProgram = await resolveMintProgramId(quoteMint);
        const destAta = getAssociatedTokenAddressSync(
          new PublicKey(quoteMint),
          dest,
          true,
          quoteProgram,
        );
        const amt = await claimedAmountFromMeta(res.signature, destAta);
        result.recorded += await recordTradingFeeClaim({
          tokenId: token.id,
          feeConfig,
          recipient: 'PLATFORM',
          destinationWallet: dest.toBase58(),
          amountMint: quoteMint,
          amountBaseUnits: amt,
          claimSignature: res.signature,
          blockTime: null,
        });
      }
    }
  } catch (err) {
    result.skipped.push(`partner:${classify(err).code}`);
  }

  // ── 3b. DBC creator trading fee → creator (CREATOR) ───────────────────────
  try {
    const cc = await buildCreatorTradingFeeClaim(token, feeConfig);
    if (!cc) {
      result.skipped.push('creator:no-pool');
    } else if ('skip' in cc) {
      result.skipped.push(`creator:${cc.skip}`);
    } else {
      const res = await submit(cc.built, { route: 'sender' });
      result.creatorTradingFeeSig = res.signature;
      if (res.deduped) {
        result.skipped.push('creator:deduped');
      } else {
        const dest = new PublicKey(feeConfig.creatorFeeWallet!);
        // SDK P0-2: correct quote-mint token program for the balance-delta read.
        const quoteProgram = await resolveMintProgramId(quoteMint);
        const destAta = getAssociatedTokenAddressSync(
          new PublicKey(quoteMint),
          dest,
          true,
          quoteProgram,
        );
        const amt = await claimedAmountFromMeta(res.signature, destAta);
        result.recorded += await recordTradingFeeClaim({
          tokenId: token.id,
          feeConfig,
          recipient: 'CREATOR',
          destinationWallet: dest.toBase58(),
          amountMint: quoteMint,
          amountBaseUnits: amt,
          claimSignature: res.signature,
          blockTime: null,
        });
      }
    }
  } catch (err) {
    result.skipped.push(`creator:${classify(err).code}`);
  }

  // ── 3c. DAMM v2 locked-LP fees (post-graduation) — partner + creator ──────
  if (token.status === 'GRADUATED') {
    for (const position of token.lpPositions) {
      const legKey = position.owner === 'PARTNER' ? 'partnerLpFeeSig' : 'creatorLpFeeSig';
      try {
        const lp = await buildLpFeeClaim(token, position);
        if (!lp) {
          result.skipped.push(`lp-${position.owner.toLowerCase()}:no-pool`);
        } else if ('skip' in lp) {
          result.skipped.push(`lp-${position.owner.toLowerCase()}:${lp.skip}`);
        } else {
          const res = await submit(lp.built, { route: 'sender' });
          (result as any)[legKey] = res.signature;
          if (res.deduped) {
            result.skipped.push(`lp-${position.owner.toLowerCase()}:deduped`);
          } else {
            const dest = new PublicKey(position.ownerWallet);
            // SDK P0-2 / correctness P1-5: a DAMM v2 locked-LP leg can pay fees in
            // the BASE (Token-2022 creator mint) side as well as the quote (USDC)
            // side. CollectFeeMode.QuoteToken means USDC in the common path, but
            // we resolve the program per-mint rather than hard-coding classic so a
            // Token-2022-denominated leg is not silently read as 0.
            const quoteProgram = await resolveMintProgramId(quoteMint);
            const destAta = getAssociatedTokenAddressSync(
              new PublicKey(quoteMint),
              dest,
              true,
              quoteProgram,
            );
            const amt = await claimedAmountFromMeta(res.signature, destAta);
            result.recorded += await recordTradingFeeClaim({
              tokenId: token.id,
              feeConfig,
              recipient: position.owner === 'PARTNER' ? 'PLATFORM' : 'CREATOR',
              // contract P2 / §f.1: DAMM v2 locked-LP fees are LOCKED_LP_FEE, not
              // *_TRADING_FEE. The lib/fees reader includes LOCKED_LP_FEE in its
              // filter so dollar accounting is unchanged.
              legType: 'LOCKED_LP_FEE',
              destinationWallet: position.ownerWallet,
              amountMint: quoteMint,
              amountBaseUnits: amt,
              claimSignature: res.signature,
              blockTime: null,
            });
          }
        }
      } catch (err) {
        result.skipped.push(`lp-${position.owner.toLowerCase()}:${classify(err).code}`);
      }
    }
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
//  runClaimSweep — cron entry (gated by FEE_CLAIM_ENABLED at the cron seam)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Iterate eligible tokens (GRADUATED, or ACTIVE with a DBC pool) bounded by
 * FEE_CLAIM_BATCH. Independent per token; one token's failure never aborts the
 * sweep (claimTokenFees never throws on a single-source failure).
 */
export async function runClaimSweep(
  limit?: number,
): Promise<{ tokens: number; results: ClaimResult[] }> {
  const envBatch = Number(process.env.FEE_CLAIM_BATCH);
  const take = Math.max(
    1,
    Math.floor(limit ?? (Number.isFinite(envBatch) && envBatch > 0 ? envBatch : MOMENTO_CLAIM.DEFAULT_FEE_CLAIM_BATCH)),
  );

  const tokens = await prisma.creatorToken.findMany({
    where: {
      feeConfig: { isNot: null },
      OR: [
        { status: 'GRADUATED' },
        { status: 'ACTIVE', dbcPoolAddress: { not: null } },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take,
    select: { id: true },
  });

  const results: ClaimResult[] = [];
  for (const t of tokens) {
    results.push(await claimTokenFees(t.id));
  }
  return { tokens: tokens.length, results };
}

// ════════════════════════════════════════════════════════════════════════════
//  REBATE — payRebate + runRebateSweep (D-fee-claim §4)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Pay ONE Trade's owed rebate (USDC default), idempotent. Reserve → send →
 * record, with the partial-failure contract:
 *   1. RESERVE before send: updateMany(rebatePaid:false → true). count===0 ⇒
 *      another worker/tick claimed it → return deduped WITHOUT sending.
 *   2. Build SPL transfer (USDC default; Token-2022 grossed-up fallback) from
 *      MOMENTO_REBATE_USDC_VAULT → traderWallet (idempotent ATA create).
 *   3. On confirm: set Trade.rebateSignature + flip the REBATE FeeEvent to
 *      claimed=true, claimSignature.
 *   4. On send failure: ROLL BACK the reservation (rebatePaid=false) so a later
 *      tick retries — UNLESS the error is TIMEOUT (status unknown): leave
 *      rebatePaid=true and defer to the submit-layer idempotency key.
 */
export async function payRebate(
  tradeId: string,
): Promise<{ sent: boolean; signature?: string; reason?: string }> {
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: { token: { include: { feeConfig: true } } },
  });
  if (!trade) return { sent: false, reason: 'trade-not-found' };
  if (trade.source !== 'IN_APP') return { sent: false, reason: 'not-in-app' };

  // ── SEC P0-1 — RE-DERIVE the rebate from the CONFIRMED on-chain fill ───────
  // NEVER pay from the pre-signature quote estimate (`Trade.rebateBaseUnits` was
  // written by the recon/build path from the quote). The trade-fix agent now
  // populates the trade's CONFIRMED fill (real amountOut/amountIn) and marks it
  // confirmed via `signature` + `blockTime` on submit. If the trade is not
  // confirmed (no signature OR no blockTime) or the confirmed fill amounts are
  // missing/zero, we SKIP — a rebate is only owed against a real, landed swap.
  if (!trade.signature || trade.blockTime == null) {
    return { sent: false, reason: 'not-confirmed' };
  }

  // The taxed leg is ALWAYS the creator-token side of the swap (the Token-2022
  // transfer fee is charged on the token leg). BUY: tokens RECEIVED = amountOut;
  // SELL: tokens SENT = amountIn. (Mirrors trade.ts buildTrade `taxedBaseGross`.)
  let taxedBaseGross: bigint;
  try {
    taxedBaseGross =
      trade.side === 'BUY'
        ? BigInt(trade.amountOutBaseUnits || '0')
        : BigInt(trade.amountInBaseUnits || '0');
  } catch {
    taxedBaseGross = BigInt(0);
  }
  if (taxedBaseGross <= BigInt(0)) {
    return { sent: false, reason: 'no-confirmed-fill' };
  }

  // Re-compute the owed rebate from the confirmed fill (NOT the stored estimate).
  const feeBps =
    trade.token?.feeConfig?.transferFeeBps ??
    trade.token?.transferFeeBps ??
    MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS;
  const targetBps = trade.token?.feeConfig?.rebateTargetBps ?? MOMENTO_FEE.TARGET_IN_APP_BPS;
  let maxFee: bigint;
  try {
    maxFee = trade.token?.transferFeeMaxBaseUnits
      ? BigInt(trade.token.transferFeeMaxBaseUnits)
      : BigInt(0);
  } catch {
    maxFee = BigInt(0);
  }

  const { rebateOwedNet } = computeRebate({
    grossBaseUnits: taxedBaseGross,
    feeBps,
    targetBps,
    maxFeeBaseUnits: maxFee,
  });
  if (rebateOwedNet <= BigInt(0)) return { sent: false, reason: 'no-rebate-owed' };

  const rebateMint = trade.rebateMint ?? trade.token?.feeConfig?.rebateMint ?? MOMENTO_FEE.USDC_MINT;
  const useUsdc = rebateMint === MOMENTO_FEE.USDC_MINT;
  const decimals = trade.token?.decimals ?? 9;

  // Convert the net token rebate to the SEND amount in the rebate mint, derived
  // from the CONFIRMED fill — USDC default (fee-exempt, priced at the trade's
  // snapshot), Token-2022 fallback grossed up so the trader nets `rebateOwedNet`.
  let rebateBaseUnits: bigint;
  if (useUsdc) {
    rebateBaseUnits = rebateToUsdc(rebateOwedNet, trade.priceUsd ?? 0, decimals);
  } else {
    rebateBaseUnits = grossUpTokenRebate(rebateOwedNet, feeBps);
  }
  if (rebateBaseUnits <= BigInt(0)) return { sent: false, reason: 'no-rebate-owed' };

  // ── (1) RESERVE before send (anti-double-pay CAS) ─────────────────────────
  // SEC P0-2 / correctness P1: the reservation is a CAS on `rebatePaid:false`.
  // A crashed reservation (rebatePaid:true, rebateSignature:null) is recovered by
  // runRebateSweep, which retries via the SAME stable idempotency key below — the
  // durable submit store dedups any real prior send. So a row already reserved but
  // unsent is NOT a hard stop: we allow this call to proceed when it was the
  // crash-recovery selector that picked it up (rebatePaid:true & no signature).
  if (trade.rebatePaid && trade.rebateSignature) {
    // Genuinely already paid (sig recorded) — nothing to do.
    return { sent: false, reason: 'already-paid', signature: trade.rebateSignature };
  }
  if (!trade.rebatePaid) {
    const reservation = await prisma.trade.updateMany({
      where: { id: tradeId, rebatePaid: false },
      data: { rebatePaid: true },
    });
    if (reservation.count === 0) {
      // Another worker/tick already reserved/paid it.
      return { sent: false, reason: 'deduped' };
    }
  }
  // else: rebatePaid===true && rebateSignature===null → crashed/stranded
  // reservation. Proceed to (re)send under the stable rebate:<tradeId> key; the
  // submit store short-circuits to the prior signature if it actually landed.

  // From here on, on a definitive (non-TIMEOUT) failure we MUST roll back the
  // reservation so a later tick retries.
  try {
    // ── (2) build the SPL transfer ──────────────────────────────────────────
    const vaultOwner = requiredWallet('MOMENTO_REBATE_USDC_VAULT');
    const trader = new PublicKey(trade.traderWallet);
    const mint = new PublicKey(rebateMint);

    // USDC default = classic SPL, fee-exempt, no gross-up. Token fallback =
    // Token-2022 (rebateBaseUnits was already grossed-up above).
    const programId = useUsdc
      ? new PublicKey(MOMENTO_FEE.TOKEN_CLASSIC_PROGRAM_ID)
      : new PublicKey(MOMENTO_FEE.TOKEN_2022_PROGRAM_ID);

    const sendDecimals = useUsdc ? MOMENTO_FEE.USDC_DECIMALS : decimals;
    // `rebateBaseUnits` is the final send amount: for USDC it's the priced net
    // rebate; for the token fallback it's already grossed-up (computed above).
    const sendAmount = rebateBaseUnits;

    const sourceAta = getAssociatedTokenAddressSync(mint, vaultOwner, true, programId);
    const destAta = getAssociatedTokenAddressSync(mint, trader, true, programId);

    const ixs: TransactionInstruction[] = [
      createAssociatedTokenAccountIdempotentInstruction(
        serverSigner().publicKey, // payer
        destAta,
        trader,
        mint,
        programId,
      ),
      createTransferCheckedInstruction(
        sourceAta,
        mint,
        destAta,
        vaultOwner, // owner/authority of the rebate vault (server wallet)
        sendAmount,
        sendDecimals,
        [],
        programId,
      ),
    ];

    const built: BuiltTx = {
      tx: new Transaction().add(...ixs),
      signers: [serverSigner()],
      label: `rebate:${tradeId}`,
    };

    // Default path = USDC over 'rpc' (fee-exempt, no Jito tip needed).
    // SEC P0-2: pass an EXPLICIT, STABLE idempotency key `rebate:<tradeId>` (NOT
    // the per-message hash). The rebate ix set is rebuilt with a fresh blockhash
    // each tick, so a message-derived key would differ across rebuilds and could
    // double-pay; a per-trade key makes the durable submit store dedup a real
    // prior send and short-circuit to its signature (this is also what makes the
    // crashed-reservation retry in (5) safe).
    const res: SubmitResult = await submit(built, {
      route: 'rpc',
      idempotencyKey: `rebate:${tradeId}`,
    });

    // ── (3) on confirm: persist signature + flip REBATE FeeEvent ─────────────
    const now = new Date();
    await prisma.$transaction(async (txc) => {
      await txc.trade.update({
        where: { id: tradeId },
        data: { rebateSignature: res.signature },
      });
      await txc.feeEvent.updateMany({
        where: { tradeId, type: 'REBATE', claimed: false },
        data: { claimed: true, claimedAt: now, claimSignature: res.signature },
      });
    });

    return { sent: !res.deduped, signature: res.signature, reason: res.deduped ? 'deduped' : undefined };
  } catch (err) {
    const e = classify(err);
    // ── (4) partial-failure contract ────────────────────────────────────────
    // TIMEOUT / DUPLICATE (in-flight) ⇒ status unknown: LEAVE rebatePaid=true and
    // defer to the submit-layer idempotency key (re-derives the same key → never
    // a second transfer). Anything else ⇒ definitive failure: roll back.
    if (e.code === 'TIMEOUT' || e.code === 'DUPLICATE') {
      return { sent: false, signature: e.signature, reason: e.code.toLowerCase() };
    }
    // BLOCKHASH_EXPIRED / RPC_ERROR / SIMULATION_FAILED / … → roll back the
    // reservation so a later tick rebuilds + retries.
    await prisma.trade.updateMany({
      where: { id: tradeId, rebatePaid: true, rebateSignature: null },
      data: { rebatePaid: false },
    });
    return { sent: false, reason: e.code.toLowerCase() };
  }
}

/**
 * Cron entry: select unpaid IN_APP rebates bounded by REBATE_BATCH; partial-
 * failure safe (collect, continue, report — NEVER abort the batch on one
 * failure). Gated by REBATE_SEND_ENABLED && REBATE_LEGAL_APPROVED at the cron
 * seam.
 */
export async function runRebateSweep(limit?: number): Promise<RebateResult> {
  const envBatch = Number(process.env.REBATE_BATCH);
  const take = Math.max(
    1,
    Math.floor(limit ?? (Number.isFinite(envBatch) && envBatch > 0 ? envBatch : MOMENTO_CLAIM.DEFAULT_REBATE_BATCH)),
  );

  // (A) Standard set: unpaid IN_APP rebates. `payRebate` re-derives the owed
  // amount from the CONFIRMED on-chain fill (SEC P0-1) and self-skips unconfirmed
  // / zero-rebate rows, so the source of truth is no longer the stored estimate —
  // we therefore do NOT pre-filter on `Trade.rebateBaseUnits` here (that field is
  // the pre-signature estimate and may be 0 even when a confirmed rebate is owed).
  const unpaid = await prisma.trade.findMany({
    where: { source: 'IN_APP', rebatePaid: false },
    orderBy: { createdAt: 'asc' },
    take,
    select: { id: true },
  });

  // (B) correctness P1 — RECOVER stranded reservations: a crash between RESERVE
  // and send (or a failed rollback) leaves a row `rebatePaid=true,
  // rebateSignature=null` that the standard `rebatePaid:false` selector skips
  // forever. Re-pick those up and retry idempotently via the `rebate:<tradeId>`
  // key — the durable submit store short-circuits to the prior signature if a send
  // actually landed, else re-sends. A small stale window avoids racing a
  // reservation made earlier in THIS same tick.
  const STALE_MS = 60_000;
  const staleBefore = new Date(Date.now() - STALE_MS);
  const stranded = await prisma.trade.findMany({
    where: {
      source: 'IN_APP',
      rebatePaid: true,
      rebateSignature: null,
      updatedAt: { lt: staleBefore },
    },
    orderBy: { updatedAt: 'asc' },
    take,
    select: { id: true },
  });

  // Merge (dedup ids; unpaid first), bounded by `take`.
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const t of [...unpaid, ...stranded]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    ids.push(t.id);
    if (ids.length >= take) break;
  }

  const out: RebateResult = { attempted: 0, sent: 0, deduped: 0, failed: 0, signatures: [] };
  for (const id of ids) {
    out.attempted++;
    try {
      const r = await payRebate(id);
      if (r.sent) {
        out.sent++;
        if (r.signature) out.signatures.push(r.signature);
      } else if (r.reason === 'deduped' || r.reason === 'timeout' || r.reason === 'duplicate') {
        out.deduped++;
        if (r.signature) out.signatures.push(r.signature);
      } else if (
        r.reason === 'not-confirmed' ||
        r.reason === 'no-confirmed-fill' ||
        r.reason === 'no-rebate-owed' ||
        r.reason === 'already-paid' ||
        r.reason === 'not-in-app' ||
        r.reason === 'trade-not-found'
      ) {
        // Benign no-ops (not yet confirmed, nothing owed, already done) — neither
        // a send nor a failure. Don't inflate `failed`.
      } else {
        out.failed++;
      }
    } catch {
      // payRebate is defensive, but never let one trade abort the batch.
      out.failed++;
    }
  }

  return out;
}
