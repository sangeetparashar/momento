import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { apiService } from '@/services/api';

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

  const uploadFromUri = useCallback(
    async (uri: string, mimeType = 'image/jpeg'): Promise<string> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);

      try {
        setProgress(0.2);

        const { url } = await apiService.uploadWithPresignedUrl(uri, mimeType);

        setProgress(1);
        return url;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Upload failed';
        setError(message);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [],
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
