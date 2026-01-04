// app/lib/maps/radar/RadarOverlay.tsx
import MapLibreGL from '@maplibre/maplibre-react-native';
import React, { useMemo } from 'react';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * RadarOverlay (drop-in, backwards compatible)
 *
 * Adds:
 * - optional maxTileZoomA/maxTileZoomB + zoom for smart resampling
 * - optional playing to suppress crossfade during playback (cuts requests a lot)
 * - only mounts Source B when actually needed (opacity > ~0)
 */
export function RadarOverlay(props: {
  templateA: string;
  templateB: string;
  opacityA: number;
  opacityB: number;
  idPrefix?: string;

  // NEW (all optional, safe defaults)
  zoom?: number; // current map zoom
  playing?: boolean; // whether timeline is playing
  maxTileZoomA?: number; // provider max tile zoom for A
  maxTileZoomB?: number; // provider max tile zoom for B
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

    zoom = 0,
    playing = false,
    maxTileZoomA = 8,
    maxTileZoomB = 8,
    minTileZoomA = 0,
    minTileZoomB = 0,
    allowCrossfadeWhilePlaying = false,
  } = props;

  const aOpacity = clamp01(opacityA);

  // When playing: optionally suppress crossfade to reduce tile pressure.
  const shouldRenderB =
    templateB &&
    templateB !== templateA &&
    clamp01(opacityB) > 0.01 &&
    (!playing || allowCrossfadeWhilePlaying);

  const bOpacity = shouldRenderB ? clamp01(opacityB) : 0;

  // Smart resampling:
  // - if we're past the provider's native max tile zoom, we're upscaling -> use linear (smooth)
  // - otherwise at high zoom (within native) you can use nearest to keep it crisp
  const resamplingA: 'linear' | 'nearest' =
    zoom > maxTileZoomA ? 'linear' : zoom >= 8 ? 'nearest' : 'linear';

  const resamplingB: 'linear' | 'nearest' =
    zoom > maxTileZoomB ? 'linear' : zoom >= 8 ? 'nearest' : 'linear';

  // Keep IDs stable
  const sourceAId = `${idPrefix}-source-a`;
  const layerAId = `${idPrefix}-layer-a`;
  const sourceBId = `${idPrefix}-source-b`;
  const layerBId = `${idPrefix}-layer-b`;

  // MapLibre RN supports minZoomLevel/maxZoomLevel on sources on most builds.
  // If your build ignores these, it still won’t break anything.
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
            rasterResampling: resamplingA,
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
              rasterResampling: resamplingB,
            }}
          />
        </MapLibreGL.RasterSource>
      ) : null}
    </>
  );
}
