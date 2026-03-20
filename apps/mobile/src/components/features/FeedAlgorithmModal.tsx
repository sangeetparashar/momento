import React from 'react';
import { View, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import type { FeedSortMode } from '@/hooks/useFeed';

interface FeedAlgorithmModalProps {
  visible: boolean;
  onClose: () => void;
  currentSort: FeedSortMode;
  onSortChange: (sort: FeedSortMode) => void;
}

const SORT_OPTIONS: {
  key: FeedSortMode;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
}[] = [
  {
    key: 'smart',
    icon: 'sparkles',
    label: 'Smart Mix',
    description: 'Balanced blend of what\'s new, popular, nearby, and from creators you follow',
  },
  {
    key: 'recent',
    icon: 'time-outline',
    label: 'Most Recent',
    description: 'Newest posts first — see what just dropped',
  },
  {
    key: 'popular',
    icon: 'flame-outline',
    label: 'Most Popular',
    description: 'Posts with the most likes and comments rise to the top',
  },
  {
    key: 'nearby',
    icon: 'location-outline',
    label: 'Nearest First',
    description: 'Posts closest to your current location appear first',
  },
  {
    key: 'following',
    icon: 'people-outline',
    label: 'Following',
    description: 'Prioritize posts from creators you follow',
  },
];

export function FeedAlgorithmModal({
  visible,
  onClose,
  currentSort,
  onSortChange,
}: FeedAlgorithmModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="eye-outline" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>How Your Feed Works</Text>
          </View>

          {/* Explanation */}
          <Text style={styles.explanation}>
            Your feed ranks posts using four signals: how recent they are, how
            popular they are (likes + comments), how close they are to you, and
            whether you follow the creator. Pick a mode below to change the mix.
          </Text>

          {/* Weights visual */}
          <View style={styles.weightsSection}>
            <Text style={styles.weightsLabel}>CURRENT SIGNAL WEIGHTS</Text>
            <WeightBars sort={currentSort} />
          </View>

          {/* Sort options */}
          <ScrollView
            style={styles.optionsList}
            showsVerticalScrollIndicator={false}
          >
            {SORT_OPTIONS.map((option) => {
              const isActive = option.key === currentSort;
              return (
                <Pressable
                  key={option.key}
                  style={[styles.optionRow, isActive && styles.optionRowActive]}
                  onPress={() => onSortChange(option.key)}
                >
                  <View style={[styles.optionIcon, isActive && styles.optionIconActive]}>
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={isActive ? COLORS.background : COLORS.textSecondary}
                    />
                  </View>
                  <View style={styles.optionInfo}>
                    <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
                      {option.label}
                    </Text>
                    <Text style={styles.optionDesc} numberOfLines={2}>
                      {option.description}
                    </Text>
                  </View>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Done button */}
          <Pressable onPress={onClose} style={styles.doneButton}>
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Visual bar chart showing the 4 signal weights */
function WeightBars({ sort }: { sort: FeedSortMode }) {
  const WEIGHT_PRESETS: Record<FeedSortMode, [number, number, number, number]> = {
    smart:     [0.30, 0.25, 0.25, 0.20],
    recent:    [0.80, 0.07, 0.07, 0.06],
    popular:   [0.07, 0.80, 0.07, 0.06],
    nearby:    [0.07, 0.07, 0.80, 0.06],
    following: [0.07, 0.07, 0.06, 0.80],
  };

  const weights = WEIGHT_PRESETS[sort];
  const labels = ['Recency', 'Popularity', 'Proximity', 'Following'];
  const colors = ['#00C2FF', '#FF6B6B', '#00FF88', '#FFD93D'];

  return (
    <View style={styles.barsContainer}>
      {labels.map((label, i) => (
        <View key={label} style={styles.barRow}>
          <Text style={styles.barLabel}>{label}</Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.round(weights[i] * 100)}%`,
                  backgroundColor: colors[i],
                },
              ]}
            />
          </View>
          <Text style={styles.barPercent}>{Math.round(weights[i] * 100)}%</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl + 20,
    maxHeight: '85%',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  explanation: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  // Weight bars
  weightsSection: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  weightsLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 1,
    fontSize: 10,
    marginBottom: SPACING.sm,
  },
  barsContainer: {
    gap: SPACING.xs + 2,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  barLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    width: 70,
    fontSize: 11,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.backgroundTertiary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barPercent: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    width: 30,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '600',
  },
  // Sort options
  optionsList: {
    marginBottom: SPACING.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADII.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  optionRowActive: {
    backgroundColor: COLORS.primaryMuted,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionIconActive: {
    backgroundColor: COLORS.primary,
  },
  optionInfo: {
    flex: 1,
  },
  optionLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  optionLabelActive: {
    color: COLORS.primary,
  },
  optionDesc: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    marginTop: 1,
    lineHeight: 16,
  },
  // Done button
  doneButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADII.full,
    alignItems: 'center',
  },
  doneButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    fontSize: 16,
  },
});
