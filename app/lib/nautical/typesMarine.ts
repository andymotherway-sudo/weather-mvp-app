export type MarineOfficialSource =
  | 'NOAA_MARINE_ZONE'
  | 'METAREA'
  | 'UKMO'
  | 'AEMET'
  | 'METEOFRANCE'
  | 'OTHER';

export type MarineModelConditions = {
  windKts?: number | null;
  gustKts?: number | null;
  windDirDeg?: number | null;

  waveHeightM?: number | null;
  wavePeriodS?: number | null;
  waveDirDeg?: number | null;

  visibilityNm?: number | null;
  pressureHpa?: number | null;

  // optional “nerdy” goodness
  confidence?: number | null; // 0..1
  source?: string | null;     // e.g. "WW3", "GFS"
  validTimeIso?: string | null;
};

export type MarineOfficialBulletin = {
  source: MarineOfficialSource;
  title?: string | null;
  issuedAtIso?: string | null;
  validToIso?: string | null;
  text: string;
  warnings?: Array<{ code?: string; label: string; severity?: 'advisory'|'watch'|'warning' }>;
  attribution?: string | null;
};

export type MarineConditions = {
  model: MarineModelConditions;
  official?: MarineOfficialBulletin | null;
  meta?: {
    lat: number;
    lon: number;
    kind: 'zone' | 'point' | 'metarea';
    id?: string;
    name?: string;
  };
};
