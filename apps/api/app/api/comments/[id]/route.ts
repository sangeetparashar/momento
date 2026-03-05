import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { invalidateCache, cacheKeys } from '@/lib/redis';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    // Find the comment
    const comment = await prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        postId: true,
        post: {
          select: { creatorId: true },
        },
      },
    });

    if (!comment) {
      return NextResponse.json(
        { success: false, error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Only the comment author, the post creator, or an admin can delete
    const isCommentAuthor = comment.userId === user.id;
    const isPostCreator = comment.post.creatorId === user.id;

    if (!isCommentAuthor && !isPostCreator && !user.isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to delete this comment' },
        { status: 403 }
      );
    }

    // Delete comment and decrement count
    await prisma.$transaction([
      prisma.comment.delete({ where: { id } }),
      prisma.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      }),
    ]);

    // Invalidate caches
    await invalidateCache(
      `post:${comment.postId}:comments:*`,
      cacheKeys.postDetail(comment.postId),
      'feed:*'
    );

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Delete comment error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}
