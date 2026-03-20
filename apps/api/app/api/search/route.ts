import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

const MAX_RESULTS = 20;

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const type = searchParams.get('type') || 'all'; // 'all' | 'creators' | 'posts'

    if (!q || q.length < 2) {
      return NextResponse.json({
        success: true,
        data: { creators: [], posts: [] },
      });
    }

    const searchTerm = `%${q}%`;

    let creators: any[] = [];
    let posts: any[] = [];

    if (type === 'all' || type === 'creators') {
      creators = await prisma.user.findMany({
        where: {
          role: 'CREATOR',
          isAdminApproved: true,
          OR: [
            { displayName: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            { tokenSymbol: { contains: q, mode: 'insensitive' } },
            { bio: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          bannerUrl: true,
          tokenSymbol: true,
          followerCount: true,
          postCount: true,
        },
        take: MAX_RESULTS,
        orderBy: { followerCount: 'desc' },
      });
    }

    if (type === 'all' || type === 'posts') {
      posts = await prisma.post.findMany({
        where: {
          OR: [
            { caption: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          caption: true,
          content: true,
          mediaUrl: true,
          postType: true,
          likeCount: true,
          createdAt: true,
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              tokenSymbol: true,
            },
          },
        },
        take: MAX_RESULTS,
        orderBy: { createdAt: 'desc' },
      });
    }

    return NextResponse.json({
      success: true,
      data: { creators, posts },
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { success: false, error: 'Search failed' },
      { status: 500 }
    );
  }
}
