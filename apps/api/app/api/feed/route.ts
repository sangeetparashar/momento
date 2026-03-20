import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

const DEFAULT_RADIUS_KM = 50;
const PAGE_SIZE = 20;

/**
 * Feed sort modes:
 *   smart    — weighted blend of recency + engagement + proximity + following
 *   recent   — 80% recency, rest even
 *   popular  — 80% engagement, rest even
 *   nearby   — 80% proximity, rest even
 *   following — 80% following boost, rest even
 */
type SortMode = 'smart' | 'recent' | 'popular' | 'nearby' | 'following';

const SORT_MODES = new Set<SortMode>(['smart', 'recent', 'popular', 'nearby', 'following']);

/**
 * Weight presets for each sort mode.
 * Order: [recency, engagement, proximity, following]
 */
const WEIGHT_PRESETS: Record<SortMode, [number, number, number, number]> = {
  smart:     [0.30, 0.25, 0.25, 0.20],
  recent:    [0.80, 0.07, 0.07, 0.06],
  popular:   [0.07, 0.80, 0.07, 0.06],
  nearby:    [0.07, 0.07, 0.80, 0.06],
  following: [0.07, 0.07, 0.06, 0.80],
};

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radiusKm = parseInt(searchParams.get('radius') || String(DEFAULT_RADIUS_KM), 10);
    const cursor = searchParams.get('cursor') || undefined;
    const sortParam = (searchParams.get('sort') || 'smart') as SortMode;
    const sort: SortMode = SORT_MODES.has(sortParam) ? sortParam : 'smart';

    if (!searchParams.has('lat') || !searchParams.has('lng') || isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { success: false, error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    const radiusMeters = radiusKm * 1000;

    // Get the authenticated user for like status + following boost
    const authUser = await getAuthUser(request);
    const userId = authUser?.id;

    // Get IDs the user follows (for following signal)
    let followedIds: Set<string> = new Set();
    if (userId) {
      const follows = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      followedIds = new Set(follows.map(f => f.followingId));
    }

    // Cache key includes sort mode (shared across users for same sort)
    const cacheKey = cacheKeys.feed(lat, lng, radiusKm, sort, cursor);

    let feedData = await getOrSetCache(cacheKey, cacheTTL.feed, async () => {
      let cursorCondition = '';
      const params: any[] = [lng, lat, radiusMeters, PAGE_SIZE + 1];
      let paramIndex = params.length;

      if (cursor) {
        paramIndex++;
        cursorCondition = `AND p."createdAt" < $${paramIndex}`;
        params.push(new Date(cursor));
      }

      // Fetch more posts than needed for ranking (grab 3x, rank, take top PAGE_SIZE)
      const fetchLimit = cursor ? PAGE_SIZE + 1 : Math.min(PAGE_SIZE * 3, 100);
      params[3] = fetchLimit;

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

      // Apply ranking algorithm
      const [wRecency, wEngagement, wProximity, wFollowing] = WEIGHT_PRESETS[sort];
      const now = Date.now();
      const HALF_LIFE_MS = 12 * 60 * 60 * 1000; // 12 hours

      const scored = posts.map((p: any) => {
        const createdAt = typeof p.createdAt === 'string' ? new Date(p.createdAt).getTime() : p.createdAt.getTime();
        const ageMs = now - createdAt;

        // Recency: exponential decay with 12h half-life → [0, 1]
        const recency = Math.pow(0.5, ageMs / HALF_LIFE_MS);

        // Engagement: log-normalized likes + comments → [0, 1] (capped at ~1 for 1000+ engagement)
        const engagement = Math.min(1, Math.log(1 + (p.likeCount || 0) + (p.commentCount || 0)) / Math.log(1000));

        // Proximity: inverse distance decay → [0, 1] (1 at 0m, ~0.5 at 5km, ~0.1 at 50km)
        const distM = Number(p.distanceMeters) || 0;
        const proximity = 1 / (1 + distM / 5000);

        // Following: 1 if user follows creator, 0 otherwise
        const isFollowed = followedIds.has(p.creatorId) ? 1 : 0;

        const score = wRecency * recency + wEngagement * engagement + wProximity * proximity + wFollowing * isFollowed;

        return { ...p, _score: score };
      });

      // Sort by score descending
      scored.sort((a: any, b: any) => b._score - a._score);

      // Take PAGE_SIZE + 1 for hasMore detection
      const rankedPosts = scored.slice(0, PAGE_SIZE + 1);
      const hasMore = rankedPosts.length > PAGE_SIZE;
      const slicedPosts = hasMore ? rankedPosts.slice(0, PAGE_SIZE) : rankedPosts;

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
        createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date(p.createdAt).toISOString(),
        updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date(p.updatedAt).toISOString(),
        distanceMeters: Math.round(Number(p.distanceMeters)),
        isLiked: false,
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
        ? formattedPosts[formattedPosts.length - 1].createdAt
        : undefined;

      return {
        posts: formattedPosts,
        nextCursor,
        hasMore,
        sort,
      };
    });

    // Compute isLiked per-user outside the cache
    if (userId && feedData.posts.length > 0) {
      const postIds = feedData.posts.map((p: any) => p.id);
      const likedPosts = await prisma.like.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      });
      const likedSet = new Set(likedPosts.map((l) => l.postId));
      feedData = {
        ...feedData,
        posts: feedData.posts.map((p: any) => ({
          ...p,
          isLiked: likedSet.has(p.id),
        })),
      };
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
