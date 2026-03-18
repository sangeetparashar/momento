import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const { id } = await params;
    const authUser = await getAuthUser(request);

    const profile = await getOrSetCache(cacheKeys.userProfile(id), cacheTTL.userProfile, async () => {
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
          walletAddress: true,
          followerCount: true,
          followingCount: true,
          postCount: true,
          role: true,
          createdAt: true,
        },
      });

      if (!user) return null;

      if (user.role === 'CREATOR') {
        return {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          bannerUrl: user.bannerUrl,
          tokenSymbol: user.tokenSymbol,
          socialLinks: user.socialLinks,
          walletAddress: user.walletAddress,
          followerCount: user.followerCount,
          followingCount: user.followingCount,
          postCount: user.postCount,
          role: user.role,
          createdAt: user.createdAt,
        };
      }

      // Regular USER — no banner, tokenSymbol, followerCount, or postCount
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        socialLinks: user.socialLinks,
        walletAddress: user.walletAddress,
        followingCount: user.followingCount,
        role: user.role,
        createdAt: user.createdAt,
      };
    });

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check follow status if authenticated and viewing a creator
    let isFollowing = false;
    if (authUser && authUser.id !== id && profile.role === 'CREATOR') {
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
        ...profile,
        isFollowing,
      },
    });
  } catch (error) {
    console.error('User profile error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}
