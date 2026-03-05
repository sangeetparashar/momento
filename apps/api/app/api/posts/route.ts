import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCreator } from '@/lib/auth';
import { invalidateCache } from '@/lib/redis';
import { notifyNewPost } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  try {
    const user = await requireCreator(request);

    const body = await request.json();
    const { postType, content, caption, mediaUrl, mediaUrls, latitude, longitude } = body;

    // Validate required fields
    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { success: false, error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    if (!postType) {
      return NextResponse.json(
        { success: false, error: 'Post type is required' },
        { status: 400 }
      );
    }

    // Validate based on post type
    if (postType === 'TEXT' && !content) {
      return NextResponse.json(
        { success: false, error: 'Content is required for text posts' },
        { status: 400 }
      );
    }

    if ((postType === 'IMAGE' || postType === 'VIDEO') && !mediaUrl) {
      return NextResponse.json(
        { success: false, error: 'Media URL is required for image/video posts' },
        { status: 400 }
      );
    }

    // Create the post
    const post = await prisma.post.create({
      data: {
        creatorId: user.id,
        postType,
        content: content || null,
        caption: caption || null,
        mediaUrl: mediaUrl || null,
        mediaUrls: mediaUrls || null,
        latitude,
        longitude,
      },
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

    // Increment the creator's post count
    await prisma.user.update({
      where: { id: user.id },
      data: { postCount: { increment: 1 } },
    });

    // Invalidate feed and creator caches
    await invalidateCache(
      'feed:*',
      `creator:${user.id}:posts:*`,
      `creator:${user.id}`
    );

    // Notify followers asynchronously (fire and forget)
    const creatorName = post.creator.displayName || post.creator.username || 'A creator';
    notifyNewPost(user.id, creatorName, post.id).catch((err) =>
      console.error('Failed to send new post notifications:', err)
    );

    return NextResponse.json({
      success: true,
      data: {
        id: post.id,
        creatorId: post.creatorId,
        postType: post.postType,
        content: post.content,
        caption: post.caption,
        mediaUrl: post.mediaUrl,
        mediaUrls: post.mediaUrls,
        latitude: post.latitude,
        longitude: post.longitude,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        creator: post.creator,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Create post error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create post' },
      { status: 500 }
    );
  }
}
