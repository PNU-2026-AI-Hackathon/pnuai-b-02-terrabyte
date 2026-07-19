import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { GlassCard } from '../components/GlassCard';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { chartMetrics, crops, dailyAvg, rangeTabs, score, type ChartRange } from '../data';
import { colors, maxContentWidth, radii, typography } from '../theme';

type DashboardScreenProps = {
  chartRange: ChartRange;
  isCompact: boolean;
  selectedCrop: number;
  setChartRange: (range: ChartRange) => void;
  onRealtime: () => void;
  onScore: () => void;
};

const rangeSeeds: Record<ChartRange, number> = {
  '1h': 2,
  '24h': 3,
  '7d': 5,
  '30d': 7,
};

function mkPoints(seed: number, amp: number, mid: number) {
  const points: string[] = [];
  for (let i = 0; i <= 40; i += 1) {
    const x = (i / 40) * 400;
    const y =
      mid + Math.sin(i * 0.35 + seed) * amp + Math.sin(i * 0.11 + seed * 2) * amp * 0.6;
    points.push(`${x.toFixed(0)},${Math.max(8, Math.min(102, y)).toFixed(1)}`);
  }
  return points.join(' ');
}

function SmallScoreGauge() {
  const size = 36;
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const dash = (score.value / 100) * circumference;

  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" accessibilityLabel="24h 평균 환경 점수 68점">
      <Circle
        cx="18"
        cy="18"
        fill="none"
        r={radius}
        stroke="rgba(120,140,125,0.3)"
        strokeWidth="4"
      />
      <Circle
        cx="18"
        cy="18"
        fill="none"
        r={radius}
        stroke={colors.warnAmber}
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        strokeWidth="4"
        transform="rotate(-90 18 18)"
      />
      <SvgText
        fill={colors.textPrimary}
        fontFamily={typography.fontFamily}
        fontSize="11"
        fontWeight="800"
        textAnchor="middle"
        x="18"
        y="22"
      >
        {score.value}
      </SvgText>
    </Svg>
  );
}

function TimeSeriesChart({
  color,
  label,
  points,
  rangeLabel,
  unit,
}: {
  color: string;
  label: string;
  points: string;
  rangeLabel: string;
  unit: string;
}) {
  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{label}</Text>
        <Text style={styles.chartMeta}>
          {unit} · {rangeLabel}
        </Text>
      </View>
      <Svg
        width="100%"
        height={110}
        viewBox="0 0 400 110"
        preserveAspectRatio="none"
        accessibilityLabel={`${label} 시계열 차트`}
      >
        <Line
          stroke="rgba(120,140,125,0.25)"
          strokeDasharray="4 4"
          strokeWidth="1"
          x1="0"
          x2="400"
          y1="55"
          y2="55"
        />
        <Polyline
          fill="none"
          points={points}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
      </Svg>
    </View>
  );
}

export function DashboardScreen({
  chartRange,
  isCompact,
  selectedCrop,
  setChartRange,
  onRealtime,
  onScore,
}: DashboardScreenProps) {
  const crop = crops[selectedCrop] ?? crops[0];
  const rangeLabel = rangeTabs.find((range) => range.key === chartRange)?.label ?? '24시간';

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.container}>
        <GlassCard style={[styles.summaryBar, isCompact && styles.summaryBarCompact]}>
          <View style={styles.cropSummary}>
            <Text style={styles.cropEmoji}>{crop.emoji}</Text>
            <Text style={styles.cropName}>{crop.name}</Text>
          </View>

          <Pressable accessibilityRole="button" onPress={onScore} style={styles.scorePill}>
            <SmallScoreGauge />
            <Text style={styles.scorePillText}>24h 평균 점수 보기 →</Text>
          </Pressable>

          <View style={[styles.onlineStatus, isCompact && styles.onlineStatusCompact]}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>
              <Text style={styles.onlineStrong}>온라인</Text> · 마지막 수신 방금 전
            </Text>
          </View>

          <Pressable accessibilityRole="button" onPress={onRealtime} style={styles.realtimeLink}>
            <Text style={styles.realtimeLinkText}>실시간 보기 →</Text>
          </Pressable>
        </GlassCard>

        <View style={[styles.metricGrid, isCompact && styles.oneColumn]}>
          {dailyAvg.map((metric) => (
            <GlassCard key={metric.label} soft style={styles.metricCard}>
              <View style={styles.metricLabelRow}>
                <Text style={styles.metricEmoji}>{metric.emoji}</Text>
                <Text style={styles.metricLabel}>{metric.label}</Text>
              </View>
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricSub}>{metric.sub}</Text>
            </GlassCard>
          ))}
        </View>

        <GlassCard style={styles.timeSeriesCard}>
          <View style={[styles.timeSeriesHeader, isCompact && styles.timeSeriesHeaderCompact]}>
            <Text style={styles.panelTitle}>시계열 데이터</Text>
            <View style={isCompact ? styles.tabsFull : styles.tabsFixed}>
              <SegmentedTabs value={chartRange} options={rangeTabs} onChange={setChartRange} />
            </View>
          </View>
          <View style={[styles.chartGrid, isCompact && styles.oneColumn]}>
            {chartMetrics.map((metric) => (
              <TimeSeriesChart
                color={metric.color}
                key={metric.label}
                label={metric.label}
                points={mkPoints(metric.seed + rangeSeeds[chartRange], metric.amp, metric.mid)}
                rangeLabel={rangeLabel}
                unit={metric.unit}
              />
            ))}
          </View>
        </GlassCard>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    paddingBottom: 80,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  container: {
    gap: 20,
    maxWidth: maxContentWidth,
    width: '100%',
  },
  summaryBar: {
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  summaryBarCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  cropSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  cropEmoji: {
    fontSize: 24,
  },
  cropName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '800',
  },
  scorePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 7,
    paddingLeft: 8,
    paddingRight: 16,
    paddingTop: 7,
  },
  scorePillText: {
    color: '#3c5546',
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  onlineStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
  onlineStatusCompact: {
    marginLeft: 0,
  },
  onlineDot: {
    backgroundColor: colors.deviceOnline,
    borderRadius: 999,
    height: 9,
    width: 9,
  },
  onlineText: {
    color: '#3c5546',
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  onlineStrong: {
    fontWeight: '800',
  },
  realtimeLink: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  realtimeLinkText: {
    color: '#1f7a4d',
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '800',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  oneColumn: {
    flexDirection: 'column',
  },
  metricCard: {
    flex: 1,
    flexBasis: '22%',
    gap: 8,
    minWidth: 0,
    padding: 20,
  },
  metricLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  metricEmoji: {
    fontSize: 17,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  metricValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 28,
    fontWeight: '800',
  },
  metricSub: {
    color: colors.textMuted,
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  timeSeriesCard: {
    gap: 20,
    padding: 28,
  },
  timeSeriesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  timeSeriesHeaderCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  panelTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 17,
    fontWeight: '800',
  },
  tabsFixed: {
    minWidth: 330,
  },
  tabsFull: {
    width: '100%',
  },
  chartGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  chartCard: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexBasis: '46%',
    gap: 8,
    minWidth: 0,
    padding: 18,
  },
  chartHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
  },
  chartTitle: {
    color: '#2c4436',
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '800',
  },
  chartMeta: {
    color: colors.textMuted,
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
});
