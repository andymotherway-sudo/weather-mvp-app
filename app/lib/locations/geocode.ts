// app/lib/locations/geocode.ts
export type GeocodeResult = {
  name: string;
  admin1?: string;
  country?: string;
  lat: number;
  lon: number;
  tz?: string;
};

type GeoApiResult = {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  timezone?: string;
  population?: number;
};

type GeoResp = {
  results?: GeoApiResult[];
};

function normalizeText(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function hasValue(value?: string): boolean {
  return !!value && value.trim().length > 0;
}

function dedupeKey(r: GeoApiResult): string {
  return [
    normalizeText(r.name),
    normalizeText(r.admin1),
    normalizeText(r.country),
    r.latitude.toFixed(4),
    r.longitude.toFixed(4),
  ].join("|");
}

function scoreResult(r: GeoApiResult, query: string): number {
  const q = normalizeText(query);
  const name = normalizeText(r.name);
  const admin1 = normalizeText(r.admin1);
  const country = normalizeText(r.country);
  const population = r.population ?? 0;

  let score = 0;

  // Strongly prefer exact city-name matches.
  if (name === q) score += 1000;
  else if (name.startsWith(q)) score += 300;
  else if (name.includes(q)) score += 100;

  // Slight boost if query matches admin/country too.
  if (admin1 === q) score += 40;
  if (country === q) score += 20;

  // Prefer more complete, user-friendly places.
  if (hasValue(r.admin1)) score += 20;
  if (hasValue(r.country)) score += 20;
  if (hasValue(r.timezone)) score += 10;

  // Prefer major population centers without letting this dominate exact match.
  // Log-ish bucketing avoids giant cities overwhelming everything too much.
  if (population >= 10000000) score += 120;
  else if (population >= 5000000) score += 100;
  else if (population >= 1000000) score += 80;
  else if (population >= 500000) score += 60;
  else if (population >= 100000) score += 40;
  else if (population >= 10000) score += 20;
  else if (population > 0) score += 5;

  return score;
}

export async function geocodePlaces(query: string): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (!q) return [];

  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(q)}&count=20&language=en&format=json`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = (await res.json()) as GeoResp;
  const results = data.results ?? [];

  const unique = results.filter((r, index, arr) => {
    const key = dedupeKey(r);
    return arr.findIndex((x) => dedupeKey(x) === key) === index;
  });

  const ranked = unique.sort((a, b) => {
    const scoreDiff = scoreResult(b, q) - scoreResult(a, q);
    if (scoreDiff !== 0) return scoreDiff;

    // Stable tie-breakers
    const popDiff = (b.population ?? 0) - (a.population ?? 0);
    if (popDiff !== 0) return popDiff;

    const countryDiff = normalizeText(a.country).localeCompare(normalizeText(b.country));
    if (countryDiff !== 0) return countryDiff;

    const adminDiff = normalizeText(a.admin1).localeCompare(normalizeText(b.admin1));
    if (adminDiff !== 0) return adminDiff;

    return normalizeText(a.name).localeCompare(normalizeText(b.name));
  });

  return ranked.map((r) => ({
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
    tz: r.timezone,
  }));
}