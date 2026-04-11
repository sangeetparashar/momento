import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import { PillTabs, StatsCard, TokenSwapWidget } from '@/components/composites';
import { ComingSoonModal } from '@/components/features/ComingSoonModal';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { FONT_FAMILY_DISPLAY_BOLD } from '@/styles/typography';
import { formatTimeAgo } from '@/utils/formatters';

interface ProfileDashboardProps {
  user: any;
  isCreator: boolean;
  walletBalance?: any;
  isLoading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  onSettingsPress: () => void;
  creatorPosts?: any[];
  postsLoading?: boolean;
  onLoadMorePosts?: () => void;
  hasMorePosts?: boolean;
}

/**
 * Profile dashboard:
 * - Top: name, WALLET/PORTFOLIO buttons, stats
 * - Bottom: VIEW POSTS / SWAP tabs
 * - VIEW POSTS uses the same feed-style layout as creator/[id].tsx POSTS tab
 */
export function ProfileDashboard({
  user,
  isCreator,
  walletBalance,
  isLoading,
  onRefresh,
  refreshing,
  onSettingsPress,
  creatorPosts = [],
  postsLoading = false,
  onLoadMorePosts,
  hasMorePosts = false,
}: ProfileDashboardProps) {
  const router = useRouter();
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [contentTab, setContentTab] = useState<'posts' | 'swap'>('posts');

  const displayName = user?.displayName || user?.username || 'PROFILE';
  const change24h = (walletBalance as any)?.change24h ?? '0';
  const earnings = (walletBalance as any)?.totalEarnings ?? '12.2K';

  const handleComingSoon = useCallback(() => {
    setShowComingSoon(true);
  }, []);

  const handleCreatorAction = useCallback((key: string) => {
    if (key === 'edit') router.push('/edit-profile');
    else if (key === 'post') router.push('/create-post');
    else if (key === 'account') onSettingsPress();
  }, [router, onSettingsPress]);

  const handleSafeBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/profile');
    }
  }, [router]);

  return (
    <>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Header: Creator action pills OR settings gear */}
        {isCreator ? (
          <View style={styles.creatorHeader}>
            <PillTabs
              tabs={[
                { key: 'edit', label: 'Edit Profile' },
                { key: 'post', label: 'New Post' },
                { key: 'account', label: 'Account' },
              ]}
              activeTab=""
              onTabChange={handleCreatorAction}
              style={{ flex: 1 }}
            />
          </View>
        ) : (
          <View style={styles.userHeader}>
            <Pressable onPress={onSettingsPress} hitSlop={8}>
              <Ionicons name="settings-outline" size={22} color={COLORS.textSecondary} />
            </Pressable>
          </View>
        )}

        {/* User Name */}
        <Text
          variant="h1"
          align="center"
          style={styles.userName}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {displayName}
        </Text>

        {/* Action buttons: WALLET + PORTFOLIO */}
        <View style={styles.actionButtonsRow}>
          <Pressable
            style={styles.actionPill}
            onPress={() => router.push('/wallet')}
          >
            <Ionicons name="wallet-outline" size={14} color={COLORS.textPrimary} />
            <Text variant="label" style={styles.actionPillText}>WALLET</Text>
          </Pressable>
          <Pressable
            style={styles.actionPill}
            onPress={() => router.push('/portfolio')}
          >
            <Ionicons name="trending-up" size={14} color={COLORS.textPrimary} />
            <Text variant="label" style={styles.actionPillText}>PORTFOLIO</Text>
          </Pressable>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <StatsCard
            label="24H CHANGE"
            value={String(change24h)}
            variant="card"
            valueColor="positive"
            style={{ flex: 1 }}
          />
          <StatsCard
            label="EARNINGS TO DATE"
            value={String(earnings)}
            variant="card"
            valueColor="positive"
            style={{ flex: 1 }}
          />
        </View>

        {/* Content Tabs: VIEW POSTS / SWAP */}
        <PillTabs
          tabs={[
            { key: 'posts', label: 'View Posts' },
            { key: 'swap', label: 'Swap' },
          ]}
          activeTab={contentTab}
          onTabChange={(key) => setContentTab(key as 'posts' | 'swap')}
          style={{ marginBottom: SPACING.lg }}
        />

        {/* Tab Content */}
        {contentTab === 'posts' ? (
          <View>
            {postsLoading && creatorPosts.length === 0 ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : creatorPosts.length === 0 ? (
              <View style={styles.centered}>
                <Ionicons name="images-outline" size={48} color={COLORS.textTertiary} />
                <Text variant="body" style={styles.emptyText}>No posts yet</Text>
                {isCreator && (
                  <Pressable
                    style={styles.createPostCta}
                    onPress={() => router.push('/create-post')}
                  >
                    <Text variant="label" style={styles.createPostCtaText}>
                      CREATE YOUR FIRST POST
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <>
                {creatorPosts.map((post) => (
                  <Pressable
                    key={post.id}
                    onPress={() => router.push(`/post/${post.id}`)}
                    style={styles.feedPost}
                  >
                    {/* Avatar + name + time */}
                    <View style={styles.feedPostHeader}>
                      <Avatar
                        uri={user?.avatarUrl}
                        name={user?.displayName || user?.username}
                        size="sm"
                      />
                      <View style={styles.feedPostMeta}>
                        <Text style={styles.feedPostName}>
                          {user?.displayName || user?.username}
                        </Text>
                        <Text style={styles.feedPostTime}>
                          {formatTimeAgo(post.createdAt)}
                        </Text>
                      </View>
                    </View>
                    {/* Caption */}
                    {(post.caption || post.content) && (
                      <Text style={styles.feedPostCaption} numberOfLines={4}>
                        {post.caption || post.content}
                      </Text>
                    )}
                    {/* Image */}
                    {post.mediaUrl && (
                      <Image
                        source={{ uri: post.mediaUrl }}
                        style={styles.feedPostImage}
                        contentFit="cover"
                        cachePolicy="disk"
                        recyclingKey={post.mediaUrl}
                      />
                    )}
                  </Pressable>
                ))}
                {hasMorePosts && (
                  <Pressable style={styles.loadMoreBtn} onPress={onLoadMorePosts}>
                    <Text variant="label" style={styles.loadMoreText}>LOAD MORE</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        ) : (
          <View style={styles.swapSection}>
            <TokenSwapWidget
              onSelectPayToken={handleComingSoon}
              onSelectReceiveToken={handleComingSoon}
            />
          </View>
        )}
      </ScrollView>

      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        title="Trading Coming Soon!"
        message="Token trading will be available in the next update."
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SPACING.xxxl,
  },

  // Headers
  creatorHeader: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    paddingHorizontal: SPACING.lg,
  },
  userHeader: {
    alignItems: 'flex-end',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    paddingHorizontal: SPACING.lg,
  },

  // Name
  userName: {
    fontSize: 28,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },

  // Action buttons row (WALLET + PORTFOLIO)
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 8,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
    borderRadius: RADII.full,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },

  // ─── POSTS TAB (feed-style — matches creator/[id].tsx POSTS tab) ───
  feedPost: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  feedPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  feedPostMeta: {
    flex: 1,
  },
  feedPostName: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  feedPostTime: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    marginTop: 1,
  },
  feedPostCaption: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: 20,
    textTransform: 'none',
  },
  feedPostImage: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surface,
  },

  // Empty state
  centered: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  emptyText: {
    color: COLORS.textTertiary,
  },
  createPostCta: {
    marginTop: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.primary,
    borderRadius: RADII.full,
  },
  createPostCtaText: {
    color: COLORS.textInverse,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // Load more
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  loadMoreText: {
    color: COLORS.primary,
    fontSize: 11,
    letterSpacing: 1.5,
  },

  // Swap
  swapSection: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
});
