import React from 'react';
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { PostCard, FavoritesSkeleton } from '@/components/features';
import { useSavedPosts } from '@/hooks';
import { COLORS, SPACING } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import type { PostWithCreator } from '@momento/shared';

export default function FavoritesScreen() {
  const router = useRouter();
  const { posts, isLoading, hasMore, fetchMore, isFetchingMore } = useSavedPosts();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Favorites</Text>
        <View style={{ width: 28 }} />
      </View>

      {isLoading ? (
        <FavoritesSkeleton />
      ) : posts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="heart-outline" size={48} color={COLORS.textTertiary} />
          <Text style={styles.emptyText}>No saved posts yet</Text>
          <Text style={styles.emptySubtext}>Posts you save will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item: PostWithCreator) => item.id}
          renderItem={({ item }) => <PostCard post={item} />}
          onEndReached={() => hasMore && fetchMore()}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingMore ? <ActivityIndicator color={COLORS.primary} /> : null
          }
          showsVerticalScrollIndicator={false}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 18,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
});
