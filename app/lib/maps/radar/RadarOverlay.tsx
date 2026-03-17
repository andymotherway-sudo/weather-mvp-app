// app/lib/maps/radar/RadarOverlay.tsx
import MapLibreGL from '@maplibre/maplibre-react-native';
import React, { useMemo } from 'react';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// Small stable hash so IDs change when template changes (forces correct refresh)
function hashTemplate(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/**
 * RadarOverlay (drop-in, backwards compatible)
 *
 * Key changes vs your version:
 * - Always use LINEAR resampling for radar (prevents “minecraft” blocks)
 * - IDs include a hash of the template so template changes refresh properly
 * - rasterFadeDuration: 0 reduces ghosting
 */
export function RadarOverlay(props: {
  templateA: string;
  templateB: string;
  opacityA: number;
  opacityB: number;
  idPrefix?: string;

  // optional / safe defaults
  zoom?: number; // kept for compatibility (not used for resampling anymore)
  playing?: boolean;
  maxTileZoomA?: number;
  maxTileZoomB?: number;
  minTileZoomA?: number;
  minTileZoomB?: number;
  allowCrossfadeWhilePlaying?: boolean; // default false
}) {
  const {
    templateA,
    templateB,
    opacityA,
    opacityB,
    idPrefix = 'radar',

    // kept for compatibility
    playing = false,
    maxTileZoomA = 8,
    maxTileZoomB = 8,
    minTileZoomA = 0,
    minTileZoomB = 0,
    allowCrossfadeWhilePlaying = false,
  } = props;

  const aOpacity = clamp01(opacityA);

  const shouldRenderB =
    !!templateB &&
    templateB !== templateA &&
    clamp01(opacityB) > 0.01 &&
    (!playing || allowCrossfadeWhilePlaying);

  const bOpacity = shouldRenderB ? clamp01(opacityB) : 0;

  // ✅ For radar, linear is the right default (nearest => pixel blocks)
  const rasterResampling: 'linear' | 'nearest' = 'linear';

  const aHash = useMemo(() => hashTemplate(String(templateA ?? '')), [templateA]);
  const bHash = useMemo(() => hashTemplate(String(templateB ?? '')), [templateB]);

  const sourceAId = `${idPrefix}-src-a-${aHash}`;
  const layerAId = `${idPrefix}-lyr-a-${aHash}`;
  const sourceBId = `${idPrefix}-src-b-${bHash}`;
  const layerBId = `${idPrefix}-lyr-b-${bHash}`;

  const sourceAProps = useMemo(
    () => ({
      id: sourceAId,
      tileUrlTemplates: [templateA],
      tileSize: 256,
      minZoomLevel: minTileZoomA,
      maxZoomLevel: maxTileZoomA,
    }),
    [sourceAId, templateA, minTileZoomA, maxTileZoomA],
  );

  const sourceBProps = useMemo(
    () => ({
      id: sourceBId,
      tileUrlTemplates: [templateB],
      tileSize: 256,
      minZoomLevel: minTileZoomB,
      maxZoomLevel: maxTileZoomB,
    }),
    [sourceBId, templateB, minTileZoomB, maxTileZoomB],
  );

  return (
    <>
      <MapLibreGL.RasterSource {...sourceAProps}>
        <MapLibreGL.RasterLayer
          id={layerAId}
          sourceID={sourceAId}
          style={{
            rasterOpacity: aOpacity,
            rasterResampling,
            rasterFadeDuration: 0,
          }}
        />
      </MapLibreGL.RasterSource>

      {shouldRenderB ? (
        <MapLibreGL.RasterSource {...sourceBProps}>
          <MapLibreGL.RasterLayer
            id={layerBId}
            sourceID={sourceBId}
            style={{
              rasterOpacity: bOpacity,
              rasterResampling,
              rasterFadeDuration: 0,
            }}
          />
        </MapLibreGL.RasterSource>
      ) : null}
    </>
  );
}