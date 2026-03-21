import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@momento/notifications';
const MAX_NOTIFICATIONS = 100;

export interface StoredNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  createdAt: string;
  read: boolean;
}

/**
 * Save a new notification to local storage (FIFO, max 100).
 */
export async function saveNotification(
  notification: Omit<StoredNotification, 'id' | 'createdAt' | 'read'> & {
    data?: Record<string, string>;
  },
): Promise<void> {
  const existing = await getNotifications();
  const entry: StoredNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    createdAt: new Date().toISOString(),
    read: false,
  };

  // Prepend new notification; trim to max
  const updated = [entry, ...existing].slice(0, MAX_NOTIFICATIONS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Get all stored notifications (newest first).
 */
export async function getNotifications(): Promise<StoredNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredNotification[];
  } catch {
    return [];
  }
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(id: string): Promise<void> {
  const notifications = await getNotifications();
  const updated = notifications.map((n) =>
    n.id === id ? { ...n, read: true } : n,
  );
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Mark all notifications as read.
 */
export async function markAllAsRead(): Promise<void> {
  const notifications = await getNotifications();
  const updated = notifications.map((n) => ({ ...n, read: true }));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Get the count of unread notifications.
 */
export async function getUnreadCount(): Promise<number> {
  const notifications = await getNotifications();
  return notifications.filter((n) => !n.read).length;
}

/**
 * Clear all stored notifications.
 */
export async function clearNotifications(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
