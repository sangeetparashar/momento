import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(`Failed to create presigned upload URL: ${error?.message || 'Unknown error'}`);
  }

  // Construct the public URL
  const { data: publicUrlData } = supabase.storage
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
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);
  if (error) {
    console.error('Failed to delete file from storage:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}
