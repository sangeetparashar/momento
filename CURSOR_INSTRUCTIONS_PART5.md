# Momento - Cursor Instructions (Part 5)
# Remaining Screens, Seed Data & Deployment

---

# Phase 12: Remaining Screens

## P12-01: Create Creator Profile Screen

```
Create apps/mobile/app/creator/[id].tsx:

import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useCreatorProfile } from '@/hooks/useCreatorProfile';
import { Text, Button, Avatar, Spacer, Card } from '@/components';
import { ComingSoonModal } from '@/components';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';
import { SOCIAL_PLATFORMS } from '@momento/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
type Tab = 'profile' | 'posts' | 'token';

export default function CreatorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile, isLoading, toggleFollow, isFollowLoading } = useCreatorProfile(id);
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [showComingSoon, setShowComingSoon] = useState(false);

  if (isLoading || !profile) {
    return <View style={LAYOUTS.screen} />;
  }

  const socialLinks = profile.socialLinks as Record<string, string> | undefined;

  return (
    <View style={LAYOUTS.screen}>
      {/* Header */}
      <View style={[LAYOUTS.rowBetween, styles.header]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity>
          <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[LAYOUTS.row, styles.tabContainer]}>
        {(['profile', 'posts', 'token'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text variant="label" color={activeTab === tab ? 'textPrimary' : 'textSecondary'}>
              {tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {activeTab === 'profile' && (
          <>
            {/* Banner */}
            <Image
              source={{ uri: profile.bannerUrl || `https://picsum.photos/seed/${id}/800/400` }}
              style={styles.banner}
              contentFit="cover"
            />

            {/* Social Links */}
            {socialLinks && Object.keys(socialLinks).length > 0 && (
              <View style={[LAYOUTS.row, styles.socialLinks]}>
                {Object.entries(socialLinks).map(([platform, url]) => {
                  if (!url) return null;
                  const config = SOCIAL_PLATFORMS[platform as keyof typeof SOCIAL_PLATFORMS];
                  return (
                    <TouchableOpacity key={platform} style={styles.socialIcon}>
                      <Ionicons name={config?.icon as any || 'link'} size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Name & Token */}
            <View style={[LAYOUTS.rowBetween, styles.nameRow]}>
              <Text variant="h2">{profile.displayName || profile.username}</Text>
              {profile.tokenSymbol && <Text variant="mono">${profile.tokenSymbol}</Text>}
            </View>

            {/* Bio */}
            <Text variant="body" color="textSecondary" style={styles.bio}>
              {profile.bio || 'No bio yet.'}
            </Text>

            {/* Stats */}
            <View style={[LAYOUTS.row, styles.stats]}>
              <Text variant="caption">{profile.followerCount} followers</Text>
              <Text variant="caption" style={{ marginLeft: SPACING.md }}>{profile.postCount} posts</Text>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <Button
                variant={profile.isFollowing ? 'secondary' : 'primary'}
                onPress={() => toggleFollow()}
                loading={isFollowLoading}
                style={{ flex: 1, marginRight: SPACING.sm }}
              >
                {profile.isFollowing ? 'FOLLOWING' : 'FOLLOW'}
              </Button>
              <Button variant="primary" onPress={() => setShowComingSoon(true)} style={{ flex: 1 }}>
                BUY
              </Button>
            </View>
          </>
        )}

        {activeTab === 'posts' && (
          <View style={styles.postsGrid}>
            <Text variant="caption" color="textSecondary" align="center">Posts coming soon</Text>
          </View>
        )}

        {activeTab === 'token' && (
          <View style={styles.tokenSection}>
            <Text variant="caption" color="textSecondary" align="center">Token chart coming in Phase 2</Text>
          </View>
        )}

        <Spacer size="xxl" />
      </ScrollView>

      <ComingSoonModal visible={showComingSoon} onClose={() => setShowComingSoon(false)} feature="Token Trading" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: SPACING.md, paddingTop: SPACING.xl },
  tabContainer: { backgroundColor: COLORS.surface, marginHorizontal: SPACING.md, borderRadius: RADII.md, padding: SPACING.xs },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: RADII.sm },
  tabActive: { backgroundColor: COLORS.surfaceLight },
  banner: { width: SCREEN_WIDTH, height: 200, marginTop: SPACING.md },
  socialLinks: { justifyContent: 'center', paddingVertical: SPACING.md, gap: SPACING.md },
  socialIcon: { padding: SPACING.sm },
  nameRow: { paddingHorizontal: SPACING.md },
  bio: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  stats: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  actions: { flexDirection: 'row', paddingHorizontal: SPACING.md, paddingTop: SPACING.lg },
  postsGrid: { padding: SPACING.xl },
  tokenSection: { padding: SPACING.xl },
});
```

---

## P12-02: Create Post Detail Screen

```
Create apps/mobile/app/post/[id].tsx:

import React, { useState } from 'react';
import { View, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Text, Avatar, Spacer } from '@/components';
import { LikeButton } from '@/components';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';
import { formatTimeAgo } from '@/utils/formatters';
import { PostWithCreator, Comment } from '@momento/shared';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');

  const { data: post } = useQuery<PostWithCreator>({
    queryKey: ['post', id],
    queryFn: async () => {
      const res = await api.get<{ data: PostWithCreator }>(`/api/posts/${id}`);
      return res.data;
    },
  });

  const { data: commentsData } = useQuery<{ comments: Comment[] }>({
    queryKey: ['comments', id],
    queryFn: async () => {
      const res = await api.get<{ data: { comments: Comment[] } }>(`/api/posts/${id}/comments`);
      return res.data;
    },
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      await api.post(`/api/posts/${id}/comments`, { content });
    },
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });

  if (!post) return <View style={LAYOUTS.screen} />;

  const comments = commentsData?.comments || [];

  return (
    <KeyboardAvoidingView style={LAYOUTS.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[LAYOUTS.rowBetween, styles.header]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Creator Info */}
        <TouchableOpacity style={[LAYOUTS.row, styles.creatorRow]} onPress={() => router.push(`/creator/${post.creatorId}`)}>
          <Avatar uri={post.creator.avatarUrl} name={post.creator.displayName} size="lg" />
          <View style={{ marginLeft: SPACING.md }}>
            <Text variant="bodySmall">{post.creator.displayName || post.creator.username}</Text>
            <Text variant="caption">@{post.creator.username}</Text>
            <Text variant="caption">{formatTimeAgo(post.createdAt)}</Text>
          </View>
        </TouchableOpacity>

        {/* Media */}
        {post.mediaUrl && (
          <Image source={{ uri: post.mediaUrl }} style={styles.media} contentFit="cover" />
        )}

        {/* Caption */}
        {post.caption && (
          <Text variant="body" style={styles.caption}>{post.caption}</Text>
        )}

        {/* Content (text post) */}
        {post.content && (
          <Text variant="h3" style={styles.caption}>{post.content}</Text>
        )}

        {/* Like Button */}
        <View style={styles.actions}>
          <LikeButton postId={post.id} isLiked={post.isLiked || false} likeCount={post.likeCount} />
        </View>

        {/* Comments Section */}
        <View style={styles.commentsSection}>
          <Text variant="bodySmall">{post.commentCount} comments</Text>
          <Spacer size="md" />

          {comments.map((comment) => (
            <View key={comment.id} style={styles.comment}>
              <Avatar uri={comment.user.avatarUrl} name={comment.user.displayName} size="sm" />
              <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                <Text variant="caption">{comment.user.displayName || comment.user.username}</Text>
                <Text variant="bodySmall">{comment.content}</Text>
              </View>
            </View>
          ))}
        </View>

        <Spacer size="xxl" />
      </ScrollView>

      {/* Comment Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Add a comment..."
          placeholderTextColor={COLORS.textMuted}
          value={commentText}
          onChangeText={setCommentText}
        />
        <TouchableOpacity
          onPress={() => commentText.trim() && addComment.mutate(commentText)}
          disabled={!commentText.trim() || addComment.isPending}
        >
          <Ionicons name="send" size={24} color={commentText.trim() ? COLORS.primary : COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { padding: SPACING.md, paddingTop: SPACING.xl },
  creatorRow: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  media: { width: '100%', aspectRatio: 1 },
  caption: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  actions: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
  commentsSection: { paddingHorizontal: SPACING.md },
  comment: { flexDirection: 'row', paddingVertical: SPACING.sm },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  input: { flex: 1, color: COLORS.textPrimary, fontSize: 16, marginRight: SPACING.md },
});
```

---

## P12-03: Create Market Screen

```
Create apps/mobile/app/market.tsx:

import React, { useState } from 'react';
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Card, Avatar, Spacer } from '@/components';
import { TickerBanner, ComingSoonModal } from '@/components';
import { TRENDING_TICKERS, CREATORS_TO_WATCH, DUMMY_TOKENS } from '@/config/dummyData';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';
import { formatCurrency, formatPercentage } from '@/utils/formatters';

type Tab = 'trending' | 'gainers' | 'top';

export default function MarketScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);

  const filteredTokens = DUMMY_TOKENS.filter((t) =>
    t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={LAYOUTS.screen}>
      {/* Header */}
      <View style={[LAYOUTS.rowBetween, styles.header]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3">Market</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tokens..."
          placeholderTextColor={COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Tickers */}
        <TickerBanner title="TRENDING" items={TRENDING_TICKERS} />
        <TickerBanner title="CREATORS TO WATCH" items={CREATORS_TO_WATCH} />

        {/* Tabs */}
        <View style={[LAYOUTS.row, styles.tabContainer]}>
          {(['trending', 'gainers', 'top'] as Tab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text variant="label" color={activeTab === tab ? 'textPrimary' : 'textSecondary'}>
                {tab === 'gainers' ? '24H GAINERS' : tab.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Token List */}
        <View style={styles.tokenList}>
          {/* Header */}
          <View style={[LAYOUTS.rowBetween, styles.listHeader]}>
            <Text variant="label" style={{ flex: 0.5 }}>#</Text>
            <Text variant="label" style={{ flex: 2 }}>TOKEN</Text>
            <Text variant="label" style={{ flex: 1 }}>24HR</Text>
            <Text variant="label" style={{ flex: 1 }}>MCAP</Text>
            <View style={{ width: 30 }} />
          </View>

          {filteredTokens.map((token, index) => (
            <View key={token.symbol}>
              <TouchableOpacity
                style={[LAYOUTS.rowBetween, styles.tokenRow]}
                onPress={() => setExpandedToken(expandedToken === token.symbol ? null : token.symbol)}
              >
                <Text variant="caption" style={{ flex: 0.5 }}>{index + 1}</Text>
                <View style={[LAYOUTS.row, { flex: 2 }]}>
                  <Avatar name={token.symbol} size="sm" />
                  <Text variant="mono" style={{ marginLeft: SPACING.sm }}>${token.symbol}</Text>
                </View>
                <Text variant="mono" color={token.change24h >= 0 ? 'success' : 'error'} style={{ flex: 1 }}>
                  {formatPercentage(token.change24h)}
                </Text>
                <Text variant="mono" style={{ flex: 1 }}>{formatCurrency(token.marketCap)}</Text>
                <Ionicons name={expandedToken === token.symbol ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>

              {expandedToken === token.symbol && (
                <Card style={styles.expandedContent}>
                  <View style={LAYOUTS.rowBetween}>
                    <Text variant="caption">Price:</Text>
                    <Text variant="mono">{formatCurrency(token.price)}</Text>
                  </View>
                  <Spacer size="sm" />
                  <TouchableOpacity
                    style={styles.buyButton}
                    onPress={() => setShowComingSoon(true)}
                  >
                    <Text variant="label" color="background">BUY ${token.symbol}</Text>
                  </TouchableOpacity>
                </Card>
              )}
            </View>
          ))}
        </View>

        <Spacer size="xxl" />
      </ScrollView>

      <ComingSoonModal visible={showComingSoon} onClose={() => setShowComingSoon(false)} feature="Token Trading" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: SPACING.md, paddingTop: SPACING.xl },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, marginHorizontal: SPACING.md, borderRadius: RADII.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  searchInput: { flex: 1, color: COLORS.textPrimary, marginLeft: SPACING.sm, fontSize: 16 },
  tabContainer: { backgroundColor: COLORS.surface, marginHorizontal: SPACING.md, marginTop: SPACING.md, borderRadius: RADII.md, padding: SPACING.xs },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: RADII.sm },
  tabActive: { backgroundColor: COLORS.surfaceLight },
  tokenList: { paddingHorizontal: SPACING.md, marginTop: SPACING.md },
  listHeader: { paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.surface },
  tokenRow: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.surface },
  expandedContent: { marginVertical: SPACING.sm },
  buyButton: { backgroundColor: COLORS.primary, paddingVertical: SPACING.sm, borderRadius: RADII.md, alignItems: 'center' },
});
```

---

## P12-04: Create Edit Profile Screen

```
Create apps/mobile/app/edit-profile.tsx:

import React, { useState } from 'react';
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useUpload } from '@/hooks/useUpload';
import { useKyc } from '@/hooks/useKyc';
import { Text, Button, Avatar, Spacer, Card } from '@/components';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';
import { KycStatus, UserRole } from '@momento/shared';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, updateProfile, isUpdating } = useUserProfile();
  const { pickAndUpload, isUploading } = useUpload();
  const { startKyc, kycSession, isStarting } = useKyc();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [tokenSymbol, setTokenSymbol] = useState(user?.tokenSymbol || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');

  const socialLinks = (user?.socialLinks || {}) as Record<string, string>;
  const [youtube, setYoutube] = useState(socialLinks.youtube || '');
  const [instagram, setInstagram] = useState(socialLinks.instagram || '');
  const [twitter, setTwitter] = useState(socialLinks.twitter || '');

  const handleSave = () => {
    updateProfile({
      displayName,
      bio,
      tokenSymbol,
      avatarUrl,
      socialLinks: { youtube, instagram, twitter },
    });
    router.back();
  };

  const handleAvatarUpload = async () => {
    const url = await pickAndUpload('avatars');
    if (url) setAvatarUrl(url);
  };

  const handleStartKyc = () => {
    startKyc(undefined, {
      onSuccess: (data) => {
        if (data.skipKyc) {
          Alert.alert('Success', 'You are now a verified creator!');
          router.back();
        } else if (data.url) {
          Linking.openURL(data.url);
        }
      },
      onError: (error) => {
        Alert.alert('Error', error.message);
      },
    });
  };

  const isVerified = user?.kycStatus === KycStatus.VERIFIED;
  const isPending = user?.kycStatus === KycStatus.PENDING;
  const isCreator = user?.role === UserRole.CREATOR && user?.isAdminApproved;

  return (
    <View style={LAYOUTS.screen}>
      {/* Header */}
      <View style={[LAYOUTS.rowBetween, styles.header]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3">Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={isUpdating}>
          <Text variant="bodySmall" color="primary">Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
        {/* Avatar */}
        <View style={LAYOUTS.center}>
          <TouchableOpacity onPress={handleAvatarUpload} disabled={isUploading}>
            <Avatar uri={avatarUrl} name={displayName} size="xl" />
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={16} color={COLORS.textPrimary} />
            </View>
          </TouchableOpacity>
        </View>

        <Spacer size="lg" />

        {/* Social Links */}
        <Text variant="label">SOCIAL LINKS</Text>
        <Spacer size="sm" />
        <InputRow icon="logo-youtube" placeholder="YouTube URL" value={youtube} onChangeText={setYoutube} />
        <InputRow icon="logo-instagram" placeholder="Instagram URL" value={instagram} onChangeText={setInstagram} />
        <InputRow icon="logo-twitter" placeholder="Twitter/X URL" value={twitter} onChangeText={setTwitter} />

        <Spacer size="lg" />

        {/* Profile Info */}
        <Text variant="label">PROFILE INFO</Text>
        <Spacer size="sm" />
        <TextInput style={styles.input} placeholder="Display Name" placeholderTextColor={COLORS.textMuted} value={displayName} onChangeText={setDisplayName} />
        <TextInput style={styles.input} placeholder="Token Symbol (e.g. DEEL)" placeholderTextColor={COLORS.textMuted} value={tokenSymbol} onChangeText={setTokenSymbol} autoCapitalize="characters" maxLength={6} />
        <TextInput style={[styles.input, styles.bioInput]} placeholder="Bio" placeholderTextColor={COLORS.textMuted} value={bio} onChangeText={setBio} multiline />

        <Spacer size="lg" />

        {/* KYC Section */}
        {!isCreator && (
          <Card>
            <Text variant="h3">Become a Creator</Text>
            <Spacer size="sm" />
            <Text variant="caption" color="textSecondary">
              Verify your identity to unlock creator features and launch your token.
            </Text>
            <Spacer size="md" />

            {isPending ? (
              <Text variant="bodySmall" color="warning">Verification pending...</Text>
            ) : isVerified ? (
              <Text variant="bodySmall" color="success">Verified! Awaiting admin approval.</Text>
            ) : (
              <Button onPress={handleStartKyc} loading={isStarting}>GET VERIFIED</Button>
            )}
          </Card>
        )}

        <Spacer size="xxl" />
      </ScrollView>
    </View>
  );
}

function InputRow({ icon, placeholder, value, onChangeText }: { icon: any; placeholder: string; value: string; onChangeText: (t: string) => void }) {
  return (
    <View style={styles.inputRow}>
      <Ionicons name={icon} size={20} color={COLORS.textSecondary} />
      <TextInput
        style={styles.inputRowText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: SPACING.md, paddingTop: SPACING.xl },
  content: { paddingHorizontal: SPACING.md },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.surface, padding: SPACING.xs, borderRadius: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADII.md, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },
  inputRowText: { flex: 1, color: COLORS.textPrimary, paddingVertical: SPACING.md, marginLeft: SPACING.sm },
  input: { backgroundColor: COLORS.surface, borderRadius: RADII.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  bioInput: { height: 100, textAlignVertical: 'top' },
});
```

---

## P12-05: Create Create Post Screen

```
Create apps/mobile/app/create-post.tsx:

import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useCreatePost } from '@/hooks/useCreatePost';
import { useUpload } from '@/hooks/useUpload';
import { useLocation } from '@/providers/LocationProvider';
import { Text, Button, Spacer } from '@/components';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';
import { PostType } from '@momento/shared';

export default function CreatePostScreen() {
  const router = useRouter();
  const { location } = useLocation();
  const createPost = useCreatePost();
  const { pickAndUpload, isUploading } = useUpload();

  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const handlePickMedia = async () => {
    const url = await pickAndUpload('posts', true);
    if (url) setMediaUrl(url);
  };

  const handlePost = () => {
    if (!caption.trim() && !mediaUrl) {
      Alert.alert('Error', 'Add a caption or image');
      return;
    }

    if (!location) {
      Alert.alert('Error', 'Location required to post');
      return;
    }

    const postType = mediaUrl ? PostType.IMAGE : PostType.TEXT;

    createPost.mutate(
      {
        postType,
        content: postType === PostType.TEXT ? caption : undefined,
        caption: postType === PostType.IMAGE ? caption : undefined,
        mediaUrl: mediaUrl || undefined,
      },
      {
        onSuccess: () => {
          router.back();
        },
        onError: (error) => {
          Alert.alert('Error', error.message);
        },
      }
    );
  };

  return (
    <View style={LAYOUTS.screen}>
      {/* Header */}
      <View style={[LAYOUTS.rowBetween, styles.header]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3">New Post</Text>
        <Button size="sm" onPress={handlePost} loading={createPost.isPending} disabled={!caption.trim() && !mediaUrl}>
          POST
        </Button>
      </View>

      {/* Caption Input */}
      <TextInput
        style={styles.captionInput}
        placeholder="Write a caption..."
        placeholderTextColor={COLORS.textMuted}
        value={caption}
        onChangeText={setCaption}
        multiline
        autoFocus
      />

      {/* Media Preview */}
      <TouchableOpacity style={styles.mediaContainer} onPress={handlePickMedia} disabled={isUploading}>
        {mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={styles.mediaPreview} contentFit="cover" />
        ) : (
          <View style={[LAYOUTS.center, styles.mediaPlaceholder]}>
            <Ionicons name={isUploading ? 'hourglass' : 'image'} size={48} color={COLORS.textMuted} />
            <Spacer size="sm" />
            <Text variant="caption" color="textMuted">
              {isUploading ? 'Uploading...' : 'Tap to add image or video'}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Location Indicator */}
      <View style={[LAYOUTS.row, styles.locationRow]}>
        <Ionicons name="location" size={16} color={COLORS.textSecondary} />
        <Text variant="caption" color="textSecondary" style={{ marginLeft: SPACING.xs }}>
          {location ? 'Location will be captured' : 'Waiting for location...'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: SPACING.md, paddingTop: SPACING.xl },
  captionInput: { color: COLORS.textPrimary, fontSize: 18, padding: SPACING.md, minHeight: 100, textAlignVertical: 'top' },
  mediaContainer: { flex: 1, margin: SPACING.md },
  mediaPreview: { flex: 1, borderRadius: RADII.md },
  mediaPlaceholder: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADII.md, borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed' },
  locationRow: { padding: SPACING.md, paddingBottom: SPACING.xl },
});
```

---

# Phase 13: Seed Data

## P13-01: Create Seed Script

```
Create apps/api/prisma/seed.ts:

import { PrismaClient, UserRole, KycStatus, PostType } from '@prisma/client';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();

const CREATORS = [
  { displayName: 'Deela', username: 'deela', bio: 'Musician. Performer. Creator.', tokenSymbol: 'DEEL' },
  { displayName: 'Belle', username: 'belle', bio: 'Visual artist exploring tech and emotion.', tokenSymbol: 'BELLE' },
  { displayName: 'Naan', username: 'naan', bio: 'Chef bringing global flavors to your feed.', tokenSymbol: 'NAAN' },
  { displayName: 'Aura', username: 'aura', bio: 'Photographer capturing moments that matter.', tokenSymbol: 'AURA' },
  { displayName: 'Seam', username: 'seam', bio: 'Fashion designer. Sustainable style.', tokenSymbol: 'SEAM' },
];

const LOCATIONS = [
  { lat: 40.7128, lng: -74.006 },   // NYC
  { lat: 34.0522, lng: -118.2437 }, // LA
  { lat: 51.5074, lng: -0.1278 },   // London
  { lat: 35.6762, lng: 139.6503 },  // Tokyo
  { lat: 48.8566, lng: 2.3522 },    // Paris
];

const CAPTIONS = [
  'New tour dates coming next week!! 🎉',
  'Just finished this piece. What do you think?',
  'Behind the scenes from today\'s shoot 📸',
  'Grateful for all the support!',
  'Working on something special... stay tuned 👀',
];

async function main() {
  console.log('🌱 Seeding...');

  // Clear existing
  await prisma.like.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.post.deleteMany();
  await prisma.kycRecord.deleteMany();
  await prisma.user.deleteMany();

  // Create creators
  const createdCreators = [];
  for (let i = 0; i < CREATORS.length; i++) {
    const c = CREATORS[i];
    const loc = LOCATIONS[i];

    const creator = await prisma.user.create({
      data: {
        id: uuid(),
        privyUserId: `creator-${c.username}-privy`,
        walletAddress: `Creator${c.username}Wallet${uuid().slice(0, 16)}`,
        email: `${c.username}@example.com`,
        username: c.username,
        displayName: c.displayName,
        bio: c.bio,
        avatarUrl: `https://picsum.photos/seed/${c.username}/400/400`,
        tokenSymbol: c.tokenSymbol,
        role: UserRole.CREATOR,
        kycStatus: KycStatus.VERIFIED,
        isAdminApproved: true,
        locationLat: loc.lat + (Math.random() - 0.5) * 0.1,
        locationLng: loc.lng + (Math.random() - 0.5) * 0.1,
        followerCount: Math.floor(Math.random() * 10000) + 100,
        socialLinks: { instagram: `https://instagram.com/${c.username}`, twitter: `https://twitter.com/${c.username}` },
      },
    });

    createdCreators.push(creator);

    // Create posts
    for (let j = 0; j < 4; j++) {
      await prisma.post.create({
        data: {
          id: uuid(),
          creatorId: creator.id,
          postType: PostType.IMAGE,
          caption: CAPTIONS[Math.floor(Math.random() * CAPTIONS.length)],
          mediaUrl: `https://picsum.photos/seed/${uuid()}/800/1000`,
          latitude: loc.lat + (Math.random() - 0.5) * 0.05,
          longitude: loc.lng + (Math.random() - 0.5) * 0.05,
          likeCount: Math.floor(Math.random() * 500),
          commentCount: Math.floor(Math.random() * 50),
          createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    await prisma.user.update({ where: { id: creator.id }, data: { postCount: 4 } });
  }

  // Create test users
  for (let i = 0; i < 5; i++) {
    const user = await prisma.user.create({
      data: {
        id: uuid(),
        privyUserId: `user-${i}-privy`,
        walletAddress: `User${i}Wallet${uuid().slice(0, 20)}`,
        email: `user${i}@example.com`,
        username: `testuser${i}`,
        displayName: `Test User ${i}`,
        role: UserRole.USER,
        kycStatus: KycStatus.NONE,
        locationLat: LOCATIONS[i % LOCATIONS.length].lat,
        locationLng: LOCATIONS[i % LOCATIONS.length].lng,
      },
    });

    // Follow some creators
    for (const creator of createdCreators.slice(0, 2)) {
      await prisma.follow.create({
        data: { id: uuid(), followerId: user.id, followingId: creator.id },
      });
    }
  }

  // Create pending creator for testing admin flow
  await prisma.user.create({
    data: {
      id: uuid(),
      privyUserId: 'pending-creator-privy',
      walletAddress: `PendingWallet${uuid().slice(0, 20)}`,
      email: 'pending@example.com',
      username: 'pendingcreator',
      displayName: 'Pending Creator',
      role: UserRole.USER,
      kycStatus: KycStatus.VERIFIED,
      isAdminApproved: false,
    },
  });

  console.log('✅ Seed complete!');
  console.log(`Created: ${CREATORS.length} creators, 5 users, ${CREATORS.length * 4} posts`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

---

## P13-02: Add Seed Script to Package.json

```
Update apps/api/package.json scripts:

{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts",
    "db:studio": "prisma studio"
  }
}

Run: cd apps/api && npm run db:seed
```

---

# Phase 14: Deployment

## P14-01: Create Vercel Config

```
Create apps/api/vercel.json:

{
  "buildCommand": "npx prisma generate && next build",
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

---

## P14-02: Deploy API to Vercel

```
Manual steps:

cd apps/api

# Link project
vercel link

# Add environment variables (one by one)
vercel env add DATABASE_URL
vercel env add DIRECT_URL
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_KEY
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel env add PRIVY_APP_ID
vercel env add PRIVY_APP_SECRET
vercel env add VERIFF_API_KEY
vercel env add VERIFF_API_SECRET
vercel env add VERIFF_WEBHOOK_SECRET
vercel env add HELIUS_API_KEY

# Deploy
vercel --prod

# Note the deployment URL (e.g., https://momento-api.vercel.app)
```

---

## P14-03: Update Mobile Production Config

```
Update apps/mobile/eas.json:

{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "http://localhost:3000",
        "EXPO_PUBLIC_PRIVY_APP_ID": "your-privy-app-id"
      }
    },
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://your-api.vercel.app",
        "EXPO_PUBLIC_PRIVY_APP_ID": "your-privy-app-id"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://your-api.vercel.app",
        "EXPO_PUBLIC_PRIVY_APP_ID": "your-privy-app-id"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

---

## P14-04: Build & Submit Mobile App

```
Manual steps:

cd apps/mobile

# Build for iOS
eas build --profile production --platform ios

# Build for Android
eas build --profile production --platform android

# Submit to stores (after builds complete)
eas submit --platform ios
eas submit --platform android
```

---

# Final Checklist

## Before First Build

- [ ] All environment variables set in Vercel
- [ ] PostGIS migration run in Supabase
- [ ] Storage buckets created (avatars, banners, posts)
- [ ] Privy app configured with Solana wallets
- [ ] Veriff webhook URL set to production API
- [ ] SKIP_KYC=true removed for production

## Testing

- [ ] `npm run db:seed` creates test data
- [ ] API routes respond correctly
- [ ] Feed loads posts by location
- [ ] Privy login works
- [ ] Helius returns wallet balances
- [ ] Push notifications deliver

## Performance

- [ ] Redis caching working (check Upstash dashboard)
- [ ] Images loading via expo-image
- [ ] FlashList scrolling smoothly
- [ ] Reanimated ticker not stuttering

---

# Summary

## What You Built

| Layer | Tech |
|-------|------|
| Database | Supabase PostgreSQL + PostGIS |
| Cache | Upstash Redis |
| API | Next.js 14 on Vercel |
| Auth | Privy (Google/Apple + Solana wallet) |
| Mobile | Expo + React Native |
| State | React Query |
| Animations | Reanimated |
| KYC | Veriff |
| Blockchain | Helius (read-only for MVP) |

## Prompt Count

| Part | Count |
|------|-------|
| Part 1: Monorepo & Database | 20 |
| Part 2: API Routes | 15 |
| Part 3: Mobile Foundation | 18 |
| Part 4: Components & Screens | 16 |
| Part 5: Seed & Deploy | 8 |
| **Total** | **~77** |

## Phase 2 Roadmap

1. Real token prices (Jupiter/Birdeye)
2. Token swap execution
3. Creator token minting
4. Historical price charts
5. Admin dashboard (if needed)
6. Auth sync cron job
7. PostGIS edge filtering

---

# You're Done! 🚀

Follow the prompts in order, test thoroughly, and deploy with confidence.
