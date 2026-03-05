import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await getAuthUser(request);

    const creator = await getOrSetCache(cacheKeys.creatorProfile(id), cacheTTL.creatorProfile, async () => {
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          username: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          bannerUrl: true,
          tokenSymbol: true,
          socialLinks: true,
          followerCount: true,
          followingCount: true,
          postCount: true,
          role: true,
          createdAt: true,
        },
      });

      if (!user) return null;

      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        tokenSymbol: user.tokenSymbol,
        socialLinks: user.socialLinks,
        followerCount: user.followerCount,
        followingCount: user.followingCount,
        postCount: user.postCount,
        role: user.role,
        createdAt: user.createdAt,
      };
    });

    if (!creator) {
      return NextResponse.json(
        { success: false, error: 'Creator not found' },
        { status: 404 }
      );
    }

    // Check follow status if authenticated
    let isFollowing = false;
    if (authUser && authUser.id !== id) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: authUser.id,
            followingId: id,
          },
        },
      });
      isFollowing = !!follow;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...creator,
        isFollowing,
      },
    });
  } catch (error) {
    console.error('Creator profile error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch creator profile' },
      { status: 500 }
    );
  }
}
