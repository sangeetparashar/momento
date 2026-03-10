import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as Location from 'expo-location';
import { apiService } from '@/services/api';

/** How often to refresh the user's location (5 minutes). */
const LOCATION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/** Haversine distance in meters between two lat/lng points. */
function getDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

interface LocationContextValue {
  /** Current device location, or null if not yet resolved. */
  location: LocationCoords | null;
  /** Whether the initial location request is still pending. */
  isLoading: boolean;
  /** Human-readable error string, if permission was denied or location failed. */
  error: string | null;
  /** Whether location permissions have been granted. */
  hasPermission: boolean;
  /** Manually trigger a location refresh. */
  refresh: () => Promise<void>;
}

const LocationContext = createContext<LocationContextValue>({
  location: null,
  isLoading: true,
  error: null,
  hasPermission: false,
  refresh: async () => {},
});

interface LocationProviderProps {
  children: React.ReactNode;
}

export function LocationProvider({ children }: LocationProviderProps) {
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncedRef = useRef<{ lat: number; lng: number } | null>(null);

  const fetchLocation = useCallback(async () => {
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to get location';
      setError(message);
    }
  }, []);

  const requestPermissionAndFetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setHasPermission(false);
        setError('Location permission was denied. Some features may be limited.');
        setIsLoading(false);
        return;
      }
      setHasPermission(true);
      await fetchLocation();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to request location permission';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchLocation]);

  const refresh = useCallback(async () => {
    if (!hasPermission) {
      await requestPermissionAndFetch();
    } else {
      await fetchLocation();
    }
  }, [hasPermission, requestPermissionAndFetch, fetchLocation]);

  // Request permission and start polling on mount
  useEffect(() => {
    requestPermissionAndFetch();

    intervalRef.current = setInterval(() => {
      fetchLocation();
    }, LOCATION_REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [requestPermissionAndFetch, fetchLocation]);

  // Sync location to server when it changes significantly (>500m)
  useEffect(() => {
    if (!location) return;

    const shouldSync =
      !lastSyncedRef.current ||
      getDistanceMeters(
        lastSyncedRef.current.lat,
        lastSyncedRef.current.lng,
        location.latitude,
        location.longitude,
      ) > 500;

    if (shouldSync) {
      apiService
        .patch('/users/me/location', {
          latitude: location.latitude,
          longitude: location.longitude,
        })
        .then(() => {
          lastSyncedRef.current = {
            lat: location.latitude,
            lng: location.longitude,
          };
        })
        .catch(() => {
          // Non-critical — silently retry on next location change
        });
    }
  }, [location]);

  return (
    <LocationContext.Provider
      value={{ location, isLoading, error, hasPermission, refresh }}
    >
      {children}
    </LocationContext.Provider>
  );
}

/**
 * Access the current location context.
 * Must be used within a <LocationProvider />.
 */
export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return ctx;
}
