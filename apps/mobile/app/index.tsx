import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useNavigationContainerRef } from 'expo-router';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { apiService } from '@/services/api';
import { Text } from '@/components/primitives';
import { COLORS } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import type { User } from '@momento/shared';

function isProfileComplete(user: User): boolean {
  const hasUsername = !!user.username && user.username.length >= 3;
  const hasAvatar = !!user.avatarUrl;
  const hasSocial =
    user.socialLinks &&
    typeof user.socialLinks === 'object' &&
    Object.values(user.socialLinks as Record<string, string>).some(
      (v) => typeof v === 'string' && v.trim().length > 0,
    );
  return hasUsername && hasAvatar && !!hasSocial;
}

export default function IndexScreen() {
  const router = useRouter();
  const rootNav = useNavigationContainerRef();
  const queryClient = useQueryClient();
  const { isReady, user: authUser } = useAuth();
  const [navReady, setNavReady] = useState(false);

  // Fetch full profile to check completeness (only when authenticated)
  const profileQuery = useQuery<User>({
    queryKey: ['userProfile'],
    queryFn: () => apiService.get<User>('/users/me'),
    enabled: !!authUser,
  });

  // Wait for the navigation container to be ready before navigating
  useEffect(() => {
    if (rootNav?.isReady()) {
      setNavReady(true);
      return;
    }
    // Poll briefly for navigation readiness
    const timer = setTimeout(() => setNavReady(true), 100);
    return () => clearTimeout(timer);
  }, [rootNav]);

  useEffect(() => {
    if (!isReady || !navReady) return;

    if (!authUser) {
      queryClient.clear();
      router.replace('/login');
      return;
    }

    // Wait for profile data before deciding route
    if (profileQuery.isLoading) return;

    queryClient.invalidateQueries();

    if (profileQuery.data && !isProfileComplete(profileQuery.data)) {
      router.replace('/setup-profile');
    } else {
      router.replace('/(tabs)/home');
    }
  }, [isReady, authUser, router, navReady, queryClient, profileQuery.isLoading, profileQuery.data]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>M O M E N T O</Text>
      <ActivityIndicator
        size="large"
        color={COLORS.primary}
        style={styles.spinner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    ...TYPOGRAPHY.h1,
    color: COLORS.textPrimary,
    letterSpacing: 8,
    fontWeight: '800',
  },
  spinner: {
    marginTop: 32,
  },
});
