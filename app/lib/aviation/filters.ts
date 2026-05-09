import type { AviationFeature, AviationHazardType, AviationProductType } from './types';

export const AVIATION_ALTITUDE_LEVELS: Array<{ label: string; feet: number | null }> = [
  { label: 'All', feet: null },
  { label: 'SFC', feet: 0 },
  { label: '030', feet: 3000 },
  { label: '060', feet: 6000 },
  { label: '090', feet: 9000 },
  { label: '120', feet: 12000 },
  { label: '150', feet: 15000 },
  { label: '180', feet: 18000 },
  { label: '240', feet: 24000 },
  { label: '300', feet: 30000 },
  { label: '360', feet: 36000 },
  { label: '420', feet: 42000 },
];

export function pickCurrentValidTime(times: string[]) {
  if (!times.length) return new Date();
  const now = Date.now();
  const next = times.find((value) => Date.parse(value) >= now);
  return new Date(next ?? times[times.length - 1]);
}

function validMatches(feature: AviationFeature, selectedValidTime: Date, includeMissing = false) {
  const selected = selectedValidTime.getTime();
  if (!Number.isFinite(selected)) return true;
  const from = Date.parse(feature.validFrom ?? '');
  const to = Date.parse(feature.validTo ?? feature.validFrom ?? '');
  if (Number.isFinite(from) && Number.isFinite(to)) return selected >= from && selected <= to;
  if (Number.isFinite(from)) return Math.abs(selected - from) < 60 * 1000;
  return includeMissing;
}

function altitudeMatches(feature: AviationFeature, selectedAltitudeFt: number | null, showUnknownAltitude: boolean) {
  if (selectedAltitudeFt == null) return true;
  const base = feature.baseFt;
  const top = feature.topFt;
  if (base == null && top == null) return showUnknownAltitude;
  const lo = base ?? 0;
  const hi = top ?? 60000;
  return selectedAltitudeFt >= lo && selectedAltitudeFt <= hi;
}

export function filterAviationFeatures(args: {
  features: AviationFeature[];
  selectedProducts: AviationProductType[];
  selectedHazards: AviationHazardType[];
  selectedAltitudeFt: number | null;
  selectedValidTime: Date;
  showUnknownAltitude: boolean;
  includeMissingValidTime?: boolean;
}) {
  const {
    features,
    selectedProducts,
    selectedHazards,
    selectedAltitudeFt,
    selectedValidTime,
    showUnknownAltitude,
    includeMissingValidTime = false,
  } = args;

  return features.filter((feature) => {
    if (!selectedProducts.includes(feature.productType)) return false;
    if (!selectedHazards.includes(feature.hazardType)) return false;
    if (!validMatches(feature, selectedValidTime, includeMissingValidTime)) return false;
    return altitudeMatches(feature, selectedAltitudeFt, showUnknownAltitude);
  });
}

export function toggleFilterValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
