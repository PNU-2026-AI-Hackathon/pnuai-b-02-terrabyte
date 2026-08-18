import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { font } from '../../appTheme/glass';
import { palette } from '../../appTheme/palette';
import { scaleTypography } from '../../appTheme/scaleTypography';
import { LineChart } from '../../components/LineChart';
import { SensorSummary } from '../../components/SensorSummary';
import { Surface } from '../../components/Surface';
import { latest, sensors } from '../../data';
import {
  useDeviceEnvironment,
  useMeasurementSeries,
} from '../../shared/device-environment/DeviceEnvironmentProvider';

export function LiveScreen({ compact }: { compact: boolean }) {
  const [deviceOpen, setDeviceOpen] = useState(false);
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
      <Pressable accessibilityRole="button" onPress={() => setDeviceOpen(true)} style={({ pressed }) => [styles.liveToolbar, pressed && styles.pressed]}>
        <View style={styles.deviceStatusRow}>
          <View style={styles.onlineDot} />
          <Text style={styles.liveStatus}>센서 정상 연결</Text>
        </View>
        <View style={styles.liveToolbarRight}>
          <Text style={styles.liveRefresh}>3초마다 자동 갱신{measurement ? ` · 업데이트 #${measurement.sequence}` : ''}</Text>
          <Text style={styles.liveDeviceAction}>디바이스 상태 보기</Text>
        </View>
      </Pressable>
      <View style={[styles.liveGrid, compact && styles.stack]}>
        {liveMetrics.map((metric) => (
          <Surface key={metric.label} style={styles.liveCard}>
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
        <Surface style={styles.liveCard}>
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
      <Modal animationType="fade" onRequestClose={() => setDeviceOpen(false)} transparent visible={deviceOpen}>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.infoModal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>DEVICE STATUS</Text>
                <Text style={styles.modalTitle}>디바이스 상태</Text>
              </View>
              <Pressable onPress={() => setDeviceOpen(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>닫기</Text>
              </Pressable>
            </View>
            <SensorSummary sensors={sensors} statusLabel="정상 연결" />
          </Surface>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create(scaleTypography({
  pageBody: { gap: 30, maxWidth: 1320, width: '100%' },
  liveToolbar: { alignItems: 'center', backgroundColor: palette.panel, borderColor: palette.line, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15 },
  pressed: { opacity: 0.78 },
  deviceStatusRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  onlineDot: { backgroundColor: '#3aad70', borderRadius: 999, height: 7, width: 7 },
  liveStatus: { color: palette.text, fontFamily: font, fontSize: 19, fontWeight: '900' },
  liveToolbarRight: { alignItems: 'flex-end', gap: 3 },
  liveRefresh: { color: palette.muted, fontFamily: font, fontSize: 15 },
  liveDeviceAction: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '800' },
  liveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  stack: { flexDirection: 'column' },
  liveCard: { flexBasis: '47%', flexGrow: 1, gap: 14, minWidth: 280, padding: 34 },
  liveCardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  liveLabel: { color: palette.text, fontFamily: font, fontSize: 23, fontWeight: '900' },
  liveRange: { color: palette.muted, fontFamily: font, fontSize: 15, textAlign: 'right' },
  liveValue: { color: palette.text, fontFamily: font, fontSize: 38, fontWeight: '900', letterSpacing: -0.8 },
  liveCaption: { color: palette.muted, fontFamily: font, fontSize: 16 },
  liveFooter: { borderTopColor: palette.line, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10 },
  liveFooterText: { color: palette.muted, fontFamily: font, fontSize: 14 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(21, 46, 35, 0.34)', flex: 1, justifyContent: 'center', padding: 22 },
  infoModal: { gap: 22, maxHeight: '84%', maxWidth: 580, padding: 28, width: '100%' },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 18, justifyContent: 'space-between' },
  modalHeaderCopy: { flex: 1, gap: 5 },
  modalEyebrow: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  modalTitle: { color: palette.text, fontFamily: font, fontSize: 32, fontWeight: '900', letterSpacing: -0.8, lineHeight: 41 },
  modalClose: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 12 },
  modalCloseText: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '800' },
}));
