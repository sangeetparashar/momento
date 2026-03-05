import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { createVeriffSession } from '@/lib/veriff';
import { invalidateCache, cacheKeys } from '@/lib/redis';

export async function POST(request: NextRequest) {
  try {
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

    // Check if KYC is already pending or verified
    if (user.kycStatus === 'PENDING') {
      return NextResponse.json(
        { success: false, error: 'KYC verification already in progress' },
        { status: 400 }
      );
    }

    if (user.kycStatus === 'VERIFIED') {
      return NextResponse.json(
        { success: false, error: 'KYC already verified, awaiting admin approval' },
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

      await invalidateCache(
        cacheKeys.userProfile(user.id),
        cacheKeys.creatorProfile(user.id)
      );

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

    // Create Veriff session
    const session = await createVeriffSession(user.id, firstName, lastName);

    // Store KYC record
    await prisma.kycRecord.create({
      data: {
        userId: user.id,
        veriffSessionId: session.id,
        status: 'PENDING',
      },
    });

    // Update user KYC status
    await prisma.user.update({
      where: { id: user.id },
      data: { kycStatus: 'PENDING' },
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
