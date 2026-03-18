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
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import { useUserProfile, useKyc, useUpload } from '@/hooks';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { KycStatus, UserRole, SOCIAL_PLATFORMS } from '@momento/shared';
import { useQueryClient } from '@tanstack/react-query';

interface SocialInput {
  platform: string;
  icon: string;
  color: string;
  value: string;
  placeholder: string;
}

export default function EditProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, updateProfile, isUpdating } = useUserProfile();
  const kycMutation = useKyc();
  const isCreator = user?.role === UserRole.CREATOR;
  const { pickAndUpload, isUploading } = useUpload();

  const [displayName, setDisplayName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | undefined>();
  const [socialInputs, setSocialInputs] = useState<SocialInput[]>([
    {
      platform: 'youtube',
      icon: 'logo-youtube',
      color: '#FF0000',
      value: '',
      placeholder: 'YouTube channel',
    },
    {
      platform: 'instagram',
      icon: 'logo-instagram',
      color: '#E4405F',
      value: '',
      placeholder: 'Instagram handle',
    },
    {
      platform: 'twitter',
      icon: 'logo-twitter',
      color: '#1DA1F2',
      value: '',
      placeholder: 'Twitter handle',
    },
  ]);

  // Populate from existing user data
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setTokenSymbol(user.tokenSymbol || '');
      setBio(user.bio || '');
      setAvatarUri(user.avatarUrl);
      if (user.socialLinks) {
        setSocialInputs((prev) =>
          prev.map((input) => ({
            ...input,
            value:
              (user.socialLinks as any)?.[input.platform] || input.value,
          }))
        );
      }
    }
  }, [user]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleSave = useCallback(() => {
    const socialLinks: Record<string, string> = {};
    socialInputs.forEach((input) => {
      if (input.value.trim()) {
        socialLinks[input.platform] = input.value.trim();
      }
    });

    const payload: Record<string, unknown> = {
      displayName: displayName.trim(),
      bio: bio.trim(),
      socialLinks,
      avatarUrl: avatarUri,
    };

    if (isCreator) {
      payload.tokenSymbol = tokenSymbol.trim();
    }

    updateProfile(
      payload as any,
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['userProfile'] });
          router.back();
        },
      }
    );
  }, [
    displayName,
    bio,
    avatarUri,
    socialInputs,
    tokenSymbol,
    isCreator,
    updateProfile,
    queryClient,
    router,
  ]);

  const handleAvatarPick = useCallback(async () => {
    try {
      const result = await pickAndUpload({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result) {
        setAvatarUri(result.url);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to upload image.');
    }
  }, [pickAndUpload]);

  const handleSocialChange = useCallback(
    (platform: string, value: string) => {
      setSocialInputs((prev) =>
        prev.map((input) =>
          input.platform === platform ? { ...input, value } : input
        )
      );
    },
    []
  );

  const handleStartKyc = useCallback(() => {
    kycMutation.mutate({
      tokenSymbol: tokenSymbol || 'TOKEN',
      applicationText: 'Creator verification request',
    });
  }, [kycMutation, tokenSymbol]);

  const getKycStatusDisplay = () => {
    const status = user?.kycStatus || KycStatus.NONE;
    switch (status) {
      case KycStatus.VERIFIED:
        return { text: 'VERIFIED', color: COLORS.success, icon: 'checkmark-circle' as const };
      case KycStatus.PENDING:
        return { text: 'PENDING', color: '#FFA500', icon: 'time' as const };
      case KycStatus.REJECTED:
        return { text: 'REJECTED', color: COLORS.error, icon: 'close-circle' as const };
      default:
        return null;
    }
  };

  const kycDisplay = getKycStatusDisplay();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleClose} style={styles.headerButton} hitSlop={8}>
          <Ionicons name="close" size={28} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <Pressable
          onPress={handleSave}
          style={styles.headerButton}
          disabled={isUpdating}
          hitSlop={8}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar */}
        <Pressable onPress={handleAvatarPick} style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.avatarImage}
                contentFit="cover"
              />
            ) : (
              <Avatar
                uri={undefined}
                name={displayName || '?'}
                size="xl"
              />
            )}
            <View style={styles.avatarOverlay}>
              <Ionicons name="camera" size={24} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.changePhotoText}>
            {isUploading ? 'Uploading...' : 'Change Photo'}
          </Text>
        </Pressable>

        {/* Social Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Social Links</Text>
          {socialInputs.map((input) => (
            <View key={input.platform} style={styles.socialInputRow}>
              <View
                style={[styles.socialIconBox, { backgroundColor: `${input.color}20` }]}
              >
                <Ionicons
                  name={input.icon as any}
                  size={20}
                  color={input.color}
                />
              </View>
              <TextInput
                style={styles.socialInput}
                value={input.value}
                onChangeText={(text) =>
                  handleSocialChange(input.platform, text)
                }
                placeholder={input.placeholder}
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ))}
        </View>

        {/* Profile Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Info</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your display name"
              placeholderTextColor={COLORS.textTertiary}
            />
          </View>

          {isCreator && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Token Symbol</Text>
              <TextInput
                style={styles.textInput}
                value={tokenSymbol}
                onChangeText={(text) =>
                  setTokenSymbol(text.toUpperCase().slice(0, 5))
                }
                placeholder="e.g. DEEL"
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="characters"
                maxLength={5}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Bio</Text>
            <TextInput
              style={[styles.textInput, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell us about yourself..."
              placeholderTextColor={COLORS.textTertiary}
              multiline
              textAlignVertical="top"
              maxLength={300}
            />
            <Text style={styles.charCount}>{bio.length}/300</Text>
          </View>
        </View>

        {/* KYC Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification</Text>
          {kycDisplay ? (
            <View style={styles.kycStatusRow}>
              <Ionicons
                name={kycDisplay.icon}
                size={24}
                color={kycDisplay.color}
              />
              <Text style={[styles.kycStatusText, { color: kycDisplay.color }]}>
                {kycDisplay.text}
              </Text>
            </View>
          ) : (
            <Pressable onPress={handleStartKyc} style={styles.verifyButton}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={COLORS.primary}
              />
              <Text style={styles.verifyButtonText}>GET VERIFIED</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.bottomSpacer} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerButton: {
    padding: SPACING.xs,
    minWidth: 50,
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  saveText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 1,
    marginBottom: SPACING.md,
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
  inputGroup: {
    marginBottom: SPACING.md,
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
    fontSize: 15,
  },
  bioInput: {
    minHeight: 100,
    paddingTop: SPACING.sm + 2,
  },
  charCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  kycStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: RADII.lg,
  },
  kycStatusText: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    letterSpacing: 1,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.lg,
  },
  verifyButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '700',
    letterSpacing: 1,
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
});
