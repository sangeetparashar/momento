import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    }
    _supabase = createClient(url, serviceKey);
  }
  return _supabase;
}

const BUCKET_NAME = 'momento-uploads';

interface PresignedUploadResult {
  uploadUrl: string;
  publicUrl: string;
  path: string;
}

/**
 * Generates a presigned upload URL for Supabase Storage.
 * The caller uploads directly to Supabase using this URL.
 */
export async function createPresignedUpload(
  folder: string,
  fileName: string,
  contentType: string
): Promise<PresignedUploadResult> {
  // Generate a unique path: folder/uuid-filename
  const ext = fileName.split('.').pop() || 'bin';
  const uniqueName = `${uuidv4()}.${ext}`;
  const path = `${folder}/${uniqueName}`;

  // Create a signed upload URL (valid for 1 hour)
  const { data, error } = await getSupabase().storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(`Failed to create presigned upload URL: ${error?.message || 'Unknown error'}`);
  }

  // Construct the public URL
  const { data: publicUrlData } = getSupabase().storage
    .from(BUCKET_NAME)
    .getPublicUrl(path);

  return {
    uploadUrl: data.signedUrl,
    publicUrl: publicUrlData.publicUrl,
    path,
  };
}

/**
 * Deletes a file from Supabase Storage by its path.
 */
export async function deleteFile(path: string): Promise<void> {
  const { error } = await getSupabase().storage.from(BUCKET_NAME).remove([path]);
  if (error) {
    console.error('Failed to delete file from storage:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Extracts the Supabase storage path from a public URL.
 * URL format: {SUPABASE_URL}/storage/v1/object/public/momento-uploads/{path}
 */
export function extractStoragePath(publicUrl: string): string | null {
  const match = publicUrl.match(/momento-uploads\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * Deletes all media files associated with a post. Fire-and-forget.
 */
export async function deletePostMedia(
  mediaUrl: string | null,
  mediaUrls: unknown
): Promise<void> {
  const urls: string[] = [];
  if (mediaUrl) urls.push(mediaUrl);
  if (Array.isArray(mediaUrls)) {
    urls.push(...mediaUrls.filter((u): u is string => typeof u === 'string'));
  }

  for (const url of urls) {
    const path = extractStoragePath(url);
    if (path) {
      deleteFile(path).catch((err) =>
        console.error('Failed to delete media file:', err)
      );
    }
  }
}
