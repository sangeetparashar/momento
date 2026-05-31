import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

/**
 * Admin endpoint: list creator-promotion audit records (newest first).
 *
 * Backed by the PromotionLog table (prisma/schema.prisma). Every promotion —
 * via the admin promote-creator endpoint or the self-serve SKIP_KYC apply
 * path — writes a best-effort row. Use this to audit who was granted creator
 * status, by whom, and how. Important for a money-adjacent platform.
 *
 * Auth: requireAdmin. Rate limit fails closed (admin surface).
 *
 * Usage:
 *   curl https://momento-api-ten.vercel.app/api/admin/promotions \
 *     -H "Authorization: Bearer <your-privy-jwt>"
 */
export async function GET(request: NextRequest) {
  try {
    // Auth FIRST so the rate-limit key is the admin's userId, not their IP.
    const admin = await requireAdmin(request);
    const rateLimitResponse = await applyRateLimit(request, readLimiter, admin.id, { failClosed: true });
    if (rateLimitResponse) return rateLimitResponse;

    const promotions = await prisma.promotionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({
      success: true,
      data: { promotions, count: promotions.length },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Admin promotions list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load promotion log' },
      { status: 500 },
    );
  }
}
