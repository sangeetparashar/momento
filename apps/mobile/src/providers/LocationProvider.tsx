import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { apiService } from '@/services/api';

/** How often to refresh the user's location (15 minutes). */
const LOCATION_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

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

  // Sync location to server when it changes significantly
  const lastSyncedLocation = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!location) return;

    // Only sync if location changed significantly (>500m) or first sync
    const prev = lastSyncedLocation.current;
    if (prev) {
      const dlat = location.latitude - prev.latitude;
      const dlng = location.longitude - prev.longitude;
      // Rough distance check (~500m at equator)
      const dist = Math.sqrt(dlat * dlat + dlng * dlng);
      if (dist < 0.005) return; // ~500m threshold
    }

    lastSyncedLocation.current = { latitude: location.latitude, longitude: location.longitude };

    // Fire and forget — don't block on this
    apiService.post('/users/me/location', {
      latitude: location.latitude,
      longitude: location.longitude,
    }).catch(() => {
      // Silently fail — location sync is non-critical
    });
  }, [location]);

  // Request permission and start polling on mount; pause when backgrounded
  useEffect(() => {
    requestPermissionAndFetch();

    const startPolling = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        fetchLocation();
      }, LOCATION_REFRESH_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    startPolling();

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // Refresh immediately when foregrounded, then resume interval
        fetchLocation();
        startPolling();
      } else {
        stopPolling();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [requestPermissionAndFetch, fetchLocation]);

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
