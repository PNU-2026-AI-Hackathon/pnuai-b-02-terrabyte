import { StyleSheet, Text, View } from 'react-native';

import { font } from '../../appTheme/glass';
import { palette } from '../../appTheme/palette';
import { scaleTypography } from '../../appTheme/scaleTypography';
import { typeScale } from '../../appTheme/typography';
import { LineChart } from '../../components/LineChart';
import { Surface } from '../../components/Surface';
import { latest } from '../../data';
import {
  useDeviceEnvironment,
  useMeasurementSeries,
} from '../../shared/device-environment/DeviceEnvironmentProvider';

export function LiveScreen({ compact }: { compact: boolean }) {
  const { measurements: measurement } = useDeviceEnvironment();
  const soilTemperatureSeries = useMeasurementSeries('soil_temperature_c', '1h');

  const values = measurement?.measurements;
  const liveMetrics = latest.slice(0, 4).map((metric) => {
    const current = metric.label === '온도' ? values?.airTemperatureC
      : metric.label === '습도' ? values?.airHumidityPct
      : metric.label === '조도' ? values?.plantLightPpfdUmolM2S
      : values?.soilMoisturePct;
    const unit = metric.label === '조도' ? ' PPFD' : metric.unit;
    return {
      ...metric,
      sub: metric.label === '조도' ? 'PPFD · μmol/m²/s' : metric.sub,
      value: current == null ? '--' : `${current.toLocaleString('ko-KR')}${unit}`,
    };
  });
  const soilTemperatureValues = soilTemperatureSeries.points.map((point) => point.value);
  const hasSoilTemperatureSeries = soilTemperatureValues.length >= 2;
  const soilTemperature = measurement?.measurements.soilTemperatureC;

  return (
    <View style={styles.pageBody}>
      <Text style={styles.liveRefresh}>3초마다 자동 갱신{measurement ? ` · 업데이트 #${measurement.sequence}` : ''}</Text>
      <View style={[styles.liveGrid, compact && styles.stack]}>
        {liveMetrics.map((metric) => (
          <Surface flat key={metric.label} style={styles.liveCard}>
            <View style={styles.liveCardHeader}>
              <Text style={styles.liveLabel}>{metric.label}</Text>
              <Text style={styles.liveRange}>{metric.sub}</Text>
            </View>
            <Text style={styles.liveValue}>{metric.value}</Text>
            <Text style={styles.liveCaption}>현재 측정값</Text>
            <LineChart gridLines={1} height={72} series={[{ color: metric.color, values: metric.sparkline }]} showLegend={false} />
            <View style={styles.liveFooter}>
              <Text style={styles.liveFooterText}>최저 {Math.min(...metric.sparkline).toLocaleString('ko-KR')}</Text>
              <Text style={styles.liveFooterText}>최고 {Math.max(...metric.sparkline).toLocaleString('ko-KR')}</Text>
            </View>
          </Surface>
        ))}
        <Surface flat style={styles.liveCard}>
          <View style={styles.liveCardHeader}>
            <Text style={styles.liveLabel}>토양 온도</Text>
            <Text style={styles.liveRange}>최근 1시간</Text>
          </View>
          <Text style={styles.liveValue}>
            {soilTemperature == null
              ? '--'
              : `${soilTemperature.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}℃`}
          </Text>
          {/* 현재값(폴링)과 추이(시리즈)는 별개 요청이라, 한쪽이 비어도 다른 쪽은 그대로 보여준다. */}
          <Text style={styles.liveCaption}>{soilTemperature == null ? '프로브 미연결' : '현재 측정값'}</Text>
          {hasSoilTemperatureSeries ? (
            <>
              <LineChart
                gridLines={1}
                height={72}
                series={[{ color: '#8b6f47', values: soilTemperatureValues }]}
                showLegend={false}
              />
              <View style={styles.liveFooter}>
                <Text style={styles.liveFooterText}>최저 {Math.min(...soilTemperatureValues).toLocaleString('ko-KR')}℃</Text>
                <Text style={styles.liveFooterText}>최고 {Math.max(...soilTemperatureValues).toLocaleString('ko-KR')}℃</Text>
              </View>
            </>
          ) : (
            <Text style={styles.liveCaption}>
              {soilTemperatureSeries.loading
                ? '최근 1시간 추이를 불러오는 중'
                : soilTemperatureSeries.error
                  ? '최근 1시간 추이를 불러오지 못했습니다'
                  : '표시할 추이 데이터가 아직 없습니다'}
            </Text>
          )}
        </Surface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create(scaleTypography({
  pageBody: { gap: 30, maxWidth: 1320, width: '100%' },
  liveRefresh: { ...typeScale.caption, alignSelf: 'flex-end', color: palette.muted, fontFamily: font },
  liveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  stack: { flexDirection: 'column' },
  liveCard: { flexBasis: '47%', flexGrow: 1, gap: 14, minWidth: 280, padding: 34 },
  liveCardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  liveLabel: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontWeight: '700' },
  liveRange: { ...typeScale.caption, color: palette.muted, fontFamily: font, textAlign: 'right' },
  liveValue: { ...typeScale.metric, color: palette.text, fontFamily: font },
  liveCaption: { ...typeScale.body, color: palette.muted, fontFamily: font },
  liveFooter: { borderTopColor: palette.line, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10 },
  liveFooterText: { ...typeScale.caption, color: palette.muted, fontFamily: font },
}));
