import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUser, requireAuth } from '@/lib/auth';
import { getOrSetCache, invalidateCache, cacheKeys, cacheTTL } from '@/lib/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await getAuthUser(request);

    const post = await getOrSetCache(cacheKeys.postDetail(id), cacheTTL.postDetail, async () => {
      const result = await prisma.post.findUnique({
        where: { id },
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

      if (!result) return null;

      return {
        id: result.id,
        creatorId: result.creatorId,
        postType: result.postType,
        content: result.content,
        caption: result.caption,
        mediaUrl: result.mediaUrl,
        mediaUrls: result.mediaUrls,
        latitude: result.latitude,
        longitude: result.longitude,
        likeCount: result.likeCount,
        commentCount: result.commentCount,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
        creator: result.creator,
      };
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    // Check like status if authenticated
    let isLiked = false;
    if (authUser) {
      const like = await prisma.like.findUnique({
        where: {
          userId_postId: {
            userId: authUser.id,
            postId: id,
          },
        },
      });
      isLiked = !!like;
    }

    return NextResponse.json({
      success: true,
      data: { ...post, isLiked },
    });
  } catch (error) {
    console.error('Post detail error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch post' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    // Verify the post exists and belongs to the user
    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, creatorId: true },
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    if (post.creatorId !== user.id && !user.isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to delete this post' },
        { status: 403 }
      );
    }

    // Delete the post (cascades to likes and comments)
    await prisma.post.delete({ where: { id } });

    // Decrement the creator's post count
    await prisma.user.update({
      where: { id: post.creatorId },
      data: { postCount: { decrement: 1 } },
    });

    // Invalidate caches
    await invalidateCache(
      cacheKeys.postDetail(id),
      'feed:*',
      `creator:${post.creatorId}:posts:*`,
      cacheKeys.creatorProfile(post.creatorId)
    );

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Delete post error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete post' },
      { status: 500 }
    );
  }
}
