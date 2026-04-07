import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getChainParam } from '@/lib/auth';
import { getOrSetCache, cacheTTL, cacheKeys } from '@/lib/redis';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

const DAYS_MAP: Record<string, number> = {
  '24H': 1,
  '7D': 7,
  '1M': 30,
  '3M': 90,
  '1Y': 365,
};

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    await requireAuth(request);

    const chain = getChainParam(request);
    const coinId = chain === 'base' ? 'ethereum' : 'solana';

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '1M';
    const days = DAYS_MAP[range] || 30;

    // Pass String(days) to preserve the existing key format `price:history:{coinId}:{days}`
    // and avoid orphaning cached entries from before this refactor.
    const cacheKey = cacheKeys.priceHistory(coinId, String(days));
    const data = await getOrSetCache(cacheKey, days <= 1 ? 300 : cacheTTL.walletBalance, async () => {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`,
        { headers: { 'Accept': 'application/json' } }
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const json = await response.json();
      const prices: [number, number][] = json.prices || [];

      return prices.map(([timestamp, price]) => ({
        t: timestamp,
        p: Math.round(price * 100) / 100,
      }));
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Price history error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch price history' },
      { status: 500 }
    );
  }
}
