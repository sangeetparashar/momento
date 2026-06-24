import { NextRequest, NextResponse } from 'next/server';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';
import { getAuthUser } from '@/lib/auth';
import { getCreatorFeeSummary } from '@/lib/fees';

/**
 * GET /api/creators/[id]/fees — creator fee summary (CONTRACTS §e.4).
 *
 * Public subset always returned. The `claimable` block is added only for the
 * creator THEMSELVES (`user.id === id`) or an admin — resolved via `getAuthUser`
 * (optional; unauthenticated callers still get the public subset).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;

    const user = await getAuthUser(request);
    const includeClaimable = !!user && (user.isAdmin || user.id === id);

    const data = await getCreatorFeeSummary(id, { includeClaimable });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Creator fees summary error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch creator fees' },
      { status: 500 },
    );
  }
}
