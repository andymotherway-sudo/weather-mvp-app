// components/maps/overlays/OverlayEngine.tsx
import MapLibreGL from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Position = [number, number];
type ImageCorners = [Position, Position, Position, Position];

export type WmsOverlayConfig = {
  id: string;
  url: string;     // base WMS endpoint, e.g. https://.../wms or ...cgi
  layers: string;  // comma-separated WMS layers
  opacity: number; // 0..1
  zIndex: number;
  enabled: boolean;

  version?: '1.1.1' | '1.3.0';
  format?: string; // default image/png
  transparent?: boolean; // default true
  styles?: string; // default ""
  crs?: 'EPSG:3857' | 'EPSG:4326'; // default EPSG:3857
  time?: string | null; // optional TIME=...
  extraParams?: Record<string, string>;
};

type Props = {
  region: Region;
  width: number;   // px (already DPR-adjusted is ideal)
  height: number;  // px
  overlays: WmsOverlayConfig[];
  isUserInteracting?: boolean;
  debounceMs?: number;
};

const RADIUS = 6378137;
const DEG2RAD = Math.PI / 180;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function lonLatToMercator(lon: number, lat: number) {
  const x = RADIUS * lon * DEG2RAD;
  const clampedLat = clamp(lat, -85.05112878, 85.05112878);
  const y = RADIUS * Math.log(Math.tan(Math.PI / 4 + (clampedLat * DEG2RAD) / 2));
  return [x, y] as const;
}

function regionToBbox3857(region: Region) {
  const west = region.longitude - region.longitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;

  const [minX, minY] = lonLatToMercator(west, south);
  const [maxX, maxY] = lonLatToMercator(east, north);

  return { minX, minY, maxX, maxY };
}

function buildWmsUrl(
  overlay: WmsOverlayConfig,
  bbox3857: { minX: number; minY: number; maxX: number; maxY: number },
  w: number,
  h: number,
  isUserInteracting?: boolean,
) {
  const version = overlay.version ?? '1.1.1';
  const format = overlay.format ?? 'image/png';
  const transparent = overlay.transparent ?? true;
  const styles = overlay.styles ?? '';
  const crs = overlay.crs ?? 'EPSG:3857';

  const params: Record<string, string> = {
    service: 'WMS',
    request: 'GetMap',
    version,
    layers: overlay.layers,
    styles,
    format,
    transparent: transparent ? 'TRUE' : 'FALSE',
    width: String(w),
    height: String(h),

    // ask for an “in-image” error tile when supported
    exceptions: 'application/vnd.ogc.se_inimage',
  };

  if (version === '1.3.0') params.crs = crs;
  else params.srs = crs;

  if (crs === 'EPSG:3857') {
    const { minX, minY, maxX, maxY } = bbox3857;
    params.bbox = `${minX},${minY},${maxX},${maxY}`;
  }

  if (overlay.time) params.time = overlay.time;

  if (overlay.extraParams) {
    for (const [k, v] of Object.entries(overlay.extraParams)) params[k] = v;
  }

  const qs = Object.entries(params)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  return `${overlay.url}${overlay.url.includes('?') ? '&' : '?'}${qs}`;
}

// Preflight: confirm URL is probably an image.
// Use GET (not HEAD): some CGI endpoints lie/block HEAD.
async function isProbablyImage(url: string) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        Range: 'bytes=0-2047',
      },
    });

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.startsWith('image/')) return true;

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);

    // PNG signature
    const isPng =
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;

    // JPEG
    const isJpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

    // GIF
    const isGif = bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;

    // WEBP "RIFF....WEBP"
    const isWebp =
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50;

    return isPng || isJpg || isGif || isWebp;
  } catch {
    return false;
  }
}

export function OverlayEngine({
  region,
  width,
  height,
  overlays,
  isUserInteracting,
  debounceMs,
}: Props) {
  const deb = debounceMs ?? 220;

  // ---- Hooks MUST ALWAYS RUN IN SAME ORDER ----
  const [bbox, setBbox] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);

  const [approvedUrlById, setApprovedUrlById] = useState<Record<string, string>>({});
  const [disabledUntilById, setDisabledUntilById] = useState<Record<string, number>>({});
  

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Record<string, string>>({});

  // Keep refs to avoid dependency churn/loops in effects
  const approvedRef = useRef<Record<string, string>>({});
  const disabledRef = useRef<Record<string, number>>({});
  useEffect(() => { approvedRef.current = approvedUrlById; }, [approvedUrlById]);
  useEffect(() => { disabledRef.current = disabledUntilById; }, [disabledUntilById]);

  // Debounce region -> bbox updates
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setBbox(regionToBbox3857(region));
    }, deb);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
    };
  }, [region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta, deb]);

  // ImageSource corners are lon/lat (EPSG:4326) regardless of WMS CRS
  const corners: ImageCorners = useMemo(() => {
    const west = region.longitude - region.longitudeDelta / 2;
    const east = region.longitude + region.longitudeDelta / 2;
    const south = region.latitude - region.latitudeDelta / 2;
    const north = region.latitude + region.latitudeDelta / 2;

    const s = clamp(south, -85, 85);
    const n = clamp(north, -85, 85);

    return [
      [west, n],  // top-left
      [east, n],  // top-right
      [east, s],  // bottom-right
      [west, s],  // bottom-left
    ];
  }, [region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta]);

  const sortedEnabled = useMemo(() => {
    return overlays
      .filter((o) => o.enabled)
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  }, [overlays]);

  // Keep sizes reasonable
  const _dpr = PixelRatio.get();
  void _dpr;
  const w = clamp(Math.floor(width || 0), 256, 2048);
  const h = clamp(Math.floor(height || 0), 256, 2048);

  // Preflight URLs when bbox settles (and only when NOT interacting)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!bbox) return;                 // ✅ safe inside effect (NOT a conditional hook)
      if (isUserInteracting) return;     // ✅ safe inside effect

      const now = Date.now();

      for (const overlay of sortedEnabled) {
        const disabledUntil = disabledRef.current[overlay.id] ?? 0;
        if (now < disabledUntil) continue;

        const url = buildWmsUrl(overlay, bbox, w, h, isUserInteracting);

        if (approvedRef.current[overlay.id] === url) continue;
        if (inFlightRef.current[overlay.id] === url) continue;

        inFlightRef.current[overlay.id] = url;

        const ok = await isProbablyImage(url);

        console.log(
  `[OverlayEngine] preflight ${overlay.id}: ${ok ? 'OK' : 'BAD'}`
);
if (!ok) {
  console.log('[OverlayEngine] BAD URL:', url);
}

        if (cancelled) return;

        if (inFlightRef.current[overlay.id] !== url) continue;
        delete inFlightRef.current[overlay.id];
        
        if (ok) {
          setApprovedUrlById((m) => (m[overlay.id] === url ? m : { ...m, [overlay.id]: url }));
        } else {
          setDisabledUntilById((m) => ({ ...m, [overlay.id]: Date.now() + 25_000 }));
          setApprovedUrlById((m) => {
            if (!(overlay.id in m)) return m;
            const next = { ...m };
            delete next[overlay.id];
            return next;
          });
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [bbox, w, h, isUserInteracting, sortedEnabled]);

  // ---- Render-time guards are OK AFTER all hooks ----
  if (!bbox) return null;

  const bbox3857 = bbox; // ✅ now non-null for TS

  return (
    <>
      {sortedEnabled.map((overlay) => {
        const now = Date.now();
        const disabledUntil = disabledUntilById[overlay.id] ?? 0;
        if (now < disabledUntil) {
        console.log(`[OverlayEngine] ${overlay.id} cooling down for ${Math.ceil((disabledUntil - now)/1000)}s`);return null;}

        const approvedUrl = approvedUrlById[overlay.id];
        if (!approvedUrl) {
        console.log(`[OverlayEngine] ${overlay.id} not approved yet (waiting for preflight)`);
        return null;
      } // don’t hand MapLibre an unverified URL

        const opacity = clamp(overlay.opacity ?? 1, 0, 1);

        const srcId = `overlay-src-${overlay.id}`;
        const lyrId = `overlay-lyr-${overlay.id}`;

        // Optional: if you want to log “final URLs” for debugging
        // console.log(`[OverlayEngine] approved URL (${overlay.id}):`, approvedUrl);

        // NOTE: We do NOT pass onError to ImageSource (not in props).
        return (
          <MapLibreGL.ImageSource
            key={overlay.id}
            id={srcId}
            coordinates={corners}
            url={approvedUrl}
          >
            <MapLibreGL.RasterLayer
              id={lyrId}
              style={{
                rasterOpacity: opacity,
                rasterFadeDuration: 0,
                rasterResampling: isUserInteracting ? 'linear' : 'nearest',
              }}
            />
          </MapLibreGL.ImageSource>
        );
      })}
    </>
  );
}
