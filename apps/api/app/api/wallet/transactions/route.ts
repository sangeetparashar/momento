import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';
import { getOrSetCache, cacheKeys } from '@/lib/redis';
import prisma from '@/lib/prisma';

/**
 * GET /api/wallet/transactions?chain=solana&cursor=<uuid>&limit=20
 *
 * Returns paginated transaction history for the authenticated user on a given chain.
 * Cursor-based pagination using Prisma native cursor on `id`.
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);
    const chain = 'solana';

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 50);

    const cacheKey = cacheKeys.walletTransactions(user.id, chain, cursor);

    const data = await getOrSetCache(cacheKey, 30, async () => {
      const txs = await prisma.walletTransaction.findMany({
        where: { userId: user.id, chain },
        orderBy: { createdAt: 'desc' },
        take: limit + 1, // fetch one extra to determine hasMore
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          chain: true,
          signature: true,
          type: true,
          label: true,
          inputToken: true,
          outputToken: true,
          inputAmount: true,
          outputAmount: true,
          recipientAddress: true,
          status: true,
          createdAt: true,
        },
      });

      const hasMore = txs.length > limit;
      const items = hasMore ? txs.slice(0, limit) : txs;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Transaction history error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transaction history' },
      { status: 500 },
    );
  }
}
