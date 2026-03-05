# Momento - Cursor Instructions (Part 2)
# API Routes

---

# Phase 4: Feed & Discovery Routes

## P4-01: Create Feed API

```
Create apps/api/app/api/feed/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis, cacheKeys, cacheTTL, getOrSetCache } from '@/lib/redis';
import { getAuthUser } from '@/lib/auth';
import { PostWithCreator, UserRole } from '@momento/shared';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radius = parseInt(searchParams.get('radius') || '10000'); // meters
    const cursor = searchParams.get('cursor');
    const limit = 20;

    if (!lat || !lng) {
      return NextResponse.json({ success: false, error: 'Location required' }, { status: 400 });
    }

    const cacheKey = cacheKeys.feed(lat, lng, radius);

    // Get base posts from cache or DB
    const posts = await getOrSetCache(cacheKey, cacheTTL.feed, async () => {
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          p.id, p."creatorId", p."postType", p.content, p.caption,
          p."mediaUrl", p."mediaUrls", p.latitude, p.longitude,
          p."likeCount", p."commentCount", p."createdAt", p."updatedAt",
          ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance,
          u.id as "creator_id", u.username as "creator_username",
          u."displayName" as "creator_displayName", u."avatarUrl" as "creator_avatarUrl",
          u."tokenSymbol" as "creator_tokenSymbol", u."followerCount" as "creator_followerCount"
        FROM "Post" p
        JOIN "User" u ON p."creatorId" = u.id
        WHERE u.role = ${UserRole.CREATOR}
          AND u."isAdminApproved" = true
          AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
        ORDER BY p."createdAt" DESC
        LIMIT 100
      `;

      return result.map((row) => ({
        id: row.id,
        creatorId: row.creatorId,
        postType: row.postType,
        content: row.content,
        caption: row.caption,
        mediaUrl: row.mediaUrl,
        mediaUrls: row.mediaUrls,
        latitude: row.latitude,
        longitude: row.longitude,
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        distanceMeters: row.distance,
        creator: {
          id: row.creator_id,
          username: row.creator_username,
          displayName: row.creator_displayName,
          avatarUrl: row.creator_avatarUrl,
          tokenSymbol: row.creator_tokenSymbol,
          followerCount: row.creator_followerCount,
        },
      }));
    });

    // Paginate
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = posts.findIndex((p: any) => p.id === cursor);
      if (cursorIndex !== -1) startIndex = cursorIndex + 1;
    }

    const paginatedPosts = posts.slice(startIndex, startIndex + limit);

    // Get user's likes for these posts
    const postIds = paginatedPosts.map((p: any) => p.id);
    const userLikes = await prisma.like.findMany({
      where: { userId: user.id, postId: { in: postIds } },
      select: { postId: true },
    });
    const likedPostIds = new Set(userLikes.map((l) => l.postId));

    // Add isLiked to each post
    const postsWithLikes: PostWithCreator[] = paginatedPosts.map((post: any) => ({
      ...post,
      isLiked: likedPostIds.has(post.id),
    }));

    return NextResponse.json({
      success: true,
      data: {
        posts: postsWithLikes,
        nextCursor: paginatedPosts.length === limit ? paginatedPosts[paginatedPosts.length - 1].id : null,
        hasMore: startIndex + limit < posts.length,
      },
    });
  } catch (error) {
    console.error('Feed error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch feed' }, { status: 500 });
  }
}
```

---

## P4-02: Create Nearby Creators API

```
Create apps/api/app/api/creators/nearby/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { PublicCreator, UserRole } from '@momento/shared';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radius = parseInt(searchParams.get('radius') || '50000');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!lat || !lng) {
      return NextResponse.json({ success: false, error: 'Location required' }, { status: 400 });
    }

    const creators = await prisma.$queryRaw<any[]>`
      SELECT 
        id, username, "displayName", bio, "avatarUrl", "bannerUrl",
        "tokenSymbol", "socialLinks", "followerCount", "postCount",
        ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance
      FROM "User"
      WHERE role = ${UserRole.CREATOR}
        AND "isAdminApproved" = true
        AND location IS NOT NULL
        AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
      ORDER BY distance ASC
      LIMIT ${limit}
    `;

    const formattedCreators: PublicCreator[] = creators.map((c) => ({
      id: c.id,
      username: c.username,
      displayName: c.displayName,
      bio: c.bio,
      avatarUrl: c.avatarUrl,
      bannerUrl: c.bannerUrl,
      tokenSymbol: c.tokenSymbol,
      socialLinks: c.socialLinks,
      followerCount: c.followerCount,
      postCount: c.postCount,
      distanceMeters: c.distance,
    }));

    return NextResponse.json({
      success: true,
      data: { creators: formattedCreators },
    });
  } catch (error) {
    console.error('Nearby creators error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch creators' }, { status: 500 });
  }
}
```

---

## P4-03: Create Creator Profile API

```
Create apps/api/app/api/creators/[id]/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { redis, cacheKeys, cacheTTL, getOrSetCache } from '@/lib/redis';
import { UserRole } from '@momento/shared';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const cacheKey = cacheKeys.creator(params.id);

    const creator = await getOrSetCache(cacheKey, cacheTTL.creator, async () => {
      return prisma.user.findFirst({
        where: {
          id: params.id,
          role: UserRole.CREATOR,
          isAdminApproved: true,
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          bannerUrl: true,
          tokenSymbol: true,
          socialLinks: true,
          followerCount: true,
          postCount: true,
        },
      });
    });

    if (!creator) {
      return NextResponse.json({ success: false, error: 'Creator not found' }, { status: 404 });
    }

    // Check if user follows this creator
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: params.id,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: { ...creator, isFollowing: !!follow },
    });
  } catch (error) {
    console.error('Creator profile error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch creator' }, { status: 500 });
  }
}
```

---

## P4-04: Create Creator Posts API

```
Create apps/api/app/api/creators/[id]/posts/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = 20;

    const posts = await prisma.post.findMany({
      where: { creatorId: params.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            tokenSymbol: true,
            followerCount: true,
          },
        },
      },
    });

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, -1) : posts;

    // Get user likes
    const postIds = resultPosts.map((p) => p.id);
    const userLikes = await prisma.like.findMany({
      where: { userId: user.id, postId: { in: postIds } },
      select: { postId: true },
    });
    const likedPostIds = new Set(userLikes.map((l) => l.postId));

    const postsWithLikes = resultPosts.map((post) => ({
      ...post,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      isLiked: likedPostIds.has(post.id),
    }));

    return NextResponse.json({
      success: true,
      data: {
        posts: postsWithLikes,
        nextCursor: hasMore ? resultPosts[resultPosts.length - 1].id : null,
        hasMore,
      },
    });
  } catch (error) {
    console.error('Creator posts error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch posts' }, { status: 500 });
  }
}
```

---

## P4-05: Create Follow API

```
Create apps/api/app/api/creators/[id]/follow/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { invalidateCache, cacheKeys } from '@/lib/redis';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);

    if (user.id === params.id) {
      return NextResponse.json({ success: false, error: 'Cannot follow yourself' }, { status: 400 });
    }

    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: params.id,
        },
      },
    });

    if (existingFollow) {
      // Unfollow
      await prisma.$transaction([
        prisma.follow.delete({ where: { id: existingFollow.id } }),
        prisma.user.update({
          where: { id: user.id },
          data: { followingCount: { decrement: 1 } },
        }),
        prisma.user.update({
          where: { id: params.id },
          data: { followerCount: { decrement: 1 } },
        }),
      ]);

      await invalidateCache(cacheKeys.creator(params.id));

      const updatedCreator = await prisma.user.findUnique({
        where: { id: params.id },
        select: { followerCount: true },
      });

      return NextResponse.json({
        success: true,
        data: { following: false, followerCount: updatedCreator?.followerCount || 0 },
      });
    } else {
      // Follow
      await prisma.$transaction([
        prisma.follow.create({
          data: { followerId: user.id, followingId: params.id },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { followingCount: { increment: 1 } },
        }),
        prisma.user.update({
          where: { id: params.id },
          data: { followerCount: { increment: 1 } },
        }),
      ]);

      await invalidateCache(cacheKeys.creator(params.id));

      const updatedCreator = await prisma.user.findUnique({
        where: { id: params.id },
        select: { followerCount: true },
      });

      return NextResponse.json({
        success: true,
        data: { following: true, followerCount: updatedCreator?.followerCount || 0 },
      });
    }
  } catch (error) {
    console.error('Follow error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update follow' }, { status: 500 });
  }
}
```

---

# Phase 5: Posts & Engagement Routes

## P5-01: Create Post API

```
Create apps/api/app/api/posts/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCreator } from '@/lib/auth';
import { invalidateCache } from '@/lib/redis';
import { notifyFollowersOfNewPost } from '@/lib/notifications';
import { PostType } from '@momento/shared';

export async function POST(request: NextRequest) {
  try {
    const user = await requireCreator(request);

    const body = await request.json();
    const { postType, content, caption, mediaUrl, mediaUrls, latitude, longitude } = body;

    if (!postType || !latitude || !longitude) {
      return NextResponse.json(
        { success: false, error: 'Post type and location required' },
        { status: 400 }
      );
    }

    if (postType === PostType.TEXT && !content) {
      return NextResponse.json({ success: false, error: 'Content required for text posts' }, { status: 400 });
    }

    if ((postType === PostType.IMAGE || postType === PostType.VIDEO) && !mediaUrl) {
      return NextResponse.json({ success: false, error: 'Media required for image/video posts' }, { status: 400 });
    }

    const post = await prisma.post.create({
      data: {
        creatorId: user.id,
        postType,
        content,
        caption,
        mediaUrl,
        mediaUrls,
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
            tokenSymbol: true,
            followerCount: true,
          },
        },
      },
    });

    // Update post count
    await prisma.user.update({
      where: { id: user.id },
      data: { postCount: { increment: 1 } },
    });

    // Invalidate feed caches
    await invalidateCache('feed:*');

    // Notify followers (fire and forget)
    notifyFollowersOfNewPost(user.id, post.id, user.displayName || user.username || 'A creator').catch(console.error);

    return NextResponse.json({
      success: true,
      data: {
        post: {
          ...post,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
        },
      },
    });
  } catch (error: any) {
    if (error.message === 'Creator access required') {
      return NextResponse.json({ success: false, error: 'Creator access required' }, { status: 403 });
    }
    console.error('Create post error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create post' }, { status: 500 });
  }
}
```

---

## P5-02: Create Single Post API

```
Create apps/api/app/api/posts/[id]/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireAuth } from '@/lib/auth';
import { redis, cacheKeys, cacheTTL, getOrSetCache, invalidateCache } from '@/lib/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const cacheKey = cacheKeys.post(params.id);

    const post = await getOrSetCache(cacheKey, cacheTTL.post, async () => {
      return prisma.post.findUnique({
        where: { id: params.id },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              tokenSymbol: true,
              followerCount: true,
            },
          },
        },
      });
    });

    if (!post) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    // Check if user liked this post
    const like = await prisma.like.findUnique({
      where: { userId_postId: { userId: user.id, postId: params.id } },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...post,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        isLiked: !!like,
      },
    });
  } catch (error) {
    console.error('Get post error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch post' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);

    const post = await prisma.post.findUnique({
      where: { id: params.id },
      select: { creatorId: true },
    });

    if (!post) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    if (post.creatorId !== user.id && !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Not authorized' }, { status: 403 });
    }

    await prisma.post.delete({ where: { id: params.id } });

    await prisma.user.update({
      where: { id: post.creatorId },
      data: { postCount: { decrement: 1 } },
    });

    await invalidateCache(cacheKeys.post(params.id));
    await invalidateCache('feed:*');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete post error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete post' }, { status: 500 });
  }
}
```

---

## P5-03: Create Like API

```
Create apps/api/app/api/posts/[id]/like/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { invalidateCache, cacheKeys } from '@/lib/redis';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);

    const existingLike = await prisma.like.findUnique({
      where: { userId_postId: { userId: user.id, postId: params.id } },
    });

    if (existingLike) {
      // Unlike
      await prisma.$transaction([
        prisma.like.delete({ where: { id: existingLike.id } }),
        prisma.post.update({
          where: { id: params.id },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);

      await invalidateCache(cacheKeys.post(params.id));

      const post = await prisma.post.findUnique({
        where: { id: params.id },
        select: { likeCount: true },
      });

      return NextResponse.json({
        success: true,
        data: { liked: false, likeCount: post?.likeCount || 0 },
      });
    } else {
      // Like
      await prisma.$transaction([
        prisma.like.create({ data: { userId: user.id, postId: params.id } }),
        prisma.post.update({
          where: { id: params.id },
          data: { likeCount: { increment: 1 } },
        }),
      ]);

      await invalidateCache(cacheKeys.post(params.id));

      const post = await prisma.post.findUnique({
        where: { id: params.id },
        select: { likeCount: true },
      });

      return NextResponse.json({
        success: true,
        data: { liked: true, likeCount: post?.likeCount || 0 },
      });
    }
  } catch (error) {
    console.error('Like error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update like' }, { status: 500 });
  }
}
```

---

## P5-04: Create Comments API

```
Create apps/api/app/api/posts/[id]/comments/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { notifyPostOwnerOfComment } from '@/lib/notifications';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = 20;

    const comments = await prisma.comment.findMany({
      where: { postId: params.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    const hasMore = comments.length > limit;
    const resultComments = hasMore ? comments.slice(0, -1) : comments;

    return NextResponse.json({
      success: true,
      data: {
        comments: resultComments.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? resultComments[resultComments.length - 1].id : null,
        hasMore,
      },
    });
  } catch (error) {
    console.error('Get comments error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);

    const body = await request.json();
    const { content } = body;

    if (!content?.trim()) {
      return NextResponse.json({ success: false, error: 'Content required' }, { status: 400 });
    }

    const comment = await prisma.comment.create({
      data: { userId: user.id, postId: params.id, content: content.trim() },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    await prisma.post.update({
      where: { id: params.id },
      data: { commentCount: { increment: 1 } },
    });

    // Notify post owner
    notifyPostOwnerOfComment(params.id, user.id, user.displayName || user.username || 'Someone').catch(console.error);

    return NextResponse.json({
      success: true,
      data: { comment: { ...comment, createdAt: comment.createdAt.toISOString() } },
    });
  } catch (error) {
    console.error('Create comment error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create comment' }, { status: 500 });
  }
}
```

---

## P5-05: Create Delete Comment API

```
Create apps/api/app/api/comments/[id]/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);

    const comment = await prisma.comment.findUnique({
      where: { id: params.id },
      select: { userId: true, postId: true },
    });

    if (!comment) {
      return NextResponse.json({ success: false, error: 'Comment not found' }, { status: 404 });
    }

    if (comment.userId !== user.id && !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Not authorized' }, { status: 403 });
    }

    await prisma.comment.delete({ where: { id: params.id } });

    await prisma.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete comment error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete comment' }, { status: 500 });
  }
}
```

---

# Phase 6: User & KYC Routes

## P6-01: Create User Profile API

```
Create apps/api/app/api/users/me/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    return NextResponse.json({ success: true, data: { user } });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();

    const allowedFields = ['username', 'displayName', 'bio', 'avatarUrl', 'bannerUrl', 'socialLinks', 'tokenSymbol'];
    const updateData: any = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Validate username uniqueness if changing
    if (updateData.username && updateData.username !== user.username) {
      const existing = await prisma.user.findUnique({
        where: { username: updateData.username },
      });
      if (existing) {
        return NextResponse.json({ success: false, error: 'Username already taken' }, { status: 400 });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: { user: updatedUser } });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update profile' }, { status: 500 });
  }
}
```

---

## P6-02: Create Location Update API

```
Create apps/api/app/api/users/me/location/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { latitude, longitude } = body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid coordinates' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { locationLat: latitude, locationLng: longitude },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update location error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update location' }, { status: 500 });
  }
}
```

---

## P6-03: Create Push Token API

```
Create apps/api/app/api/users/me/push-token/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ success: false, error: 'Token required' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { pushToken: token },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update push token error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update push token' }, { status: 500 });
  }
}
```

---

## P6-04: Create KYC Apply API

```
Create apps/api/app/api/creators/apply/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { createVeriffSession } from '@/lib/veriff';
import { KycStatus, UserRole } from '@momento/shared';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    // DEV BYPASS: Skip Veriff in development
    if (process.env.SKIP_KYC === 'true') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          kycStatus: KycStatus.VERIFIED,
          role: UserRole.CREATOR,
          isAdminApproved: true,
        },
      });

      return NextResponse.json({
        success: true,
        data: { message: 'DEV MODE: Auto-verified as creator', skipKyc: true },
      });
    }

    // Check if already verified or pending
    if (user.kycStatus === KycStatus.VERIFIED) {
      return NextResponse.json({ success: false, error: 'Already verified' }, { status: 400 });
    }

    if (user.kycStatus === KycStatus.PENDING) {
      return NextResponse.json({ success: false, error: 'Verification already in progress' }, { status: 400 });
    }

    // Create Veriff session
    const { sessionId, url } = await createVeriffSession(
      user.id,
      user.displayName?.split(' ')[0],
      user.displayName?.split(' ').slice(1).join(' ')
    );

    // Create KYC record
    await prisma.kycRecord.create({
      data: { userId: user.id, veriffSessionId: sessionId },
    });

    // Update user status
    await prisma.user.update({
      where: { id: user.id },
      data: { kycStatus: KycStatus.PENDING },
    });

    return NextResponse.json({
      success: true,
      data: { sessionId, url },
    });
  } catch (error) {
    console.error('KYC apply error:', error);
    return NextResponse.json({ success: false, error: 'Failed to start verification' }, { status: 500 });
  }
}
```

---

## P6-05: Create KYC Webhook API

```
Create apps/api/app/api/kyc/webhook/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyVeriffWebhook, mapVeriffStatus } from '@/lib/veriff';
import { KycStatus } from '@momento/shared';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-hmac-signature') || '';

    // Verify webhook signature
    if (!verifyVeriffWebhook(body, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(body);
    const { verification } = payload;

    if (!verification?.id) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const kycRecord = await prisma.kycRecord.findUnique({
      where: { veriffSessionId: verification.id },
      include: { user: true },
    });

    if (!kycRecord) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const newStatus = mapVeriffStatus(verification.decision);

    // Update KYC record
    await prisma.kycRecord.update({
      where: { id: kycRecord.id },
      data: {
        status: newStatus,
        veriffDecision: verification.decision,
        veriffPerson: verification.person,
        decidedAt: new Date(),
      },
    });

    // Update user status
    await prisma.user.update({
      where: { id: kycRecord.userId },
      data: { kycStatus: newStatus },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('KYC webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
```

---

## P6-06: Create Wallet Balance API

```
Create apps/api/app/api/wallet/balance/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getWalletBalance } from '@/lib/helius';
import { redis, cacheKeys, cacheTTL, getOrSetCache } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    if (!user.walletAddress) {
      return NextResponse.json({ success: false, error: 'No wallet address' }, { status: 400 });
    }

    const cacheKey = cacheKeys.wallet(user.walletAddress);

    const balance = await getOrSetCache(cacheKey, cacheTTL.wallet, async () => {
      return getWalletBalance(user.walletAddress);
    });

    return NextResponse.json({ success: true, data: balance });
  } catch (error) {
    console.error('Wallet balance error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch balance' }, { status: 500 });
  }
}
```

---

## P6-07: Create Presigned Upload API

```
Create apps/api/app/api/uploads/presign/route.ts:

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createPresignedUploadUrl } from '@/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { folder, contentType } = body;

    if (!folder || !contentType) {
      return NextResponse.json({ success: false, error: 'Folder and content type required' }, { status: 400 });
    }

    const validFolders = ['avatars', 'banners', 'posts'];
    if (!validFolders.includes(folder)) {
      return NextResponse.json({ success: false, error: 'Invalid folder' }, { status: 400 });
    }

    const { uploadUrl, publicUrl, path } = await createPresignedUploadUrl(
      folder as 'avatars' | 'banners' | 'posts',
      contentType,
      user.id
    );

    return NextResponse.json({
      success: true,
      data: { uploadUrl, publicUrl, path },
    });
  } catch (error) {
    console.error('Presign error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create upload URL' }, { status: 500 });
  }
}
```

---

# Continue to Part 3...

Part 3 covers:
- Phase 7: Mobile Foundation (Config, Providers)
- Phase 8: Style System & Primitives
- Phase 9: React Query Hooks
