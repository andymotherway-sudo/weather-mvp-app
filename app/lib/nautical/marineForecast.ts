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
  // ✅ NEW: let UI distinguish “no official available” from “real error”
  status?: 'ok' | 'not_available' | 'error';
}

const NWS_API = 'https://api.weather.gov';

function shortBody(body: string, max = 240) {
  const s = (body ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/**
 * TGFTP marine text directory mapping by zone prefix.
 * Notes:
 * - These are US NWS marine zones only.
 * - Still does NOT cover Europe/Spain; that requires non-NWS sources.
 */
function tgftpUrlForZone(zoneId: string): string | null {
  const id = zoneId.trim().toLowerCase();

  // Common NWS marine zone prefixes:
  // ANZ (Atlantic coastal waters), AMZ (Atlantic offshore), GMZ (Gulf),
  // LMZ (Lake Michigan), LEZ (Lake Erie), LHZ (Lake Huron), LOZ (Lake Ontario),
  // LSZ (Lake Superior), PZZ (Pacific coastal), PKZ (Alaska coastal waters) etc.
  const map: Record<string, string> = {
    anz: 'an',
    amz: 'am',
    gmz: 'gm',
    lmz: 'lm',
    lez: 'le',
    lhz: 'lh',
    loz: 'lo',
    lsz: 'ls',
    pzz: 'pz',
    pkz: 'pk',
    phz: 'ph',
    pmz: 'pm',
    psz: 'ps',
  };

  const prefix = id.slice(0, 3);
  const dir = map[prefix];
  if (!dir) return null;

  // tgftp structure:
  // https://tgftp.nws.noaa.gov/data/forecasts/marine/coastal/<dir>/<zone>.txt
  return `https://tgftp.nws.noaa.gov/data/forecasts/marine/coastal/${dir}/${id}.txt`;
}

async function fetchZoneForecastJson(path: string, zoneId: string) {
  const url = `${NWS_API}${path}/${encodeURIComponent(zoneId)}/forecast`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'omniwx-app/1.0 (contact: andym@example.com)',
      Accept: 'application/geo+json, application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`NWS ${res.status} ${path}: ${shortBody(body) || res.statusText}`);
  }

  const json: any = await res.json();
  const props = json?.properties ?? {};

  const periodsSrc: any[] = Array.isArray(props?.periods)
    ? props.periods
    : Array.isArray(props?.forecast)
      ? props.forecast
      : [];

  const periods: MarineForecastPeriod[] = periodsSrc.map((p) => ({
    name: p?.name ?? 'Period',
    summary: p?.detailedForecast ?? p?.text ?? p?.summary ?? '',
  }));

  if (!periods.length) throw new Error('NWS returned no forecast periods');

  const headline: string = props?.name ?? props?.headline ?? `Marine forecast for ${zoneId}`;
  const issuedAt: string = props?.updated ?? props?.issuanceTime ?? props?.issued ?? new Date().toISOString();

  return { headline, issuedAt, periods };
}

async function fetchTgftpText(zoneId: string) {
  const url = tgftpUrlForZone(zoneId);
  if (!url) {
    // ✅ This is not a “system error”; it just means “no US TGFTP mapping”
    const e = new Error('Official text forecast not available for this zone.');
    (e as any).code = 'NOT_AVAILABLE';
    throw e;
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'omniwx-app/1.0 (contact: andym@example.com)',
      Accept: 'text/plain',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TGFTP ${res.status}: ${shortBody(body) || res.statusText}`);
  }

  const text = await res.text();

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
  const [status, setStatus] = useState<'ok' | 'not_available' | 'error'>('ok');

  useEffect(() => {
    if (!zoneId) {
      setForecast(null);
      setLoading(false);
      setError(null);
      setStatus('not_available');
      return;
    }

    const id = zoneId.trim().toUpperCase();
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setStatus('ok');

        // 1) Try NWS marine zones first (US waters)
        try {
          const nws = await fetchZoneForecastJson('/zones/marine', id);
          if (cancelled) return;

          setForecast({
            id,
            headline: nws.headline,
            periods: nws.periods,
            issuedAt: nws.issuedAt,
            source: 'NOAA / NWS (api.weather.gov · zones/marine)',
          });
          setLoading(false);
          setStatus('ok');
          return;
        } catch {
          // fall through
        }

        // 2) Fallback: forecast zones (rare)
        try {
          const nws = await fetchZoneForecastJson('/zones/forecast', id);
          if (cancelled) return;

          setForecast({
            id,
            headline: nws.headline,
            periods: nws.periods,
            issuedAt: nws.issuedAt,
            source: 'NOAA / NWS (api.weather.gov · zones/forecast)',
          });
          setLoading(false);
          setStatus('ok');
          return;
        } catch {
          // fall through
        }

        // 3) Fallback: TGFTP text (US prefixes only)
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
        setStatus('ok');
      } catch (e: any) {
        if (cancelled) return;

        // ✅ Treat NOT_AVAILABLE as “no official for this zone”, not a scary error.
        if (e?.code === 'NOT_AVAILABLE') {
          setForecast(null);
          setLoading(false);
          setError(null);
          setStatus('not_available');
          return;
        }

        setForecast(null);
        setLoading(false);
        setError(e?.message ?? 'Unable to load marine forecast.');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [zoneId]);

  return { forecast, loading, error, status };
}
