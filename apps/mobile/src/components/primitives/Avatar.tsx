import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text } from './Text';
import { COLORS, RADII } from '@/styles/theme';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  /** Image URL. Falls back to initials when absent or fails to load. */
  uri?: string | null;
  /** Display name used to derive fallback initials. */
  name?: string | null;
  /** Size preset. Defaults to 'md'. */
  size?: AvatarSize;
  /** Optional border color for a ring effect. */
  borderColor?: string;
}

const SIZE_MAP: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

const FONT_SIZE_MAP: Record<AvatarSize, number> = {
  xs: 10,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 32,
};

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function Avatar({
  uri,
  name,
  size = 'md',
  borderColor,
}: AvatarProps) {
  const dimension = SIZE_MAP[size];
  const fontSize = FONT_SIZE_MAP[size];
  const initials = useMemo(() => getInitials(name), [name]);

  const containerStyle = useMemo(
    () => [
      styles.container,
      {
        width: dimension,
        height: dimension,
        borderRadius: dimension / 2,
      },
      borderColor
        ? { borderWidth: 2, borderColor }
        : undefined,
    ],
    [dimension, borderColor],
  );

  if (uri) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri }}
          style={[
            styles.image,
            { width: dimension, height: dimension, borderRadius: dimension / 2 },
          ]}
          contentFit="cover"
          transition={200}
          placeholder={undefined}
          cachePolicy="disk"
          recyclingKey={uri}
        />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Text
        variant="body"
        style={{
          fontSize,
          fontWeight: '600',
          color: COLORS.textInverse,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    backgroundColor: COLORS.backgroundTertiary,
  },
});
