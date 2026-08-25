import { useEffect, useState } from 'react';

import { getCrops, type CropResponse } from './cropApi';

export function useCrops(enabled = true) {
  const [crops, setCrops] = useState<CropResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCrops([]);
      setLoading(false);
      setError(null);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void getCrops()
      .then((nextCrops) => {
        if (active) setCrops(nextCrops);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught : new Error('작물 목록을 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return { crops, loading, error };
}
