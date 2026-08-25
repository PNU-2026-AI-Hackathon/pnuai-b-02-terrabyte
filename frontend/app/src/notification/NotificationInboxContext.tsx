import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  type NotificationRecord,
} from './notificationApi';

const POLL_INTERVAL_MS = 15_000;

type NotificationInbox = {
  alerts: NotificationRecord[];
  error?: string;
  loading: boolean;
  unreadCount: number;
  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationInboxContext = createContext<NotificationInbox | null>(null);

export function NotificationInboxProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [alerts, setAlerts] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const loadSequence = useRef(0);
  const markingRead = useRef(false);

  const load = useCallback(async () => {
    if (!enabled || markingRead.current) return;
    const sequence = ++loadSequence.current;
    try {
      const [nextAlerts, count] = await Promise.all([
        getNotifications(),
        getUnreadNotificationCount(),
      ]);
      if (sequence !== loadSequence.current || markingRead.current) return;
      setAlerts(nextAlerts);
      setUnreadCount(count.unreadCount);
      setError(undefined);
    } catch {
      if (sequence !== loadSequence.current || markingRead.current) return;
      setError('알림을 불러오지 못했습니다.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [enabled]);

  const markAllRead = useCallback(async () => {
    markingRead.current = true;
    loadSequence.current += 1;
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setAlerts((current) => current.map((alert) => ({
        ...alert,
        readAt: alert.readAt ?? readAt,
      })));
      setUnreadCount(0);
      setError(undefined);
    } catch {
      setError('읽음 상태를 저장하지 못했습니다.');
    } finally {
      markingRead.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, load]);

  const value = useMemo(
    () => ({ alerts, error, loading, load, markAllRead, unreadCount }),
    [alerts, error, loading, load, markAllRead, unreadCount],
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
