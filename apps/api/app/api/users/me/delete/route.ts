import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { invalidateCache } from '@/lib/redis';
import { deleteFile } from '@/lib/storage';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { deleteAccountSchema, validateBody } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);

    const body = await request.json();
    const validation = validateBody(deleteAccountSchema, body);
    if (!validation.success) return validation.response;

    // Collect media paths for cleanup before deleting
    const posts = await prisma.post.findMany({
      where: { creatorId: user.id },
      select: { mediaUrl: true, mediaUrls: true },
    });

    // Delete user — Prisma onDelete: Cascade handles all relations
    await prisma.user.delete({ where: { id: user.id } });

    // Fire-and-forget: clean up media files from storage
    const mediaUrls: string[] = [];
    for (const post of posts) {
      if (post.mediaUrl) mediaUrls.push(post.mediaUrl);
      if (post.mediaUrls && Array.isArray(post.mediaUrls)) {
        mediaUrls.push(...(post.mediaUrls as string[]));
      }
    }

    for (const url of mediaUrls) {
      // Extract storage path from Supabase public URL
      const match = url.match(/momento-uploads\/(.+)$/);
      if (match) {
        deleteFile(match[1]).catch((err) =>
          console.error('Failed to delete file:', err)
        );
      }
    }

    // Invalidate all caches related to this user
    await invalidateCache(
      `user:${user.id}`,
      `creator:${user.id}`,
      `creator:${user.id}:posts:*`,
      'feed:*'
    );

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Delete account error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
