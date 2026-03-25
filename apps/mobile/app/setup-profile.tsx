import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import { useUserProfile, useUpload } from '@/hooks';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

const SOCIAL_INPUTS = [
  { platform: 'instagram', icon: 'logo-instagram', color: '#E4405F', placeholder: 'Instagram handle' },
  { platform: 'twitter', icon: 'logo-twitter', color: '#1DA1F2', placeholder: 'Twitter / X handle' },
  { platform: 'youtube', icon: 'logo-youtube', color: '#FF0000', placeholder: 'YouTube channel' },
  { platform: 'tiktok', icon: 'logo-tiktok', color: '#000000', placeholder: 'TikTok username' },
];

export default function SetupProfileScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { user, updateProfile, isUpdating } = useUserProfile();
  const { pickAndUpload, isUploading } = useUpload();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | undefined>();
  const [socials, setSocials] = useState<Record<string, string>>({});

  // Pre-fill from existing data
  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setDisplayName(user.displayName || '');
      setAvatarUri(user.avatarUrl);
      if (user.socialLinks) {
        const links: Record<string, string> = {};
        for (const [key, value] of Object.entries(user.socialLinks as Record<string, string>)) {
          if (value) links[key] = value;
        }
        setSocials(links);
      }
    }
  }, [user]);

  const handleAvatarPick = useCallback(async () => {
    try {
      const result = await pickAndUpload({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result) setAvatarUri(result.url);
    } catch {
      Alert.alert('Error', 'Failed to upload image.');
    }
  }, [pickAndUpload]);

  const handleSocialChange = useCallback((platform: string, value: string) => {
    setSocials((prev) => ({ ...prev, [platform]: value }));
  }, []);

  const hasSocialLink = Object.values(socials).some((v) => v.trim().length > 0);
  const isValid = username.trim().length >= 3 && avatarUri && hasSocialLink;

  const handleSave = useCallback(() => {
    if (!username.trim() || username.trim().length < 3) {
      Alert.alert('Username Required', 'Please enter a username (at least 3 characters).');
      return;
    }
    if (!avatarUri) {
      Alert.alert('Photo Required', 'Please add a profile photo.');
      return;
    }
    if (!hasSocialLink) {
      Alert.alert('Social Link Required', 'Please add at least one social link.');
      return;
    }

    const cleanSocials: Record<string, string> = {};
    for (const [key, value] of Object.entries(socials)) {
      if (value.trim()) cleanSocials[key] = value.trim();
    }

    updateProfile(
      {
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        avatarUrl: avatarUri,
        socialLinks: cleanSocials,
      } as any,
      {
        onSuccess: () => {
          if (from === 'profile') {
            router.back();
          } else {
            // Route to funding onboarding before home
            router.replace('/fund-wallet-onboarding');
          }
        },
        onError: (err: Error) => {
          Alert.alert('Error', err.message || 'Failed to save profile.');
        },
      },
    );
  }, [username, displayName, avatarUri, socials, hasSocialLink, updateProfile, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Set Up Your Profile</Text>
            <Text style={styles.subtitle}>
              Complete your profile to get started. Add a photo, username, and at least one social link.
            </Text>
          </View>

          {/* Avatar */}
          <Pressable onPress={handleAvatarPick} style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person-add" size={36} color={COLORS.textTertiary} />
                </View>
              )}
              <View style={styles.avatarOverlay}>
                <Ionicons name="camera" size={20} color="#FFFFFF" />
              </View>
            </View>
            <Text style={styles.changePhotoText}>
              {isUploading ? 'Uploading...' : avatarUri ? 'Change Photo' : 'Add Photo *'}
            </Text>
          </Pressable>

          {/* Username */}
          <View style={styles.section}>
            <Text style={styles.inputLabel}>Username *</Text>
            <TextInput
              style={styles.textInput}
              value={username}
              onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="your_username"
              placeholderTextColor={COLORS.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
            />
          </View>

          {/* Display Name */}
          <View style={styles.section}>
            <Text style={styles.inputLabel}>Display Name</Text>
            <TextInput
              style={styles.textInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your Name"
              placeholderTextColor={COLORS.textTertiary}
              maxLength={50}
            />
          </View>

          {/* Social Links */}
          <View style={styles.section}>
            <Text style={styles.inputLabel}>Social Links * (at least one)</Text>
            {SOCIAL_INPUTS.map((input) => (
              <View key={input.platform} style={styles.socialInputRow}>
                <View style={[styles.socialIconBox, { backgroundColor: `${input.color}20` }]}>
                  <Ionicons name={input.icon as any} size={20} color={input.color} />
                </View>
                <TextInput
                  style={styles.socialInput}
                  value={socials[input.platform] || ''}
                  onChangeText={(text) => handleSocialChange(input.platform, text)}
                  placeholder={input.placeholder}
                  placeholderTextColor={COLORS.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          <Pressable
            onPress={handleSave}
            style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
            disabled={!isValid || isUpdating || isUploading}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color={COLORS.background} />
            ) : (
              <Text style={styles.saveButtonText}>Continue</Text>
            )}
          </Pressable>
        </View>
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
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  header: {
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '800',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  changePhotoText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: SPACING.sm,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  textInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.body,
    fontSize: 16,
  },
  socialInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  socialIconBox: {
    width: 40,
    height: 40,
    borderRadius: RADII.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.body,
    fontSize: 15,
  },
  bottomActions: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    gap: SPACING.sm,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.full,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    fontSize: 16,
  },
});
