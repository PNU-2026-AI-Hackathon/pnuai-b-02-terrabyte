import { authenticatedRequest } from '../auth/authApi';

export type LatestMeasurements = {
  deviceId: number;
  hardwareDeviceId: string;
  observedAt: string;
  sequence: number;
  measurements: {
    soilMoisturePct: number;
    soilMoistureRawAdc: number;
    airTemperatureC: number;
    airHumidityPct: number;
    plantLightPpfdUmolM2S: number;
    soilTemperatureC: number | null;
  };
  quality: {
    soilSensorValid: boolean;
    airSensorValid: boolean;
    lightSensorValid: boolean;
  };
};

export type MeasurementMetricKey =
  | 'soil_moisture_pct'
  | 'soil_moisture_raw_adc'
  | 'air_temperature_c'
  | 'air_humidity_pct'
  | 'plant_light_ppfd_umol_m2_s'
  | 'soil_temperature_c';

export type MeasurementRangeKey = '1h' | '24h' | '7d' | '30d';

export type MeasurementPoint = {
  time: string;
  value: number;
};

export type MeasurementSeries = {
  deviceId: number;
  metric: MeasurementMetricKey;
  unit: string;
  range: MeasurementRangeKey;
  points: MeasurementPoint[];
};

export type ScoreFactor = {
  key: 'temperature' | 'humidity' | 'plantLight';
  label: string;
  unit: string;
  current: number;
  optimalMin: number;
  optimalMax: number;
  status: 'LOW' | 'OK' | 'HIGH';
  gap: number;
  score: number;
};

export type EnvironmentScore = {
  deviceId: number;
  cropCode: string;
  cropName: string;
  total: number;
  grade: 'GOOD' | 'NORMAL' | 'BAD';
  measuredAt: string;
  formula: string;
  factors: ScoreFactor[];
};

export function getLatestMeasurements(potId: number) {
  return authenticatedRequest<LatestMeasurements>(`/api/pots/${potId}/measurements/latest`);
}

export function getEnvironmentScore(potId: number) {
  return authenticatedRequest<EnvironmentScore>(`/api/pots/${potId}/score`);
}

export function getMeasurementSeries(
  potId: number,
  metric: MeasurementMetricKey,
  range: MeasurementRangeKey,
): Promise<MeasurementSeries> {
  const query = new URLSearchParams({ metric, range });
  return authenticatedRequest<MeasurementSeries>(`/api/pots/${potId}/measurements?${query.toString()}`);
}
