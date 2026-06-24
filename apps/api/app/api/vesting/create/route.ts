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
      },
    });
    if (!token || token.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Token not found' }, { status: 404 });
    }
    if (!token.mintAddress || token.mintAddress !== input.mint) {
      return NextResponse.json({ success: false, error: 'Mint does not match token' }, { status: 400 });
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
      const result = await submit(plan.built, { route: 'rpc', label: plan.built.label });
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
