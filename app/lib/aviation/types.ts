export type AviationProductType = 'gairmet' | 'sigmet' | 'convectiveSigmet' | 'cwa' | 'pirep' | 'metar' | 'other';

export type AviationHazardType =
  | 'ice'
  | 'turb'
  | 'llws'
  | 'ifr'
  | 'mtnObscuration'
  | 'ts'
  | 'obs'
  | 'unknown';

export type AviationSeverity = 'light' | 'moderate' | 'severe' | 'extreme' | 'unknown';

export type AviationFeature = {
  id: string;
  productType: AviationProductType;
  hazardType: AviationHazardType;
  severity: AviationSeverity;
  issuedAt?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  baseFt?: number | null;
  topFt?: number | null;
  label: string;
  rawText?: string | null;
  geometry: any;
  properties: Record<string, any>;
};
