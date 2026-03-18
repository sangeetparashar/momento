import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { useCreatePost, useUpload } from '@/hooks';
import { useLocation } from '@/providers/LocationProvider';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { PostType } from '@momento/shared';

export default function CreatePostScreen() {
  const router = useRouter();
  const createPostMutation = useCreatePost();
  const { uploadFromUri, isUploading } = useUpload();
  const { location } = useLocation();
  const captionRef = useRef<TextInput>(null);

  const [caption, setCaption] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handlePickMedia = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed to add media.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setMediaUri(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick media.');
    }
  }, []);

  const handleRemoveMedia = useCallback(() => {
    setMediaUri(null);
  }, []);

  const handlePost = useCallback(async () => {
    if (!caption.trim() && !mediaUri) {
      Alert.alert('Empty Post', 'Please add a caption or media to your post.');
      return;
    }

    setIsSubmitting(true);

    try {
      let uploadedMediaUrl: string | undefined;

      if (mediaUri) {
        try {
          uploadedMediaUrl = await uploadFromUri(mediaUri);
        } catch {
          Alert.alert('Upload Failed', 'Failed to upload media. Please try again.');
          setIsSubmitting(false);
          return;
        }
      }

      const postType = uploadedMediaUrl ? PostType.IMAGE : PostType.TEXT;

      createPostMutation.mutate({
        caption: caption.trim(),
        postType,
        mediaUrl: uploadedMediaUrl,
      });

      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to create post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [caption, mediaUri, createPostMutation, uploadFromUri, router]);

  const canPost = (caption.trim().length > 0 || mediaUri) && !isSubmitting && !isUploading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={styles.headerButton}
            hitSlop={8}
            disabled={isSubmitting}
          >
            <Ionicons name="close" size={28} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>New Post</Text>
          <Pressable
            onPress={handlePost}
            style={[styles.postButton, !canPost && styles.postButtonDisabled]}
            disabled={!canPost}
            hitSlop={8}
          >
            {isSubmitting || isUploading ? (
              <ActivityIndicator size="small" color={COLORS.background} />
            ) : (
              <Text style={styles.postButtonText}>POST</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* Caption Input */}
          <TextInput
            ref={captionRef}
            style={styles.captionInput}
            value={caption}
            onChangeText={setCaption}
            placeholder="What's on your mind?"
            placeholderTextColor={COLORS.textTertiary}
            multiline
            autoFocus
            maxLength={2200}
            textAlignVertical="top"
          />

          {/* Media Preview or Picker */}
          {mediaUri ? (
            <View style={styles.mediaPreviewContainer}>
              <Image
                source={{ uri: mediaUri }}
                style={styles.mediaPreview}
                contentFit="cover"
              />
              <Pressable
                onPress={handleRemoveMedia}
                style={styles.removeMediaButton}
              >
                <Ionicons name="close-circle" size={28} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={handlePickMedia} style={styles.mediaPicker}>
              <Ionicons
                name="image-outline"
                size={40}
                color={COLORS.textTertiary}
              />
              <Text style={styles.mediaPickerText}>
                Tap to add photo or video
              </Text>
            </Pressable>
          )}

          {/* Location Indicator */}
          <View style={styles.locationRow}>
            <Ionicons
              name="location-outline"
              size={18}
              color={COLORS.textTertiary}
            />
            <Text style={styles.locationText}>
              {location
                ? 'Location will be captured'
                : 'Location unavailable'}
            </Text>
          </View>

          {/* Character Count */}
          <Text style={styles.charCount}>{caption.length}/2200</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  postButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADII.full,
    minWidth: 70,
    alignItems: 'center',
  },
  postButtonDisabled: {
    opacity: 0.4,
  },
  postButtonText: {
    ...TYPOGRAPHY.label,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: 100,
  },
  captionInput: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    minHeight: 120,
    padding: 0,
    marginBottom: SPACING.lg,
    lineHeight: 26,
    fontSize: 18,
  },
  mediaPreviewContainer: {
    position: 'relative',
    borderRadius: RADII.lg,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  mediaPreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: RADII.lg,
  },
  removeMediaButton: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 14,
  },
  mediaPicker: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    paddingVertical: SPACING.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  mediaPickerText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  locationText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
  },
  charCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    textAlign: 'right',
  },
});
