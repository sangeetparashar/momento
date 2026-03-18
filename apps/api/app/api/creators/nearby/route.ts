import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

const DEFAULT_RADIUS_KM = 50;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radiusKm = parseInt(searchParams.get('radius') || String(DEFAULT_RADIUS_KM), 10);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10), 1),
      MAX_LIMIT
    );
    const cursorParam = searchParams.get('cursor');
    const cursor = cursorParam ? parseFloat(cursorParam) : null;

    if (!lat && !lng) {
      return NextResponse.json(
        { success: false, error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    const radiusMeters = radiusKm * 1000;
    const cacheKey = `${cacheKeys.nearbyCreators(lat, lng, radiusKm)}:c=${cursor ?? 0}:l=${limit}`;

    const data = await getOrSetCache(cacheKey, cacheTTL.nearbyCreators, async () => {
      // Fetch limit+1 to determine hasMore
      const fetchLimit = limit + 1;

      const cursorClause = cursor !== null
        ? `AND ST_Distance(u."location", ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) > $5`
        : '';

      const params: (number)[] = [lng, lat, radiusMeters, fetchLimit];
      if (cursor !== null) {
        params.push(cursor);
      }

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
          ${cursorClause}
        ORDER BY "distanceMeters" ASC
        LIMIT $4
        `,
        ...params
      );

      const hasMore = results.length > limit;
      const sliced = hasMore ? results.slice(0, limit) : results;

      const creators = sliced.map((c: any) => ({
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

      const lastCreator = sliced[sliced.length - 1];
      const nextCursor = hasMore && lastCreator
        ? String(Math.round(lastCreator.distanceMeters))
        : null;

      return { creators, nextCursor, hasMore };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Nearby creators error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch nearby creators' },
      { status: 500 }
    );
  }
}
