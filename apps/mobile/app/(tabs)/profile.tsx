import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar, CoachMark } from '@/components/primitives';
import {
  ComingSoonModal,
  SettingsSheet,
  ProfileSkeleton,
  FollowingModal,
  FavoritesSkeleton,
  FundWalletModal,
  ProfileDashboard,
} from '@/components/features';
import { useUserProfile, useSavedPosts, useProfileComplete, useWalletBalance } from '@/hooks';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/providers/NotificationProvider';
import { apiService } from '@/services/api';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatNumber } from '@/utils/formatters';
import { transformMediaUrl } from '@/utils/media';
import { UserRole, SOCIAL_PLATFORMS } from '@momento/shared';

// Feature flag: set to true to use the new financial dashboard profile layout.
// Set to false to revert to the old social-media-style profile.
const USE_DASHBOARD_PROFILE = true;

const COLUMN_GAP = SPACING.sm;
const HEIGHT_PATTERN = [1.0, 1.35, 1.15, 1.0, 1.4, 1.0, 1.2, 1.0, 1.3, 1.1];

function splitMasonryColumns(posts: any[]) {
  const left: { post: any; height: number }[] = [];
  const right: { post: any; height: number }[] = [];
  let leftHeight = 0;
  let rightHeight = 0;
  posts.forEach((post, index) => {
    const h = HEIGHT_PATTERN[index % HEIGHT_PATTERN.length];
    if (leftHeight <= rightHeight) {
      left.push({ post, height: h });
      leftHeight += h;
    } else {
      right.push({ post, height: h });
      rightHeight += h;
    }
  });
  return { left, right };
}

export default function ProfileScreen() {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const ITEM_WIDTH = useMemo(() => (SCREEN_WIDTH - SPACING.md * 2 - COLUMN_GAP) / 2, [SCREEN_WIDTH]);
  const auth = useAuth();
  const { user, isLoading, refetch } = useUserProfile();
  const { data: walletBalance } = useWalletBalance();
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isCreator = user?.role === UserRole.CREATOR;
  const { isComplete: isProfileComplete } = useProfileComplete();

  // Creator's own posts
  const postsQuery = useInfiniteQuery({
    queryKey: ['creator', user?.id, 'posts'],
    queryFn: ({ pageParam }) =>
      apiService.get<{ posts: any[]; nextCursor?: string; hasMore: boolean }>(
        `/creators/${user?.id}/posts`,
        { ...(pageParam ? { cursor: pageParam as string } : {}) }
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!user?.id && isCreator,
  });

  const creatorPosts = postsQuery.data?.pages.flatMap((p) => p.posts) ?? [];

  // Saved posts for regular users
  // TODO: verify if old data is still wanted — this fires unconditionally
  // even when USE_DASHBOARD_PROFILE=true. Consider wrapping old profile
  // in a lazy component or adding an `enabled` param to useSavedPosts.
  const savedPostsQuery = useSavedPosts();

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetch(),
      isCreator ? postsQuery.refetch() : savedPostsQuery.refetch(),
    ]);
    setRefreshing(false);
  }, [refetch, isCreator, postsQuery, savedPostsQuery]);

  const handleSettingsPress = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleSettingsNavigate = useCallback(
    (route: string) => {
      setShowSettings(false);
      if (route === 'sign-out') {
        auth.logout().then(() => router.replace('/login')).catch(() => {});
      } else if (route === 'delete-account') {
        router.push('/delete-account');
      } else if (route === 'favorites') {
        router.push('/settings/favorites');
      } else if (route === 'permissions') {
        router.push('/settings/permissions');
      } else {
        setTimeout(() => setShowComingSoon(true), 300);
      }
    },
    [router, auth]
  );

  const handleSocialPress = useCallback(
    (platform: string, handle?: string) => {
      if (!handle) return;
      const config =
        SOCIAL_PLATFORMS[platform as keyof typeof SOCIAL_PLATFORMS];
      if (!config) return;
      if (platform === 'website') {
        // Website values are full URLs
        const url = handle.startsWith('http') ? handle : `https://${handle}`;
        Linking.openURL(url);
      } else if (config.urlPrefix) {
        Linking.openURL(`${config.urlPrefix}${handle}`);
      }
    },
    []
  );

  const renderSocialLinks = () => {
    if (!user?.socialLinks) return null;

    const links = Object.entries(user.socialLinks).filter(
      ([_, value]) => value
    );
    if (links.length === 0) return null;

    return (
      <View style={styles.socialLinksRow}>
        {links.map(([platform, handle]) => {
          const config =
            SOCIAL_PLATFORMS[platform as keyof typeof SOCIAL_PLATFORMS];
          if (!config) return null;
          return (
            <Pressable
              key={platform}
              onPress={() => handleSocialPress(platform, handle)}
              style={styles.socialIcon}
              hitSlop={6}
            >
              <Ionicons
                name={config.icon as any}
                size={20}
                color={config.color}
              />
            </Pressable>
          );
        })}
      </View>
    );
  };

  const postColumns = useMemo(() => splitMasonryColumns(creatorPosts), [creatorPosts]);

  const renderPostsGrid = () => {
    if (postsQuery.isLoading) {
      return <FavoritesSkeleton />;
    }
    if (creatorPosts.length === 0) {
      return (
        <View style={styles.centeredSection}>
          <Ionicons
            name="camera-outline"
            size={48}
            color={COLORS.textTertiary}
          />
          <Text style={styles.emptyText}>No posts yet</Text>
          <Text style={styles.emptySubtext}>
            Share your first momento with the world
          </Text>
        </View>
      );
    }
    return (
      <>
        <View style={styles.masonryContainer}>
          <View style={styles.masonryColumn}>
            {postColumns.left.map(({ post, height }) => (
              <Pressable
                key={post.id}
                onPress={() => router.push(`/post/${post.id}`)}
                style={[styles.masonryItem, { height: ITEM_WIDTH * height }]}
              >
                {post.mediaUrl ? (
                  <Image
                    source={{ uri: transformMediaUrl(post.mediaUrl) }}
                    style={styles.masonryImage}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="disk"
                    recyclingKey={transformMediaUrl(post.mediaUrl)}
                    placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
                  />
                ) : (
                  <View style={styles.masonryTextItem}>
                    <Text style={styles.masonryText} numberOfLines={6}>
                      {post.content || post.caption}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
          <View style={styles.masonryColumn}>
            {postColumns.right.map(({ post, height }) => (
              <Pressable
                key={post.id}
                onPress={() => router.push(`/post/${post.id}`)}
                style={[styles.masonryItem, { height: ITEM_WIDTH * height }]}
              >
                {post.mediaUrl ? (
                  <Image
                    source={{ uri: transformMediaUrl(post.mediaUrl) }}
                    style={styles.masonryImage}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="disk"
                    recyclingKey={transformMediaUrl(post.mediaUrl)}
                    placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
                  />
                ) : (
                  <View style={styles.masonryTextItem}>
                    <Text style={styles.masonryText} numberOfLines={6}>
                      {post.content || post.caption}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>
        {postsQuery.hasNextPage && (
          <Pressable
            style={styles.loadMoreRow}
            onPress={() => postsQuery.fetchNextPage()}
          >
            {postsQuery.isFetchingNextPage ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.loadMoreText}>Load more</Text>
            )}
          </Pressable>
        )}
      </>
    );
  };

  const savedColumns = useMemo(() => splitMasonryColumns(savedPostsQuery.posts), [savedPostsQuery.posts]);

  const renderSavedPosts = () => {
    if (savedPostsQuery.isLoading) {
      return <FavoritesSkeleton />;
    }
    if (savedPostsQuery.posts.length === 0) {
      return (
        <View style={styles.centeredSection}>
          <Ionicons
            name="bookmark-outline"
            size={48}
            color={COLORS.textTertiary}
          />
          <Text style={styles.emptyText}>No saved posts</Text>
          <Text style={styles.emptySubtext}>
            Posts you save will appear here
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.masonryContainer}>
        <View style={styles.masonryColumn}>
          {savedColumns.left.map(({ post, height }) => (
            <Pressable
              key={post.id}
              onPress={() => router.push(`/post/${post.id}`)}
              style={[styles.masonryItem, { height: ITEM_WIDTH * height }]}
            >
              {post.mediaUrl ? (
                <Image
                  source={{ uri: transformMediaUrl(post.mediaUrl) }}
                  style={styles.masonryImage}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="disk"
                  recyclingKey={transformMediaUrl(post.mediaUrl)}
                  placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
                />
              ) : (
                <View style={styles.masonryTextItem}>
                  <Text style={styles.masonryText} numberOfLines={6}>
                    {post.content || post.caption}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
        <View style={styles.masonryColumn}>
          {savedColumns.right.map(({ post, height }) => (
            <Pressable
              key={post.id}
              onPress={() => router.push(`/post/${post.id}`)}
              style={[styles.masonryItem, { height: ITEM_WIDTH * height }]}
            >
              {post.mediaUrl ? (
                <Image
                  source={{ uri: transformMediaUrl(post.mediaUrl) }}
                  style={styles.masonryImage}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="disk"
                  recyclingKey={transformMediaUrl(post.mediaUrl)}
                  placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
                />
              ) : (
                <View style={styles.masonryTextItem}>
                  <Text style={styles.masonryText} numberOfLines={6}>
                    {post.content || post.caption}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const renderCreatorContent = () => (
    <>
      {/* Grid section header */}
      <View style={styles.gridHeader}>
        <View style={styles.gridHeaderTab}>
          <Ionicons name="grid-outline" size={22} color={COLORS.textPrimary} />
        </View>
      </View>
      <View style={styles.gridDivider} />
      {renderPostsGrid()}
    </>
  );

  const renderUserContent = () => (
    <>
      {/* Become a creator CTA */}
      <View style={styles.ctaSection}>
        <Ionicons
          name="sparkles-outline"
          size={32}
          color={COLORS.primary}
        />
        <Text style={styles.ctaTitle}>Become a Creator</Text>
        <Text style={styles.ctaSubtext}>
          Start sharing momentos and build your audience
        </Text>
        <Pressable
          style={styles.ctaButton}
          onPress={() => router.push('/edit-profile')}
        >
          <Text style={styles.ctaButtonText}>Apply Now</Text>
        </Pressable>
      </View>

      {/* Saved posts section */}
      <View style={styles.gridHeader}>
        <View style={styles.gridHeaderTab}>
          <Ionicons
            name="bookmark-outline"
            size={22}
            color={COLORS.textPrimary}
          />
          <Text style={styles.gridHeaderLabel}>Saved</Text>
        </View>
      </View>
      <View style={styles.gridDivider} />
      {renderSavedPosts()}
    </>
  );

  // ─── NEW: Financial Dashboard Profile ───
  if (USE_DASHBOARD_PROFILE) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {isLoading && !user ? (
          <ProfileSkeleton />
        ) : (
          <ProfileDashboard
            user={user}
            isCreator={isCreator}
            walletBalance={walletBalance}
            isLoading={isLoading}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            onSettingsPress={handleSettingsPress}
            creatorPosts={creatorPosts}
            postsLoading={postsQuery.isLoading}
            onLoadMorePosts={() => {
              if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) {
                postsQuery.fetchNextPage();
              }
            }}
            hasMorePosts={!!postsQuery.hasNextPage}
          />
        )}

        <SettingsSheet
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          onNavigate={handleSettingsNavigate}
        />
        <ComingSoonModal
          visible={showComingSoon}
          onClose={() => setShowComingSoon(false)}
        />
        <FollowingModal
          visible={showFollowing}
          onClose={() => setShowFollowing(false)}
        />
      </SafeAreaView>
    );
  }

  // ─── OLD: Social-media-style profile (kept for fallback) ───
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header bar */}
      <View style={styles.header}>
        <Text style={styles.headerUsername}>
          {user?.username || 'Profile'}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push('/notifications')}
            style={styles.bellButton}
            hitSlop={8}
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={COLORS.textSecondary}
            />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={handleSettingsPress} hitSlop={8}>
            <Ionicons
              name="menu-outline"
              size={26}
              color={COLORS.textPrimary}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {isLoading && !user ? (
          <ProfileSkeleton />
        ) : (
          <>
            {/* Profile setup prompt */}
            {!isProfileComplete && (
              <Pressable
                style={styles.setupBanner}
                onPress={() => router.push({ pathname: '/setup-profile', params: { from: 'profile' } })}
              >
                <Ionicons name="person-circle-outline" size={28} color={COLORS.primary} />
                <View style={styles.setupBannerText}>
                  <Text style={styles.setupBannerTitle}>Complete Your Profile</Text>
                  <Text style={styles.setupBannerSubtitle}>
                    Add a photo, username, and social link
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
              </Pressable>
            )}

            {/* Avatar + Stats row */}
            <View style={styles.profileRow}>
              <Avatar
                uri={user?.avatarUrl}
                name={user?.displayName || user?.username}
                size="xl"
              />
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>
                    {formatNumber(user?.postCount ?? 0)}
                  </Text>
                  <Text style={styles.statLabel}>Posts</Text>
                </View>
                {isCreator && (
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>
                      {formatNumber(user?.followerCount ?? 0)}
                    </Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </View>
                )}
                <Pressable style={styles.statItem} onPress={() => setShowFollowing(true)}>
                  <Text style={styles.statNumber}>
                    {formatNumber(user?.followingCount ?? 0)}
                  </Text>
                  <Text style={styles.statLabel}>Following</Text>
                </Pressable>
              </View>
            </View>

            {/* Display name */}
            <View style={styles.infoSection}>
              <Text style={styles.displayName}>
                {user?.displayName || user?.username || ''}
              </Text>
              {user?.bio ? (
                <Text style={styles.bioText}>{user.bio}</Text>
              ) : null}
            </View>

            {/* Social links */}
            {renderSocialLinks()}

            {/* Action buttons */}
            <CoachMark
              hintId="profile_edit"
              text="Tap to customize your profile"
              position="top"
            >
            <View style={styles.actionRow}>
              <Pressable
                style={styles.actionButton}
                onPress={() => router.push('/edit-profile')}
              >
                <Text style={styles.actionButtonText}>Edit Profile</Text>
              </Pressable>
              {isCreator && (
                <Pressable
                  style={[styles.actionButton, styles.actionButtonPrimary]}
                  onPress={() => router.push('/create-post')}
                >
                  <Text style={styles.actionButtonTextPrimary}>
                    Create Post
                  </Text>
                </Pressable>
              )}
              <Pressable
                style={styles.actionButton}
                onPress={() => router.push('/wallet')}
              >
                <Ionicons
                  name="wallet-outline"
                  size={16}
                  color={COLORS.textPrimary}
                />
              </Pressable>
            </View>
            </CoachMark>

            {/* Fund wallet CTA — shown when balance is near zero */}
            {walletBalance && walletBalance.totalValueUsd < 1 && (
              <Pressable style={styles.fundCta} onPress={() => setShowFundModal(true)}>
                <Ionicons name="wallet-outline" size={20} color={COLORS.primary} />
                <Text style={styles.fundCtaText}>Fund your wallet to start trading</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
              </Pressable>
            )}

            {/* Content sections */}
            {isCreator ? renderCreatorContent() : renderUserContent()}

            <View style={styles.bottomSpacer} />
          </>
        )}
      </ScrollView>

      {/* Modals */}
      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
      />
      <SettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onNavigate={handleSettingsNavigate}
      />
      <FollowingModal
        visible={showFollowing}
        onClose={() => setShowFollowing(false)}
      />
      <FundWalletModal
        visible={showFundModal}
        onClose={() => setShowFundModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  fundCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    gap: SPACING.sm,
  },
  fundCtaText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    flex: 1,
  },

  // Header bar
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  headerUsername: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  bellButton: {
    position: 'relative',
    padding: SPACING.xs,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  // Avatar + Stats row
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    gap: SPACING.xl,
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 18,
  },
  statLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Info section
  infoSection: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  displayName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  bioText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    lineHeight: 20,
  },

  // Social links
  socialLinksRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: SPACING.md,
  },
  socialIcon: {
    width: 32,
    height: 32,
    borderRadius: RADII.full,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  actionButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionButtonPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  actionButtonText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  actionButtonTextPrimary: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textInverse,
    fontWeight: '600',
  },

  // Grid header
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: SPACING.xl,
  },
  gridHeaderTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.textPrimary,
    paddingHorizontal: SPACING.lg,
  },
  gridHeaderLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  gridDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },

  // Masonry grid
  masonryContainer: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  masonryColumn: {
    flex: 1,
    gap: COLUMN_GAP,
  },
  masonryItem: {
    borderRadius: RADII.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  masonryImage: {
    width: '100%',
    height: '100%',
  },
  masonryTextItem: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    justifyContent: 'center',
  },
  masonryText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },

  // Empty / centered
  centeredSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  emptySubtext: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
  },

  // CTA section
  ctaSection: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    gap: SPACING.sm,
  },
  ctaTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  ctaSubtext: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  ctaButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.full,
    marginTop: SPACING.sm,
  },
  ctaButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textInverse,
    fontWeight: '700',
  },

  // Load more
  loadMoreRow: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  loadMoreText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '600',
  },

  bottomSpacer: {
    height: SPACING.xl,
  },
  setupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    gap: SPACING.sm,
  },
  setupBannerText: {
    flex: 1,
  },
  setupBannerTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  setupBannerSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
});
