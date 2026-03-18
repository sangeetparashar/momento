import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useNavigationContainerRef } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { Text } from '@/components/primitives';
import { COLORS } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

export default function IndexScreen() {
  const router = useRouter();
  const rootNav = useNavigationContainerRef();
  const { isReady, user } = useAuth();
  const [navReady, setNavReady] = useState(false);

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

    if (user) {
      router.replace('/(tabs)/home');
    } else {
      router.replace('/login');
    }
  }, [isReady, user, router, navReady]);

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
