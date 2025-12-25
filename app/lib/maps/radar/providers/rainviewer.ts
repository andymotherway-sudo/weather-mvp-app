import type { RadarFrame, RadarProvider } from './types';

// Simple in-memory cache (upgrade to persisted cache later)
let cachedFrames: RadarFrame[] | null = null;
let cacheExpiresAt = 0;

type RainViewerMapsResponse = {
  host?: string;
  radar?: {
    past?: Array<{ time: number; path: string }>;
    nowcast?: Array<{ time: number; path: string }>;
  };
};

// RainViewer’s docs emphasize you should use {host} + {path} returned by the API. :contentReference[oaicite:4]{index=4}
const MAPS_JSON = 'https://api.rainviewer.com/public/maps.json';

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
}): RadarProvider {
  const ttlMs = opts?.ttlMs ?? 60_000;
  const includeNowcast = opts?.includeNowcast ?? true;
  const maxFrames = opts?.maxFrames ?? 12;
  const maxZoom = opts?.maxZoom ?? 10;

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

  // We return a template with {z}/{x}/{y}.png and bake frame-specific path into it.
  // RainViewer wants you to use host+path from maps.json. :contentReference[oaicite:5]{index=5}
  function tileTemplateFor(host: string, path: string) {
    // Typical path already includes /v2/radar/{time}/.../256/...png variants depending on API version.
    // Docs say: use {host}{path}/256/{z}/{x}/{y}/...png (varies by path). :contentReference[oaicite:6]{index=6}
    // The simplest is: `{host}${path}/256/{z}/{x}/{y}/2/1_1.png` in older examples,
    // but we avoid hardcoding by using the path returned.
    //
    // Many returned paths end with something like "/256/{z}/{x}/{y}/2/1_1.png" already.
    // If not, we append a common suffix.
    const looksLikeTemplate = path.includes('{z}') && path.includes('{x}') && path.includes('{y}');
    if (looksLikeTemplate) return `${host}${path}`;

    // Safe fallback: assume path is a prefix and append a typical tile suffix.
    return `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`;
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
      const path = cachedPaths[Math.max(0, idx)];

      return tileTemplateFor(cachedHost, path);
    },
  };
}
