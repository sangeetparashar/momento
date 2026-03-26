import { useRef, useCallback, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import type { FeedResponse } from '@momento/shared';
import { apiService } from '@/services/api';
import { useLocation } from '@/providers/LocationProvider';

export type FeedSortMode = 'smart' | 'recent' | 'popular' | 'nearby' | 'following';

interface UseFeedOptions {
  /** Override the default radius tier progression. */
  radiusKm?: number;
  /** Feed sort/ranking mode. Defaults to 'smart'. */
  sort?: FeedSortMode;
  /** Whether to enable the query. Defaults to true. */
  enabled?: boolean;
}

export function useFeed(options: UseFeedOptions = {}, currentIndex = 0) {
  const { location } = useLocation();
  const { radiusKm, sort = 'smart', enabled = true } = options;

  /**
   * Cache the resolved radius from the server so subsequent pagination
   * uses the same radius (avoids re-expanding on page 2+).
   * Reset on pull-to-refresh.
   */
  const resolvedRadiusRef = useRef<number | null>(null);

  const query = useInfiniteQuery<FeedResponse>({
    queryKey: [
      'feed',
      location ? Math.round(location.latitude * 100) / 100 : null,
      location ? Math.round(location.longitude * 100) / 100 : null,
      radiusKm,
      sort,
    ],
    queryFn: async ({ pageParam }) => {
      const page = (pageParam as number) ?? 0;

      // Build query params — let the server handle radius expansion
      const params: Record<string, string | number | boolean | undefined> = {
        lat: location?.latitude,
        lng: location?.longitude,
        sort,
        page,
      };

      if (radiusKm !== undefined) {
        // User set a fixed radius
        params.radius = radiusKm;
      } else if (page > 0 && resolvedRadiusRef.current) {
        // Paginating — reuse the radius the server resolved on page 0
        params.radius = resolvedRadiusRef.current;
      } else {
        // First page, no fixed radius — tell server to auto-expand
        params.expandRadius = true;
      }

      const response = await apiService.get<FeedResponse>('/feed', params);

      // Cache the server-resolved radius for subsequent pages
      if ((response as any).radiusKm) {
        resolvedRadiusRef.current = (response as any).radiusKm;
      }

      return response;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length : undefined,
    enabled: enabled && !!location,
    staleTime: 30_000,
  });

  // Auto-prefetch page 2 after the first page loads (TikTok-style)
  // Only prefetch once — subsequent pages are fetched via onEndReached.
  const pageCount = query.data?.pages?.length ?? 0;
  const hasPrefetched = useRef(false);
  useEffect(() => {
    if (pageCount === 1 && !hasPrefetched.current && query.hasNextPage && !query.isFetchingNextPage) {
      hasPrefetched.current = true;
      const timer = setTimeout(() => query.fetchNextPage(), 2000);
      return () => clearTimeout(timer);
    }
  }, [pageCount, query.hasNextPage, query.isFetchingNextPage]);

  // Prefetch images ahead of the current scroll position (5 ahead of currentIndex)
  const prefetchedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!query.data?.pages) return;
    const allPosts = query.data.pages.flatMap((page) => page.posts);
    // Prefetch the next 5 images starting from the post after currentIndex
    const upcoming = allPosts.slice(currentIndex + 1, currentIndex + 6);
    const urls = upcoming
      .map((post) => post.mediaUrl)
      .filter((url): url is string => !!url && !url.endsWith('.mp4') && !url.endsWith('.mov') && !url.endsWith('.webm'))
      .filter((url) => !prefetchedRef.current.has(url));
    if (urls.length > 0) {
      urls.forEach((url) => prefetchedRef.current.add(url));
      Image.prefetch(urls);
    }
  }, [query.data?.pages, currentIndex]);

  /**
   * Pull-to-refresh handler: resets the cached radius so the server
   * re-expands from the smallest tier, then refetches.
   */
  const refreshFeed = useCallback(async () => {
    resolvedRadiusRef.current = null;
    hasPrefetched.current = false;
    await query.refetch();
  }, [query]);

  return { ...query, refreshFeed };
}
