// scripts/build-nexrad-sites.mjs
import fs from "node:fs";
import path from "node:path";

const SRC =
  "https://www.ncei.noaa.gov/access/homr/file/nexrad-stations.txt";

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseLine(line) {
  // Format appears whitespace-delimited with a header:
  // NCDCID ICAO WBAN NAME COUNTRY ST COUNTY LAT LON ELEV UTC STNTYPE ...
  // Example from NCEI shows:
  // 30001795 KABX 03019 ALBUQUERQUE UNITED STATES NM BERNALILLO 35.149722 -106.82388 5951 -7 NEXRAD
  // We'll parse from the end backward for numeric fields, then re-assemble NAME/COUNTRY which can have spaces.

  const parts = line.trim().split(/\s+/);
  if (parts.length < 12) return null;
  if (parts[0] === "NCDCID") return null; // header

  // Take fixed tail fields:
  const stntype = parts.at(-1);              // e.g. NEXRAD
  const utc = toNumber(parts.at(-2));        // e.g. -7
  const elev = toNumber(parts.at(-3));       // feet
  const lon = toNumber(parts.at(-4));
  const lat = toNumber(parts.at(-5));
  const county = parts.at(-6);
  const state = parts.at(-7);

  const ncdcId = parts[0];
  const icao = parts[1];
  const wban = parts[2];

  // Remaining middle fields are: NAME (1+ tokens) + COUNTRY (1+ tokens)
  // We know COUNTRY is often "UNITED STATES" (two tokens) but can vary (GUAM etc still US)
  // We'll do a pragmatic split: assume COUNTRY is last 2 tokens before state when it equals "UNITED STATES",
  // otherwise last 1 token before state.
  const middle = parts.slice(3, -7); // from NAME start up to before STATE
  if (middle.length < 2) return null;

  let country = null;
  let nameTokens = middle;

  // Best-effort country parsing
  if (middle.length >= 2 && middle.slice(-2).join(" ") === "UNITED STATES") {
    country = "UNITED STATES";
    nameTokens = middle.slice(0, -2);
  } else {
    country = middle.at(-1);
    nameTokens = middle.slice(0, -1);
  }

  const name = nameTokens.join(" ");

  if (!icao || lat == null || lon == null) return null;

  return {
    id: icao,
    name,
    state,
    county,
    lat,
    lon,
    elevFt: elev,
    utcOffsetHours: utc,
    country,
    ownerType: stntype,
    // optional raw ids if you ever want them:
    ncdcId,
    wban,
  };
}

async function main() {
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`Failed to fetch ${SRC}: ${res.status}`);
  const text = await res.text();

  const sites = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseLine)
    .filter(Boolean);

  // Deduplicate by id
  const map = new Map();
  for (const s of sites) map.set(s.id, s);

  const out = [...map.values()].sort((a, b) => a.id.localeCompare(b.id));

  const outPath = path.join(process.cwd(), "app/lib/maps/nexradSites.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`Wrote ${out.length} sites to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
