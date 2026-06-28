import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { invalidateCache, cacheKeys } from '@/lib/redis';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { notifyNewLike } from '@/lib/notifications';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const user = await requireAuth(request);
    const { id: postId } = await params;

    // Check post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, likeCount: true, creatorId: true },
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    // Check if already liked
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId: user.id,
          postId,
        },
      },
    });

    let isLiked: boolean;
    let newLikeCount: number;

    if (existingLike) {
      // Unlike: delete the like and decrement count
      try {
        await prisma.$transaction([
          prisma.like.delete({
            where: { id: existingLike.id },
          }),
          prisma.$executeRaw`UPDATE "posts" SET "likeCount" = GREATEST("likeCount" - 1, 0), "updatedAt" = NOW() WHERE "id" = ${postId}`,
        ]);

        const updatedPost = await prisma.post.findUnique({
          where: { id: postId },
          select: { likeCount: true },
        });
        isLiked = false;
        newLikeCount = Math.max(0, updatedPost?.likeCount ?? 0);
      } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          const currentLike = await prisma.like.findUnique({
            where: { userId_postId: { userId: user.id, postId } },
          });
          const currentPost = await prisma.post.findUnique({
            where: { id: postId },
            select: { likeCount: true },
          });
          return NextResponse.json({
            success: true,
            data: { liked: !!currentLike, likeCount: Math.max(0, currentPost?.likeCount ?? 0) },
          });
        }
        throw error;
      }
    } else {
      // Like: create the like and increment count
      try {
        await prisma.$transaction([
          prisma.like.create({
            data: {
              userId: user.id,
              postId,
            },
          }),
          prisma.post.update({
            where: { id: postId },
            data: { likeCount: { increment: 1 } },
          }),
        ]);
      } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // Concurrent like request already created the like — return current state
          const currentLike = await prisma.like.findUnique({
            where: { userId_postId: { userId: user.id, postId } },
          });
          const currentPost = await prisma.post.findUnique({
            where: { id: postId },
            select: { likeCount: true },
          });
          return NextResponse.json({
            success: true,
            data: {
              liked: !!currentLike,
              likeCount: currentPost?.likeCount ?? 0,
            },
          });
        }
        throw error;
      }

      const updatedPost = await prisma.post.findUnique({
        where: { id: postId },
        select: { likeCount: true },
      });
      isLiked = true;
      newLikeCount = updatedPost?.likeCount ?? post.likeCount + 1;

      // Send like notification (fire-and-forget), skip self-likes
      if (user.id !== post.creatorId) {
        const liker = await prisma.user.findUnique({
          where: { id: user.id },
          select: { displayName: true, username: true },
        });
        const likerName = liker?.displayName || liker?.username || 'Someone';
        notifyNewLike(post.creatorId, likerName, postId).catch((err) =>
          console.error('Failed to send like notification:', err)
        );
      }
    }

    // Invalidate post cache
    await invalidateCache(
      cacheKeys.postDetail(postId),
      'feed:*'
    );

    return NextResponse.json({
      success: true,
      data: {
        liked: isLiked,
        likeCount: newLikeCount,
      },
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Like toggle error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to toggle like' },
      { status: 500 }
    );
  }
}
