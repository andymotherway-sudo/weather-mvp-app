// app/lib/maps/radarIem.ts
// Radar providers + adapters.
// Step 1: RainViewer timeline + tiles (reliable frames, “premium feel” while testing).
// Keep IEM helpers for later (hyperlocal provider switch can be added as Step 2).

export type RadarScan = { iso: string; stamp: string };

type ResolveOpts = {
  zoom: number;
  product: 'N0Q' | 'N0B' | 'N0Z'; // kept for compatibility (RainViewer doesn’t map 1:1)
  localMinZoom: number;
  maxLocalDistanceKm: number;
  nationalTimestamp: string; // kept for compatibility
};

export type RadarLayerChoice = {
  provider: 'rainviewer' | 'iem-mosaic' | 'iem-ridge';
  tier: 'national' | 'local';
  maxTileZoom: number;
  tileUrl: string; // urlTemplate for UrlTile
  debugLabel: string;
  radarIcao?: string; // reserved for Step 2
  radarIdDisplay?: string;
};

// -----------------------------
// IEM helpers you already use
// -----------------------------

export function iemNationalMosaicTimestamps() {
  // Oldest -> newest (matches your minutes array)
  return [
    '900913-m50m',
    '900913-m45m',
    '900913-m40m',
    '900913-m35m',
    '900913-m30m',
    '900913-m25m',
    '900913-m20m',
    '900913-m15m',
    '900913-m10m',
    '900913-m05m',
    '900913',
  ];
}

export function buildLocalFallbackFramesUTC(opts: { minutesBack: number; stepMinutes: number }): RadarScan[] {
  const minutesBack = Math.max(5, Math.floor(opts.minutesBack));
  const step = Math.max(1, Math.floor(opts.stepMinutes));
  const now = Date.now();

  const frames: RadarScan[] = [];
  for (let m = minutesBack; m >= 0; m -= step) {
    const t = new Date(now - m * 60_000);
    // IEM RIDGE stamp: YYYYMMDDHHmm (UTC)
    const stamp =
      String(t.getUTCFullYear()) +
      String(t.getUTCMonth() + 1).padStart(2, '0') +
      String(t.getUTCDate()).padStart(2, '0') +
      String(t.getUTCHours()).padStart(2, '0') +
      String(t.getUTCMinutes()).padStart(2, '0');

    frames.push({ iso: t.toISOString(), stamp });
  }
  return frames;
}

// NOTE: Kept for compatibility; Step 1 uses RainViewer for frames.
// Still handy later for true hyperlocal RIDGE animation if you keep IEM.
export async function fetchIemScans(opts: {
  radarId: string; // e.g., "KIWA" or "KTLX"
  product: 'N0Q' | 'N0B' | 'N0Z';
  minutesBack: number;
}): Promise<RadarScan[]> {
  const radar = String(opts.radarId).trim().toUpperCase();
  const product = String(opts.product).trim().toUpperCase();
  const minutesBack = Math.max(15, Math.floor(opts.minutesBack));

  const end = new Date();
  const start = new Date(Date.now() - minutesBack * 60_000);

  // IEM list endpoint
  const url =
    `https://mesonet.agron.iastate.edu/json/radar.py?operation=list` +
    `&radar=${encodeURIComponent(radar)}` +
    `&product=${encodeURIComponent(product)}` +
    `&start=${encodeURIComponent(start.toISOString())}` +
    `&end=${encodeURIComponent(end.toISOString())}`;

  console.log('[IEM] scan list url', url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`IEM scan list failed (${res.status})`);

  const json = (await res.json()) as any;
  const scans = Array.isArray(json?.scans) ? json.scans : [];

  // Typical shape: ["2025-12-22T19:20:00Z", ...]
  // Convert to RIDGE stamps if needed:
  const out: RadarScan[] = scans
    .map((iso: any) => {
      const d = new Date(String(iso));
      if (Number.isNaN(d.getTime())) return null;
      const stamp =
        String(d.getUTCFullYear()) +
        String(d.getUTCMonth() + 1).padStart(2, '0') +
        String(d.getUTCDate()).padStart(2, '0') +
        String(d.getUTCHours()).padStart(2, '0') +
        String(d.getUTCMinutes()).padStart(2, '0');
      return { iso: d.toISOString(), stamp };
    })
    .filter(Boolean) as RadarScan[];

  return out;
}

// -----------------------------
// RainViewer adapter (Step 1)
// -----------------------------

type RainViewerMaps = {
  host?: string;
  radar?: {
    past?: Array<{ time: number; path: string }>;
    nowcast?: Array<{ time: number; path: string }>;
  };
};

let RV_CACHE: { at: number; data: RainViewerMaps | null } = { at: 0, data: null };
const RV_TTL_MS = 60_000;

async function fetchRainViewerMapsJson(): Promise<RainViewerMaps> {
  const now = Date.now();
  if (RV_CACHE.data && now - RV_CACHE.at < RV_TTL_MS) return RV_CACHE.data;

  const url = 'https://api.rainviewer.com/public/weather-maps.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RainViewer maps.json failed (${res.status})`);
  const data = (await res.json()) as RainViewerMaps;

  RV_CACHE = { at: now, data };
  return data;
}

export async function fetchRainViewerFrames(): Promise<RadarScan[]> {
  const data = await fetchRainViewerMapsJson();
  const past = data?.radar?.past ?? [];
  const nowcast = data?.radar?.nowcast ?? [];

  const frames = [...past, ...nowcast]
    .filter((f) => typeof f?.time === 'number' && typeof f?.path === 'string')
    .map((f) => ({
      iso: new Date(f.time * 1000).toISOString(),
      // stamp = RainViewer "path" (e.g. "/v2/radar/169....")
      stamp: f.path,
    }));

  return frames;
}

function buildRainViewerTileTemplate(host: string, path: string) {
  // RainViewer tile template uses host + path + /256/{z}/{x}/{y}/2/1_1.png
  // Zoom is capped at 10 on their Weather Maps API docs.
  const h = host.endsWith('/') ? host.slice(0, -1) : host;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${h}${p}/256/{z}/{x}/{y}/2/1_1.png`;
}

// -----------------------------
// Resolve which layer to use (Step 1)
// -----------------------------
// Step 1: Always use RainViewer tiles/timeline as the “premium testing” baseline.
// Keep zoom-based "tier" labeling, but DO NOT attempt true hyperlocal provider yet.

export function resolveRadarLayer(
  lat: number,
  lon: number,
  opts: ResolveOpts,
): RadarLayerChoice {
  const zoom = Number.isFinite(opts.zoom) ? opts.zoom : 4;

  // You said: zoom should control when hyperlocality kicks in (later).
  // For Step 1, we still label national/local using your threshold,
  // but we keep the provider = rainviewer for both.
  const tier: 'national' | 'local' = zoom >= opts.localMinZoom ? 'local' : 'national';

  // We can’t build the exact tile URL here because RainViewer needs host+path.
  // maps.tsx will call fetchRainViewerFrames() and then compute tile URL with the current frame’s path.
  // Return a placeholder; maps.tsx will replace it.
  return {
    provider: 'rainviewer',
    tier,
    maxTileZoom: 10,
    tileUrl: '',
    debugLabel: tier === 'local' ? 'RainViewer radar (mosaic) · local-labeled' : 'RainViewer radar (mosaic)',
  };
}

export async function buildRainViewerTileUrlForFrame(framePath: string): Promise<{
  tileUrl: string;
  providerLabel: string;
}> {
  const data = await fetchRainViewerMapsJson();
  const host = data?.host;

  if (!host) {
    throw new Error('RainViewer maps.json missing host');
  }

  const tileUrl = buildRainViewerTileTemplate(host, framePath);
  return { tileUrl, providerLabel: 'RainViewer' };
}
