import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, FormField } from '@/components/primitives';
import { PercentSlider } from '@/components/composites';
import { useLaunchWizard } from '@/hooks/useLaunchWizard';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile, useUpload } from '@/hooks';
import { UserRole } from '@momento/shared';
import { COLORS, SPACING, RADII } from '@/styles/theme';

export default function LaunchBasicsScreen() {
  const router = useRouter();
  const { walletAddress } = useAuth();
  const { user } = useUserProfile();
  const { draft, patch, validateStep } = useLaunchWizard();
  const { uploadFromUri, isUploading } = useUpload();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isCreator = user?.role === UserRole.CREATOR;
  const alreadyLaunched = !!user?.tokenMint;

  const pickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const url = await uploadFromUri(result.assets[0].uri, result.assets[0].mimeType ?? undefined);
      patch({ imageUrl: url });
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message ?? 'Could not upload image.');
    }
  }, [uploadFromUri, patch]);

  const handleNext = useCallback(() => {
    const e = validateStep('basics');
    setErrors(e);
    if (Object.keys(e).length === 0) router.push('/launch/fees');
  }, [validateStep, router]);

  // ── Guards ──
  if (user && !isCreator) {
    return (
      <GuardView
        icon="person-outline"
        title="CREATORS ONLY"
        message="Launching a token is a creator feature. Switch your account to creator mode to continue."
        ctaLabel="GO BACK"
        onPress={() => router.back()}
      />
    );
  }
  if (alreadyLaunched) {
    return (
      <GuardView
        icon="checkmark-circle"
        title="TOKEN ALREADY LIVE"
        message={`You've already launched $${user?.tokenSymbol ?? 'your token'}. Each creator can launch one token.`}
        ctaLabel="MANAGE TOKEN"
        onPress={() => router.replace(`/token/${user?.tokenMint}`)}
      />
    );
  }
  if (!walletAddress) {
    return (
      <GuardView
        icon="wallet-outline"
        title="WALLET NOT READY"
        message="Your Momento wallet is still setting up. Try again in a moment."
        ctaLabel="GO BACK"
        onPress={() => router.back()}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="label" style={styles.intro}>
          NAME YOUR TOKEN AND ADD AN IMAGE. THESE ARE PERMANENT ONCE LAUNCHED.
        </Text>

        {/* Image picker */}
        <Pressable
          onPress={pickImage}
          style={styles.imagePicker}
          disabled={isUploading}
          accessibilityRole="button"
          accessibilityLabel="Add token image"
        >
          {draft.imageUrl ? (
            <Image source={{ uri: draft.imageUrl }} style={styles.image} contentFit="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons
                name={isUploading ? 'cloud-upload-outline' : 'image-outline'}
                size={32}
                color={COLORS.textTertiary}
              />
              <Text variant="caption" style={styles.imageHint}>
                {isUploading ? 'UPLOADING…' : 'ADD TOKEN IMAGE'}
              </Text>
            </View>
          )}
        </Pressable>

        <FormField
          label="NAME"
          value={draft.name}
          onChangeText={(t) => patch({ name: t })}
          placeholder="Deel Token"
          maxLength={32}
          counterMax={32}
          error={errors.name}
          autoCapitalize="words"
        />

        <FormField
          label="SYMBOL"
          value={draft.symbol}
          onChangeText={(t) => patch({ symbol: t.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
          placeholder="DEEL"
          maxLength={10}
          counterMax={10}
          affix="$"
          error={errors.symbol}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <FormField
          label="DESCRIPTION"
          value={draft.description}
          onChangeText={(t) => patch({ description: t })}
          placeholder="What is this token about?"
          multiline
          numberOfLines={3}
          maxLength={2000}
          counterMax={2000}
          error={errors.description}
        />

        <FormField
          label="TOTAL SUPPLY"
          value={draft.totalSupply}
          onChangeText={(t) => patch({ totalSupply: t.replace(/[^0-9]/g, '') })}
          placeholder="1000000000"
          keyboardType="number-pad"
          affix="TOKENS"
          error={errors.totalSupply}
        />

        <View style={styles.section}>
          <PercentSlider
            label="DECIMALS"
            value={draft.decimals}
            min={6}
            max={9}
            step={1}
            suffix=""
            onChange={(v) => patch({ decimals: v })}
          />
          {errors.decimals ? (
            <Text variant="caption" style={styles.error}>
              {errors.decimals}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="NEXT" fullWidth onPress={handleNext} disabled={isUploading} />
      </View>
    </KeyboardAvoidingView>
  );
}

function GuardView({
  icon,
  title,
  message,
  ctaLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  ctaLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.guard}>
      <Ionicons name={icon} size={48} color={COLORS.textTertiary} />
      <Text variant="h3" style={styles.guardTitle}>
        {title}
      </Text>
      <Text variant="bodySmall" style={styles.guardMessage}>
        {message}
      </Text>
      <Button label={ctaLabel} variant="secondary" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  intro: {
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.lg,
  },
  imagePicker: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: RADII.lg,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
  },
  imageHint: {
    color: COLORS.textTertiary,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  error: {
    color: COLORS.error,
    marginTop: SPACING.xs,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  guard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    padding: SPACING.xl,
  },
  guardTitle: {
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  guardMessage: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
});
