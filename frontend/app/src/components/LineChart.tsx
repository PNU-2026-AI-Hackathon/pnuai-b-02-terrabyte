import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';

export type LineChartSeries = {
  label?: string;
  color: string;
  values: number[];
};

type LineChartProps = {
  series: LineChartSeries[];
  width?: number;
  height?: number;
  showLegend?: boolean;
  axisLabels?: string[];
  gridLines?: number;
};

function toPoints(values: number[], width: number, height: number, padding: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  return values
    .map((value, index) => {
      const x = values.length > 1 ? (index / (values.length - 1)) * width : width / 2;
      const y = height - padding - ((value - min) / span) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function LineChart({
  series,
  width = 600,
  height = 180,
  showLegend = series.some((item) => item.label),
  axisLabels,
  gridLines = 4,
}: LineChartProps) {
  const padding = 6;
  const gridY = Array.from({ length: gridLines }, (_, index) => (height / (gridLines + 1)) * (index + 1));

  return (
    <View style={styles.wrap}>
      {showLegend ? (
        <View style={styles.legend}>
          {series.map((item, index) => (
            <View key={item.label ?? index} style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: item.color }]} />
              {item.label ? <Text style={styles.legendText}>{item.label}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
      <Svg height={height} preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`} width="100%">
        {gridY.map((y) => (
          <Line key={y} stroke={palette.line} strokeWidth="1" x1="0" x2={width} y1={y} y2={y} />
        ))}
        {series.map((item, index) => (
          <Polyline
            fill="none"
            key={item.label ?? index}
            points={toPoints(item.values, width, height, padding)}
            stroke={item.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
          />
        ))}
      </Svg>
      {axisLabels ? (
        <View style={styles.axis}>
          {axisLabels.map((label) => (
            <Text key={label} style={styles.axisText}>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create(
  scaleTypography({
    wrap: { gap: 12 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    legendItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    legendLine: { borderRadius: 999, height: 3, width: 17 },
    legendText: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '700' },
    axis: { flexDirection: 'row', justifyContent: 'space-between' },
    axisText: { color: palette.muted, fontFamily: font, fontSize: 15 },
  }),
);
