import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getOrSetCache, invalidateCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { readLimiter, writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { updateProfileSchema, validateBody } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const authUser = await requireAuth(request);

    const user = await getOrSetCache(
      cacheKeys.userProfile(authUser.id),
      cacheTTL.userProfile,
      async () => {
        const dbUser = await prisma.user.findUnique({
          where: { id: authUser.id },
        });

        if (!dbUser) return null;

        return {
          id: dbUser.id,
          privyUserId: dbUser.privyUserId,
          walletAddress: dbUser.walletAddress,
          email: dbUser.email,
          username: dbUser.username,
          displayName: dbUser.displayName,
          bio: dbUser.bio,
          avatarUrl: dbUser.avatarUrl,
          bannerUrl: dbUser.bannerUrl,
          role: dbUser.role,
          kycStatus: dbUser.kycStatus,
          isAdminApproved: dbUser.isAdminApproved,
          isAdmin: dbUser.isAdmin,
          tokenSymbol: dbUser.tokenSymbol,
          socialLinks: dbUser.socialLinks,
          locationLat: dbUser.locationLat,
          locationLng: dbUser.locationLng,
          followerCount: dbUser.followerCount,
          followingCount: dbUser.followingCount,
          postCount: dbUser.postCount,
          createdAt: dbUser.createdAt.toISOString(),
          updatedAt: dbUser.updatedAt.toISOString(),
        };
      }
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Get user error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const authUser = await requireAuth(request);

    const body = await request.json();
    const validation = validateBody(updateProfileSchema, body);
    if (!validation.success) return validation.response;

    const updateData: Record<string, any> = {};
    const validatedData = validation.data;
    for (const [key, value] of Object.entries(validatedData)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Validate username uniqueness if being changed
    if (updateData.username) {
      const existing = await prisma.user.findFirst({
        where: {
          username: updateData.username,
          id: { not: authUser.id },
        },
      });

      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Username is already taken' },
          { status: 409 }
        );
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: authUser.id },
      data: updateData,
    });

    // Invalidate caches
    await invalidateCache(
      cacheKeys.userProfile(authUser.id),
      cacheKeys.creatorProfile(authUser.id)
    );

    return NextResponse.json({
      success: true,
      data: {
        id: updatedUser.id,
        privyUserId: updatedUser.privyUserId,
        walletAddress: updatedUser.walletAddress,
        email: updatedUser.email,
        username: updatedUser.username,
        displayName: updatedUser.displayName,
        bio: updatedUser.bio,
        avatarUrl: updatedUser.avatarUrl,
        bannerUrl: updatedUser.bannerUrl,
        role: updatedUser.role,
        kycStatus: updatedUser.kycStatus,
        isAdminApproved: updatedUser.isAdminApproved,
        isAdmin: updatedUser.isAdmin,
        tokenSymbol: updatedUser.tokenSymbol,
        socialLinks: updatedUser.socialLinks,
        locationLat: updatedUser.locationLat,
        locationLng: updatedUser.locationLng,
        followerCount: updatedUser.followerCount,
        followingCount: updatedUser.followingCount,
        postCount: updatedUser.postCount,
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Username already taken' },
        { status: 409 }
      );
    }
    if (error instanceof Response) {
      return error;
    }
    console.error('Update user error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user profile' },
      { status: 500 }
    );
  }
}
