/**
 * POST /api/vesting/[id]/withdraw — User (recipient) · writeLimiter
 * (CONTRACTS-P3A §d.9, D-vesting §4.3).
 *
 * requireAuth. Load VestingSchedule by id; authorize caller wallet ===
 * beneficiaryWallet (recipient-only — the recipient must sign). 400 "Nothing to
 * withdraw" if claimable 0. buildVestingWithdraw -> buildUnsignedForClient (the
 * recipient signs via embedded wallet). On the logged confirm, bump
 * releasedBaseUnits / flip COMPLETED — handled by /api/wallet/transactions/log.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

import { requireAuth, getWalletForChain } from '@/lib/auth';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { vestingWithdrawSchema, validateBody, isValidUuid } from '@/lib/validation';
import prisma from '@/lib/prisma';

import { buildVestingWithdraw } from '@/lib/vesting';
import { buildUnsignedForClient } from '@/lib/solana';
import { SolanaTxError } from '@/lib/solana';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);

    const { id } = await params;
    if (!isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const wallet = getWalletForChain(user);
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Wallet not ready' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = validateBody(vestingWithdrawSchema, body);
    if (!parsed.success) return parsed.response;

    const schedule = await prisma.vestingSchedule.findUnique({ where: { id } });
    if (!schedule) {
      return NextResponse.json({ success: false, error: 'Vesting not found' }, { status: 404 });
    }

    // Recipient-only: caller's wallet must equal beneficiaryWallet.
    if (schedule.beneficiaryWallet !== wallet) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { built, claimableBase } = await buildVestingWithdraw({
      schedule,
      invoker: new PublicKey(wallet),
      amountBase: parsed.data.amountBase,
    });

    if (claimableBase === '0') {
      return NextResponse.json({ success: false, error: 'Nothing to withdraw' }, { status: 400 });
    }

    // Recipient signs with their embedded wallet (client-relay path).
    const { txBase64 } = await buildUnsignedForClient(built);

    return NextResponse.json({
      success: true,
      data: { transaction: txBase64, claimableBase },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof SolanaTxError) {
      const status =
        error.code === 'SIMULATION_FAILED'
          ? 400
          : error.code === 'CONFIG_MISSING' || error.code === 'STUBBED'
            ? 500
            : 502;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    console.error('Vesting withdraw error:', error);
    return NextResponse.json({ success: false, error: 'Failed to build withdraw' }, { status: 500 });
  }
}
