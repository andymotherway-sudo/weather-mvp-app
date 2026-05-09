// app/lib/spaceweather/api.ts

import type {
  GoesXrayNow,
  ImfNow,
  NoaaScalesNow,
  ProtonNow,
  SolarWindSample,
  MarsInsightWeather,
  SpaceWeatherExtremes,
  SpaceWeatherSummary,
} from './types';
import type { SpaceWeatherEvent } from './useSpaceWeatherEvents';

// --- NOAA endpoints ---

const PLASMA_PRIMARY =
  'https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json';

const PLASMA_FALLBACKS: string[] = [
  'https://services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json',
  'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json',
];

const MAG_PRIMARY =
  'https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json';

const MAG_FALLBACKS: string[] = [
  'https://services.swpc.noaa.gov/products/solar-wind/mag-2-hour.json',
  'https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json',
];

const KP_PRIMARY =
  'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

const KP_FALLBACK_FORECAST =
  'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';

// NOAA Scales + GOES X-ray + GOES Protons (primary satellite)
const NOAA_SCALES_URL = 'https://services.swpc.noaa.gov/products/noaa-scales.json';
const GOES_XRAY_6H_URL = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json';
const GOES_XRAY_7D_URL = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json';
const GOES_PROTONS_6H_URL =
  'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json';

// ---------- Worker base (NASA DONKI / APOD / NCEI secrets live here) ----------

const API_BASE_RAW = (process.env.EXPO_PUBLIC_API_BASE as string | undefined) ?? '';
const API_BASE = API_BASE_RAW.replace(/\/+$/, '');

function apiUrl(path: string) {
  if (!API_BASE) throw new Error('Missing EXPO_PUBLIC_API_BASE. Set it in .env and restart Expo.');
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

export async function fetchMarsInsightWeather(): Promise<MarsInsightWeather> {
  return fetchJson<MarsInsightWeather>(apiUrl('/mars-insight'), 'Mars InSight weather');
}

// ---------- Shared helpers ----------

async function fetchJsonArray(url: string, label: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} request failed: ${res.status}`);

  const json = (await res.json()) as unknown;
  if (!Array.isArray(json) || json.length < 2) {
    throw new Error(`${label} response was empty or malformed`);
  }
  return json;
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    const snippet = text?.slice(0, 160) ?? '';
    throw new Error(`${label} request failed: ${res.status}${snippet ? ` — ${snippet}` : ''}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (e: any) {
    const snippet = text?.slice(0, 160) ?? '';
    throw new Error(`${label} JSON parse failed${snippet ? ` — starts with: ${snippet}` : ''}`);
  }
}

async function safeOptional<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[spaceweather] optional source failed: ${label}`, err);
    return null;
  }
}

function toIsoFromNoaaTableTime(timeRaw: string) {
  // NOAA tables use "YYYY-MM-DD HH:mm:ss.SSS"
  // Force Z to keep it stable across devices
  return new Date(timeRaw.replace(' ', 'T') + 'Z').toISOString();
}

function nowMs() {
  return Date.now();
}

// ---------- Plasma with fallbacks + history ----------

type PlasmaData = {
  speed: number;
  density: number;
  temperature: number;
  time: string; // raw time_tag from NOAA
  history: SolarWindSample[];
};

async function loadPlasmaWithFallbacks(): Promise<PlasmaData> {
  const urls = [PLASMA_PRIMARY, ...PLASMA_FALLBACKS];
  let lastError: unknown;

  for (const url of urls) {
    try {
      const table = await fetchJsonArray(url, 'Plasma');
      const rows = table.slice(1);
      if (!rows.length) throw new Error('Plasma response had no data rows');

      const lastRow = rows[rows.length - 1] as [string, string, string, string];
      const [timeRaw, densityStr, speedStr, tempStr] = lastRow;

      const density = parseFloat(densityStr);
      const speed = parseFloat(speedStr);
      const temperature = parseFloat(tempStr);

      if ([density, speed, temperature].some((v) => Number.isNaN(v)) || !timeRaw) {
        throw new Error('Plasma row contained invalid numbers');
      }

      const sliceCount = Math.min(rows.length, 12);
      const historyRows = rows.slice(rows.length - sliceCount);
      const history: SolarWindSample[] = historyRows
        .map((r: any) => {
          const t = String(r[0]);
          const s = parseFloat(String(r[2]));
          if (Number.isNaN(s)) return null;
          return { time: toIsoFromNoaaTableTime(t), speed: s };
        })
        .filter(Boolean) as SolarWindSample[];

      if (!history.length) {
        history.push({ time: new Date().toISOString(), speed });
      }

      return { speed, density, temperature, time: timeRaw, history };
    } catch (err) {
      lastError = err;
      console.warn('[spaceweather] plasma source failed', url, err);
    }
  }

  throw lastError ?? new Error('All plasma sources failed');
}

// ---------- IMF (Bt/Bz) with fallbacks ----------

type MagData = {
  time: string; // raw
  bzGsmNt: number;
  btNt: number;
};

async function loadMagWithFallbacks(): Promise<MagData> {
  const urls = [MAG_PRIMARY, ...MAG_FALLBACKS];
  let lastError: unknown;

  for (const url of urls) {
    try {
      const table = await fetchJsonArray(url, 'Mag');
      const rows = table.slice(1);
      if (!rows.length) throw new Error('Mag response had no data rows');

      // Header: ["time_tag","bx_gsm","by_gsm","bz_gsm","lon_gsm","lat_gsm","bt"]
      const lastRow = rows[rows.length - 1] as any[];
      const timeRaw = String(lastRow[0] ?? '');
      const bz = parseFloat(String(lastRow[3] ?? ''));
      const bt = parseFloat(String(lastRow[6] ?? ''));

      if (!timeRaw || [bz, bt].some((v) => Number.isNaN(v))) {
        throw new Error('Mag row contained invalid numbers');
      }

      return { time: timeRaw, bzGsmNt: bz, btNt: bt };
    } catch (err) {
      lastError = err;
      console.warn('[spaceweather] mag source failed', url, err);
    }
  }

  throw lastError ?? new Error('All mag sources failed');
}

// ---------- Kp with fallbacks ----------

type KpSample = { kp: number; time: string };

async function loadKpWithFallbacks(): Promise<KpSample> {
  const tryParse = (rows: any[]): KpSample | null => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];

      // Current NOAA shape: object rows
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        const time = String(row.time_tag ?? row.time ?? '').trim();
        const kp = Number(row.Kp ?? row.kp ?? row.planetary_k_index);

        if (time && Number.isFinite(kp)) {
          return { kp, time };
        }
      }

      // Older/table shape: array rows
      if (Array.isArray(row) && row.length >= 2) {
        const time = String(row[0] ?? '').trim();
        if (!time) continue;

        let kp = parseFloat(String(row[1] ?? ''));

        if (Number.isNaN(kp)) {
          for (let j = 1; j < row.length; j++) {
            const n = parseFloat(String(row[j] ?? ''));
            if (!Number.isNaN(n)) {
              kp = n;
              break;
            }
          }
        }

        if (!Number.isNaN(kp)) {
          return { kp, time };
        }
      }
    }

    return null;
  };

  try {
    const table = await fetchJsonArray(KP_PRIMARY, 'Kp (observed)');
    const parsed = tryParse(table);
    if (parsed) return parsed;
    throw new Error('Unable to parse observed Kp');
  } catch (err) {
    console.warn('[spaceweather] primary Kp source failed', err);
  }

  try {
    const table = await fetchJsonArray(KP_FALLBACK_FORECAST, 'Kp (forecast)');
    const parsed = tryParse(table);
    if (parsed) return parsed;
    throw new Error('Unable to parse forecast Kp');
  } catch (err) {
    console.warn('[spaceweather] forecast Kp source failed', err);
  }

  throw new Error('All Kp sources failed');
}

// ---------- NOAA Scales (G/R/S) ----------

function parseNoaaScalesNow(raw: any): NoaaScalesNow | null {
  const row = raw?.['0'];
  if (!row) return null;

  const parseItem = (x: any) => {
    if (!x || typeof x !== 'object') return null;

    const rawScale = x?.Scale;
    const scale =
      typeof rawScale === 'number'
        ? rawScale
        : typeof rawScale === 'string'
          ? Number(rawScale)
          : NaN;

    const text =
      typeof x?.Text === 'string' && x.Text.trim()
        ? x.Text.trim()
        : undefined;

    if (!Number.isFinite(scale) && !text) return null;

    return {
      scale: Number.isFinite(scale) ? scale : null,
      text,
    };
  };

  const g = parseItem(row?.G);
  const r = parseItem(row?.R);
  const s = parseItem(row?.S);

  if (!g && !r && !s) return null;

  return {
    dateStamp: row?.DateStamp ?? undefined,
    timeStamp: row?.TimeStamp ?? undefined,
    G: g,
    R: r,
    S: s,
  };
}

async function fetchNoaaScalesNow(): Promise<NoaaScalesNow | null> {
  const raw = await fetchJson<any>(NOAA_SCALES_URL, 'NOAA scales');
  return parseNoaaScalesNow(raw);
}

// ---------- GOES X-ray (XRS-B 0.1–0.8nm) ----------

type GoesXrayRow = {
  time_tag?: string;
  energy?: string; // "0.1-0.8nm"
  observed_flux?: number; // W/m^2
};

function xrayClassLabel(fluxWm2: number | null): string {
  if (!fluxWm2 || !Number.isFinite(fluxWm2) || fluxWm2 <= 0) return '—';

  const bands = [
    { letter: 'X', base: 1e-4 },
    { letter: 'M', base: 1e-5 },
    { letter: 'C', base: 1e-6 },
    { letter: 'B', base: 1e-7 },
    { letter: 'A', base: 1e-8 },
  ] as const;

  const band = bands.find((b) => fluxWm2 >= b.base) ?? bands[bands.length - 1];
  const val = fluxWm2 / band.base;

  const shown = Math.max(0.1, Math.round(val * 10) / 10);
  return `${band.letter}${shown.toFixed(1)}`;
}

async function fetchGoesXrayNow(): Promise<GoesXrayNow> {
  const rows = await fetchJson<GoesXrayRow[]>(GOES_XRAY_6H_URL, 'GOES x-ray');

  const channel = (rows ?? [])
    .filter((r) => r?.energy === '0.1-0.8nm' && typeof r?.observed_flux === 'number')
    .sort((a, b) => String(a.time_tag ?? '').localeCompare(String(b.time_tag ?? '')));

  const last = channel[channel.length - 1];
  const flux = typeof last?.observed_flux === 'number' ? last.observed_flux : null;

  return {
    timeTag: last?.time_tag,
    fluxWm2: flux,
    classLabel: xrayClassLabel(flux),
  };
}

async function fetchStrongestXray7d(): Promise<{ timeTag?: string; fluxWm2: number | null; classLabel: string }> {
  const rows = await fetchJson<GoesXrayRow[]>(GOES_XRAY_7D_URL, 'GOES x-ray 7d');

  const channel = (rows ?? []).filter(
    (r) => r?.energy === '0.1-0.8nm' && typeof r?.observed_flux === 'number'
  );

  let bestFlux: number | null = null;
  let bestTime: string | undefined;

  for (const r of channel) {
    const f = typeof r.observed_flux === 'number' ? r.observed_flux : null;
    if (f == null) continue;
    if (bestFlux == null || f > bestFlux) {
      bestFlux = f;
      bestTime = r.time_tag;
    }
  }

  return {
    timeTag: bestTime,
    fluxWm2: bestFlux,
    classLabel: xrayClassLabel(bestFlux),
  };
}

// ---------- GOES Protons (>=10 MeV) + S-scale ----------

type GoesProtonRow = {
  time_tag?: string;
  energy?: string; // ">=10 MeV"
  flux?: number; // pfu
  satellite?: number;
};

function pfuToSScale(pfu10: number | null): ProtonNow['sScale'] | undefined {
  // NOAA S-scale uses >=10 MeV flux thresholds (10, 100, 1000, 10000, 100000)
  if (pfu10 == null || !Number.isFinite(pfu10)) return undefined;
  if (pfu10 < 10) return undefined;
  if (pfu10 < 100) return 'S1';
  if (pfu10 < 1000) return 'S2';
  if (pfu10 < 10000) return 'S3';
  if (pfu10 < 100000) return 'S4';
  return 'S5';
}

async function fetchProtonsNow(): Promise<ProtonNow> {
  const rows = await fetchJson<GoesProtonRow[]>(GOES_PROTONS_6H_URL, 'GOES protons');

  const channel = (rows ?? [])
    .filter((r) => r?.energy === '>=10 MeV' && typeof r?.flux === 'number')
    .sort((a, b) => String(a.time_tag ?? '').localeCompare(String(b.time_tag ?? '')));

  const last = channel[channel.length - 1];
  const pfu = typeof last?.flux === 'number' ? last.flux : null;

  return {
    timeTag: last?.time_tag,
    pfu10MeV: pfu,
    sScale: pfuToSScale(pfu),
  };
}

// ---------- Extremes exporter (E) ----------

function msHours(h: number) {
  return h * 60 * 60 * 1000;
}

async function fetchMaxKp24h(): Promise<number | null> {
  try {
    const table = await fetchJsonArray(KP_PRIMARY, 'Kp (observed)');
    const rows = table.slice(1);
    const cutoff = nowMs() - msHours(24);

    let max: number | null = null;

    for (const row of rows) {
      const timeRaw = String(row[0] ?? '');
      const kp = parseFloat(String(row[1] ?? ''));
      if (!timeRaw || Number.isNaN(kp)) continue;

      const t = new Date(timeRaw).getTime();
      if (Number.isNaN(t)) continue;
      if (t < cutoff) continue;

      if (max == null || kp > max) max = kp;
    }

    return max;
  } catch (e) {
    console.warn('[spaceweather] maxKp24h failed', e);
    return null;
  }
}

async function fetchMaxWindSpeed24h(): Promise<number | null> {
  const urls = [PLASMA_PRIMARY, ...PLASMA_FALLBACKS];

  for (const url of urls) {
    try {
      const table = await fetchJsonArray(url, 'Plasma (for max wind)');
      const rows = table.slice(1);
      if (!rows.length) continue;

      const cutoff = nowMs() - msHours(24);
      let max: number | null = null;

      for (const r of rows) {
        const tRaw = String(r[0] ?? '');
        const speed = parseFloat(String(r[2] ?? ''));
        if (!tRaw || Number.isNaN(speed)) continue;

        const iso = toIsoFromNoaaTableTime(tRaw);
        const t = new Date(iso).getTime();
        if (Number.isNaN(t)) continue;
        if (t < cutoff) continue;

        if (max == null || speed > max) max = speed;
      }

      if (max != null) return max;
    } catch (e) {
      console.warn('[spaceweather] maxWindSpeed24h source failed', url, e);
    }
  }

  return null;
}

async function fetchFastestCme30d(): Promise<{ startTime?: string; speedKms: number | null; cmeId?: string }> {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  const startDate = isoDate(start);
  const endDate = isoDate(end);

  // ✅ Use Worker proxy (NASA key is private server-side)
  const url = apiUrl(`/api/nasa/donki/CME?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);

  type DonkiCmeAnalysis = { isMostAccurate?: boolean; speed?: number };
  type DonkiCme = { cmeID: string; startTime: string; cmeAnalyses?: DonkiCmeAnalysis[] };

  try {
    const cmes = await fetchDonkiJson<DonkiCme[]>(url);

    let bestSpeed: number | null = null;
    let bestStart: string | undefined;
    let bestId: string | undefined;

    for (const c of cmes ?? []) {
      const a = pickMostAccurateAnalysis(c.cmeAnalyses ?? undefined);
      const s = a?.speed;
      if (s == null || Number.isNaN(s)) continue;

      if (bestSpeed == null || s > bestSpeed) {
        bestSpeed = s;
        bestStart = c.startTime;
        bestId = c.cmeID;
      }
    }

    return {
      startTime: bestStart,
      speedKms: bestSpeed != null ? Math.round(bestSpeed) : null,
      cmeId: bestId,
    };
  } catch (e) {
    console.warn('[spaceweather] fastestCme30d failed', e);
    return { speedKms: null };
  }
}

export async function fetchSpaceWeatherExtremes(): Promise<SpaceWeatherExtremes> {
  const [maxKp24h, maxWindSpeed24h, strongestXray7d, fastestCme30d] = await Promise.all([
    fetchMaxKp24h(),
    fetchMaxWindSpeed24h(),
    safeOptional(() => fetchStrongestXray7d(), 'GOES x-ray strongest 7d').then(
      (v) => v ?? { fluxWm2: null, classLabel: '—' }
    ),
    fetchFastestCme30d(),
  ]);

  return {
    computedAt: new Date().toISOString(),
    maxKp24h,
    maxWindSpeed24h,
    strongestXray7d,
    fastestCme30d,
  };
}

// ---------- Public summary API (Solar tab) ----------

export async function fetchSpaceWeatherSummary(): Promise<SpaceWeatherSummary> {
  const [plasma, kp] = await Promise.all([loadPlasmaWithFallbacks(), loadKpWithFallbacks()]);

  const [noaaScales, goesXray, imf, protons] = await Promise.all([
    safeOptional(() => fetchNoaaScalesNow(), 'NOAA scales'),
    safeOptional(() => fetchGoesXrayNow(), 'GOES x-ray'),
    safeOptional(async () => {
      const m = await loadMagWithFallbacks();
      const iso = toIsoFromNoaaTableTime(m.time);
      const out: ImfNow = { timeTag: iso, bzGsmNt: m.bzGsmNt, btNt: m.btNt };
      return out;
    }, 'IMF mag (Bz/Bt)'),
    safeOptional(() => fetchProtonsNow(), 'GOES protons (>=10 MeV)'),
  ]);

  const plasmaTime = new Date(plasma.time);
  const kpTime = new Date(kp.time);
  const newest =
    !Number.isNaN(plasmaTime.getTime()) && plasmaTime > kpTime ? plasma.time : kp.time;

  const noaaScalesUpdatedAt =
    noaaScales?.dateStamp && noaaScales?.timeStamp
      ? new Date(`${noaaScales.dateStamp}T${noaaScales.timeStamp}Z`).toISOString()
      : undefined;

  return {
    solarWindSpeed: plasma.speed,
    solarWindDensity: plasma.density,
    solarWindTemp: plasma.temperature,
    kp: kp.kp,
    updatedAt: newest,
    windHistory: plasma.history,

    noaaScales: noaaScales ?? undefined,
    noaaScalesUpdatedAt,
    goesXray: goesXray ?? undefined,
    imf: imf ?? undefined,
    protons: protons ?? undefined,
  };
}

// =============================
// DONKI events (NOW via Worker)
// =============================

type DonkiFlr = {
  flrID: string;
  beginTime: string;
  peakTime?: string;
  endTime?: string;
  classType?: string;
  sourceLocation?: string;
  note?: string;
};

type DonkiCmeAnalysis = {
  isMostAccurate?: boolean;
  speed?: number;
  type?: string;
  note?: string;
};

type DonkiCme = {
  cmeID: string;
  startTime: string;
  sourceLocation?: string;
  note?: string;
  cmeAnalyses?: DonkiCmeAnalysis[];
};

type DonkiSep = {
  sepID: string;
  eventTime: string;
  instruments?: { displayName: string }[];
  note?: string;
};

type DonkiGstKp = {
  kpIndex?: string;
  observedTime?: string;
};

type DonkiGst = {
  gstID: string;
  startTime: string;
  allKpIndex?: DonkiGstKp[];
  note?: string;
};

function isoDate(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function pickMostAccurateAnalysis(analyses?: DonkiCmeAnalysis[]) {
  if (!analyses?.length) return null;
  return analyses.find((a) => a.isMostAccurate) ?? analyses[0] ?? null;
}

function kpToGScale(maxKp: number | null) {
  if (maxKp == null || Number.isNaN(maxKp)) return undefined;
  if (maxKp < 5) return undefined;
  if (maxKp < 6) return 'G1';
  if (maxKp < 7) return 'G2';
  if (maxKp < 8) return 'G3';
  if (maxKp < 9) return 'G4';
  return 'G5';
}

async function fetchDonkiJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DONKI ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

function settledErrorMessage(result: PromiseSettledResult<unknown>, label: string) {
  if (result.status === 'fulfilled') return null;
  const msg =
    result.reason instanceof Error
      ? result.reason.message
      : typeof result.reason === 'string'
        ? result.reason
        : 'unknown failure';
  return `${label}: ${msg}`;
}

export async function fetchSpaceWeatherEvents(days = 7): Promise<SpaceWeatherEvent[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const startDate = isoDate(start);
  const endDate = isoDate(end);

  // ✅ Use Worker proxy routes (no client-side NASA key)
  const urls = {
    FLR: apiUrl(`/api/nasa/donki/FLR?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
    CME: apiUrl(`/api/nasa/donki/CME?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
    SEP: apiUrl(`/api/nasa/donki/SEP?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
    GST: apiUrl(`/api/nasa/donki/GST?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
  };

  const [flrRes, cmeRes, sepRes, gstRes] = await Promise.allSettled([
    fetchDonkiJson<DonkiFlr[]>(urls.FLR),
    fetchDonkiJson<DonkiCme[]>(urls.CME),
    fetchDonkiJson<DonkiSep[]>(urls.SEP),
    fetchDonkiJson<DonkiGst[]>(urls.GST),
  ]);

  const events: SpaceWeatherEvent[] = [];

  if (flrRes.status === 'fulfilled') {
    for (const f of flrRes.value ?? []) {
      const level = f.classType?.trim();
      const loc = f.sourceLocation?.trim();
      const summary =
        (level ? `Solar flare ${level}` : 'Solar flare') +
        (loc ? ` from ${loc}` : '') +
        (f.note ? ` — ${f.note}` : '');

      events.push({
        id: `FLARE:${f.flrID}`,
        type: 'FLARE',
        startTime: f.beginTime,
        peakTime: f.peakTime,
        level,
        summary,
        source: 'DONKI',
      });
    }
  }

  if (cmeRes.status === 'fulfilled') {
    for (const c of cmeRes.value ?? []) {
      const a = pickMostAccurateAnalysis(c.cmeAnalyses ?? undefined);
      const speed =
        a?.speed != null && !Number.isNaN(a.speed) ? Math.round(a.speed) : null;
      const loc = c.sourceLocation?.trim();

      const bits: string[] = [];
      bits.push('Coronal mass ejection');
      if (loc) bits.push(`from ${loc}`);
      if (speed != null) bits.push(`~${speed} km/s`);
      const summary =
        bits.join(' ') + (c.note ? ` — ${c.note}` : a?.note ? ` — ${a.note}` : '');

      events.push({
        id: `CME:${c.cmeID}`,
        type: 'CME',
        startTime: c.startTime,
        level: speed != null ? `${speed} km/s` : undefined,
        summary,
        source: 'DONKI',
      });
    }
  }

  if (sepRes.status === 'fulfilled') {
    for (const s of sepRes.value ?? []) {
      const inst = s.instruments?.map((i) => i.displayName).filter(Boolean) ?? [];
      const summary =
        `Solar energetic particle event` +
        (inst.length ? ` (instruments: ${inst.join(', ')})` : '') +
        (s.note ? ` — ${s.note}` : '');

      events.push({
        id: `SEP:${s.sepID}`,
        type: 'SEP',
        startTime: s.eventTime,
        summary,
        source: 'DONKI',
      });
    }
  }

  if (gstRes.status === 'fulfilled') {
    for (const g of gstRes.value ?? []) {
      const kpVals =
        g.allKpIndex
          ?.map((k) => (k.kpIndex != null ? Number(k.kpIndex) : NaN))
          .filter((n) => !Number.isNaN(n)) ?? [];

      const maxKp = kpVals.length ? Math.max(...kpVals) : null;
      const gScale = kpToGScale(maxKp);

      const summary =
        `Geomagnetic storm` +
        (maxKp != null ? ` (max Kp ~${maxKp.toFixed(1)})` : '') +
        (gScale ? ` ${gScale}` : '') +
        (g.note ? ` — ${g.note}` : '');

      events.push({
        id: `GST:${g.gstID}`,
        type: 'GST',
        startTime: g.startTime,
        level: gScale ?? (maxKp != null ? `Kp ${maxKp.toFixed(1)}` : undefined),
        summary,
        source: 'DONKI',
      });
    }
  }

  events.sort((a, b) => {
    const ta = new Date(a.startTime).getTime();
    const tb = new Date(b.startTime).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });

  const seen = new Set<string>();
  const deduped: SpaceWeatherEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    deduped.push(e);
  }
  const allFailed =
    flrRes.status === 'rejected' &&
    cmeRes.status === 'rejected' &&
    sepRes.status === 'rejected' &&
    gstRes.status === 'rejected';

  if (allFailed) {
    const details = [
      settledErrorMessage(flrRes, 'FLR'),
      settledErrorMessage(cmeRes, 'CME'),
      settledErrorMessage(sepRes, 'SEP'),
      settledErrorMessage(gstRes, 'GST'),
    ]
      .filter(Boolean)
      .join(' | ');
    throw new Error(details ? `All DONKI sources failed. ${details}` : 'All DONKI sources failed');
  }
  return deduped;
}
