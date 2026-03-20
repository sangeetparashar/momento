import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const { id } = await params;
    const authUser = await getAuthUser(request);

    const { searchParams } = new URL(request.url);
    const userLat = parseFloat(searchParams.get('lat') || '');
    const userLng = parseFloat(searchParams.get('lng') || '');

    const cacheKeySuffix = !isNaN(userLat) ? `:loc` : '';
    const creator = await getOrSetCache(cacheKeys.creatorProfile(id) + cacheKeySuffix, cacheTTL.creatorProfile, async () => {
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
          locationLat: true,
          locationLng: true,
        },
      });

      if (!user || user.role !== 'CREATOR') return null;

      // Compute distance if user location is provided
      let distanceMeters: number | undefined;
      if (!isNaN(userLat) && !isNaN(userLng) && user.locationLat && user.locationLng) {
        distanceMeters = haversineDistance(userLat, userLng, user.locationLat, user.locationLng);
      }

      // Reverse geocode city from creator's location
      let city: string | undefined;
      if (user.locationLat && user.locationLng) {
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${user.locationLat}&lon=${user.locationLng}&format=json&zoom=10`,
            { headers: { 'User-Agent': 'Momento/1.0' } }
          );
          const geoData = await geoRes.json();
          city = geoData?.address?.city || geoData?.address?.town || geoData?.address?.village || geoData?.address?.county;
        } catch {
          // Geocoding failure is non-critical
        }
      }

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
        distanceMeters,
        city,
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
