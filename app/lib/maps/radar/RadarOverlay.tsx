// app/lib/maps/radar/RadarOverlay.tsx
import MapLibreGL from '@maplibre/maplibre-react-native';
import React from 'react';

export function RadarOverlay(props: {
  templateA: string;
  templateB: string;
  opacityA: number;
  opacityB: number;
  idPrefix?: string;
}) {
  const { templateA, templateB, opacityA, opacityB, idPrefix = 'radar' } = props;

  return (
    <>
      <MapLibreGL.RasterSource
        id={`${idPrefix}-source-a`}
        tileUrlTemplates={[templateA]}
        tileSize={256}
      >
        <MapLibreGL.RasterLayer
          id={`${idPrefix}-layer-a`}
          sourceID={`${idPrefix}-source-a`}
          style={{ rasterOpacity: opacityA }}
        />
      </MapLibreGL.RasterSource>

      <MapLibreGL.RasterSource
        id={`${idPrefix}-source-b`}
        tileUrlTemplates={[templateB]}
        tileSize={256}
      >
        <MapLibreGL.RasterLayer
          id={`${idPrefix}-layer-b`}
          sourceID={`${idPrefix}-source-b`}
          style={{ rasterOpacity: opacityB }}
        />
      </MapLibreGL.RasterSource>
    </>
  );
}
