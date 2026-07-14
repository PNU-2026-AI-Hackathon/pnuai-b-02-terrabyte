export type Crop = {
  name: string;
  emoji: string;
  desc: string;
};

export type FactorStatus = 'OK' | 'LOW' | 'HIGH';

export type Factor = {
  label: string;
  unit: string;
  current: number;
  optimalMin: number;
  optimalMax: number;
  axisMin: number;
  axisMax: number;
  status: FactorStatus;
  gap?: number;
};

export type ChartRange = '1h' | '24h' | '7d' | '30d';

export const crops: Crop[] = [
  { name: '방울토마토', emoji: '🍅', desc: '초보자에게 인기 있는 실내 작물' },
  { name: '상추', emoji: '🥬', desc: '빠르게 자라고 관리가 쉬워요' },
  { name: '바질', emoji: '🌿', desc: '햇빛을 좋아하는 허브' },
  { name: '깻잎', emoji: '🍃', desc: '반그늘에서도 잘 자라요' },
  { name: '고추', emoji: '🌶️', desc: '따뜻한 환경이 필요해요' },
];

export const factors: Factor[] = [
  {
    label: '온도',
    unit: '℃',
    current: 24.5,
    optimalMin: 20,
    optimalMax: 26,
    axisMin: 10,
    axisMax: 35,
    status: 'OK',
  },
  {
    label: '습도',
    unit: '%',
    current: 45,
    optimalMin: 60,
    optimalMax: 75,
    axisMin: 0,
    axisMax: 100,
    status: 'LOW',
    gap: 15,
  },
  {
    label: '조도',
    unit: 'lux',
    current: 8000,
    optimalMin: 15000,
    optimalMax: 20000,
    axisMin: 0,
    axisMax: 25000,
    status: 'LOW',
    gap: 7000,
  },
  {
    label: '토양수분',
    unit: '%',
    current: 38,
    optimalMin: 30,
    optimalMax: 45,
    axisMin: 0,
    axisMax: 100,
    status: 'OK',
  },
];

export const score = {
  value: 68,
  grade: '보통',
  measuredAt: '2026-07-14T10:30:00+09:00',
};

export const altCrops = [
  { name: '상추', emoji: '🥬', expectedScore: 85, setsCropIndex: 1 },
  { name: '깻잎', emoji: '🍃', expectedScore: 79, setsCropIndex: 3 },
  { name: '바질', emoji: '🌿', expectedScore: 74, setsCropIndex: 2 },
];

export const equipment = [
  {
    name: '식물 생장등 (LED)',
    emoji: '💡',
    reason: '조도 부족',
    source: '규칙 기반',
    expectedGain: '+15점',
  },
  {
    name: '스마트 관수 시스템',
    emoji: '💧',
    reason: '물 주기 편의성 개선',
    source: 'ML 추천',
  },
];

export const soil = {
  title: '배수 좋은 상토 + 펄라이트 2:1 배합',
  reason: '토양수분이 최적 범위에 있어요.',
  body: '토양수분이 최적 범위에 있어요. 현재 배합을 유지하면 과습 없이 뿌리가 건강하게 자랄 수 있어요.',
  disclaimer: '추천 로직·API 스펙 확정 전 예시 데이터입니다',
};

export const latest = [
  { label: '온도', emoji: '🌡️', value: '24.5℃', sub: '최적 범위 (20~26℃)' },
  { label: '습도', emoji: '💧', value: '45%', sub: '최적 대비 15% 부족' },
  { label: '조도', emoji: '☀️', value: '8,000 lux', sub: '최적 대비 7,000 lux 부족' },
  { label: '토양수분', emoji: '🪴', value: '38%', sub: '최적 범위 (30~45%)' },
];

export const rangeTabs: Array<{ key: ChartRange; label: string }> = [
  { key: '1h', label: '1시간' },
  { key: '24h', label: '24시간' },
  { key: '7d', label: '7일' },
  { key: '30d', label: '30일' },
];

export const chartMetrics = [
  { label: '온도', unit: '℃', color: '#d9822b', seed: 1, amp: 16, mid: 55 },
  { label: '습도', unit: '%', color: '#2b8fae', seed: 3, amp: 22, mid: 60 },
  { label: '조도', unit: 'lux', color: '#e0b23a', seed: 5, amp: 30, mid: 55 },
  { label: '토양수분', unit: '%', color: '#3fae6f', seed: 7, amp: 14, mid: 50 },
];
