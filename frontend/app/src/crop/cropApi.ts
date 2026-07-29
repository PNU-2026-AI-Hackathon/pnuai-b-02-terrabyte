import { authenticatedRequest } from '../auth/authApi';

export type CropResponse = {
  code: string;
  name: string;
  emoji: string;
  description: string;
};

export type CropSelectionResponse = {
  deviceId: number;
  crop: CropResponse;
  selectedAt: string;
};

export function getCrops(query = '') {
  const normalizedQuery = query.trim();
  const search = normalizedQuery ? `?q=${encodeURIComponent(normalizedQuery)}` : '';
  return authenticatedRequest<CropResponse[]>(`/api/crops${search}`);
}

export function selectDeviceCrop(deviceId: number, cropCode: string) {
  return authenticatedRequest<CropSelectionResponse>(`/api/devices/${deviceId}/crop`, {
    method: 'PATCH',
    body: JSON.stringify({ cropCode }),
  });
}
