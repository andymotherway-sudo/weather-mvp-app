// app/lib/nautical/zonesArcgis.ts
import type { GeoJSONGeometry, LatLng, NauticalZone } from './zones';

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

// Signed area (lon/lat planar approximation). Sign indicates winding.
function signedAreaLonLat(ring: number[][]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

// In many GIS conventions:
// - CCW outer rings => positive signed area
// - CW holes => negative signed area
function isOuterRing(ring: number[][]): boolean {
  return signedAreaLonLat(ring) > 0;
}

function normalizeClosedRing(ring: number[][]): number[][] {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

/**
 * Convert ArcGIS polygon rings into GeoJSON Polygon or MultiPolygon.
 * - If exactly one outer ring => Polygon (with optional holes).
 * - If multiple outer rings => MultiPolygon, each outer can have holes.
 */
function ringsToGeoJsonGeometry(rings: number[][][]): GeoJSONGeometry | null {
  const cleaned = rings
    .map((r) => normalizeClosedRing(r))
    .filter((r) => Array.isArray(r) && r.length >= 4); // closed ring min length

  if (!cleaned.length) return null;

  const outers: number[][][] = [];
  const holes: number[][][] = [];

  for (const r of cleaned) {
    if (isOuterRing(r)) outers.push(r);
    else holes.push(r);
  }

  // If we couldn't detect any outers (weird winding), fall back:
  // treat first ring as outer and rest as holes.
  if (outers.length === 0) {
    const [first, ...rest] = cleaned;
    return { type: 'Polygon', coordinates: [first, ...rest] };
  }

  if (outers.length === 1) {
    return { type: 'Polygon', coordinates: [outers[0], ...holes] };
  }

  // Multiple outers => MultiPolygon (best-effort hole assignment, preserve order)
  const polys: number[][][][] = [];
  let current: number[][][] | null = null;

  for (const r of cleaned) {
    if (isOuterRing(r)) {
      if (current) polys.push([current[0], ...current.slice(1)] as any);
      current = [r];
    } else {
      if (!current) {
        current = [outers[0], r];
      } else {
        current.push(r);
      }
    }
  }
  if (current) polys.push([current[0], ...current.slice(1)] as any);

  return {
    type: 'MultiPolygon',
    coordinates: polys.map((poly) => poly),
  };
}

/* =============================================================================
 * ArcGIS services vary their attribute names, so extraction accepts known aliases.
 * ============================================================================= */

function asString(v: unknown): string | null {
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? s : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

const ZONE_ID_RE = /^[A-Z]{3}\d{3}$/; // e.g. PZZ450

function pickFirst(attrs: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = asString(attrs[k]);
    if (v) return v;
  }
  return null;
}

function pickZoneId(attrs: Record<string, unknown>): string | null {
  // Common field names first
  const direct = pickFirst(attrs, [
    'id',
    'ID',
    'zone',
    'ZONE',
    'zone_id',
    'ZONE_ID',
    'zoneid',
    'ZONEID',
    'mzone',
    'MZONE',
    'marine_zone',
    'MARINE_ZONE',
    'product_id',
    'PRODUCT_ID',
    'prod_id',
    'PROD_ID',
  ]);

  if (direct && ZONE_ID_RE.test(direct)) return direct;

  // Brute force scan: find *any* attribute value that looks like PZZ450
  for (const v of Object.values(attrs)) {
    const s = asString(v);
    if (s && ZONE_ID_RE.test(s)) return s;
  }

  return null;
}

function pickWfo(attrs: Record<string, unknown>): string | null {
  const direct = pickFirst(attrs, ['wfo', 'WFO', 'cwa', 'CWA', 'office', 'OFFICE']);
  if (direct && /^[A-Z]{3,4}$/.test(direct)) return direct;
  return null;
}

function pickName(attrs: Record<string, unknown>): string | null {
  const direct = pickFirst(attrs, ['name', 'NAME', 'zonename', 'ZONENAME', 'label', 'LABEL', 'Name', 'Label']);
  if (direct) return direct;

  // fallback: first sentence-like string
  for (const v of Object.values(attrs)) {
    const s = asString(v);
    if (s && s.length >= 8 && /[a-z]/i.test(s) && /\s/.test(s)) return s;
  }
  return null;
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
}, opts?: { signal?: AbortSignal }): Promise<NauticalZone[]> {
  const service =
    'https://mapservices.weather.noaa.gov/static/rest/services/nws_reference_maps/nws_reference_map/MapServer/5/query';

  const geometry = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;

  // Keeping your explicit URL build (fine)
  const url =
    service +
    '?f=pjson' +
    '&where=1%3D1' +
    `&geometry=${encodeURIComponent(geometry)}` +
    '&geometryType=esriGeometryEnvelope' +
    '&inSR=4326' +
    '&outSR=4326' +
    '&spatialRel=esriSpatialRelIntersects' +
    '&outFields=*' +
    '&returnGeometry=true' +
    '&maxAllowableOffset=0.02' +
    '&resultRecordCount=200';

  const res = await fetch(url, { signal: opts?.signal });
  const text = await res.text();

  if (!text.trim().startsWith('{')) {
    throw new Error(`ArcGIS returned non-JSON: ${text.trim().slice(0, 120)}`);
  }

  const json: ArcGISQueryResponse = JSON.parse(text);
  const feats = Array.isArray(json.features) ? json.features : [];

  const zones: NauticalZone[] = [];

  for (const f of feats) {
    const rings = f.geometry?.rings;
    if (!rings || !rings.length) continue;

    const geom = ringsToGeoJsonGeometry(rings);
    if (!geom) continue;

    // Keep an outer ring for centroid + compatibility
    const outerRing =
      geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates?.[0]?.[0];

    if (!outerRing || outerRing.length < 4) continue;

    const polygon = ringToLatLng(outerRing);

    const attrs = (f.attributes ?? {}) as Record<string, unknown>;    // Require a real zone id so map taps can open the correct forecast.
    const zoneId = pickZoneId(attrs);
    if (!zoneId) continue;

    const name = pickName(attrs) ?? 'Marine Zone';
    const wfo = pickWfo(attrs) ?? (asString(attrs.cwa) ?? asString(attrs.CWA)) ?? 'NWS';

    zones.push({
      id: zoneId,
      name,
      wfo,
      type: 'coastal',
      centroid: centroidApprox(polygon),
      polygon, // react-native-maps compatibility / outer ring
      geometry: geom, // MapLibre-ready (Polygon/MultiPolygon)
    });
  }

  return zones;
}
