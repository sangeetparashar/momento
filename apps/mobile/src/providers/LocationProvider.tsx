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

/** How long to wait for GPS before using fallback (seconds). */
const LOCATION_TIMEOUT_S = 8;

/**
 * Fallback location used when the device can't provide GPS
 * (e.g., emulator without GPS fix, airplane mode, etc.).
 * Toronto, ON — where seed creator data is located.
 */
const FALLBACK_LOCATION: LocationCoords = {
  latitude: 43.6532,
  longitude: -79.3832,
};

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

const LocationContext = createContext<LocationContextValue | null>(null);

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
      console.log('[Location] Fetching current position...');
      // Race between real GPS and a timeout — emulators often hang forever
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), LOCATION_TIMEOUT_S * 1000)
      );
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const result = await Promise.race([locationPromise, timeoutPromise]);

      if (result) {
        console.log('[Location] Got position:', result.coords.latitude, result.coords.longitude);
        setLocation({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
        });
      } else {
        // GPS timed out — use fallback so the feed still works
        console.log('[Location] GPS timed out, using fallback:', FALLBACK_LOCATION.latitude, FALLBACK_LOCATION.longitude);
        setLocation(FALLBACK_LOCATION);
      }
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to get location';
      console.log('[Location] Error, using fallback:', message);
      // Use fallback instead of leaving location null
      setLocation(FALLBACK_LOCATION);
      setError(message);
    }
  }, []);

  const requestPermissionAndFetch = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log('[Location] Requesting foreground permission...');
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[Location] Permission status:', status);
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
      console.log('[Location] Permission error:', message);
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
  if (ctx === null) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return ctx;
}
