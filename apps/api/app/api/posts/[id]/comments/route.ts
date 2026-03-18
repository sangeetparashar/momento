import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, getAuthUser } from '@/lib/auth';
import { getOrSetCache, invalidateCache, cacheKeys, cacheTTL } from '@/lib/redis';
import { notifyNewComment } from '@/lib/notifications';
import { readLimiter, commentLimiter, applyRateLimit } from '@/lib/ratelimit';
import { createCommentSchema, validateBody } from '@/lib/validation';

const PAGE_SIZE = 20;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const { id: postId } = await params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || undefined;

    const cacheKey = cacheKeys.postComments(postId, cursor);

    const data = await getOrSetCache(cacheKey, cacheTTL.postComments, async () => {
      // Verify post exists
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true },
      });

      if (!post) return null;

      const comments = await prisma.comment.findMany({
        where: { postId },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      });

      const hasMore = comments.length > PAGE_SIZE;
      const slicedComments = hasMore ? comments.slice(0, PAGE_SIZE) : comments;

      return {
        comments: slicedComments.map((c) => ({
          id: c.id,
          postId: c.postId,
          userId: c.userId,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
          user: c.user,
        })),
        nextCursor: hasMore ? slicedComments[slicedComments.length - 1].id : undefined,
        hasMore,
      };
    });

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('List comments error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, commentLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);
    const { id: postId } = await params;

    const body = await request.json();
    const validation = validateBody(createCommentSchema, body);
    if (!validation.success) return validation.response;
    const { content } = validation.data;

    // Check post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, creatorId: true },
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    // Create comment and increment count in a transaction
    const [comment] = await prisma.$transaction([
      prisma.comment.create({
        data: {
          userId: user.id,
          postId,
          content: content.trim(),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      prisma.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      }),
    ]);

    // Invalidate caches
    await invalidateCache(
      `post:${postId}:comments:*`,
      cacheKeys.postDetail(postId),
      'feed:*'
    );

    // Notify post creator (if commenter is not the creator)
    if (post.creatorId !== user.id) {
      const commenterName =
        comment.user.displayName || comment.user.username || 'Someone';
      notifyNewComment(post.creatorId, commenterName, postId, content.trim()).catch(
        (err) => console.error('Failed to send comment notification:', err)
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: comment.id,
        postId: comment.postId,
        userId: comment.userId,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        user: comment.user,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Create comment error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
