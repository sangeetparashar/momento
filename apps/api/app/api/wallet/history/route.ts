import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getOrSetCache, cacheTTL } from '@/lib/redis';
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

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '1M';
    const days = DAYS_MAP[range] || 30;

    const cacheKey = `sol-price-history:${days}`;
    const data = await getOrSetCache(cacheKey, days <= 1 ? 300 : cacheTTL.walletBalance, async () => {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=${days}`,
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
