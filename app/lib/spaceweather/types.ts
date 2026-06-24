// app/lib/spaceweather/types.ts

export type SolarWindSample = {
  time: string; // ISO
  speed: number; // km/s
};

export type NoaaScaleItem = {
  scale: number | null;
  text?: string;
};

export type NoaaScalesNow = {
  dateStamp?: string;
  timeStamp?: string;
  G: NoaaScaleItem | null;
  R: NoaaScaleItem | null;
  S: NoaaScaleItem | null;
};

export type GoesXrayNow = {
  timeTag?: string;     // ISO
  fluxWm2: number | null;
  classLabel: string;   // e.g. "C3.2"
};

export type ImfNow = {
  timeTag?: string; // ISO
  bzGsmNt: number | null; // southward negative couples to aurora
  btNt: number | null;
};

export type ProtonNow = {
  timeTag?: string; // ISO
  pfu10MeV: number | null; // protons/(cm^2 s sr) at >=10 MeV
  sScale?: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
};

export type KpForecastSample = {
  time: string;
  kp: number;
  status: 'observed' | 'estimated' | 'predicted';
  noaaScale?: string | null;
};

export type SpaceWeatherSourceStatus = {
  id: string;
  label: string;
  provider: string;
  observedAt?: string | null;
  ageMinutes?: number | null;
  freshness: 'fresh' | 'lagging' | 'stale' | 'unknown';
  productUrl?: string;
};

export type SwpcAlert = {
  id: string;
  productId?: string | null;
  issuedAt?: string | null;
  severity: 'alert' | 'warning' | 'watch' | 'statement';
  title: string;
  message: string;
  source: string;
};

export type IncomingStormSignal = {
  level: 'quiet' | 'watch' | 'storm-likely' | 'storm-underway';
  label: string;
  score: number;
  summary: string;
};

export type SpaceWeatherExtremes = {
  computedAt: string; // ISO

  maxKp24h: number | null;
  maxWindSpeed24h: number | null; // km/s

  strongestXray7d: {
    timeTag?: string;
    fluxWm2: number | null;
    classLabel: string; // derived from max flux
  };

  fastestCme30d: {
    startTime?: string;
    speedKms: number | null;
    cmeId?: string;
  };
};

export type SpaceWeatherSummary = {
  source?: string;
  generatedAt?: string;
  solarWindSpeed: number;
  solarWindDensity: number;
  solarWindTemp: number;
  kp: number;
  kpForecast?: KpForecastSample[];
  updatedAt: string;
  windHistory: SolarWindSample[];

  noaaScales?: NoaaScalesNow;
  noaaScalesUpdatedAt?: string;
  goesXray?: GoesXrayNow;
  imf?: ImfNow;
  protons?: ProtonNow;
  sources?: SpaceWeatherSourceStatus[];
  swpcAlerts?: SwpcAlert[];
  incomingStorm?: IncomingStormSignal;
};

export type MarsInsightWeather = {
  ok: boolean;
  source: 'NASA InSight Weather API';
  archived: true;
  sol: string;
  terrestrialDate: string | null;
  season: string | null;
  tempC: { avg: number | null; min: number | null; max: number | null };
  pressurePa: { avg: number | null; min: number | null; max: number | null };
  windMps: { avg: number | null; min: number | null; max: number | null };
  fetchedAtIso: string;
  note: string;
};
