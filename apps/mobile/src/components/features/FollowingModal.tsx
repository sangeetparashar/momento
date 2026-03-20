import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import { FollowingListSkeleton } from './FollowingListSkeleton';
import { apiService } from '@/services/api';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

interface FollowingUser {
  id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  role: string;
  tokenSymbol?: string;
}

interface FollowingModalProps {
  visible: boolean;
  onClose: () => void;
}

export function FollowingModal({ visible, onClose }: FollowingModalProps) {
  const router = useRouter();
  const [users, setUsers] = useState<FollowingUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [unfollowing, setUnfollowing] = useState<string | null>(null);

  const fetchFollowing = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<{ users: FollowingUser[] }>('/users/me/following');
      setUsers(res.users);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) fetchFollowing();
  }, [visible, fetchFollowing]);

  const handleUnfollow = useCallback(
    async (userId: string, name: string) => {
      Alert.alert('Unfollow', `Unfollow ${name}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            setUnfollowing(userId);
            try {
              await apiService.post(`/creators/${userId}/follow`);
              setUsers((prev) => prev.filter((u) => u.id !== userId));
            } catch {
              Alert.alert('Error', 'Failed to unfollow');
            } finally {
              setUnfollowing(null);
            }
          },
        },
      ]);
    },
    []
  );

  const handleUserPress = useCallback(
    (userId: string, role: string) => {
      onClose();
      if (role === 'CREATOR') {
        router.push(`/creator/${userId}`);
      } else {
        router.push(`/user/${userId}`);
      }
    },
    [router, onClose]
  );

  const renderItem = useCallback(
    ({ item }: { item: FollowingUser }) => (
      <View style={styles.userRow}>
        <Pressable
          style={styles.userInfo}
          onPress={() => handleUserPress(item.id, item.role)}
        >
          <Avatar
            uri={item.avatarUrl}
            name={item.displayName || item.username}
            size="md"
          />
          <View style={styles.nameSection}>
            <Text style={styles.displayName} numberOfLines={1}>
              {item.displayName || item.username || 'User'}
            </Text>
            {item.username && (
              <Text style={styles.username} numberOfLines={1}>
                @{item.username}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable
          style={styles.unfollowButton}
          onPress={() =>
            handleUnfollow(item.id, item.displayName || item.username || 'this user')
          }
          disabled={unfollowing === item.id}
        >
          {unfollowing === item.id ? (
            <ActivityIndicator size="small" color={COLORS.textTertiary} />
          ) : (
            <Text style={styles.unfollowText}>Unfollow</Text>
          )}
        </Pressable>
      </View>
    ),
    [handleUserPress, handleUnfollow, unfollowing]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Following</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
            </Pressable>
          </View>

          {/* Content */}
          {loading ? (
            <FollowingListSkeleton />
          ) : users.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons
                name="people-outline"
                size={48}
                color={COLORS.textTertiary}
              />
              <Text style={styles.emptyText}>Not following anyone yet</Text>
            </View>
          ) : (
            <FlatList
              data={users}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    maxHeight: '75%',
    minHeight: 300,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
  },
  listContent: {
    paddingVertical: SPACING.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameSection: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  displayName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  username: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
  },
  unfollowButton: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm - 2,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 80,
    alignItems: 'center',
  },
  unfollowText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
