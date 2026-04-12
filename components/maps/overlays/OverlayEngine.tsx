import MapLibreGL from '@maplibre/maplibre-react-native';
import React, { useMemo } from 'react';

export type WmsOverlayConfig = {
  id: string;
  opacity: number;
  zIndex: number;
  enabled: boolean;
  tileUrlTemplates?: string[];
  url?: string;
  layers?: string;
  version?: '1.1.1' | '1.3.0';
  format?: string;
  transparent?: boolean;
  styles?: string;
  crs?: 'EPSG:3857' | 'EPSG:4326';
  time?: string | null;
  extraParams?: Record<string, string>;
  tileSize?: 256 | 512;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  fadeDurationMs?: number;
  resampling?: 'linear' | 'nearest';
};

type Props = {
  overlays: WmsOverlayConfig[];
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function encodeTemplateValue(value: string) {
  if (value === '{bbox-epsg-3857}' || value === '{bbox-epsg-4326}') {
    return value;
  }

  return encodeURIComponent(value);
}

function buildWmsTileTemplate(overlay: WmsOverlayConfig, tileSize: number) {
  if (!overlay.url || !overlay.layers) return null;

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
    width: String(tileSize),
    height: String(tileSize),
    exceptions: 'application/vnd.ogc.se_inimage',
  };

  if (version === '1.3.0') params.crs = crs;
  else params.srs = crs;

  if (crs === 'EPSG:3857') {
    params.bbox = '{bbox-epsg-3857}';
  } else {
    params.bbox = '{bbox-epsg-4326}';
  }

  if (overlay.time) params.time = overlay.time;

  if (overlay.extraParams) {
    for (const [key, value] of Object.entries(overlay.extraParams)) {
      params[key] = value;
    }
  }

  const qs = Object.entries(params)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeTemplateValue(value)}`)
    .join('&');

  return `${overlay.url}${overlay.url.includes('?') ? '&' : '?'}${qs}`;
}

function OverlayEngineInner({ overlays }: Props) {
  const sortedEnabled = useMemo(() => {
    return overlays
      .filter((overlay) => overlay.enabled && overlay.opacity > 0)
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  }, [overlays]);

  return (
    <>
      {sortedEnabled.map((overlay) => {
        const tileSize = overlay.tileSize ?? 512;
        const sourceId = `overlay-src-${overlay.id}`;
        const layerId = `overlay-lyr-${overlay.id}`;
        const templates =
          overlay.tileUrlTemplates?.length
            ? overlay.tileUrlTemplates
            : (() => {
                const template = buildWmsTileTemplate(overlay, tileSize);
                return template ? [template] : [];
              })();

        if (!templates.length) return null;

        return (
          <MapLibreGL.RasterSource
            key={`${overlay.id}:${overlay.time ?? 'latest'}:${tileSize}:${templates[0]}`}
            id={sourceId}
            tileUrlTemplates={templates}
            tileSize={tileSize}
            minZoomLevel={overlay.minZoomLevel ?? 0}
            maxZoomLevel={overlay.maxZoomLevel ?? 16}
          >
            <MapLibreGL.RasterLayer
              id={layerId}
              sourceID={sourceId}
              style={{
                rasterOpacity: clamp(overlay.opacity ?? 1, 0, 1),
                rasterFadeDuration: overlay.fadeDurationMs ?? 100,
                rasterResampling: overlay.resampling ?? 'linear',
              }}
            />
          </MapLibreGL.RasterSource>
        );
      })}
    </>
  );
}

export const OverlayEngine = React.memo(OverlayEngineInner);
