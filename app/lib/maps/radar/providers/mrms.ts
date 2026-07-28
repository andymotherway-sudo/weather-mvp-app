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
};

let cachedFrame: MrmsRadarFrame[] | null = null;
let cachedExpiresAt = 0;
let cachedProduct = '';

function buildMrmsTileTemplate(product: string) {
  const u = new URL(`${API_BASE}/v1/radar/mrms/tiles/{z}/{x}/{y}.png`);
  u.searchParams.set('product', product);
  return u.toString();
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
  const iso = json.validTime || json.time;
  if (!json.ok || !iso) {
    throw new Error('MRMS timeline missing a valid frame');
  }

  const frames = [{
    iso,
    template: buildMrmsTileTemplate(product),
    maxZ: safeMaxZoom(json.maxZoom),
    label: `MRMS ${json.frame || iso}`,
  }];

  cachedProduct = product;
  cachedFrame = frames;
  cachedExpiresAt = now + ttlMs;
  return frames;
}
