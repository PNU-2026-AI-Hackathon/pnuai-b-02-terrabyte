import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font } from '../../appTheme/glass';
import { palette } from '../../appTheme/palette';
import { scaleTypography } from '../../appTheme/scaleTypography';
import { typeScale } from '../../appTheme/typography';
import { SectionHeader } from '../../components/SectionHeader';
import { SuitabilityFormulaModal } from '../../components/SuitabilityFormulaModal';
import { Surface } from '../../components/Surface';
import { altCrops, crops, factors } from '../../data';
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
  const { score: analysisScore, measurements: analysisLatest, refetch } = useDeviceEnvironment();
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
    label: '토양 수분',
    unit: '%',
    avg24h: analysisLatest.measurements.soilMoisturePct,
    axisMax: 100,
    status: 'REFERENCE',
    finding: `현재 토양 수분은 ${analysisLatest.measurements.soilMoisturePct}%입니다. 이 값은 모니터링용이며 종합 적합도에는 포함되지 않습니다.`,
    recommendation: '작물과 배지에 맞는 관수 기준이 확정되면 별도 관수 판단에 활용하세요.',
  }] : [];
  const soilTemperatureReport = analysisLatest?.measurements.soilTemperatureC == null ? [] : [{
    label: '토양 온도',
    unit: '℃',
    avg24h: analysisLatest.measurements.soilTemperatureC,
    axisMax: 35,
    status: 'REFERENCE',
    finding: `현재 토양 온도는 ${analysisLatest.measurements.soilTemperatureC.toLocaleString('ko-KR')}℃입니다. 뿌리 주변 온도 변화를 확인하는 참고 지표입니다.`,
    recommendation: '급격한 온도 변화가 없도록 직사광선과 냉기를 피하고 배지 온도를 함께 관찰하세요.',
  }];
  const fallbackSoilTemperatureReport = {
    label: '토양 온도',
    unit: '℃',
    avg24h: 22.8,
    axisMax: 35,
    status: 'REFERENCE' as const,
    finding: '현재 토양 온도는 22.8℃입니다. 뿌리 주변 온도 변화를 확인하는 참고 지표입니다.',
    recommendation: '급격한 온도 변화가 없도록 직사광선과 냉기를 피하고 배지 온도를 함께 관찰하세요.',
  };
  const fallbackFactorReports = factors.map((factor) => ({
    label: factor.label,
    unit: factor.unit,
    avg24h: factor.avg24h,
    axisMax: factor.axisMax,
    status: factor.status,
    finding: factor.status === 'OK'
      ? `최근 평균 ${factor.avg24h.toLocaleString('ko-KR')}${factor.unit}로 권장 범위 안에 있습니다.`
      : `최근 평균 ${factor.avg24h.toLocaleString('ko-KR')}${factor.unit}로 권장 범위보다 ${factor.status === 'LOW' ? '낮은' : '높은'} 상태입니다.`,
    recommendation: factor.label === '온도'
      ? '환기와 보온 상태를 확인해 20~26℃ 범위를 유지하세요.'
      : factor.label === '습도'
        ? '관수와 환기 시간을 조절해 60~75% 범위를 유지하세요.'
        : factor.label === '조도'
          ? '생장등의 세기와 설치 거리를 조절해 조도를 보완하세요.'
          : '관수 전 토양 수분을 확인하고 30~45% 범위를 유지하세요.',
  }));
  const factorReports = analysisScore?.factors.length
    ? [...scoreFactorReports, ...soilMoistureReport, ...soilTemperatureReport]
    : [...fallbackFactorReports, ...(soilTemperatureReport.length ? soilTemperatureReport : [fallbackSoilTemperatureReport])];
  const issueFactors = getIssueFactors(analysisScore?.factors ?? []);
  const cropReports = altCrops.map((crop) => ({
    index: crop.setsCropIndex,
    name: crop.name,
    score: crop.expectedScore,
    reason: crop.reason,
    caution: crop.caution,
  }));

  return (
    <View style={styles.pageBody}>
      <Surface flat style={styles.reportCover}>
        <View style={[styles.reportCoverTop, compact && styles.stack]}>
          <View style={styles.reportCoverCopy}>
            <View style={styles.reportEyebrowRow}>
              <Text style={styles.reportEyebrow}>공간 진단 요약</Text>
              <View style={styles.reportCropBadge}><Text style={styles.reportCropBadgeText}>{currentCrop.name} 재배 기준</Text></View>
            </View>
            <Text style={styles.reportTitle}>부산 도심 옥상 A 공간 진단 보고서</Text>
            <Text style={styles.reportIntro}>현재 측정값을 바탕으로 공간의 적합도와 바로 실행할 관리 항목을 정리했습니다.</Text>
          </View>
        </View>
        <View style={[styles.reportSummaryGrid, compact && styles.reportSummaryGridCompact]}>
          <View style={[styles.reportSummaryCard, styles.reportScoreCard, compact && styles.reportSummaryCardCompact]}>
            <View style={styles.reportSummaryCardHeader}>
              <Text style={styles.reportSummaryLabel}>종합 적합도</Text>
              <Text style={styles.reportSummaryKicker}>현재 기준</Text>
            </View>
            <View style={styles.reportScoreValueBlock}>
              <View style={styles.bigScoreRow}><Text style={styles.bigScore}>{analysisScore?.total ?? '--'}</Text><Text style={styles.bigScoreUnit}>/ 100</Text></View>
              <Text style={styles.reportAssessment}>{getGradeLabel(analysisScore?.grade)} · {currentCrop.name}</Text>
            </View>
            <View style={styles.reportScoreTrack}><View style={[styles.reportScoreFill, { width: `${Math.max(0, Math.min(100, analysisScore?.total ?? 0))}%` } as any]} /></View>
          </View>
          <View style={[styles.reportSummaryCard, compact && styles.reportSummaryCardCompact]}>
            <View style={styles.reportSummaryCardHeader}>
              <Text style={styles.reportSummaryLabel}>핵심 진단</Text>
              <Text style={[styles.reportSummaryKicker, issueFactors.length ? styles.reportSummaryKickerWarn : styles.reportSummaryKickerGood]}>{issueFactors.length ? '확인 필요' : '안정'}</Text>
            </View>
            <Text style={styles.reportSummaryTitle}>{issueFactors.length ? `${issueFactors.map((factor) => factor.label).join('·')} 환경을 확인하세요` : '온도·습도·조도가 모두 적정합니다'}</Text>
            <Text style={styles.reportSummaryBody}>{issueFactors.length ? '권장 범위를 벗어난 지표부터 확인하면 관리 우선순위를 빠르게 정할 수 있습니다.' : '현재 주요 환경 지표가 권장 범위 안에 있습니다.'}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={formulaDisclosure.show}
              style={({ pressed }) => [styles.formulaLink, styles.reportSummaryFormula, pressed && styles.pressed]}
            >
              <Text style={styles.formulaLinkText}>적합도 계산식</Text>
              <Text style={styles.formulaLinkArrow}>→</Text>
            </Pressable>
          </View>
          <View style={[styles.reportSummaryCard, compact && styles.reportSummaryCardCompact]}>
            <View style={styles.reportSummaryCardHeader}>
              <Text style={styles.reportSummaryLabel}>관리 우선순위</Text>
              <Text style={styles.reportSummaryKicker}>{issueFactors.length ? `${issueFactors.length + 1}개 항목` : '2개 항목'}</Text>
            </View>
            <View style={styles.reportPriorityList}>
              {issueFactors.length ? issueFactors.map((factor, index) => (
                <View key={factor.key} style={styles.reportPriorityItem}>
                  <Text style={styles.reportPriorityNumber}>{String(index + 1).padStart(2, '0')}</Text>
                  <Text style={styles.reportPriority}>{factor.label} {factor.status === 'LOW' ? '보완' : '완화'}</Text>
                </View>
              )) : (
                <View style={styles.reportPriorityItem}>
                  <Text style={styles.reportPriorityNumber}>01</Text>
                  <Text style={styles.reportPriority}>현재 환경 설정 유지</Text>
                </View>
              )}
              <View style={styles.reportPriorityItem}>
                <Text style={styles.reportPriorityNumber}>{issueFactors.length ? String(issueFactors.length + 1).padStart(2, '0') : '02'}</Text>
                <Text style={styles.reportPriority}>토양 수분 모니터링</Text>
              </View>
            </View>
          </View>
        </View>
      </Surface>

      <SuitabilityFormulaModal
        onClose={formulaDisclosure.hide}
        scoreData={analysisScore}
        visible={formulaDisclosure.open}
      />

      <Surface flat style={styles.reportSection}>
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

      <Surface flat style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>02</Text>
          <SectionHeader title="추천 개선 방안" description="현재 환경에서 바로 적용할 수 있는 개선 방법을 우선순위별로 정리했습니다." />
        </View>
        <View style={styles.reportPlanList}>
          {[
            { number: '01', tag: '오늘 실행', title: '생장등 보조 운전 설정', body: '오후 16:00부터 20:00까지 4시간 운전하세요. 잎 끝과 조명 사이 거리는 약 30cm를 유지합니다.', effect: '조도 안정화 · 예상 +11점' },
            { number: '02', tag: '3일 관찰', title: '오후 습도 하락 구간 완화', body: '관수 직후 환기 시작 시간을 10분 늦추고 물받이 트레이를 배치해 50~60% 범위를 유지하세요.', effect: '습도 안정화 · 예상 +4점' },
            { number: '03', tag: '현재 유지', title: '토양 수분 기준 관수 유지', body: '고정 시간 관수 대신 센서값 31% 이하를 기준으로 물을 주세요. 과습 위험을 줄일 수 있습니다.', effect: '뿌리 스트레스 예방' },
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
      </Surface>

      <Surface flat style={styles.reportSection}>
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

      <Surface flat style={styles.reportSection}>
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

      <Surface flat style={styles.reportSection}>
        <View style={styles.reportSectionHeading}>
          <Text style={styles.reportSectionNumber}>05</Text>
          <SectionHeader title="토양 및 배지 추천" description="토양분석 세트의 수분·온도 측정값과 선택한 작물의 뿌리 특성을 반영했습니다." />
        </View>
        <View style={[styles.soilSummaryGrid, compact && styles.stack]}>
          <View style={styles.soilSummaryItem}><Text style={styles.soilSummaryLabel}>토양 수분</Text><Text style={styles.soilSummaryValue}>36%</Text><Text style={styles.soilSummaryState}>적정</Text></View>
          <View style={styles.soilSummaryItem}><Text style={styles.soilSummaryLabel}>토양 온도</Text><Text style={styles.soilSummaryValue}>22.8℃</Text><Text style={styles.soilSummaryState}>적정</Text></View>
          <View style={styles.soilSummaryItem}><Text style={styles.soilSummaryLabel}>배수 상태</Text><Text style={styles.soilSummaryValue}>72점</Text><Text style={styles.soilSummaryStateWarn}>보완 권장</Text></View>
        </View>
        <View style={styles.soilRecommendationList}>
          {[
            { label: '1순위', title: '실내 허브용 배양토 + 펄라이트', ratio: '권장 배합 2 : 1', body: '현재 수분을 유지하면서 통기성과 배수성을 높이는 구성입니다. 바질과 페퍼민트의 뿌리 과습을 예방하기 좋습니다.', note: '분갈이 시 화분 하단에 배수층 2cm 확보' },
            { label: '2순위', title: '코코피트 + 펄라이트 + 상토', ratio: '권장 배합 1 : 1 : 2', body: '가볍고 수분 분포가 고른 배지입니다. 자동 관수 키트를 함께 사용할 때 수분 편차를 줄일 수 있습니다.', note: '초기 2주간 토양 수분 32~40% 유지' },
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
      </Surface>

      <Surface flat style={[styles.reportOutcome, compact && styles.stack]}>
        <View style={styles.reportOutcomeCopy}>
          <Text style={styles.reportOutcomeTitle}>권장 조치 적용 시 예상 변화</Text>
          <Text style={styles.reportOutcomeBody}>생장등과 습도 관리안을 함께 적용한 뒤 7일간 현재 관수 기준을 유지하는 조건입니다.</Text>
        </View>
        <View style={[styles.reportOutcomeNumbers, compact && styles.stack]}>
          <View style={styles.reportOutcomeNumber}><Text style={styles.reportOutcomeLabel}>현재 환경점수</Text><Text style={styles.reportOutcomeValue}>68점</Text></View>
          <View style={styles.reportOutcomeNumber}><Text style={styles.reportOutcomeLabel}>7일 후 예상</Text><Text style={styles.reportOutcomeValueStrong}>83점</Text></View>
          <View style={styles.reportOutcomeNumber}><Text style={styles.reportOutcomeLabel}>개선 폭</Text><Text style={styles.reportOutcomeValueStrong}>+15점</Text></View>
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
  formulaLinkText: { ...typeScale.button, color: palette.greenDark, fontFamily: font },
  formulaLinkArrow: { color: palette.green, fontFamily: font, fontSize: 20, fontWeight: '500' },
  bigScoreRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 5 },
  bigScore: { ...typeScale.score, color: palette.text, fontFamily: font },
  bigScoreUnit: { ...typeScale.caption, color: palette.muted, marginBottom: 12 },
  factorTrack: { backgroundColor: palette.greenSoft, borderRadius: 999, flex: 1, height: 7, overflow: 'hidden' },
  factorFill: { backgroundColor: palette.green, borderRadius: 999, height: '100%' },
  factorFillWarn: { backgroundColor: palette.amber },
  reportCover: { gap: 28, padding: 38 },
  reportCoverTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 42, justifyContent: 'space-between' },
  reportCoverCopy: { flex: 1, gap: 12 },
  reportEyebrowRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  reportEyebrow: { ...typeScale.label, color: palette.greenDark, fontFamily: font, letterSpacing: 0.7 },
  reportCropBadge: { backgroundColor: palette.greenSoft, borderColor: '#c9dfd1', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  reportCropBadgeText: { ...typeScale.caption, color: palette.greenDark, fontFamily: font },
  reportTitle: { ...typeScale.pageTitle, color: palette.text, fontFamily: font },
  reportIntro: { ...typeScale.body, color: palette.secondary, fontFamily: font, maxWidth: 760 },
  reportSummaryGrid: { alignItems: 'stretch', flexDirection: 'row', gap: 14 },
  reportSummaryGridCompact: { flexDirection: 'column' },
  reportSummaryCard: { backgroundColor: 'rgba(255,255,255,0.34)', borderColor: palette.lineStrong, borderRadius: 16, borderWidth: 1, flex: 1, gap: 16, minHeight: 236, padding: 24 },
  reportSummaryCardCompact: { flexBasis: 'auto', minHeight: 0, width: '100%' },
  reportScoreCard: { backgroundColor: palette.greenSoft, borderColor: '#c9dfd1' },
  reportSummaryCardHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  reportSummaryLabel: { ...typeScale.label, color: palette.muted, fontFamily: font, letterSpacing: 0.5 },
  reportSummaryKicker: { ...typeScale.caption, color: palette.muted, fontFamily: font },
  reportSummaryKickerGood: { color: palette.greenDark },
  reportSummaryKickerWarn: { color: palette.amber },
  reportScoreValueBlock: { gap: 4 },
  reportAssessment: { ...typeScale.cardTitle, color: palette.greenDark, fontFamily: font, fontWeight: '700' },
  reportSummaryTitle: { ...typeScale.cardTitle, color: palette.text, fontFamily: font },
  reportSummaryBody: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  reportSummaryFormula: { alignSelf: 'flex-start', marginTop: 'auto', paddingHorizontal: 0 },
  reportScoreTrack: { backgroundColor: 'rgba(31,102,70,0.14)', borderRadius: 999, height: 8, overflow: 'hidden', width: '100%' },
  reportScoreFill: { backgroundColor: palette.greenDark, borderRadius: 999, height: '100%' },
  reportPriorityList: { gap: 10, marginTop: 2 },
  reportPriorityItem: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  reportPriorityNumber: { ...typeScale.caption, backgroundColor: palette.greenSoft, borderRadius: 7, color: palette.greenDark, fontFamily: font, fontWeight: '700', minWidth: 31, paddingHorizontal: 6, paddingVertical: 5, textAlign: 'center' },
  reportPriority: { ...typeScale.bodyStrong, color: palette.text, flex: 1, fontFamily: font },
  reportSection: { gap: 36, padding: 46 },
  reportSectionHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 18 },
  reportSectionNumber: { ...typeScale.label, color: palette.green, fontFamily: font, fontWeight: '700', letterSpacing: 1 },
  reportFactorList: { gap: 0 },
  reportFactorRow: { borderBottomColor: palette.lineStrong, borderBottomWidth: 1, gap: 22, padding: 30 },
  reportFactorHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  reportFactorName: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontWeight: '700' },
  reportFactorValue: { ...typeScale.metric, color: palette.text, fontFamily: font, marginTop: 6 },
  reportStatus: { ...typeScale.label, backgroundColor: palette.greenSoft, borderRadius: 999, color: palette.greenDark, fontFamily: font, overflow: 'hidden', paddingHorizontal: 13, paddingVertical: 8 },
  reportStatusWarn: { backgroundColor: palette.amberSoft, color: palette.amber },
  reportFindingGrid: { flexDirection: 'row', gap: 28 },
  reportFindingBlock: { flex: 1, gap: 8, maxWidth: 560 },
  reportFindingLabel: { ...typeScale.label, color: palette.greenDark, fontFamily: font },
  reportFindingText: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  reportPlanList: { overflow: 'hidden' },
  reportPlanRow: { alignItems: 'center', borderBottomColor: palette.lineStrong, borderBottomWidth: 1, flexDirection: 'row', gap: 28, minHeight: 148, padding: 30 },
  reportPlanNumber: { ...typeScale.cardTitle, color: palette.green, fontFamily: font, width: 38 },
  reportPlanCopy: { flex: 1, gap: 8, maxWidth: 820 },
  reportPlanTag: { ...typeScale.label, color: palette.greenDark, fontFamily: font },
  reportPlanTitle: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontWeight: '600' },
  reportPlanBody: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  reportPlanEffect: { ...typeScale.label, color: palette.greenDark, fontFamily: font, maxWidth: 210, textAlign: 'right' },
  reportSchedule: { borderLeftColor: '#b8d7c3', borderLeftWidth: 2, gap: 4, marginLeft: 10 },
  reportScheduleRow: { flexDirection: 'row', gap: 24, minHeight: 84, paddingBottom: 16, paddingLeft: 24, paddingTop: 4 },
  reportScheduleDay: { ...typeScale.label, color: palette.greenDark, fontFamily: font, width: 86 },
  reportScheduleCopy: { flex: 1, gap: 5 },
  reportScheduleTitle: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontWeight: '600' },
  reportScheduleBody: { ...typeScale.body, color: palette.secondary, fontFamily: font, maxWidth: 850 },
  reportCropList: { gap: 0 },
  reportCropRow: { alignItems: 'center', borderBottomColor: palette.lineStrong, borderBottomWidth: 1, flexDirection: 'row', gap: 22, padding: 24 },
  reportCropRowSelected: { backgroundColor: palette.greenSoft },
  reportCropScore: { alignItems: 'flex-end', flexDirection: 'row', minWidth: 64 },
  reportCropScoreValue: { ...typeScale.metric, color: palette.greenDark, fontFamily: font },
  reportCropScoreUnit: { ...typeScale.caption, color: palette.muted, marginBottom: 6 },
  reportCropCopy: { flex: 1, gap: 8, maxWidth: 880 },
  reportCropName: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontWeight: '600' },
  reportCropReason: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  reportCropCaution: { ...typeScale.caption, color: palette.muted, fontFamily: font },
  reportCropAction: { ...typeScale.button, color: palette.greenDark, fontFamily: font, textAlign: 'right' },
  soilSummaryGrid: { flexDirection: 'row', gap: 0 },
  soilSummaryItem: { borderRightColor: palette.lineStrong, borderRightWidth: 1, flex: 1, gap: 8, padding: 26 },
  soilSummaryLabel: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  soilSummaryValue: { ...typeScale.metric, color: palette.text, fontFamily: font },
  soilSummaryState: { ...typeScale.label, color: palette.greenDark, fontFamily: font },
  soilSummaryStateWarn: { ...typeScale.label, color: palette.amber, fontFamily: font },
  soilRecommendationList: { overflow: 'hidden' },
  soilRecommendationRow: { alignItems: 'flex-start', borderBottomColor: palette.lineStrong, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 30, minHeight: 190, padding: 34 },
  soilRecommendationLabelWrap: { minWidth: 92, paddingTop: 3 },
  soilRecommendationLabel: { ...typeScale.label, color: palette.greenDark, fontFamily: font },
  soilRecommendationCopy: { flex: 1, gap: 9, maxWidth: 980 },
  soilRecommendationTitle: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontWeight: '600', letterSpacing: -0.3 },
  soilRecommendationRatio: { ...typeScale.label, color: palette.greenDark, fontFamily: font },
  soilRecommendationBody: { ...typeScale.body, color: palette.secondary, fontFamily: font, maxWidth: 900 },
  soilRecommendationNote: { ...typeScale.caption, color: palette.muted, fontFamily: font },
  reportOutcome: { alignItems: 'flex-start', flexDirection: 'column', gap: 28, padding: 42 },
  reportOutcomeCopy: { flex: 1, gap: 8 },
  reportOutcomeTitle: { ...typeScale.sectionTitle, color: palette.text, fontFamily: font },
  reportOutcomeBody: { ...typeScale.body, color: palette.secondary, fontFamily: font, maxWidth: 620 },
  reportOutcomeNumbers: { alignSelf: 'stretch', flexDirection: 'row', gap: 12, width: '100%' },
  reportOutcomeNumber: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, flex: 1, gap: 5, minWidth: 120, padding: 18 },
  reportOutcomeLabel: { ...typeScale.label, color: palette.muted, fontFamily: font },
  reportOutcomeValue: { ...typeScale.metric, color: palette.text, fontFamily: font },
  reportOutcomeValueStrong: { ...typeScale.metric, color: palette.greenDark, fontFamily: font },
}));
