import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { useDeleteAccount } from '@/hooks';
import { useAuth } from '@/hooks/useAuth';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const deleteAccount = useDeleteAccount();
  const { logout } = useAuth();
  const [confirmText, setConfirmText] = useState('');

  const isConfirmed = confirmText === 'DELETE';

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleDelete = useCallback(() => {
    deleteAccount.mutate(undefined, {
      onSuccess: async () => {
        try {
          await logout();
        } catch {
          // Logout may fail if session is already cleared — continue regardless
        }
        router.replace('/login');
      },
      onError: (error) => {
        Alert.alert(
          'Delete Failed',
          error.message || 'Something went wrong. Please try again.',
        );
      },
    });
  }, [deleteAccount, logout, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleClose} style={styles.headerButton} hitSlop={8}>
          <Ionicons name="close" size={28} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Delete Account</Text>
        <View style={styles.headerButton} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Warning Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="warning" size={48} color={COLORS.error} />
        </View>

        {/* Warning Text */}
        <Text style={styles.warningTitle}>This action is permanent</Text>
        <Text style={styles.warningBody}>
          Deleting your account will permanently remove all of your data,
          including your posts, comments, likes, follows, and profile. This
          cannot be undone.
        </Text>

        {/* Confirmation Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>
            Type <Text style={styles.deleteWord}>DELETE</Text> to confirm
          </Text>
          <TextInput
            style={styles.textInput}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="Type DELETE"
            placeholderTextColor={COLORS.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleteAccount.isPending}
          />
        </View>

        {/* Delete Button */}
        <Pressable
          onPress={handleDelete}
          disabled={!isConfirmed || deleteAccount.isPending}
          style={[
            styles.deleteButton,
            (!isConfirmed || deleteAccount.isPending) && styles.deleteButtonDisabled,
          ]}
        >
          {deleteAccount.isPending ? (
            <ActivityIndicator size="small" color={COLORS.textPrimary} />
          ) : (
            <Text style={styles.deleteButtonText}>Delete My Account</Text>
          )}
        </Pressable>
      </View>
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
  content: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xxl,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  warningTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.error,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  warningBody: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  inputSection: {
    marginBottom: SPACING.xl,
  },
  inputLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  deleteWord: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.error,
    fontWeight: '800',
  },
  textInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.body,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  deleteButtonDisabled: {
    opacity: 0.4,
  },
  deleteButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
