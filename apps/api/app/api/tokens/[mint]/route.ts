import { NextRequest, NextResponse } from 'next/server';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';
import { isValidMint } from '@/lib/validation';
import { getTokenDetail } from '@/lib/trade';

/**
 * GET /api/tokens/[mint] — public token detail (CONTRACTS-P3A §d.2 / D-trade §3.1).
 *
 * Public read. Limiter: `readLimiter`. Returns price + fundraise progress + fee
 * config + venue. `fundraise` is non-null only pre-graduation; post-graduation
 * `venue = METEORA_DAMM_V2`, `fundraise = null`, `graduatedAt` set.
 *
 * 400 invalid mint | 404 token not found | 200 detail envelope.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> },
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const { mint } = await params;
    // Bound the param before any DB/cache use (REVIEW-security P1).
    if (!isValidMint(mint)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mint address' },
        { status: 400 },
      );
    }

    const data = await getTokenDetail(mint);
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Token not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Token detail error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch token detail' },
      { status: 500 },
    );
  }
}
