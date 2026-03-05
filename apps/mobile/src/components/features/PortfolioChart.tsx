import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, Pressable, Dimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

type TimeRange = '24H' | '7D' | '1M' | '3M' | '1Y';

const TIME_RANGES: TimeRange[] = ['24H', '7D', '1M', '3M', '1Y'];

const POINTS_MAP: Record<TimeRange, number> = {
  '24H': 24,
  '7D': 7 * 24,
  '1M': 30,
  '3M': 90,
  '1Y': 365,
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - SPACING.md * 4;
const CHART_HEIGHT = 160;

function generateChartData(points: number, seed: number = 42): number[] {
  const data: number[] = [];
  let value = 100 + (seed % 50);
  for (let i = 0; i < points; i++) {
    const change = (Math.sin(i * 0.3 + seed) * 5) + (Math.cos(i * 0.7 + seed * 0.5) * 3);
    value = Math.max(10, value + change);
    data.push(value);
  }
  return data;
}

function createPath(data: number[], width: number, height: number): string {
  if (data.length < 2) return '';

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 4;
  const effectiveHeight = height - padding * 2;

  const stepX = width / (data.length - 1);

  const points = data.map((val, i) => ({
    x: i * stepX,
    y: padding + effectiveHeight - ((val - min) / range) * effectiveHeight,
  }));

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX1 = prev.x + stepX * 0.4;
    const cpX2 = curr.x - stepX * 0.4;
    path += ` C ${cpX1} ${prev.y}, ${cpX2} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  return path;
}

function createGradientPath(linePath: string, width: number, height: number): string {
  return `${linePath} L ${width} ${height} L 0 ${height} Z`;
}

export function PortfolioChart() {
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1M');

  const chartData = useMemo(() => {
    const points = POINTS_MAP[selectedRange];
    const seed = TIME_RANGES.indexOf(selectedRange) * 17 + 7;
    return generateChartData(Math.min(points, 120), seed);
  }, [selectedRange]);

  const isPositive = chartData.length >= 2 && chartData[chartData.length - 1] >= chartData[0];
  const lineColor = isPositive ? COLORS.success : COLORS.error;

  const linePath = useMemo(
    () => createPath(chartData, CHART_WIDTH, CHART_HEIGHT),
    [chartData]
  );

  const gradientPath = useMemo(
    () => createGradientPath(linePath, CHART_WIDTH, CHART_HEIGHT),
    [linePath]
  );

  const handleRangeSelect = useCallback((range: TimeRange) => {
    setSelectedRange(range);
  }, []);

  return (
    <View style={styles.container}>
      {/* Chart */}
      <View style={styles.chartContainer}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
              <Stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {gradientPath && (
            <Path d={gradientPath} fill="url(#gradient)" />
          )}
          {linePath && (
            <Path
              d={linePath}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </Svg>
      </View>

      {/* Time Range Selector */}
      <View style={styles.rangeSelector}>
        {TIME_RANGES.map((range) => (
          <Pressable
            key={range}
            onPress={() => handleRangeSelect(range)}
            style={[
              styles.rangeButton,
              selectedRange === range && styles.rangeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.rangeText,
                selectedRange === range && styles.rangeTextActive,
              ]}
            >
              {range}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
  },
  chartContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  rangeSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  rangeButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.full,
    backgroundColor: 'transparent',
  },
  rangeButtonActive: {
    backgroundColor: COLORS.backgroundTertiary,
  },
  rangeText: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    fontWeight: '600',
  },
  rangeTextActive: {
    color: COLORS.textPrimary,
  },
});
