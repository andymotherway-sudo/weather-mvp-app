/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

/**
 * Generates src/landPoints.generated.ts
 * Robust against:
 * - running from the wrong CWD
 * - missing src/ dir
 * - ESM/CJS quirks with xlsx
 *
 * Key behaviors:
 * - Pulls: Top 200 US airports (FAA CY23), Top 200 US cities (Wikidata), ALL US state capitals (Wikidata), curated global notables (hardcoded).
 * - De-dupes by *canonical place name* so you don't get duplicates like:
 *   "Honolulu (HNL)" + "Honolulu (Capital)" + "Honolulu, HI"
 * - Priority when canonical name collides: airport > city > capital > notable
 * - Still de-dupes by id as a safety net.
 */

const TOP_CITY_COUNT = 200;
const TOP_AIRPORT_COUNT = 200;
const POINTS_VERSION = "v3-airports200-cities200-capitals-global-notables";

/** FAA CY23 enplanements Excel */
const FAA_CY23_ENPLANEMENTS_XLSX =
  "https://www.faa.gov/sites/faa.gov/files/2024-10/cy23-commercial-service-enplanements.xlsx";

/** Airport codes dataset w/ iata_code + coords */
const AIRPORT_CODES_CSV =
  "https://raw.githubusercontent.com/datasets/airport-codes/master/data/airport-codes.csv";

const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";

/**
 * Curated “interesting global extreme” locations
 * badge: Global
 * group: notable
 *
 * Notes:
 * - coords are intentionally “good enough” for Open-Meteo current sampling
 * - ids are stable strings; keep them stable once shipped
 */
const GLOBAL_NOTABLES = [
  // Heat / deserts
  { id: "gl-dallol", name: "Dallol, Ethiopia", lat: 14.242, lon: 40.3, badge: "Global", group: "notable" },
  { id: "gl-dasht-e-lut", name: "Dasht-e Lut (Gandom Beryan), Iran", lat: 30.6, lon: 59.25, badge: "Global", group: "notable" },
  { id: "gl-tamanrasset", name: "Tamanrasset, Algeria (Sahara)", lat: 22.785, lon: 5.5228, badge: "Global", group: "notable" },
  { id: "gl-kuwait-city", name: "Kuwait City, Kuwait", lat: 29.375, lon: 47.98, badge: "Global", group: "notable" },
  { id: "gl-basra", name: "Basra, Iraq", lat: 30.508, lon: 47.78, badge: "Global", group: "notable" },
  { id: "gl-jacobabad", name: "Jacobabad, Pakistan", lat: 28.281, lon: 68.438, badge: "Global", group: "notable" },
  { id: "gl-riyadh", name: "Riyadh, Saudi Arabia", lat: 24.713, lon: 46.675, badge: "Global", group: "notable" },
  { id: "gl-san-pedro-atacama", name: "Atacama (San Pedro), Chile", lat: -22.911, lon: -68.202, badge: "Global", group: "notable" },

  // Cold / polar / Siberia
  { id: "gl-vostok", name: "Vostok Station, Antarctica", lat: -78.464, lon: 106.833, badge: "Global", group: "notable" },
  { id: "gl-south-pole", name: "South Pole (Amundsen–Scott Station)", lat: -90.0, lon: 0.0, badge: "Global", group: "notable" },
  { id: "gl-dome-a", name: "Dome A, Antarctica", lat: -80.367, lon: 77.35, badge: "Global", group: "notable" },
  { id: "gl-alert", name: "Alert, Nunavut, Canada", lat: 82.5018, lon: -62.3481, badge: "Global", group: "notable" },
  { id: "gl-eureka", name: "Eureka, Nunavut, Canada", lat: 79.989, lon: -85.939, badge: "Global", group: "notable" },
  { id: "gl-oymyakon", name: "Oymyakon, Russia", lat: 63.464, lon: 142.773, badge: "Global", group: "notable" },
  { id: "gl-verkhoyansk", name: "Verkhoyansk, Russia", lat: 67.55, lon: 133.39, badge: "Global", group: "notable" },
  { id: "gl-norilsk", name: "Norilsk, Russia", lat: 69.355, lon: 88.19, badge: "Global", group: "notable" },
  { id: "gl-longyearbyen", name: "Longyearbyen (Svalbard), Norway", lat: 78.223, lon: 15.646, badge: "Global", group: "notable" },

  // Wettest / monsoon
  { id: "gl-mawsynram", name: "Mawsynram, India", lat: 25.298, lon: 91.582, badge: "Global", group: "notable" },
  { id: "gl-cherrapunji", name: "Cherrapunji, India", lat: 25.277, lon: 91.732, badge: "Global", group: "notable" },
  { id: "gl-debundscha", name: "Debundscha, Cameroon", lat: 4.087, lon: 9.29, badge: "Global", group: "notable" },
  { id: "gl-quibdo", name: "Quibdó, Colombia", lat: 5.694, lon: -76.658, badge: "Global", group: "notable" },

  // Wind / “angry weather”
  { id: "gl-wellington", name: "Wellington, New Zealand", lat: -41.286, lon: 174.776, badge: "Global", group: "notable" },
  { id: "gl-punta-arenas", name: "Punta Arenas, Chile", lat: -53.163, lon: -70.917, badge: "Global", group: "notable" },
  { id: "gl-cape-denison", name: "Cape Denison (Commonwealth Bay), Antarctica", lat: -67.0, lon: 142.65, badge: "Global", group: "notable" },
  { id: "gl-tristan-da-cunha", name: "Tristan da Cunha", lat: -37.105, lon: -12.277, badge: "Global", group: "notable" },

  // Mountains / thin air
  { id: "gl-everest-region", name: "Everest region, Nepal", lat: 28.002, lon: 86.852, badge: "Global", group: "notable" },
  { id: "gl-aconcagua-region", name: "Aconcagua region, Argentina", lat: -32.653, lon: -70.011, badge: "Global", group: "notable" },
  { id: "gl-k2-region", name: "K2 region, Pakistan", lat: 35.881, lon: 76.513, badge: "Global", group: "notable" },

  // Cyclone / typhoon magnets
  { id: "gl-tacloban", name: "Tacloban, Philippines", lat: 11.244, lon: 125.004, badge: "Global", group: "notable" },
  { id: "gl-naha", name: "Okinawa (Naha), Japan", lat: 26.212, lon: 127.681, badge: "Global", group: "notable" },
  { id: "gl-darwin", name: "Darwin, Australia", lat: -12.463, lon: 130.845, badge: "Global", group: "notable" },

  // Volcanic / geothermal weirdness
  { id: "gl-reykjavik", name: "Reykjavík, Iceland", lat: 64.1466, lon: -21.9426, badge: "Global", group: "notable" },
  { id: "gl-rotorua", name: "Rotorua, New Zealand", lat: -38.136, lon: 176.249, badge: "Global", group: "notable" },

  // Iconic extremes (UI-friendly)
  { id: "gl-ushuaia", name: "Ushuaia, Argentina", lat: -54.801, lon: -68.303, badge: "Global", group: "notable" },
  { id: "gl-tromso", name: "Tromsø, Norway", lat: 69.649, lon: 18.956, badge: "Global", group: "notable" },
  { id: "gl-nuuk", name: "Nuuk, Greenland", lat: 64.181, lon: -51.694, badge: "Global", group: "notable" },
  { id: "gl-ulaanbaatar", name: "Ulaanbaatar, Mongolia", lat: 47.886, lon: 106.905, badge: "Global", group: "notable" },
];

function projectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // scripts/ -> project root
  return path.resolve(__dirname, "..");
}

async function fetchText(url, { headers = {} } = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return await res.text();
}

async function fetchArrayBuffer(url, { headers = {} } = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return await res.arrayBuffer();
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsvSimple(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = cols[j] ?? "";
    rows.push(obj);
  }
  return rows;
}

function normalizeIata(x) {
  const s = String(x ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{3}$/.test(s) ? s : "";
}

function toId(prefix, key) {
  return `${prefix}-${String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function extractLatLonFromWktPoint(wkt) {
  const m = /Point\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(String(wkt ?? ""));
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/**
 * Canonicalize a display name so "Honolulu (HNL)", "Honolulu (Capital)", "Honolulu, HI"
 * all become the same key: "honolulu"
 */
function canonicalPlaceName(name) {
  const s = String(name ?? "").trim();

  // Remove "(...)" segments like "(HNL)" or "(Capital)"
  const noParens = s.replace(/\s*\([^)]*\)\s*/g, " ").trim();

  // Remove trailing ", ST" (e.g. ", HI")
  const noState = noParens.replace(/\s*,\s*[A-Z]{2}\s*$/g, "").trim();

  // Collapse spaces, lowercase
  return noState.replace(/\s+/g, " ").toLowerCase();
}

function priorityScore(p) {
  // Higher wins when canonical key collides
  if (p.group === "airport") return 400;
  if (p.group === "city") return 300;
  if (p.group === "capital") return 200;
  if (p.group === "notable") return 100;
  return 0;
}

async function sparql(query) {
  const url = new URL(WIKIDATA_SPARQL);
  url.searchParams.set("format", "json");
  url.searchParams.set("query", query);

  const res = await fetch(url.toString(), {
    headers: {
      // Wikidata is picky; a real UA helps avoid throttling
      "user-agent": "omniwx-api landPoints generator (andy)",
      accept: "application/sparql-results+json",
    },
  });
  if (!res.ok) throw new Error(`SPARQL failed ${res.status}`);
  return await res.json();
}

async function loadAirportCoordMap() {
  console.log("Downloading airport-codes.csv …");
  const csv = await fetchText(AIRPORT_CODES_CSV);
  const rows = parseCsvSimple(csv);

  const map = new Map();
  for (const r of rows) {
    const iata = normalizeIata(r.iata_code);
    if (!iata) continue;

    const lat = Number(r.latitude);
    const lon = Number(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const name = String(r.name || r.municipality || iata).trim();
    if (!map.has(iata)) map.set(iata, { lat, lon, name });
  }
  console.log(`Airport coord map: ${map.size.toLocaleString()} IATA codes`);
  return map;
}

async function loadTopAirportsByEnplanements(airportCoordMap) {
  console.log("Downloading FAA CY23 enplanements Excel …");
  const buf = await fetchArrayBuffer(FAA_CY23_ENPLANEMENTS_XLSX);
  const wb = XLSX.read(buf, { type: "array" });

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

  if (!json.length) throw new Error("FAA sheet appears empty.");

  const cols = Object.keys(json[0]);
  const colLoc = cols.find((c) => c.toLowerCase().includes("locid")) || "Locid";
  const colCity = cols.find((c) => c.toLowerCase() === "city") || "City";
  const colName = cols.find((c) => c.toLowerCase().includes("airport")) || "Airport Name";

  const colCy23 =
    cols.find((c) => c.toLowerCase().includes("cy 23") && c.toLowerCase().includes("enplan")) ||
    cols.find((c) => c.toLowerCase().includes("cy23") && c.toLowerCase().includes("enplan")) ||
    cols.find((c) => c.toLowerCase().includes("enplan") && c.toLowerCase().includes("23"));

  if (!colCy23) {
    throw new Error(`Could not find CY23 enplanements column. Columns: ${cols.join(", ")}`);
  }

  const candidates = [];
  for (const r of json) {
    const loc = normalizeIata(r[colLoc]);
    if (!loc) continue;

    const raw = String(r[colCy23] ?? "").replace(/,/g, "").trim();
    const enpl = Number(raw);
    if (!Number.isFinite(enpl) || enpl <= 0) continue;

    const coord = airportCoordMap.get(loc);
    if (!coord) continue;

    const city = String(r[colCity] ?? "").trim();
    const airportName = String(r[colName] ?? "").trim();

    // Display name: "City (IATA)" is best UX.
    const display = city
      ? `${city} (${loc})`
      : (airportName ? `${airportName} (${loc})` : `${coord.name} (${loc})`);

    candidates.push({
      id: `us-${loc.toLowerCase()}`,
      name: display,
      lat: coord.lat,
      lon: coord.lon,
      badge: "US",
      group: "airport",
      enplanements: enpl,
    });
  }

  candidates.sort((a, b) => b.enplanements - a.enplanements);
  const top = candidates.slice(0, TOP_AIRPORT_COUNT);

  console.log(`Top airports: ${top.length}`);
  return top.map(({ enplanements, ...p }) => p);
}

async function loadStateCapitals() {
  console.log("Querying Wikidata: US state capitals …");
  const q = `
SELECT ?capLabel ?coord WHERE {
  ?state wdt:P31 wd:Q35657 .
  ?state wdt:P36 ?cap .
  ?cap wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
  const data = await sparql(q);
  const rows = data?.results?.bindings ?? [];

  const out = [];
  for (const r of rows) {
    const name = r.capLabel?.value;
    const ll = extractLatLonFromWktPoint(r.coord?.value);
    if (!name || !ll) continue;
    out.push({
      id: toId("us-cap", name),
      name: `${name} (Capital)`,
      lat: ll.lat,
      lon: ll.lon,
      badge: "US",
      group: "capital",
    });
  }

  const seen = new Set();
  const dedup = out.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  console.log(`State capitals: ${dedup.length}`);
  return dedup;
}

async function loadTopCities() {
  console.log(`Querying Wikidata: top ${TOP_CITY_COUNT} US cities …`);
  const q = `
SELECT ?cityLabel ?coord ?pop WHERE {
  ?city wdt:P17 wd:Q30 .
  ?city wdt:P625 ?coord .
  ?city wdt:P1082 ?pop .
  ?city wdt:P31/wdt:P279* wd:Q515 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?pop)
LIMIT ${TOP_CITY_COUNT}
`;
  const data = await sparql(q);
  const rows = data?.results?.bindings ?? [];

  const out = [];
  for (const r of rows) {
    const name = r.cityLabel?.value;
    const ll = extractLatLonFromWktPoint(r.coord?.value);
    if (!name || !ll) continue;
    out.push({
      id: toId("us-city", name),
      name,
      lat: ll.lat,
      lon: ll.lon,
      badge: "US",
      group: "city",
    });
  }

  const seen = new Set();
  const dedup = out.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  console.log(`Top cities: ${dedup.length}`);
  return dedup;
}

function dedupeById(points) {
  const seen = new Set();
  return points.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

/**
 * De-dupe by canonical place name with priority:
 * airport > city > capital > notable
 */
function dedupeByCanonicalWithPriority(points) {
  const map = new Map(); // canonical -> point

  for (const p of points) {
    const key = canonicalPlaceName(p?.name);
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, p);
      continue;
    }
    if (priorityScore(p) > priorityScore(existing)) {
      map.set(key, p);
    }
  }

  return Array.from(map.values());
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available. Use Node 18+ (node -v).");
  }

  const root = projectRoot();
  const srcDir = path.join(root, "src");
  if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });

  console.log(`Project root: ${root}`);
  console.log(`Output dir:   ${srcDir}`);

  const airportCoordMap = await loadAirportCoordMap();

  // Wikidata can throttle if you parallelize; do sequential for reliability.
  const capitals = await loadStateCapitals();
  const cities = await loadTopCities();
  const airports = await loadTopAirportsByEnplanements(airportCoordMap);

  // Globals ✅
  const globals = dedupeById(GLOBAL_NOTABLES);

  // Start with everything; we'll canonical-dedupe next
  const allRaw = [...airports, ...cities, ...capitals, ...globals];

  // 1) canonical dedupe (prevents Honolulu duplicates)
  const canonicalDedup = dedupeByCanonicalWithPriority(allRaw);

  // 2) safety: id dedupe
  const points = dedupeById(canonicalDedup);

  const pointsUs = points.filter((p) => p.badge === "US").length;
  const pointsGlobal = points.filter((p) => p.badge === "Global").length;

  const outPath = path.join(srcDir, "landPoints.generated.ts");
  const content =
`// AUTO-GENERATED by scripts/generate-land-points.mjs
// Do not edit by hand.
// version: ${POINTS_VERSION}

export const LAND_POINTS_VERSION = ${JSON.stringify(POINTS_VERSION)} as const;

export type LandPoint = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  badge?: "US" | "Global";
  group?: "airport" | "capital" | "city" | "notable";
};

export const LAND_POINTS: LandPoint[] = ${JSON.stringify(points, null, 2)} as any;

export const LAND_POINTS_META = {
  pointsTotal: ${points.length},
  pointsUs: ${pointsUs},
  pointsGlobal: ${pointsGlobal},
} as const;
`;

  fs.writeFileSync(outPath, content, "utf8");
  console.log(`\n✅ Wrote ${outPath}`);
  console.log(`Total points: ${points.length} (US: ${pointsUs}, Global: ${pointsGlobal})`);
}

main().catch((e) => {
  console.error("\n❌ Generator failed:");
  console.error(e?.stack || e);
  process.exit(1);
});