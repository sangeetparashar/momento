import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ViewStyle, LayoutChangeEvent } from 'react-native';
import Svg, { Polyline, Polygon, Defs, LinearGradient, Stop, Line } from 'react-native-svg';
import { Text } from '@/components/primitives';
import { PillTabs } from './PillTabs';
import { COLORS, SPACING } from '@/styles/theme';
import { FONT_FAMILY_DISPLAY, FONT_FAMILY_DISPLAY_BOLD } from '@/styles/typography';

export interface ChartDataPoint {
  /** X position (index or timestamp — will be normalized). */
  x: number;
  /** Y value (price, portfolio value, etc.). */
  y: number;
}

interface PerformanceChartProps {
  /** Section title above the chart. e.g. "TOKEN PERFORMANCE". */
  title: string;
  /** Chart data points. Minimum 2. */
  data: ChartDataPoint[];
  /** Currently selected time range key. */
  timeRange: string;
  /** Called when time range changes. */
  onTimeRangeChange: (range: string) => void;
  /** Available time ranges. Default ['24H', '7D', '1M', '3M', '1Y']. */
  timeRanges?: string[];
  /** Chart line height in px. Default 160. */
  height?: number;
  /** Line color. Default COLORS.primary (#00FF88). */
  lineColor?: string;
  /** Whether to show month labels. Default true. */
  showMonthLabels?: boolean;
  /** Style override for the outer container. */
  style?: ViewStyle;
}

const DEFAULT_TIME_RANGES = ['24H', '7D', '1M', '3M', '1Y'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Green SVG line chart with gradient fill, month labels, and time range selector.
 *
 * Used on the Token page (TOKEN PERFORMANCE) and Profile page (PORTFOLIO PERFORMANCE).
 * Measures its container width via onLayout for responsive SVG rendering.
 * Includes PillTabs (sm) for time range selection beneath the chart.
 *
 * @see docs/design/screens/creator-token.png — chart section
 * @see docs/design/screens/user-account-1.png — portfolio chart
 */
export function PerformanceChart({
  title,
  data,
  timeRange,
  onTimeRangeChange,
  timeRanges = DEFAULT_TIME_RANGES,
  height = 160,
  lineColor = COLORS.primary,
  showMonthLabels = true,
  style,
}: PerformanceChartProps) {
  const [containerWidth, setContainerWidth] = useState(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  // Normalize data to SVG coordinate space
  const { linePoints, fillPoints } = useMemo(() => {
    if (data.length < 2 || containerWidth === 0) {
      return { linePoints: '', fillPoints: '' };
    }

    const xMin = Math.min(...data.map((d) => d.x));
    const xMax = Math.max(...data.map((d) => d.x));
    const yMin = Math.min(...data.map((d) => d.y));
    const yMax = Math.max(...data.map((d) => d.y));

    // Avoid division by zero
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin;
    const isFlat = yRange === 0;

    // Add 10% padding top/bottom so the line doesn't clip edges
    const yPadding = isFlat ? 1 : yRange * 0.1;
    const effectiveYRange = isFlat ? 1 : yRange;

    const points = data.map((d) => {
      const px = ((d.x - xMin) / xRange) * containerWidth;
      // Flat data → center the line at 50% height
      const py = isFlat
        ? height / 2
        : ((yMax + yPadding - d.y) / (effectiveYRange + yPadding * 2)) * height;
      return `${px},${py}`;
    });

    const line = points.join(' ');
    // Close the polygon at the bottom for gradient fill
    const fill = `${line} ${containerWidth},${height} 0,${height}`;

    return { linePoints: line, fillPoints: fill };
  }, [data, containerWidth, height]);

  const hasData = data.length >= 2 && containerWidth > 0;

  const timeRangeTabs = useMemo(
    () => timeRanges.map((r) => ({ key: r, label: r })),
    [timeRanges]
  );

  return (
    <View style={[styles.container, style]} onLayout={handleLayout}>
      {/* Title */}
      <Text variant="label" style={styles.title}>
        {title}
      </Text>

      {/* Chart SVG */}
      <View style={[styles.chartArea, { height }]}>
        {hasData ? (
          <Svg
            width={containerWidth}
            height={height}
            viewBox={`0 0 ${containerWidth} ${height}`}
          >
            <Defs>
              <LinearGradient id="chartFillGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={lineColor} stopOpacity={0.12} />
                <Stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Gradient fill area */}
            <Polygon
              points={fillPoints}
              fill="url(#chartFillGradient)"
            />

            {/* Line */}
            <Polyline
              points={linePoints}
              fill="none"
              stroke={lineColor}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </Svg>
        ) : (
          /* Empty state */
          <Svg width={containerWidth || 100} height={height}>
            <Line
              x1={0}
              y1={height / 2}
              x2={containerWidth || 100}
              y2={height / 2}
              stroke={COLORS.border}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          </Svg>
        )}

        {!hasData && containerWidth > 0 && (
          <View style={styles.emptyOverlay}>
            <Text variant="caption" color="textTertiary">
              NO DATA
            </Text>
          </View>
        )}
      </View>

      {/* Month labels */}
      {showMonthLabels && (
        <View style={styles.monthRow}>
          {MONTHS.map((m) => (
            <Text key={m} variant="caption" style={styles.monthLabel}>
              {m}
            </Text>
          ))}
        </View>
      )}

      {/* Time range pills */}
      <View style={styles.timeRangeContainer}>
        <PillTabs
          tabs={timeRangeTabs}
          activeTab={timeRange}
          onTabChange={onTimeRangeChange}
          size="sm"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  title: {
    fontSize: 11,
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
    marginBottom: SPACING.lg,
  },
  chartArea: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    position: 'relative',
    overflow: 'hidden',
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 6,
    marginBottom: 20,
  },
  monthLabel: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY_DISPLAY,
  },
  timeRangeContainer: {
    alignSelf: 'center',
  },
});
