/**
 * POST /api/vesting/create — Creator · writeLimiter (CONTRACTS-P3A §d.7, D-vesting §4.1).
 *
 * requireCreator + wallet gate; verify caller owns tokenId (CreatorToken.userId
 * === user.id) and mint === token.mintAddress. Build via buildVestingCreate.
 * Persist a VestingSchedule PENDING row, then:
 *   - server path: submit() (serverSigner + ephemeralSigner) -> ACTIVE + createSignature.
 *   - client path (fallback on PARTIAL_SIGN_UNSUPPORTED, or VESTING_FORCE_CLIENT_COSIGN=1):
 *     rebuild signers = [ephemeral, clientRelay(creatorWallet)], buildUnsignedForClient()
 *     pre-attaches the ephemeral sig server-side; row stays PENDING until mobile
 *     self-submits + POSTs /api/wallet/transactions/log (type 'vest_create').
 *
 * Response carries a signMode 'server'|'client' discriminator.
 *
 * ── TRUST MODEL (SEC P0-3) ───────────────────────────────────────────────────
 * What the treasury server-signs here is CONSTRAINED to "fund a vesting of the
 * CREATOR'S OWN allocation to a VALIDATED recipient", never an arbitrary transfer:
 *   1. AuthZ: requireCreator + the caller must OWN the tokenId
 *      (CreatorToken.userId === user.id) AND mint === token.mintAddress. The
 *      source-of-funds ATA is the CREATOR'S wallet ATA (payer = creatorWallet) —
 *      the builder pulls from `getAssociatedTokenAddressSync(mint, payer)`, so the
 *      creator can only ever move tokens out of their OWN ATA.
 *   2. Recipient: validated as a base58 pubkey BEFORE the builder is reached
 *      (mirrors the mint guard) → clean 400 instead of an unmapped 500 deep in
 *      `new PublicKey(recipient)`.
 *   3. Amount sanity: amountBase must be > 0 (schema regex already enforces) and
 *      the cliff portion must fit within it; both are bounded by a per-token
 *      allocation ceiling (sum of existing non-terminal schedules + this request
 *      must not exceed the token's totalSupply, configurable via
 *      VESTING_MAX_SUPPLY_MULTIPLIER). This stops a creator minting unlimited
 *      vesting schedules to colluding wallets with the treasury as co-signer.
 *   4. Server co-sign caveat: on the PRIMARY path the treasury is fee-payer +
 *      co-signer for a transfer that benefits `recipient`. Because (1)-(3) bound
 *      the source ATA, the recipient validity and the total moved, the treasury
 *      only ever co-signs a bounded creator→validated-recipient vesting. The
 *      client-relay fallback (creator signs, no server co-sign) remains available
 *      and is preferred whenever the server cannot multi-sign.
 * NOTE(verify-devnet): a pre-build source-ATA balance simulation (SEC P0-3.c, so
 *   the treasury never co-signs a doomed/insufficient-balance transfer) is left as
 *   a follow-up — submit() has no pre-flight simulation hook yet and the on-chain
 *   tx fails safely (reverts) if the ATA is short. The allocation ceiling above is
 *   the offline-enforceable bound.
 *
 * TODO(verify-devnet): the Privy ephemeral co-sig (D-vesting §3 / §9.1) is the
 * single gating item — it flips the DEFAULT path. Until proven on devnet we try
 * server then fall back to client on the raised PARTIAL_SIGN_UNSUPPORTED.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, Transaction } from '@solana/web3.js';

import { requireCreator, getWalletForChain } from '@/lib/auth';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { vestingCreateSchema, validateBody, isValidMint } from '@/lib/validation';
import prisma from '@/lib/prisma';

/**
 * Per-token vesting allocation ceiling as a FRACTION of the token's totalSupply
 * (SEC P0-3.b). The sum of all non-terminal VestingSchedule.totalBaseUnits for a
 * token PLUS this request must not exceed totalSupply * this multiplier. Default
 * 1.0 (cannot vest more than the whole supply). Configurable via
 * VESTING_MAX_SUPPLY_MULTIPLIER for tokens that legitimately over-allocate across
 * recreated/cancelled schedules; values are parsed as a float and clamped to >0.
 */
function vestingAllocationCeiling(totalSupply: bigint): bigint {
  const raw = Number(process.env.VESTING_MAX_SUPPLY_MULTIPLIER ?? '1');
  const mult = Number.isFinite(raw) && raw > 0 ? raw : 1;
  // Scale via integer math on a 1e6 fixed-point multiplier to avoid float drift.
  const scaled = BigInt(Math.round(mult * 1_000_000));
  return (totalSupply * scaled) / BigInt(1_000_000);
}

import {
  buildVestingCreate,
  type VestingCreateInput,
  type VestingPlan,
} from '@/lib/vesting';
import { submit, buildUnsignedForClient, clientRelaySigner } from '@/lib/solana';
import type { BuiltTx } from '@/lib/solana';
import { SolanaTxError } from '@/lib/solana';

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireCreator(request);

    const wallet = getWalletForChain(user);
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Wallet not ready' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = validateBody(vestingCreateSchema, body);
    if (!parsed.success) return parsed.response;
    const input = parsed.data;

    if (!isValidMint(input.mint)) {
      return NextResponse.json({ success: false, error: 'Invalid mint' }, { status: 400 });
    }

    // SEC P0-3.a: validate `recipient` is a real base58 pubkey BEFORE the builder
    // reaches `new PublicKey(input.recipient)` (which would throw an unmapped 500).
    // Reuse the mint base58 guard — a Solana wallet pubkey is the same alphabet/len.
    if (!isValidMint(input.recipient)) {
      return NextResponse.json({ success: false, error: 'Invalid recipient' }, { status: 400 });
    }

    // SEC P0-3.b: amount sanity. The schema regex already enforces amountBase>0 and
    // cliffAmountBase>=0; here we additionally assert it parses to a positive bigint
    // and that the cliff portion fits within the gross amount (so amountPerPeriod is
    // never derived from a negative remainder).
    let amount: bigint;
    let cliffAmount: bigint;
    try {
      amount = BigInt(input.amountBase);
      cliffAmount = BigInt(input.cliffAmountBase ?? '0');
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 });
    }
    if (amount <= BigInt(0)) {
      return NextResponse.json({ success: false, error: 'Amount must be > 0' }, { status: 400 });
    }
    if (cliffAmount > amount) {
      return NextResponse.json(
        { success: false, error: 'cliffAmountBase exceeds amountBase' },
        { status: 400 },
      );
    }

    // Ownership: caller owns tokenId and mint matches CreatorToken.mintAddress.
    const token = await prisma.creatorToken.findUnique({
      where: { id: input.tokenId },
      select: {
        id: true,
        userId: true,
        mintAddress: true,
        symbol: true,
        tokenProgram: true,
        transferFeeBps: true,
        totalSupply: true,
      },
    });
    if (!token || token.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Token not found' }, { status: 404 });
    }
    if (!token.mintAddress || token.mintAddress !== input.mint) {
      return NextResponse.json({ success: false, error: 'Mint does not match token' }, { status: 400 });
    }

    // SEC P0-3.b: per-token allocation ceiling. The treasury only ever co-signs a
    // vesting of the creator's OWN allocation; cap the cumulative vested amount so a
    // creator cannot mint unlimited schedules to colluding wallets. We sum existing
    // NON-TERMINAL schedules (PENDING/ACTIVE/PAUSED still lock escrow tokens;
    // CANCELED/COMPLETED free their slot) and reject if existing + this request
    // exceeds totalSupply * the configured multiplier. Money stays bigint;
    // totalSupply is a base-unit string.
    let totalSupply: bigint;
    try {
      totalSupply = BigInt(token.totalSupply);
    } catch {
      totalSupply = BigInt(0);
    }
    if (totalSupply > BigInt(0)) {
      const existing = await prisma.vestingSchedule.findMany({
        where: { tokenId: input.tokenId, status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] } },
        select: { totalBaseUnits: true },
      });
      let allocated = BigInt(0);
      for (const row of existing) {
        try {
          allocated += BigInt(row.totalBaseUnits);
        } catch {
          /* skip malformed legacy rows */
        }
      }
      const ceiling = vestingAllocationCeiling(totalSupply);
      // Compare against GROSS `amount` (tokens leaving the creator ATA), even though
      // rows persist NET totals — gross >= net, so this is the conservative bound.
      if (allocated + amount > ceiling) {
        return NextResponse.json(
          { success: false, error: 'Vesting allocation exceeds token supply ceiling' },
          { status: 400 },
        );
      }
    }

    const payer = new PublicKey(wallet);
    const isToken2022 = token.tokenProgram === 'TOKEN_2022';

    const buildInput: VestingCreateInput = {
      kind: input.kind,
      tokenId: input.tokenId,
      mint: input.mint,
      recipient: input.recipient,
      amountBase: input.amountBase,
      startAt: input.startAt,
      cliffAt: input.cliffAt,
      endAt: input.endAt,
      unlockEvery: input.unlockEvery,
      cliffAmountBase: input.cliffAmountBase,
      // §6: classic allocation is the default (transferFeeBps undefined => no haircut).
      // For a T22 mint we pass the fee so netDepositBase reflects what actually vests.
      transferFeeBps: isToken2022 ? token.transferFeeBps ?? undefined : undefined,
      isToken2022,
    };

    // Build the PRIMARY (server) plan. Builder attaches [serverSigner, ephemeral].
    const plan: VestingPlan = await buildVestingCreate(buildInput, payer);

    // Snapshot the ORIGINAL program instructions before submit() mutates the tx
    // (submit() prepends compute-budget ixs, sets a server feePayer/blockhash, and
    // partialSigns the ephemeral). The client-relay fallback rebuilds a clean tx
    // from these, reusing the SAME ephemeral Signer so streamId stays stable.
    const originalIxs = [...plan.built.tx.instructions];

    // Resolve a beneficiary User by wallet, if any (for list role=recipient).
    const beneficiary = await prisma.user.findFirst({
      where: { walletAddress: input.recipient },
      select: { id: true },
    });

    // Persist PENDING (§7). streamId is the natural unique key.
    const schedule = await prisma.vestingSchedule.create({
      data: {
        tokenId: input.tokenId,
        provider: plan.provider,
        streamId: plan.streamId,
        tokenMint: input.mint,
        totalBaseUnits: plan.netDepositBase, // §6: persist NET (what actually vests)
        beneficiaryWallet: input.recipient,
        beneficiaryUserId: beneficiary?.id ?? null,
        cliffSeconds: Math.max(0, input.cliffAt - input.startAt),
        durationSeconds: Math.max(0, input.endAt - input.startAt),
        startAt: new Date(input.startAt * 1000),
        cliffAt: new Date(input.cliffAt * 1000),
        endAt: new Date(input.endAt * 1000),
        status: 'PENDING',
      },
      select: { id: true },
    });

    const forceClient = process.env.VESTING_FORCE_CLIENT_COSIGN === '1';

    // ── Client-relay fallback builder (§3.2) ──
    const buildClientResponse = async () => {
      // Reuse the SAME ephemeral co-signer (its keypair, captured in the Signer
      // closure, derives the persisted streamId) but on a CLEAN tx rebuilt from the
      // original program ixs — the server submit() may have mutated plan.built.tx.
      const ephemeral = plan.built.signers.find((s) => s.kind === 'ephemeral');
      if (!ephemeral) {
        throw new SolanaTxError('SIGNER_REJECTED', 'no ephemeral signer to relay');
      }
      const cleanTx = new Transaction().add(...originalIxs);
      const fallbackBuilt: BuiltTx = {
        tx: cleanTx,
        // clientRelaySigner(payer) makes the creator wallet the feePayer + primary
        // signer; buildUnsignedForClient pre-attaches the ephemeral partialSign.
        signers: [ephemeral, clientRelaySigner(payer)],
        label: plan.built.label,
      };
      const { txBase64 } = await buildUnsignedForClient(fallbackBuilt);
      return NextResponse.json({
        success: true,
        data: {
          vestingId: schedule.id,
          provider: plan.provider,
          streamId: plan.streamId,
          signMode: 'client',
          transaction: txBase64,
          createSignature: null,
          netDepositBase: plan.netDepositBase,
        },
      });
    };

    if (forceClient) {
      return await buildClientResponse();
    }

    // ── PRIMARY server path (§3.1) ──
    try {
      // SDK P1-9: `label` lives on BuiltTx (plan.built.label), NOT in SubmitOptions
      // (TS2353 excess-property error + ignored at runtime). submit() reads
      // built.label itself, so we pass only valid SubmitOptions here.
      const result = await submit(plan.built, { route: 'rpc' });
      await prisma.vestingSchedule.update({
        where: { id: schedule.id },
        data: { status: 'ACTIVE', createSignature: result.signature },
      });
      return NextResponse.json({
        success: true,
        data: {
          vestingId: schedule.id,
          provider: plan.provider,
          streamId: plan.streamId,
          signMode: 'server',
          transaction: null,
          createSignature: result.signature,
          netDepositBase: plan.netDepositBase,
        },
      });
    } catch (err) {
      // FALLBACK on PARTIAL_SIGN_UNSUPPORTED -> client-relay co-sign.
      if (err instanceof SolanaTxError && err.code === 'PARTIAL_SIGN_UNSUPPORTED') {
        return await buildClientResponse();
      }
      throw err;
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof SolanaTxError) return mapSolanaError(error);
    console.error('Vesting create error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create vesting' }, { status: 500 });
  }
}

function mapSolanaError(error: SolanaTxError): NextResponse {
  const body = (status: number) =>
    NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
  switch (error.code) {
    case 'DUPLICATE':
      return body(200);
    case 'SIMULATION_FAILED':
      return body(400);
    case 'INSUFFICIENT_FUNDS':
      return body(402);
    case 'TIMEOUT':
    case 'BLOCKHASH_EXPIRED':
      return body(202);
    case 'CONFIG_MISSING':
    case 'STUBBED':
      return body(500);
    case 'SIGNER_REJECTED':
    case 'PARTIAL_SIGN_UNSUPPORTED':
      return body(502);
    default:
      return body(500);
  }
}
