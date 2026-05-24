import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { createVeriffSession } from '@/lib/veriff';
import { invalidateCache, invalidateCreatorCaches, cacheKeys } from '@/lib/redis';
import { kycLimiter, applyRateLimit } from '@/lib/ratelimit';

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, kycLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const authUser = await requireAuth(request);

    // Get full user record
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if already a creator
    if (user.role === 'CREATOR') {
      return NextResponse.json(
        { success: false, error: 'Already a creator' },
        { status: 400 }
      );
    }

    // Dev bypass: skip KYC if SKIP_KYC env is set
    if (process.env.SKIP_KYC === 'true') {
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          role: 'CREATOR',
          kycStatus: 'VERIFIED',
          isAdminApproved: true,
        },
      });

      // Use the helper so the leaderboard key is also invalidated (the
      // earlier explicit list at this site forgot creatorLeaderboard, so
      // self-applied creators didn't show up in the leaderboard for up to
      // 5 minutes after promotion).
      await invalidateCreatorCaches(user.id);

      return NextResponse.json({
        success: true,
        data: {
          status: 'approved',
          message: 'KYC skipped (dev mode). Creator status granted.',
          user: {
            id: updatedUser.id,
            role: updatedUser.role,
            kycStatus: updatedUser.kycStatus,
            isAdminApproved: updatedUser.isAdminApproved,
          },
        },
      });
    }

    // Atomically transition kycStatus NONE → PENDING to prevent concurrent
    // requests from both creating Veriff sessions (TOCTOU race condition).
    // Only one request can win this update; losers get count === 0.
    const updated = await prisma.user.updateMany({
      where: {
        id: user.id,
        kycStatus: { in: ['NONE', 'REJECTED'] },
      },
      data: { kycStatus: 'PENDING' },
    });

    if (updated.count === 0) {
      // Another request already started KYC, or user is already verified
      return NextResponse.json(
        { success: false, error: 'KYC verification already in progress or completed' },
        { status: 400 }
      );
    }

    // Parse optional body for name
    let firstName: string | undefined;
    let lastName: string | undefined;
    try {
      const body = await request.json();
      firstName = body.firstName;
      lastName = body.lastName;
    } catch {
      // No body is fine
    }

    // Create Veriff session (only one request reaches here per user)
    const session = await createVeriffSession(user.id, firstName, lastName);

    // Store KYC record
    await prisma.kycRecord.create({
      data: {
        userId: user.id,
        veriffSessionId: session.id,
        status: 'PENDING',
      },
    });

    await invalidateCache(cacheKeys.userProfile(user.id));

    return NextResponse.json({
      success: true,
      data: {
        status: 'pending',
        verificationUrl: session.url,
        sessionId: session.id,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Creator apply error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start KYC verification' },
      { status: 500 }
    );
  }
}
