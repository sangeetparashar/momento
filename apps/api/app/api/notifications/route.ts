import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { readLimiter, writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import prisma from '@/lib/prisma';

/**
 * GET /api/notifications
 *
 * Fetches the current user's notifications, newest first.
 * Query params:
 *   - limit: max items (default 50, max 100)
 *   - cursor: ISO date string for cursor-based pagination
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const cursor = searchParams.get('cursor'); // ISO date

    const where: any = { userId: user.id };
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: user.id, read: false },
    });

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        hasMore: notifications.length === limit,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if ((error as any)?.status) return error as any;
    console.error('[notifications] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/notifications
 *
 * Mark notifications as read.
 * Body:
 *   - ids: string[] — specific notification IDs to mark as read
 *   - all: boolean — mark ALL notifications as read (ignores ids)
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);
    const body = await request.json();

    if (body.all) {
      await prisma.notification.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true },
      });
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      await prisma.notification.updateMany({
        where: {
          id: { in: body.ids },
          userId: user.id, // Security: only mark own notifications
        },
        data: { read: true },
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Provide ids[] or all:true' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if ((error as any)?.status) return error as any;
    console.error('[notifications] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update notifications' },
      { status: 500 },
    );
  }
}
