// app/lib/alerts/useNwsAlerts.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NWSAlert } from './nws';
import { fetchNwsAlertsByPoint, pickPrimaryAlert } from './nws';

type State = {
  alerts: NWSAlert[];
  primary: NWSAlert | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
};

export function useNwsAlerts(opts: { lat: number; lon: number; enabled?: boolean }) {
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<State>({
    alerts: [],
    primary: null,
    loading: false,
    error: null,
    lastUpdated: null,
  });

  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (inFlight.current) return;
    inFlight.current = true;

    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const alerts = await fetchNwsAlertsByPoint(opts.lat, opts.lon);
      const primary = pickPrimaryAlert(alerts);
      setState({ alerts, primary, loading: false, error: null, lastUpdated: Date.now() });
    } catch (e: any) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e?.message ?? 'Alerts unavailable',
        lastUpdated: Date.now(),
      }));
    } finally {
      inFlight.current = false;
    }
  }, [enabled, opts.lat, opts.lon]);

  // refresh on location change
  useEffect(() => {
    refresh();
  }, [refresh]);

  // light polling so alerts update while you sit on the screen
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => refresh(), 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(t);
  }, [enabled, refresh]);

  const hasAlerts = useMemo(() => state.alerts.length > 0, [state.alerts.length]);

  return { ...state, hasAlerts, refresh };
}
