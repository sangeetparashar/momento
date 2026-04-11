import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getChainParam } from '@/lib/auth';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';
import prisma from '@/lib/prisma';

const RANGE_HOURS: Record<string, number> = {
  '24H': 24,
  '7D': 7 * 24,
  '1M': 30 * 24,
  '3M': 90 * 24,
  '1Y': 365 * 24,
};

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const user = await requireAuth(request);
    const chain = getChainParam(request);

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '1M';
    const hours = RANGE_HOURS[range] || 30 * 24;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: {
        userId: user.id,
        chain,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        totalValueUsd: true,
        nativeBalance: true,
        nativeValueUsd: true,
        tokenValueUsd: true,
        createdAt: true,
      },
    });

    // Downsample to ~200 points max to keep payload small
    const maxPoints = 200;
    const data = snapshots.length <= maxPoints
      ? snapshots
      : snapshots.filter((_, i) =>
          i === 0 ||
          i === snapshots.length - 1 ||
          i % Math.ceil(snapshots.length / maxPoints) === 0
        );

    const points = data.map((s) => ({
      t: s.createdAt.getTime(),
      p: Math.round(s.totalValueUsd * 100) / 100,
      native: Math.round(s.nativeValueUsd * 100) / 100,
      sol: Math.round(s.nativeValueUsd * 100) / 100, // backward compat alias
      tokens: Math.round(s.tokenValueUsd * 100) / 100,
    }));

    return NextResponse.json({ success: true, data: points });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Portfolio snapshots error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch portfolio snapshots' },
      { status: 500 }
    );
  }
}
