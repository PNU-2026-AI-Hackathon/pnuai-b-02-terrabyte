import { StyleSheet, Text, View } from 'react-native';

import { font } from '../../appTheme/glass';
import { palette } from '../../appTheme/palette';
import { scaleTypography } from '../../appTheme/scaleTypography';
import { ActionButton } from '../../components/ActionButton';
import { SectionHeader } from '../../components/SectionHeader';
import { Surface } from '../../components/Surface';
import { shopProducts, type ShopProduct } from '../../data';
import type { Page } from '../../navigation/types';
import { useDeviceEnvironment } from '../../shared/device-environment/DeviceEnvironmentProvider';
import { getRecommendedProductIds } from '../../shared/factorPresentation';

export function GuideScreen({ compact, onNavigate }: { compact: boolean; onNavigate: (page: Page) => void }) {
  const { score } = useDeviceEnvironment();
  const recommendedProducts = getRecommendedProductIds(score?.factors ?? [])
    .map((id) => shopProducts.find((product) => product.id === id))
    .filter((product): product is ShopProduct => Boolean(product));

  return (
    <View style={styles.pageBody}>
      <Surface style={styles.guideHero}>
        <View style={styles.guideHeroCopy}><Text style={styles.reportLabel}>TODAY'S MANAGEMENT</Text><Text style={styles.guideHeroTitle}>오늘의 관리 작업 3개</Text><Text style={styles.guideHeroBody}>환경 이상 알림과 현재 생육 단계를 기준으로 우선순위를 정했습니다.</Text></View>
        <View style={styles.guideProgress}><Text style={styles.guideProgressValue}>0 / 3</Text><Text style={styles.guideProgressLabel}>완료한 작업</Text></View>
      </Surface>

      <Surface style={styles.guidePanel}>
        <SectionHeader title="우선 관리 작업" description="위에서부터 순서대로 진행하고 센서값 변화를 확인하세요." />
        <View style={styles.guideTaskList}>
          {[
            ['높음', '생장등 작동 상태 확인', '현재 조도가 8,000lux까지 낮아졌습니다. 조명 전원과 잎 사이 30cm 거리를 확인하세요.', '예상 5분'],
            ['보통', '오후 습도 유지', '관수 직후 환기를 10분 늦추고 습도가 50% 이상 회복되는지 확인하세요.', '예상 10분'],
            ['정기', '토양수분 기록', '토양수분이 31% 아래로 내려가기 전까지 추가 관수 없이 현재 상태를 기록하세요.', '예상 2분'],
          ].map(([priority, title, body, time], index) => (
            <View key={title} style={[styles.guideTaskRow, compact && styles.stack]}>
              <View style={styles.guideTaskNumber}><Text style={styles.guideTaskNumberText}>{String(index + 1).padStart(2, '0')}</Text></View>
              <View style={styles.guideTaskCopy}><Text style={styles.guideTaskPriority}>{priority}</Text><Text style={styles.guideTaskTitle}>{title}</Text><Text style={styles.guideTaskBody}>{body}</Text></View>
              <Text style={styles.guideTaskTime}>{time}</Text>
            </View>
          ))}
        </View>
      </Surface>

      <Surface style={styles.guidePanel}>
        <SectionHeader title="재배 단계별 기준" description="현재는 정식 후 활착 단계로, 급격한 환경 변화를 피해야 합니다." />
        <View style={[styles.guideStageGrid, compact && styles.stack]}>
          <View style={styles.guideStageItem}><Text style={styles.guideStageLabel}>현재 단계</Text><Text style={styles.guideStageTitle}>활착기 · 4일차</Text><Text style={styles.guideStageBody}>뿌리가 새 배지에 자리 잡는 기간입니다. 과습과 강한 광량 변화를 피하세요.</Text></View>
          <View style={styles.guideStageItem}><Text style={styles.guideStageLabel}>권장 환경</Text><Text style={styles.guideStageTitle}>20~26℃ · 55~70%</Text><Text style={styles.guideStageBody}>토양수분 32~40%, 보조 조명 4시간을 기준으로 관리합니다.</Text></View>
          <View style={styles.guideStageItem}><Text style={styles.guideStageLabel}>다음 점검</Text><Text style={styles.guideStageTitle}>3일 후</Text><Text style={styles.guideStageBody}>새잎, 잎 말림, 줄기 웃자람 여부를 확인하고 환경을 다시 분석합니다.</Text></View>
        </View>
      </Surface>

      <Surface style={styles.guideProductsPanel}>
        <SectionHeader title="현재 환경 추천 제품" description="확인이 필요한 환경 지표와 토양 배수 상태를 기준으로 선정했습니다." />
        <View style={[styles.guideProductGrid, compact && styles.stack]}>
          {recommendedProducts.map((product) => (
            <View key={product.id} style={styles.guideProductCard}>
              <Text style={styles.guideProductReason}>{product.desc}</Text>
              <Text style={styles.guideProductName}>{product.name}</Text>
              <Text style={styles.guideProductPrice}>{product.price.toLocaleString('ko-KR')}원</Text>
            </View>
          ))}
        </View>
        <ActionButton label="추천 제품 구매하러 가기" onPress={() => onNavigate('shop')} />
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create(scaleTypography({
  pageBody: { gap: 30, maxWidth: 1320, width: '100%' },
  stack: { flexDirection: 'column' },
  reportLabel: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900', letterSpacing: 1.2 },
  guideHero: { alignItems: 'center', flexDirection: 'row', gap: 30, justifyContent: 'space-between', padding: 36 },
  guideHeroCopy: { flex: 1, gap: 8 },
  guideHeroTitle: { color: palette.text, fontFamily: font, fontSize: 24, fontWeight: '900' },
  guideHeroBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26, maxWidth: 760 },
  guideProgress: { backgroundColor: palette.greenSoft, borderColor: '#c9dfd1', borderRadius: 12, borderWidth: 1, gap: 4, minWidth: 150, padding: 22 },
  guideProgressValue: { color: palette.greenDark, fontFamily: font, fontSize: 25, fontWeight: '900' },
  guideProgressLabel: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '700' },
  guidePanel: { gap: 28, padding: 36 },
  guideTaskList: { gap: 14 },
  guideTaskRow: { alignItems: 'center', backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 20, padding: 23 },
  guideTaskNumber: { alignItems: 'center', backgroundColor: palette.greenSoft, borderRadius: 10, height: 46, justifyContent: 'center', width: 46 },
  guideTaskNumberText: { color: palette.greenDark, fontFamily: font, fontSize: 16, fontWeight: '900' },
  guideTaskCopy: { flex: 1, gap: 8, maxWidth: 850 },
  guideTaskPriority: { color: palette.amber, fontFamily: font, fontSize: 14, fontWeight: '900' },
  guideTaskTitle: { color: palette.text, fontFamily: font, fontSize: 20, fontWeight: '900' },
  guideTaskBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26 },
  guideTaskTime: { color: palette.muted, fontFamily: font, fontSize: 15, fontWeight: '800' },
  guideStageGrid: { flexDirection: 'row', gap: 14 },
  guideStageItem: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, flex: 1, gap: 8, padding: 22 },
  guideStageLabel: { color: palette.greenDark, fontFamily: font, fontSize: 15, fontWeight: '900' },
  guideStageTitle: { color: palette.text, fontFamily: font, fontSize: 20, fontWeight: '900' },
  guideStageBody: { color: palette.secondary, fontFamily: font, fontSize: 15, fontWeight: '500', lineHeight: 26 },
  guideProductsPanel: { gap: 28, padding: 36 },
  guideProductGrid: { flexDirection: 'row', gap: 14 },
  guideProductCard: { backgroundColor: palette.panelMuted, borderColor: palette.lineStrong, borderRadius: 12, borderWidth: 1, flex: 1, gap: 8, minHeight: 190, padding: 22 },
  guideProductReason: { color: palette.greenDark, fontFamily: font, fontSize: 14, fontWeight: '900' },
  guideProductName: { color: palette.text, fontFamily: font, fontSize: 21, fontWeight: '900', lineHeight: 28 },
  guideProductPrice: { color: palette.greenDark, fontFamily: font, fontSize: 20, fontWeight: '900', marginTop: 'auto' },
}));
