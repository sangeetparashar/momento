/**
 * GET /api/vesting/list — User · readLimiter (CONTRACTS-P3A §d.8, D-vesting §4.2).
 *
 * requireAuth. ?role=recipient (default) | sender ; optional ?mint=.
 * recipient: rows where beneficiaryUserId === user.id OR beneficiaryWallet === wallet.
 * sender:    rows for CreatorTokens owned by the user (the sender side).
 * Each row enriched with live getVestingState (best-effort; falls back to DB totals
 * on RPC error so the list still renders).
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth, getWalletForChain } from '@/lib/auth';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';
import { isValidMint } from '@/lib/validation';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

import { getVestingState } from '@/lib/vesting';

export async function GET(request: NextRequest) {
  try {
    // G-1 (authz P1-A): auth-first per-user fail-closed limiting. IP/XFF keying lets
    // a caller rotate X-Forwarded-For for a fresh bucket per request and lets unauth
    // traffic pre-burn a NAT's bucket. failClosed: a Redis outage must not silently
    // disable the cap.
    const user = await requireAuth(request);
    const rateLimitResponse = await applyRateLimit(request, readLimiter, user.id, {
      failClosed: true,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const url = new URL(request.url);
    const roleParam = url.searchParams.get('role');
    const role: 'recipient' | 'sender' = roleParam === 'sender' ? 'sender' : 'recipient';
    const mint = url.searchParams.get('mint') ?? undefined;
    if (mint && !isValidMint(mint)) {
      return NextResponse.json({ success: false, error: 'Invalid mint' }, { status: 400 });
    }

    const wallet = getWalletForChain(user);

    const where: Prisma.VestingScheduleWhereInput =
      role === 'sender'
        ? { token: { userId: user.id } }
        : {
            OR: [
              { beneficiaryUserId: user.id },
              ...(wallet ? [{ beneficiaryWallet: wallet }] : []),
            ],
          };
    if (mint) where.tokenMint = mint;

    const schedules = await prisma.vestingSchedule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenMint: true,
        provider: true,
        streamId: true,
        totalBaseUnits: true,
        releasedBaseUnits: true,
        beneficiaryWallet: true,
        beneficiaryUserId: true,
        cliffAt: true,
        endAt: true,
        startAt: true,
        durationSeconds: true,
        cliffSeconds: true,
        status: true,
        token: { select: { symbol: true, decimals: true } },
      },
    });

    const data = await Promise.all(
      schedules.map(async (s) => {
        let totalBase = s.totalBaseUnits;
        let withdrawnBase = s.releasedBaseUnits;
        let claimableBase = '0';
        let status: string = s.status;
        try {
          const live = await getVestingState(s as any);
          totalBase = live.totalBase;
          withdrawnBase = live.withdrawnBase;
          claimableBase = live.claimableBase;
          status = live.status;
        } catch {
          // RPC hiccup — fall back to DB totals so the list still renders.
        }
        return {
          vestingId: s.id,
          mint: s.tokenMint,
          symbol: s.token?.symbol ?? null,
          // G-4: surface per-row decimals so the mobile withdraw sheet scales
          // base units correctly instead of defaulting to 9 (mis-scaling 6-8
          // decimal tokens). CreatorToken.decimals is the authoritative mint scale.
          decimals: s.token?.decimals ?? null,
          role,
          totalBase,
          withdrawnBase,
          claimableBase,
          cliffAt: s.cliffAt ? Math.floor(s.cliffAt.getTime() / 1000) : null,
          endAt: s.endAt ? Math.floor(s.endAt.getTime() / 1000) : null,
          status,
        };
      }),
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Vesting list error:', error);
    return NextResponse.json({ success: false, error: 'Failed to list vesting' }, { status: 500 });
  }
}
