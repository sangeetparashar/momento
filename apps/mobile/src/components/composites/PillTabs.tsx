import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { PillButton } from '@/components/primitives';
import { COLORS, RADII } from '@/styles/theme';

export interface PillTabItem {
  /** Unique identifier for the tab. */
  key: string;
  /** Display label (will be uppercased by PillButton). */
  label: string;
}

interface PillTabsProps {
  /** Tab items to render. */
  tabs: PillTabItem[];
  /** Key of the currently active tab. */
  activeTab: string;
  /** Called when a tab is pressed. */
  onTabChange: (key: string) => void;
  /**
   * Size variant:
   * - 'md' (default): Standard navigation tabs (PROFILE/POSTS/TOKEN).
   * - 'sm': Compact selectors (24H/7D/1M/3M/1Y).
   */
  size?: 'sm' | 'md';
  /** Style override for the outer container. */
  style?: ViewStyle;
}

/**
 * Horizontal pill-shaped tab bar.
 *
 * The most recurring UI pattern in Momento. Used for:
 * - Page navigation (PROFILE / POSTS / TOKEN)
 * - Action groups (EDIT PROFILE / NEW POST / ACCOUNT)
 * - Filters (TRENDING / 24H GAINERS / TOP CREATORS)
 * - Time ranges (24H / 7D / 1M / 3M / 1Y)
 *
 * Each tab shares equal width inside a dark capsule container.
 * Active tab gets a slightly lighter background + subtle border.
 *
 * @see docs/design/screens/creator-token.png — top bar
 * @see docs/design/screens/market.png — filter tabs
 */
export function PillTabs({
  tabs,
  activeTab,
  onTabChange,
  size = 'md',
  style,
}: PillTabsProps) {
  return (
    <View style={[styles.container, style]}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;

        return (
          <PillButton
            key={tab.key}
            label={tab.label}
            variant="ghost"
            size={size}
            flex
            fillColor={isActive ? COLORS.surfaceElevated : 'transparent'}
            borderColor={isActive ? COLORS.border : 'transparent'}
            textColor={isActive ? COLORS.textPrimary : COLORS.textSecondary}
            onPress={() => onTabChange(tab.key)}
            scaleValue={0.96}
            accessibilityRole="tab"
            accessibilitySelected={isActive}
            style={isActive ? styles.activeTab : undefined}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.full,
    padding: 3,
  },
  activeTab: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
