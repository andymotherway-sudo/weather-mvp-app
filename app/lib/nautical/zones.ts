// app/lib/nautical/zones.ts

export interface LatLng {
  latitude: number;
  longitude: number;
}

export type NauticalZoneType = 'coastal' | 'offshore' | 'highSeas';

export interface NauticalZone {
  id: string;        // e.g. "PZZ350"
  name: string;
  wfo: string;       // forecast office (CWA)
  type: NauticalZoneType;
  centroid: LatLng;
  polygon: LatLng[]; // outer ring (renderable by react-native-maps)
}

type GeoJSONPolygon = {
  type: 'Polygon';
  coordinates: number[][][]; // [ring][point][lon,lat]
};

type GeoJSONMultiPolygon = {
  type: 'MultiPolygon';
  coordinates: number[][][][]; // [poly][ring][point][lon,lat]
};

type GeoJSONGeometry = GeoJSONPolygon | GeoJSONMultiPolygon;

function toLatLngRing(ring: number[][]): LatLng[] {
  return ring.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
}

function getOuterRing(geom: GeoJSONGeometry): LatLng[] | null {
  if (geom.type === 'Polygon') {
    const outer = geom.coordinates?.[0];
    return outer?.length ? toLatLngRing(outer) : null;
  }
  if (geom.type === 'MultiPolygon') {
    const outer = geom.coordinates?.[0]?.[0];
    return outer?.length ? toLatLngRing(outer) : null;
  }
  return null;
}

function computeCentroidApprox(points: LatLng[]): LatLng {
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

async function fetchAllPages(url: string): Promise<any[]> {
  const out: any[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const res: Response = await fetch(nextUrl, {
      headers: {
        // NWS asks for a User-Agent with contact info
        'User-Agent': 'OmniWx/1.0 (contact: youremail@example.com)',
        Accept: 'application/geo+json, application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NWS zones fetch failed (${res.status}): ${text}`);
    }

    const json: {
      features?: any[];
      pagination?: { next?: string | null };
    } = await res.json();

    const features: any[] = Array.isArray(json.features) ? json.features : [];
    out.push(...features);

    // Try JSON pagination first
    const nextFromBody: string | null =
      (json.pagination?.next as string | null | undefined) ?? null;

    if (nextFromBody) {
      nextUrl = nextFromBody;
      continue;
    }

    // Then try Link header
    const link: string | null = res.headers.get('link') ?? res.headers.get('Link');
    const match: RegExpMatchArray | null =
      link ? link.match(/<([^>]+)>;\s*rel="next"/i) : null;

    nextUrl = match?.[1] ?? null;
  }

  return out;
}

export async function fetchMarineZones(): Promise<NauticalZone[]> {
  const url = 'https://api.weather.gov/zones/marine';
  const features: any[] = await fetchAllPages(url);

  const zones: NauticalZone[] = [];

  for (const f of features) {
    const id: string | undefined = f?.properties?.id;
    const name: string | undefined = f?.properties?.name;
    const wfo: string | undefined = f?.properties?.cwa;
    const geom: GeoJSONGeometry | undefined = f?.geometry;

    if (!id || !name || !wfo || !geom) continue;

    const ring = getOuterRing(geom);
    if (!ring || ring.length < 3) continue;

    zones.push({
      id,
      name,
      wfo,
      type: 'coastal', // refine later if desired
      centroid: computeCentroidApprox(ring),
      polygon: ring,
    });
  }

  return zones;
}
