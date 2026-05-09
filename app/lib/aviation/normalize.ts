import type { AviationFeature, AviationHazardType, AviationProductType, AviationSeverity } from './types';

function str(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function productType(value: unknown): AviationProductType {
  const key = String(value ?? '').trim();
  if (key === 'gairmet') return 'gairmet';
  if (key === 'sigmet') return 'sigmet';
  if (key === 'convectiveSigmet') return 'convectiveSigmet';
  if (key === 'cwa') return 'cwa';
  if (key === 'pirep') return 'pirep';
  if (key === 'metar') return 'metar';
  return 'other';
}

function hazardType(value: unknown): AviationHazardType {
  const key = String(value ?? '').trim().toUpperCase();
  if (key === 'ICE') return 'ice';
  if (key === 'TURB') return 'turb';
  if (key === 'LLWS') return 'llws';
  if (key === 'IFR_MTN') return 'ifr';
  if (key === 'TS') return 'ts';
  if (key === 'OBS') return 'obs';
  if (key.includes('MTN') || key.includes('MOUNTAIN')) return 'mtnObscuration';
  return 'unknown';
}

function severity(value: unknown): AviationSeverity {
  const key = String(value ?? '').trim().toLowerCase();
  if (key.includes('extreme')) return 'extreme';
  if (key.includes('severe')) return 'severe';
  if (key.includes('moderate')) return 'moderate';
  if (key.includes('light')) return 'light';
  return 'unknown';
}

function num(value: unknown) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function rawTextFromProps(props: Record<string, any>) {
  return str(props.rawText) ?? str(props.rawOb) ?? str(props.rawTAF) ?? str(props.raw) ?? str(props.text);
}

function altitudeFt(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value <= 700 ? value * 100 : value;
  const text = String(value ?? '').trim().toUpperCase();
  if (!text) return null;
  const fl = text.match(/\bFL\s?(\d{2,3})\b/);
  if (fl) return Number(fl[1]) * 100;
  const feet = text.match(/\b(\d{3,5})\s?(?:FT|FEET|MSL)\b/);
  if (feet) return Number(feet[1]);
  const rawNumber = Number(text);
  if (Number.isFinite(rawNumber)) return rawNumber <= 700 ? rawNumber * 100 : rawNumber;
  return null;
}

export function normalizeAviationFeature(feature: any): AviationFeature | null {
  if (!feature?.geometry) return null;
  const props = feature.properties ?? {};
  const product = productType(props.productKey);
  const hazard = hazardType(props.hazardKey);
  const sourceProduct = str(props.sourceProduct);
  const rawText = rawTextFromProps(props);
  const joinedLabel = [props.hazardType, props.severityLabel !== 'Not specified' ? props.severityLabel : null, props.altitudeLabel]
    .filter(Boolean)
    .join(' ')
    .trim();
  const label =
    str(props.iconLabel) ??
    str(joinedLabel) ??
    sourceProduct ??
    'Aviation';
  const pointAltitude =
    product === 'pirep'
      ? altitudeFt(props.flightLevel ?? props.fltLvl ?? props.fltlvl ?? props.altitude ?? props.level ?? props.altitudeLabel ?? rawText)
      : null;
  const baseFt = num(props.baseFt) ?? pointAltitude;
  const topFt = num(props.topFt) ?? pointAltitude;

  return {
    id: String(props.rawFeatureId ?? feature.id ?? props.id ?? `${product}-${hazard}-${Math.random()}`),
    productType: product,
    hazardType: hazard,
    severity: severity(props.severityLabel ?? props.severity),
    issuedAt: str(props.issuedTime ?? props.issuedAt),
    validFrom: str(props.validFrom ?? props.validTime),
    validTo: str(props.expiresTime ?? props.validTo ?? props.validTime),
    baseFt,
    topFt,
    label,
    rawText,
    geometry: feature.geometry,
    properties: props,
  };
}

export function normalizeAviationFeatureCollection(fc: any): AviationFeature[] {
  const features = Array.isArray(fc?.features) ? fc.features : [];
  return features.map(normalizeAviationFeature).filter(Boolean) as AviationFeature[];
}

export function aviationFeaturesToFeatureCollection(features: AviationFeature[]) {
  return {
    type: 'FeatureCollection' as const,
    features: features.map((feature) => ({
      type: 'Feature' as const,
      id: feature.id,
      properties: {
        ...feature.properties,
        id: feature.id,
        productType: feature.productType,
        hazardType: feature.hazardType,
        severity: feature.severity,
        label: feature.label,
        issuedAt: feature.issuedAt,
        validFrom: feature.validFrom,
        validTo: feature.validTo,
        baseFt: feature.baseFt,
        topFt: feature.topFt,
      },
      geometry: feature.geometry,
    })),
  };
}
