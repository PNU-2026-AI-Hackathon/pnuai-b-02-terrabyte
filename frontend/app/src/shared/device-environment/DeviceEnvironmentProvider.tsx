import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  getEnvironmentScore,
  getLatestMeasurements,
  type EnvironmentScore,
  type LatestMeasurements,
} from '../../measurement/measurementApi';

export type DeviceEnvironmentState = {
  score: EnvironmentScore | null;
  measurements: LatestMeasurements | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

const DeviceEnvironmentContext = createContext<DeviceEnvironmentState | null>(null);

type DeviceEnvironmentProviderProps = {
  deviceId: number | undefined;
  pollIntervalMs?: number;
  fetchScore?: typeof getEnvironmentScore;
  fetchMeasurements?: typeof getLatestMeasurements;
  children: ReactNode;
};

export function DeviceEnvironmentProvider({
  deviceId,
  pollIntervalMs = 3000,
  fetchScore = getEnvironmentScore,
  fetchMeasurements = getLatestMeasurements,
  children,
}: DeviceEnvironmentProviderProps) {
  const [score, setScore] = useState<EnvironmentScore | null>(null);
  const [measurements, setMeasurements] = useState<LatestMeasurements | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const [nextScore, nextMeasurements] = await Promise.all([
        fetchScore(deviceId),
        fetchMeasurements(deviceId),
      ]);
      if (activeRef.current) {
        setScore(nextScore);
        setMeasurements(nextMeasurements);
        setError(null);
      }
    } catch (caught) {
      if (activeRef.current) {
        setError(caught instanceof Error ? caught : new Error('측정 데이터를 불러오지 못했습니다.'));
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [deviceId, fetchScore, fetchMeasurements]);

  useEffect(() => {
    activeRef.current = true;
    if (!deviceId) {
      setScore(null);
      setMeasurements(null);
      return undefined;
    }
    void load();
    const interval = setInterval(() => void load(), pollIntervalMs);
    return () => {
      activeRef.current = false;
      clearInterval(interval);
    };
  }, [deviceId, pollIntervalMs, load]);

  const value = useMemo<DeviceEnvironmentState>(
    () => ({ score, measurements, loading, error, refetch: load }),
    [score, measurements, loading, error, load],
  );

  return <DeviceEnvironmentContext.Provider value={value}>{children}</DeviceEnvironmentContext.Provider>;
}

export function useDeviceEnvironment(): DeviceEnvironmentState {
  const context = useContext(DeviceEnvironmentContext);
  if (!context) {
    throw new Error('useDeviceEnvironment must be used within a DeviceEnvironmentProvider');
  }
  return context;
}
