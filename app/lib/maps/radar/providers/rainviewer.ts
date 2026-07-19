// app/lib/maps/providers/rainviewer.ts
import type { RadarFrame, RadarProvider } from './types';

let cachedFrames: RadarFrame[] | null = null;
let cacheExpiresAt = 0;
let cachedWorkerConfig:
  | {
      maxZoom?: number;
      includeNowcast?: boolean;
      tileSize?: 256 | 512;
      color?: string;
      smooth?: 0 | 1;
      snow?: 0 | 1;
    }
  | null = null;
let workerConfigExpiresAt = 0;

type RainViewerMapsResponse = {
  ok?: boolean;
  host?: string | null;
  frames?: Array<{ time?: number; iso?: string; path?: string }>;
};

type WorkerRadarInfoResponse = {
  ok?: boolean;
  providers?: {
    rainviewer?: {
      maxZoom?: number;
      includeNowcast?: boolean;
      tileSize?: number;
      color?: string;
      smooth?: number;
      snow?: number;
    };
  };
};

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
  const includeNowcastDefault = opts?.includeNowcast ?? true;
  const maxFrames = opts?.maxFrames ?? 12;
  const maxZoomDefault = opts?.maxZoom ?? 8;

  const workerBaseUrl = (opts?.workerBaseUrl ?? OMNIWX_WORKER_BASE).replace(/\/+$/, '');

  const tileSizeDefault: 256 | 512 = opts?.tileSize === 512 ? 512 : 256;
  const colorDefault = (opts?.color ?? '2').trim() || '2';
  const smoothDefault: 0 | 1 = opts?.smooth === 0 ? 0 : 1;
  const snowDefault: 0 | 1 = opts?.snow === 0 ? 0 : 1;

  async function getWorkerConfig() {
    const now = Date.now();
    if (cachedWorkerConfig && now < workerConfigExpiresAt) return cachedWorkerConfig;

    try {
      const res = await fetch(`${workerBaseUrl}/v1/radar/info`);
      if (!res.ok) throw new Error(`Radar info failed: ${res.status}`);
      const json = (await res.json()) as WorkerRadarInfoResponse;
      const rainviewer = json?.providers?.rainviewer;
      cachedWorkerConfig = rainviewer
        ? {
            maxZoom:
              typeof rainviewer.maxZoom === 'number' && Number.isFinite(rainviewer.maxZoom)
                ? rainviewer.maxZoom
                : undefined,
            includeNowcast: typeof rainviewer.includeNowcast === 'boolean' ? rainviewer.includeNowcast : undefined,
            tileSize: rainviewer.tileSize === 512 ? 512 : rainviewer.tileSize === 256 ? 256 : undefined,
            color: typeof rainviewer.color === 'string' && rainviewer.color.trim() ? rainviewer.color.trim() : undefined,
            smooth: rainviewer.smooth === 0 ? 0 : rainviewer.smooth === 1 ? 1 : undefined,
            snow: rainviewer.snow === 0 ? 0 : rainviewer.snow === 1 ? 1 : undefined,
          }
        : {};
    } catch {
      cachedWorkerConfig = {};
    }

    workerConfigExpiresAt = now + 10 * 60_000;
    return cachedWorkerConfig;
  }

  async function fetchFrames(includeNowcast: boolean): Promise<{ frames: RadarFrame[]; host: string; paths: string[] }> {
    const qs =
      `includeNowcast=${includeNowcast ? '1' : '0'}` +
      `&maxFrames=${encodeURIComponent(String(maxFrames))}`;
    const res = await fetch(`${workerBaseUrl}/v1/radar/rainviewer/frames?${qs}`);
    if (!res.ok) throw new Error(`RainViewer frames failed: ${res.status}`);

    const data = (await res.json()) as RainViewerMapsResponse;

    const host = data.host;
    if (!host) throw new Error('RainViewer maps.json missing host');

    // Order: oldest -> newest
    const combined = (data.frames ?? [])
      .map((frame) => ({
        time: typeof frame.time === 'number' ? frame.time : NaN,
        path: typeof frame.path === 'string' ? frame.path : '',
      }))
      .filter((p) => Number.isFinite(p.time) && p.path.length > 3)
      .sort((a, b) => a.time - b.time);

    const frames = combined.map((p) => toFrame(p.time));
    const paths = combined.map((p) => p.path);

    return { frames, host, paths };
  }

  /**   * Worker-based tile template:
   *   /v1/radar/rainviewer/tiles/{z}/{x}/{y}.png?ts=UNIX&size=512&color=2&smooth=1&snow=1
   *
   * Note: We do NOT need RainViewer host/path here — the Worker fetches by ts.   * cachedHost and cachedPaths are retained for compatibility with existing frame consumers.
   */
  function workerTileTemplateForFrame(ts: number, path?: string) {
    const cfg = cachedWorkerConfig ?? {};
    const tileSize: 256 | 512 = cfg.tileSize === 512 ? 512 : cfg.tileSize === 256 ? 256 : tileSizeDefault;
    const color = (cfg.color ?? colorDefault).trim() || colorDefault;
    const smooth: 0 | 1 = cfg.smooth === 0 ? 0 : cfg.smooth === 1 ? 1 : smoothDefault;
    const snow: 0 | 1 = cfg.snow === 0 ? 0 : cfg.snow === 1 ? 1 : snowDefault;
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
    get maxZoom() {
      const cfg = cachedWorkerConfig ?? {};
      return typeof cfg.maxZoom === 'number' && Number.isFinite(cfg.maxZoom) ? cfg.maxZoom : maxZoomDefault;
    },

    getFrames: async () => {
      const now = Date.now();
      if (cachedFrames && now < cacheExpiresAt && cachedHost && cachedPaths) return cachedFrames;

      const cfg = await getWorkerConfig();
      const includeNowcast = typeof cfg.includeNowcast === 'boolean' ? cfg.includeNowcast : includeNowcastDefault;
      const { frames, host, paths } = await fetchFrames(includeNowcast);
      cachedFrames = frames;
      cachedHost = host;
      cachedPaths = paths;
      cacheExpiresAt = now + ttlMs;

      return frames;
    },

    getTileUrlTemplate: (frame) => {
      const ts = typeof frame?.t === 'number' && Number.isFinite(frame.t) ? frame.t : null;
      if (ts == null || ts <= 0) {
        throw new Error('RainViewer frame missing valid unix timestamp');
      }

      if (!cachedFrames || !cachedPaths || !cachedHost) {
        return workerTileTemplateForFrame(ts);
      }

      const idx = cachedFrames.findIndex((f) => f.t === frame.t);
      const safeIdx = idx >= 0 ? idx : cachedFrames.length - 1;
      const path = cachedPaths[Math.max(0, Math.min(cachedPaths.length - 1, safeIdx))];
      return workerTileTemplateForFrame(ts, path);
    },
  };
}
