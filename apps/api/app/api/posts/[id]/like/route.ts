import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { invalidateCache, cacheKeys } from '@/lib/redis';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
      await prisma.$transaction([
        prisma.like.delete({
          where: { id: existingLike.id },
        }),
        prisma.post.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);

      isLiked = false;
      newLikeCount = Math.max(0, post.likeCount - 1);
    } else {
      // Like: create the like and increment count
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

      isLiked = true;
      newLikeCount = post.likeCount + 1;
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
  } catch (error) {
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
