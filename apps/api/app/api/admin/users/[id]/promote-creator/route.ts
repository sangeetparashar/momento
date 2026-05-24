import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { invalidateCache, cacheKeys } from '@/lib/redis';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';

/**
 * Admin endpoint: promote a user to CREATOR role.
 *
 * Replaces the manual SQL+Redis workflow we used during beta. Marks the
 * target user as a CREATOR with VERIFIED kyc, sets isAdminApproved, and
 * invalidates their cached profile + creator-profile entries.
 *
 * Auth: requireAdmin (user must have isAdmin=true in DB).
 * Bootstrap: flip the operator(s) to isAdmin once via SQL:
 *   UPDATE users SET "isAdmin" = true WHERE email = 'sangeetparashar@gmail.com';
 *
 * Usage:
 *   curl -X POST https://momento-api-ten.vercel.app/api/admin/users/<id>/promote-creator \
 *     -H "Authorization: Bearer <your-privy-jwt>"
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const admin = await requireAdmin(request);
    const { id } = await params;

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, username: true, role: true, kycStatus: true },
    });

    if (!target) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 },
      );
    }

    if (target.role === 'CREATOR') {
      return NextResponse.json(
        { success: false, error: 'User is already a creator' },
        { status: 400 },
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        role: 'CREATOR',
        kycStatus: 'VERIFIED',
        isAdminApproved: true,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        kycStatus: true,
        isAdminApproved: true,
        updatedAt: true,
      },
    });

    await invalidateCache(
      cacheKeys.userProfile(id),
      cacheKeys.creatorProfile(id),
      cacheKeys.creatorLeaderboard(),
    );

    console.log(
      `[admin] ${admin.id} promoted user ${id} (${target.email || target.username || 'no-identity'}) to CREATOR`,
    );

    return NextResponse.json({ success: true, data: { user: updated } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Admin promote-creator error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to promote user' },
      { status: 500 },
    );
  }
}
