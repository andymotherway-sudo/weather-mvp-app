// app/lib/spaceweather/useSpaceWeatherEvents.ts
import { useEffect, useState } from 'react';
import { fetchSpaceWeatherEvents } from './api';

export type SpaceWeatherEvent = {
  id: string;
  type: 'FLARE' | 'CME' | 'SEP' | 'GST';
  startTime: string;
  peakTime?: string;
  level?: string; // e.g. M1.2, G2
  summary: string;
  source: 'DONKI';
};

export function useSpaceWeatherEvents(days = 7) {
  const [events, setEvents] = useState<SpaceWeatherEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const data = await fetchSpaceWeatherEvents(days);
        if (mounted) setEvents(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Event load failed');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [days]);

  return { events, loading, error };
}