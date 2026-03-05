import { useInfiniteQuery } from '@tanstack/react-query';
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

interface UseFeedOptions {
  /** Override the default radius tier progression. */
  radiusKm?: number;
  /** Whether to enable the query. Defaults to true. */
  enabled?: boolean;
}

export function useFeed(options: UseFeedOptions = {}) {
  const { location } = useLocation();
  const { radiusKm, enabled = true } = options;

  return useInfiniteQuery<FeedResponse>({
    queryKey: [
      'feed',
      location?.latitude,
      location?.longitude,
      radiusKm,
    ],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined;

      // Determine radius: use override or try auto-expanding
      let currentRadius = radiusKm ?? RADIUS_TIERS_KM[0];
      let response: FeedResponse | null = null;

      if (radiusKm !== undefined) {
        // Fixed radius — just fetch
        response = await apiService.get<FeedResponse>('/feed', {
          latitude: location?.latitude,
          longitude: location?.longitude,
          radiusKm: currentRadius,
          cursor,
        });
      } else {
        // Auto-expanding radius
        for (const tier of RADIUS_TIERS_KM) {
          currentRadius = tier;
          response = await apiService.get<FeedResponse>('/feed', {
            latitude: location?.latitude,
            longitude: location?.longitude,
            radiusKm: tier,
            cursor,
          });

          // If we have enough posts or this is the first page with a cursor,
          // stop expanding
          if (response.posts.length >= MIN_POSTS || cursor) {
            break;
          }
        }
      }

      return response!;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: enabled && location !== null,
    staleTime: 30_000,
  });
}
