import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatTimeAgo } from '@/utils/formatters';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  type StoredNotification,
} from '@/services/notificationStorage';
import { useNotifications } from '@/providers/NotificationProvider';

const NOTIFICATION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  post: 'image-outline',
  like: 'heart',
  comment: 'chatbubble',
  follow: 'person-add',
  kyc: 'shield-checkmark',
  creator: 'person-outline',
  wallet: 'wallet-outline',
};

const NOTIFICATION_ICON_COLORS: Record<string, string> = {
  post: COLORS.info,
  like: COLORS.error,
  comment: COLORS.primary,
  follow: COLORS.info,
  kyc: COLORS.success,
  creator: COLORS.info,
  wallet: COLORS.warning,
};

function NotificationRow({
  item,
  onPress,
}: {
  item: StoredNotification;
  onPress: (item: StoredNotification) => void;
}) {
  const iconName = NOTIFICATION_ICONS[item.type] || 'notifications-outline';
  const iconColor = NOTIFICATION_ICON_COLORS[item.type] || COLORS.textSecondary;

  return (
    <Pressable
      style={[styles.row, !item.read && styles.rowUnread]}
      onPress={() => onPress(item)}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${iconColor}20` }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>

      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.rowBody} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.rowTime}>{formatTimeAgo(item.createdAt)}</Text>
      </View>

      {!item.read && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { refreshUnreadCount } = useNotifications();
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    const data = await getNotifications();
    setNotifications(data);
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  const handleMarkAllRead = useCallback(async () => {
    await markAllAsRead();
    await loadNotifications();
    refreshUnreadCount();
  }, [loadNotifications, refreshUnreadCount]);

  const handlePress = useCallback(
    async (item: StoredNotification) => {
      if (!item.read) {
        await markAsRead(item.id);
        await loadNotifications();
        refreshUnreadCount();
      }

      // Navigate based on notification data
      const data = item.data;
      if (data?.postId) {
        router.push(`/post/${data.postId}`);
      } else if (data?.creatorId) {
        router.push(`/creator/${data.creatorId}`);
      } else if (data?.type === 'wallet') {
        router.push('/wallet');
      }
    },
    [router, loadNotifications, refreshUnreadCount],
  );

  const renderItem = useCallback(
    ({ item }: { item: StoredNotification }) => (
      <NotificationRow item={item} onPress={handlePress} />
    ),
    [handlePress],
  );

  const keyExtractor = useCallback((item: StoredNotification) => item.id, []);

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </Pressable>

        <Text style={styles.headerTitle}>Notifications</Text>

        {hasUnread ? (
          <Pressable onPress={handleMarkAllRead} hitSlop={8} style={styles.markAllButton}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        ) : (
          <View style={styles.markAllButton} />
        )}
      </View>

      {/* List */}
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={
          notifications.length === 0 ? styles.emptyContainer : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name="notifications-outline"
              size={56}
              color={COLORS.textTertiary}
            />
            <Text style={styles.emptyText}>No notifications yet</Text>
            <Text style={styles.emptySubtext}>
              When you get likes, comments, or follows they'll show up here
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  markAllButton: {
    width: 90,
    alignItems: 'flex-end',
  },
  markAllText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  rowUnread: {
    backgroundColor: COLORS.primaryMuted,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContent: {
    flex: 1,
    marginLeft: SPACING.md,
    marginRight: SPACING.sm,
  },
  rowTitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  rowBody: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  rowTime: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    marginTop: 4,
    fontSize: 11,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: SPACING.lg + 40 + SPACING.md, // align with content
  },

  // Empty state
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: SPACING.lg,
  },
  emptySubtext: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});
