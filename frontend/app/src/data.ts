export type Sensor = { label: string; model: string };

// API 응답의 시각적 표현 규칙이며 측정값 자체는 서버에서 조회한다.
export const dashboardChartMetrics = [
  { key: 'air_temperature_c', label: '온도', color: '#d9822b' },
  { key: 'air_humidity_pct', label: '습도', color: '#2b8fae' },
  { key: 'plant_light_ppfd_umol_m2_s', label: '조도', color: '#e0b23a' },
  { key: 'soil_moisture_pct', label: '토양 수분', color: '#3fae6f' },
  { key: 'soil_temperature_c', label: '토양 온도', color: '#8b6f47' },
] as const;

export const liveMetricDefinitions = [
  { key: 'air_temperature_c', label: '온도', unit: '℃', color: '#d9822b', rangeLabel: '최근 1시간' },
  { key: 'air_humidity_pct', label: '습도', unit: '%', color: '#2b8fae', rangeLabel: '최근 1시간' },
  { key: 'plant_light_ppfd_umol_m2_s', label: '조도', unit: ' PPFD', color: '#e0b23a', rangeLabel: '최근 1시간' },
  { key: 'soil_moisture_pct', label: '토양 수분', unit: '%', color: '#3fae6f', rangeLabel: '최근 1시간' },
  { key: 'soil_temperature_c', label: '토양 온도', unit: '℃', color: '#8b6f47', rangeLabel: '최근 1시간' },
] as const;
