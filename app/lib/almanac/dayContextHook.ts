// app/lib/almanac/dayContextHook.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type DayContext = {
  date: string; // YYYY-MM-DD  // Observed high/low values are normalized to Fahrenheit for almanac comparison.
  tempMaxF: number | null;
  tempMinF: number | null;

  cloudMinPct: number | null;
  cloudMaxPct: number | null;
  windMaxMph: number | null;
  windGustMaxMph: number | null;

  precipTotalIn: number | null; // derived from hourly precip sum
  conditionLabel: string; // "Clear • Breezy", etc.

  fetchedAtIso: string;
};

const KEY_PREFIX = 'omniwx:dayctx:v2';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h (safe for history)

function keyFor(lat: number, lon: number, date: string) {
  const la = lat.toFixed(3);
  const lo = lon.toFixed(3);
  return `${KEY_PREFIX}:${la},${lo}:${date}`;
}

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function mmToIn(mm: number) {
  return mm / 25.4;
}

function cToF(c: number) {
  return (c * 9) / 5 + 32;
}

function summarizeCondition(cloudAvg: number | null, precipIn: number | null, windMph: number | null) {
  const rain = precipIn != null && precipIn >= 0.03;
  const windy = windMph != null && windMph >= 20;

  let sky = 'Mixed skies';
  if (cloudAvg != null) {
    if (cloudAvg <= 20) sky = 'Clear';
    else if (cloudAvg <= 55) sky = 'Partly cloudy';
    else if (cloudAvg <= 85) sky = 'Mostly cloudy';
    else sky = 'Overcast';
  }

  if (rain && windy) return `${sky} • Wet & breezy`;
  if (rain) return `${sky} • Wet`;
  if (windy) return `${sky} • Breezy`;
  return sky;
}

export function useOpenMeteoDayContext({
  lat,
  lon,
  date,
  enabled = true,
  preferCache = true,
}: {
  lat: number;
  lon: number;
  date: string; // YYYY-MM-DD
  enabled?: boolean;
  preferCache?: boolean;
}) {
  const [data, setData] = useState<DayContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const latKey = useMemo(() => Number(lat.toFixed(3)), [lat]);
  const lonKey = useMemo(() => Number(lon.toFixed(3)), [lon]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!enabled || !date) return;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);

      setError(null);

      const cacheKey = keyFor(latKey, lonKey, date);

      try {
        if (preferCache) {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw) as { savedAt: number; data: DayContext };
            if (parsed?.data && typeof parsed.savedAt === 'number') {
              const fresh = Date.now() - parsed.savedAt < TTL_MS;
              if (fresh) {
                setData(parsed.data);
                return;
              }
            }
          }
        }

        // Open-Meteo archive endpoint (historical hourly)        // Include hourly temperature so observed high/low can be computed locally.
        const hourlyVars = ['temperature_2m', 'cloudcover', 'windspeed_10m', 'wind_gusts_10m', 'precipitation'].join(
          ','
        );

        const url =
          `https://archive-api.open-meteo.com/v1/archive` +
          `?latitude=${latKey}&longitude=${lonKey}` +
          `&start_date=${date}&end_date=${date}` +
          `&hourly=${hourlyVars}` +
          `&temperature_unit=fahrenheit` +
          `&wind_speed_unit=mph` +
          `&timezone=auto`;

        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const h = json.hourly ?? {};
        const temp: any[] = h.temperature_2m ?? [];
        const cloud: any[] = h.cloudcover ?? [];
        const wind: any[] = h.windspeed_10m ?? [];
        const gust: any[] = h.wind_gusts_10m ?? [];
        const prcp: any[] = h.precipitation ?? []; // usually mm/hour

        let tMax: number | null = null;
        let tMin: number | null = null;

        let cloudMin: number | null = null;
        let cloudMax: number | null = null;
        let cloudSum = 0;
        let cloudN = 0;

        let windMax: number | null = null;
        let gustMax: number | null = null;

        let prcpMmSum = 0;
        let prcpN = 0;

        const n = Math.max(temp.length, cloud.length, wind.length, gust.length, prcp.length);

        for (let i = 0; i < n; i++) {
          const tf = safeNum(temp[i]);
          if (tf != null) {
            if (tMax == null || tf > tMax) tMax = tf;
            if (tMin == null || tf < tMin) tMin = tf;
          }

          const cc = safeNum(cloud[i]);
          if (cc != null) {
            if (cloudMin == null || cc < cloudMin) cloudMin = cc;
            if (cloudMax == null || cc > cloudMax) cloudMax = cc;
            cloudSum += cc;
            cloudN++;
          }

          const w = safeNum(wind[i]);
          if (w != null) {
            if (windMax == null || w > windMax) windMax = w;
          }

          const g = safeNum(gust[i]);
          if (g != null) {
            if (gustMax == null || g > gustMax) gustMax = g;
          }

          const p = safeNum(prcp[i]);
          if (p != null) {
            prcpMmSum += p;
            prcpN++;
          }
        }

        const cloudAvg = cloudN ? cloudSum / cloudN : null;
        const precipIn = prcpN ? mmToIn(prcpMmSum) : null;

        const out: DayContext = {
          date,
          tempMaxF: tMax,
          tempMinF: tMin,

          cloudMinPct: cloudMin,
          cloudMaxPct: cloudMax,
          windMaxMph: windMax,
          windGustMaxMph: gustMax,
          precipTotalIn: precipIn,
          conditionLabel: summarizeCondition(cloudAvg, precipIn, windMax),
          fetchedAtIso: new Date().toISOString(),
        };

        setData(out);
        await AsyncStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data: out }));
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setError(e?.message ?? 'Failed to load day context.');
      } finally {
        if (mode === 'initial') setLoading(false);
        else setRefreshing(false);
      }
    },
    [enabled, date, latKey, lonKey, preferCache]
  );

  useEffect(() => {
    load('initial');
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(() => load('refresh'), [load]);

  return { data, loading, refreshing, error, refresh };
}