import { API_BASE } from '../../../net/apiBase';

export type MrmsRadarFrame = {
  iso: string;
  template: string;
  maxZ: number;
  label: string;
};

type MrmsTimelineResponse = {
  ok?: boolean;
  product?: string;
  validTime?: string | null;
  time?: string | null;
  frame?: string;
  minZoom?: number;
  maxZoom?: number;
  tileCount?: number;
  totalBytes?: number;
  maxFrameAgeMinutes?: number;
  frames?: Array<{
    frame?: string;
    validTime?: string | null;
    time?: string | null;
    maxZoom?: number;
  }>;
};

let cachedFrame: MrmsRadarFrame[] | null = null;
let cachedExpiresAt = 0;
let cachedProduct = '';

function buildMrmsTileTemplate(product: string, frame?: string | null) {
  const params = new URLSearchParams();
  params.set('product', product);
  if (frame) params.set('frame', frame);

  // URL.toString() percent-encodes the MapLibre placeholders, which prevents
  // native tile substitution. Keep the path literal and only encode the query.
  return `${API_BASE.replace(/\/+$/, '')}/v1/radar/mrms/tiles/{z}/{x}/{y}.png?${params.toString()}`;
}

function safeMaxZoom(value: unknown) {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 4;
  return Math.max(3, Math.min(10, n));
}

export async function fetchMrmsFrames(args?: { product?: string; ttlMs?: number }): Promise<MrmsRadarFrame[]> {
  const product = (args?.product || 'MergedReflectivityQCComposite').trim();
  const ttlMs = Math.max(10_000, args?.ttlMs ?? 60_000);
  const now = Date.now();

  if (cachedFrame && cachedProduct === product && now < cachedExpiresAt) {
    return cachedFrame;
  }

  const u = new URL(`${API_BASE}/v1/radar/mrms/timeline`);
  u.searchParams.set('product', product);

  const res = await fetch(u.toString());
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MRMS timeline failed: ${res.status}${text ? ` ${text.slice(0, 180)}` : ''}`);
  }

  const json = JSON.parse(text) as MrmsTimelineResponse;
  if (!json.ok) {
    throw new Error('MRMS timeline missing a valid frame');
  }

  const sourceFrames = Array.isArray(json.frames) && json.frames.length
    ? json.frames
    : [{ frame: json.frame, validTime: json.validTime, time: json.time, maxZoom: json.maxZoom }];
  const mappedFrames = sourceFrames
    .map((frame) => {
      const iso = frame.validTime || frame.time;
      if (!iso) return null;
      return {
        iso,
        template: buildMrmsTileTemplate(product, frame.frame),
        maxZ: safeMaxZoom(frame.maxZoom ?? json.maxZoom),
        label: `MRMS ${frame.frame || iso}`,
      };
    })
    .filter((frame): frame is MrmsRadarFrame => !!frame)
    .sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
  const newestMs = mappedFrames.reduce((best, frame) => {
    const ms = new Date(frame.iso).getTime();
    return Number.isFinite(ms) ? Math.max(best, ms) : best;
  }, Number.NEGATIVE_INFINITY);
  const maxAgeMs = Math.max(5, Math.min(360, json.maxFrameAgeMinutes ?? 360)) * 60_000;
  const frames = Number.isFinite(newestMs)
    ? mappedFrames.filter((frame) => {
      const ms = new Date(frame.iso).getTime();
      return Number.isFinite(ms) && newestMs - ms <= maxAgeMs;
    })
    : mappedFrames;
  if (!frames.length) {
    throw new Error('MRMS timeline missing a valid frame');
  }

  cachedProduct = product;
  cachedFrame = frames;
  cachedExpiresAt = now + ttlMs;
  return frames;
}
