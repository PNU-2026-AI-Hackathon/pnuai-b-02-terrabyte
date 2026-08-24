import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  getNotifications,
  markAllNotificationsRead,
  type NotificationRecord,
} from './notificationApi';

const POLL_INTERVAL_MS = 15_000;

type NotificationInbox = {
  alerts: NotificationRecord[];
  error?: string;
  loading: boolean;
  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationInboxContext = createContext<NotificationInbox | null>(null);

export function NotificationInboxProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      setAlerts(await getNotifications());
      setError(undefined);
    } catch {
      setError('알림을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setAlerts((current) => current.map((alert) => ({
        ...alert,
        readAt: alert.readAt ?? readAt,
      })));
      setError(undefined);
    } catch {
      setError('읽음 상태를 저장하지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const value = useMemo(
    () => ({ alerts, error, loading, load, markAllRead }),
    [alerts, error, loading, load, markAllRead],
  );
  return (
    <NotificationInboxContext.Provider value={value}>
      {children}
    </NotificationInboxContext.Provider>
  );
}

export function useNotificationInbox() {
  const context = useContext(NotificationInboxContext);
  if (!context) throw new Error('NotificationInboxProvider is missing');
  return context;
}
