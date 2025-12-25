// app/lib/nautical/buildNerdyData.ts

import type {
    ConfidenceLevel,
    ModelComparison,
    NerdyData,
    NerdySourceRef,
    SeaStateObs,
    WaveMechanics,
    WindWaveInteraction,
} from './typesNerdy';

// ---- Minimal “inputs” that match what you already have ----
// Adjust these types if your real shapes differ; the function is defensive.

type BuoyLike = {
  id: string;
  name?: string | null;
  updatedAt?: string | null;

  waveHeightM?: number | null;
  dominantPeriodS?: number | null;
  dominantDirectionDeg?: number | null;

  windSpeedKts?: number | null;
  windGustKts?: number | null;
  windDirectionDeg?: number | null;

  waterTempC?: number | null;
  airTempC?: number | null;

  pressureHpa?: number | null;
  visibilityNm?: number | null;
};

type ConditionsLike = {
  observedAt?: string | null;
  modelSource?: string | null;

  significantWaveHeightM?: number | null;
  primarySwellPeriodS?: number | null;
  primarySwellDirectionDeg?: number | null;

  windSpeedKts?: number | null;
  windGustKts?: number | null;
  windDirectionDeg?: number | null;

  seaSurfaceTempC?: number | null;
};

type MarineForecastLike = {
  id: string; // zone id
  headline: string;
  issuedAt: string;
  source: string;
};

export type BuildNerdyParams = {
  zoneId?: string;
  zoneName?: string;
  wfo?: string;

  buoy?: BuoyLike | null;
  // your existing "conditions" object from useNauticalSummary
  conditions?: ConditionsLike | null;

  // optional: your forecast hook result (for provenance)
  forecast?: MarineForecastLike | null;
};

// ---- helpers ----

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function degToCompass(deg?: number | null): string | undefined {
  if (deg == null || Number.isNaN(deg)) return undefined;
  const dirs = [
    'N','NNE','NE','ENE','E','ESE','SE','SSE',
    'S','SSW','SW','WSW','W','WNW','NW','NNW',
  ];
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return dirs[idx];
}

// Smallest absolute angle between two bearings
function angleDelta(a?: number | null, b?: number | null): number | null {
  if (a == null || b == null) return null;
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
}

// Deep-water wavelength approximation:
// L ≈ 1.56 * T^2  (meters, T in seconds)
function deepWaterWavelengthM(periodS?: number | null): number | null {
  if (!periodS || periodS <= 0) return null;
  return 1.56 * periodS * periodS;
}

// Steepness ratio H/L (dimensionless), using H = significant wave height
function steepnessRatio(
  waveHeightM?: number | null,
  periodS?: number | null,
): number | null {
  const L = deepWaterWavelengthM(periodS);
  if (!L || !waveHeightM || waveHeightM <= 0) return null;
  return waveHeightM / L;
}

function steepnessLabel(r?: number | null): WaveMechanics['steepnessLabel'] {
  if (r == null) return undefined;
  // Rough thresholds commonly used as heuristics:
  // <0.03 low, 0.03-0.06 moderate, >0.06 steep
  if (r < 0.03) return 'Low';
  if (r < 0.06) return 'Moderate';
  return 'Steep';
}

function breakingRiskFromSteepness(
  r?: number | null,
): WaveMechanics['breakingRisk'] {
  if (r == null) return undefined;
  // heuristics: steepness > ~0.07 is “breaking likely”
  if (r < 0.03) return 'Low';
  if (r < 0.06) return 'Moderate';
  if (r < 0.08) return 'Elevated';
  return 'High';
}

function regimeFromAngle(d?: number | null): WindWaveInteraction['regime'] {
  if (d == null) return 'Unknown';
  if (d < 25) return 'Aligned';
  if (d > 155) return 'Opposing';
  if (d >= 70 && d <= 110) return 'Cross sea';
  return 'Unknown';
}

function isoNow() {
  return new Date().toISOString();
}

function minutesBetween(nowIso: string, thenIso?: string | null): number | null {
  if (!thenIso) return null;
  const now = Date.parse(nowIso);
  const then = Date.parse(thenIso);
  if (Number.isNaN(now) || Number.isNaN(then)) return null;
  return Math.max(0, Math.round((now - then) / 60000));
}

// Confidence scoring: simple & explainable.
// High confidence if buoy exists + observed age is small + model agrees.
function computeConfidence(args: {
  hasBuoy: boolean;
  obsAgeMin: number | null;
  modelDeltaM: number | null;
  hasCrossSea: boolean;
}): { level: ConfidenceLevel; score01: number; drivers: string[] } {
  let score = 0.55;
  const drivers: string[] = [];

  if (args.hasBuoy) {
    score += 0.2;
    drivers.push('Live buoy observation available');
  } else {
    drivers.push('No live buoy; using model/derived values');
  }

  if (args.obsAgeMin != null) {
    if (args.obsAgeMin <= 30) {
      score += 0.15;
      drivers.push(`Fresh obs (${args.obsAgeMin} min old)`);
    } else if (args.obsAgeMin <= 120) {
      score += 0.05;
      drivers.push(`Obs age moderate (${args.obsAgeMin} min)`);
    } else {
      score -= 0.1;
      drivers.push(`Obs stale (${args.obsAgeMin} min)`);
    }
  }

  if (args.modelDeltaM != null) {
    const abs = Math.abs(args.modelDeltaM);
    if (abs < 0.3) {
      score += 0.07;
      drivers.push('Model agrees with observation');
    } else if (abs < 0.8) {
      score -= 0.03;
      drivers.push('Model differs from observation');
    } else {
      score -= 0.08;
      drivers.push('Large model vs obs difference');
    }
  }

  if (args.hasCrossSea) {
    score -= 0.05;
    drivers.push('Cross-sea regime increases uncertainty');
  }

  score = clamp01(score);

  const level: ConfidenceLevel =
    score >= 0.75 ? 'High' : score >= 0.55 ? 'Moderate' : 'Low';

  return { level, score01: score, drivers };
}

// ---- main builder ----

export function buildNerdyData({
  zoneId,
  zoneName,
  wfo,
  buoy,
  conditions,
  forecast,
}: BuildNerdyParams): NerdyData {
  // Prefer buoy obs; fall back to “conditions”
  const waveHeightM =
    buoy?.waveHeightM ?? conditions?.significantWaveHeightM ?? null;

  // For period/dir: buoy dominant first, else model primary swell
  const periodS =
    buoy?.dominantPeriodS ?? conditions?.primarySwellPeriodS ?? null;

  const waveDirDeg =
    buoy?.dominantDirectionDeg ?? conditions?.primarySwellDirectionDeg ?? null;

  const windSpeedKts = buoy?.windSpeedKts ?? conditions?.windSpeedKts ?? null;
  const windGustKts = buoy?.windGustKts ?? conditions?.windGustKts ?? null;
  const windDirDeg = buoy?.windDirectionDeg ?? conditions?.windDirectionDeg ?? null;

  const seaSurfaceTempC =
    buoy?.waterTempC ?? conditions?.seaSurfaceTempC ?? null;

  const observedAt =
    buoy?.updatedAt ?? conditions?.observedAt ?? null;

  const now = isoNow();
  const obsAgeMin = minutesBetween(now, observedAt);

  const obs: SeaStateObs = {
    significantWaveHeightM: waveHeightM ?? undefined,
    dominantPeriodS: periodS ?? undefined,
    dominantDirectionDeg: waveDirDeg ?? undefined,

    windSpeedKts: windSpeedKts ?? undefined,
    windGustKts: windGustKts ?? undefined,
    windDirectionDeg: windDirDeg ?? undefined,

    seaSurfaceTempC: seaSurfaceTempC ?? undefined,
    airTempC: buoy?.airTempC ?? undefined,
    pressureHpa: buoy?.pressureHpa ?? undefined,
    visibilityNm: buoy?.visibilityNm ?? undefined,

    observedAt: observedAt ?? undefined,
  };

  // Mechanics
  const L = deepWaterWavelengthM(periodS);
  const steep = steepnessRatio(waveHeightM, periodS);

  const mechanics: WaveMechanics = {
    wavelengthM: L ?? undefined,
    steepnessRatio: steep ?? undefined,
    steepnessLabel: steepnessLabel(steep),
    breakingRisk: breakingRiskFromSteepness(steep),
  };

  // Wind-wave interaction
  const angle = angleDelta(windDirDeg, waveDirDeg);
  const regime = regimeFromAngle(angle);

  const windWave: WindWaveInteraction = {
    angleOffsetDeg: angle ?? undefined,
    regime,
    comfortNote:
      regime === 'Cross sea'
        ? 'Cross sea likely: confused surface and more roll.'
        : regime === 'Opposing'
        ? 'Opposing wind can steepen faces and increase breaking risk.'
        : regime === 'Aligned'
        ? 'Aligned wind supports a more organized sea state.'
        : undefined,
    trend: 'Unknown',
  };

  // Model comparison (only if we have both buoy and model estimate)
  // Here: treat conditions.significantWaveHeightM as “model” when buoy exists.
  let model: ModelComparison | undefined;

  if (buoy?.waveHeightM != null && conditions?.significantWaveHeightM != null) {
    const delta = buoy.waveHeightM - conditions.significantWaveHeightM;
    model = {
      modelName: conditions?.modelSource ?? 'Model',
      waveHeightModelM: conditions.significantWaveHeightM,
      waveHeightObsM: buoy.waveHeightM,
      deltaWaveHeightM: delta,
      windSpeedModelKts: conditions.windSpeedKts ?? undefined,
      windSpeedObsKts: buoy.windSpeedKts ?? undefined,
      deltaWindSpeedKts:
        buoy.windSpeedKts != null && conditions.windSpeedKts != null
          ? buoy.windSpeedKts - conditions.windSpeedKts
          : undefined,
    };
  }

  const hasBuoy = !!buoy;
  const hasCrossSea = windWave.regime === 'Cross sea';

  const conf = computeConfidence({
    hasBuoy,
    obsAgeMin,
    modelDeltaM: model?.deltaWaveHeightM ?? null,
    hasCrossSea,
  });

  // Sources list
  const sources: NerdySourceRef[] = [];

  if (buoy) {
    sources.push({
      kind: 'NDBC_BUOY',
      id: buoy.id,
      name: 'NOAA NDBC buoy',
      updatedAt: buoy.updatedAt ?? undefined,
      latencyMinutes: obsAgeMin ?? undefined,
    });
  }

  if (forecast?.id) {
    sources.push({
      kind: forecast.source?.includes('tgftp') ? 'NWS_MARINE_ZONE_TEXT' : 'NWS_API',
      id: forecast.id,
      name: forecast.source,
      updatedAt: forecast.issuedAt,
    });
  }

  if (conditions?.modelSource) {
    sources.push({
      kind: 'MODEL_WAVE',
      name: conditions.modelSource,
      updatedAt: conditions.observedAt ?? undefined,
      notes: 'Model-derived sea state/conditions',
    });
  }

  // Build the payload
  const data: NerdyData = {
    zoneId: zoneId ? String(zoneId) : undefined,
    zoneName: zoneName ? String(zoneName) : undefined,
    wfo: wfo ? String(wfo) : undefined,

    buoyId: buoy?.id,
    buoyName: buoy?.name ?? undefined,

    obs,

    mechanics,
    windWave,
    model,

    confidence: {
      level: conf.level,
      score01: conf.score01,
      drivers: conf.drivers,
    },

    sources,
  };

  return data;
}
