import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const user = await requireAuth(request);

    const follows = await prisma.follow.findMany({
      where: { followerId: user.id },
      include: {
        following: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            role: true,
            tokenSymbol: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const users = follows.map((f) => ({
      id: f.following.id,
      username: f.following.username,
      displayName: f.following.displayName,
      avatarUrl: f.following.avatarUrl,
      role: f.following.role,
      tokenSymbol: f.following.tokenSymbol,
      followedAt: f.createdAt,
    }));

    return NextResponse.json({ success: true, data: { users } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Get following error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch following list' },
      { status: 500 }
    );
  }
}
