import { API_BASE } from '../../../net/apiBase';
import type { RadarProductId } from '../../radarIem';

export type Level3RadarFrame = {
  iso: string;
  template: string;
  maxZ: number;
  label: string;
  site: string;
  product: RadarProductId;
};

type Level3TimelineResponse = {
  ok?: boolean;
  site?: string;
  product?: string;
  validTime?: string | null;
  productTime?: string | null;
  frame?: string;
  maxZoom?: number;
  maxFrameAgeMinutes?: number;
  frames?: Array<{
    frame?: string;
    site?: string;
    product?: string;
    validTime?: string | null;
    productTime?: string | null;
    maxZoom?: number;
  }>;
};

const DEFAULT_LEVEL3_STALE_AFTER_MS = 6 * 60 * 60_000;
const LEVEL3_PRODUCTS = new Set<RadarProductId>(['N0B', 'N0S', 'EET']);

let cachedFrames: Level3RadarFrame[] | null = null;
let cachedExpiresAt = 0;
let cachedKey = '';

export function supportsLevel3Product(product: RadarProductId) {
  return LEVEL3_PRODUCTS.has(product);
}

function normalizeLevel3Site(site: string | null | undefined) {
  const raw = String(site ?? '').trim().toUpperCase();
  return raw.length === 4 && raw.startsWith('K') ? raw.slice(1) : raw.slice(-3);
}

function normalizeUtcIso(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const utcRaw = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(utcRaw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function safeMaxZoom(value: unknown) {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 10;
  return Math.max(3, Math.min(10, n));
}

function buildLevel3TileTemplate(site: string, product: RadarProductId, frame?: string | null) {
  const params = new URLSearchParams();
  params.set('site', site);
  params.set('product', product);
  if (frame) params.set('frame', frame);
  return `${API_BASE.replace(/\/+$/, '')}/v1/radar/level3/tiles/{z}/{x}/{y}.png?${params.toString()}`;
}

export async function fetchLevel3Frames(args: {
  site: string | null | undefined;
  product: RadarProductId;
  ttlMs?: number;
  staleAfterMs?: number;
}): Promise<Level3RadarFrame[]> {
  const site = normalizeLevel3Site(args.site);
  const product = args.product;
  if (!/^[A-Z0-9]{3}$/.test(site)) throw new Error('Level III site missing');
  if (!supportsLevel3Product(product)) throw new Error(`Owned Level III does not support ${product} yet`);

  const ttlMs = Math.max(10_000, args.ttlMs ?? 60_000);
  const staleAfterMs = Math.max(15 * 60_000, args.staleAfterMs ?? DEFAULT_LEVEL3_STALE_AFTER_MS);
  const cacheKey = `${site}:${product}`;
  const now = Date.now();
  if (cachedFrames && cachedKey === cacheKey && now < cachedExpiresAt) return cachedFrames;

  const u = new URL(`${API_BASE}/v1/radar/level3/timeline`);
  u.searchParams.set('site', site);
  u.searchParams.set('product', product);

  const res = await fetch(u.toString());
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Owned Level III timeline failed: ${res.status}${text ? ` ${text.slice(0, 160)}` : ''}`);
  }

  const json = JSON.parse(text) as Level3TimelineResponse;
  if (!json.ok) throw new Error('Owned Level III timeline missing a valid frame');

  const sourceFrames = Array.isArray(json.frames) && json.frames.length
    ? json.frames
    : [{ frame: json.frame, site: json.site, product: json.product, validTime: json.validTime, productTime: json.productTime, maxZoom: json.maxZoom }];

  const frames = sourceFrames
    .map((frame) => {
      const frameSite = normalizeLevel3Site(frame.site ?? site);
      const frameProduct = String(frame.product ?? product).trim().toUpperCase() as RadarProductId;
      const iso = normalizeUtcIso(frame.validTime || frame.productTime);
      if (!iso || frameProduct !== product || frameSite !== site) return null;
      return {
        iso,
        template: buildLevel3TileTemplate(site, product, frame.frame),
        maxZ: safeMaxZoom(frame.maxZoom ?? json.maxZoom),
        label: `Owned Level III ${site} ${product} ${frame.frame || iso}`,
        site,
        product,
      } satisfies Level3RadarFrame;
    })
    .filter((frame): frame is Level3RadarFrame => !!frame)
    .sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

  const newestMs = frames.reduce((best, frame) => {
    const ms = new Date(frame.iso).getTime();
    return Number.isFinite(ms) ? Math.max(best, ms) : best;
  }, Number.NEGATIVE_INFINITY);
  if (!frames.length || !Number.isFinite(newestMs) || now - newestMs > staleAfterMs) {
    const ageMinutes = Number.isFinite(newestMs) ? Math.round((now - newestMs) / 60_000) : null;
    throw new Error(`Owned Level III is unavailable${ageMinutes == null ? '' : ` (${ageMinutes} minutes old)`}`);
  }

  cachedKey = cacheKey;
  cachedFrames = frames;
  cachedExpiresAt = now + ttlMs;
  return frames;
}
