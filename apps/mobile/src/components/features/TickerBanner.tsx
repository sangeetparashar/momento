import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, Animated, Easing } from 'react-native';
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
  const translateX = useRef(new Animated.Value(0)).current;

  const duplicatedItems = [...items, ...items, ...items];
  const totalWidth = items.length * ITEM_WIDTH;

  useEffect(() => {
    translateX.setValue(0);
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: -totalWidth,
        duration: SCROLL_SPEED,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [items, totalWidth, translateX]);

  return (
    <Pressable onPress={onPress} style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.arrow}>{'>'}</Text>
      </View>
      <View style={styles.tickerContainer}>
        <Animated.View style={[styles.tickerRow, { transform: [{ translateX }] }]}>
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
