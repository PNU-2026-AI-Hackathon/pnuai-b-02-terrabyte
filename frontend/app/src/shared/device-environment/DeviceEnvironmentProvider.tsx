import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  getEnvironmentScore,
  getLatestMeasurements,
  type EnvironmentScore,
  type LatestMeasurements,
} from '../../measurement/measurementApi';
import { getSoilRecommendation, type SoilRecommendation } from '../../soil/soilApi';

export type DeviceEnvironmentState = {
  score: EnvironmentScore | null;
  measurements: LatestMeasurements | null;
  soilRecommendation: SoilRecommendation | null;
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
  fetchSoilRecommendation?: typeof getSoilRecommendation;
  children: ReactNode;
};

export function DeviceEnvironmentProvider({
  deviceId,
  pollIntervalMs = 3000,
  fetchScore = getEnvironmentScore,
  fetchMeasurements = getLatestMeasurements,
  fetchSoilRecommendation = getSoilRecommendation,
  children,
}: DeviceEnvironmentProviderProps) {
  const [score, setScore] = useState<EnvironmentScore | null>(null);
  const [measurements, setMeasurements] = useState<LatestMeasurements | null>(null);
  const [soilRecommendation, setSoilRecommendation] = useState<SoilRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      // soilRecommendation은 score/measurements와 달리 실패해도 이 화면 전체를 error 상태로
      // 만들지 않는다 — Guide 화면만 쓰는 부가 데이터라, 여기서 개별적으로 흡수해 null로 둔다.
      const [nextScore, nextMeasurements, nextSoilRecommendation] = await Promise.all([
        fetchScore(deviceId),
        fetchMeasurements(deviceId),
        fetchSoilRecommendation(deviceId).catch(() => null),
      ]);
      if (activeRef.current) {
        setScore(nextScore);
        setMeasurements(nextMeasurements);
        setSoilRecommendation(nextSoilRecommendation);
        setError(null);
      }
    } catch (caught) {
      if (activeRef.current) {
        setError(caught instanceof Error ? caught : new Error('측정 데이터를 불러오지 못했습니다.'));
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [deviceId, fetchScore, fetchMeasurements, fetchSoilRecommendation]);

  useEffect(() => {
    activeRef.current = true;
    if (!deviceId) {
      setScore(null);
      setMeasurements(null);
      setSoilRecommendation(null);
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
    () => ({ score, measurements, soilRecommendation, loading, error, refetch: load }),
    [score, measurements, soilRecommendation, loading, error, load],
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
