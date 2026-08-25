import { authenticatedRequest } from '../auth/authApi';

export type IrrigationRequest = {
  volumeMl: number;
  cooldownOverride: boolean;
  overrideReason: string | null;
};

export type IrrigationOutcome = {
  granted: boolean;
  commandId: string | null;
  grantedMl: number | null;
  clampReason: string | null;
  expiresAt: string | null;
  dispatched: boolean;
  denyReason: string | null;
  detail: string | null;
  nextAvailableAt: string | null;
  volumeSource: string | null;
  aiModelVersion: string | null;
};

export function requestIrrigation(potId: number, request: IrrigationRequest) {
  return authenticatedRequest<IrrigationOutcome>(`/api/pots/${potId}/irrigation`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}
