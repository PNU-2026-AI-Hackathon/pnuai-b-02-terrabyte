import { ApiRequestError, apiRequest, loadAccessToken } from '../auth/authApi';

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

async function authenticatedRequest<T>(path: string, init?: RequestInit) {
  const accessToken = await loadAccessToken();
  if (!accessToken) {
    throw new ApiRequestError('로그인이 필요합니다.', 401);
  }

  return apiRequest<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
}

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
