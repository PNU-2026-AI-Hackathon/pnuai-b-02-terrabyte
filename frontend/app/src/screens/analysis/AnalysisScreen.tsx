import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font } from '../../appTheme/glass';
import { palette } from '../../appTheme/palette';
import { scaleTypography } from '../../appTheme/scaleTypography';
import { ActionButton } from '../../components/ActionButton';
import { SectionHeader } from '../../components/SectionHeader';
import { SuitabilityFormulaModal } from '../../components/SuitabilityFormulaModal';
import { Surface } from '../../components/Surface';
import { altCrops, crops } from '../../data';
import type { Page } from '../../navigation/types';
import { useDeviceEnvironment } from '../../shared/device-environment/DeviceEnvironmentProvider';
import { getFactorRecommendation, getGradeLabel, getIssueFactors } from '../../shared/factorPresentation';
import { useDisclosure } from '../../shared/hooks/useDisclosure';

export function AnalysisScreen({ compact, onNavigate, onSelectCrop, selectedCrop }: {
  compact: boolean;
  onNavigate: (page: Page) => void;
  onSelectCrop: (cropCode: string) => Promise<void>;
  selectedCrop: number;
}) {
  const currentCrop = crops[selectedCrop] ?? crops[0];
  const { score: analysisScore, measurements: analysisLatest, error: analysisLoadError, refetch } = useDeviceEnvironment();
  const analysisError = analysisLoadError?.message ?? null;
  const formulaDisclosure = useDisclosure();
  const [cropSelectionError, setCropSelectionError] = useState<string | null>(null);
  const [selectingCropCode, setSelectingCropCode] = useState<string | null>(null);

  const selectRecommendedCrop = async (index: number) => {
    const crop = crops[index];
    if (!crop || crop.code === currentCrop.code) return;
    setCropSelectionError(null);
    setSelectingCropCode(crop.code);
    try {
      await onSelectCrop(crop.code);
      await refetch();
    } catch (error) {
      setCropSelectionError(error instanceof Error ? error.message : '작물 선택을 변경하지 못했습니다.');
    } finally {
      setSelectingCropCode(null);
    }
  };

  const scoreFactorReports = analysisScore?.factors.map((factor) => ({
    label: factor.label,
    unit: factor.unit,
    avg24h: factor.current,
    axisMax: Math.max(factor.current, factor.optimalMax * 1.25, 1),
    status: factor.status,
    finding: factor.status === 'OK'
      ? `현재 ${factor.current.toLocaleString('ko-KR')}${factor.unit}로 적정 범위 안에 있으며 축 점수는 ${factor.score}점입니다.`
      : `현재값이 적정 범위에서 ${factor.gap.toLocaleString('ko-KR')}${factor.unit} ${factor.status === 'LOW' ? '부족' : '초과'}하며 축 점수는 ${factor.score}점입니다.`,
    recommendation: getFactorRecommendation(factor.key),
  })) ?? [];
  const soilMoistureReport = analysisLatest ? [{
    label: '토양수분',
    unit: '%',
    avg24h: analysisLatest.measurements.soilMoisturePct,
    axisMax: 100,
    status: 'REFERENCE',
    finding: `현재 토양수분은 ${analysisLatest.measurements.soilMoisturePct}%입니다. 이 값은 모니터링용이며 종합 적합도에는 포함되지 않습니다.`,
    recommendation: '작물과 배지에 맞는 관수 기준이 확정되면 별도 관수 판단에 활용하세요.',
  }] : [];
  const factorReports = [...scoreFactorReports, ...soilMoistureReport];
  const issueFactors = getIssueFactors(analysisScore?.factors ?? []);
  const measuredAtText = analysisScore
    ? new Date(analysisScore.measuredAt).toLocaleString('ko-KR')
    : '데이터 수신 대기 중';
  const cropReports = altCrops.map((crop) => ({
    index: crop.setsCropIndex,
    name: crop.name,
    score: crop.expectedScore,
    reason: crop.reason,
    caution: crop.caution,
  }));

  return (
    <View style={styles.pageBody}>
      <Surface style={styles.reportCover}>
        <View style={[styles.reportCoverTop, compact && styles.stack]}>
          <View style={styles.reportCoverCopy}>
            <Text style={styles.reportLabel}>ENVIRONMENT REPORT · REALTIME</Text>
            <Text style={styles.reportTitle}>부산 도심 옥상 A 공간 진단 보고서</Text>
            <Text style={styles.reportLead}>{analysisScore?.cropName ?? currentCrop.name} 재배 기준으로 InfluxDB 최신 측정값과 환경 적합도를 분석했습니다.</Text>
          </View>
          <View style={styles.reportMeta}>
            <Text style={styles.reportMetaLabel}>분석 기준</Text>
            <Text style={styles.reportMetaValue}>{measuredAtText}</Text>
            <Text style={styles.reportMetaLabel}>데이터 상태</Text>
            <Text style={styles.reportMetaValue}>{analysisError ?? (analysisLatest ? 'InfluxDB 수신 정상' : '수신 대기 중')}</Text>
          </View>
        </View>
        <View style={[styles.reportSummaryGrid, compact && styles.stack]}>
          <View style={styles.reportScoreBlock}>
            <Text style={styles.reportSummaryLabel}>종합 적합도</Text>
            <View style={styles.bigScoreRow}><Text style={styles.bigScore}>{analysisScore?.total ?? '--'}</Text><Text style={styles.bigScoreUnit}>/ 100</Text></View>
            <Text style={styles.reportAssessment}>{getGradeLabel(analysisScore?.grade)}</Text>
          </View>
          <View style={[styles.reportSummaryBlock, styles.reportSummaryBlockWithFormula]}>
            <Text style={styles.reportSummaryLabel}>핵심 진단</Text>
            <Text style={styles.reportSummaryTitle}>{issueFactors.length ? `${issueFactors.map((factor) => factor.label).join('·')} 환경을 확인하세요` : '온도·습도·광량이 모두 적정합니다'}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={formulaDisclosure.show}
              style={({ pressed }) => [styles.formulaLink, styles.formulaLinkBottom, pressed && styles.pressed]}
            >
              <Text style={styles.formulaLinkText}>적합도 계산식</Text>
              <Text style={styles.formulaLinkArrow}>→</Text>
            </Pressable>
          </View>
          <View style={styles.reportSummaryBlock}>
            <Text style={styles.reportSummaryLabel}>관리 우선순위</Text>
            {issueFactors.length ? issueFactors.map((factor, index) => (
              <Text key={factor.key} style={styles.reportPriority}>{index + 1}. {factor.label} {factor.status === 'LOW' ? '보완' : '완화'}</Text>
            )) : <Text style={styles.reportPriority}>현재 환경 설정 유지</Text>}
            <Text style={styles.reportPriority}>{issueFactors.length + 1}. 토양수분 모니터링</Text>
          </View>
        </View>
        <ActionButton label="실시간 센서 확인" onPress={() => onNavigate('live')} quiet />
      </Surface>

      <SuitabilityFormulaModal
        onClose={formulaDisclosure.hide}
        scoreData={analysisScore}
        visible={formulaDisclosure.open}
      />

      <Surface style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>01</Text>
          <SectionHeader title="지표별 상세 진단" description="측정값, 권장 범위, 관찰 결과와 권장 조치를 함께 정리했습니다." />
        </View>
        <View style={styles.reportFactorList}>
          {factorReports.map((factor) => {
            const width = Math.max(8, Math.min(100, (factor.avg24h / factor.axisMax) * 100));
            return (
              <View key={factor.label} style={styles.reportFactorRow}>
                <View style={styles.reportFactorHeader}>
                  <View>
                    <Text style={styles.reportFactorName}>{factor.label}</Text>
                    <Text style={styles.reportFactorValue}>{factor.avg24h.toLocaleString('ko-KR')}{factor.unit}</Text>
                  </View>
                  <Text style={[styles.reportStatus, factor.status !== 'OK' && factor.status !== 'REFERENCE' && styles.reportStatusWarn]}>{factor.status === 'OK' ? '안정' : factor.status === 'REFERENCE' ? '참고 지표' : '보완 필요'}</Text>
                </View>
                <View style={styles.factorTrack}><View style={[styles.factorFill, factor.status !== 'OK' && styles.factorFillWarn, { width: `${width}%` } as any]} /></View>
                <View style={[styles.reportFindingGrid, compact && styles.stack]}>
                  <View style={styles.reportFindingBlock}><Text style={styles.reportFindingLabel}>분석 결과</Text><Text style={styles.reportFindingText}>{factor.finding}</Text></View>
                  <View style={styles.reportFindingBlock}><Text style={styles.reportFindingLabel}>권장 조치</Text><Text style={styles.reportFindingText}>{factor.recommendation}</Text></View>
                </View>
              </View>
            );
          })}
        </View>
      </Surface>

      <Surface style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>02</Text>
          <SectionHeader title="우선순위 개선 계획" description="효과와 실행 난이도를 기준으로 바로 적용할 작업부터 배치했습니다." />
        </View>
        <View style={styles.reportPlanList}>
          {[
            { number: '01', tag: '오늘 실행', title: '생장등 보조 운전 설정', body: '오후 16:00부터 20:00까지 4시간 운전하세요. 잎 끝과 조명 사이 거리는 약 30cm를 유지합니다.', effect: '조도 안정화 · 예상 +11점' },
            { number: '02', tag: '3일 관찰', title: '오후 습도 하락 구간 완화', body: '관수 직후 환기 시작 시간을 10분 늦추고 물받이 트레이를 배치해 50~60% 범위를 유지하세요.', effect: '습도 안정화 · 예상 +4점' },
            { number: '03', tag: '현재 유지', title: '토양수분 기준 관수 유지', body: '고정 시간 관수 대신 센서값 31% 이하를 기준으로 물을 주세요. 과습 위험을 줄일 수 있습니다.', effect: '뿌리 스트레스 예방' },
          ].map((plan) => (
            <View key={plan.number} style={[styles.reportPlanRow, compact && styles.stack]}>
              <Text style={styles.reportPlanNumber}>{plan.number}</Text>
              <View style={styles.reportPlanCopy}>
                <Text style={styles.reportPlanTag}>{plan.tag}</Text>
                <Text style={styles.reportPlanTitle}>{plan.title}</Text>
                <Text style={styles.reportPlanBody}>{plan.body}</Text>
              </View>
              <Text style={styles.reportPlanEffect}>{plan.effect}</Text>
            </View>
          ))}
        </View>
        <ActionButton label="필요한 제품 확인" onPress={() => onNavigate('shop')} />
      </Surface>

      <Surface style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>03</Text>
          <SectionHeader title="7일 관리 일정" description="권장 조치를 적용한 뒤 확인해야 할 항목입니다." />
        </View>
        <View style={styles.reportSchedule}>
          {[
            ['오늘', '조명 설정', '생장등 위치와 4시간 운전 예약을 설정합니다.'],
            ['1일 후', '센서 확인', '오후 평균 조도와 최저 습도가 개선됐는지 비교합니다.'],
            ['3일 후', '잎 상태 관찰', '잎 말림, 변색, 줄기 웃자람 여부를 기록합니다.'],
            ['7일 후', '재분석', '환경 적합도를 다시 계산하고 관수 및 조명 시간을 조정합니다.'],
          ].map(([day, title, body]) => (
            <View key={day} style={styles.reportScheduleRow}>
              <Text style={styles.reportScheduleDay}>{day}</Text>
              <View style={styles.reportScheduleCopy}><Text style={styles.reportScheduleTitle}>{title}</Text><Text style={styles.reportScheduleBody}>{body}</Text></View>
            </View>
          ))}
        </View>
      </Surface>

      <Surface style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>04</Text>
          <SectionHeader title="재배 작물 비교" description="현재 환경을 기준으로 작물별 적합도와 관리 유의사항을 비교했습니다." />
        </View>
        <View style={styles.reportCropList}>
          {cropReports.map((crop) => (
            <Pressable
              disabled={selectingCropCode !== null}
              key={crop.name}
              onPress={() => void selectRecommendedCrop(crop.index)}
              style={[styles.reportCropRow, compact && styles.stack, selectedCrop === crop.index && styles.reportCropRowSelected]}
            >
              <View style={styles.reportCropScore}><Text style={styles.reportCropScoreValue}>{crop.score}</Text><Text style={styles.reportCropScoreUnit}>점</Text></View>
              <View style={styles.reportCropCopy}>
                <Text style={styles.reportCropName}>{crop.name}{selectedCrop === crop.index ? ' · 현재 분석 기준' : ''}</Text>
                <Text style={styles.reportCropReason}>{crop.reason}</Text>
                <Text style={styles.reportCropCaution}>{crop.caution}</Text>
              </View>
              <Text style={styles.reportCropAction}>
                {selectingCropCode === crops[crop.index]?.code ? '변경 중…' : '분석 기준으로 선택'}
              </Text>
            </Pressable>
          ))}
          {cropSelectionError ? <Text accessibilityRole="alert" style={styles.authError}>{cropSelectionError}</Text> : null}
        </View>
      </Surface>

      <Surface style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>05</Text>
          <SectionHeader title="토양 및 배지 추천" description="토양분석 세트의 수분·온도 측정값과 선택한 작물의 뿌리 특성을 반영했습니다." />
        </View>
        <View style={[styles.soilSummaryGrid, compact && styles.stack]}>
          <View style={styles.soilSummaryItem}><Text style={styles.soilSummaryLabel}>토양수분</Text><Text style={styles.soilSummaryValue}>36%</Text><Text style={styles.soilSummaryState}>적정</Text></View>
          <View style={styles.soilSummaryItem}><Text style={styles.soilSummaryLabel}>토양 온도</Text><Text style={styles.soilSummaryValue}>22.8℃</Text><Text style={styles.soilSummaryState}>적정</Text></View>
          <View style={styles.soilSummaryItem}><Text style={styles.soilSummaryLabel}>배수 상태</Text><Text style={styles.soilSummaryValue}>72점</Text><Text style={styles.soilSummaryStateWarn}>보완 권장</Text></View>
        </View>
        <View style={styles.soilRecommendationList}>
          {[
            { label: '1순위', title: '실내 허브용 배양토 + 펄라이트', ratio: '권장 배합 2 : 1', body: '현재 수분을 유지하면서 통기성과 배수성을 높이는 구성입니다. 바질과 페퍼민트의 뿌리 과습을 예방하기 좋습니다.', note: '분갈이 시 화분 하단에 배수층 2cm 확보' },
            { label: '2순위', title: '코코피트 + 펄라이트 + 상토', ratio: '권장 배합 1 : 1 : 2', body: '가볍고 수분 분포가 고른 배지입니다. 자동 관수 키트를 함께 사용할 때 수분 편차를 줄일 수 있습니다.', note: '초기 2주간 토양수분 32~40% 유지' },
            { label: '유지 관리', title: '기존 흙 배수성 보완', ratio: '펄라이트 20% 추가', body: '전체 분갈이가 어렵다면 표토를 걷어내고 펄라이트를 혼합해 배수성을 단계적으로 개선하세요.', note: '혼합 후 첫 관수량은 평소의 70% 적용' },
          ].map((soilItem) => (
            <View key={soilItem.title} style={styles.soilRecommendationRow}>
              <View style={styles.soilRecommendationLabelWrap}><Text style={styles.soilRecommendationLabel}>{soilItem.label}</Text></View>
              <View style={styles.soilRecommendationCopy}>
                <Text style={styles.soilRecommendationTitle}>{soilItem.title}</Text>
                <Text style={styles.soilRecommendationRatio}>{soilItem.ratio}</Text>
                <Text style={styles.soilRecommendationBody}>{soilItem.body}</Text>
                <Text style={styles.soilRecommendationNote}>{soilItem.note}</Text>
              </View>
            </View>
          ))}
        </View>
        <ActionButton label="추천 흙과 배지 보기" onPress={() => onNavigate('shop')} />
      </Surface>

      <Surface style={[styles.reportOutcome, compact && styles.stack]}>
        <View style={styles.reportOutcomeCopy}>
          <Text style={styles.reportLabel}>EXPECTED OUTCOME</Text>
          <Text style={styles.reportOutcomeTitle}>권장 조치 적용 시 예상 변화</Text>
          <Text style={styles.reportOutcomeBody}>생장등과 습도 관리안을 함께 적용한 뒤 7일간 현재 관수 기준을 유지하는 조건입니다.</Text>
        </View>
        <View style={[styles.reportOutcomeNumbers, compact && styles.stack]}>
          <View style={styles.reportOutcomeNumber}><Text style={styles.reportOutcomeLabel}>현재 환경점수</Text><Text style={styles.reportOutcomeValue}>68</Text></View>
          <View style={styles.reportOutcomeNumber}><Text style={styles.reportOutcomeLabel}>7일 후 예상</Text><Text style={styles.reportOutcomeValueStrong}>83</Text></View>
          <View style={styles.reportOutcomeNumber}><Text style={styles.reportOutcomeLabel}>개선 폭</Text><Text style={styles.reportOutcomeValueStrong}>+15</Text></View>
        </View>
      </Surface>
    </View>
  );
}


const styles = StyleSheet.create(scaleTypography({
  pressed: { opacity: 0.78 },
  authError: { color: palette.red, fontFamily: font, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  pageBody: { gap: 30, maxWidth: 1320, width: '100%' },
  stack: { flexDirection: 'column' },
  formulaLink: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 10 },
  formulaLinkBottom: { bottom: 16, position: 'absolute', right: 16 },
  formulaLinkText: { color: palette.greenDark, fontFamily: font, fontSize: 16, fontWeight: '500' },
  formulaLinkArrow: { color: palette.green, fontFamily: font, fontSize: 20, fontWeight: '500' },
  bigScoreRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 5 },
  bigScore: { color: palette.text, fontFamily: font, fontSize: 66, fontWeight: '900', letterSpacing: -2 },
  bigScoreUnit: { color: palette.muted, fontFamily: font, fontSize: 15, marginBottom: 12 },
  factorTrack: { backgroundColor: palette.greenSoft, borderRadius: 999, flex: 1, height: 7, overflow: 'hidden' },
  factorFill: { backgroundColor: palette.green, borderRadius: 999, height: '100%' },
  factorFillWarn: { backgroundColor: palette.amber },
  reportCover: { gap: 38, padding: 46 },
  reportCoverTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 42, justifyContent: 'space-between' },
  reportCoverCopy: { flex: 1, gap: 10 },
  reportLabel: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900', letterSpacing: 1.2 },
  reportTitle: { color: palette.text, fontFamily: font, fontSize: 34, fontWeight: '900', letterSpacing: -0.9, lineHeight: 44 },
  reportLead: { color: palette.secondary, fontFamily: font, fontSize: 16, fontWeight: '500', lineHeight: 27, maxWidth: 760 },
  reportMeta: { borderLeftColor: palette.lineStrong, borderLeftWidth: 1, gap: 5, minWidth: 220, paddingLeft: 24 },
  reportMetaLabel: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '800', marginTop: 7 },
  reportMetaValue: { color: palette.text, fontFamily: font, fontSize: 17, fontWeight: '800' },
  reportSummaryGrid: { alignItems: 'stretch', flexDirection: 'row', gap: 14 },
  reportScoreBlock: { backgroundColor: palette.greenSoft, borderColor: '#c9dfd1', borderRadius: 14, borderWidth: 1, gap: 8, justifyContent: 'center', minWidth: 240, padding: 26 },
  reportSummaryBlock: { backgroundColor: palette.panelMuted, borderColor: palette.line, borderRadius: 14, borderWidth: 1, flex: 1, gap: 9, padding: 26 },
  reportSummaryBlockWithFormula: { paddingBottom: 68, position: 'relative' },
  reportSummaryLabel: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  reportAssessment: { color: palette.greenDark, fontFamily: font, fontSize: 18, fontWeight: '900' },
  reportSummaryTitle: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900', lineHeight: 29 },
  reportPriority: { color: palette.text, fontFamily: font, fontSize: 15, fontWeight: '800', lineHeight: 24 },
  reportSection: { gap: 36, padding: 46 },
  reportSectionHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 18 },
  reportSectionNumber: { color: palette.green, fontFamily: font, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  reportFactorList: { gap: 16 },
  reportFactorRow: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 14, borderWidth: 1, gap: 22, padding: 30 },
  reportFactorHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  reportFactorName: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900' },
  reportFactorValue: { color: palette.secondary, fontFamily: font, fontSize: 16, fontWeight: '800', marginTop: 5 },
  reportStatus: { backgroundColor: palette.greenSoft, borderRadius: 999, color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 13, paddingVertical: 8 },
  reportStatusWarn: { backgroundColor: palette.amberSoft, color: palette.amber },
  reportFindingGrid: { flexDirection: 'row', gap: 28 },
  reportFindingBlock: { flex: 1, gap: 8, maxWidth: 560 },
  reportFindingLabel: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900' },
  reportFindingText: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26 },
  reportPlanList: { borderColor: palette.lineStrong, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  reportPlanRow: { alignItems: 'center', backgroundColor: palette.panelMuted, borderBottomColor: palette.lineStrong, borderBottomWidth: 1, flexDirection: 'row', gap: 28, minHeight: 148, padding: 30 },
  reportPlanNumber: { color: palette.green, fontFamily: font, fontSize: 20, fontWeight: '900', width: 38 },
  reportPlanCopy: { flex: 1, gap: 8, maxWidth: 820 },
  reportPlanTag: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900' },
  reportPlanTitle: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900' },
  reportPlanBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26 },
  reportPlanEffect: { color: palette.greenDark, fontFamily: font, fontSize: 16, fontWeight: '900', maxWidth: 210, textAlign: 'right' },
  reportSchedule: { borderLeftColor: '#b8d7c3', borderLeftWidth: 2, gap: 4, marginLeft: 10 },
  reportScheduleRow: { flexDirection: 'row', gap: 24, minHeight: 84, paddingBottom: 16, paddingLeft: 24, paddingTop: 4 },
  reportScheduleDay: { color: palette.greenDark, fontFamily: font, fontSize: 16, fontWeight: '900', width: 86 },
  reportScheduleCopy: { flex: 1, gap: 5 },
  reportScheduleTitle: { color: palette.text, fontFamily: font, fontSize: 20, fontWeight: '900' },
  reportScheduleBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26, maxWidth: 850 },
  reportCropList: { gap: 14 },
  reportCropRow: { alignItems: 'center', backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 22, padding: 24 },
  reportCropRowSelected: { backgroundColor: palette.greenSoft, borderColor: '#a9cfb8' },
  reportCropScore: { alignItems: 'flex-end', flexDirection: 'row', minWidth: 64 },
  reportCropScoreValue: { color: palette.greenDark, fontFamily: font, fontSize: 28, fontWeight: '900' },
  reportCropScoreUnit: { color: palette.muted, fontFamily: font, fontSize: 14, marginBottom: 6 },
  reportCropCopy: { flex: 1, gap: 8, maxWidth: 880 },
  reportCropName: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900' },
  reportCropReason: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26 },
  reportCropCaution: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '500', lineHeight: 23 },
  reportCropAction: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900', textAlign: 'right' },
  soilSummaryGrid: { flexDirection: 'row', gap: 14 },
  soilSummaryItem: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, flex: 1, gap: 8, padding: 26 },
  soilSummaryLabel: { color: palette.secondary, fontFamily: font, fontSize: 14, fontWeight: '800' },
  soilSummaryValue: { color: palette.text, fontFamily: font, fontSize: 28, fontWeight: '900' },
  soilSummaryState: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900' },
  soilSummaryStateWarn: { color: palette.amber, fontFamily: font, fontSize: 14, fontWeight: '900' },
  soilRecommendationList: { borderColor: palette.lineStrong, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  soilRecommendationRow: { alignItems: 'flex-start', backgroundColor: palette.panelMuted, borderBottomColor: palette.lineStrong, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 30, minHeight: 190, padding: 34 },
  soilRecommendationLabelWrap: { minWidth: 92, paddingTop: 3 },
  soilRecommendationLabel: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900' },
  soilRecommendationCopy: { flex: 1, gap: 9, maxWidth: 980 },
  soilRecommendationTitle: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900', letterSpacing: -0.3, lineHeight: 29 },
  soilRecommendationRatio: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900', lineHeight: 23 },
  soilRecommendationBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26, maxWidth: 900 },
  soilRecommendationNote: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '700', lineHeight: 22 },
  reportOutcome: { alignItems: 'center', flexDirection: 'row', gap: 36, justifyContent: 'space-between', padding: 42 },
  reportOutcomeCopy: { flex: 1, gap: 8 },
  reportOutcomeTitle: { color: palette.text, fontFamily: font, fontSize: 28, fontWeight: '900' },
  reportOutcomeBody: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '500', lineHeight: 28, maxWidth: 620 },
  reportOutcomeNumbers: { flexDirection: 'row', gap: 12 },
  reportOutcomeNumber: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, gap: 5, minWidth: 120, padding: 18 },
  reportOutcomeLabel: { color: palette.muted, fontFamily: font, fontSize: 14, fontWeight: '800' },
  reportOutcomeValue: { color: palette.text, fontFamily: font, fontSize: 28, fontWeight: '900' },
  reportOutcomeValueStrong: { color: palette.greenDark, fontFamily: font, fontSize: 28, fontWeight: '900' },
}));
