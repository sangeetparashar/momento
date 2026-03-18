import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';

const DEFAULT_RADIUS_KM = 50;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radiusKm = parseInt(searchParams.get('radius') || String(DEFAULT_RADIUS_KM), 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    if (!lat && !lng) {
      return NextResponse.json(
        { success: false, error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    const radiusMeters = radiusKm * 1000;
    const cacheKey = cacheKeys.nearbyCreators(lat, lng, radiusKm);

    const creators = await getOrSetCache(cacheKey, cacheTTL.nearbyCreators, async () => {
      const results = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT
          u."id",
          u."username",
          u."displayName",
          u."bio",
          u."avatarUrl",
          u."bannerUrl",
          u."tokenSymbol",
          u."socialLinks",
          u."followerCount",
          u."postCount",
          ST_Distance(
            u."location",
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) as "distanceMeters"
        FROM "users" u
        WHERE u."role" = 'CREATOR'
          AND u."isAdminApproved" = true
          AND u."location" IS NOT NULL
          AND ST_DWithin(
            u."location",
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3
          )
        ORDER BY "distanceMeters" ASC
        LIMIT $4
        `,
        lng,
        lat,
        radiusMeters,
        limit
      );

      return results.map((c: any) => ({
        id: c.id,
        username: c.username,
        displayName: c.displayName,
        bio: c.bio,
        avatarUrl: c.avatarUrl,
        bannerUrl: c.bannerUrl,
        tokenSymbol: c.tokenSymbol,
        socialLinks: c.socialLinks,
        followerCount: c.followerCount,
        postCount: c.postCount,
        distanceMeters: Math.round(c.distanceMeters),
      }));
    });

    return NextResponse.json({ success: true, data: { creators } });
  } catch (error) {
    console.error('Nearby creators error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch nearby creators' },
      { status: 500 }
    );
  }
}
