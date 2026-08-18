import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font } from '../../appTheme/glass';
import { palette } from '../../appTheme/palette';
import { scaleTypography } from '../../appTheme/scaleTypography';
import { typeScale } from '../../appTheme/typography';
import { ActionButton } from '../../components/ActionButton';
import { SectionHeader } from '../../components/SectionHeader';
import { Surface } from '../../components/Surface';
import { shopProducts, type ShopProduct } from '../../data';
import type { Page } from '../../navigation/types';
import { useDeviceEnvironment } from '../../shared/device-environment/DeviceEnvironmentProvider';
import { getRecommendedProductIds } from '../../shared/factorPresentation';

const managementTasks = [
  {
    id: 'grow-light',
    priority: '높음',
    title: '생장등 작동 상태 확인',
    body: '현재 조도가 8,000lux까지 낮아졌습니다. 조명 전원과 잎 사이 30cm 거리를 확인하세요.',
    time: '예상 5분',
  },
  {
    id: 'humidity',
    priority: '보통',
    title: '오후 습도 유지',
    body: '관수 직후 환기를 10분 늦추고 습도가 50% 이상 회복되는지 확인하세요.',
    time: '예상 10분',
  },
] as const;

const cultivationCriteria = [
  {
    label: '현재 단계',
    title: '활착기 · 4일차',
    body: '뿌리가 새 배지에 자리 잡는 기간입니다. 과습과 강한 빛 변화를 피하세요.',
  },
  {
    label: '권장 환경',
    title: '20~26℃ · 55~70%',
    body: '보조 조명 4시간을 기준으로 관리합니다.',
  },
  {
    label: '다음 점검',
    title: '3일 후',
    body: '새잎, 잎 말림, 줄기 웃자람 여부를 확인하고 환경을 다시 분석합니다.',
  },
] as const;

export function GuideScreen({ compact, onNavigate }: { compact: boolean; onNavigate: (page: Page) => void }) {
  const [completedTaskIds, setCompletedTaskIds] = useState<Record<string, boolean>>({});
  const { score } = useDeviceEnvironment();
  const environmentProducts = getRecommendedProductIds(score?.factors ?? [])
    .map((id) => shopProducts.find((product) => product.id === id))
    .filter((product): product is ShopProduct => Boolean(product));
  const recommendedProducts = environmentProducts.length
    ? environmentProducts
    : shopProducts.filter((product) => product.badge?.includes('추천')).slice(0, 3);
  const completedTaskCount = managementTasks.filter((task) => completedTaskIds[task.id]).length;

  const toggleTask = (taskId: string) => {
    setCompletedTaskIds((current) => ({ ...current, [taskId]: !current[taskId] }));
  };

  return (
    <View style={styles.pageBody}>
      <Surface flat style={styles.guideTasksPanel}>
        <View style={[styles.guideTaskHeader, compact && styles.stack]}>
          <View style={styles.guideHeroCopy}><Text style={styles.guideHeroTitle}>오늘의 관리 작업</Text><Text style={styles.guideHeroBody}>환경 이상 알림과 현재 생육 단계를 기준으로 우선순위를 정했습니다.</Text></View>
          <View style={styles.guideProgress}><Text style={styles.guideProgressValue}>{completedTaskCount} / {managementTasks.length}</Text><Text style={styles.guideProgressLabel}>완료한 작업</Text></View>
        </View>
        <View style={styles.guideTaskList}>
          {managementTasks.map((task, index) => {
            const completed = Boolean(completedTaskIds[task.id]);
            return (
              <Pressable
                key={task.id}
                accessibilityLabel={`${task.title} ${completed ? '완료됨' : '완료 처리'}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: completed }}
                onPress={() => toggleTask(task.id)}
                style={({ pressed }) => [
                  styles.guideTaskRow,
                  compact && styles.stack,
                  completed && styles.guideTaskRowCompleted,
                  pressed && styles.guideTaskRowPressed,
                ]}
              >
                <View style={styles.guideTaskNumber}><Text style={styles.guideTaskNumberText}>{String(index + 1).padStart(2, '0')}</Text></View>
                <View style={styles.guideTaskCopy}><Text style={styles.guideTaskPriority}>{task.priority}</Text><Text style={[styles.guideTaskTitle, completed && styles.guideTaskTitleCompleted]}>{task.title}</Text><Text style={[styles.guideTaskBody, completed && styles.guideTaskBodyCompleted]}>{task.body}</Text></View>
                <Text style={styles.guideTaskTime}>{task.time}</Text>
                <View style={[styles.guideTaskCheck, completed && styles.guideTaskCheckCompleted]}><Text style={styles.guideTaskCheckText}>{completed ? '✓' : ''}</Text></View>
              </Pressable>
            );
          })}
        </View>
      </Surface>

      <Surface flat style={styles.guidePanel}>
        <SectionHeader title="재배 단계별 기준" description="현재는 정식 후 활착 단계로, 급격한 환경 변화를 피해야 합니다." />
        <View style={styles.guideTaskList}>
          {cultivationCriteria.map((item, index) => (
            <View key={item.label} style={[styles.guideTaskRow, compact && styles.guideTaskRowCompact]}>
              <View style={styles.guideTaskNumber}><Text style={styles.guideTaskNumberText}>{String(index + 1).padStart(2, '0')}</Text></View>
              <View style={styles.guideTaskCopy}>
                <Text style={styles.guideTaskPriority}>{item.label}</Text>
                <Text style={styles.guideTaskTitle}>{item.title}</Text>
                <Text style={styles.guideTaskBody}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </Surface>

      <Surface flat style={styles.guideProductsPanel}>
        <SectionHeader title="현재 환경 추천 제품" description="현재 환경에서 보완이 필요한 지표를 기준으로 선정했습니다." />
        <View style={styles.guideTaskList}>
          {recommendedProducts.map((product, index) => (
            <View key={product.id} style={[styles.guideTaskRow, compact && styles.guideTaskRowCompact]}>
              <View style={styles.guideTaskNumber}><Text style={styles.guideTaskNumberText}>{String(index + 1).padStart(2, '0')}</Text></View>
              <View style={styles.guideTaskCopy}>
                <Text style={styles.guideTaskTitle}>{product.name}</Text>
                <Text style={styles.guideTaskBody}>{product.desc}</Text>
              </View>
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
  guideTasksPanel: { gap: 28, padding: 36 },
  guidePanel: { gap: 28, padding: 36 },
  guideTaskHeader: { alignItems: 'center', flexDirection: 'row', gap: 30, justifyContent: 'space-between' },
  guideHeroCopy: { flex: 1, gap: 8 },
  guideHeroTitle: { ...typeScale.sectionTitle, color: palette.text, fontFamily: font },
  guideHeroBody: { ...typeScale.body, color: palette.secondary, fontFamily: font, maxWidth: 760 },
  guideProgress: { gap: 4, minWidth: 150, padding: 22 },
  guideProgressValue: { ...typeScale.cardTitle, color: palette.greenDark, fontFamily: font },
  guideProgressLabel: { ...typeScale.label, color: palette.secondary, fontFamily: font },
  guideTaskList: { gap: 0 },
  guideTaskRow: { alignItems: 'center', borderBottomColor: palette.lineStrong, borderBottomWidth: 1, flexDirection: 'row', gap: 20, padding: 23 },
  guideTaskRowCompact: { alignItems: 'flex-start', flexDirection: 'column' },
  guideTaskRowCompleted: { backgroundColor: 'rgba(228,241,233,0.42)' },
  guideTaskRowPressed: { opacity: 0.78 },
  guideTaskNumber: { alignItems: 'center', backgroundColor: palette.greenSoft, borderRadius: 10, height: 46, justifyContent: 'center', width: 46 },
  guideTaskNumberText: { ...typeScale.label, color: palette.greenDark, fontFamily: font, fontWeight: '700' },
  guideTaskCopy: { flex: 1, gap: 8, maxWidth: 850 },
  guideTaskPriority: { ...typeScale.label, color: palette.amber, fontFamily: font },
  guideTaskTitle: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontWeight: '600' },
  guideTaskTitleCompleted: { color: palette.muted, textDecorationLine: 'line-through' },
  guideTaskBody: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  guideTaskBodyCompleted: { color: palette.muted },
  guideTaskTime: { ...typeScale.label, color: palette.muted, fontFamily: font },
  guideTaskCheck: { alignItems: 'center', borderColor: palette.greenDark, borderRadius: 8, borderWidth: 1.5, height: 32, justifyContent: 'center', width: 32 },
  guideTaskCheckCompleted: { backgroundColor: palette.green, borderColor: palette.green },
  guideTaskCheckText: { color: '#ffffff', fontFamily: font, fontSize: 20, fontWeight: '900', lineHeight: 24 },
  soilMixRow: { gap: 6 },
  soilMixRatio: { ...typeScale.cardTitle, color: palette.text, fontFamily: font },
  soilReason: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  soilMaterialGrid: { flexDirection: 'row', gap: 0 },
  soilMaterialCard: { borderRightColor: palette.lineStrong, borderRightWidth: 1, flex: 1, gap: 6, padding: 20 },
  soilMaterialName: { ...typeScale.cardTitle, color: palette.text, fontFamily: font, fontWeight: '600' },
  soilMaterialRole: { ...typeScale.body, color: palette.secondary, fontFamily: font },
  soilMaterialBuyLink: { ...typeScale.button, color: palette.greenDark, fontFamily: font, marginTop: 8 },
  soilCautionList: { gap: 6 },
  soilCautionItem: { ...typeScale.body, color: palette.amber, fontFamily: font },
  soilPreCheckToggle: { ...typeScale.button, color: palette.greenDark, fontFamily: font },
  soilPreCheckList: { gap: 4, marginTop: 10 },
  soilPreCheckItem: { ...typeScale.caption, color: palette.secondary, fontFamily: font },
  soilAssumptionNotice: { ...typeScale.caption, color: palette.muted, fontFamily: font },
  guideProductsPanel: { gap: 28, padding: 36 },
  guideProductPrice: { ...typeScale.cardTitle, color: palette.greenDark, fontFamily: font, minWidth: 104, textAlign: 'right' },
}));
