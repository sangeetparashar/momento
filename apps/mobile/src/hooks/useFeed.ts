import { useRef, useCallback, useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import type { FeedResponse } from '@momento/shared';
import { apiService } from '@/services/api';
import { useLocation } from '@/providers/LocationProvider';

export type FeedSortMode = 'smart' | 'recent' | 'popular' | 'nearby' | 'following';

interface UseFeedOptions {
  /** Feed sort/ranking mode. Defaults to 'smart'. */
  sort?: FeedSortMode;
  /** Whether to enable the query. Defaults to true. */
  enabled?: boolean;
}

/**
 * Two-phase feed hook:
 *
 * Phase 1 (instant): Fetch recent posts globally — no geo, no auth overhead.
 *   GET /feed?fast=true&page=0
 *
 * Phase 2 (background): Once location resolves, fetch geo-sorted + ranked feed.
 *   GET /feed?lat=X&lng=Y&sort=smart&page=0
 *
 * The home screen renders phase 1 data immediately, then crossfades to
 * phase 2 when it arrives. `phase` tells the UI which dataset is active.
 */
export function useFeed(options: UseFeedOptions = {}, currentIndex = 0) {
  const { location } = useLocation();
  const { sort = 'smart', enabled = true } = options;
  const [phase, setPhase] = useState<'fast' | 'geo'>('fast');

  // ─── Phase 1: fast global feed (no geo dependency) ───
  const fastQuery = useInfiniteQuery<FeedResponse>({
    queryKey: ['feed', 'fast'],
    queryFn: async ({ pageParam }) => {
      const page = (pageParam as number) ?? 0;
      return apiService.get<FeedResponse>('/feed', { fast: true, page });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length : undefined,
    enabled,
    staleTime: 30_000,
  });

  // ─── Phase 2: geo-sorted feed (fires when location is available) ───
  const geoQuery = useInfiniteQuery<FeedResponse>({
    queryKey: [
      'feed',
      'geo',
      location ? Math.round(location.latitude * 100) / 100 : null,
      location ? Math.round(location.longitude * 100) / 100 : null,
      sort,
    ],
    queryFn: async ({ pageParam }) => {
      const page = (pageParam as number) ?? 0;
      return apiService.get<FeedResponse>('/feed', {
        lat: location?.latitude,
        lng: location?.longitude,
        sort,
        page,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length : undefined,
    enabled: enabled && !!location,
    staleTime: 30_000,
  });

  // Transition to geo phase once geo data arrives
  useEffect(() => {
    if (geoQuery.data?.pages && geoQuery.data.pages.length > 0 && geoQuery.data.pages[0].posts.length > 0) {
      setPhase('geo');
    }
  }, [geoQuery.data?.pages]);

  // Pick the active query based on phase
  const activeQuery = phase === 'geo' ? geoQuery : fastQuery;

  // Prefetch images ahead of the current scroll position (2 ahead)
  const prefetchedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!activeQuery.data?.pages) return;
    const allPosts = activeQuery.data.pages.flatMap((page) => page.posts);
    const upcoming = allPosts.slice(currentIndex + 1, currentIndex + 3);
    const urls = upcoming
      .map((post) => post.mediaUrl)
      .filter((url): url is string => !!url && !url.endsWith('.mp4') && !url.endsWith('.mov') && !url.endsWith('.webm'))
      .filter((url) => !prefetchedRef.current.has(url));
    if (urls.length > 0) {
      urls.forEach((url) => prefetchedRef.current.add(url));
      Image.prefetch(urls);
    }
  }, [activeQuery.data?.pages, currentIndex]);

  // Prefetch page 2 after initial load
  useEffect(() => {
    if (activeQuery.data?.pages?.length === 1 && activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
      const timer = setTimeout(() => activeQuery.fetchNextPage(), 2000);
      return () => clearTimeout(timer);
    }
  }, [activeQuery.data?.pages?.length]);

  /**
   * Pull-to-refresh: reset to fast phase, refetch both.
   */
  const refreshFeed = useCallback(async () => {
    setPhase('fast');
    await Promise.all([fastQuery.refetch(), geoQuery.refetch()]);
  }, [fastQuery, geoQuery]);

  return {
    ...activeQuery,
    refreshFeed,
    /** Which phase the feed is currently showing. */
    phase,
  };
}
