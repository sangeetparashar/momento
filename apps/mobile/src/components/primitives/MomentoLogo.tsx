import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Text } from './Text';
import { COLORS } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

interface MomentoLogoProps {
  size?: number;
  color?: string;
  showText?: boolean;
}

export function MomentoLogo({
  size = 40,
  color = COLORS.primary,
  showText = false,
}: MomentoLogoProps) {
  return (
    <View style={styles.container}>
      <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <Path
          d="M4 32V10L13 20L20 12L27 20L36 10V32"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Circle cx={36} cy={10} r={2.5} fill={color} />
      </Svg>
      {showText && (
        <Text style={[styles.logoText, { color }]}>MOMENTO</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  logoText: {
    ...TYPOGRAPHY.body,
    letterSpacing: 6,
    fontWeight: '800',
    fontSize: 16,
    marginTop: 12,
  },
});
