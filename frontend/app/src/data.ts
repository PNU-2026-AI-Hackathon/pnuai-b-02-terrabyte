export type Crop = {
  code: string;
  name: string;
  emoji: string;
  desc: string;
};

export type FactorStatus = 'OK' | 'LOW' | 'HIGH';

export type Factor = {
  label: string;
  unit: string;
  current: number;
  avg24h: number;
  min24h: number;
  max24h: number;
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
  { code: 'cherry_tomato', name: '방울토마토', emoji: '🍅', desc: '초보자에게 인기 있는 실내 작물' },
  { code: 'lettuce', name: '상추', emoji: '🥬', desc: '빠르게 자라고 관리가 쉬워요' },
  { code: 'basil', name: '바질', emoji: '🌿', desc: '햇빛을 좋아하는 허브' },
  { code: 'peppermint', name: '페퍼민트', emoji: '🌱', desc: '상쾌한 향이 특징인 허브' },
  { code: 'welsh_onion', name: '대파', emoji: '🧅', desc: '잎과 줄기를 활용하는 향신 채소' },
  { code: 'arugula', name: '루꼴라', emoji: '🥗', desc: '톡 쏘는 풍미가 특징인 잎채소' },
  { code: 'wasabi', name: '와사비', emoji: '🌿', desc: '알싸한 맛이 특징인 향신 작물' },
  { code: 'coriander', name: '고수', emoji: '☘️', desc: '독특한 향을 지닌 향신 허브' },
];

export const factors: Factor[] = [
  {
    label: '온도',
    unit: '℃',
    current: 24.5,
    avg24h: 24.1,
    min24h: 21.8,
    max24h: 26.3,
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
    avg24h: 52,
    min24h: 43,
    max24h: 64,
    optimalMin: 60,
    optimalMax: 75,
    axisMin: 0,
    axisMax: 100,
    status: 'LOW',
    gap: 8,
  },
  {
    label: '조도',
    unit: 'lux',
    current: 8000,
    avg24h: 11800,
    min24h: 1200,
    max24h: 18900,
    optimalMin: 15000,
    optimalMax: 20000,
    axisMin: 0,
    axisMax: 25000,
    status: 'LOW',
    gap: 3200,
  },
  {
    label: '토양수분',
    unit: '%',
    current: 38,
    avg24h: 36,
    min24h: 31,
    max24h: 42,
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
  windowStart: '2026-07-13T10:30:00+09:00',
  windowEnd: '2026-07-14T10:30:00+09:00',
};

export const altCrops = [
  {
    name: '상추',
    emoji: '🥬',
    expectedScore: 85,
    setsCropIndex: 1,
    reason: '현재 온도와 토양수분 조건에 가장 잘 맞고, 조도 보완 효과를 빠르게 받을 수 있습니다.',
    caution: '습도가 45% 아래로 내려가지 않도록 관리가 필요합니다.',
  },
  {
    name: '페퍼민트',
    emoji: '🌱',
    expectedScore: 79,
    setsCropIndex: 3,
    reason: '환경 변화에 대한 적응력이 높아 현재 조건에서도 비교적 안정적인 생장이 예상됩니다.',
    caution: '과도한 번식을 막기 위해 단독 화분 재배를 권장합니다.',
  },
  {
    name: '바질',
    emoji: '🌿',
    expectedScore: 74,
    setsCropIndex: 2,
    reason: '온도 조건은 적합하지만 현재 광량으로는 줄기가 가늘게 자랄 가능성이 있습니다.',
    caution: '생장등 보완 후 선택하면 예상 적합도가 83점까지 상승합니다.',
  },
];

export type Sensor = { label: string; model: string };

export const sensors: Sensor[] = [
  { label: '온·습도 센서', model: 'DHT22' },
  { label: '조도 센서', model: 'BH1750' },
  { label: '토양수분 센서', model: 'EF04027' },
  { label: '토양 온도 센서', model: 'DS18B20' },
  { label: '소음 센서', model: 'SEN0232' },
  { label: '미세먼지 센서', model: 'PMS5003' },
  { label: 'CO₂ 센서', model: 'SCD40' },
];

export const factorProductMap: Partial<Record<'temperature' | 'humidity' | 'plantLight', string[]>> = {
  plantLight: ['grow-light'],
  humidity: ['watering-kit'],
};

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
    id: 'vermiculite',
    category: 'soil',
    name: '버미큘라이트 3L',
    emoji: '🟤',
    desc: '수분·양분 보유력을 높여 건조가 빠른 배지를 보완하는 토양 개량재',
    price: 7900,
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
    source: '환경 분석',
    expectedGain: '+15점',
  },
  {
    name: '스마트 관수 시스템',
    emoji: '💧',
    reason: '물 주기 편의성 개선',
    source: '맞춤 추천',
  },
];

export const dailyAvg = [
  { label: '온도', emoji: '🌡️', value: '24.1℃', sub: '24h 평균 · 최저 21.8 · 최고 26.3' },
  { label: '습도', emoji: '💧', value: '52%', sub: '24h 평균 · 최저 43 · 최고 64' },
  { label: '조도', emoji: '☀️', value: '11,800 lux', sub: '24h 평균 · 최저 1,200 · 최고 18,900' },
  { label: '토양수분', emoji: '🪴', value: '36%', sub: '24h 평균 · 최저 31 · 최고 42' },
];

export const latest = [
  {
    label: '온도',
    emoji: '🌡️',
    value: '24.5℃',
    baseValue: 24.5,
    unit: '℃',
    decimals: 1,
    jitter: 0.3,
    color: '#d9822b',
    sub: '최적 범위 (20~26℃)',
    sparkline: [24.1, 24.2, 24.1, 24.3, 24.4, 24.3, 24.5, 24.4, 24.6, 24.5, 24.4, 24.5],
  },
  {
    label: '습도',
    emoji: '💧',
    value: '45%',
    baseValue: 45,
    unit: '%',
    decimals: 0,
    jitter: 2,
    color: '#2b8fae',
    sub: '최적 대비 15% 부족',
    sparkline: [47, 46, 47, 46, 45, 46, 44, 45, 46, 45, 44, 45],
  },
  {
    label: '조도',
    emoji: '☀️',
    value: '8,000 lux',
    baseValue: 8000,
    unit: 'lux',
    decimals: 0,
    jitter: 250,
    color: '#e0b23a',
    sub: '최적 대비 7,000 lux 부족',
    sparkline: [7650, 7820, 7900, 7750, 8010, 8150, 8070, 8240, 8100, 7950, 8120, 8000],
  },
  {
    label: '토양수분',
    emoji: '🪴',
    value: '38%',
    baseValue: 38,
    unit: '%',
    decimals: 0,
    jitter: 1,
    color: '#3fae6f',
    sub: '최적 범위 (30~45%)',
    sparkline: [39, 39, 38, 39, 38, 38, 37, 38, 38, 39, 38, 38],
  },
  {
    label: '토양 온도',
    emoji: '',
    value: '22.8℃',
    baseValue: 22.8,
    unit: '℃',
    decimals: 1,
    jitter: 0.2,
    color: '#8b6f47',
    sub: '최적 범위 (18~25℃)',
    sparkline: [22.4, 22.5, 22.5, 22.6, 22.7, 22.8, 22.7, 22.9, 22.8, 22.8, 22.9, 22.8],
  },
  {
    label: 'CO₂',
    emoji: '',
    value: '742 ppm',
    baseValue: 742,
    unit: 'ppm',
    decimals: 0,
    jitter: 18,
    color: '#557a68',
    sub: '권장 범위 (400~1,000ppm)',
    sparkline: [690, 705, 721, 734, 755, 768, 750, 739, 728, 745, 751, 742],
  },
  {
    label: '미세먼지',
    emoji: '',
    value: '14 ㎍/㎥',
    baseValue: 14,
    unit: '㎍/㎥',
    decimals: 0,
    jitter: 2,
    color: '#6a8fa0',
    sub: 'PM2.5 · 좋음',
    sparkline: [12, 13, 12, 14, 15, 14, 16, 15, 14, 13, 14, 14],
  },
  {
    label: '소음',
    emoji: '',
    value: '42 dB',
    baseValue: 42,
    unit: 'dB',
    decimals: 0,
    jitter: 2,
    color: '#7a708f',
    sub: '주간 운영 기준 이내',
    sparkline: [39, 41, 40, 42, 44, 43, 41, 42, 45, 43, 42, 42],
  },
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
