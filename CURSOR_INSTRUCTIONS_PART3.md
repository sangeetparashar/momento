# Momento - Cursor Instructions (Part 3)
# Mobile Foundation, Style System & Hooks

---

# Phase 7: Mobile Foundation

## P7-01: Create Config Files

```
Create apps/mobile/src/config/env.ts:

const ENV = {
  API_URL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000',
  PRIVY_APP_ID: process.env.EXPO_PUBLIC_PRIVY_APP_ID || '',
  PROJECT_ID: process.env.EXPO_PUBLIC_PROJECT_ID || '',
};

if (!ENV.PRIVY_APP_ID) {
  console.warn('Missing EXPO_PUBLIC_PRIVY_APP_ID');
}

export default ENV;
```

```
Create apps/mobile/src/config/dummyData.ts:

// Hardcoded ticker data - no API call needed for MVP
export const TRENDING_TICKERS = [
  { symbol: 'DEEL', change: 12.5 },
  { symbol: 'BELLE', change: -3.2 },
  { symbol: 'NAAN', change: 8.7 },
  { symbol: 'AURA', change: 24.1 },
  { symbol: 'SEAM', change: -1.5 },
];

export const CREATORS_TO_WATCH = [
  { symbol: 'TASH', change: 45.2 },
  { symbol: 'TEAH', change: 18.9 },
  { symbol: 'TWSH', change: 7.3 },
  { symbol: 'CHCTS', change: -2.1 },
];

// Dummy market data for market screen
export const DUMMY_TOKENS = [
  { symbol: 'DEEL', name: 'Deela', price: 142.50, change24h: 12.5, marketCap: 1200000 },
  { symbol: 'BELLE', name: 'Belle', price: 89.20, change24h: -3.2, marketCap: 890000 },
  { symbol: 'NAAN', name: 'Naan', price: 67.80, change24h: 8.7, marketCap: 2100000 },
  { symbol: 'AURA', name: 'Aura', price: 203.40, change24h: 24.1, marketCap: 450000 },
  { symbol: 'SEAM', name: 'Seam', price: 45.60, change24h: -1.5, marketCap: 780000 },
];
```

```
Create apps/mobile/src/config/index.ts:

export { default as ENV } from './env';
export * from './dummyData';
```

---

## P7-02: Create API Service

```
Create apps/mobile/src/services/api.ts:

import ENV from '@/config/env';

class ApiService {
  private baseUrl: string;
  private getToken: (() => Promise<string | null>) | null = null;

  constructor() {
    this.baseUrl = ENV.API_URL;
  }

  setTokenGetter(getter: () => Promise<string | null>) {
    this.getToken = getter;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (this.getToken) {
      const token = await this.getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.append(k, v);
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: await this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  }

  async patch<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PATCH',
      headers: await this.getHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  }

  async uploadFile(presignedUrl: string, file: Blob, contentType: string): Promise<void> {
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!response.ok) throw new Error('File upload failed');
  }
}

export const api = new ApiService();
export function useApi() { return api; }
```

---

## P7-03: Create Query Provider

```
Create apps/mobile/src/providers/QueryProvider.tsx:

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      gcTime: 300000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

export { queryClient };
```

---

## P7-04: Create Location Provider

```
Create apps/mobile/src/providers/LocationProvider.tsx:

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { api } from '@/services/api';

interface LocationContextType {
  location: Location.LocationObject | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
}

const LocationContext = createContext<LocationContextType | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }, []);

  const getLocation = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission not granted');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLocation(loc);

      // Update backend (fire and forget)
      api.post('/api/users/me/location', {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      }).catch(console.warn);
    } catch (err) {
      console.error('Location error:', err);
      setError('Failed to get location');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getLocation();
    const interval = setInterval(getLocation, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [getLocation]);

  return (
    <LocationContext.Provider value={{ location, error, loading, refresh: getLocation, requestPermission }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) throw new Error('useLocation must be used within LocationProvider');
  return context;
}
```

---

## P7-05: Create Notification Provider

```
Create apps/mobile/src/providers/NotificationProvider.tsx:

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/services/api';
import ENV from '@/config/env';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

interface NotificationContextType {
  expoPushToken: string | null;
}

const NotificationContext = createContext<NotificationContextType>({ expoPushToken: null });

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const responseListener = useRef<any>();
  const router = useRouter();

  useEffect(() => {
    registerForPushNotifications().then(token => {
      if (token) {
        setExpoPushToken(token);
        api.post('/api/users/me/push-token', { token }).catch(console.error);
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.type === 'new_post' && data?.postId) router.push(`/post/${data.postId}`);
      else if (data?.type === 'creator_approved') router.push('/(tabs)/profile');
    });

    return () => {
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ expoPushToken }}>
      {children}
    </NotificationContext.Provider>
  );
}

async function registerForPushNotifications(): Promise<string | null> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: ENV.PROJECT_ID });

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    return tokenData.data;
  } catch (error) {
    console.error('Push notification error:', error);
    return null;
  }
}

export function useNotifications() {
  return useContext(NotificationContext);
}
```

---

# Phase 8: Style System

## P8-01: Create Theme

```
Create apps/mobile/src/styles/theme.ts:

export const COLORS = {
  background: '#0D0D0D',
  surface: '#1A1A1A',
  surfaceLight: '#2A2A2A',
  primary: '#00FF88',
  primaryDim: '#00CC6A',
  textPrimary: '#FFFFFF',
  textSecondary: '#8A8A8A',
  textMuted: '#666666',
  success: '#00FF88',
  warning: '#FFB800',
  error: '#FF4444',
  border: '#333333',
  overlay: 'rgba(0,0,0,0.7)',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADII = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const SHADOWS = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4 },
} as const;

export type ColorKey = keyof typeof COLORS;
export type SpacingKey = keyof typeof SPACING;
```

---

## P8-02: Create Typography

```
Create apps/mobile/src/styles/typography.ts:

import { TextStyle } from 'react-native';
import { COLORS } from './theme';

export const TYPOGRAPHY = {
  h1: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary, lineHeight: 34 } as TextStyle,
  h2: { fontSize: 24, fontWeight: '700', color: COLORS.textPrimary, lineHeight: 30 } as TextStyle,
  h3: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, lineHeight: 24 } as TextStyle,
  body: { fontSize: 16, fontWeight: '400', color: COLORS.textPrimary, lineHeight: 22 } as TextStyle,
  bodySmall: { fontSize: 14, fontWeight: '400', color: COLORS.textPrimary, lineHeight: 20 } as TextStyle,
  caption: { fontSize: 12, fontWeight: '400', color: COLORS.textSecondary, lineHeight: 16 } as TextStyle,
  label: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 1, textTransform: 'uppercase' } as TextStyle,
  mono: { fontSize: 14, fontWeight: '600', fontFamily: 'monospace', color: COLORS.primary } as TextStyle,
  monoLarge: { fontSize: 20, fontWeight: '700', fontFamily: 'monospace', color: COLORS.primary } as TextStyle,
} as const;

export type TypographyVariant = keyof typeof TYPOGRAPHY;
```

---

## P8-03: Create Layouts

```
Create apps/mobile/src/styles/layouts.ts:

import { ViewStyle } from 'react-native';
import { SPACING, RADII, COLORS } from './theme';

export const LAYOUTS = {
  row: { flexDirection: 'row', alignItems: 'center' } as ViewStyle,
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } as ViewStyle,
  center: { justifyContent: 'center', alignItems: 'center' } as ViewStyle,
  screen: { flex: 1, backgroundColor: COLORS.background } as ViewStyle,
  card: { backgroundColor: COLORS.surface, borderRadius: RADII.md, padding: SPACING.md } as ViewStyle,
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as ViewStyle,
} as const;
```

---

## P8-04: Create Styles Index

```
Create apps/mobile/src/styles/index.ts:

export * from './theme';
export * from './typography';
export * from './layouts';
```

---

## P8-05: Create Text Primitive

```
Create apps/mobile/src/components/primitives/Text.tsx:

import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { TYPOGRAPHY, TypographyVariant } from '@/styles/typography';
import { COLORS, ColorKey } from '@/styles/theme';

interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: ColorKey;
  align?: 'left' | 'center' | 'right';
}

export function Text({ variant = 'body', color, align, style, ...props }: TextProps) {
  return (
    <RNText
      style={[
        TYPOGRAPHY[variant],
        color && { color: COLORS[color] },
        align && { textAlign: align },
        style,
      ]}
      {...props}
    />
  );
}
```

---

## P8-06: Create Button Primitive

```
Create apps/mobile/src/components/primitives/Button.tsx:

import React from 'react';
import { TouchableOpacity, TouchableOpacityProps, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from './Text';
import { COLORS, SPACING, RADII } from '@/styles/theme';

interface ButtonProps extends TouchableOpacityProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: string;
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, children, style, ...props }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], styles[size], disabled && styles.disabled, style]}
      disabled={disabled || loading}
      activeOpacity={0.8}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? COLORS.background : COLORS.primary} />
      ) : (
        <Text variant="label" color={variant === 'primary' ? 'background' : 'textPrimary'}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: RADII.md },
  primary: { backgroundColor: COLORS.primary },
  secondary: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  ghost: { backgroundColor: 'transparent' },
  sm: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md, minHeight: 32 },
  md: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, minHeight: 44 },
  lg: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, minHeight: 52 },
  disabled: { opacity: 0.5 },
});
```

---

## P8-07: Create Avatar Primitive

```
Create apps/mobile/src/components/primitives/Avatar.tsx:

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text } from './Text';
import { COLORS } from '@/styles/theme';

const SIZES = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 };

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: keyof typeof SIZES;
}

export function Avatar({ uri, name, size = 'md' }: AvatarProps) {
  const dim = SIZES[size];
  const initial = name?.charAt(0).toUpperCase() || '?';

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: dim, height: dim, borderRadius: dim / 2, backgroundColor: COLORS.surface }}
        contentFit="cover"
        transition={200}
      />
    );
  }

  return (
    <View style={[styles.placeholder, { width: dim, height: dim, borderRadius: dim / 2 }]}>
      <Text variant={size === 'xs' || size === 'sm' ? 'caption' : 'h3'} color="primary">{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center' },
});
```

---

## P8-08: Create Spacer & Card Primitives

```
Create apps/mobile/src/components/primitives/Spacer.tsx:

import React from 'react';
import { View } from 'react-native';
import { SPACING, SpacingKey } from '@/styles/theme';

interface SpacerProps {
  size?: SpacingKey;
  horizontal?: boolean;
}

export function Spacer({ size = 'md', horizontal = false }: SpacerProps) {
  return <View style={horizontal ? { width: SPACING[size] } : { height: SPACING[size] }} />;
}
```

```
Create apps/mobile/src/components/primitives/Card.tsx:

import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADII, SHADOWS } from '@/styles/theme';

interface CardProps extends ViewProps {
  variant?: 'elevated' | 'flat';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ variant = 'flat', padding = 'md', style, children, ...props }: CardProps) {
  return (
    <View
      style={[
        styles.base,
        variant === 'elevated' && SHADOWS.md,
        padding !== 'none' && { padding: SPACING[padding] },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: COLORS.surface, borderRadius: RADII.md },
});
```

---

## P8-09: Create Primitives Index

```
Create apps/mobile/src/components/primitives/index.ts:

export { Text } from './Text';
export { Button } from './Button';
export { Avatar } from './Avatar';
export { Spacer } from './Spacer';
export { Card } from './Card';
```

---

# Phase 9: React Query Hooks

## P9-01: Create useFeed Hook

```
Create apps/mobile/src/hooks/useFeed.ts:

import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useLocation } from '@/providers/LocationProvider';
import { FeedResponse } from '@momento/shared';
import { useState, useEffect } from 'react';

const RADIUS_TIERS = [5000, 10000, 25000, 50000, 100000];

export function useFeed() {
  const { location } = useLocation();
  const [radiusIndex, setRadiusIndex] = useState(0);
  const radius = RADIUS_TIERS[radiusIndex];

  const query = useInfiniteQuery<FeedResponse>({
    queryKey: ['feed', location?.coords.latitude, location?.coords.longitude, radius],
    queryFn: async ({ pageParam }) => {
      if (!location) throw new Error('Location required');
      const response = await api.get<{ success: boolean; data: FeedResponse }>('/api/feed', {
        lat: location.coords.latitude.toString(),
        lng: location.coords.longitude.toString(),
        radius: radius.toString(),
        cursor: pageParam as string | undefined,
      });
      return response.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: !!location,
  });

  // Auto-expand radius if not enough posts
  useEffect(() => {
    const allPosts = query.data?.pages.flatMap(p => p.posts) || [];
    if (!query.isLoading && !query.isFetchingNextPage && allPosts.length < 5 && radiusIndex < RADIUS_TIERS.length - 1) {
      setRadiusIndex(prev => prev + 1);
    }
  }, [query.data, query.isLoading, query.isFetchingNextPage, radiusIndex]);

  return {
    ...query,
    radius,
    posts: query.data?.pages.flatMap(p => p.posts) || [],
  };
}
```

---

## P9-02: Create useCreatorProfile Hook

```
Create apps/mobile/src/hooks/useCreatorProfile.ts:

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { PublicCreator, FollowResponse } from '@momento/shared';

export function useCreatorProfile(creatorId: string) {
  const queryClient = useQueryClient();

  const profileQuery = useQuery<PublicCreator & { isFollowing: boolean }>({
    queryKey: ['creator', creatorId],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: PublicCreator & { isFollowing: boolean } }>(`/api/creators/${creatorId}`);
      return response.data;
    },
    enabled: !!creatorId,
  });

  const followMutation = useMutation<FollowResponse>({
    mutationFn: async () => {
      const response = await api.post<{ success: boolean; data: FollowResponse }>(`/api/creators/${creatorId}/follow`);
      return response.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['creator', creatorId] });
      const previous = queryClient.getQueryData(['creator', creatorId]);
      queryClient.setQueryData(['creator', creatorId], (old: any) => ({
        ...old,
        isFollowing: !old?.isFollowing,
        followerCount: old?.isFollowing ? (old?.followerCount || 1) - 1 : (old?.followerCount || 0) + 1,
      }));
      return { previous };
    },
    onError: (err, vars, context: any) => {
      queryClient.setQueryData(['creator', creatorId], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['creator', creatorId] });
    },
  });

  return {
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    toggleFollow: followMutation.mutate,
    isFollowLoading: followMutation.isPending,
  };
}
```

---

## P9-03: Create useLike Hook

```
Create apps/mobile/src/hooks/useLike.ts:

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { LikeResponse } from '@momento/shared';
import * as Haptics from 'expo-haptics';

export function useLike(postId: string) {
  const queryClient = useQueryClient();

  return useMutation<LikeResponse>({
    mutationFn: async () => {
      const response = await api.post<{ success: boolean; data: LikeResponse }>(`/api/posts/${postId}/like`);
      return response.data;
    },
    onMutate: async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await queryClient.cancelQueries({ queryKey: ['post', postId] });
      const previousPost = queryClient.getQueryData(['post', postId]);

      // Optimistic update in post detail
      queryClient.setQueryData(['post', postId], (old: any) => ({
        ...old,
        isLiked: !old?.isLiked,
        likeCount: old?.isLiked ? Math.max(0, (old?.likeCount || 1) - 1) : (old?.likeCount || 0) + 1,
      }));

      // Optimistic update in feed
      queryClient.setQueriesData({ queryKey: ['feed'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            posts: page.posts.map((post: any) =>
              post.id === postId
                ? { ...post, isLiked: !post.isLiked, likeCount: post.isLiked ? Math.max(0, (post.likeCount || 1) - 1) : (post.likeCount || 0) + 1 }
                : post
            ),
          })),
        };
      });

      return { previousPost };
    },
    onError: (err, vars, context: any) => {
      queryClient.setQueryData(['post', postId], context?.previousPost);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });
}
```

---

## P9-04: Create useWalletBalance Hook

```
Create apps/mobile/src/hooks/useWalletBalance.ts:

import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { WalletBalance } from '@momento/shared';

export function useWalletBalance() {
  return useQuery<WalletBalance>({
    queryKey: ['walletBalance'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: WalletBalance }>('/api/wallet/balance');
      return response.data;
    },
    refetchInterval: 30000, // 30 seconds
    staleTime: 15000,
  });
}
```

---

## P9-05: Create useUserProfile Hook

```
Create apps/mobile/src/hooks/useUserProfile.ts:

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { User } from '@momento/shared';

export function useUserProfile() {
  const queryClient = useQueryClient();

  const profileQuery = useQuery<User>({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: { user: User } }>('/api/users/me');
      return response.data.user;
    },
  });

  const updateMutation = useMutation<User, Error, Partial<User>>({
    mutationFn: async (data) => {
      const response = await api.patch<{ success: boolean; data: { user: User } }>('/api/users/me', data);
      return response.data.user;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['userProfile'], updatedUser);
    },
  });

  return {
    user: profileQuery.data,
    isLoading: profileQuery.isLoading,
    refetch: profileQuery.refetch,
    updateProfile: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
}
```

---

## P9-06: Create useCreatePost Hook

```
Create apps/mobile/src/hooks/useCreatePost.ts:

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Post, PostType } from '@momento/shared';
import { useLocation } from '@/providers/LocationProvider';

interface CreatePostData {
  postType: PostType;
  content?: string;
  caption?: string;
  mediaUrl?: string;
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  const { location } = useLocation();

  return useMutation<Post, Error, CreatePostData>({
    mutationFn: async (data) => {
      if (!location) throw new Error('Location required');
      const response = await api.post<{ success: boolean; data: { post: Post } }>('/api/posts', {
        ...data,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      return response.data.post;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
  });
}
```

---

## P9-07: Create useKyc Hook

```
Create apps/mobile/src/hooks/useKyc.ts:

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

interface KycSession {
  sessionId?: string;
  url?: string;
  skipKyc?: boolean;
  message?: string;
}

export function useKyc() {
  const queryClient = useQueryClient();

  const mutation = useMutation<KycSession>({
    mutationFn: async () => {
      const response = await api.post<{ success: boolean; data: KycSession }>('/api/creators/apply');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
  });

  return {
    startKyc: mutation.mutate,
    kycSession: mutation.data,
    isStarting: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
```

---

## P9-08: Create useUpload Hook

```
Create apps/mobile/src/hooks/useUpload.ts:

import { useState } from 'react';
import { api } from '@/services/api';
import * as ImagePicker from 'expo-image-picker';

export function useUpload() {
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = async (folder: 'avatars' | 'banners' | 'posts', asset: ImagePicker.ImagePickerAsset) => {
    setIsUploading(true);
    try {
      const contentType = asset.type === 'video' ? 'video/mp4' : 'image/jpeg';

      const presignResponse = await api.post<{ success: boolean; data: { uploadUrl: string; publicUrl: string } }>(
        '/api/uploads/presign',
        { folder, contentType }
      );

      const { uploadUrl, publicUrl } = presignResponse.data;

      const fileResponse = await fetch(asset.uri);
      const blob = await fileResponse.blob();

      await api.uploadFile(uploadUrl, blob, contentType);

      return publicUrl;
    } finally {
      setIsUploading(false);
    }
  };

  const pickAndUpload = async (folder: 'avatars' | 'banners' | 'posts', allowVideo = false) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: allowVideo ? ImagePicker.MediaTypeOptions.All : ImagePicker.MediaTypeOptions.Images,
      allowsEditing: folder !== 'posts',
      aspect: folder === 'avatars' ? [1, 1] : folder === 'banners' ? [3, 1] : undefined,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return null;

    return uploadFile(folder, result.assets[0]);
  };

  return { pickAndUpload, isUploading };
}
```

---

## P9-09: Create Hooks Index

```
Create apps/mobile/src/hooks/index.ts:

export * from './useFeed';
export * from './useCreatorProfile';
export * from './useLike';
export * from './useWalletBalance';
export * from './useUserProfile';
export * from './useCreatePost';
export * from './useKyc';
export * from './useUpload';
```

---

# Continue to Part 4...

Part 4 covers:
- Phase 10: Feature Components
- Phase 11: Screens & Navigation
