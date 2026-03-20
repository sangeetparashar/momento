import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions, ActivityIndicator } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Text as SvgText } from 'react-native-svg';
import { Text } from '@/components/primitives';
import { usePriceHistory, usePortfolioSnapshots } from '@/hooks/usePriceHistory';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

type TimeRange = '24H' | '7D' | '1M' | '3M' | '1Y';

const TIME_RANGES: TimeRange[] = ['24H', '7D', '1M', '3M', '1Y'];
const CHART_HEIGHT = 180;
const Y_PADDING = 20;
const MIN_SNAPSHOT_POINTS = 3;

interface ChartPoint {
  t: number;
  p: number;
}

function createSmoothPath(data: ChartPoint[], width: number, height: number): {
  linePath: string;
  gradientPath: string;
  min: number;
  max: number;
  first: number;
  last: number;
} {
  if (data.length < 2) {
    return { linePath: '', gradientPath: '', min: 0, max: 0, first: 0, last: 0 };
  }

  const prices = data.map(d => d.p);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const effectiveHeight = height - Y_PADDING * 2;

  const stepX = width / (data.length - 1);

  const points = data.map((d, i) => ({
    x: i * stepX,
    y: Y_PADDING + effectiveHeight - ((d.p - min) / range) * effectiveHeight,
  }));

  let linePath = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX1 = prev.x + stepX * 0.35;
    const cpX2 = curr.x - stepX * 0.35;
    linePath += ` C ${cpX1.toFixed(1)} ${prev.y.toFixed(1)}, ${cpX2.toFixed(1)} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }

  const gradientPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return {
    linePath,
    gradientPath,
    min,
    max,
    first: prices[0],
    last: prices[prices.length - 1],
  };
}

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

interface PortfolioChartProps {
  solBalance?: number;
}

export function PortfolioChart({ solBalance }: PortfolioChartProps) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const CHART_WIDTH = SCREEN_WIDTH - SPACING.md * 4;
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1M');

  const snapshots = usePortfolioSnapshots(selectedRange);
  const priceHistory = usePriceHistory(selectedRange);

  // Use snapshots if we have enough data points, otherwise fall back to SOL price history
  const hasSnapshots = (snapshots.data?.length ?? 0) >= MIN_SNAPSHOT_POINTS;
  const chartData: ChartPoint[] | undefined = hasSnapshots
    ? snapshots.data
    : priceHistory.data;
  const isLoading = hasSnapshots ? snapshots.isLoading : priceHistory.isLoading;
  const chartLabel = hasSnapshots ? 'Portfolio Value' : 'SOL Price';

  const chart = useMemo(() => {
    if (!chartData || chartData.length < 2) return null;
    return createSmoothPath(chartData, CHART_WIDTH, CHART_HEIGHT);
  }, [chartData, CHART_WIDTH]);

  const isPositive = chart ? chart.last >= chart.first : true;
  const lineColor = isPositive ? COLORS.success : COLORS.error;
  const changePercent = chart ? ((chart.last - chart.first) / chart.first * 100) : 0;

  const handleRangeSelect = useCallback((range: TimeRange) => {
    setSelectedRange(range);
  }, []);

  return (
    <View style={styles.container}>
      {/* Price header */}
      {chart && (
        <View style={styles.priceHeader}>
          <Text style={styles.currentPrice}>{chartLabel} {formatPrice(chart.last)}</Text>
          <Text style={[styles.priceChange, { color: lineColor }]}>
            {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
          </Text>
        </View>
      )}

      {/* Chart */}
      <View style={styles.chartContainer}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        ) : chart?.linePath ? (
          <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
                <Stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {/* Gradient fill */}
            <Path d={chart.gradientPath} fill="url(#chartGradient)" />
            {/* Price line */}
            <Path
              d={chart.linePath}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Min/Max labels */}
            <SvgText
              x={CHART_WIDTH - 4}
              y={Y_PADDING - 4}
              textAnchor="end"
              fill={COLORS.textTertiary}
              fontSize={10}
              fontFamily="monospace"
            >
              {formatPrice(chart.max)}
            </SvgText>
            <SvgText
              x={CHART_WIDTH - 4}
              y={CHART_HEIGHT - Y_PADDING + 14}
              textAnchor="end"
              fill={COLORS.textTertiary}
              fontSize={10}
              fontFamily="monospace"
            >
              {formatPrice(chart.min)}
            </SvgText>
            {/* Current price dot */}
            <Circle
              cx={CHART_WIDTH}
              cy={Y_PADDING + (CHART_HEIGHT - Y_PADDING * 2) - ((chart.last - chart.min) / (chart.max - chart.min || 1)) * (CHART_HEIGHT - Y_PADDING * 2)}
              r={4}
              fill={lineColor}
            />
          </Svg>
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.noDataText}>No price data available</Text>
          </View>
        )}
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
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  currentPrice: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  priceChange: {
    ...TYPOGRAPHY.mono,
    fontWeight: '700',
    fontSize: 14,
  },
  chartContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  loadingContainer: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
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
