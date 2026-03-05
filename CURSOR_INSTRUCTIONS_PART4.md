# Momento - Cursor Instructions (Part 4)
# Components & Screens

---

# Phase 10: Feature Components

**RULES**: All components must:
- Import from `@/styles` (never hardcode colors/spacing)
- Use primitives (Text, Button, Avatar, etc.)
- Be under 150 lines

---

## P10-01: Create TickerBanner (Reanimated)

```
Create apps/mobile/src/components/features/TickerBanner.tsx:

import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Text } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';

interface TickerItem { symbol: string; change: number; }

interface TickerBannerProps {
  title: string;
  items: TickerItem[];
  onPress?: () => void;
}

const ITEM_WIDTH = 120;

export function TickerBanner({ title, items, onPress }: TickerBannerProps) {
  const translateX = useSharedValue(0);
  const totalWidth = items.length * ITEM_WIDTH;

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(-totalWidth, { duration: items.length * 3000, easing: Easing.linear }),
      -1,
      false
    );
  }, [items.length, totalWidth]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  const duplicatedItems = [...items, ...items];

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8}>
      <Text variant="label" style={styles.title}>{title}</Text>
      <View style={styles.tickerContainer}>
        <Animated.View style={[styles.tickerContent, animatedStyle]}>
          {duplicatedItems.map((item, index) => (
            <View key={`${item.symbol}-${index}`} style={styles.tickerItem}>
              <Text variant="mono">{item.symbol}</Text>
              <Text variant="mono" color={item.change >= 0 ? 'success' : 'error'} style={styles.change}>
                {item.change >= 0 ? '+' : ''}{item.change.toFixed(1)}%
              </Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: SPACING.sm, backgroundColor: COLORS.background },
  title: { marginBottom: SPACING.xs, paddingHorizontal: SPACING.md },
  tickerContainer: { overflow: 'hidden' },
  tickerContent: { flexDirection: 'row' },
  tickerItem: { width: ITEM_WIDTH, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm },
  change: { marginLeft: SPACING.sm },
});
```

---

## P10-02: Create PostCard

```
Create apps/mobile/src/components/features/PostCard.tsx:

import React from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { PostWithCreator, PostType } from '@momento/shared';
import { Text, Avatar, Spacer } from '@/components/primitives';
import { LikeButton } from './LikeButton';
import { COLORS, SPACING } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';
import { formatTimeAgo } from '@/utils/formatters';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PostCardProps {
  post: PostWithCreator;
  showCreatorInfo?: boolean;
}

export function PostCard({ post, showCreatorInfo = true }: PostCardProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {post.caption && <Text variant="bodySmall" style={styles.caption} numberOfLines={2}>{post.caption}</Text>}

      <TouchableOpacity onPress={() => router.push(`/post/${post.id}`)} activeOpacity={0.95}>
        {post.postType === PostType.IMAGE && post.mediaUrl && (
          <Image source={{ uri: post.mediaUrl }} style={styles.media} contentFit="cover" transition={200} />
        )}
        {post.postType === PostType.TEXT && (
          <View style={styles.textPost}>
            <Text variant="h3">{post.content}</Text>
          </View>
        )}
      </TouchableOpacity>

      {showCreatorInfo && (
        <View style={[LAYOUTS.rowBetween, styles.infoRow]}>
          <TouchableOpacity style={LAYOUTS.row} onPress={() => router.push(`/creator/${post.creatorId}`)}>
            <Text variant="bodySmall">{post.creator.displayName || post.creator.username}</Text>
            <View style={styles.onlineIndicator} />
          </TouchableOpacity>
          <Text variant="caption">{formatTimeAgo(post.createdAt)}</Text>
        </View>
      )}

      <View style={[LAYOUTS.row, styles.actionsRow]}>
        <LikeButton postId={post.id} isLiked={post.isLiked || false} likeCount={post.likeCount} />
        <Spacer size="lg" horizontal />
        <TouchableOpacity onPress={() => router.push(`/post/${post.id}`)}>
          <Text variant="caption">{post.commentCount} comments</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: SPACING.lg, backgroundColor: COLORS.background },
  caption: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  media: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.1, backgroundColor: COLORS.surface },
  textPost: { backgroundColor: COLORS.surface, padding: SPACING.lg, minHeight: 150, justifyContent: 'center' },
  infoRow: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  onlineIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success, marginLeft: SPACING.xs },
  actionsRow: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
});
```

---

## P10-03: Create LikeButton

```
Create apps/mobile/src/components/features/LikeButton.tsx:

import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import { useLike } from '@/hooks/useLike';
import { Text } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';
import { formatNumber } from '@/utils/formatters';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

interface LikeButtonProps {
  postId: string;
  isLiked: boolean;
  likeCount: number;
}

export function LikeButton({ postId, isLiked, likeCount }: LikeButtonProps) {
  const { mutate: toggleLike, isPending } = useLike(postId);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(withSpring(1.3, { damping: 10 }), withSpring(1, { damping: 15 }));
    toggleLike();
  };

  return (
    <AnimatedTouchable style={[LAYOUTS.row, animatedStyle]} onPress={handlePress} disabled={isPending}>
      <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={24} color={isLiked ? COLORS.error : COLORS.textSecondary} />
      <Text variant="bodySmall" color={isLiked ? 'error' : 'textSecondary'} style={{ marginLeft: SPACING.xs }}>
        {formatNumber(likeCount)}
      </Text>
    </AnimatedTouchable>
  );
}
```

---

## P10-04: Create TokenList

```
Create apps/mobile/src/components/features/TokenList.tsx:

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { TokenHolding } from '@momento/shared';
import { Text, Avatar, Button } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';
import { formatCurrency, formatPercentage } from '@/utils/formatters';

interface TokenListProps {
  tokens: TokenHolding[];
  onBuyPress?: () => void;
}

export function TokenList({ tokens, onBuyPress }: TokenListProps) {
  return (
    <View style={styles.container}>
      <View style={[LAYOUTS.rowBetween, styles.header]}>
        <Text variant="label" style={{ flex: 1 }}>TOKEN</Text>
        <Text variant="label" style={{ flex: 1 }}>24HR</Text>
        <Text variant="label" style={{ flex: 1 }}>VALUE</Text>
        <View style={{ width: 60 }} />
      </View>

      {tokens.map((token) => (
        <View key={token.mint} style={[LAYOUTS.rowBetween, styles.row]}>
          <View style={[LAYOUTS.row, { flex: 1 }]}>
            <Avatar uri={token.logoUrl} name={token.symbol} size="sm" />
            <Text variant="mono" style={{ marginLeft: SPACING.sm }}>{token.symbol}</Text>
          </View>
          <Text variant="mono" color={(token.change24h || 0) >= 0 ? 'success' : 'error'} style={{ flex: 1 }}>
            {formatPercentage(token.change24h || 0)}
          </Text>
          <Text variant="mono" style={{ flex: 1 }}>{formatCurrency(token.valueUsd || 0)}</Text>
          <Button variant="secondary" size="sm" onPress={onBuyPress}>BUY</Button>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: SPACING.md },
  header: { paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.surface },
  row: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.surface },
});
```

---

## P10-05: Create PortfolioChart

```
Create apps/mobile/src/components/features/PortfolioChart.tsx:

import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Text } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - SPACING.md * 2;
const CHART_HEIGHT = 150;

type TimeRange = '24H' | '7D' | '1M' | '3M' | '1Y';

const generateDummyData = (): number[] => {
  const data: number[] = [];
  let value = 50 + Math.random() * 50;
  for (let i = 0; i < 30; i++) {
    value += (Math.random() - 0.48) * 10;
    value = Math.max(10, Math.min(100, value));
    data.push(value);
  }
  return data;
};

const dataToPath = (data: number[]): string => {
  if (data.length === 0) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xStep = CHART_WIDTH / (data.length - 1);
  const points = data.map((v, i) => `${i * xStep},${CHART_HEIGHT - ((v - min) / range) * CHART_HEIGHT}`);
  return `M ${points.join(' L ')}`;
};

export function PortfolioChart() {
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1M');
  const [chartData] = useState(generateDummyData);

  const pathD = dataToPath(chartData);
  const isPositive = chartData[chartData.length - 1] > chartData[0];
  const lineColor = isPositive ? COLORS.success : COLORS.error;

  return (
    <View style={styles.container}>
      <Text variant="label">PORTFOLIO PERFORMANCE</Text>

      <View style={styles.chartContainer}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
              <Stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={`${pathD} L ${CHART_WIDTH},${CHART_HEIGHT} L 0,${CHART_HEIGHT} Z`} fill="url(#gradient)" />
          <Path d={pathD} stroke={lineColor} strokeWidth={2} fill="none" />
        </Svg>
      </View>

      <View style={[LAYOUTS.rowBetween, styles.rangeSelector]}>
        {(['24H', '7D', '1M', '3M', '1Y'] as TimeRange[]).map((range) => (
          <TouchableOpacity
            key={range}
            style={[styles.rangeButton, selectedRange === range && styles.rangeButtonActive]}
            onPress={() => setSelectedRange(range)}
          >
            <Text variant="caption" color={selectedRange === range ? 'textPrimary' : 'textSecondary'}>{range}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: SPACING.md },
  chartContainer: { height: CHART_HEIGHT, marginVertical: SPACING.md },
  rangeSelector: { backgroundColor: COLORS.surface, borderRadius: 8, padding: SPACING.xs },
  rangeButton: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: 6 },
  rangeButtonActive: { backgroundColor: COLORS.surfaceLight },
});
```

---

## P10-06: Create ComingSoonModal

```
Create apps/mobile/src/components/features/ComingSoonModal.tsx:

import React from 'react';
import { View, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';

interface ComingSoonModalProps {
  visible: boolean;
  onClose: () => void;
  feature?: string;
}

export function ComingSoonModal({ visible, onClose, feature = 'This feature' }: ComingSoonModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.content}>
          <Ionicons name="rocket" size={48} color={COLORS.primary} />
          <Text variant="h2" align="center" style={{ marginTop: SPACING.md }}>Coming Soon!</Text>
          <Text variant="body" color="textSecondary" align="center" style={{ marginVertical: SPACING.md }}>
            {feature} will be available in a future update.
          </Text>
          <Button onPress={onClose}>OK</Button>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...LAYOUTS.center, flex: 1, backgroundColor: COLORS.overlay, padding: SPACING.xl },
  content: { ...LAYOUTS.center, backgroundColor: COLORS.surface, borderRadius: RADII.lg, padding: SPACING.xl, width: '100%', maxWidth: 300 },
});
```

---

## P10-07: Create SwapModal

```
Create apps/mobile/src/components/features/SwapModal.tsx:

import React, { useState } from 'react';
import { View, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Card } from '@/components/primitives';
import { ComingSoonModal } from './ComingSoonModal';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';

interface SwapModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SwapModal({ visible, onClose }: SwapModalProps) {
  const [showComingSoon, setShowComingSoon] = useState(false);

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text variant="label" align="center">WALLET</Text>

            <Card style={styles.tokenBox}>
              <View style={LAYOUTS.rowBetween}>
                <Text variant="label">SELL</Text>
                <Button variant="secondary" size="sm">SELECT TOKEN</Button>
              </View>
            </Card>

            <View style={[LAYOUTS.center, { marginVertical: SPACING.sm }]}>
              <View style={styles.swapIcon}>
                <Ionicons name="swap-vertical" size={20} color={COLORS.textPrimary} />
              </View>
            </View>

            <Card style={styles.tokenBox}>
              <View style={LAYOUTS.rowBetween}>
                <Text variant="label">BUY</Text>
                <Button variant="secondary" size="sm">SELECT TOKEN</Button>
              </View>
            </Card>

            <Button style={{ marginTop: SPACING.lg }} onPress={() => setShowComingSoon(true)}>SWAP</Button>
          </View>
        </Pressable>
      </Modal>
      <ComingSoonModal visible={showComingSoon} onClose={() => setShowComingSoon(false)} feature="Token Swap" />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADII.xl, borderTopRightRadius: RADII.xl, padding: SPACING.lg, paddingBottom: SPACING.xxl },
  handle: { width: 40, height: 4, backgroundColor: COLORS.surfaceLight, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.lg },
  tokenBox: { marginTop: SPACING.md },
  swapIcon: { ...LAYOUTS.center, width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surfaceLight },
});
```

---

## P10-08: Create Components Index

```
Create apps/mobile/src/components/features/index.ts:

export { TickerBanner } from './TickerBanner';
export { PostCard } from './PostCard';
export { LikeButton } from './LikeButton';
export { TokenList } from './TokenList';
export { PortfolioChart } from './PortfolioChart';
export { ComingSoonModal } from './ComingSoonModal';
export { SwapModal } from './SwapModal';
```

```
Create apps/mobile/src/components/index.ts:

export * from './primitives';
export * from './features';
```

---

## P10-09: Create Utility Functions

```
Create apps/mobile/src/utils/formatters.ts:

export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export function formatCurrency(amount: number): string {
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(1) + 'K';
  return '$' + amount.toFixed(2);
}

export function formatTimeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatPercentage(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
```

---

# Phase 11: Screens & Navigation

## P11-01: Create Login Screen

```
Create apps/mobile/app/login.tsx:

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { usePrivy } from '@privy-io/expo';
import { Text, Button, Spacer } from '@/components';
import { COLORS, SPACING } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';

export default function LoginScreen() {
  const { login } = usePrivy();

  return (
    <View style={[LAYOUTS.screen, LAYOUTS.center, styles.container]}>
      <View style={LAYOUTS.center}>
        <Text variant="h1" style={styles.logo}>M O M E N T O</Text>
        <Text variant="label" color="textSecondary">THE STOCK MARKET FOR CULTURE</Text>
      </View>

      <Spacer size="xxl" />
      <Spacer size="xxl" />

      <Button variant="secondary" size="lg" onPress={login} style={styles.button}>SIGN UP</Button>
      <Spacer size="md" />
      <Text variant="caption" onPress={login}>OR LOGIN</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: SPACING.xl },
  logo: { letterSpacing: 8, marginBottom: SPACING.md },
  button: { minWidth: 200 },
});
```

---

## P11-02: Create Home Screen

```
Create apps/mobile/app/(tabs)/home.tsx:

import React from 'react';
import { View, RefreshControl, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useFeed } from '@/hooks/useFeed';
import { TickerBanner, PostCard } from '@/components';
import { TRENDING_TICKERS, CREATORS_TO_WATCH } from '@/config/dummyData';
import { COLORS } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';

export default function HomeScreen() {
  const router = useRouter();
  const { posts, isLoading, refetch, fetchNextPage, hasNextPage } = useFeed();

  const handleTickerPress = () => router.push('/market');

  const ListHeader = () => (
    <View>
      <TickerBanner title="TRENDING" items={TRENDING_TICKERS} onPress={handleTickerPress} />
      <TickerBanner title="CREATORS TO WATCH" items={CREATORS_TO_WATCH} onPress={handleTickerPress} />
    </View>
  );

  return (
    <View style={LAYOUTS.screen}>
      <FlashList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={ListHeader}
        estimatedItemSize={400}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={COLORS.primary} />}
      />
    </View>
  );
}
```

---

## P11-03: Create Explore Screen

```
Create apps/mobile/app/(tabs)/explore.tsx:

import React, { useState } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFeed } from '@/hooks/useFeed';
import { Text, Button } from '@/components';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - 4) / 2;

type Tab = 'creators' | 'posts';

export default function ExploreScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const { posts } = useFeed();

  const items = posts.map((p, i) => ({
    id: p.id,
    imageUrl: p.mediaUrl || `https://picsum.photos/seed/${p.id}/400/500`,
    height: ITEM_WIDTH * (i % 2 === 0 ? 1.3 : 1.0),
  }));

  return (
    <View style={LAYOUTS.screen}>
      <View style={styles.tabContainer}>
        {(['creators', 'posts'] as Tab[]).map((tab) => (
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

      <FlatList
        data={items}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/post/${item.id}`)}>
            <Image
              source={{ uri: item.imageUrl }}
              style={{ width: ITEM_WIDTH, height: item.height, margin: 1 }}
              contentFit="cover"
              transition={200}
            />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: { ...LAYOUTS.row, backgroundColor: COLORS.surface, margin: SPACING.md, borderRadius: RADII.md, padding: SPACING.xs },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: RADII.sm },
  tabActive: { backgroundColor: COLORS.surfaceLight },
});
```

---

## P11-04: Create Profile Screen

```
Create apps/mobile/app/(tabs)/profile.tsx:

import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { Text, Button, Card, Spacer } from '@/components';
import { PortfolioChart, TokenList, SwapModal, ComingSoonModal } from '@/components';
import { COLORS, SPACING } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';
import { formatPercentage, formatCurrency } from '@/utils/formatters';
import { UserRole } from '@momento/shared';

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useUserProfile();
  const { data: wallet } = useWalletBalance();
  const [showSwap, setShowSwap] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);

  const isCreator = user?.role === UserRole.CREATOR;

  return (
    <View style={LAYOUTS.screen}>
      <View style={[LAYOUTS.rowBetween, styles.header]}>
        <Text variant="h2">{user?.displayName || user?.username || 'User'}</Text>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      {isCreator && (
        <View style={[LAYOUTS.row, styles.creatorTabs]}>
          <Button variant="ghost" size="sm" onPress={() => router.push('/edit-profile')}>EDIT PROFILE</Button>
          <Button variant="ghost" size="sm" onPress={() => router.push('/create-post')}>NEW POST</Button>
          <Button variant="secondary" size="sm">ACCOUNT</Button>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={LAYOUTS.center}>
          <Button variant="secondary" onPress={() => setShowSwap(true)}>WALLET</Button>
        </View>

        <Spacer size="md" />

        <View style={[LAYOUTS.row, styles.statsRow]}>
          <Card style={styles.statCard}>
            <Text variant="label">24H CHANGE</Text>
            <Spacer size="xs" />
            <Text variant="monoLarge" color={(wallet?.change24h || 0) >= 0 ? 'success' : 'error'}>
              {formatPercentage(wallet?.change24h || 0)}
            </Text>
          </Card>
          <Spacer size="md" horizontal />
          <Card style={styles.statCard}>
            <Text variant="label">EARNINGS TO DATE</Text>
            <Spacer size="xs" />
            <Text variant="monoLarge">{formatCurrency(wallet?.earningsToDate || 0)}</Text>
          </Card>
        </View>

        <PortfolioChart />

        <Text variant="label" style={styles.sectionTitle}>PORTFOLIO</Text>
        <TokenList tokens={wallet?.tokens || []} onBuyPress={() => setShowComingSoon(true)} />

        <Spacer size="xxl" />
      </ScrollView>

      <SwapModal visible={showSwap} onClose={() => setShowSwap(false)} />
      <ComingSoonModal visible={showComingSoon} onClose={() => setShowComingSoon(false)} feature="Token Trading" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: SPACING.md, paddingTop: SPACING.xl },
  creatorTabs: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  statsRow: { paddingHorizontal: SPACING.md },
  statCard: { flex: 1 },
  sectionTitle: { paddingHorizontal: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.sm },
});
```

---

## P11-05: Create Tab Layout

```
Create apps/mobile/app/(tabs)/_layout.tsx:

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/styles/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: COLORS.background, borderTopColor: COLORS.surface },
        tabBarActiveTintColor: COLORS.textPrimary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="home" options={{ tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="explore" options={{ tabBarIcon: ({ color, size }) => <Ionicons name="globe-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }} />
    </Tabs>
  );
}
```

---

## P11-06: Create Root Layout

```
Create apps/mobile/app/_layout.tsx:

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PrivyProvider } from '@privy-io/expo';
import { QueryProvider } from '@/providers/QueryProvider';
import { LocationProvider } from '@/providers/LocationProvider';
import { NotificationProvider } from '@/providers/NotificationProvider';
import { api } from '@/services/api';
import { COLORS } from '@/styles/theme';
import ENV from '@/config/env';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <PrivyProvider
            appId={ENV.PRIVY_APP_ID}
            onSuccess={(user) => {
              // Set token getter for API calls
              api.setTokenGetter(async () => user.getAccessToken());
            }}
          >
            <LocationProvider>
              <NotificationProvider>
                <StatusBar style="light" />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}>
                  <Stack.Screen name="login" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="creator/[id]" options={{ presentation: 'card' }} />
                  <Stack.Screen name="post/[id]" options={{ presentation: 'card' }} />
                  <Stack.Screen name="market" options={{ presentation: 'card' }} />
                  <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="create-post" options={{ presentation: 'modal' }} />
                </Stack>
              </NotificationProvider>
            </LocationProvider>
          </PrivyProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

---

## P11-07: Create Index Redirect

```
Create apps/mobile/app/index.tsx:

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { COLORS } from '@/styles/theme';
import { LAYOUTS } from '@/styles/layouts';

export default function Index() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (ready) {
      router.replace(authenticated ? '/(tabs)/home' : '/login');
    }
  }, [ready, authenticated]);

  return (
    <View style={[LAYOUTS.screen, LAYOUTS.center]}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}
```

---

# Continue to Part 5...

Part 5 covers:
- Phase 12: Remaining Screens (Creator, Post, Market, Edit, Create)
- Phase 13: Seed Data
- Phase 14: Deployment
