import { authenticatedRequest } from '../auth/authApi';

export type SoilMaterial = {
  name: string;
  parts: number;
  role: string;
};

export type SoilRecommendation = {
  deviceId: number;
  cropCode: string;
  cropName: string;
  targetCondition: string;
  profileId: string;
  materials: SoilMaterial[];
  mixRatio: string;
  mixRatioText: string;
  reason: string;
  environmentSignals: string[];
  preChecks: string[];
  cautions: string[];
  assumptionNotice: string[];
};

export function getSoilRecommendation(deviceId: number) {
  return authenticatedRequest<SoilRecommendation>(`/api/devices/${deviceId}/soil-recommendation`);
}
