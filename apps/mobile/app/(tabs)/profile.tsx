import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import {
  ComingSoonModal,
  SettingsSheet,
  ProfileSkeleton,
} from '@/components/features';
import { useUserProfile, useSavedPosts } from '@/hooks';
import { apiService } from '@/services/api';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatNumber } from '@/utils/formatters';
import { UserRole, SOCIAL_PLATFORMS } from '@momento/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 2;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - GRID_GAP * 2) / 3;

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isLoading, refetch } = useUserProfile();
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isCreator = user?.role === UserRole.CREATOR;

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
      if (route === 'delete-account') {
        router.push('/delete-account');
      } else if (route === 'favorites') {
        router.push('/settings/favorites');
      } else if (route === 'permissions') {
        router.push('/settings/permissions');
      } else {
        setTimeout(() => setShowComingSoon(true), 300);
      }
    },
    [router]
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

  const renderPostsGrid = () => {
    if (postsQuery.isLoading) {
      return (
        <View style={styles.centeredSection}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
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
      <View style={styles.postsGrid}>
        {creatorPosts.map((post) => (
          <Pressable
            key={post.id}
            onPress={() => router.push(`/post/${post.id}`)}
            style={styles.gridItem}
          >
            {post.mediaUrl ? (
              <Image
                source={{ uri: post.mediaUrl }}
                style={styles.gridImage}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={styles.gridTextItem}>
                <Text style={styles.gridText} numberOfLines={4}>
                  {post.content || post.caption}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
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
      </View>
    );
  };

  const renderSavedPosts = () => {
    if (savedPostsQuery.isLoading) {
      return (
        <View style={styles.centeredSection}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
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
      <View style={styles.postsGrid}>
        {savedPostsQuery.posts.map((post) => (
          <Pressable
            key={post.id}
            onPress={() => router.push(`/post/${post.id}`)}
            style={styles.gridItem}
          >
            {post.mediaUrl ? (
              <Image
                source={{ uri: post.mediaUrl }}
                style={styles.gridImage}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={styles.gridTextItem}>
                <Text style={styles.gridText} numberOfLines={4}>
                  {post.content || post.caption}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header bar */}
      <View style={styles.header}>
        <Text style={styles.headerUsername}>
          {user?.username || 'Profile'}
        </Text>
        <Pressable onPress={handleSettingsPress} hitSlop={8}>
          <Ionicons
            name="menu-outline"
            size={26}
            color={COLORS.textPrimary}
          />
        </Pressable>
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
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>
                    {formatNumber(user?.followingCount ?? 0)}
                  </Text>
                  <Text style={styles.statLabel}>Following</Text>
                </View>
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

  // Posts grid
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    padding: GRID_GAP / 2,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridTextItem: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    justifyContent: 'center',
  },
  gridText: {
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
});
