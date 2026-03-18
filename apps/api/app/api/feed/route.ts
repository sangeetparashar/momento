import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

const DEFAULT_RADIUS_KM = 50;
const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radiusKm = parseInt(searchParams.get('radius') || String(DEFAULT_RADIUS_KM), 10);
    const cursor = searchParams.get('cursor') || undefined;

    if (!searchParams.has('lat') || !searchParams.has('lng') || isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { success: false, error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    const radiusMeters = radiusKm * 1000;

    // Get the authenticated user for like status (optional)
    const authUser = await getAuthUser(request);
    const userId = authUser?.id;

    // Include userId in cache key so like status is per-user
    const cacheKey = cacheKeys.feed(lat, lng, radiusKm, cursor) + (userId ? `:u:${userId}` : '');

    const feedData = await getOrSetCache(cacheKey, cacheTTL.feed, async () => {
      // Build cursor condition and optional likes join
      let cursorCondition = '';
      const params: any[] = [lng, lat, radiusMeters, PAGE_SIZE + 1];
      let paramIndex = params.length; // next param index (1-based: paramIndex + 1)

      let likesSelect = 'false::boolean as "isLiked"';
      let likesJoin = '';

      if (userId) {
        paramIndex++;
        likesSelect = `l."id" IS NOT NULL as "isLiked"`;
        likesJoin = `LEFT JOIN "likes" l ON l."postId" = p."id" AND l."userId" = $${paramIndex}`;
        params.push(userId);
      }

      if (cursor) {
        paramIndex++;
        cursorCondition = `AND p."createdAt" < $${paramIndex}`;
        params.push(new Date(cursor));
      }

      // Use PostGIS ST_DWithin for location-based filtering
      const posts = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT
          p."id",
          p."creatorId",
          p."postType",
          p."content",
          p."caption",
          p."mediaUrl",
          p."mediaUrls",
          p."latitude",
          p."longitude",
          p."likeCount",
          p."commentCount",
          p."createdAt",
          p."updatedAt",
          u."id" as "creator_id",
          u."username" as "creator_username",
          u."displayName" as "creator_displayName",
          u."avatarUrl" as "creator_avatarUrl",
          u."bannerUrl" as "creator_bannerUrl",
          u."tokenSymbol" as "creator_tokenSymbol",
          u."socialLinks" as "creator_socialLinks",
          u."followerCount" as "creator_followerCount",
          u."postCount" as "creator_postCount",
          ST_Distance(p."location", ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as "distanceMeters",
          ${likesSelect}
        FROM "posts" p
        JOIN "users" u ON p."creatorId" = u."id"
        ${likesJoin}
        WHERE p."location" IS NOT NULL
          AND ST_DWithin(
            p."location",
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3
          )
          ${cursorCondition}
        ORDER BY p."createdAt" DESC
        LIMIT $4
        `,
        ...params
      );

      const hasMore = posts.length > PAGE_SIZE;
      const slicedPosts = hasMore ? posts.slice(0, PAGE_SIZE) : posts;

      const formattedPosts = slicedPosts.map((p: any) => ({
        id: p.id,
        creatorId: p.creatorId,
        postType: p.postType,
        content: p.content,
        caption: p.caption,
        mediaUrl: p.mediaUrl,
        mediaUrls: p.mediaUrls,
        latitude: p.latitude,
        longitude: p.longitude,
        likeCount: p.likeCount,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        distanceMeters: Math.round(p.distanceMeters),
        isLiked: p.isLiked === true,
        creator: {
          id: p.creator_id,
          username: p.creator_username,
          displayName: p.creator_displayName,
          avatarUrl: p.creator_avatarUrl,
          bannerUrl: p.creator_bannerUrl,
          tokenSymbol: p.creator_tokenSymbol,
          socialLinks: p.creator_socialLinks,
          followerCount: p.creator_followerCount,
          postCount: p.creator_postCount,
        },
      }));

      const nextCursor = hasMore
        ? slicedPosts[slicedPosts.length - 1].createdAt.toISOString()
        : undefined;

      return {
        posts: formattedPosts,
        nextCursor,
        hasMore,
      };
    });

    return NextResponse.json({ success: true, data: feedData });
  } catch (error) {
    console.error('Feed error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch feed' },
      { status: 500 }
    );
  }
}
