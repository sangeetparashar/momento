import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCreator } from '@/lib/auth';
import { invalidateCache, cacheKeys } from '@/lib/redis';
import { notifyNewPost } from '@/lib/notifications';
import { postCreateHourlyLimiter, postCreateDailyLimiter, applyRateLimit } from '@/lib/ratelimit';
import { createPostSchema, validateBody } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const hourlyLimit = await applyRateLimit(request, postCreateHourlyLimiter);
    if (hourlyLimit) return hourlyLimit;
    const dailyLimit = await applyRateLimit(request, postCreateDailyLimiter);
    if (dailyLimit) return dailyLimit;
    const user = await requireCreator(request);

    const body = await request.json();
    const validation = validateBody(createPostSchema, body);
    if (!validation.success) return validation.response;
    const { postType, content, caption, mediaUrl, mediaUrls, latitude, longitude } = validation.data;

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

    // Create the post and increment count atomically
    const [postResult] = await prisma.$transaction([
      prisma.post.create({
        data: {
          creatorId: user.id,
          postType,
          content: content || null,
          caption: caption || null,
          mediaUrl: mediaUrl || null,
          mediaUrls: mediaUrls ?? undefined,
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
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { postCount: { increment: 1 } },
      }),
    ]);

    // Invalidate feed, creator, and user profile caches
    await invalidateCache(
      'feed:*',
      `creator:${user.id}:posts:*`,
      `creator:${user.id}`,
      cacheKeys.userProfile(user.id)
    );

    const post = postResult as typeof postResult & { creator: { id: string; username: string | null; displayName: string | null; avatarUrl: string | null; bannerUrl: string | null; tokenSymbol: string | null; socialLinks: any; followerCount: number; postCount: number } };

    // Notify followers asynchronously (fire and forget) — after transaction success
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
