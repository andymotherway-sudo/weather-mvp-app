// app/lib/climatology/ncei.ts
import { noaaSchedule } from '../noaa/noaaRateLimiter';
import { ClimoError } from './types';

const BASE = 'https://www.ncei.noaa.gov/cdo-web/api/v2';

// Keep defaults aligned with records hook
const REQ_TIMEOUT_MS = 25_000; // normals endpoint is slower
const RETRY_BACKOFF_MS = [750, 1500, 3000]; // 3 retries

type FetchJsonOpts = {
  token?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

// ---------- helpers ----------
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isAbortError(err: any) {
  return (
    err?.name === 'AbortError' ||
    err?.code === 20 ||
    (typeof err?.message === 'string' && err.message.toLowerCase().includes('abort'))
  );
}

function isTransientNetworkError(err: any) {
  const msg = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
  return (
    err instanceof TypeError ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  );
}

function withTimeout<T>(p: Promise<T>, ms: number, label = 'Request timed out') {
  let t: any;
  const timeout = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

async function safeReadText(res: Response) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function parseRetryAfterSeconds(retryAfter: string | null): number | null {
  if (!retryAfter) return null;
  const s = retryAfter.trim();

  const n = Number(s);
  if (Number.isFinite(n) && n >= 0) return Math.min(30, n);

  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;

  const deltaSec = Math.ceil((ms - Date.now()) / 1000);
  if (!Number.isFinite(deltaSec)) return null;
  return Math.max(0, Math.min(30, deltaSec));
}

function classifyHttpError(status: number, text: string) {
  if (status === 401 || status === 403) {
    return new ClimoError('NO_TOKEN', 'NOAA token missing/invalid for NCEI CDO API.', { status, text });
  }

  if (status === 429) {
    return new ClimoError('NETWORK', 'NOAA is rate limiting requests (HTTP 429).', { status, text });
  }

  if (status >= 500 && status <= 599) {
    return new ClimoError('NETWORK', `NOAA service error (HTTP ${status}).`, { status, text });
  }

  return new ClimoError('NETWORK', `NOAA request failed (HTTP ${status}).`, { status, text });
}

function extractStatus(e: any): number | null {
  const s = (e as any)?.details?.status ?? (e as any)?.status;
  const n = Number(s);
  if (Number.isFinite(n)) return n;

  // fallback: parse "HTTP ###" from message
  const msg = typeof e?.message === 'string' ? e.message : '';
  const m = msg.match(/HTTP\s+(\d{3})/i);
  if (!m) return null;
  const k = Number(m[1]);
  return Number.isFinite(k) ? k : null;
}

function messageLooks429(e: any) {
  const msg = typeof e?.message === 'string' ? e.message.toLowerCase() : '';
  return msg.includes('http 429') || msg.includes('rate limiting') || msg.includes('(429)') || msg.includes(' 429');
}

// ---------- core ----------
async function fetchJsonOnce(url: string, opts: FetchJsonOpts) {
  if (opts.signal?.aborted) {
    const ae: any = new Error('Aborted');
    ae.name = 'AbortError';
    throw ae;
  }

  const headers: Record<string, string> = {};
  if (opts.token) headers.token = opts.token;

  const timeoutMs = opts.timeoutMs ?? REQ_TIMEOUT_MS;

  let res: Response;
  try {
    // ✅ Schedule ALL NOAA calls through the global limiter
    res = await noaaSchedule(async () => {
      if (opts.signal?.aborted) {
        const ae: any = new Error('Aborted');
        ae.name = 'AbortError';
        throw ae;
      }
      return await withTimeout(fetch(url, { headers, signal: opts.signal }), timeoutMs, 'NOAA request timed out');
    });
  } catch (e: any) {
    if (isAbortError(e) || opts.signal?.aborted) throw e;
    throw new ClimoError('NETWORK', 'Network error while contacting NOAA.', e);
  }

  if (!res.ok) {
    const text = await safeReadText(res);
    const err: any = classifyHttpError(res.status, text);

    // ✅ Always attach status so retry logic can classify reliably
    err.status = res.status;
    err.details = { ...(err.details ?? {}), status: res.status, text };

    // ✅ Attach Retry-After for 429 if present
    if (res.status === 429) {
      err.retryAfterSec = parseRetryAfterSeconds(res.headers?.get?.('retry-after') ?? null);
    }

    throw err;
  }

  try {
    return await res.json();
  } catch (e: any) {
    if (isAbortError(e) || opts.signal?.aborted) throw e;
    throw new ClimoError('NETWORK', 'Failed to parse NOAA response JSON.', e);
  }
}

async function fetchJsonWithRetry(url: string, opts: FetchJsonOpts) {
  let lastErr: any = null;

  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    if (opts.signal?.aborted) {
      const ae: any = new Error('Aborted');
      ae.name = 'AbortError';
      throw ae;
    }

    try {
      return await fetchJsonOnce(url, opts);
    } catch (e: any) {
      if (isAbortError(e) || opts.signal?.aborted) throw e;

      lastErr = e;

      const status = extractStatus(e);
      const is429 = status === 429 || messageLooks429(e);
      const is5xx = status != null && status >= 500 && status <= 599;

      const canRetry = isTransientNetworkError(e) || is429 || is5xx;
      if (!canRetry || attempt === RETRY_BACKOFF_MS.length) break;

      const retryAfterSec = (e as any)?.retryAfterSec;
      if (is429 && typeof retryAfterSec === 'number' && Number.isFinite(retryAfterSec)) {
        await sleep(retryAfterSec * 1000);
      } else {
        await sleep(RETRY_BACKOFF_MS[attempt]);
      }
    }
  }

  if (lastErr instanceof ClimoError) throw lastErr;
  throw lastErr ?? new ClimoError('NETWORK', 'Failed to load NOAA data.');
}

// ---------- URL builders ----------
export function buildStationsUrl(params: Record<string, string | number | undefined>) {
  const u = new URL(`${BASE}/stations`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export function buildDataUrl(params: Record<string, string | number | undefined>) {
  const u = new URL(`${BASE}/data`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

// ---------- public API ----------
export async function nceiStations(params: Record<string, any>, token?: string, signal?: AbortSignal) {
  const url = buildStationsUrl(params);
  return fetchJsonWithRetry(url, { token, signal });
}

export async function nceiData(params: Record<string, any>, token?: string, signal?: AbortSignal) {
  const url = buildDataUrl(params);
  return fetchJsonWithRetry(url, { token, signal });
}