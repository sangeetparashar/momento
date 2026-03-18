import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { apiService } from '@/services/api';
import { showErrorToast } from '@/utils/toast';

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

        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.ontimeout = () => reject(new Error('Upload timed out'));
        xhr.timeout = 60000;

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
        // Step 1: Get presigned URL
        const ext = mimeType.split('/')[1] || 'bin';
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { uploadUrl, publicUrl } = await apiService.post<{
          uploadUrl: string;
          publicUrl: string;
          path: string;
        }>('/uploads/presign', { fileName, contentType: mimeType });

        setProgress(0.2);

        // Step 2: Read file into blob
        const fileResponse = await fetch(uri);
        const blob = await fileResponse.blob();

        // Step 3: Upload with real progress tracking via XHR
        await uploadWithProgress(uploadUrl, blob, mimeType);

        return publicUrl;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Upload failed';
        setError(message);
        showErrorToast('Upload failed. Please try again.');
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
