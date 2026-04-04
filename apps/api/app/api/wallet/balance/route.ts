import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fetchWalletBalance } from '@/lib/helius';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const user = await requireAuth(request);

    if (!user.walletAddress || user.walletAddress.startsWith('pending-')) {
      // Return empty balance for users without a real wallet
      return NextResponse.json({
        success: true,
        data: {
          chain: 'solana',
          nativeBalance: 0,
          nativePriceUsd: 0,
          nativeSymbol: 'SOL',
          solBalance: 0,
          tokens: [],
          totalValueUsd: 0,
          change24h: 0,
          earningsToDate: 0,
        },
      });
    }

    const cacheKey = cacheKeys.walletBalance(user.walletAddress);

    const balance = await getOrSetCache(cacheKey, cacheTTL.walletBalance, async () => {
      return await fetchWalletBalance(user.walletAddress);
    });

    // Record portfolio snapshot (fire-and-forget, don't block response)
    if (balance.totalValueUsd != null) {
      const solValueUsd = balance.solBalance * (balance.solPriceUsd ?? 0);
      const tokenValueUsd = balance.tokens.reduce(
        (sum: number, t: any) => sum + (t.valueUsd || 0),
        0
      );
      prisma.portfolioSnapshot.create({
        data: {
          userId: user.id,
          totalValueUsd: balance.totalValueUsd ?? 0,
          solBalance: balance.solBalance,
          solValueUsd,
          tokenValueUsd,
        },
      }).catch((err: any) => console.error('Snapshot write error:', err?.message));
    }

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
