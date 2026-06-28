import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getWalletForChain } from '@/lib/auth';
import { fetchWalletBalance } from '@/lib/helius';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const user = await requireAuth(request);

    const chain = 'solana';
    const walletAddress = getWalletForChain(user);

    if (!walletAddress) {
      // Return empty balance for users without a real wallet yet
      return NextResponse.json({
        success: true,
        data: {
          chain,
          nativeBalance: 0,
          nativePriceUsd: 0,
          nativeSymbol: 'SOL',
          solBalance: 0,
          solPriceUsd: 0,
          tokens: [],
          totalValueUsd: 0,
          change24h: 0,
          earningsToDate: 0,
        },
      });
    }

    const cacheKey = cacheKeys.walletBalance(user.id, chain);

    const balance = await getOrSetCache(cacheKey, cacheTTL.walletBalance, async () => {
      const solBalance = await fetchWalletBalance(walletAddress);
      // Ensure legacy Solana balance also has the new chain-aware fields
      solBalance.chain = 'solana';
      solBalance.nativeBalance = solBalance.solBalance;
      solBalance.nativePriceUsd = solBalance.solPriceUsd ?? 0;
      solBalance.nativeSymbol = 'SOL';
      return solBalance;
    });

    // Record portfolio snapshot (fire-and-forget, don't block response)
    if (balance.totalValueUsd != null) {
      const nativeValueUsd = (balance.nativeBalance ?? 0) * (balance.nativePriceUsd ?? 0);
      const tokenValueUsd = balance.tokens.reduce(
        (sum: number, t: any) => sum + (t.valueUsd || 0),
        0
      );
      prisma.portfolioSnapshot.create({
        data: {
          userId: user.id,
          chain,
          totalValueUsd: balance.totalValueUsd ?? 0,
          nativeBalance: balance.nativeBalance ?? balance.solBalance ?? 0,
          nativeValueUsd: nativeValueUsd,
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
