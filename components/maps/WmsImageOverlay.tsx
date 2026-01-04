import MapLibreGL from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';

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
  url: string;     // base WMS endpoint
  layers: string;  // comma-separated WMS layers
  opacity: number; // 0..1
  zIndex: number;
  enabled: boolean;

  // optional overrides (nice to have)
  format?: string;       // default image/png
  transparent?: boolean; // default true
  styles?: string;       // default ""
  extraParams?: Record<string, string>;
};

type Props = {
  region: Region;
  width: number;
  height: number;
  overlays: WmsOverlayConfig[];
};

/* ============================
 * Web Mercator helpers
 * ============================ */

const RADIUS = 6378137;
const DEG2RAD = Math.PI / 180;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function lonLatToMercator(lon: number, lat: number) {
  const x = RADIUS * lon * DEG2RAD;

  // clamp latitude to WebMercator limits to avoid Infinity
  const clampedLat = clamp(lat, -85.05112878, 85.05112878);
  const y = RADIUS * Math.log(Math.tan(Math.PI / 4 + (clampedLat * DEG2RAD) / 2));

  return [x, y] as const;
}

function regionToBbox3857(region: Region): string {
  const west = region.longitude - region.longitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;

  const [minX, minY] = lonLatToMercator(west, south);
  const [maxX, maxY] = lonLatToMercator(east, north);

  return `${minX},${minY},${maxX},${maxY}`;
}

/* ============================
 * Overlay Engine
 * ============================ */

export function OverlayEngine({ region, width, height, overlays }: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bbox, setBbox] = useState<string | null>(null);

  // Only depend on primitive fields (prevents “region object identity” churn)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setBbox(regionToBbox3857(region));
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
    };
  }, [region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta]);

  // ImageSource corners are ALWAYS lon/lat (EPSG:4326), even if WMS bbox is 3857
  const corners: ImageCorners = useMemo(() => {
    const west = region.longitude - region.longitudeDelta / 2;
    const east = region.longitude + region.longitudeDelta / 2;
    const south = region.latitude - region.latitudeDelta / 2;
    const north = region.latitude + region.latitudeDelta / 2;

    // (Optional safety clamp; prevents weird projection blowups near poles)
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

  if (!bbox) return null;

  // Keep requests reasonable (avoid tiny 0 sizes / extreme sizes)
  const w = clamp(Math.floor(width || 0), 256, 2048);
  const h = clamp(Math.floor(height || 0), 256, 2048);

  return (
    <>
      {sortedEnabled.map((overlay) => {
        const format = overlay.format ?? 'image/png';
        const transparent = overlay.transparent ?? true;
        const styles = overlay.styles ?? '';

        const params: Record<string, string> = {
          service: 'WMS',
          request: 'GetMap',
          version: '1.3.0',
          layers: overlay.layers,
          styles,
          format,
          transparent: transparent ? 'true' : 'false',
          crs: 'EPSG:3857',
          bbox,
          width: String(w),
          height: String(h),
        };

        if (overlay.extraParams) {
          for (const [k, v] of Object.entries(overlay.extraParams)) params[k] = v;
        }

        const qs = Object.entries(params)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&');

        const imageUrl = `${overlay.url}${overlay.url.includes('?') ? '&' : '?'}${qs}`;

        const opacity = clamp(overlay.opacity ?? 1, 0, 1);

        return (
          <MapLibreGL.ImageSource
            key={overlay.id}
            id={`overlay-src-${overlay.id}`}
            coordinates={corners}
            url={imageUrl}
          >
            <MapLibreGL.RasterLayer
              id={`overlay-lyr-${overlay.id}`}
              style={{
                rasterOpacity: opacity,
                rasterFadeDuration: 0,
              }}
            />
          </MapLibreGL.ImageSource>
        );
      })}
    </>
  );
}
