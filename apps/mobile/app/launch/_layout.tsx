import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { StepProgress } from '@/components/features/launch/StepProgress';
import { LaunchWizardProvider, LAUNCH_STEPS } from '@/hooks/useLaunchWizard';
import { COLORS, SPACING } from '@/styles/theme';

// Maps the active route segment to a 1-based wizard step. `result` has no
// progress bar (terminal screen); `index` is the basics step.
const SEGMENT_TO_STEP: Record<string, number> = {
  index: 1,
  fees: 2,
  fundraise: 3,
  vesting: 4,
  review: 5,
};

const TITLES: Record<string, string> = {
  index: 'TOKEN BASICS',
  fees: 'FEES & TAX',
  fundraise: 'FUNDRAISE',
  vesting: 'VESTING',
  review: 'REVIEW',
  result: 'LAUNCHED',
};

function LaunchHeader() {
  const router = useRouter();
  const segments = useSegments();
  // Last segment under app/launch/* (e.g. 'fees'); defaults to 'index'.
  const last = segments[segments.length - 1] ?? 'index';
  const seg = last === 'launch' ? 'index' : last;

  const step = SEGMENT_TO_STEP[seg];
  const showProgress = step !== undefined && seg !== 'result';
  const title = TITLES[seg] ?? 'LAUNCH';

  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        {seg !== 'result' ? (
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <Text variant="h3" style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {showProgress ? (
        <View style={styles.progressWrap}>
          <StepProgress step={step} total={LAUNCH_STEPS.length} />
        </View>
      ) : null}
    </View>
  );
}

export default function LaunchLayout() {
  return (
    <LaunchWizardProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <LaunchHeader />
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}
        />
      </SafeAreaView>
    </LaunchWizardProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.textPrimary,
  },
  progressWrap: {
    marginTop: SPACING.md,
  },
});
