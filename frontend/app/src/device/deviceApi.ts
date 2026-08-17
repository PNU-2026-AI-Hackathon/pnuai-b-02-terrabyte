import { authenticatedRequest } from '../auth/authApi';

export type DeviceResponse = {
  id: number;
  serialCode: string;
  status: 'ONLINE' | 'OFFLINE';
  cropCode?: string;
  lastSeenAt?: string;
  space?: {
    id: number;
    name: string;
    spaceType: string;
    areaSquareMeters: number;
  };
  pots?: PotResponse[];
};

export type PotResponse = {
  id: number;
  deviceId: number;
  nodeId?: string;
  label: string;
  cropCode?: string;
  status: 'ONLINE' | 'OFFLINE';
  lastSeenAt?: string;
};

export type RegisterDeviceInput = {
  serialCode: string;
  spaceName: string;
  spaceType: string;
  areaSquareMeters: number;
};

export async function registerDevice(input: RegisterDeviceInput) {
  return authenticatedRequest<DeviceResponse>('/api/devices', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getDevice(deviceId: number) {
  return authenticatedRequest<DeviceResponse>(`/api/devices/${deviceId}`);
}
