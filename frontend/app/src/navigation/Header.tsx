import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';
import { Surface } from '../components/Surface';
import type { Page } from './types';

const pageCopy: Record<Page, { title: string; description: string }> = {
  dashboard: { title: '공간 개요', description: '스마트팜 전환 적합도와 운영 중인 재배 환경을 확인하세요.' },
  analysis: { title: '공간 진단', description: '설치 전 공간 조건과 작물별 재배 가능성을 분석한 보고서입니다.' },
  live: { title: '환경 모니터링', description: '공간분석·토양분석 세트가 전송하는 최신 값을 확인하세요.' },
  history: { title: '진단 이력', description: '공간별 진단 결과와 환경 변화 기록을 비교하세요.' },
  guide: { title: '관리 가이드', description: '현재 환경과 재배 단계에 맞는 관리 작업을 확인하세요.' },
  shop: { title: '환경 개선 제품', description: '공간 진단 결과에 맞는 장비와 토양·배지를 확인하세요.' },
};

export function Header({ compact, page }: { compact: boolean; page: Page }) {
  const copy = pageCopy[page];
  const [alertsOpen, setAlertsOpen] = useState(false);
  return (
    <>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.headerCopy}>
          <Text style={styles.pageTitle}>{copy.title}</Text>
          <Text style={styles.pageDescription}>{copy.description}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" onPress={() => setAlertsOpen(true)} style={styles.headerAlertButton}>
            <Text style={styles.headerAlertLabel}>이상 환경 알림</Text>
            <Text style={styles.headerAlertCount}>2</Text>
          </Pressable>
          <View style={styles.headerDevice}>
            <View style={styles.onlineDot} />
            <Text style={styles.headerDeviceText}>기기 온라인</Text>
          </View>
        </View>
      </View>
      <Modal animationType="fade" onRequestClose={() => setAlertsOpen(false)} transparent visible={alertsOpen}>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.alertModal}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>REAL-TIME ALERT</Text>
                <Text style={styles.modalTitle}>이상 환경 알림</Text>
                <Text style={styles.modalDescription}>권장 범위를 벗어난 환경이 2건 감지되었습니다.</Text>
              </View>
              <Pressable onPress={() => setAlertsOpen(false)} style={styles.modalClose}><Text style={styles.modalCloseText}>닫기</Text></Pressable>
            </View>
            <View style={styles.alertList}>
              <View style={styles.alertItemCritical}>
                <View style={styles.alertItemHeader}><Text style={styles.alertSeverityCritical}>주의</Text><Text style={styles.alertTime}>10분 전</Text></View>
                <Text style={styles.alertTitle}>조도가 권장 범위보다 낮습니다</Text>
                <Text style={styles.alertBody}>현재 8,000lux로 권장 하한 15,000lux보다 낮습니다. 생장등 상태와 설치 거리를 확인하세요.</Text>
              </View>
              <View style={styles.alertItemWarn}>
                <View style={styles.alertItemHeader}><Text style={styles.alertSeverityWarn}>확인 필요</Text><Text style={styles.alertTime}>24분 전</Text></View>
                <Text style={styles.alertTitle}>습도 하락이 지속되고 있습니다</Text>
                <Text style={styles.alertBody}>현재 습도는 45%이며 최근 30분 동안 5% 감소했습니다. 관수 후 환기 시간을 조정하세요.</Text>
              </View>
            </View>
            <Text style={styles.alertPolicy}>알림 기준: 권장 범위 이탈이 10분 이상 지속되면 사용자에게 안내합니다.</Text>
          </Surface>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create(scaleTypography({
  header: { alignItems: 'center', flexDirection: 'row', gap: 30, paddingBottom: 24, paddingHorizontal: 48, paddingTop: 40 },
  headerCompact: { alignItems: 'flex-start', flexDirection: 'column', paddingHorizontal: 20, paddingTop: 24 },
  headerCopy: { flex: 1, gap: 8, maxWidth: 820 },
  pageTitle: { color: palette.text, fontFamily: font, fontSize: 35, fontWeight: '900', letterSpacing: -1, lineHeight: 43 },
  pageDescription: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 25 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  headerAlertButton: { alignItems: 'center', backgroundColor: palette.amberSoft, borderColor: 'rgba(201,139,47,0.28)', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 42, paddingHorizontal: 14 },
  headerAlertLabel: { color: '#8b5d1d', fontFamily: font, fontSize: 15, fontWeight: '900' },
  headerAlertCount: { alignItems: 'center', backgroundColor: palette.amber, borderRadius: 999, color: '#ffffff', fontFamily: font, fontSize: 15, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, textAlign: 'center' },
  headerDevice: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  onlineDot: { backgroundColor: '#3aad70', borderRadius: 999, height: 7, width: 7 },
  headerDeviceText: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '700' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(21, 46, 35, 0.34)', flex: 1, justifyContent: 'center', padding: 22 },
  alertModal: { gap: 24, maxHeight: '84%', maxWidth: 680, padding: 30, width: '100%' },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 18, justifyContent: 'space-between' },
  modalHeaderCopy: { flex: 1, gap: 5 },
  modalEyebrow: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  modalTitle: { color: palette.text, fontFamily: font, fontSize: 32, fontWeight: '900', letterSpacing: -0.8, lineHeight: 41 },
  modalDescription: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '500', lineHeight: 28 },
  modalClose: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 12 },
  modalCloseText: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '800' },
  alertList: { gap: 12 },
  alertItemCritical: { backgroundColor: 'rgba(196,94,85,0.10)', borderColor: 'rgba(196,94,85,0.24)', borderRadius: 12, borderWidth: 1, gap: 8, padding: 20 },
  alertItemHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  alertSeverityCritical: { color: palette.red, fontFamily: font, fontSize: 15, fontWeight: '900' },
  alertTime: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '700' },
  alertTitle: { color: palette.text, fontFamily: font, fontSize: 22, fontWeight: '900' },
  alertBody: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '500', lineHeight: 28 },
  alertItemWarn: { backgroundColor: palette.amberSoft, borderColor: 'rgba(201,139,47,0.24)', borderRadius: 12, borderWidth: 1, gap: 8, padding: 20 },
  alertSeverityWarn: { color: palette.amber, fontFamily: font, fontSize: 15, fontWeight: '900' },
  alertPolicy: { color: palette.muted, fontFamily: font, fontSize: 14, lineHeight: 22 },
}));
