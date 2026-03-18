import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { invalidateCache, cacheKeys } from '@/lib/redis';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { notifyNewFollow } from '@/lib/notifications';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;
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
      try {
        await prisma.$transaction([
          prisma.follow.delete({
            where: { id: existingFollow.id },
          }),
          prisma.$executeRaw`UPDATE "users" SET "followerCount" = GREATEST("followerCount" - 1, 0), "updatedAt" = NOW() WHERE "id" = ${followingId}`,
          prisma.$executeRaw`UPDATE "users" SET "followingCount" = GREATEST("followingCount" - 1, 0), "updatedAt" = NOW() WHERE "id" = ${user.id}`,
        ]);

        const updatedUser = await prisma.user.findUnique({
          where: { id: followingId },
          select: { followerCount: true },
        });
        isFollowing = false;
        newFollowerCount = Math.max(0, updatedUser?.followerCount ?? 0);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          const currentFollow = await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: user.id, followingId } },
          });
          const currentUser = await prisma.user.findUnique({
            where: { id: followingId },
            select: { followerCount: true },
          });
          return NextResponse.json({
            success: true,
            data: { following: !!currentFollow, followerCount: Math.max(0, currentUser?.followerCount ?? 0) },
          });
        }
        throw error;
      }
    } else {
      // Follow: create the follow and increment counts
      try {
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
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // Concurrent follow request already created the follow — return current state
          const currentFollow = await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: user.id, followingId } },
          });
          const currentUser = await prisma.user.findUnique({
            where: { id: followingId },
            select: { followerCount: true },
          });
          return NextResponse.json({
            success: true,
            data: {
              following: !!currentFollow,
              followerCount: currentUser?.followerCount ?? 0,
            },
          });
        }
        throw error;
      }

      const updatedUser = await prisma.user.findUnique({
        where: { id: followingId },
        select: { followerCount: true },
      });
      isFollowing = true;
      newFollowerCount = updatedUser?.followerCount ?? targetUser.followerCount + 1;

      // Send follow notification (fire-and-forget)
      const follower = await prisma.user.findUnique({
        where: { id: user.id },
        select: { displayName: true, username: true },
      });
      const followerName = follower?.displayName || follower?.username || 'Someone';
      notifyNewFollow(followingId, followerName).catch((err) =>
        console.error('Failed to send follow notification:', err)
      );
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
