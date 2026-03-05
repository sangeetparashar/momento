import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { invalidateCache, cacheKeys } from '@/lib/redis';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const body = await request.json();
    const { latitude, longitude } = body;

    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { success: false, error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { success: false, error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

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
