import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import { useLocation } from '@/providers/LocationProvider';
import type { PublicCreator } from '@momento/shared';

interface NearbyCreatorsResponse {
  creators: PublicCreator[];
}

export function useNearbyCreators(radius = 50) {
  const { location } = useLocation();

  const query = useQuery<NearbyCreatorsResponse>({
    queryKey: ['creators', 'nearby', location?.latitude, location?.longitude, radius],
    queryFn: () =>
      apiService.get<NearbyCreatorsResponse>('/creators/nearby', {
        lat: location!.latitude,
        lng: location!.longitude,
        radius,
      }),
    enabled: !!location,
    staleTime: 2 * 60 * 1000, // 2 minutes, matches API cache TTL
  });

  return {
    creators: query.data?.creators ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
