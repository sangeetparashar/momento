import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated';
import { Text } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

interface TickerItem {
  symbol: string;
  change: number;
}

interface TickerBannerProps {
  title: string;
  items: TickerItem[];
  onPress?: () => void;
}

const ITEM_WIDTH = 120;
const SCROLL_SPEED = 30000;

export function TickerBanner({ title, items, onPress }: TickerBannerProps) {
  const translateX = useSharedValue(0);
  const [measured, setMeasured] = useState(false);

  const duplicatedItems = [...items, ...items];
  const totalWidth = items.length * ITEM_WIDTH;

  const onLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      if (measured || totalWidth === 0) return;
      setMeasured(true);
      translateX.value = withRepeat(
        withTiming(-totalWidth, {
          duration: SCROLL_SPEED,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    },
    [measured, totalWidth, translateX],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Pressable onPress={onPress} style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.arrow}>{'>'}</Text>
      </View>
      <View style={styles.tickerContainer}>
        <Animated.View style={[styles.tickerRow, animatedStyle]} onLayout={onLayout}>
          {duplicatedItems.map((item, index) => (
            <View key={`${item.symbol}-${index}`} style={styles.tickerItem}>
              <Text style={styles.symbol}>{item.symbol}</Text>
              <Text
                style={[
                  styles.change,
                  { color: item.change >= 0 ? COLORS.success : COLORS.error },
                ]}
              >
                {item.change >= 0 ? '+' : ''}
                {item.change.toFixed(1)}%
              </Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.xs,
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  title: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    letterSpacing: 2,
  },
  arrow: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  tickerContainer: {
    overflow: 'hidden',
  },
  tickerRow: {
    flexDirection: 'row',
  },
  tickerItem: {
    width: ITEM_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    gap: 6,
  },
  symbol: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  change: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
  },
});
