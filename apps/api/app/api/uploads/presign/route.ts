import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createPresignedUpload } from '@/lib/storage';

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const body = await request.json();
    const { fileName, contentType, folder } = body;

    if (!fileName || !contentType) {
      return NextResponse.json(
        { success: false, error: 'fileName and contentType are required' },
        { status: 400 }
      );
    }

    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Content type not allowed. Allowed types: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Determine upload folder
    const uploadFolder = folder || `users/${user.id}`;

    const result = await createPresignedUpload(uploadFolder, fileName, contentType);

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
