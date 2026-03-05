import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getOrSetCache, cacheKeys, cacheTTL } from '@/lib/redis';

const PAGE_SIZE = 20;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || undefined;

    const cacheKey = cacheKeys.creatorPosts(id, cursor);

    const data = await getOrSetCache(cacheKey, cacheTTL.creatorPosts, async () => {
      // Verify creator exists
      const creator = await prisma.user.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!creator) {
        return null;
      }

      const posts = await prisma.post.findMany({
        where: { creatorId: id },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bannerUrl: true,
              tokenSymbol: true,
              socialLinks: true,
              followerCount: true,
              postCount: true,
            },
          },
        },
      });

      const hasMore = posts.length > PAGE_SIZE;
      const slicedPosts = hasMore ? posts.slice(0, PAGE_SIZE) : posts;

      return {
        posts: slicedPosts.map((p) => ({
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
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          creator: p.creator,
        })),
        nextCursor: hasMore ? slicedPosts[slicedPosts.length - 1].id : undefined,
        hasMore,
      };
    });

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Creator not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Creator posts error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch creator posts' },
      { status: 500 }
    );
  }
}
