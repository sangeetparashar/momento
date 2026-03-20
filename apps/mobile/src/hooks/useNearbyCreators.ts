import { useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import { useLocation } from '@/providers/LocationProvider';
import type { PublicCreator } from '@momento/shared';

interface NearbyCreatorsPage {
  creators: PublicCreator[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function useNearbyCreators(radius = 50) {
  const { location } = useLocation();

  const query = useInfiniteQuery<NearbyCreatorsPage>({
    queryKey: [
      'creators',
      'nearby',
      location ? Math.round(location.latitude * 100) / 100 : null,
      location ? Math.round(location.longitude * 100) / 100 : null,
      radius,
    ],
    queryFn: ({ pageParam }) => {
      if (!location) throw new Error('Location not available');
      const params: Record<string, any> = {
        lat: location.latitude,
        lng: location.longitude,
        radius,
      };
      if (pageParam) {
        params.cursor = pageParam;
      }
      return apiService.get<NearbyCreatorsPage>('/creators/nearby', params);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!location,
    staleTime: 2 * 60 * 1000,
  });

  const creators = query.data?.pages.flatMap((p) => p.creators) ?? [];

  const refreshCreators = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    creators,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    refreshCreators,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
