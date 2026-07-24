import rawNexradSites from "../../app/lib/maps/nexradSites.json";

type RawRadarSite = {
  id?: string;
  lat?: number;
  lon?: number;
  ownerType?: string | null;
};

export type RadarBBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const MILES_PER_LAT_DEGREE = 69;

const LOCAL_BBOX_OVERRIDES: Record<string, RadarBBox> = {
  IWA: { west: -112.45, south: 33.12, east: -111.45, north: 33.72 },
};

const NEXRAD_SITE_COORDS = new Map<string, { lat: number; lon: number }>();

for (const site of rawNexradSites as RawRadarSite[]) {
  const rawId = String(site?.id ?? "").trim().toUpperCase();
  const lat = Number(site?.lat);
  const lon = Number(site?.lon);
  const ownerType = String(site?.ownerType ?? "").trim().toUpperCase();
  if (!rawId || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  if (ownerType && ownerType !== "NEXRAD") continue;

  const id3 = rawId.length === 4 && rawId.startsWith("K") ? rawId.slice(1) : rawId;
  if (!/^[A-Z0-9]{3}$/.test(id3)) continue;
  NEXRAD_SITE_COORDS.set(id3, { lat, lon });
}

function clampLatitude(lat: number) {
  return Math.max(-85, Math.min(85, lat));
}

function clampLongitude(lon: number) {
  return Math.max(-180, Math.min(180, lon));
}

function radiusMilesToLongitudeDegrees(lat: number, radiusMi: number) {
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return radiusMi / (MILES_PER_LAT_DEGREE * cosLat);
}

export function getOwnedRadarLocalSiteBBox(siteId: string, radiusMi: number): RadarBBox | null {
  const normalized = String(siteId || "").trim().toUpperCase().replace(/^K/, "");
  if (!normalized) return null;

  const override = LOCAL_BBOX_OVERRIDES[normalized];
  if (override) return override;

  const site = NEXRAD_SITE_COORDS.get(normalized);
  if (!site) return null;

  const latDelta = radiusMi / MILES_PER_LAT_DEGREE;
  const lonDelta = radiusMilesToLongitudeDegrees(site.lat, radiusMi);

  return {
    west: clampLongitude(site.lon - lonDelta),
    south: clampLatitude(site.lat - latDelta),
    east: clampLongitude(site.lon + lonDelta),
    north: clampLatitude(site.lat + latDelta),
  };
}

function lonToTileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * (2 ** z));
}

function latToTileY(lat: number, z: number) {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * (2 ** z));
}

export function estimateOwnedRadarLocalSiteTilesPerFrame(bbox: RadarBBox, minZoom: number, maxZoom: number) {
  let totalTiles = 0;
  const zoomBreakdown: Array<{ zoom: number; tileCount: number }> = [];

  for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
    const maxIndex = (2 ** zoom) - 1;
    const minX = Math.max(0, Math.min(maxIndex, lonToTileX(bbox.west, zoom)));
    const maxX = Math.max(0, Math.min(maxIndex, lonToTileX(bbox.east, zoom)));
    const minY = Math.max(0, Math.min(maxIndex, latToTileY(bbox.north, zoom)));
    const maxY = Math.max(0, Math.min(maxIndex, latToTileY(bbox.south, zoom)));
    const tileCount = Math.max(0, (maxX - minX + 1) * (maxY - minY + 1));
    totalTiles += tileCount;
    zoomBreakdown.push({ zoom, tileCount });
  }

  return { totalTiles, zoomBreakdown };
}
