import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fetchWalletBalance } from '@/lib/helius';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const user = await requireAuth(request);

    if (!user.walletAddress) {
      return NextResponse.json(
        { success: false, error: 'No wallet address linked to this account' },
        { status: 400 }
      );
    }

    const cacheKey = cacheKeys.walletBalance(user.walletAddress);

    const balance = await getOrSetCache(cacheKey, cacheTTL.walletBalance, async () => {
      return await fetchWalletBalance(user.walletAddress);
    });

    return NextResponse.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Wallet balance error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch wallet balance' },
      { status: 500 }
    );
  }
}
