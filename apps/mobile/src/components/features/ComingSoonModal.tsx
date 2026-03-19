import React, { useCallback } from 'react';
import { View, StyleSheet, Modal, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

interface ComingSoonModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  /** Optional creator info to show beside the buy button */
  creator?: {
    id: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
    role?: string;
  };
}

export function ComingSoonModal({
  visible,
  onClose,
  title = 'Coming Soon!',
  message = 'This feature is under development and will be available in a future update.',
  creator,
}: ComingSoonModalProps) {
  const router = useRouter();

  const handleCreatorPress = useCallback(() => {
    if (!creator) return;
    onClose();
    if (creator.role === 'CREATOR') {
      router.push(`/creator/${creator.id}`);
    } else {
      router.push(`/user/${creator.id}`);
    }
  }, [creator, onClose, router]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconContainer}>
            <Ionicons name="rocket" size={48} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {/* Creator profile row */}
          {creator && (
            <Pressable style={styles.creatorRow} onPress={handleCreatorPress}>
              <Avatar
                uri={creator.avatarUrl}
                name={creator.displayName || creator.username}
                size="sm"
              />
              <View style={styles.creatorInfo}>
                <Text style={styles.creatorName} numberOfLines={1}>
                  {creator.displayName || creator.username || 'Creator'}
                </Text>
                <Text style={styles.viewProfile}>View Profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
            </Pressable>
          )}

          <Pressable onPress={onClose} style={styles.okButton}>
            <Text style={styles.okButtonText}>OK</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  message: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 22,
    fontSize: 15,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundTertiary,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    marginBottom: SPACING.lg,
    width: '100%',
  },
  creatorInfo: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  creatorName: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  viewProfile: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
  },
  okButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl * 2,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.full,
  },
  okButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
  },
});
