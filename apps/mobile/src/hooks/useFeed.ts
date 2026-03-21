import { useRef, useCallback, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import type { FeedResponse } from '@momento/shared';
import { apiService } from '@/services/api';
import { useLocation } from '@/providers/LocationProvider';

/**
 * Radius tiers for auto-expanding search (in km).
 * If a tier returns fewer than MIN_POSTS results and there are more tiers,
 * the hook automatically advances to the next radius.
 */
const RADIUS_TIERS_KM = [5, 10, 25, 50, 100] as const;
const MIN_POSTS = 3;

export type FeedSortMode = 'smart' | 'recent' | 'popular' | 'nearby' | 'following';

interface UseFeedOptions {
  /** Override the default radius tier progression. */
  radiusKm?: number;
  /** Feed sort/ranking mode. Defaults to 'smart'. */
  sort?: FeedSortMode;
  /** Whether to enable the query. Defaults to true. */
  enabled?: boolean;
}

// Default fallback location (New York City) when device location is unavailable
const DEFAULT_LOCATION = { latitude: 40.7128, longitude: -74.006 };

export function useFeed(options: UseFeedOptions = {}) {
  const { location: deviceLocation } = useLocation();
  const { radiusKm, sort = 'smart', enabled = true } = options;

  // Use device location if available, otherwise fall back to default
  const location = deviceLocation ?? DEFAULT_LOCATION;

  /**
   * Cache the last radius tier that returned enough posts so subsequent
   * fetches (pagination, background refetches) skip the smaller tiers.
   * Reset to null only on explicit pull-to-refresh.
   */
  const lastSuccessfulRadius = useRef<number | null>(null);

  const query = useInfiniteQuery<FeedResponse>({
    queryKey: [
      'feed',
      location ? Math.round(location.latitude * 100) / 100 : null,
      location ? Math.round(location.longitude * 100) / 100 : null,
      radiusKm,
      sort,
    ],
    queryFn: async ({ pageParam }) => {
      // location is always available (device or default fallback)
      const page = (pageParam as number) ?? 0;

      // Determine radius: use override or try auto-expanding
      let currentRadius = radiusKm ?? RADIUS_TIERS_KM[0];
      let response: FeedResponse | null = null;

      if (radiusKm !== undefined) {
        // Fixed radius — just fetch
        response = await apiService.get<FeedResponse>('/feed', {
          lat: location?.latitude,
          lng: location?.longitude,
          radius: currentRadius,
          sort,
          page,
        });
      } else {
        // Auto-expanding radius — start from cached tier if available
        const startTierIndex = lastSuccessfulRadius.current
          ? RADIUS_TIERS_KM.indexOf(lastSuccessfulRadius.current as (typeof RADIUS_TIERS_KM)[number])
          : 0;
        const startIndex = startTierIndex >= 0 ? startTierIndex : 0;

        for (let i = startIndex; i < RADIUS_TIERS_KM.length; i++) {
          const tier = RADIUS_TIERS_KM[i];
          currentRadius = tier;
          response = await apiService.get<FeedResponse>('/feed', {
            lat: location?.latitude,
            lng: location?.longitude,
            radius: tier,
            sort,
            page,
          });

          // If we have enough posts or paginating, stop expanding
          if (response.posts.length >= MIN_POSTS || page > 0) {
            break;
          }
        }

        // Cache the winning tier for future fetches
        lastSuccessfulRadius.current = currentRadius;
      }

      return response!;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length : undefined,
    enabled,
    staleTime: 30_000,
  });

  // Prefetch next few images for faster rendering (limit to 5 at a time)
  const prefetchedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!query.data?.pages) return;
    const urls = query.data.pages
      .flatMap((page) => page.posts)
      .map((post) => post.mediaUrl)
      .filter((url): url is string => !!url && !url.endsWith('.mp4') && !url.endsWith('.mov') && !url.endsWith('.webm'))
      .filter((url) => !prefetchedRef.current.has(url))
      .slice(0, 5);
    if (urls.length > 0) {
      urls.forEach((url) => prefetchedRef.current.add(url));
      Image.prefetch(urls);
    }
  }, [query.data?.pages]);

  /**
   * Pull-to-refresh handler: resets the cached radius so the expansion
   * starts fresh from the smallest tier, then refetches.
   */
  const refreshFeed = useCallback(async () => {
    lastSuccessfulRadius.current = null;
    await query.refetch();
  }, [query]);

  return { ...query, refreshFeed };
}
