import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { Text } from '@/components/primitives';
import { COLORS } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

export default function IndexScreen() {
  const router = useRouter();
  const { isReady, user } = usePrivy();

  useEffect(() => {
    if (!isReady) return;

    if (user) {
      router.replace('/(tabs)/home');
    } else {
      router.replace('/login');
    }
  }, [isReady, user, router]);

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
