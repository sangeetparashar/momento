import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

const LEADERBOARD_LIMIT = 10;

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const data = await getOrSetCache(
      cacheKeys.creatorLeaderboard(),
      cacheTTL.creatorLeaderboard,
      async () => {
        // Trending: creators ranked by their most-liked single post
        const trending = await prisma.$queryRaw<any[]>`
          SELECT
            u."id",
            u."username",
            u."displayName",
            u."avatarUrl",
            u."tokenSymbol",
            u."followerCount",
            u."postCount",
            COALESCE(MAX(p."likeCount"), 0)::int as "topPostLikeCount"
          FROM "users" u
          LEFT JOIN "posts" p ON p."creatorId" = u."id"
          WHERE u."role" = 'CREATOR'
            AND u."isAdminApproved" = true
          GROUP BY u."id"
          ORDER BY "topPostLikeCount" DESC, u."followerCount" DESC
          LIMIT ${LEADERBOARD_LIMIT}
        `;

        // Most Active: creators ranked by post count
        const mostActive = await prisma.$queryRaw<any[]>`
          SELECT
            u."id",
            u."username",
            u."displayName",
            u."avatarUrl",
            u."tokenSymbol",
            u."followerCount",
            u."postCount",
            COALESCE(MAX(p."likeCount"), 0)::int as "topPostLikeCount"
          FROM "users" u
          LEFT JOIN "posts" p ON p."creatorId" = u."id"
          WHERE u."role" = 'CREATOR'
            AND u."isAdminApproved" = true
          GROUP BY u."id"
          ORDER BY u."postCount" DESC, u."followerCount" DESC
          LIMIT ${LEADERBOARD_LIMIT}
        `;

        return { trending, mostActive };
      },
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard' },
      { status: 500 },
    );
  }
}
