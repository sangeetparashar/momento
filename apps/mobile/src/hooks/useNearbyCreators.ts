import { useQuery } from '@tanstack/react-query';
import type { NearbyCreatorsResponse } from '@momento/shared';
import { apiService } from '@/services/api';
import { useLocation } from '@/providers/LocationProvider';

/**
 * Fetch nearby creators based on the user's current location.
 */
export function useNearbyCreators() {
  const { location } = useLocation();

  return useQuery<NearbyCreatorsResponse>({
    queryKey: ['creators', 'nearby', location?.latitude, location?.longitude],
    queryFn: () =>
      apiService.get<NearbyCreatorsResponse>('/creators/nearby', {
        lat: location?.latitude,
        lng: location?.longitude,
        radius: 50,
      }),
    enabled: !!location,
  });
}
