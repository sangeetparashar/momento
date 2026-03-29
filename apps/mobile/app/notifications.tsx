import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Text } from '@/components/primitives';
import { apiService } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { NOTIFICATIONS_QUERY_KEY } from '@/providers/NotificationProvider';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatTimeAgo } from '@/utils/formatters';

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any> | null;
  read: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
}

const NOTIFICATION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  new_post: 'image-outline',
  new_like: 'heart',
  new_comment: 'chatbubble',
  new_follow: 'person-add',
  creator_approval: 'shield-checkmark',
  wallet: 'wallet-outline',
};

const NOTIFICATION_ICON_COLORS: Record<string, string> = {
  new_post: COLORS.info,
  new_like: COLORS.error,
  new_comment: COLORS.primary,
  new_follow: COLORS.info,
  creator_approval: COLORS.success,
  wallet: COLORS.warning,
};

function NotificationRow({
  item,
  onPress,
}: {
  item: Notification;
  onPress: (item: Notification) => void;
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
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch notifications from server
  const notificationsQuery = useQuery<NotificationsResponse>({
    queryKey: ['notifications', user?.id],
    queryFn: () => apiService.get<NotificationsResponse>('/notifications'),
    enabled: !!user,
    staleTime: 10_000, // 10 seconds
    refetchOnMount: 'always',
  });

  const notifications = notificationsQuery.data?.notifications ?? [];
  const hasUnread = notifications.some((n) => !n.read);

  // Mark as read mutation
  const markReadMutation = useMutation({
    mutationFn: (payload: { ids?: string[]; all?: boolean }) =>
      apiService.post('/notifications', payload),
    onSuccess: () => {
      // Invalidate both the notification list AND the unread count in the provider
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY(user?.id) });
    },
  });

  const handleRefresh = useCallback(() => {
    notificationsQuery.refetch();
  }, [notificationsQuery]);

  const handleMarkAllRead = useCallback(() => {
    markReadMutation.mutate({ all: true });
  }, [markReadMutation]);

  const handlePress = useCallback(
    (item: Notification) => {
      // Mark as read
      if (!item.read) {
        markReadMutation.mutate({ ids: [item.id] });
      }

      // Navigate based on notification data
      const data = item.data;
      if (data?.postId) {
        router.push(`/post/${data.postId}`);
      } else if (data?.creatorId) {
        router.push(`/creator/${data.creatorId}`);
      } else if (item.type === 'wallet') {
        router.push('/wallet');
      }
    },
    [router, markReadMutation],
  );

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <NotificationRow item={item} onPress={handlePress} />
    ),
    [handlePress],
  );

  const keyExtractor = useCallback((item: Notification) => item.id, []);

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

      {/* Loading */}
      {notificationsQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={
            notifications.length === 0 ? styles.emptyContainer : undefined
          }
          refreshControl={
            <RefreshControl
              refreshing={notificationsQuery.isRefetching}
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
      )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
