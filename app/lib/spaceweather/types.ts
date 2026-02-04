// app/lib/spaceweather/types.ts

export type SolarWindSample = {
  time: string; // ISO
  speed: number; // km/s
};

export type NoaaScaleItem = {
  scale: number; // 0-5
  text: string; // "none", "minor", ...
};

export type NoaaScalesNow = {
  dateStamp?: string;
  timeStamp?: string;
  G: NoaaScaleItem;
  R: NoaaScaleItem;
  S: NoaaScaleItem;
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
  solarWindSpeed: number;
  solarWindDensity: number;
  solarWindTemp: number; // K
  kp: number;
  updatedAt: string;
  windHistory: SolarWindSample[];

  // Optional extras (fail-soft)
  noaaScales?: NoaaScalesNow;
  goesXray?: GoesXrayNow;

  // C) IMF coupling
  imf?: ImfNow;

  // D) Radiation / protons
  protons?: ProtonNow;
};
