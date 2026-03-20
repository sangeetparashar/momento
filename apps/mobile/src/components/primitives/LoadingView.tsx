import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { COLORS, SPACING } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

interface LoadingViewProps {
  message?: string;
  children: React.ReactNode;
}

export function LoadingView({ message, children }: LoadingViewProps) {
  return (
    <View style={styles.container}>
      {children}
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  message: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
});
