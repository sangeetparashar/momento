import { NextRequest, NextResponse } from 'next/server';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';
import { getAuthUser } from '@/lib/auth';
import { getTokenFeeSummary } from '@/lib/fees';
import { isValidMint } from '@/lib/validation';
import prisma from '@/lib/prisma';

const VALID_RANGES = new Set(['24H', '7D', '1M', '3M', '1Y', 'ALL']);

/**
 * GET /api/tokens/[mint]/fees — token fee summary (CONTRACTS §e.3).
 *
 * Public subset always returned. The `claimable` block is added only for the
 * token OWNER (its creator) or an admin — resolved via `getAuthUser` (optional;
 * unauthenticated callers still get the public subset).
 *
 * Query: `range` (default ALL).
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

    const { searchParams } = new URL(request.url);
    // Validate `range` against the enum (REVIEW-correctness P2-5) — unknown
    // values previously fell through to ALL silently.
    const rangeRaw = searchParams.get('range');
    const range = rangeRaw && VALID_RANGES.has(rangeRaw) ? rangeRaw : 'ALL';

    // Optional auth → decide whether to widen with `claimable`.
    const user = await getAuthUser(request);
    let includeClaimable = false;
    if (user) {
      if (user.isAdmin) {
        includeClaimable = true;
      } else {
        const token = await prisma.creatorToken.findUnique({
          where: { mintAddress: mint },
          select: { userId: true },
        });
        includeClaimable = !!token && token.userId === user.id;
      }
    }

    const data = await getTokenFeeSummary(mint, range, { includeClaimable });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Token fees summary error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch token fees' },
      { status: 500 },
    );
  }
}
