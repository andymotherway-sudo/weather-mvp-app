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
const NWS_PRODUCT = 'https://forecast.weather.gov/product.php';
const NWS_MARINE_ZONE_TEXT = 'https://marine.weather.gov/MapClick.php';

function shortBody(body: string, max = 240) {
  const s = (body ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function isGreatLakesZone(zoneId: string) {
  const prefix = zoneId.trim().toUpperCase().slice(0, 3);
  return ['LMZ', 'LEZ', 'LHZ', 'LOZ', 'LSZ'].includes(prefix);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

async function fetchGreatLakesNearshoreText(zoneId: string, wfo?: string) {
  const office = String(wfo ?? '').trim().toUpperCase();
  if (!office) {
    const e = new Error('Great Lakes text forecast requires a WFO id.');
    (e as any).code = 'NOT_AVAILABLE';
    throw e;
  }

  const url = `${NWS_PRODUCT}?issuedby=${encodeURIComponent(office)}&product=NSH&format=TXT&glossary=0`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'omniwx-app/1.0 (contact: andym@example.com)',
      Accept: 'text/html,text/plain',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`NWS product ${res.status}: ${shortBody(body) || res.statusText}`);
  }

  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const id = zoneId.trim().toUpperCase();
  const multiZoneHeader = new RegExp(`(?:^|\\n)${escapeRegex(id)}(?:-[A-Z]{2,3}\\d{3})*-[0-9]{6}-`, 'm');
  const exactZoneHeader = new RegExp(`(?:^|\\n)${escapeRegex(id)}-[0-9]{6}-`, 'm');
  const startMatch = exactZoneHeader.exec(text) ?? multiZoneHeader.exec(text);
  if (!startMatch) {
    const e = new Error(`No nearshore text block found for ${id}.`);
    (e as any).code = 'NOT_AVAILABLE';
    throw e;
  }

  const start = startMatch.index + (startMatch[0].startsWith('\n') ? 1 : 0);
  const rest = text.slice(start);
  const nextHeaderMatch = /\n[A-Z]{2,3}\d{3}(?:-[A-Z]{2,3}\d{3})*-[0-9]{6}-/m.exec(rest.slice(1));
  const nextSeparator = /\n\$\$/m.exec(rest);
  const candidates = [
    nextHeaderMatch ? 1 + nextHeaderMatch.index : Number.POSITIVE_INFINITY,
    nextSeparator ? nextSeparator.index : Number.POSITIVE_INFINITY,
  ];
  const end = Math.min(...candidates);
  const block = (Number.isFinite(end) ? rest.slice(0, end) : rest).trim();

  if (!block) {
    const e = new Error(`Empty nearshore text block for ${id}.`);
    (e as any).code = 'NOT_AVAILABLE';
    throw e;
  }

  const issuedLine =
    block
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /\b(?:AM|PM)\s(?:CST|CDT|EST|EDT|MST|MDT|PST|PDT)\b/i.test(line)) ?? '';

  return {
    headline: `Nearshore Marine Forecast (${id})`,
    issuedAt: issuedLine || new Date().toISOString(),
    periods: [{ name: 'Official text forecast', summary: block }],
  };
}

async function fetchGreatLakesZoneText(zoneId: string) {
  const id = zoneId.trim().toUpperCase();
  const url = `${NWS_MARINE_ZONE_TEXT}?TextType=1&zoneid=${encodeURIComponent(id)}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'omniwx-app/1.0 (contact: andym@example.com)',
      Accept: 'text/html,text/plain',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`NWS marine text ${res.status}: ${shortBody(body) || res.statusText}`);
  }

  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const startAnchor =
    text.indexOf('NWS Forecast for:') >= 0
      ? text.indexOf('NWS Forecast for:')
      : text.indexOf('Zone Forecast:') >= 0
        ? text.indexOf('Zone Forecast:')
        : -1;

  if (startAnchor < 0) {
    const e = new Error(`No marine zone text block found for ${id}.`);
    (e as any).code = 'NOT_AVAILABLE';
    throw e;
  }

  const trimmed = text.slice(startAnchor);
  const endAnchor = trimmed.indexOf('Visit your local NWS office at:');
  const block = (endAnchor > 0 ? trimmed.slice(0, endAnchor) : trimmed).trim();

  if (!block) {
    const e = new Error(`Empty marine zone text block for ${id}.`);
    (e as any).code = 'NOT_AVAILABLE';
    throw e;
  }

  const headlineLine =
    block
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('NWS Forecast for:') || line.startsWith('Zone Forecast:')) ?? `Marine Forecast (${id})`;
  const issuedLine =
    block
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /^Last Update:/i.test(line) || /\b(?:AM|PM)\s(?:CST|CDT|EST|EDT|MST|MDT|PST|PDT)\b/i.test(line)) ??
    new Date().toISOString();

  return {
    headline: headlineLine.replace(/^NWS Forecast for:\s*/i, '').replace(/^Zone Forecast:\s*/i, '').trim(),
    issuedAt: issuedLine.replace(/^Last Update:\s*/i, '').trim(),
    periods: [{ name: 'Official text forecast', summary: block }],
  };
}

export function useMarineForecast(zoneId?: string, wfo?: string, enabled = true): UseMarineForecastResult {
  const [forecast, setForecast] = useState<MarineForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'ok' | 'not_available' | 'error'>('ok');

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

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

        // 3) Great Lakes nearshore fallback via NWS product page
        if (isGreatLakesZone(id)) {
          try {
            const glZone = await fetchGreatLakesZoneText(id);
            if (cancelled) return;

            setForecast({
              id,
              headline: glZone.headline,
              periods: glZone.periods,
              issuedAt: glZone.issuedAt,
              source: 'NOAA / NWS marine zone text (marine.weather.gov)',
            });
            setLoading(false);
            setStatus('ok');
            return;
          } catch {
            // fall through
          }

          try {
            const gl = await fetchGreatLakesNearshoreText(id, wfo);
            if (cancelled) return;

            setForecast({
              id,
              headline: gl.headline,
              periods: gl.periods,
              issuedAt: gl.issuedAt,
              source: `NOAA / NWS nearshore text (${String(wfo ?? '').toUpperCase()} · NSH)`,
            });
            setLoading(false);
            setStatus('ok');
            return;
          } catch {
            // fall through
          }
        }

        // 4) Fallback: TGFTP text (US prefixes only)
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
  }, [enabled, zoneId, wfo]);

  return { forecast, loading, error, status };
}
