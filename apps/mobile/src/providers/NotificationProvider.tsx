import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-constants';
import { useRouter } from 'expo-router';
import { apiService } from '@/services/api';

/** Configure how notifications are presented when the app is foregrounded. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface NotificationContextValue {
  /** The Expo push token string, or null if not yet registered. */
  pushToken: string | null;
  /** The most recent notification received while the app was foregrounded. */
  lastNotification: Notifications.Notification | null;
}

const NotificationContext = createContext<NotificationContextValue>({
  pushToken: null,
  lastNotification: null,
});

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [lastNotification, setLastNotification] =
    useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // Token registration
  // ---------------------------------------------------------------------------

  const registerForPushNotifications = useCallback(async () => {
    // Push notifications only work on physical devices
    if (!Device.default.isDevice) {
      return;
    }

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
      projectId: Device.default.expoConfig?.extra?.eas?.projectId,
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
  }, []);

  // ---------------------------------------------------------------------------
  // Notification tap handling
  // ---------------------------------------------------------------------------

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as
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
    registerForPushNotifications();

    // Listen for notifications received while app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        setLastNotification(notification);
      });

    // Listen for notification taps
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(
          notificationListener.current,
        );
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
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
  if (!ctx) {
    throw new Error(
      'useNotifications must be used within a NotificationProvider',
    );
  }
  return ctx;
}
