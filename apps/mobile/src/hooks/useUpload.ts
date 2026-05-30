import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { apiService } from '@/services/api';
import { showErrorToast } from '@/utils/toast';
import type { UploadPresignResponse } from '@momento/shared';

interface UploadResult {
  uri: string;
  url: string;
}

interface UseUploadReturn {
  /** Pick an image from the library and upload it. Returns the public URL. */
  pickAndUpload: (options?: ImagePicker.ImagePickerOptions) => Promise<UploadResult | null>;
  /** Upload a file from a known local URI. */
  uploadFromUri: (uri: string, mimeType?: string) => Promise<string>;
  /** Whether an upload is currently in progress. */
  isUploading: boolean;
  /** Upload progress as a 0-1 fraction (approximate). */
  progress: number;
  /** Last error, if any. */
  error: string | null;
  /** Reset error state. */
  clearError: () => void;
}

// 250MB cap after compression. Supabase Pro allows up to 5GB per file, so
// this is the conservative client-side ceiling (cellular uploads above ~250MB
// pre-compression rarely succeed within the 5-minute XHR timeout anyway).
// Videos are auto-compressed before this check; iPhone QuickTime captures
// usually shrink 20MB → 3-5MB.
const MAX_FILE_SIZE = 250 * 1024 * 1024;
const MAX_FILE_SIZE_MB = Math.round(MAX_FILE_SIZE / (1024 * 1024));

// Videos smaller than this skip compression. Tiny clips compress quickly but
// the overhead isn't worth it for already-small files (e.g. <5s recordings).
const VIDEO_COMPRESSION_MIN_MB = 5;

// Mime → file extension map. `mimeType.split('/')[1]` alone produces wrong
// extensions for some types (notably `video/quicktime` → `quicktime`), which
// causes the feed's VIDEO_EXTENSIONS check (home.tsx, explore.tsx) to miss
// iOS captures and render them as broken images. Keep this table explicit
// for the formats we actually handle.
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function extensionForMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType.toLowerCase()] || mimeType.split('/')[1] || 'bin';
}

/**
 * Image picker + presigned upload flow.
 */
export function useUpload(): UseUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const uploadWithProgress = useCallback(
    (url: string, blob: Blob, contentType: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', contentType);
        // Persist on the storage object so /render/image/public/ serves with
        // long max-age + immutable. Without this header the upload defaults
        // to no-cache and the image re-downloads on every view.
        xhr.setRequestHeader('Cache-Control', 'max-age=31536000, immutable');

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            // Scale progress: 0.2 (presign done) to 0.9 (upload done)
            const uploadProgress = 0.2 + (event.loaded / event.total) * 0.7;
            setProgress(uploadProgress);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setProgress(1.0);
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error(`Upload network error (status: ${xhr.status})`));
        xhr.ontimeout = () => reject(new Error('Upload timed out — file may be too large'));
        xhr.timeout = 300000; // 5 minutes for large files

        xhr.send(blob);
      });
    },
    [],
  );

  const uploadFromUri = useCallback(
    async (uri: string, mimeType = 'image/jpeg'): Promise<string> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);

      try {
        // Step 0: Compress media before upload.
        // Images go through expo-image-manipulator (fast, instant — no
        // progress UI). Videos go through react-native-compressor which is
        // GPU-accelerated H.264 transcoding; it can take 3-8s for a 30s
        // 1080p clip so we wire its progress into the overall progress bar
        // (0 → 0.15 of total). After compression, the upload phase uses
        // 0.2 → 0.9 as usual.
        let processedUri = uri;
        let processedMimeType = mimeType;

        if (mimeType.startsWith('image/')) {
          try {
            const result = await ImageManipulator.manipulateAsync(
              uri,
              [{ resize: { width: 1200 } }],
              { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
            );
            processedUri = result.uri;
            processedMimeType = 'image/jpeg';
          } catch (e) {
            // Fall back to original if compression fails — still uploads,
            // just bigger payload. Log so we notice if this becomes frequent.
            console.warn('[upload] image compression failed, uploading original:', e);
          }
        } else if (mimeType.startsWith('video/')) {
          try {
            // Lazy-require so this JS is safe to OTA onto builds whose native
            // layer predates react-native-compressor. The library binds its
            // native module via TurboModuleRegistry.getEnforcing(), which
            // throws at module-eval time when the native side is absent — a
            // static top-level import would hard-crash such builds the moment
            // this hook loads. Requiring inside the try turns a missing native
            // module into the same graceful "upload original" fallback we use
            // when compression itself fails.
            const { Video } =
              require('react-native-compressor') as typeof import('react-native-compressor');
            const compressed = await Video.compress(
              uri,
              {
                compressionMethod: 'auto',
                minimumFileSizeForCompress: VIDEO_COMPRESSION_MIN_MB,
              },
              (compressionProgress) => {
                // Map compression 0-1 to overall 0-0.15
                setProgress(compressionProgress * 0.15);
              },
            );
            processedUri = compressed;
            // mimeType unchanged — the container (mp4/quicktime) is preserved
          } catch (e) {
            // Fall back to original if compression fails or the native module
            // isn't present in this build — still uploads, just larger/slower.
            console.warn('[upload] video compression unavailable, uploading original:', e);
          }
        }

        // Step 1: Get presigned URL
        const ext = extensionForMime(processedMimeType);
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        let uploadUrl: string;
        let publicUrl: string;
        try {
          const presignResult = await apiService.post<UploadPresignResponse>(
            '/uploads/presign', { fileName, contentType: processedMimeType });
          uploadUrl = presignResult.uploadUrl;
          publicUrl = presignResult.publicUrl;
        } catch (e: any) {
          throw new Error(`Presign failed: ${e?.message || e}`);
        }

        setProgress(0.2);

        // Step 2: Read file into blob
        let blob: Blob;
        try {
          const fileResponse = await fetch(processedUri);
          blob = await fileResponse.blob();
        } catch (e: any) {
          throw new Error(`Blob read failed: ${e?.message || e}`);
        }

        // Step 2.5: Check file size (after any compression). For videos
        // this means iPhone QuickTime captures that would have been ~20MB
        // raw are typically 3-5MB after the Video.compress() pass above.
        if (blob.size > MAX_FILE_SIZE) {
          const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
          throw new Error(
            `Even after compression this file is ${sizeMB}MB — over the ${MAX_FILE_SIZE_MB}MB cap. Try a shorter clip or lower resolution.`,
          );
        }

        // Step 3: Upload with real progress tracking via XHR
        try {
          await uploadWithProgress(uploadUrl, blob, processedMimeType);
        } catch (e: any) {
          throw new Error(`PUT upload failed (${blob.size} bytes): ${e?.message || e}`);
        }

        return publicUrl;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Upload failed';
        setError(message);
        showErrorToast(message);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [uploadWithProgress],
  );

  const pickAndUpload = useCallback(
    async (
      options?: ImagePicker.ImagePickerOptions,
    ): Promise<UploadResult | null> => {
      setError(null);

      // Request permission
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Photo library permission is required to upload images.');
        return null;
      }

      // Launch picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        ...options,
      });

      if (result.canceled || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'image/jpeg';

      const publicUrl = await uploadFromUri(asset.uri, mimeType);

      return { uri: asset.uri, url: publicUrl };
    },
    [uploadFromUri],
  );

  return {
    pickAndUpload,
    uploadFromUri,
    isUploading,
    progress,
    error,
    clearError,
  };
}
