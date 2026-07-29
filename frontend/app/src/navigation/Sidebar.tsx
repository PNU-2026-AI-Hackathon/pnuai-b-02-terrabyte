import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { glassWebStyle, font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';
import { Surface } from '../components/Surface';
import type { Page } from './types';

const navItems: Array<{ key: Page; label: string }> = [
  { key: 'dashboard', label: '공간 개요' },
  { key: 'analysis', label: '공간 진단' },
  { key: 'live', label: '환경 모니터링' },
  { key: 'history', label: '진단 이력' },
  { key: 'guide', label: '관리 가이드' },
  { key: 'shop', label: '제품 추천' },
];

export function Sidebar({ compact, cropName, onHide, onLogout, onNavigate, page }: {
  compact: boolean;
  cropName: string;
  onHide?: () => void;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
  page: Page;
}) {
  const [farmInfoOpen, setFarmInfoOpen] = useState(false);

  if (compact) {
    return (
      <View style={[styles.mobileNav, glassWebStyle]}>
        <Text style={styles.mobileBrandName}>TerraByte</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileNavItems}>
          {navItems.map((item) => (
            <Pressable key={item.key} onPress={() => onNavigate(item.key)} style={styles.mobileNavItem}>
              <Text style={[styles.mobileNavText, page === item.key && styles.mobileNavTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <>
    <View style={[styles.sidebar, glassWebStyle]}>
      <View style={styles.brandRow}>
        <Text style={styles.brandName}>TerraByte</Text>
        {onHide ? (
          <Pressable accessibilityLabel="사이드바 숨기기" accessibilityRole="button" onPress={onHide} style={({ pressed }) => [styles.hideButton, pressed && styles.pressed]}>
            <Text style={styles.hideButtonText}>☰</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.navCaption}>메뉴</Text>
      <View style={styles.navList}>
        {navItems.map((item) => {
          const active = item.key === page;
          return (
            <Pressable
              accessibilityRole="button"
              key={item.key}
              onPress={() => onNavigate(item.key)}
              style={[styles.navItem, active && styles.navItemActive]}
            >
              <Text style={[styles.navItemText, active && styles.navItemTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sidebarBottom}>
        <Pressable accessibilityRole="button" onPress={() => setFarmInfoOpen(true)} style={({ pressed }) => [styles.devicePanel, pressed && styles.pressed]}>
          <View style={styles.deviceStatusRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.deviceStatus}>정상 연결</Text>
          </View>
          <Text style={styles.deviceTitle}>내 스마트팜</Text>
          <Text style={styles.deviceDetail}>마지막 수신 방금 전</Text>
          <Text style={styles.devicePanelAction}>스마트팜 정보 보기</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>
      </View>
    </View>
    <Modal animationType="fade" onRequestClose={() => setFarmInfoOpen(false)} transparent visible={farmInfoOpen}>
      <View style={styles.modalBackdrop}>
        <Surface style={styles.infoModal}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalEyebrow}>SMART FARM</Text>
              <Text style={styles.modalTitle}>내 스마트팜</Text>
            </View>
            <Pressable onPress={() => setFarmInfoOpen(false)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>닫기</Text>
            </Pressable>
          </View>
          <View style={styles.farmStatusSummary}>
            <View style={styles.onlineDot} />
            <View style={styles.farmStatusCopy}>
              <Text style={styles.farmStatusTitle}>모든 장치가 정상 작동 중입니다</Text>
              <Text style={styles.farmStatusBody}>등록된 센서에서 환경 데이터를 정상적으로 받고 있어요.</Text>
            </View>
          </View>
          <View style={styles.productInfoList}>
            <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>농장 이름</Text><Text style={styles.productInfoValue}>내 스마트팜</Text></View>
            <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>재배 작물</Text><Text style={styles.productInfoValue}>{cropName}</Text></View>
            <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>등록 기기</Text><Text style={styles.productInfoValue}>TerraByte Hub 01</Text></View>
            <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>연결 센서</Text><Text style={styles.productInfoValue}>7개</Text></View>
            <View style={styles.productInfoRow}><Text style={styles.productInfoLabel}>마지막 동기화</Text><Text style={styles.productInfoValue}>방금 전</Text></View>
          </View>
        </Surface>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create(scaleTypography({
  pressed: { opacity: 0.78 },
  sidebar: { backgroundColor: 'rgba(255,255,255,0.44)', borderColor: palette.line, borderRightWidth: 1, paddingBottom: 30, paddingHorizontal: 22, paddingTop: 38, width: 240, zIndex: 2 },
  brandRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 },
  brandName: { color: palette.text, fontFamily: font, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  hideButton: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, height: 30, justifyContent: 'center', width: 30 },
  hideButtonText: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '900' },
  navCaption: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '900', letterSpacing: 0.3, marginBottom: 16, marginTop: 54, paddingHorizontal: 13 },
  navList: { gap: 8 },
  navItem: { borderLeftColor: 'transparent', borderLeftWidth: 3, borderRadius: 9, justifyContent: 'center', minHeight: 48, paddingHorizontal: 15 },
  navItemActive: { backgroundColor: palette.greenSoft, borderLeftColor: palette.green },
  navItemText: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '700' },
  navItemTextActive: { color: palette.greenDark, fontWeight: '800' },
  sidebarBottom: { gap: 10, marginTop: 'auto' },
  devicePanel: { backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 10, borderWidth: 1, padding: 14 },
  deviceStatusRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  onlineDot: { backgroundColor: '#3aad70', borderRadius: 999, height: 7, width: 7 },
  deviceStatus: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '700' },
  deviceTitle: { color: palette.text, fontFamily: font, fontSize: 19, fontWeight: '800', marginTop: 12 },
  deviceDetail: { color: palette.muted, fontFamily: font, fontSize: 14, marginTop: 5 },
  devicePanelAction: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '800', marginTop: 16 },
  logoutButton: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, paddingVertical: 10 },
  logoutText: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '700' },
  mobileNav: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.48)', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 20, minHeight: 68, paddingHorizontal: 22, zIndex: 2 },
  mobileBrandName: { color: palette.text, fontFamily: font, fontSize: 18, fontWeight: '900' },
  mobileNavItems: { alignItems: 'center', gap: 18 },
  mobileNavItem: { paddingVertical: 12 },
  mobileNavText: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '700' },
  mobileNavTextActive: { color: palette.greenDark },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(21, 46, 35, 0.34)', flex: 1, justifyContent: 'center', padding: 22 },
  infoModal: { gap: 22, maxHeight: '84%', maxWidth: 580, padding: 28, width: '100%' },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 18, justifyContent: 'space-between' },
  modalHeaderCopy: { flex: 1, gap: 5 },
  modalEyebrow: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  modalTitle: { color: palette.text, fontFamily: font, fontSize: 32, fontWeight: '900', letterSpacing: -0.8, lineHeight: 41 },
  modalClose: { alignItems: 'center', borderColor: palette.line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 12 },
  modalCloseText: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '800' },
  productInfoList: { borderColor: palette.line, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  productInfoRow: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 16 },
  productInfoLabel: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '700' },
  productInfoValue: { color: palette.text, fontFamily: font, fontSize: 16, fontWeight: '800' },
  farmStatusSummary: { alignItems: 'flex-start', backgroundColor: palette.greenSoft, borderColor: '#c9dfd1', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 17 },
  farmStatusCopy: { flex: 1, gap: 4 },
  farmStatusTitle: { color: palette.greenDark, fontFamily: font, fontSize: 18, fontWeight: '900' },
  farmStatusBody: { color: palette.secondary, fontFamily: font, fontSize: 16, fontWeight: '500', lineHeight: 25 },
}));
