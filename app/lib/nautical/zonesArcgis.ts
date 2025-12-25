// app/lib/nautical/zonesArcgis.ts
import type { LatLng, NauticalZone } from './zones';

type ArcGISFeature = {
  attributes?: Record<string, unknown>;
  geometry?: { rings?: number[][][] }; // [ring][[lon,lat]]
};

type ArcGISQueryResponse = {
  features?: ArcGISFeature[];
};

function ringToLatLng(ring: number[][]): LatLng[] {
  return ring.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
}

function centroidApprox(points: LatLng[]): LatLng {
  const n = points.length || 1;
  const sum = points.reduce(
    (acc, p) => ({
      latitude: acc.latitude + p.latitude,
      longitude: acc.longitude + p.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return { latitude: sum.latitude / n, longitude: sum.longitude / n };
}

/**
 * Fetch marine zones intersecting a bbox using NOAA/NWS ArcGIS.
 * bbox is lon/lat: west,south,east,north
 */
export async function fetchMarineZonesByBbox(bbox: {
  west: number;
  south: number;
  east: number;
  north: number;
}): Promise<NauticalZone[]> {
  const service =
    'https://mapservices.weather.noaa.gov/static/rest/services/nws_reference_maps/nws_reference_map/MapServer/5/query';



  const geometry = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;

  const params = new URLSearchParams({
    f: 'pjson',
    where: '1=1',
    geometry,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    // reduces payload on many ArcGIS servers; harmless if ignored
    maxAllowableOffset: '0.02',
    resultRecordCount: '200',
  });

  const url =
  service +
  '?f=pjson' +
  '&where=1%3D1' +
  `&geometry=${encodeURIComponent(geometry)}` +
  '&geometryType=esriGeometryEnvelope' +
  '&inSR=4326' +
  '&outSR=4326' +
  '&spatialRel=esriSpatialRelIntersects' +
  '&outFields=*&returnGeometry=true' +
  '&maxAllowableOffset=0.02' +
  '&resultRecordCount=200';

  const res = await fetch(url);
  const text = await res.text();

  if (!text.trim().startsWith('{')) {
    // Show first chunk so we can see if it's HTML, an error message, redirect, etc.
    throw new Error(`ArcGIS returned non-JSON: ${text.trim().slice(0, 120)}`);
  }

  const json: ArcGISQueryResponse = JSON.parse(text);


  const feats = Array.isArray(json.features) ? json.features : [];

  const zones: NauticalZone[] = [];

  for (const f of feats) {
    const rings = f.geometry?.rings;
    const outer = rings?.[0];
    if (!outer || outer.length < 3) continue;

    const polygon = ringToLatLng(outer);
    const a = f.attributes ?? {};

    const id =
      (a.id as string | undefined) ??
      (a.ID as string | undefined) ??
      (a.zone as string | undefined) ??
      (a.ZONE as string | undefined) ??
      'UNKNOWN';

    const name =
      (a.name as string | undefined) ??
      (a.NAME as string | undefined) ??
      'Marine Zone';

    const wfo =
      (a.cwa as string | undefined) ??
      (a.CWA as string | undefined) ??
      'NWS';

    zones.push({
      id,
      name,
      wfo,
      type: 'coastal',
      centroid: centroidApprox(polygon),
      polygon,
    });
  }

  return zones;
}
