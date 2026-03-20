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
import { apiService } from '@/services/api';

// expo-notifications is not available in Expo Go (removed in SDK 53+).
// We dynamically require it and no-op when unavailable.
// Note: setNotificationHandler is deferred to the provider component to
// avoid triggering Firebase initialization at module import time (which
// crashes if google-services.json is not configured).
let Notifications: typeof import('expo-notifications') | null = null;
const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
  } catch {
    Notifications = null;
  }
}

interface NotificationContextValue {
  /** The Expo push token string, or null if not yet registered. */
  pushToken: string | null;
  /** The most recent notification received while the app was foregrounded. */
  lastNotification: any | null;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [lastNotification, setLastNotification] = useState<any | null>(null);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // Token registration
  // ---------------------------------------------------------------------------

  const registerForPushNotifications = useCallback(async () => {
    if (!Notifications) return; // Not available in Expo Go

    try {
      // Request permission
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return;
      }

      // Get the Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });
      const token = tokenData.data;
      setPushToken(token);

      // Register the token with our API (fire and forget)
      try {
        await apiService.post('/users/me/push-token', { pushToken: token });
      } catch {
        // Silently fail — token registration is non-critical
      }

      // Android-specific notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#00FF88',
        });
      }
    } catch (err) {
      // Firebase/FCM not configured — silently degrade
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

      // Route based on notification payload
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
    if (!Notifications) return; // Not available in Expo Go

    // Set notification handler inside useEffect (wrapped in try/catch)
    // to avoid triggering Firebase init at module level
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
      // Firebase not configured — notifications won't work but app continues
    }

    registerForPushNotifications();

    // Listen for notifications received while app is foregrounded
    try {
      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          setLastNotification(notification);
        });

      // Listen for notification taps
      responseListener.current =
        Notifications.addNotificationResponseReceivedListener(
          handleNotificationResponse,
        );
    } catch {
      // Firebase/FCM not initialized — listeners can't be registered
      console.warn('Notification listeners could not be registered (Firebase not configured)');
    }

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [registerForPushNotifications, handleNotificationResponse]);

  return (
    <NotificationContext.Provider value={{ pushToken, lastNotification }}>
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
