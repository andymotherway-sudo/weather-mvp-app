// app/lib/maps/nexradSites.ts
import raw from "./nexradSites.json";

export type NexradSite = {
  id: string;
  name: string;
  state: string;
  county: string;
  lat: number;
  lon: number;
  elevFt: number | null;
  utcOffsetHours: number | null;
  country: string | null;
  ownerType: string | null; // "NEXRAD" | "TDWR" etc
  ncdcId?: string;
  wban?: string;
};

function isTwoLetter(s: string) {
  return /^[A-Z]{2}$/.test(s);
}

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  return s;
}

function cleanNum(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanSite(s: any): NexradSite | null {
  const id = cleanStr(s.id).toUpperCase();
  if (!id || id.length < 3) return null;

  const lat = Number(s.lat);
  const lon = Number(s.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  let name = cleanStr(s.name).toUpperCase();
  let state = cleanStr(s.state).toUpperCase();
  let county = cleanStr(s.county).toUpperCase();
  let country = cleanStr(s.country).toUpperCase() || null;

  // Fix common “country contains state” issue (KARX, KDLH etc.)
  if (country && country !== "UNITED STATES" && isTwoLetter(country) && (!state || !isTwoLetter(state))) {
    state = country;
    country = "UNITED STATES";
  }

  // Some rows have state fragments like "ST.", "DONA", "SANTA" → keep but don’t trust
  // If you want: null them out when not 2-letter
  if (state && !isTwoLetter(state)) {
    // keep original in county/name; but make state empty to avoid misleading filters
    state = "";
  }

  // TDWR rows sometimes have blank name — keep id at least
  if (!name) name = id;

  const ownerType = cleanStr(s.ownerType).toUpperCase() || null;

  return {
    id,
    name,
    state,
    county,
    lat,
    lon,
    elevFt: cleanNum(s.elevFt),
    utcOffsetHours: cleanNum(s.utcOffsetHours),
    country: country ? country : null,
    ownerType,
    ncdcId: s.ncdcId ? cleanStr(s.ncdcId) : undefined,
    wban: s.wban ? cleanStr(s.wban) : undefined,
  };
}

export const NEXRAD_SITES: NexradSite[] = (raw as any[])
  .map(cleanSite)
  .filter((x): x is NexradSite => !!x);