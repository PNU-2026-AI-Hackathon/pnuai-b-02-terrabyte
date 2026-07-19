import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { GlassCard } from '../components/GlassCard';
import { latest } from '../data';
import { colors, maxContentWidth, typography } from '../theme';

type RealtimeScreenProps = {
  isCompact: boolean;
};

type Reading = {
  value: number;
  history: number[];
};

function formatMetric(value: number, unit: string, decimals: number) {
  const rounded = value.toFixed(decimals);
  if (unit === 'lux') {
    return `${Number(rounded).toLocaleString('ko-KR')} lux`;
  }
  return `${rounded}${unit}`;
}

function makeSparklinePoints(values: number[]) {
  const width = 240;
  const height = 54;
  const padding = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  return values
    .map((value, index) => {
      const x = values.length > 1 ? (index / (values.length - 1)) * width : width / 2;
      const y = padding + (1 - (value - min) / span) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function MiniSparkline({
  color,
  label,
  values,
}: {
  color: string;
  label: string;
  values: number[];
}) {
  return (
    <View style={styles.sparklineWrap}>
      <Text style={styles.sparklineLabel}>최근 1시간</Text>
      <Svg
        accessibilityLabel={`${label} 최근 1시간 추이`}
        height={54}
        preserveAspectRatio="none"
        viewBox="0 0 240 54"
        width="100%"
      >
        <Line
          stroke="rgba(120,140,125,0.2)"
          strokeDasharray="4 4"
          strokeWidth="1"
          x1="0"
          x2="240"
          y1="27"
          y2="27"
        />
        <Polyline
          fill="none"
          points={makeSparklinePoints(values)}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
      </Svg>
    </View>
  );
}

export function RealtimeScreen({ isCompact }: RealtimeScreenProps) {
  const [readings, setReadings] = useState<Reading[]>(() =>
    latest.map((metric) => ({ history: metric.sparkline, value: metric.baseValue })),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setReadings((current) =>
        current.map((reading, index) => {
          const metric = latest[index];
          const nextValue = metric.baseValue + (Math.random() * 2 - 1) * metric.jitter;
          const precision = 10 ** metric.decimals;
          const roundedValue = Math.round(nextValue * precision) / precision;

          return {
            value: roundedValue,
            history: [...reading.history.slice(-11), roundedValue],
          };
        }),
      );
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.container}>
        <GlassCard style={[styles.summaryBar, isCompact && styles.summaryBarCompact]}>
          <View style={styles.heading}>
            <Text style={styles.title}>실시간 측정값</Text>
            <Text style={styles.subtitle}>센서가 보내는 현재 환경을 확인하세요</Text>
          </View>

          <View style={[styles.status, isCompact && styles.statusCompact]}>
            <View style={styles.onlineDot} />
            <Text style={styles.statusText}>
              <Text style={styles.statusStrong}>온라인</Text> · 마지막 수신 방금 전
            </Text>
          </View>

          <Text style={styles.autoRefresh}>3초마다 자동 갱신</Text>
        </GlassCard>

        <View style={[styles.metricGrid, isCompact && styles.oneColumn]}>
          {latest.map((metric, index) => {
            const reading = readings[index];

            return (
              <GlassCard key={metric.label} soft style={styles.metricCard}>
                <View style={styles.metricLabelRow}>
                  <Text style={styles.metricEmoji}>{metric.emoji}</Text>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                </View>
                <Text style={styles.metricValue}>
                  {formatMetric(reading.value, metric.unit, metric.decimals)}
                </Text>
                <Text style={styles.metricSub}>{metric.sub}</Text>
                <MiniSparkline color={metric.color} label={metric.label} values={reading.history} />
              </GlassCard>
            );
          })}
        </View>
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
    gap: 20,
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  summaryBarCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  heading: {
    gap: 3,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  status: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
  statusCompact: {
    marginLeft: 0,
  },
  onlineDot: {
    backgroundColor: colors.deviceOnline,
    borderRadius: 999,
    height: 9,
    width: 9,
  },
  statusText: {
    color: '#3c5546',
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  statusStrong: {
    fontWeight: '800',
  },
  autoRefresh: {
    color: '#1f7a4d',
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
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
  sparklineWrap: {
    gap: 4,
    marginTop: 8,
  },
  sparklineLabel: {
    color: colors.textMuted,
    fontFamily: typography.fontFamily,
    fontSize: 11,
  },
});
