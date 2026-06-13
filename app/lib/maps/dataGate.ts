import type { Region } from '../../../components/maps/MapRenderer';

export type Bbox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export function mapProductEnabled(args: {
  isFocused: boolean;
  layerEnabled: boolean;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
}) {
  const { isFocused, layerEnabled, zoom, minZoom = -Infinity, maxZoom = Infinity } = args;
  return isFocused && layerEnabled && Number.isFinite(zoom) && zoom >= minZoom && zoom < maxZoom;
}

export function regionToBbox(region: Region | null | undefined): Bbox | null {
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

export function bboxArea(bbox: Bbox | null | undefined) {
  if (!bbox) return null;
  const area = Math.abs((bbox.east ?? 0) - (bbox.west ?? 0)) * Math.abs((bbox.north ?? 0) - (bbox.south ?? 0));
  return Number.isFinite(area) ? area : null;
}

export function bboxWithinAreaBudget(bbox: Bbox | null | undefined, maxArea: number) {
  const area = bboxArea(bbox);
  return area != null && Number.isFinite(maxArea) && area <= maxArea;
}

export function marineViewportForRegion(args: {
  region: Region | null | undefined;
  enabled: boolean;
  zoom: number;
  minZoom: number;
  maxZoom: number;
}) {
  const { region, enabled, zoom, minZoom, maxZoom } = args;
  if (!enabled || zoom < minZoom || zoom >= maxZoom) return null;
  const bbox = regionToBbox(region);
  if (
    !bbox ||
    !Number.isFinite(bbox.west) ||
    !Number.isFinite(bbox.south) ||
    !Number.isFinite(bbox.east) ||
    !Number.isFinite(bbox.north)
  ) {
    return null;
  }
  return { ...bbox, zoom };
}
