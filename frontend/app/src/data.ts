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

export type ShopCategory = 'parts' | 'soil' | 'seeds';

export type ShopProduct = {
  id: string;
  category: ShopCategory;
  name: string;
  emoji: string;
  desc: string;
  price: number;
  badge?: string;
};

export const crops: Crop[] = [
  { name: '방울토마토', emoji: '🍅', desc: '초보자에게 인기 있는 실내 작물' },
  { name: '상추', emoji: '🥬', desc: '빠르게 자라고 관리가 쉬워요' },
  { name: '바질', emoji: '🌿', desc: '햇빛을 좋아하는 허브' },
  { name: '페퍼민트', emoji: '🌱', desc: '상쾌한 향이 특징인 허브' },
  { name: '대파', emoji: '🧅', desc: '잎과 줄기를 활용하는 향신 채소' },
  { name: '루꼴라', emoji: '🥗', desc: '톡 쏘는 풍미가 특징인 잎채소' },
  { name: '와사비', emoji: '🌿', desc: '알싸한 맛이 특징인 향신 작물' },
  { name: '고수', emoji: '☘️', desc: '독특한 향을 지닌 향신 허브' },
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
  { name: '페퍼민트', emoji: '🌱', expectedScore: 79, setsCropIndex: 3 },
  { name: '바질', emoji: '🌿', expectedScore: 74, setsCropIndex: 2 },
];

export const shopTabs: Array<{ key: ShopCategory; label: string }> = [
  { key: 'parts', label: '부품' },
  { key: 'soil', label: '흙' },
  { key: 'seeds', label: '씨앗' },
];

export const shopProducts: ShopProduct[] = [
  {
    id: 'grow-light',
    category: 'parts',
    name: '식물 생장등 (LED)',
    emoji: '💡',
    desc: '실내 재배 공간에 설치하기 좋은 바 타입 조명',
    price: 29900,
    badge: '추천',
  },
  {
    id: 'watering-kit',
    category: 'parts',
    name: '자동 관수 키트',
    emoji: '💧',
    desc: '설정한 주기에 맞춰 물을 공급하는 소형 관수 세트',
    price: 39900,
  },
  {
    id: 'soil-probe',
    category: 'parts',
    name: '토양 수분 센서 프로브',
    emoji: '🌡️',
    desc: '기존 기기에 연결해 교체할 수 있는 센서 프로브',
    price: 12900,
  },
  {
    id: 'power-adapter',
    category: 'parts',
    name: 'USB-C 전원 어댑터',
    emoji: '🔌',
    desc: '센서와 관수 장치에 사용할 수 있는 전원 어댑터',
    price: 9900,
  },
  {
    id: 'herb-soil',
    category: 'soil',
    name: '실내 허브용 배양토 10L',
    emoji: '🪴',
    desc: '허브와 잎채소 화분에 바로 사용할 수 있는 배양토',
    price: 12500,
    badge: '인기',
  },
  {
    id: 'perlite',
    category: 'soil',
    name: '펄라이트 3L',
    emoji: '⚪',
    desc: '배수성과 통기성을 보완할 때 섞어 쓰는 토양 개량재',
    price: 6900,
  },
  {
    id: 'coco-peat',
    category: 'soil',
    name: '코코피트 블록 5L',
    emoji: '🥥',
    desc: '물을 흡수하면 부피가 늘어나는 가벼운 재배 배지',
    price: 7500,
  },
  {
    id: 'gravel',
    category: 'soil',
    name: '마사토 소립 5L',
    emoji: '🪨',
    desc: '화분 바닥 배수층과 흙 배합에 활용하는 소립 마사토',
    price: 8900,
  },
  {
    id: 'basil-seeds',
    category: 'seeds',
    name: '바질 씨앗',
    emoji: '🌿',
    desc: '향긋한 잎을 수확하는 실내 허브 재배용 씨앗',
    price: 2500,
    badge: '초보 추천',
  },
  {
    id: 'lettuce-seeds',
    category: 'seeds',
    name: '상추 씨앗',
    emoji: '🥬',
    desc: '화분과 소형 재배기에서 키우기 좋은 잎채소 씨앗',
    price: 2500,
  },
  {
    id: 'arugula-seeds',
    category: 'seeds',
    name: '루꼴라 씨앗',
    emoji: '🥗',
    desc: '톡 쏘는 풍미의 어린잎을 재배할 수 있는 씨앗',
    price: 2800,
  },
  {
    id: 'coriander-seeds',
    category: 'seeds',
    name: '고수 씨앗',
    emoji: '☘️',
    desc: '독특한 향의 잎과 줄기를 수확하는 허브 씨앗',
    price: 2800,
  },
  {
    id: 'welsh-onion-seeds',
    category: 'seeds',
    name: '대파 씨앗',
    emoji: '🧅',
    desc: '베란다와 텃밭 화분에서 재배할 수 있는 채소 씨앗',
    price: 3000,
  },
  {
    id: 'peppermint-seeds',
    category: 'seeds',
    name: '페퍼민트 씨앗',
    emoji: '🌱',
    desc: '상쾌한 향을 즐길 수 있는 다년생 허브 씨앗',
    price: 3200,
  },
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
