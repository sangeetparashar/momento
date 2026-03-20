import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

const DEFAULT_RADIUS_KM = 50;
const PAGE_SIZE = 20;
/** How many raw posts to fetch for the ranking pool */
const RANKING_POOL_SIZE = 200;

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

const HALF_LIFE_MS = 12 * 60 * 60 * 1000; // 12 hours

function rankPosts(
  posts: any[],
  sort: SortMode,
  followedIds: Set<string>,
): any[] {
  const [wRecency, wEngagement, wProximity, wFollowing] = WEIGHT_PRESETS[sort];
  const now = Date.now();

  return posts
    .map((p) => {
      const createdAt = typeof p.createdAt === 'string'
        ? new Date(p.createdAt).getTime()
        : p.createdAt.getTime();
      const ageMs = now - createdAt;

      // Recency: exponential decay with 12h half-life → [0, 1]
      const recency = Math.pow(0.5, ageMs / HALF_LIFE_MS);

      // Engagement: log-normalized likes + comments → [0, 1]
      const engagement = Math.min(
        1,
        Math.log(1 + (p.likeCount || 0) + (p.commentCount || 0)) / Math.log(1000),
      );

      // Proximity: inverse distance decay → [0, 1] (1 at 0m, ~0.5 at 5km)
      const distM = Number(p.distanceMeters) || 0;
      const proximity = 1 / (1 + distM / 5000);

      // Following: 1 if user follows creator, 0 otherwise
      const isFollowed = followedIds.has(p.creatorId) ? 1 : 0;

      const score =
        wRecency * recency +
        wEngagement * engagement +
        wProximity * proximity +
        wFollowing * isFollowed;

      return { ...p, _score: score };
    })
    .sort((a, b) => b._score - a._score);
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radiusKm = parseInt(searchParams.get('radius') || String(DEFAULT_RADIUS_KM), 10);
    const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
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

    // Cache the RAW post pool (sort-agnostic, shared across all users & sort modes)
    const poolCacheKey = cacheKeys.feed(lat, lng, radiusKm, 'pool');
    const rawPosts: any[] = await getOrSetCache(poolCacheKey, cacheTTL.feed, async () => {
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
        ORDER BY p."createdAt" DESC
        LIMIT $4
        `,
        lng, lat, radiusMeters, RANKING_POOL_SIZE,
      );

      // Format for caching (serialize dates)
      return posts.map((p: any) => ({
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
    });

    // Rank the full pool per-request (uses current user's following data + chosen sort)
    const ranked = rankPosts(rawPosts, sort, followedIds);

    // Paginate: offset-based since score ordering doesn't support cursor
    const start = page * PAGE_SIZE;
    const sliced = ranked.slice(start, start + PAGE_SIZE + 1);
    const hasMore = sliced.length > PAGE_SIZE;
    const pagePosts = hasMore ? sliced.slice(0, PAGE_SIZE) : sliced;

    // Compute isLiked per-user
    let finalPosts = pagePosts.map((p: any) => ({
      ...p,
      isLiked: false,
      _score: undefined,
    }));

    if (userId && finalPosts.length > 0) {
      const postIds = finalPosts.map((p: any) => p.id);
      const likedPosts = await prisma.like.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      });
      const likedSet = new Set(likedPosts.map((l) => l.postId));
      finalPosts = finalPosts.map((p: any) => ({
        ...p,
        isLiked: likedSet.has(p.id),
      }));
    }

    return NextResponse.json({
      success: true,
      data: {
        posts: finalPosts,
        page,
        hasMore,
        sort,
      },
    });
  } catch (error) {
    console.error('Feed error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch feed' },
      { status: 500 }
    );
  }
}
