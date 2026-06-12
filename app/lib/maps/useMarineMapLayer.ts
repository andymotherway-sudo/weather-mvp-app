import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Region } from '../../../components/maps/MapRenderer';
import { useAllBuoyDetails } from '../buoys/detailHooks';
import type { BuoyDetailData } from '../buoys/noaaTypes';
import type { GlobalMarineAreaSummary } from '../nautical/globalMarineManifest';
import { useGlobalMarineManifest } from '../nautical/useGlobalMarineManifest';
import { useMarineZonesByBbox } from '../nautical/useMarineZonesByBbox';
import type { NauticalZone } from '../nautical/zones';
import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

export type SelectedMarineFeature =
  | { kind: 'buoy'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'globalArea'; id: string }
  | null;

export type SelectedWaterStation = {
  id: string;
  siteId: string;
  siteNumber: string;
  name?: string | null;
  label?: string | null;
  primaryLabel?: string | null;
  primaryValue?: number | null;
  primaryUnit?: string | null;
  observedAt?: string | null;
  readings?: Array<{
    parameterCode?: string | null;
    label?: string | null;
    value?: number | null;
    unit?: string | null;
    time?: string | null;
  }>;
};

export type MarinePointConditions = {
  significantWaveHeightM: number | null;
  primarySwellPeriodS: number | null;
  primarySwellDirectionDeg: number | null;
  windSpeedKts: number | null;
  windGustKts: number | null;
  windDirectionDeg: number | null;
  seaSurfaceTempC: number | null;
  oceanCurrentKts?: number | null;
  oceanCurrentDirectionDeg?: number | null;
  seaLevelHeightMslM?: number | null;
  observedAt: string | null;
  modelSource: string | null;
};

function safeNum(value: any) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function regionToBbox(region: Region | null | undefined) {
  if (!region) return null;
  const latDelta = Number(region.latitudeDelta);
  const lonDelta = Number(region.longitudeDelta);
  const lat = Number(region.latitude);
  const lon = Number(region.longitude);
  if (![latDelta, lonDelta, lat, lon].every(Number.isFinite)) return null;

  return {
    west: lon - lonDelta / 2,
    south: lat - latDelta / 2,
    east: lon + lonDelta / 2,
    north: lat + latDelta / 2,
  };
}

function closeRingIfNeeded(coords: Array<[number, number]>) {
  if (coords.length < 3) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first?.[0] === last?.[0] && first?.[1] === last?.[1]) return coords;
  return [...coords, first];
}

function geometryBbox(geometry: any) {
  const coords: number[][] = [];

  const walk = (node: any) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      coords.push([node[0], node[1]]);
      return;
    }
    node.forEach(walk);
  };

  walk(geometry?.coordinates);
  if (!coords.length) return null;

  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  coords.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  return { minLon, maxLon, minLat, maxLat };
}

function getGeometryCenter(geometry: any): { lat: number; lon: number } | null {
  const bbox = geometryBbox(geometry);
  if (!bbox) return null;
  return {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    lon: (bbox.minLon + bbox.maxLon) / 2,
  };
}

function pointInRing(lon: number, lat: number, ring: any[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = safeNum(ring[i]?.[0]);
    const yi = safeNum(ring[i]?.[1]);
    const xj = safeNum(ring[j]?.[0]);
    const yj = safeNum(ring[j]?.[1]);
    if (xi == null || yi == null || xj == null || yj == null) continue;
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function geometryContainsPoint(geometry: any, lat: number, lon: number) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    const rings = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    if (!rings.length) return false;
    const inOuter = pointInRing(lon, lat, rings[0] ?? []);
    const inHole = rings.slice(1).some((ring: any[]) => pointInRing(lon, lat, ring));
    return inOuter && !inHole;
  }

  if (geometry.type === 'MultiPolygon') {
    return (Array.isArray(geometry.coordinates) ? geometry.coordinates : []).some((polygon: any[]) =>
      geometryContainsPoint({ type: 'Polygon', coordinates: polygon }, lat, lon),
    );
  }

  return false;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function marineBuoyHitRadiusMiles(zoom: number) {
  if (zoom >= 10) return 1.5;
  if (zoom >= 8) return 3;
  if (zoom >= 6) return 7;
  return 14;
}

function marineZonesToFeatureCollection(zones: NauticalZone[]) {
  return {
    type: 'FeatureCollection' as const,
    features: zones.map((zone) => {
      let geometry: any = zone.geometry ?? null;

      if (!geometry && Array.isArray(zone.polygon) && zone.polygon.length) {
        geometry = {
          type: 'Polygon' as const,
          coordinates: [
            closeRingIfNeeded(zone.polygon.map((point) => [point.longitude, point.latitude] as [number, number])),
          ],
        };
      }

      return {
        type: 'Feature' as const,
        id: zone.id,
        properties: {
          id: zone.id,
          name: zone.name,
          wfo: zone.wfo,
          type: zone.type,
        },
        geometry: geometry ?? { type: 'Point' as const, coordinates: [zone.centroid.longitude, zone.centroid.latitude] },
      };
    }),
  };
}

function marineZoneMarkersToFeatureCollection(zones: NauticalZone[]) {
  return {
    type: 'FeatureCollection' as const,
    features: zones
      .map((zone) => {
        const lat = Number(zone.centroid?.latitude);
        const lon = Number(zone.centroid?.longitude);
        const center = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : getGeometryCenter(zone.geometry);
        if (!center) return null;
        return {
          type: 'Feature' as const,
          id: zone.id,
          properties: {
            id: zone.id,
            name: zone.name,
            wfo: zone.wfo,
            type: zone.type,
          },
          geometry: { type: 'Point' as const, coordinates: [center.lon, center.lat] },
        };
      })
      .filter(Boolean),
  };
}

function boundsToPolygonCoordinates(bounds: { west: number; south: number; east: number; north: number }) {
  const ringFor = (west: number, east: number) =>
    closeRingIfNeeded([
      [west, bounds.south],
      [east, bounds.south],
      [east, bounds.north],
      [west, bounds.north],
    ] as Array<[number, number]>);

  if (bounds.west <= bounds.east) {
    return { type: 'Polygon' as const, coordinates: [ringFor(bounds.west, bounds.east)] };
  }

  return {
    type: 'MultiPolygon' as const,
    coordinates: [
      [ringFor(bounds.west, 180)],
      [ringFor(-180, bounds.east)],
    ],
  };
}

function globalMarineAreasToFeatureCollection(areas: GlobalMarineAreaSummary[]) {
  return {
    type: 'FeatureCollection' as const,
    features: areas
      .filter((area) => area.geometry || area.bounds)
      .map((area) => ({
        type: 'Feature' as const,
        id: area.id,
        properties: {
          id: area.id,
          name: area.name,
          region: area.region,
          kind: area.kind,
          sourceLabel: area.sourceLabel,
          sourceUrl: area.sourceUrl,
        },
        geometry: area.geometry ?? boundsToPolygonCoordinates(area.bounds!),
      })),
  };
}

function marineBuoySeverity(waveM?: number | null, windKts?: number | null) {
  const waveFt = waveM != null ? waveM * 3.28084 : null;
  const wind = windKts ?? 0;
  if ((waveFt == null || waveFt < 3) && wind < 15) return 'calm';
  if (waveFt != null && waveFt < 6 && wind < 25) return 'moderate';
  if ((waveFt != null && waveFt < 10) || wind < 35) return 'rough';
  return 'extreme';
}

function buoysToFeatureCollection(buoys: BuoyDetailData[]) {
  return {
    type: 'FeatureCollection' as const,
    features: buoys
      .filter((buoy) => Number.isFinite(buoy.lat) && Number.isFinite(buoy.lon))
      .map((buoy) => ({
        type: 'Feature' as const,
        id: buoy.id,
        properties: {
          id: buoy.id,
          name: buoy.name ?? buoy.id,
          severity: marineBuoySeverity(buoy.waveHeightM ?? null, buoy.windSpeedKts ?? null),
          wind: buoy.windSpeedKts != null ? `${Math.round(buoy.windSpeedKts)} kt` : '--',
          waves: buoy.waveHeightM != null ? `${Math.round(buoy.waveHeightM * 3.28084)} ft` : '--',
        },
        geometry: { type: 'Point' as const, coordinates: [buoy.lon, buoy.lat] as [number, number] },
      })),
  };
}

export function formatMarineWaterTemp(valueC: number | undefined, unit: 'F' | 'C') {
  if (!Number.isFinite(valueC)) return '--';
  const c = Number(valueC);
  if (unit === 'C') return `${Math.round(c)} C`;
  return `${Math.round((c * 9) / 5 + 32)} F`;
}

function waterTempCFromReading(value: number | null, sourceUnit?: string | null) {
  if (value == null || !Number.isFinite(value)) return null;
  const unit = String(sourceUnit ?? '').toLowerCase();
  if (unit.includes('degf') || unit.includes('fahrenheit') || unit.includes(' f')) return ((value - 32) * 5) / 9;
  return value;
}

function convertWaterTemp(value: number | null, sourceUnit: string | null | undefined, targetUnit: 'F' | 'C') {
  const c = waterTempCFromReading(value, sourceUnit);
  if (c == null) return null;
  return targetUnit === 'C' ? Math.round(c * 10) / 10 : Math.round(((c * 9) / 5 + 32) * 10) / 10;
}

function formatWaterStationTemp(value: number | null, sourceUnit: string | null | undefined, targetUnit: 'F' | 'C') {
  const converted = convertWaterTemp(value, sourceUnit, targetUnit);
  if (converted == null) return null;
  const rounded = Math.round(converted * 10) / 10;
  const display = Number.isInteger(rounded) ? String(Math.round(rounded)) : rounded.toFixed(1);
  return `${display} ${targetUnit}`;
}

function waterStationsGeojsonForTempUnit(geojson: any, targetUnit: 'F' | 'C') {
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  return {
    type: 'FeatureCollection',
    features: features
      .map((feature: any) => {
        const props = feature?.properties ?? {};
        const readings = Array.isArray(props.readings) ? props.readings : [];
        const newestTempReading = readings
          .filter((reading: any) => String(reading?.parameterCode ?? '') === '00010')
          .sort((a: any, b: any) => {
            const at = Date.parse(String(a?.time ?? ''));
            const bt = Date.parse(String(b?.time ?? ''));
            return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
          })[0];
        const tempReading =
          newestTempReading ??
          (String(props.primaryParameter ?? '') === '00010'
            ? { value: props.primaryValue, unit: props.primaryUnit, time: props.observedAt, label: props.primaryLabel }
            : null);
        if (!tempReading) return null;
        const tempValue = convertWaterTemp(safeNum(tempReading.value), tempReading.unit, targetUnit);
        const tempLabel = formatWaterStationTemp(safeNum(tempReading.value), tempReading.unit, targetUnit);
        if (tempValue == null || !tempLabel) return null;
        return {
          ...feature,
          properties: {
            ...props,
            label: tempLabel,
            primaryParameter: '00010',
            primaryLabel: 'Water temperature',
            primaryValue: tempValue,
            primaryUnit: targetUnit,
            observedAt: tempReading.time ?? props.observedAt ?? null,
            readings: [
              {
                ...tempReading,
                parameterCode: '00010',
                label: 'Water temperature',
                value: tempValue,
                unit: targetUnit,
              },
            ],
          },
        };
      })
      .filter(Boolean),
  };
}

export function formatMarineUpdated(value?: string | null) {
  if (!value) return 'Latest report';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Latest report';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function fetchMarinePointConditions(lat: number, lon: number, signal: AbortSignal): Promise<MarinePointConditions | null> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/marine/conditions?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`),
    9000,
    { headers: { Accept: 'application/json' }, signal },
  );
  if (!res.ok) throw new Error(`Marine conditions failed (${res.status})`);
  const json = await res.json();
  return json?.conditions ?? null;
}

export function useMarineMapLayer(args: {
  effectiveRegion: Region;
  isFocused: boolean;
  marineConditionsEnabled: boolean;
  waterStationsEnabled: boolean;
  mapZoom: number;
  tempUnit: 'F' | 'C';
}) {
  const { effectiveRegion, isFocused, marineConditionsEnabled, waterStationsEnabled, mapZoom, tempUnit } = args;
  const [selectedMarineFeature, setSelectedMarineFeature] = useState<SelectedMarineFeature>(null);
  const [selectedWaterStationId, setSelectedWaterStationId] = useState<string | null>(null);
  const [waterStationsGeojson, setWaterStationsGeojson] = useState<any>({ type: 'FeatureCollection', features: [] });
  const [waterStationsLoading, setWaterStationsLoading] = useState(false);
  const [waterStationsError, setWaterStationsError] = useState<string | null>(null);
  const [selectedGlobalMarineConditions, setSelectedGlobalMarineConditions] = useState<MarinePointConditions | null>(null);
  const [selectedGlobalMarineLoading, setSelectedGlobalMarineLoading] = useState(false);
  const [selectedGlobalMarineError, setSelectedGlobalMarineError] = useState<string | null>(null);

  const marineDataEnabled = isFocused && marineConditionsEnabled;
  const waterStationsDataEnabled = isFocused && waterStationsEnabled && mapZoom >= 5.2;
  const marineBbox = useMemo(
    () => (marineDataEnabled && mapZoom >= 3.6 ? regionToBbox(effectiveRegion) : null),
    [effectiveRegion, mapZoom, marineDataEnabled],
  );
  const waterStationsBbox = useMemo(
    () => (waterStationsDataEnabled ? regionToBbox(effectiveRegion) : null),
    [effectiveRegion, waterStationsDataEnabled],
  );
  const globalMarineViewport = useMemo(() => {
    if (!marineDataEnabled || mapZoom < 2 || mapZoom >= 7.6) return null;
    const bbox = regionToBbox(effectiveRegion);
    if (
      !bbox ||
      !Number.isFinite(bbox.west) ||
      !Number.isFinite(bbox.south) ||
      !Number.isFinite(bbox.east) ||
      !Number.isFinite(bbox.north)
    ) {
      return null;
    }
    return {
      west: bbox.west,
      south: bbox.south,
      east: bbox.east,
      north: bbox.north,
      zoom: mapZoom,
    };
  }, [effectiveRegion, mapZoom, marineDataEnabled]);

  const { zones: marineZones } = useMarineZonesByBbox(marineBbox);
  const { areas: globalMarineAreas } = useGlobalMarineManifest(globalMarineViewport);
  const { data: buoyData } = useAllBuoyDetails(marineDataEnabled);

  useEffect(() => {
    if (!waterStationsDataEnabled || !waterStationsBbox) {
      setWaterStationsGeojson({ type: 'FeatureCollection', features: [] });
      setWaterStationsError(null);
      setWaterStationsLoading(false);
      setSelectedWaterStationId(null);
      return;
    }

    const bbox = waterStationsBbox;
    const bboxArea = Math.abs((bbox.east ?? 0) - (bbox.west ?? 0)) * Math.abs((bbox.north ?? 0) - (bbox.south ?? 0));
    if (!Number.isFinite(bboxArea) || bboxArea > 2500) {
      setWaterStationsGeojson({ type: 'FeatureCollection', features: [] });
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        setWaterStationsLoading(true);
        setWaterStationsError(null);
        const params = new URLSearchParams({
          west: String(Number(bbox.west.toFixed(4))),
          south: String(Number(bbox.south.toFixed(4))),
          east: String(Number(bbox.east.toFixed(4))),
          north: String(Number(bbox.north.toFixed(4))),
          parameters: '00010',
          limit: mapZoom < 7 ? '80' : '160',
        });
        const res = await fetchWithTimeout(apiUrl(`/api/usgs/water-stations?${params.toString()}`), 12000);
        if (!res.ok) throw new Error(`USGS ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setWaterStationsGeojson(waterStationsGeojsonForTempUnit(json?.geojson, tempUnit));
      } catch (err: any) {
        if (cancelled) return;
        setWaterStationsError(err?.message ?? 'Unable to load USGS water stations');
        setWaterStationsGeojson({ type: 'FeatureCollection', features: [] });
      } finally {
        if (!cancelled) setWaterStationsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [mapZoom, tempUnit, waterStationsBbox, waterStationsDataEnabled]);

  const visibleMarineZones = useMemo(() => marineZones.slice(0, mapZoom < 6 ? 600 : mapZoom < 8 ? 1200 : 2500), [
    marineZones,
    mapZoom,
  ]);
  const marineBuoys = useMemo(
    () =>
      marineDataEnabled
        ? (buoyData ?? []).filter((buoy) => Number.isFinite(buoy.lat) && Number.isFinite(buoy.lon))
        : [],
    [buoyData, marineDataEnabled],
  );
  const marineZonesById = useMemo(() => new Map(visibleMarineZones.map((zone) => [zone.id, zone])), [visibleMarineZones]);
  const globalMarineAreasById = useMemo(
    () => new Map(globalMarineAreas.map((area) => [area.id, area])),
    [globalMarineAreas],
  );
  const marineBuoysById = useMemo(() => new Map(marineBuoys.map((buoy) => [buoy.id, buoy])), [marineBuoys]);
  const globalMarineAreasFc = useMemo(
    () => globalMarineAreasToFeatureCollection(globalMarineAreas),
    [globalMarineAreas],
  );
  const marineZonesFc = useMemo(() => marineZonesToFeatureCollection(visibleMarineZones), [visibleMarineZones]);
  const marineZoneMarkersFc = useMemo(() => marineZoneMarkersToFeatureCollection(visibleMarineZones), [visibleMarineZones]);
  const marineBuoysFc = useMemo(() => buoysToFeatureCollection(marineBuoys), [marineBuoys]);
  const waterStationsById = useMemo(() => {
    const out = new Map<string, SelectedWaterStation>();
    const features = Array.isArray(waterStationsGeojson?.features) ? waterStationsGeojson.features : [];
    for (const feature of features) {
      const props = feature?.properties ?? {};
      const id = String(props.siteId ?? props.id ?? feature?.id ?? '');
      if (!id) continue;
      out.set(id, {
        id,
        siteId: id,
        siteNumber: String(props.siteNumber ?? id.replace(/^USGS-/, '')),
        name: typeof props.name === 'string' ? props.name : null,
        label: typeof props.label === 'string' ? props.label : null,
        primaryLabel: typeof props.primaryLabel === 'string' ? props.primaryLabel : null,
        primaryValue: safeNum(props.primaryValue),
        primaryUnit: typeof props.primaryUnit === 'string' ? props.primaryUnit : null,
        observedAt: typeof props.observedAt === 'string' ? props.observedAt : null,
        readings: Array.isArray(props.readings) ? props.readings : [],
      });
    }
    return out;
  }, [waterStationsGeojson]);

  const selectedWaterStation = selectedWaterStationId ? waterStationsById.get(selectedWaterStationId) ?? null : null;
  const selectedMarineBuoy =
    selectedMarineFeature?.kind === 'buoy' ? marineBuoysById.get(selectedMarineFeature.id) ?? null : null;
  const selectedMarineZone =
    selectedMarineFeature?.kind === 'zone' ? marineZonesById.get(selectedMarineFeature.id) ?? null : null;
  const selectedGlobalMarineArea =
    selectedMarineFeature?.kind === 'globalArea' ? globalMarineAreasById.get(selectedMarineFeature.id) ?? null : null;
  const selectedMarineZoneFc = useMemo(
    () => marineZonesToFeatureCollection(selectedMarineZone ? [selectedMarineZone] : []),
    [selectedMarineZone],
  );
  const selectedGlobalMarineAreaFc = useMemo(
    () => globalMarineAreasToFeatureCollection(selectedGlobalMarineArea ? [selectedGlobalMarineArea] : []),
    [selectedGlobalMarineArea],
  );

  const resolveMarineFeatureAtPoint = useCallback(
    (lat: number, lon: number): SelectedMarineFeature => {
      if (!marineConditionsEnabled) return null;

      const nearestBuoy = marineBuoys
        .map((buoy) => ({
          buoy,
          distanceMi: haversineMiles(lat, lon, buoy.lat, buoy.lon),
        }))
        .filter((item) => item.distanceMi <= marineBuoyHitRadiusMiles(mapZoom))
        .sort((a, b) => a.distanceMi - b.distanceMi)[0]?.buoy;

      if (nearestBuoy) return { kind: 'buoy', id: nearestBuoy.id };

      const zone = visibleMarineZones.find((item) => geometryContainsPoint(item.geometry, lat, lon));
      return zone ? { kind: 'zone', id: zone.id } : null;
    },
    [mapZoom, marineBuoys, marineConditionsEnabled, visibleMarineZones],
  );

  const resolveMarineZoneAtPoint = useCallback(
    (lat: number, lon: number) => {
      if (!marineConditionsEnabled) return null;
      return visibleMarineZones.find((item) => geometryContainsPoint(item.geometry, lat, lon)) ?? null;
    },
    [marineConditionsEnabled, visibleMarineZones],
  );

  useEffect(() => {
    if (!marineConditionsEnabled) setSelectedMarineFeature(null);
  }, [marineConditionsEnabled]);

  useEffect(() => {
    if (!selectedGlobalMarineArea) {
      setSelectedGlobalMarineConditions(null);
      setSelectedGlobalMarineLoading(false);
      setSelectedGlobalMarineError(null);
      return;
    }

    const ac = new AbortController();
    setSelectedGlobalMarineLoading(true);
    setSelectedGlobalMarineError(null);

    fetchMarinePointConditions(selectedGlobalMarineArea.center.lat, selectedGlobalMarineArea.center.lon, ac.signal)
      .then((conditions) => {
        if (ac.signal.aborted) return;
        setSelectedGlobalMarineConditions(conditions);
      })
      .catch((e: any) => {
        if (ac.signal.aborted) return;
        setSelectedGlobalMarineConditions(null);
        setSelectedGlobalMarineError(e?.message ?? 'Marine model conditions unavailable');
      })
      .finally(() => {
        if (!ac.signal.aborted) setSelectedGlobalMarineLoading(false);
      });

    return () => ac.abort();
  }, [selectedGlobalMarineArea]);

  return {
    globalMarineAreasFc,
    marineBuoys,
    marineBuoysFc,
    marineZonesFc,
    marineZoneMarkersFc,
    resolveMarineFeatureAtPoint,
    resolveMarineZoneAtPoint,
    selectedGlobalMarineArea,
    selectedGlobalMarineAreaFc,
    selectedGlobalMarineConditions,
    selectedGlobalMarineError,
    selectedGlobalMarineLoading,
    selectedMarineBuoy,
    selectedMarineFeature,
    selectedMarineZone,
    selectedMarineZoneFc,
    selectedWaterStation,
    setSelectedMarineFeature,
    setSelectedWaterStationId,
    waterStationsError,
    waterStationsGeojson,
    waterStationsLoading,
  };
}
