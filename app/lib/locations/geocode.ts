// app/lib/locations/geocode.ts
export type GeocodeResult = {
  name: string;
  admin1?: string;
  country?: string;
  lat: number;
  lon: number;
  tz?: string;
};

type GeoResp = {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    admin1?: string;
    country?: string;
    timezone?: string;
  }>;
};

export async function geocodePlaces(query: string): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (!q) return [];

  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(q)}&count=10&language=en&format=json`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = (await res.json()) as GeoResp;
  const results = data.results ?? [];

  return results.map((r) => ({
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
    tz: r.timezone,
  }));
}
