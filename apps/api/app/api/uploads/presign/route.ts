import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createPresignedUpload } from '@/lib/storage';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { uploadPresignSchema, validateBody } from '@/lib/validation';

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
];

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);

    const body = await request.json();
    const validation = validateBody(uploadPresignSchema, body);
    if (!validation.success) return validation.response;
    const { fileName, contentType, folder } = validation.data;

    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Content type not allowed. Allowed types: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Determine upload folder (sanitize to prevent path traversal)
    const safeFolder = (folder || `users/${user.id}`).replace(/^\/+/, '');
    if (safeFolder.includes('..')) {
      return NextResponse.json(
        { success: false, error: 'Invalid folder path' },
        { status: 400 }
      );
    }

    const result = await createPresignedUpload(safeFolder, fileName, contentType);

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl: result.uploadUrl,
        publicUrl: result.publicUrl,
        path: result.path,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Presigned upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
