import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { invalidateCache, cacheKeys } from '@/lib/redis';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { id: followingId } = await params;

    // Cannot follow yourself
    if (user.id === followingId) {
      return NextResponse.json(
        { success: false, error: 'Cannot follow yourself' },
        { status: 400 }
      );
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: followingId },
      select: { id: true, followerCount: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if already following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId,
        },
      },
    });

    let isFollowing: boolean;
    let newFollowerCount: number;

    if (existingFollow) {
      // Unfollow: delete the follow and decrement counts
      await prisma.$transaction([
        prisma.follow.delete({
          where: { id: existingFollow.id },
        }),
        prisma.user.update({
          where: { id: followingId },
          data: { followerCount: { decrement: 1 } },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { followingCount: { decrement: 1 } },
        }),
      ]);

      isFollowing = false;
      newFollowerCount = Math.max(0, targetUser.followerCount - 1);
    } else {
      // Follow: create the follow and increment counts
      await prisma.$transaction([
        prisma.follow.create({
          data: {
            followerId: user.id,
            followingId,
          },
        }),
        prisma.user.update({
          where: { id: followingId },
          data: { followerCount: { increment: 1 } },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { followingCount: { increment: 1 } },
        }),
      ]);

      isFollowing = true;
      newFollowerCount = targetUser.followerCount + 1;
    }

    // Invalidate cached profiles
    await invalidateCache(
      cacheKeys.creatorProfile(followingId),
      cacheKeys.userProfile(user.id)
    );

    return NextResponse.json({
      success: true,
      data: {
        following: isFollowing,
        followerCount: newFollowerCount,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Follow toggle error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to toggle follow' },
      { status: 500 }
    );
  }
}
