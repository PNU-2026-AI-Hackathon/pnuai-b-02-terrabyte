import type { ScoreFactor } from '../measurement/measurementApi';

export function getIssueFactors(factors: ScoreFactor[]): ScoreFactor[] {
  return factors.filter((factor) => factor.status !== 'OK');
}
const gradeLabels: Record<'GOOD' | 'NORMAL' | 'BAD', string> = {
  GOOD: '스마트팜 전환 적합',
  NORMAL: '일부 환경 보완 필요',
  BAD: '환경 개선 필요',
};

export function getGradeLabel(grade: 'GOOD' | 'NORMAL' | 'BAD' | undefined): string {
  if (!grade) return '계산 중';
  return gradeLabels[grade];
}

const factorRecommendations: Record<ScoreFactor['key'], string> = {
  temperature: '온도가 적정 범위를 벗어나면 환기 또는 히팅 장치를 조절하세요.',
  humidity: '관수와 환기 시간을 조절해 적정 습도를 유지하세요.',
  plantLight: 'PPFD가 부족하면 생장등의 세기와 설치 거리를 조절하세요.',
};

export function getFactorRecommendation(key: ScoreFactor['key']): string {
  return factorRecommendations[key];
}
