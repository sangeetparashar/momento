import { NextRequest, NextResponse } from 'next/server';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';
import { tradeRangeSchema } from '@/lib/validation';
import { getTokenTradeSummary } from '@/lib/fees';

/**
 * GET /api/tokens/[mint]/trades — public token trade summary (CONTRACTS §e.2).
 *
 * Public read. Limiter: `readLimiter`. Query (validated by `tradeRangeSchema`):
 *   range ∈ 24H|7D|1M|3M|1Y|ALL (default 24H), granularity ∈ hour|day (opt),
 *   limit (default 50, max 200).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> },
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const { mint } = await params;

    const { searchParams } = new URL(request.url);
    const parsed = tradeRangeSchema.safeParse({
      range: searchParams.get('range') ?? undefined,
      granularity: searchParams.get('granularity') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      const errors = parsed.error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      return NextResponse.json(
        { success: false, error: `Validation error: ${errors}` },
        { status: 400 },
      );
    }

    const { range, limit } = parsed.data;
    const data = await getTokenTradeSummary(mint, range, limit);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Token trades summary error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch token trades' },
      { status: 500 },
    );
  }
}
