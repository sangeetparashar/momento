import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

/**
 * Admin endpoint: list users who have applied or are pending KYC for creator
 * status. Use this to triage who to call /promote-creator on next.
 *
 * Filters:
 *  - role === 'USER' (excludes already-promoted creators)
 *  - kycStatus IN ('NONE', 'PENDING') (excludes VERIFIED + REJECTED)
 *
 * Returns up to 100 users, newest signups first. Pagination not added yet —
 * unlikely to exceed 100 pending in beta.
 *
 * Auth: requireAdmin.
 *
 * Usage:
 *   curl https://momento-api-ten.vercel.app/api/admin/users/pending-creators \
 *     -H "Authorization: Bearer <your-privy-jwt>"
 */
export async function GET(request: NextRequest) {
  try {
    // Auth FIRST so the rate-limit key is the admin's userId, not their IP.
    // See promote-creator/route.ts for the security rationale.
    const admin = await requireAdmin(request);
    const rateLimitResponse = await applyRateLimit(request, readLimiter, admin.id, { failClosed: true });
    if (rateLimitResponse) return rateLimitResponse;

    const pending = await prisma.user.findMany({
      where: {
        role: 'USER',
        kycStatus: { in: ['NONE', 'PENDING'] },
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        kycStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      data: { users: pending, count: pending.length },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Admin pending-creators list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load pending creators' },
      { status: 500 },
    );
  }
}
