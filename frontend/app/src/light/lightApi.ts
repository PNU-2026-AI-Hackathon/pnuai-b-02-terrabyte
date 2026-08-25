import { authenticatedRequest } from '../auth/authApi';

export type LightRequest = {
  on: boolean;
};

export type LightOutcome = {
  issued: boolean;
  commandId: string | null;
  on: boolean;
  dispatched: boolean;
  denyReason: string | null;
  detail: string | null;
  nextAvailableAt: string | null;
};

export function requestLight(potId: number, request: LightRequest) {
  return authenticatedRequest<LightOutcome>(`/api/pots/${potId}/light`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}
