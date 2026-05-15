import bortleGrid from "./bortle-grid.json";

type BortleGridFile = {
  version: string;
  stepDeg: number;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  rows: number;
  cols: number;
  bortle: number[];
};

const GRID = bortleGrid as BortleGridFile;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function bortleLabel(v: number | null) {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  if (v <= 1) return "Excellent dark sky";
  if (v <= 2) return "Truly dark sky";
  if (v <= 3) return "Rural dark sky";
  if (v <= 4) return "Rural / transition sky";
  if (v <= 5) return "Suburban transition sky";
  if (v <= 6) return "Bright suburban sky";
  if (v <= 7) return "City / bright suburban sky";
  if (v <= 8) return "City sky";
  return "Inner city sky";
}

function bortleToTypicalMpsas(v: number | null) {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  if (v <= 1) return 21.95;
  if (v <= 2) return 21.85;
  if (v <= 3) return 21.65;
  if (v <= 4) return 21.25;
  if (v <= 5) return 20.35;
  if (v <= 6) return 19.55;
  if (v <= 7) return 18.75;
  if (v <= 8) return 18.15;
  return 17.45;
}

function mpsasToMilliCandelaPerSquareMeter(mpsas: number | null) {
  if (mpsas == null || !Number.isFinite(mpsas)) return null;
  // Standard SQM/MPSAS luminance conversion used by light-pollution map tools.
  return 108000000 * Math.pow(10, -0.4 * mpsas);
}

function indexFor(lat: number, lon: number, grid: BortleGridFile) {
  const row = Math.round((lat - grid.latMin) / grid.stepDeg);
  const col = Math.round((lon - grid.lonMin) / grid.stepDeg);

  if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) {
    return -1;
  }

  return row * grid.cols + col;
}

export function lookupBortle(lat: number, lon: number) {
  const safeLat = clamp(lat, GRID.latMin, GRID.latMax);
  const safeLon = clamp(lon, GRID.lonMin, GRID.lonMax);

  const idx = indexFor(safeLat, safeLon, GRID);
  const raw = idx >= 0 ? GRID.bortle[idx] : 0;
  const bortleClass = raw > 0 ? raw : null;
  const typicalMpsas = bortleToTypicalMpsas(bortleClass);

  return {
    source: `${GRID.version}; skyBrightness derived from typical Bortle SQM midpoint`,
    elevationM: null,
    bortleClass,
    bortleLabel: bortleLabel(bortleClass),
    skyBrightness: mpsasToMilliCandelaPerSquareMeter(typicalMpsas),
  };
}
