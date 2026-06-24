/**
 * POST /api/vesting/[id]/withdraw — User (recipient) · writeLimiter
 * (CONTRACTS-P3A §d.9, D-vesting §4.3).
 *
 * requireAuth. Load VestingSchedule by id; authorize the caller as the recipient
 * (beneficiaryUserId === user.id when set, with a wallet match as a secondary
 * gate; wallet-string equality only when beneficiaryUserId is null). 400 "Nothing
 * to withdraw" if claimable 0. buildVestingWithdraw -> buildUnsignedForClient (the
 * recipient signs via embedded wallet). After the recipient self-submits, the
 * mobile client POSTs /api/vesting/[id]/confirm, which re-derives the withdrawn
 * total from the signature's tx meta and bumps releasedBaseUnits / flips
 * COMPLETED. (The old /api/wallet/transactions/log path never handled vesting.)
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
    // G-1 (authz P1-A): auth-first per-user fail-closed limiting. IP/XFF keying lets
    // a caller rotate X-Forwarded-For for a fresh bucket per request and lets unauth
    // traffic pre-burn a NAT's bucket on this fund-moving write path.
    // failClosed: a Redis outage must not silently disable the cap.
    const user = await requireAuth(request);
    const rateLimitResponse = await applyRateLimit(request, writeLimiter, user.id, {
      failClosed: true,
    });
    if (rateLimitResponse) return rateLimitResponse;

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

    const schedule = await prisma.vestingSchedule.findUnique({
      where: { id },
      include: { token: { select: { tokenProgram: true } } },
    });
    if (!schedule) {
      return NextResponse.json({ success: false, error: 'Vesting not found' }, { status: 404 });
    }

    // Recipient-only authorization (P1 hardening). Prefer the resolved
    // beneficiaryUserId (a server-side user binding) over raw wallet-string
    // equality on a field copied verbatim from creator-supplied input.recipient.
    //   - beneficiaryUserId set  → user.id must match it AND the signing wallet must
    //     still match beneficiaryWallet (the tx is built for that wallet's ATA).
    //   - beneficiaryUserId null → fall back to wallet-string equality.
    const authorized =
      schedule.beneficiaryUserId != null
        ? schedule.beneficiaryUserId === user.id && schedule.beneficiaryWallet === wallet
        : schedule.beneficiaryWallet === wallet;
    if (!authorized) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // P1 hardening: VestingSchedule has no token-program column yet, so resolve the
    // mint's program from CreatorToken.tokenProgram (joined above) and thread it
    // through — the launched-token default is Token-2022; deriving ATAs under the
    // classic program would make the claim revert (withdraw-DoS).
    const isToken2022 = schedule.token?.tokenProgram === 'TOKEN_2022';

    const { built, claimableBase } = await buildVestingWithdraw({
      schedule,
      invoker: new PublicKey(wallet),
      amountBase: parsed.data.amountBase,
      isToken2022,
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
