import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, useNavigationContainerRef } from 'expo-router';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useFeed } from '@/hooks';
import { apiService } from '@/services/api';
import { getOnboardingState } from '@/services/onboardingStorage';
import { Text, MomentoLogo } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';
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
  const navigatedRef = useRef(false);

  // Prefetch feed immediately — runs in parallel with auth init.
  // The feed API works without auth, so this starts loading content
  // while Privy is still initializing. By the time we navigate to home,
  // the first page is already in the React Query cache.
  useFeed();

  // Fetch full profile in parallel with feed (only when authenticated)
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
    const timer = setTimeout(() => setNavReady(true), 100);
    return () => clearTimeout(timer);
  }, [rootNav]);

  useEffect(() => {
    if (!isReady || !navReady || navigatedRef.current) return;

    // Not authenticated — force login. App is unusable without auth.
    if (!authUser) {
      navigatedRef.current = true;
      router.replace('/login');
      return;
    }

    // Wait for profile data before deciding route
    if (profileQuery.isLoading) return;

    navigatedRef.current = true;
    queryClient.invalidateQueries();

    // Incomplete profile → force setup (no skip allowed)
    if (profileQuery.data && !isProfileComplete(profileQuery.data)) {
      router.replace('/setup-profile');
      return;
    }

    // Profile complete — check if they've seen the funding screen
    getOnboardingState().then((state) => {
      if (!state.hasSeenFundingScreen) {
        router.replace('/fund-wallet-onboarding');
      } else {
        router.replace('/(tabs)/home');
      }
    });
  }, [isReady, authUser, router, navReady, queryClient, profileQuery.isLoading, profileQuery.data]);

  return (
    <View style={styles.container}>
      <MomentoLogo size={64} showText />
      <Text style={styles.loadingMessage}>Loading your experience...</Text>
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
  loadingMessage: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xl,
  },
});
