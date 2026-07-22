import {
  ApiRequestError,
  apiRequest,
  loadAccessToken,
} from '../auth/authApi';

export type DeviceResponse = {
  id: number;
  serialCode: string;
  status: 'ONLINE' | 'OFFLINE';
  lastSeenAt?: string;
  space?: {
    id: number;
    name: string;
    spaceType: string;
    areaSquareMeters: number;
  };
};

export type RegisterDeviceInput = {
  serialCode: string;
  spaceName: string;
  spaceType: string;
  areaSquareMeters: number;
};

export async function registerDevice(input: RegisterDeviceInput) {
  const accessToken = await loadAccessToken();
  if (!accessToken) {
    throw new ApiRequestError('로그인이 필요합니다.', 401);
  }

  return apiRequest<DeviceResponse>('/api/devices', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}
