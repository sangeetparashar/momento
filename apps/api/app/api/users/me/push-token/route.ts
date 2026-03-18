import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { pushTokenSchema, validateBody } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const user = await requireAuth(request);

    const body = await request.json();
    const validation = validateBody(pushTokenSchema, body);
    if (!validation.success) return validation.response;
    const { pushToken } = validation.data;

    // Validate Expo push token format
    if (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken[')) {
      return NextResponse.json(
        { success: false, error: 'Invalid push token format' },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { pushToken },
    });

    return NextResponse.json({
      success: true,
      data: { saved: true },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Save push token error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save push token' },
      { status: 500 }
    );
  }
}
