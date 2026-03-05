import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fetchWalletBalance } from '@/lib/helius';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

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
