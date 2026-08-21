import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { font } from '../appTheme/glass';
import { palette } from '../appTheme/palette';
import { scaleTypography } from '../appTheme/scaleTypography';
import { typeScale } from '../appTheme/typography';
import type { EnvironmentScore } from '../measurement/measurementApi';
import { Surface } from './Surface';

type SuitabilityFormulaModalProps = {
  onClose: () => void;
  scoreData: EnvironmentScore | null;
  visible: boolean;
};

export function SuitabilityFormulaModal({ onClose, scoreData, visible }: SuitabilityFormulaModalProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <Surface style={styles.formulaModal}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>적합도 계산식</Text>
              <Text style={styles.modalDescription}>온도·습도·PPFD 세 가지 환경값만 사용합니다.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>닫기</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.formulaContent}>
            <View style={styles.formulaNotice}>
              <Text style={styles.formulaNoticeTitle}>점수 기준 기간</Text>
              <Text style={styles.formulaBody}>종합 적합도와 항목별 점수는 최근 24시간의 유효 측정값 산술 평균으로 계산합니다.</Text>
            </View>
            <View style={styles.formulaSection}>
              <Text style={styles.formulaSectionTitle}>1. 지표별 점수 계산</Text>
              <Text style={styles.formulaBody}>
                작물별 0점 하한(L₀), 적정 하한(L), 적정 상한(U), 0점 상한(U₀)을 기준으로 각 지표를 0~100점으로
                환산합니다. 적정 범위는 100점이며 바깥 구간은 선형으로 감소합니다.
              </Text>
              {scoreData?.factors.map((factor) => (
                <View key={factor.key} style={styles.formulaFactorRow}>
                  <View>
                    <Text style={styles.formulaFactorName}>{factor.label}</Text>
                    <Text style={styles.formulaFactorRange}>
                      적정 {factor.optimalMin.toLocaleString('ko-KR')}~{factor.optimalMax.toLocaleString('ko-KR')}
                      {factor.unit}
                    </Text>
                  </View>
                  <Text style={styles.formulaFactorScore}>{factor.score}점</Text>
                </View>
              ))}
            </View>

            <View style={styles.formulaSection}>
              <Text style={styles.formulaSectionTitle}>2. 종합 적합도 계산</Text>
              <View style={styles.formulaExpressionBox}>
                <Text style={styles.formulaExpression}>100 × (T/100)¹⁄³ × (H/100)¹⁄³ × (L/100)¹⁄³</Text>
                <Text style={styles.formulaEquivalentExpression}>= (T × H × L)¹⁄³</Text>
              </View>
              <Text style={styles.formulaBody}>T = 온도 점수 · H = 습도 점수 · L = PPFD 조도 점수</Text>
            </View>

            <View style={styles.formulaNotice}>
              <Text style={styles.formulaNoticeTitle}>점수 제외 항목</Text>
              <Text style={styles.formulaBody}>토양 수분은 종합 적합도에 포함하지 않습니다.</Text>
            </View>
          </ScrollView>
        </Surface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create(
  scaleTypography({
    modalBackdrop: {
      alignItems: 'center',
      backgroundColor: 'rgba(21, 46, 35, 0.34)',
      flex: 1,
      justifyContent: 'center',
      padding: 22,
    },
    modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 18, justifyContent: 'space-between' },
    modalHeaderCopy: { flex: 1, gap: 5 },
    modalTitle: { ...typeScale.dialogTitle, color: palette.text, fontFamily: font },
    modalClose: {
      alignItems: 'center',
      borderColor: palette.line,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 36,
      paddingHorizontal: 12,
    },
    modalCloseText: { ...typeScale.button, color: palette.secondary, fontFamily: font },
    modalDescription: { ...typeScale.body, color: palette.secondary, fontFamily: font },
    formulaModal: { gap: 22, maxHeight: '86%', maxWidth: 680, padding: 30, width: '100%' },
    formulaContent: { gap: 18, paddingBottom: 4 },
    formulaSection: {
      backgroundColor: palette.panelMuted,
      borderColor: palette.line,
      borderRadius: 14,
      borderWidth: 1,
      gap: 14,
      padding: 20,
    },
    formulaSectionTitle: { ...typeScale.cardTitle, color: palette.text, fontFamily: font },
    formulaBody: { ...typeScale.body, color: palette.secondary, fontFamily: font },
    formulaFactorRow: {
      alignItems: 'center',
      borderTopColor: palette.line,
      borderTopWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: 12,
    },
    formulaFactorName: { ...typeScale.label, color: palette.text, fontFamily: font },
    formulaFactorRange: { ...typeScale.caption, color: palette.muted, marginTop: 3 },
    formulaFactorScore: { ...typeScale.cardTitle, color: palette.greenDark, fontFamily: font },
    formulaExpressionBox: {
      alignItems: 'center',
      backgroundColor: palette.greenSoft,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 20,
    },
    formulaExpression: { ...typeScale.cardTitle, color: palette.greenDark, fontFamily: font, textAlign: 'center' },
    formulaEquivalentExpression: {
      color: palette.secondary,
      fontFamily: font,
      ...typeScale.caption,
      marginTop: 8,
      textAlign: 'center',
    },
    formulaNotice: {
      backgroundColor: palette.amberSoft,
      borderColor: 'rgba(201,139,47,0.24)',
      borderRadius: 14,
      borderWidth: 1,
      gap: 6,
      padding: 18,
    },
    formulaNoticeTitle: { ...typeScale.label, color: palette.text, fontFamily: font },
  }),
);
