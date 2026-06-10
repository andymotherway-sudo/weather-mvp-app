import { NEXRAD_SITES, type NexradSite } from './nexradSites';
import { normalizeRadarSiteId } from './radarIem';

const STATION_RANGE_RINGS_MI = [25, 50, 100, 150];

export function isNexradSite(site: NexradSite) {
  return String(site.ownerType ?? '').toUpperCase() === 'NEXRAD';
}

export function getStationDisplayId(site?: NexradSite | null) {
  if (!site?.id) return '---';
  const id3 = normalizeRadarSiteId(site.id);
  return id3.length === 3 ? `K${id3}` : site.id;
}

export function getRadarAnchor(activePlace: any, currentCoords: { lat: number; lon: number } | null | undefined) {
  if (activePlace && Number.isFinite(activePlace.lat) && Number.isFinite(activePlace.lon)) {
    return { lat: Number(activePlace.lat), lon: Number(activePlace.lon) };
  }
  if (currentCoords && Number.isFinite(currentCoords.lat) && Number.isFinite(currentCoords.lon)) {
    return { lat: currentCoords.lat, lon: currentCoords.lon };
  }
  return { lat: 39.5, lon: -98.35 };
}

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestRadarSites(lat: number, lon: number, limit = 8) {
  return NEXRAD_SITES
    .filter(isNexradSite)
    .map((site) => {
      const dMi = haversineMiles(lat, lon, site.lat, site.lon);
      return { site, distanceMi: dMi };
    })
    .filter((item) => Number.isFinite(item.distanceMi))
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, limit);
}

function destinationPoint(lat: number, lon: number, bearingDegValue: number, distanceMi: number) {
  const radiusMi = 3958.7613;
  const delta = distanceMi / radiusMi;
  const theta = (bearingDegValue * Math.PI) / 180;
  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lon * Math.PI) / 180;

  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2);
  const lambda2 = lambda1 + Math.atan2(y, x);

  return [(lambda2 * 180) / Math.PI, (phi2 * 180) / Math.PI];
}

export function buildRadarStationGeoJson(site: NexradSite | null) {
  if (!site) return { type: 'FeatureCollection', features: [] };

  const features: any[] = [
    {
      type: 'Feature',
      properties: { kind: 'station', label: getStationDisplayId(site) },
      geometry: { type: 'Point', coordinates: [site.lon, site.lat] },
    },
  ];

  for (const radiusMi of STATION_RANGE_RINGS_MI) {
    const coords = Array.from({ length: 145 }, (_, index) =>
      destinationPoint(site.lat, site.lon, (index / 144) * 360, radiusMi),
    );
    features.push({
      type: 'Feature',
      properties: { kind: 'ring', radiusMi, label: `${radiusMi} mi` },
      geometry: { type: 'LineString', coordinates: coords },
    });
    features.push({
      type: 'Feature',
      properties: { kind: 'ring-label', radiusMi, label: `${radiusMi} mi` },
      geometry: { type: 'Point', coordinates: destinationPoint(site.lat, site.lon, 80, radiusMi) },
    });
  }

  return { type: 'FeatureCollection', features };
}
