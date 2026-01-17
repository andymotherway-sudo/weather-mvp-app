// app/lib/nautical/highSeasStatic.ts
//
// TEMP starter polygons so you can wire the UI + “zone under cursor” logic.
// Replace this FeatureCollection later with real Offshore (OZ) + High Seas (HZ) datasets.

export type ZoneKind = 'coastal' | 'offshore' | 'highseas';

export type StaticZoneFeatureProps = {
  id: string;
  name: string;
  wfo?: string;     // offshore/highseas often use OPC, but keep field for display
  kind: ZoneKind;
};

export type StaticZonesFC = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    properties: StaticZoneFeatureProps;
    geometry: {
      type: 'Polygon';
      coordinates: Array<Array<[number, number]>>; // [ [ [lon,lat], ... ] ]
    };
  }>;
};

// NOTE: Coordinates here are just demo blocks off the OR/CA coast.
// They let you validate rendering + “am I in a huge polygon?” logic immediately.
export const OFFSHORE_HIGHSEAS_ZONES: StaticZonesFC = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'OZ-PAC-DEMO-1',
      properties: {
        id: 'OZ-PAC-DEMO-1',
        name: 'Offshore Waters (Demo)',
        wfo: 'OPC',
        kind: 'offshore',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-131.0, 47.0],
            [-124.0, 47.0],
            [-124.0, 41.0],
            [-131.0, 41.0],
            [-131.0, 47.0],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'HZ-PAC-DEMO-1',
      properties: {
        id: 'HZ-PAC-DEMO-1',
        name: 'High Seas (Demo)',
        wfo: 'OPC',
        kind: 'highseas',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-150.0, 52.0],
            [-131.0, 52.0],
            [-131.0, 35.0],
            [-150.0, 35.0],
            [-150.0, 52.0],
          ],
        ],
      },
    },
  ],
};
