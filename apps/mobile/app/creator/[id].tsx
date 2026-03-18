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
import { ComingSoonModal, CreatorProfileSkeleton } from '@/components/features';
import { useCreatorProfile } from '@/hooks';
import { apiService } from '@/services/api';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatNumber } from '@/utils/formatters';
import { SOCIAL_PLATFORMS } from '@momento/shared';

type CreatorTab = 'PROFILE' | 'POSTS' | 'TOKEN';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_HEIGHT = 180;

export default function CreatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile, isLoading, isFollowing, toggleFollow } = useCreatorProfile(id);
  const [activeTab, setActiveTab] = useState<CreatorTab>('PROFILE');
  const [showComingSoon, setShowComingSoon] = useState(false);

  const postsQuery = useInfiniteQuery({
    queryKey: ['creator', id, 'posts'],
    queryFn: ({ pageParam }) =>
      apiService.get<{ posts: any[]; nextCursor?: string; hasMore: boolean }>(
        `/creators/${id}/posts`,
        { ...(pageParam ? { cursor: pageParam as string } : {}) }
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!id,
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
              onPress={() => handleSocialPress(platform, handle)}
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

  const renderProfileTab = () => (
    <View style={styles.profileContent}>
      {/* Banner */}
      <View style={styles.bannerContainer}>
        {profile?.bannerUrl ? (
          <Image
            source={{ uri: profile.bannerUrl }}
            style={styles.banner}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.banner, styles.bannerPlaceholder]} />
        )}
      </View>

      {/* Avatar + Social Links */}
      <View style={styles.avatarSection}>
        <Avatar
          uri={profile?.avatarUrl}
          name={profile?.displayName || profile?.username}
          size="xl"
        />
        {renderSocialLinks()}
      </View>

      {/* Name + Info */}
      <View style={styles.infoSection}>
        <Text style={styles.creatorName}>
          {profile?.displayName || profile?.username || 'Creator'}
        </Text>
        {profile?.tokenSymbol && (
          <Text style={styles.tokenSymbol}>${profile.tokenSymbol}</Text>
        )}
        {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
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

      {/* Action Buttons */}
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
    </View>
  );

  const renderPostsTab = () => {
    if (postsQuery.isLoading) {
      return (
        <View style={styles.placeholderTab}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }
    if (creatorPosts.length === 0) {
      return (
        <View style={styles.placeholderTab}>
          <Ionicons name="images-outline" size={48} color={COLORS.textTertiary} />
          <Text style={styles.placeholderText}>No posts yet</Text>
        </View>
      );
    }
    return (
      <View style={styles.postsGrid}>
        {creatorPosts.map((post) => (
          <Pressable key={post.id} onPress={() => router.push(`/post/${post.id}`)} style={styles.gridItem}>
            {post.mediaUrl ? (
              <Image source={{ uri: post.mediaUrl }} style={styles.gridImage} contentFit="cover" />
            ) : (
              <View style={styles.gridTextItem}>
                <Text style={styles.gridText} numberOfLines={4}>{post.content || post.caption}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    );
  };

  const renderTokenTab = () => (
    <View style={styles.placeholderTab}>
      <Ionicons
        name="trending-up-outline"
        size={48}
        color={COLORS.textTertiary}
      />
      <Text style={styles.placeholderText}>
        Token chart coming in Phase 2
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Navigation */}
      <View style={styles.navBar}>
        <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
          <Ionicons
            name="chevron-back"
            size={28}
            color={COLORS.textPrimary}
          />
        </Pressable>

        {/* Tab Selector */}
        <View style={styles.tabsContainer}>
          {(['PROFILE', 'POSTS', 'TOKEN'] as CreatorTab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tabButton,
                activeTab === tab && styles.tabButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.tabTextActive,
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Spacer for symmetry */}
        <View style={styles.navSpacer} />
      </View>

      {/* Content */}
      {isLoading ? (
        <CreatorProfileSkeleton />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {activeTab === 'PROFILE' && renderProfileTab()}
          {activeTab === 'POSTS' && renderPostsTab()}
          {activeTab === 'TOKEN' && renderTokenTab()}
        </ScrollView>
      )}

      {/* Coming Soon Modal */}
      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        title="Trading Coming Soon!"
        message="Token trading will be available in the next update."
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
  },
  tabsContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: 3,
    marginHorizontal: SPACING.sm,
  },
  tabButton: {
    flex: 1,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADII.lg - 3,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: COLORS.backgroundTertiary,
  },
  tabText: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: COLORS.textPrimary,
  },
  navSpacer: {
    width: 36,
  },
  profileContent: {
    paddingBottom: SPACING.xl,
  },
  bannerContainer: {
    height: BANNER_HEIGHT,
    overflow: 'hidden',
  },
  banner: {
    width: SCREEN_WIDTH,
    height: BANNER_HEIGHT,
  },
  bannerPlaceholder: {
    backgroundColor: COLORS.backgroundTertiary,
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    marginTop: -40,
  },
  socialLinksRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  socialIcon: {
    padding: SPACING.xs,
  },
  infoSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  creatorName: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  tokenSymbol: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  bio: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    lineHeight: 22,
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
  placeholderTab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xl * 4,
    gap: SPACING.md,
  },
  placeholderText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
  },
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.xs,
  },
  gridItem: {
    width: '33.33%',
    aspectRatio: 1,
    padding: SPACING.xs / 2,
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
});
