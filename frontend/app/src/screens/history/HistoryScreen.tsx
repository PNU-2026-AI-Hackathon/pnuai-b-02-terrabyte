import { StyleSheet, Text, View } from 'react-native';

import { font } from '../../appTheme/glass';
import { palette } from '../../appTheme/palette';
import { scaleTypography } from '../../appTheme/scaleTypography';
import { ActionButton } from '../../components/ActionButton';
import { SectionHeader } from '../../components/SectionHeader';
import { Surface } from '../../components/Surface';
import type { Page } from '../../navigation/types';

export function HistoryScreen({ compact, onNavigate }: { compact: boolean; onNavigate: (page: Page) => void }) {
  const records = [
    { date: '2026. 07. 22', score: 82, summary: '조도 보완 후 전환 적합도 상승', issues: '습도 관리 필요' },
    { date: '2026. 07. 15', score: 75, summary: '토양분석 세트 연결 및 관수 기준 설정', issues: '조도·습도 보완 필요' },
    { date: '2026. 07. 08', score: 68, isInitial: true, summary: '옥상 공간의 채광·환기·환경 조건 분석', issues: '조도·습도·배수 보완 필요' },
  ];
  const initialScore = records.find((record) => record.isInitial)?.score ?? records[records.length - 1].score;
  const currentScore = records[0]?.score ?? initialScore;
  const accumulatedImprovement = currentScore - initialScore;

  return (
    <View style={styles.pageBody}>
      <Surface flat style={styles.historySummaryPanel}>
        <SectionHeader title="부산 도심 옥상 A" description="최초 공간 진단부터 현재 모니터링까지의 변화입니다." />
        <View style={[styles.historySummaryGrid, compact && styles.stack]}>
          <View style={styles.historySummaryItem}><Text style={styles.historySummaryLabel}>최초 적합도</Text><Text style={[styles.historySummaryValue, styles.historyScoreInitial]}>{initialScore}점</Text></View>
          <View style={styles.historySummaryItem}><Text style={styles.historySummaryLabel}>현재 적합도</Text><Text style={[styles.historySummaryValue, currentScore > initialScore ? styles.historyScoreUp : currentScore < initialScore ? styles.historyScoreDown : styles.historyScoreInitial]}>{currentScore}점</Text></View>
          <View style={styles.historySummaryItem}><Text style={styles.historySummaryLabel}>누적 개선</Text><Text style={[styles.historySummaryValue, accumulatedImprovement > 0 ? styles.historyScoreUp : accumulatedImprovement < 0 ? styles.historyScoreDown : styles.historyScoreInitial]}>{accumulatedImprovement > 0 ? '+' : ''}{accumulatedImprovement}점</Text></View>
          <View style={styles.historySummaryItem}><Text style={styles.historySummaryLabel}>수집 데이터</Text><Text style={styles.historySummaryValue}>14일</Text></View>
        </View>
      </Surface>

      <Surface flat style={styles.historyPanel}>
        <SectionHeader title="진단 기록" description="측정 조건과 개선 전후 결과를 시간순으로 확인할 수 있습니다." />
        <View style={styles.historyList}>
          {records.map((record, index) => (
            <View key={record.date} style={[styles.historyRow, compact && styles.stack]}>
              <View style={styles.historyDateBlock}><Text style={styles.historyDate}>{record.date}</Text></View>
              <View style={styles.historyScoreBlock}><Text style={[styles.historyScore, record.score > initialScore ? styles.historyScoreUp : record.score < initialScore ? styles.historyScoreDown : styles.historyScoreInitial]}>{record.score}</Text><Text style={styles.historyScoreUnit}>점</Text></View>
              <View style={styles.historyCopy}><Text style={styles.historyTitle}>{record.summary}</Text><Text style={styles.historyIssue}>주요 결과 · {record.issues}</Text></View>
              {index === 0 ? <ActionButton label="보고서 열기" onPress={() => onNavigate('analysis')} quiet /> : <Text style={styles.historyArchived}>보관된 보고서</Text>}
            </View>
          ))}
        </View>
      </Surface>

      <Surface flat style={styles.historyComparePanel}>
        <View style={styles.historyCompareCopy}><Text style={styles.historyCompareTitle}>보조 조명 설치 후 조도 점수가 가장 크게 개선됐습니다</Text><Text style={styles.historyCompareBody}>일평균 조도는 9,600lux에서 11,800lux로 상승했고, 권장 범위 미달 시간은 하루 8.2시간에서 4.6시간으로 줄었습니다.</Text></View>
        <View style={styles.historyCompareValue}><Text style={styles.historyCompareValueLabel}>조도 점수 변화</Text><Text style={styles.historyCompareValueNumber}><Text style={styles.historyCompareValueBaseline}>54</Text><Text style={styles.historyCompareValueArrow}> → </Text><Text style={styles.historyScoreUp}>71</Text></Text></View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create(scaleTypography({
  pageBody: { gap: 30, maxWidth: 1320, width: '100%' },
  stack: { flexDirection: 'column' },
  historySummaryPanel: { gap: 28, padding: 36 },
  historySummaryGrid: { flexDirection: 'row', gap: 0 },
  historySummaryItem: { borderRightColor: palette.lineStrong, borderRightWidth: 1, flex: 1, gap: 7, padding: 22 },
  historySummaryLabel: { color: palette.muted, fontFamily: font, fontSize: 16, fontWeight: '800' },
  historySummaryValue: { color: palette.text, fontFamily: font, fontSize: 27, fontWeight: '900' },
  historyPanel: { gap: 28, padding: 36 },
  historyList: { overflow: 'hidden' },
  historyRow: { alignItems: 'center', borderBottomColor: palette.lineStrong, borderBottomWidth: 1, flexDirection: 'row', gap: 22, minHeight: 124, padding: 24 },
  historyDateBlock: { gap: 5, width: 120 },
  historyDate: { color: palette.text, fontFamily: font, fontSize: 18, fontWeight: '900' },
  historyScoreBlock: { alignItems: 'flex-end', flexDirection: 'row', minWidth: 100 },
  historyScore: { color: palette.greenDark, fontFamily: font, fontSize: 30, fontWeight: '900' },
  historyScoreUp: { color: palette.red },
  historyScoreDown: { color: '#2f6ea6' },
  historyScoreInitial: { color: palette.text },
  historyScoreUnit: { color: palette.muted, fontFamily: font, fontSize: 15, marginBottom: 5 },
  historyCopy: { flex: 1, gap: 7 },
  historyTitle: { color: palette.text, fontFamily: font, fontSize: 22, fontWeight: '900' },
  historyIssue: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '500', lineHeight: 28 },
  historyArchived: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '800' },
  historyComparePanel: { alignItems: 'center', flexDirection: 'row', gap: 32, justifyContent: 'space-between', padding: 36 },
  historyCompareCopy: { flex: 1, gap: 8 },
  historyCompareTitle: { color: palette.text, fontFamily: font, fontSize: 22, fontWeight: '900', lineHeight: 30 },
  historyCompareBody: { color: palette.secondary, fontFamily: font, fontSize: 17, fontWeight: '500', lineHeight: 29, maxWidth: 760 },
  historyCompareValue: { gap: 7, minWidth: 180, padding: 24 },
  historyCompareValueLabel: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '800' },
  historyCompareValueNumber: { color: palette.greenDark, fontFamily: font, fontSize: 28, fontWeight: '900' },
  historyCompareValueBaseline: { color: palette.text },
  historyCompareValueArrow: { color: palette.muted },
}));
