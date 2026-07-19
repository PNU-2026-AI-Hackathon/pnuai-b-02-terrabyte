import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { altCrops, crops, equipment, factors, score, soil, type Factor } from '../data';
import { colors, maxContentWidth, radii, typography } from '../theme';

type ScoreScreenProps = {
  isCompact: boolean;
  selectedCrop: number;
  setSelectedCrop: (index: number) => void;
  onRealtime: () => void;
  onShop: () => void;
};

function formatNumber(value: number) {
  return value >= 1000 ? value.toLocaleString('ko-KR') : String(value);
}

function formatMetric(value: number, unit: string) {
  return unit === 'lux' ? `${formatNumber(value)} lux` : `${formatNumber(value)}${unit}`;
}

function formatWindowDate(value: string) {
  return `${value.slice(5, 10)} ${value.slice(11, 16)}`;
}

function getPercent(factor: Factor, value: number) {
  const span = factor.axisMax - factor.axisMin;
  return Math.min(98, Math.max(1, ((value - factor.axisMin) / span) * 100));
}

function ScoreGauge() {
  const size = 200;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (score.value / 100) * circumference;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      accessibilityLabel="최근 24시간 평균 환경 점수 68점"
    >
      <Defs>
        <SvgLinearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={colors.brandStart} />
          <Stop offset="100%" stopColor={colors.brandEnd} />
        </SvgLinearGradient>
      </Defs>
      <Circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke="rgba(120,140,125,0.24)"
        strokeWidth={strokeWidth}
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke="url(#scoreGradient)"
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <SvgText
        fill={colors.textPrimary}
        fontFamily={typography.fontFamily}
        fontSize="48"
        fontWeight="800"
        textAnchor="middle"
        x={size / 2}
        y={size / 2 + 8}
      >
        {score.value}
      </SvgText>
      <SvgText
        fill={colors.textMuted}
        fontFamily={typography.fontFamily}
        fontSize="18"
        fontWeight="700"
        textAnchor="middle"
        x={size / 2}
        y={size / 2 + 36}
      >
        /100
      </SvgText>
    </Svg>
  );
}

function FactorRow({ factor }: { factor: Factor }) {
  const ok = factor.status === 'OK';
  const badge = ok ? '적정' : factor.status === 'LOW' ? '부족' : '초과';
  const bandLeft = getPercent(factor, factor.optimalMin);
  const bandWidth = getPercent(factor, factor.optimalMax) - bandLeft;
  const markerLeft = getPercent(factor, factor.avg24h);
  const markerColor = ok ? '#2b8f6e' : '#d9822b';
  const gapText =
    factor.gap && factor.gap > 0
      ? `${factor.label} 24h 평균이 ${formatMetric(factor.gap, factor.unit)} ${
          factor.status === 'LOW' ? '부족해요' : '초과예요'
        }`
      : null;

  return (
    <View style={styles.factorRow}>
      <View style={styles.factorHeader}>
        <View>
          <Text style={styles.factorLabel}>{factor.label}</Text>
          <Text style={styles.factorCurrent}>24h 평균 {formatMetric(factor.avg24h, factor.unit)}</Text>
        </View>
        <View style={styles.factorRight}>
          <Text style={styles.factorOptimal}>
            최적 {formatMetric(factor.optimalMin, factor.unit)}~{formatMetric(factor.optimalMax, factor.unit)}
          </Text>
          <View style={[styles.badge, ok ? styles.okBadge : styles.warnBadge]}>
            <Text style={[styles.badgeText, ok ? styles.okBadgeText : styles.warnBadgeText]}>{badge}</Text>
          </View>
        </View>
      </View>
      <View style={styles.rangeTrack}>
        <View style={[styles.rangeBand, { left: `${bandLeft}%`, width: `${bandWidth}%` } as any]} />
        <View
          style={[
            styles.rangeMarker,
            { backgroundColor: markerColor, left: `${markerLeft}%` } as any,
          ]}
        />
      </View>
      {gapText ? <Text style={styles.gapText}>{gapText}</Text> : null}
    </View>
  );
}

export function ScoreScreen({
  isCompact,
  selectedCrop,
  setSelectedCrop,
  onRealtime,
  onShop,
}: ScoreScreenProps) {
  const crop = crops[selectedCrop] ?? crops[0];

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.container}>
        <View style={[styles.twoColumn, isCompact && styles.oneColumn]}>
          <GlassCard style={[styles.panel, styles.overallCard]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>환경 점수</Text>
              <View style={styles.gradePill}>
                <Text style={styles.gradeText}>{score.grade}</Text>
              </View>
            </View>
            <View style={styles.gaugeWrap}>
              <ScoreGauge />
            </View>
            <Text style={styles.meta}>
              '{crop.name}' 기준 · 최근 24시간 평균 ({formatWindowDate(score.windowStart)} ~{' '}
              {formatWindowDate(score.windowEnd)})
            </Text>
            <Text style={styles.scoreDisclaimer}>* 환경 점수 산정 로직 확정 전 예시 데이터입니다</Text>
            <Pressable accessibilityRole="button" onPress={() => undefined} style={styles.refreshButton}>
              <Text style={styles.refreshText}>새로고침 ⟳</Text>
            </Pressable>
          </GlassCard>

          <GlassCard style={[styles.panel, styles.factorCard]}>
            <Text style={styles.panelTitle}>세부 항목</Text>
            <View style={styles.factorList}>
              {factors.map((factor) => (
                <FactorRow key={factor.label} factor={factor} />
              ))}
            </View>
          </GlassCard>
        </View>

        <GlassCard style={styles.panel}>
          <View>
            <Text style={styles.panelTitle}>지금 환경에 더 잘 맞는 작물</Text>
            <Text style={styles.sectionSub}>카드를 선택하면 작물을 변경할 수 있어요</Text>
          </View>
          <View style={[styles.altGrid, isCompact && styles.oneColumn]}>
            {altCrops.map((alt) => (
              <Pressable
                accessibilityRole="button"
                key={alt.name}
                onPress={() => setSelectedCrop(alt.setsCropIndex)}
                style={styles.altCard}
              >
                <Text style={styles.altEmoji}>{alt.emoji}</Text>
                <Text style={styles.altName}>{alt.name}</Text>
                <Text style={styles.altScore}>
                  예상 점수 <Text style={styles.altScoreStrong}>{alt.expectedScore}점</Text>
                </Text>
              </Pressable>
            ))}
          </View>
        </GlassCard>

        <View style={[styles.twoColumn, isCompact && styles.oneColumn]}>
          <GlassCard style={styles.panel}>
            <Text style={styles.panelTitle}>추가 구매 추천</Text>
            <View style={styles.recommendList}>
              {equipment.map((item) => {
                const isRule = item.source === '규칙 기반';
                return (
                  <View key={item.name} style={[styles.recommendItem, isCompact && styles.recommendItemCompact]}>
                    <View style={styles.recommendEmoji}>
                      <Text style={styles.recommendEmojiText}>{item.emoji}</Text>
                    </View>
                    <View style={styles.recommendCopy}>
                      <View style={styles.recommendTitleRow}>
                        <Text style={styles.recommendName}>{item.name}</Text>
                        <View style={[styles.sourceTag, isRule ? styles.ruleTag : styles.mlTag]}>
                          <Text style={[styles.sourceTagText, isRule ? styles.ruleTagText : styles.mlTagText]}>
                            {item.source}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.recommendReason}>{item.reason}</Text>
                      {'expectedGain' in item && item.expectedGain ? (
                        <Text style={styles.expectedGain}>기대 효과 {item.expectedGain}</Text>
                      ) : null}
                    </View>
                    <PrimaryButton label="구매하기" onPress={onShop} style={styles.buyButton} />
                  </View>
                );
              })}
            </View>
          </GlassCard>

          <GlassCard style={styles.panel}>
            <Text style={styles.panelTitle}>흙 추천</Text>
            <View style={styles.soilItem}>
              <View style={styles.soilEmoji}>
                <Text style={styles.recommendEmojiText}>🪴</Text>
              </View>
              <View style={styles.soilCopy}>
                <Text style={styles.recommendName}>{soil.title}</Text>
                <Text style={styles.soilBody}>{soil.body}</Text>
              </View>
            </View>
            <Text style={styles.disclaimer}>* {soil.disclaimer}</Text>
          </GlassCard>
        </View>

        <PrimaryButton label="실시간 측정값 보기 →" onPress={onRealtime} style={styles.realtimeCta} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    paddingBottom: 80,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  container: {
    gap: 20,
    maxWidth: maxContentWidth,
    width: '100%',
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 20,
  },
  oneColumn: {
    flexDirection: 'column',
  },
  panel: {
    flex: 1,
    gap: 16,
    padding: 28,
  },
  overallCard: {
    minHeight: 360,
  },
  factorCard: {
    minHeight: 360,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 17,
    fontWeight: '800',
  },
  gradePill: {
    backgroundColor: 'rgba(224,178,58,0.2)',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  gradeText: {
    color: colors.warnText,
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '800',
  },
  gaugeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  scoreDisclaimer: {
    color: '#8aa192',
    fontFamily: typography.fontFamily,
    fontSize: 12,
    textAlign: 'center',
  },
  refreshButton: {
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  refreshText: {
    color: '#1f7a4d',
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  factorList: {
    gap: 14,
  },
  factorRow: {
    gap: 8,
  },
  factorHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  factorLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '800',
  },
  factorCurrent: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    marginTop: 2,
  },
  factorRight: {
    alignItems: 'flex-end',
    gap: 5,
  },
  factorOptimal: {
    color: colors.textMuted,
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  okBadge: {
    backgroundColor: 'rgba(63,174,111,0.18)',
  },
  warnBadge: {
    backgroundColor: 'rgba(224,150,58,0.2)',
  },
  badgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '800',
  },
  okBadgeText: {
    color: colors.okText,
  },
  warnBadgeText: {
    color: colors.warnText,
  },
  rangeTrack: {
    backgroundColor: 'rgba(120,140,125,0.18)',
    borderRadius: 999,
    height: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  rangeBand: {
    backgroundColor: 'rgba(63,174,111,0.35)',
    borderRadius: 999,
    bottom: 0,
    position: 'absolute',
    top: 0,
  },
  rangeMarker: {
    borderRadius: 2,
    bottom: -3,
    position: 'absolute',
    top: -3,
    width: 4,
  },
  gapText: {
    color: colors.warnText,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionSub: {
    color: '#5a7466',
    fontFamily: typography.fontFamily,
    fontSize: 13,
    marginTop: 4,
  },
  altGrid: {
    flexDirection: 'row',
    gap: 14,
  },
  altCard: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 10,
    padding: 18,
  },
  altEmoji: {
    fontSize: 28,
  },
  altName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '800',
  },
  altScore: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  altScoreStrong: {
    color: '#1f7a4d',
    fontSize: 16,
    fontWeight: '800',
  },
  recommendList: {
    gap: 14,
  },
  recommendItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  },
  recommendItemCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  recommendEmoji: {
    alignItems: 'center',
    backgroundColor: 'rgba(63,174,111,0.15)',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  recommendEmojiText: {
    fontSize: 22,
  },
  recommendCopy: {
    flex: 1,
    gap: 3,
  },
  recommendTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recommendName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '800',
  },
  recommendReason: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  sourceTag: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ruleTag: {
    backgroundColor: 'rgba(63,174,111,0.15)',
  },
  mlTag: {
    backgroundColor: 'rgba(80,130,210,0.15)',
  },
  sourceTagText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  ruleTagText: {
    color: colors.okText,
  },
  mlTagText: {
    color: '#2b5aa4',
  },
  expectedGain: {
    color: '#1f7a4d',
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  buyButton: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    minWidth: 92,
  },
  soilItem: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  },
  soilEmoji: {
    alignItems: 'center',
    backgroundColor: 'rgba(150,110,60,0.15)',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  soilCopy: {
    flex: 1,
    gap: 4,
  },
  soilBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    lineHeight: 21,
  },
  disclaimer: {
    color: '#8aa192',
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  realtimeCta: {
    alignSelf: 'center',
    borderRadius: 16,
    minWidth: 280,
  },
});
