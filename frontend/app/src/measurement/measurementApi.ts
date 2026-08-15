import { authenticatedRequest } from '../auth/authApi';

export type LatestMeasurements = {
  deviceId: number;
  hardwareDeviceId: string;
  observedAt: string;
  sequence: number;
  measurements: {
    // 토양 프로브는 선택 사항이라 값이 없을 수 있다. 백엔드가 0 으로 채우지
    // 않고 null 로 내려보내는 이유는, 부재를 0 으로 바꾸면 "완전 건조" 라는
    // 확신에 찬 값이 되어 관수 판단을 오염시키기 때문이다.
    soilMoisturePct: number | null;
    soilMoistureRawAdc: number | null;
    soilTemperatureC: number | null;
    airTemperatureC: number;
    airHumidityPct: number;
    plantLightPpfdUmolM2S: number;
  };
  quality: {
    soilSensorValid: boolean;
    airSensorValid: boolean;
    lightSensorValid: boolean;
  };
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

export function getLatestMeasurements(deviceId: number) {
  return authenticatedRequest<LatestMeasurements>(`/api/devices/${deviceId}/measurements/latest`);
}

export function getEnvironmentScore(deviceId: number) {
  return authenticatedRequest<EnvironmentScore>(`/api/devices/${deviceId}/score`);
}
