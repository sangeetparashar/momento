import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';

// expo-notifications is not available in Expo Go (removed in SDK 53+).
// We dynamically require it and no-op when unavailable.
let Notifications: typeof import('expo-notifications') | null = null;
const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
  } catch {
    Notifications = null;
  }
}

interface NotificationsApiResponse {
  notifications: any[];
  unreadCount: number;
  hasMore: boolean;
}

interface NotificationContextValue {
  /** The Expo push token string, or null if not yet registered. */
  pushToken: string | null;
  /** The most recent notification received while the app was foregrounded. */
  lastNotification: any | null;
  /** Number of unread notifications. */
  unreadCount: number;
  /** Refresh the unread count from server. */
  refreshUnreadCount: () => void;
  /** Whether the initial notification fetch is complete. */
  isLoaded: boolean;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/** Query key for notifications — can be used by index.tsx for prefetching */
export const NOTIFICATIONS_QUERY_KEY = (userId?: string | null) =>
  ['notifications-count', userId ?? 'anon'];

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [lastNotification, setLastNotification] = useState<any | null>(null);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();

  // Use React Query for notification count — enables prefetching from index.tsx
  // and integrates with the query cache for instant display.
  const notifQuery = useQuery<NotificationsApiResponse>({
    queryKey: NOTIFICATIONS_QUERY_KEY(authUser?.id),
    queryFn: () => apiService.get<NotificationsApiResponse>('/notifications?limit=1'),
    enabled: !!authUser,
    staleTime: 15_000, // 15 seconds before refetching
    refetchInterval: 30_000, // Poll every 30 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const unreadCount = notifQuery.data?.unreadCount ?? 0;
  const isLoaded = !notifQuery.isLoading || !authUser;

  const refreshUnreadCount = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY(authUser?.id) });
  }, [queryClient, authUser?.id]);

  // ---------------------------------------------------------------------------
  // Token registration
  // ---------------------------------------------------------------------------

  const registerForPushNotifications = useCallback(async () => {
    if (!Notifications) {
      console.warn('[Notifications] expo-notifications not available — push will not work');
      return;
    }

    try {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') return;

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });
      const token = tokenData.data;
      console.log('[Notifications] Got push token:', token);
      setPushToken(token);

      try {
        await apiService.post('/users/me/push-token', { pushToken: token });
        console.log('[Notifications] Push token registered with API');
      } catch (regErr) {
        console.warn('[Notifications] Push token registration failed:', regErr);
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#00FF88',
        });
      }
    } catch (err) {
      console.warn('Push notification setup failed:', err);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Notification tap handling
  // ---------------------------------------------------------------------------

  const handleNotificationResponse = useCallback(
    (response: any) => {
      const data = response?.notification?.request?.content?.data as
        | Record<string, string>
        | undefined;

      if (!data) return;

      if (data.type === 'post' && data.postId) {
        router.push(`/post/${data.postId}`);
      } else if (data.type === 'creator' && data.creatorId) {
        router.push(`/creator/${data.creatorId}`);
      } else if (data.type === 'wallet') {
        router.push('/wallet');
      }
    },
    [router],
  );

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!Notifications) {
      console.warn('[Notifications] expo-notifications not available — skipping listener setup');
      return;
    }

    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    } catch {
      // Firebase not configured
    }

    registerForPushNotifications();

    try {
      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          setLastNotification(notification);
          // Immediately refresh count — notification already stored server-side
          refreshUnreadCount();
        });

      responseListener.current =
        Notifications.addNotificationResponseReceivedListener(
          handleNotificationResponse,
        );
    } catch {
      console.warn('Notification listeners could not be registered (Firebase not configured)');
    }

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, [registerForPushNotifications, handleNotificationResponse, refreshUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{ pushToken, lastNotification, unreadCount, refreshUnreadCount, isLoaded }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Access the notification context.
 * Must be used within a <NotificationProvider />.
 */
export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (ctx === null) {
    throw new Error(
      'useNotifications must be used within a NotificationProvider',
    );
  }
  return ctx;
}
