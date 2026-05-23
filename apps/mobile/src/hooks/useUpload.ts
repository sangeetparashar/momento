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

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — Supabase storage limit

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
        // Step 0: Compress images before upload
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
          } catch {
            // Fall back to original if compression fails
          }
        }

        // Step 1: Get presigned URL
        const ext = processedMimeType.split('/')[1] || 'bin';
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

        // Step 2.5: Check file size
        if (blob.size > MAX_FILE_SIZE) {
          const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
          throw new Error(`File is too large (${sizeMB}MB). Maximum size is 50MB. Try a shorter video or lower resolution.`);
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
