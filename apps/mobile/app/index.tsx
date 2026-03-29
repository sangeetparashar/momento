import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, useNavigationContainerRef } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useFeed } from '@/hooks';
import { apiService } from '@/services/api';
import { getOnboardingState, setOnboardingUser, markProfileSetupComplete } from '@/services/onboardingStorage';
import { Text, MomentoLogo } from '@/components/primitives';
import { DisclaimerModal, hasAcceptedDisclaimer } from '@/components/features';
import { COLORS, SPACING } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import type { User } from '@momento/shared';

function isProfileComplete(user: User): boolean {
  const hasUsername = !!user.username && user.username.length >= 3;
  const hasAvatar = !!user.avatarUrl;
  return hasUsername && hasAvatar;
}

export default function IndexScreen() {
  const router = useRouter();
  const rootNav = useNavigationContainerRef();
  const { isReady, user: authUser } = useAuth();
  const [navReady, setNavReady] = useState(false);
  const navigatedForUserRef = useRef<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);

  // Check if disclaimer was already accepted — re-check when user changes
  useEffect(() => {
    if (!isReady) return;
    const userId = authUser?.id ?? null;
    setDisclaimerChecked(false);
    hasAcceptedDisclaimer(userId).then((accepted) => {
      setDisclaimerChecked(true);
      if (!accepted && authUser) {
        // Only show disclaimer for authenticated users (not guests)
        setShowDisclaimer(true);
      } else {
        setShowDisclaimer(false);
      }
    });
  }, [isReady, authUser?.id]);

  // Prefetch feed immediately — runs in parallel with auth init.
  useFeed();

  // Fetch full profile in parallel with feed (only when authenticated).
  // Key includes authUser.id so switching users gets a fresh fetch.
  const profileQuery = useQuery<User>({
    queryKey: ['userProfile', authUser?.id],
    queryFn: () => apiService.get<User>('/users/me'),
    enabled: !!authUser,
    staleTime: 0, // Always re-fetch on mount after user switch
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

  // Reset navigation state when user changes (login/logout/switch).
  // The profile query key includes authUser.id, so each user gets its own cache — no need to cancel/clear.
  const prevUserRef = useRef<string | null>(null);
  useEffect(() => {
    const userId = authUser?.id ?? null;
    setOnboardingUser(userId);

    if (prevUserRef.current !== userId) {
      prevUserRef.current = userId;
      // Reset so routing logic runs again for the new user
      navigatedForUserRef.current = null;
    }
  }, [authUser?.id]);

  useEffect(() => {
    if (!isReady || !navReady || !disclaimerChecked || showDisclaimer) return;

    const currentUserId = authUser?.id ?? 'guest';

    // Already navigated for this specific user — don't re-navigate
    if (navigatedForUserRef.current === currentUserId) return;

    // Not authenticated — force login
    if (!authUser) {
      navigatedForUserRef.current = currentUserId;
      router.replace('/login');
      return;
    }

    // Wait for profile data before deciding route
    if (profileQuery.isLoading) return;

    navigatedForUserRef.current = currentUserId;

    // Check onboarding state + profile completeness together
    getOnboardingState().then((state) => {
      // Incomplete profile AND hasn't completed setup before → force setup
      if (
        profileQuery.data &&
        !isProfileComplete(profileQuery.data) &&
        !state.hasCompletedProfileSetup
      ) {
        router.replace('/setup-profile');
        return;
      }

      if (!state.hasSeenFundingScreen) {
        router.replace('/fund-wallet-onboarding');
      } else {
        router.replace('/(tabs)/home');
      }
    });
  }, [isReady, authUser, router, navReady, profileQuery.isLoading, profileQuery.data, disclaimerChecked, showDisclaimer]);

  return (
    <View style={styles.container}>
      <MomentoLogo size={64} showText />
      <Text style={styles.loadingMessage}>Loading your experience...</Text>
      <DisclaimerModal
        visible={showDisclaimer}
        onAccept={() => setShowDisclaimer(false)}
        userId={authUser?.id}
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
  loadingMessage: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xl,
  },
});
