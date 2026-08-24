import { authenticatedRequest } from '../auth/authApi';

export type NotificationType =
  | 'SENSOR_ANOMALY'
  | 'DEVICE_OFFLINE'
  | 'IRRIGATION_COMPLETED';

export type NotificationRecord = {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  deviceId: number | null;
  potId: number | null;
  data: Record<string, string>;
  createdAt: string;
  readAt: string | null;
};

export function registerPushToken(token: string, previousToken?: string) {
  return authenticatedRequest('/api/push-tokens', {
    method: 'POST',
    body: JSON.stringify({ token, platform: 'ANDROID', previousToken }),
  });
}

export function unregisterPushToken(token: string) {
  return authenticatedRequest<void>('/api/push-tokens', {
    method: 'DELETE',
    body: JSON.stringify({ token }),
  });
}

export function unregisterAllPushTokens() {
  return authenticatedRequest<void>('/api/push-tokens/all', {
    method: 'DELETE',
  });
}

export function getNotifications(limit = 50) {
  return authenticatedRequest<NotificationRecord[]>(`/api/notifications?limit=${limit}`);
}

export function getUnreadNotificationCount() {
  return authenticatedRequest<{ unreadCount: number }>('/api/notifications/unread-count');
}

export function markNotificationRead(notificationId: number) {
  return authenticatedRequest<void>(`/api/notifications/${notificationId}/read`, {
    method: 'PATCH',
  });
}

export function markAllNotificationsRead() {
  return authenticatedRequest<void>('/api/notifications/read-all', {
    method: 'PATCH',
  });
}
