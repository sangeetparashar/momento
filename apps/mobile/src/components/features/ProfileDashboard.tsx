import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  FlatList,
  useWindowDimensions,
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
import { FONT_FAMILY_DISPLAY_BOLD, FONT_FAMILY_DISPLAY } from '@/styles/typography';
import { formatTimeAgo } from '@/utils/formatters';

interface ProfileDashboardProps {
  /** User data from useUserProfile. */
  user: any;
  /** Whether the user is a creator. */
  isCreator: boolean;
  /** Wallet balance data. */
  walletBalance?: any;
  /** Whether data is loading. */
  isLoading: boolean;
  /** Pull-to-refresh handler. */
  onRefresh: () => void;
  /** Whether currently refreshing. */
  refreshing: boolean;
  /** Settings press handler. */
  onSettingsPress: () => void;
  /** Creator's own posts. */
  creatorPosts?: any[];
  /** Whether posts are loading. */
  postsLoading?: boolean;
  /** Load more posts. */
  onLoadMorePosts?: () => void;
  /** Whether there are more posts to load. */
  hasMorePosts?: boolean;
}

/**
 * Profile dashboard with two modes:
 * - Top section: name, action buttons (WALLET / PORTFOLIO), stats
 * - Bottom section: VIEW POSTS (default) | SWAP tabs
 *
 * VIEW POSTS shows the creator's own posts so they can review/manage them.
 * SWAP shows the token swap widget.
 *
 * @see docs/design/screens/user-account-1.png
 * @see docs/design/screens/creator-account-1.png
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
  const { width: screenWidth } = useWindowDimensions();
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [contentTab, setContentTab] = useState<'posts' | 'swap'>('posts');

  const displayName = user?.displayName || user?.username || 'PROFILE';

  // Derive stats from wallet balance (placeholder fallbacks)
  const change24h = walletBalance?.change24h ?? '0';
  const earnings = walletBalance?.totalEarnings ?? '12.2K';

  const handleComingSoon = useCallback(() => {
    setShowComingSoon(true);
  }, []);

  // Creator header tabs act as action buttons
  const handleCreatorAction = useCallback((key: string) => {
    if (key === 'edit') router.push('/edit-profile');
    else if (key === 'post') router.push('/create-post');
    else if (key === 'account') onSettingsPress();
  }, [router, onSettingsPress]);

  // Render a single post row for the creator's post list
  const renderPostItem = useCallback(({ item: post }: { item: any }) => (
    <Pressable
      onPress={() => router.push(`/post/${post.id}`)}
      style={styles.postRow}
    >
      {/* Thumbnail */}
      {post.mediaUrl ? (
        <Image
          source={{ uri: post.mediaUrl }}
          style={styles.postThumb}
          contentFit="cover"
          cachePolicy="disk"
        />
      ) : (
        <View style={[styles.postThumb, styles.postThumbText]}>
          <Ionicons name="document-text-outline" size={20} color={COLORS.textTertiary} />
        </View>
      )}

      {/* Post info */}
      <View style={styles.postInfo}>
        <Text variant="bodySmall" style={styles.postCaption} numberOfLines={2}>
          {post.caption || post.content || 'Untitled post'}
        </Text>
        <Text variant="caption" style={styles.postMeta}>
          {formatTimeAgo(post.createdAt)} · {post.likeCount ?? 0} likes
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.postActions}>
        <Pressable
          onPress={() => router.push(`/post/${post.id}`)}
          hitSlop={8}
          style={styles.postActionBtn}
        >
          <Ionicons name="open-outline" size={16} color={COLORS.textSecondary} />
        </Pressable>
      </View>
    </Pressable>
  ), [router]);

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
          <View style={styles.postsSection}>
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
                  <View key={post.id}>
                    {renderPostItem({ item: post })}
                  </View>
                ))}
                {hasMorePosts && (
                  <Pressable
                    style={styles.loadMoreBtn}
                    onPress={onLoadMorePosts}
                  >
                    <Text variant="label" style={styles.loadMoreText}>
                      LOAD MORE
                    </Text>
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
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },

  // Headers
  creatorHeader: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  userHeader: {
    alignItems: 'flex-end',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
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
  },

  // Action buttons row (WALLET + PORTFOLIO)
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
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
  },

  // Posts section
  postsSection: {
    minHeight: 200,
  },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  postThumb: {
    width: 56,
    height: 56,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  postThumbText: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  postInfo: {
    flex: 1,
    gap: 4,
  },
  postCaption: {
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY,
    fontSize: 13,
  },
  postMeta: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontFamily: FONT_FAMILY_DISPLAY,
  },
  postActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  postActionBtn: {
    padding: SPACING.xs,
  },

  // Empty state
  centered: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
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
  },
});
