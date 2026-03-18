import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';

const DEFAULT_RADIUS_KM = 50;
const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radiusKm = parseInt(searchParams.get('radius') || String(DEFAULT_RADIUS_KM), 10);
    const cursor = searchParams.get('cursor') || undefined;

    if (!lat && !lng) {
      return NextResponse.json(
        { success: false, error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    const radiusMeters = radiusKm * 1000;

    // Get the authenticated user for like status (optional)
    const authUser = await getAuthUser(request);

    const cacheKey = cacheKeys.feed(lat, lng, radiusKm, cursor);

    let feedData = await getOrSetCache(cacheKey, cacheTTL.feed, async () => {
      // Build cursor condition
      let cursorCondition = '';
      const params: any[] = [lng, lat, radiusMeters, PAGE_SIZE + 1];

      if (cursor) {
        cursorCondition = `AND p."createdAt" < $5`;
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
          ST_Distance(p."location", ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as "distanceMeters"
        FROM "posts" p
        JOIN "users" u ON p."creatorId" = u."id"
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

    // Clone posts to avoid mutating the cached object
    feedData = { ...feedData, posts: feedData.posts.map((p: any) => ({ ...p })) };

    // If authenticated, check which posts the user has liked
    if (authUser && feedData.posts.length > 0) {
      const postIds = feedData.posts.map((p: any) => p.id);
      const userLikes = await prisma.like.findMany({
        where: {
          userId: authUser.id,
          postId: { in: postIds },
        },
        select: { postId: true },
      });

      const likedPostIds = new Set(userLikes.map((l) => l.postId));
      feedData.posts = feedData.posts.map((p: any) => ({
        ...p,
        isLiked: likedPostIds.has(p.id),
      }));
    } else {
      // Default isLiked to false for unauthenticated users
      feedData.posts = feedData.posts.map((p: any) => ({
        ...p,
        isLiked: false,
      }));
    }

    return NextResponse.json({ success: true, data: feedData });
  } catch (error) {
    console.error('Feed error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch feed' },
      { status: 500 }
    );
  }
}
