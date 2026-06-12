import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Region } from '../../../components/maps/MapRenderer';
import {
  alertFeatureToDetail,
  fetchWeatherAlertDetail,
  type WeatherAlertDetail,
  useAlertMapData,
} from './useAlertMapData';

export type WeatherAlertForecastTarget =
  | { kind: 'marine'; zoneId: string; name?: string | null; wfo?: string | null }
  | { kind: 'land'; lat: number; lon: number }
  | null;

type MarineZoneAtPoint = { id: string; name?: string | null; wfo?: string | null } | null;

function safeNum(value: any) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function getMapPressLonLat(e: any): { lat: number; lon: number } | null {
  const candidates = [
    e?.geometry?.coordinates,
    e?.coordinates,
    e?.coordinate,
    e?.lngLat,
    e?.properties?.coordinates,
  ];

  for (const coords of candidates) {
    if (Array.isArray(coords) && coords.length >= 2) {
      const lon = safeNum(coords[0]);
      const lat = safeNum(coords[1]);
      if (lat != null && lon != null) return { lat, lon };
    }

    const lat = safeNum(coords?.lat ?? coords?.latitude);
    const lon = safeNum(coords?.lng ?? coords?.lon ?? coords?.longitude);
    if (lat != null && lon != null) return { lat, lon };
  }

  return null;
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

export function buildWeatherAlertOfficialText(alert: WeatherAlertDetail | null) {
  if (!alert) return '';
  const description =
    alert.description && /^Alert bulletin:\s*https?:\/\//i.test(alert.description) ? null : alert.description;
  return [
    alert.headline,
    description,
    alert.instruction ? `Instructions:\n${alert.instruction}` : null,
    alert.note ? `Note:\n${alert.note}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

export function formatAlertDate(value?: string | null) {
  if (!value) return 'Pending';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Pending';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function useAlertMapLayer(args: {
  enabled: boolean;
  region: Region;
  mapZoom: number;
  resolveMarineZoneAtPoint: (lat: number, lon: number) => MarineZoneAtPoint;
  clearMarineSelection: () => void;
}) {
  const { enabled, region, mapZoom, resolveMarineZoneAtPoint, clearMarineSelection } = args;
  const alertsData = useAlertMapData(enabled, region, mapZoom);
  const [selectedWeatherAlert, setSelectedWeatherAlert] = useState<WeatherAlertDetail | null>(null);
  const [selectedWeatherAlertLoading, setSelectedWeatherAlertLoading] = useState(false);
  const [selectedWeatherAlertError, setSelectedWeatherAlertError] = useState<string | null>(null);
  const [selectedWeatherAlertForecastTarget, setSelectedWeatherAlertForecastTarget] =
    useState<WeatherAlertForecastTarget>(null);

  useEffect(() => {
    if (!enabled) {
      setSelectedWeatherAlert(null);
      setSelectedWeatherAlertLoading(false);
      setSelectedWeatherAlertError(null);
      setSelectedWeatherAlertForecastTarget(null);
    }
  }, [enabled]);

  const closeWeatherAlert = useCallback(() => {
    setSelectedWeatherAlert(null);
    setSelectedWeatherAlertLoading(false);
    setSelectedWeatherAlertError(null);
    setSelectedWeatherAlertForecastTarget(null);
  }, []);

  const handleWeatherAlertPress = useCallback(
    (e: any) => {
      const feature = e?.features?.[0] ?? e?.feature ?? null;
      const detail = alertFeatureToDetail(feature);
      const pressCoords = getMapPressLonLat(e) ?? getGeometryCenter(feature?.geometry);

      if (!detail) return;

      const marineZone = pressCoords ? resolveMarineZoneAtPoint(pressCoords.lat, pressCoords.lon) : null;
      setSelectedWeatherAlertForecastTarget(
        marineZone
          ? {
              kind: 'marine',
              zoneId: marineZone.id,
              name: marineZone.name,
              wfo: marineZone.wfo ?? '',
            }
          : pressCoords
            ? { kind: 'land', lat: pressCoords.lat, lon: pressCoords.lon }
            : null,
      );
      clearMarineSelection();
      setSelectedWeatherAlert(detail);
      setSelectedWeatherAlertError(null);

      if (detail.sourceUrl && !detail.derived) {
        const controller = new AbortController();
        setSelectedWeatherAlertLoading(true);
        fetchWeatherAlertDetail(detail, controller.signal)
          .then((fullDetail) => {
            if (controller.signal.aborted) return;
            setSelectedWeatherAlert((current) => (current?.id === detail.id ? fullDetail : current));
          })
          .catch((err: any) => {
            if (controller.signal.aborted) return;
            setSelectedWeatherAlertError(err?.message ?? 'Unable to load official alert text');
          })
          .finally(() => {
            if (!controller.signal.aborted) setSelectedWeatherAlertLoading(false);
          });
      } else {
        setSelectedWeatherAlertLoading(false);
      }
    },
    [clearMarineSelection, resolveMarineZoneAtPoint],
  );

  const selectedWeatherAlertOfficialText = useMemo(
    () => buildWeatherAlertOfficialText(selectedWeatherAlert),
    [selectedWeatherAlert],
  );

  return {
    alertsData,
    closeWeatherAlert,
    handleWeatherAlertPress,
    selectedWeatherAlert,
    selectedWeatherAlertError,
    selectedWeatherAlertForecastTarget,
    selectedWeatherAlertLoading,
    selectedWeatherAlertOfficialText,
  };
}
