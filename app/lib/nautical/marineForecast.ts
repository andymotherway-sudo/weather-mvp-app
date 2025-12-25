// app/lib/nautical/marineForecast.ts

import { useEffect, useState } from 'react';

export interface MarineForecastPeriod {
  name: string;
  summary: string;
}

export interface MarineForecast {
  id: string;
  headline: string;
  periods: MarineForecastPeriod[];
  issuedAt: string;
  source: string;
}

interface UseMarineForecastResult {
  forecast: MarineForecast | null;
  loading: boolean;
  error: string | null;
}

// ✅ Use forecast zones for PZZ/AMZ/ANZ/GMZ/LMZ/LEZ/etc.
const NWS_FORECAST_ZONES_BASE = 'https://api.weather.gov/zones/forecast';

// Best-effort mapping for marine text files (good enough for PZZ* right now)
function tgftpUrlForZone(zoneId: string): string | null {
  const id = zoneId.trim().toLowerCase();

  // Pacific coastal waters are "pz" in the tgftp folder structure
  if (id.startsWith('pzz')) {
    return `https://tgftp.nws.noaa.gov/data/forecasts/marine/coastal/pz/${id}.txt`;
  }

  // Add more later (anz/amz/gmz/lmz/lez/...)
  return null;
}

async function fetchNwsJson(zoneId: string) {
  const url = `${NWS_FORECAST_ZONES_BASE}/${encodeURIComponent(zoneId)}/forecast`;

  const res = await fetch(url, {
    headers: {
      // NWS asks for descriptive UA w/ contact
      'User-Agent': 'omniwx-app/1.0 (andym@example.com)',
      Accept: 'application/geo+json, application/json',
    },
  });

  if (!res.ok) {
    // Read body so you can see the actual reason (HTML, rate-limit msg, etc.)
    const body = await res.text().catch(() => '');
    throw new Error(`NWS forecast ${res.status}: ${body || res.statusText}`);
  }

  const json: any = await res.json();
  const props = json?.properties ?? {};

  // Forecast zones return periods in properties.periods
  const periodsSrc: any[] = Array.isArray(props?.periods)
    ? props.periods
    : Array.isArray(props?.forecast)
    ? props.forecast
    : [];

  const periods: MarineForecastPeriod[] = periodsSrc.map((p) => ({
    name: p?.name ?? 'Period',
    summary: p?.detailedForecast ?? p?.text ?? p?.summary ?? '',
  }));

  if (!periods.length) {
    throw new Error('NWS returned no forecast periods');
  }

  // props.name is usually the official zone title
  const headline: string =
    props?.name ?? props?.headline ?? `Marine forecast for ${zoneId}`;

  const issuedAt: string =
    props?.updated ?? props?.issuanceTime ?? props?.issued ?? new Date().toISOString();

  return { headline, issuedAt, periods };
}

async function fetchTgftpText(zoneId: string) {
  const url = tgftpUrlForZone(zoneId);
  if (!url) throw new Error('No tgftp mapping for this zone yet.');

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'omniwx-app/1.0 (andym@example.com)',
      Accept: 'text/plain',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TGFTP ${res.status}: ${body || res.statusText}`);
  }

  const text = await res.text();

  // Keep it simple: render as one big “Text forecast” block for now
  return {
    headline: `Marine text forecast (${zoneId})`,
    issuedAt: new Date().toISOString(),
    periods: [{ name: 'Text forecast', summary: text.trim() }],
  };
}

export function useMarineForecast(zoneId?: string): UseMarineForecastResult {
  const [forecast, setForecast] = useState<MarineForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!zoneId) {
      setForecast(null);
      setLoading(false);
      setError(null);
      return;
    }

    const id = zoneId.trim().toUpperCase();
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) Try NWS JSON (preferred)
        try {
          const nws = await fetchNwsJson(id);
          if (cancelled) return;

          setForecast({
            id,
            headline: nws.headline,
            periods: nws.periods,
            issuedAt: nws.issuedAt,
            source: 'NOAA / NWS (api.weather.gov)',
          });
          setLoading(false);
          return;
        } catch (e) {
          // fall through to TGFTP
        }

        // 2) Fallback: tgftp marine text (PZZ only for now)
        const tg = await fetchTgftpText(id);
        if (cancelled) return;

        setForecast({
          id,
          headline: tg.headline,
          periods: tg.periods,
          issuedAt: tg.issuedAt,
          source: 'NOAA / NWS marine text (tgftp.nws.noaa.gov)',
        });
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setForecast(null);
        setLoading(false);
        setError(e?.message ?? 'Unable to load marine forecast.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [zoneId]);

  return { forecast, loading, error };
}
