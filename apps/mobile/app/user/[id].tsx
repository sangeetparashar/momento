import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import { ComingSoonModal } from '@/components/features';
import { usePublicProfile, useCreatorProfile } from '@/hooks';
import { apiService } from '@/services/api';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatNumber } from '@/utils/formatters';
import { SOCIAL_PLATFORMS } from '@momento/shared';
import { UserRole } from '@momento/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 2;
const GRID_COLUMNS = 3;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLUMNS + 1)) / GRID_COLUMNS;

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile, isLoading } = usePublicProfile(id);
  const [showComingSoon, setShowComingSoon] = useState(false);

  const isCreator = profile?.role === UserRole.CREATOR || profile?.role === 'CREATOR';

  // Only use creator profile hook for follow functionality if the user is a creator
  const {
    isFollowing,
    toggleFollow,
  } = useCreatorProfile(isCreator ? id : undefined);

  // Only load posts if the user is a creator
  const postsQuery = useInfiniteQuery({
    queryKey: ['creator', id, 'posts'],
    queryFn: ({ pageParam }) =>
      apiService.get<{ posts: any[]; nextCursor?: string; hasMore: boolean }>(
        `/creators/${id}/posts`,
        { ...(pageParam ? { cursor: pageParam as string } : {}) }
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!id && isCreator,
  });

  const creatorPosts = postsQuery.data?.pages.flatMap(p => p.posts) ?? [];

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleBuy = useCallback(() => {
    setShowComingSoon(true);
  }, []);

  const handleSocialPress = useCallback(
    (platform: string, handle?: string) => {
      if (!handle) return;
      const config = SOCIAL_PLATFORMS[platform as keyof typeof SOCIAL_PLATFORMS];
      if (config?.urlPrefix) {
        Linking.openURL(`${config.urlPrefix}${handle}`);
      }
    },
    []
  );

  const handleEndReached = useCallback(() => {
    if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) {
      postsQuery.fetchNextPage();
    }
  }, [postsQuery]);

  const renderSocialLinks = () => {
    if (!profile?.socialLinks) return null;

    const links = Object.entries(profile.socialLinks).filter(
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
              onPress={() => handleSocialPress(platform, handle as string)}
              style={styles.socialIcon}
            >
              <Ionicons
                name={config.icon as any}
                size={22}
                color={config.color}
              />
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderStats = () => {
    if (isCreator) {
      return (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {formatNumber(profile?.followingCount ?? 0)}
            </Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {formatNumber(profile?.followerCount ?? 0)}
            </Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {formatNumber(profile?.postCount ?? 0)}
            </Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>
            {formatNumber(profile?.followingCount ?? 0)}
          </Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
      </View>
    );
  };

  const renderPostsGrid = () => {
    if (postsQuery.isLoading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }

    if (creatorPosts.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={48} color={COLORS.textTertiary} />
          <Text style={styles.emptyText}>No posts yet</Text>
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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.navBar}>
          <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.navTitle}>Profile</Text>
          <View style={styles.navSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Navigation */}
      <View style={styles.navBar}>
        <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>
          {profile?.username || 'User'}
        </Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
          if (!isCreator) return;
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const isCloseToBottom =
            layoutMeasurement.height + contentOffset.y >= contentSize.height - 400;
          if (isCloseToBottom) handleEndReached();
        }}
        scrollEventThrottle={400}
      >
        {/* Avatar (large, centered) */}
        <View style={styles.avatarContainer}>
          <Avatar
            uri={profile?.avatarUrl}
            name={profile?.displayName || profile?.username}
            size="xl"
          />
        </View>

        {/* Display Name */}
        <Text style={styles.displayName}>
          {profile?.displayName || profile?.username || 'User'}
        </Text>

        {/* Bio */}
        {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        {/* Social Links */}
        <View style={styles.socialSection}>{renderSocialLinks()}</View>

        {/* Stats */}
        {renderStats()}

        {/* Creator-specific: follow + buy buttons */}
        {isCreator && (
          <View style={styles.actionButtons}>
            <Pressable
              onPress={toggleFollow}
              style={[
                styles.followButton,
                isFollowing && styles.followingButton,
              ]}
            >
              <Text
                style={[
                  styles.followButtonText,
                  isFollowing && styles.followingButtonText,
                ]}
              >
                {isFollowing ? 'FOLLOWING' : 'FOLLOW'}
              </Text>
            </Pressable>
            <Pressable onPress={handleBuy} style={styles.buyButton}>
              <Text style={styles.buyButtonText}>BUY</Text>
            </Pressable>
          </View>
        )}

        {/* Creator posts grid */}
        {isCreator && (
          <View style={styles.postsSection}>
            <Text style={styles.postsSectionTitle}>Posts</Text>
            {renderPostsGrid()}
          </View>
        )}

        {/* Loading more indicator */}
        {postsQuery.isFetchingNextPage && (
          <View style={styles.loadingMore}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        )}
      </ScrollView>

      {/* Coming Soon Modal */}
      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        title="Trading Coming Soon!"
        message="Token trading will be available in the next update."
        creator={profile ? {
          id: profile.id,
          displayName: profile.displayName,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          role: profile.role,
        } : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  backButton: {
    padding: SPACING.xs,
    width: 36,
  },
  navTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  navSpacer: {
    width: 36,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  displayName: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  bio: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    lineHeight: 22,
  },
  socialSection: {
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  socialLinksRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  socialIcon: {
    padding: SPACING.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    paddingVertical: SPACING.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  statLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  followButton: {
    flex: 1,
    backgroundColor: COLORS.textPrimary,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADII.full,
    alignItems: 'center',
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.textTertiary,
  },
  followButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 1,
  },
  followingButtonText: {
    color: COLORS.textPrimary,
  },
  buyButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADII.full,
    alignItems: 'center',
  },
  buyButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 1,
  },
  postsSection: {
    marginTop: SPACING.xl,
    paddingBottom: SPACING.xl,
  },
  postsSectionTitle: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_GAP,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    margin: GRID_GAP / 2,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    borderRadius: RADII.xs,
  },
  gridTextItem: {
    width: '100%',
    height: '100%',
    borderRadius: RADII.xs,
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    justifyContent: 'center',
  },
  gridText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xl * 3,
    gap: SPACING.md,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
  },
  loadingMore: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
});
