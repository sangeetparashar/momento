import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import { readLimiter, writeLimiter, applyRateLimit } from '@/lib/ratelimit';

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || undefined;

    const savedPosts = await prisma.savedPost.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: {
        post: {
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
        },
      },
    });

    const hasMore = savedPosts.length > PAGE_SIZE;
    const sliced = hasMore ? savedPosts.slice(0, PAGE_SIZE) : savedPosts;

    const posts = sliced.map((sp) => ({
      ...sp.post,
      createdAt: sp.post.createdAt.toISOString(),
      updatedAt: sp.post.updatedAt.toISOString(),
      creator: sp.post.creator,
      savedAt: sp.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        posts,
        nextCursor: hasMore ? sliced[sliced.length - 1].id : undefined,
        hasMore,
      },
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('List saved posts error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch saved posts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;
    const user = await requireAuth(request);

    const body = await request.json();
    const { postId } = body;

    if (!postId || typeof postId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'postId is required' },
        { status: 400 }
      );
    }

    // Check post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    // Toggle: check if already saved
    const existing = await prisma.savedPost.findUnique({
      where: { userId_postId: { userId: user.id, postId } },
    });

    let isSaved: boolean;

    if (existing) {
      // Unsave
      await prisma.savedPost.delete({ where: { id: existing.id } });
      isSaved = false;
    } else {
      // Save
      try {
        await prisma.savedPost.create({
          data: { userId: user.id, postId },
        });
      } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return NextResponse.json({
            success: true,
            data: { saved: true },
          });
        }
        throw error;
      }
      isSaved = true;
    }

    return NextResponse.json({
      success: true,
      data: { saved: isSaved },
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Toggle save error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to toggle save' },
      { status: 500 }
    );
  }
}
