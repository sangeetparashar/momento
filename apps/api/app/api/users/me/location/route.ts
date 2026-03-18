import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { invalidateCache, cacheKeys } from '@/lib/redis';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { locationSchema, validateBody } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const user = await requireAuth(request);

    const body = await request.json();
    const validation = validateBody(locationSchema, body);
    if (!validation.success) return validation.response;
    const { latitude, longitude } = validation.data;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        locationLat: latitude,
        locationLng: longitude,
      },
    });

    // Invalidate location-dependent caches
    await invalidateCache(
      cacheKeys.userProfile(user.id),
      cacheKeys.creatorProfile(user.id),
      'creators:nearby:*'
    );

    return NextResponse.json({
      success: true,
      data: {
        latitude,
        longitude,
        updated: true,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Update location error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update location' },
      { status: 500 }
    );
  }
}
