// app/lib/maps/providers/rainviewer.ts
import type { RadarFrame, RadarProvider } from './types';

let cachedFrames: RadarFrame[] | null = null;
let cacheExpiresAt = 0;

type RainViewerMapsResponse = {
  host?: string;
  radar?: {
    past?: Array<{ time: number; path: string }>;
    nowcast?: Array<{ time: number; path: string }>;
  };
};

// RainViewer timeline endpoint. The legacy /public/maps.json endpoint now
// returns an empty array, while weather-maps.json contains the live radar paths.
const MAPS_JSON = 'https://api.rainviewer.com/public/weather-maps.json';

// RainViewer tiles are proxied through the Worker for caching and consistent CORS behavior.
const OMNIWX_WORKER_BASE = 'https://omniwx-api.omniwx.workers.dev';

function toFrame(t: number): RadarFrame {
  return { t, iso: new Date(t * 1000).toISOString() };
}

export function createRainViewerProvider(opts?: {
  // How long to cache timeline
  ttlMs?: number;
  // prefer nowcast when available (may change with RainViewer policy)
  includeNowcast?: boolean;
  // cap frames to keep UI smooth + control tile usage
  maxFrames?: number;
  // set to 10 for “free-safe”; can increase when you’re on a paid plan
  maxZoom?: number;

  /**
   * Optional override for the Worker base URL.
   * Useful for dev/staging or if you change the hostname later.
   */
  workerBaseUrl?: string;

  /**
   * Tile params forwarded to the Worker (which forwards to RainViewer).
   * Defaults match what you tested.
   */
  tileSize?: 256 | 512;
  color?: string; // RainViewer palette id (often "2")
  smooth?: 0 | 1;
  snow?: 0 | 1;
}): RadarProvider {
  const ttlMs = opts?.ttlMs ?? 60_000;
  const includeNowcast = opts?.includeNowcast ?? true;
  const maxFrames = opts?.maxFrames ?? 12;
  const maxZoom = opts?.maxZoom ?? 8;

  const workerBaseUrl = (opts?.workerBaseUrl ?? OMNIWX_WORKER_BASE).replace(/\/+$/, '');

  const tileSize: 256 | 512 = opts?.tileSize === 512 ? 512 : 256;
  const color = (opts?.color ?? '2').trim() || '2';
  const smooth: 0 | 1 = opts?.smooth === 0 ? 0 : 1;
  const snow: 0 | 1 = opts?.snow === 0 ? 0 : 1;

  async function fetchFrames(): Promise<{ frames: RadarFrame[]; host: string; paths: string[] }> {
    const res = await fetch(MAPS_JSON);
    if (!res.ok) throw new Error(`RainViewer maps.json failed: ${res.status}`);

    const data = (await res.json()) as RainViewerMapsResponse;

    const host = data.host;
    if (!host) throw new Error('RainViewer maps.json missing host');

    const past = (data.radar?.past ?? []).map((p) => ({ time: p.time, path: p.path }));
    const nowcast = includeNowcast ? (data.radar?.nowcast ?? []).map((p) => ({ time: p.time, path: p.path })) : [];

    // Order: oldest -> newest
    const combined = [...past, ...nowcast]
      .filter((p) => typeof p.time === 'number' && typeof p.path === 'string' && p.path.length > 3)
      .sort((a, b) => a.time - b.time);

    // Keep last N frames to control tile usage
    const tail = combined.slice(Math.max(0, combined.length - maxFrames));

    const frames = tail.map((p) => toFrame(p.time));
    const paths = tail.map((p) => p.path);

    return { frames, host, paths };
  }

  /**   * Worker-based tile template:
   *   /v1/radar/rainviewer/tiles/{z}/{x}/{y}.png?ts=UNIX&size=512&color=2&smooth=1&snow=1
   *
   * Note: We do NOT need RainViewer host/path here — the Worker fetches by ts.   * cachedHost and cachedPaths are retained for compatibility with existing frame consumers.
   */
  function workerTileTemplateForFrame(ts: number, path?: string) {
    const qs =
      `ts=${encodeURIComponent(String(ts))}` +
      (path ? `&path=${encodeURIComponent(path)}` : '') +
      `&size=${encodeURIComponent(String(tileSize))}` +
      `&color=${encodeURIComponent(color)}` +
      `&smooth=${encodeURIComponent(String(smooth))}` +
      `&snow=${encodeURIComponent(String(snow))}`;

    return `${workerBaseUrl}/v1/radar/rainviewer/tiles/{z}/{x}/{y}.png?${qs}`;
  }

  let cachedHost: string | null = null;
  let cachedPaths: string[] | null = null;

  return {
    id: 'rainviewer',
    maxZoom,

    getFrames: async () => {
      const now = Date.now();
      if (cachedFrames && now < cacheExpiresAt && cachedHost && cachedPaths) return cachedFrames;

      const { frames, host, paths } = await fetchFrames();
      cachedFrames = frames;
      cachedHost = host;
      cachedPaths = paths;
      cacheExpiresAt = now + ttlMs;

      return frames;
    },

    getTileUrlTemplate: (frame) => {
      // Find matching path by frame time
      if (!cachedFrames || !cachedPaths || !cachedHost) {
        // If called before getFrames(), just force the caller to fetch frames first.
        // Keeps the adapter simple and explicit.
        throw new Error('RainViewer provider not initialized: call getFrames() first');
      }

      const idx = cachedFrames.findIndex((f) => f.t === frame.t);
      const safeIdx = idx >= 0 ? idx : cachedFrames.length - 1;

      const ts = cachedFrames[Math.max(0, Math.min(cachedFrames.length - 1, safeIdx))]?.t;
      const path = cachedPaths[Math.max(0, Math.min(cachedPaths.length - 1, safeIdx))];

      if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) {
        throw new Error('RainViewer frame missing valid unix timestamp');
      }

      return workerTileTemplateForFrame(ts, path);
    },
  };
}
