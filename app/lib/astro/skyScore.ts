import type { AstroInputs } from './openMeteoAstro';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pct01(p: number | null | undefined) {
  if (p == null) return null;
  return clamp(p / 100, 0, 1);
}

export type SkyScoreParts = {
  transparency: number;
  seeing: number;
  darkness: number;
  moon: number;
  aerosols: number;
  site: number;
  weather: number;
  observer: number;
};

export type SkyScorePoint = {
  lat: number;
  lon: number;
  score: number;
  parts: SkyScoreParts;
};

export type SkyScoreSingleResult = {
  score: number;
  parts: SkyScoreParts;
};

function computeCloudPenalty(input: AstroInputs) {
  const low = pct01(input.cloudLow) ?? 0;
  const mid = pct01(input.cloudMid) ?? 0;
  const high = pct01(input.cloudHigh) ?? 0;
  const total = pct01(input.cloudTotal);

  const cloudPenaltyFromLayers = clamp(
    0.3 * low + 0.55 * mid + 0.95 * high,
    0,
    1
  );

  return {
    cloudPenalty: Math.max(total ?? 0, cloudPenaltyFromLayers),
  };
}

function computeTransparency01(input: AstroInputs) {
  const { cloudPenalty } = computeCloudPenalty(input);

  const visKm = input.visibilityM != null ? input.visibilityM / 1000 : null;
  const visibilityPenalty =
    visKm == null
      ? 0.12
      : clamp((20 - clamp(visKm, 0, 20)) / 20, 0, 1) * 0.45;

  const humidity = input.humidityPct ?? null;
  const humidityPenalty =
    humidity == null
      ? 0.05
      : clamp((humidity - 70) / 30, 0, 1) * 0.22;

  let transparency01 = clamp(
    1 - (cloudPenalty * 1.0 + visibilityPenalty + humidityPenalty),
    0,
    1
  );

  const cloudTotalPct = input.cloudTotal ?? null;

  if (cloudTotalPct != null) {
    if (cloudTotalPct >= 100) {
      transparency01 = Math.min(transparency01, 0.03);
    } else if (cloudTotalPct >= 98) {
      transparency01 = Math.min(transparency01, 0.05);
    } else if (cloudTotalPct >= 95) {
      transparency01 = Math.min(transparency01, 0.08);
    } else if (cloudTotalPct >= 90) {
      transparency01 = Math.min(transparency01, 0.14);
    } else if (cloudTotalPct >= 85) {
      transparency01 = Math.min(transparency01, 0.20);
    }
  }

  if (cloudPenalty >= 0.95) {
    transparency01 = Math.min(transparency01, 0.08);
  } else if (cloudPenalty >= 0.9) {
    transparency01 = Math.min(transparency01, 0.14);
  } else if (cloudPenalty >= 0.85) {
    transparency01 = Math.min(transparency01, 0.20);
  }

  return transparency01;
}

function computeSeeing01(input: AstroInputs) {
  const wind = input.windMps ?? 0;
  const gust = input.gustMps ?? wind;

  const sustainedPenalty = clamp((wind - 4) / 10, 0, 1) * 0.45;
  const gustPenalty = clamp((gust - 6) / 14, 0, 1) * 0.55;

  return clamp(1 - (sustainedPenalty + gustPenalty), 0, 1);
}

function computeMoonScore01(args: {
  moonIsUp?: boolean;
  moonIlluminationPct?: number | null;
  darknessScore?: number;
}) {
  const { moonIsUp, moonIlluminationPct, darknessScore } = args;
  if (!moonIsUp) return 1;

  const illum01 = clamp((moonIlluminationPct ?? 0) / 100, 0, 1);
  const dark01 = clamp(darknessScore ?? 1, 0, 1);

  // Moon matters more when it is actually dark.
  const maxPenalty = 0.80 * dark01;
  return clamp(1 - illum01 * maxPenalty, 0, 1);
}

function computeAerosolScore01(input: AstroInputs) {
  const aerosolIndex = input.aerosolIndex ?? null;
  if (aerosolIndex == null) return 0.75;

  // Expect 0..1, where higher = dirtier sky.
  return clamp(1 - clamp(aerosolIndex, 0, 1), 0, 1);
}

function bortleToScore01(bortle: number | null | undefined) {
  if (bortle == null) return 0.5;
  const b = clamp(bortle, 1, 9);

  // Slightly harsher than linear for bright urban skies.
  const map: Record<number, number> = {
    1: 1.00,
    2: 0.96,
    3: 0.89,
    4: 0.80,
    5: 0.67,
    6: 0.54,
    7: 0.40,
    8: 0.26,
    9: 0.14,
  };

  return map[Math.round(b)] ?? 0.5;
}

function elevationBonus01(elevationM: number | null | undefined) {
  if (elevationM == null) return 0;
  return clamp((elevationM / 2500) * 0.08, 0, 0.08);
}

function computeSiteScore01(input: AstroInputs) {
  const bortle01 = bortleToScore01(input.bortleClass ?? null);
  const elevationBonus = elevationBonus01(input.elevationM ?? null);

  return clamp(bortle01 + elevationBonus, 0, 1);
}

export function computeSkyScorePoint(args: {
  input: AstroInputs;
  darknessScore?: number;
  moonIsUp?: boolean;
  moonIlluminationPct?: number | null;
}): SkyScoreSingleResult {
  const { input } = args;
  const darkness01 = clamp(args.darknessScore ?? 1, 0, 1);

  const transparency01 = computeTransparency01(input);
  const seeing01 = computeSeeing01(input);
  const moon01 = computeMoonScore01({
    moonIsUp: args.moonIsUp,
    moonIlluminationPct: args.moonIlluminationPct,
    darknessScore: darkness01,
  });
  const aerosols01 = computeAerosolScore01(input);
  const site01 = computeSiteScore01(input);

  // Atmospheric observing quality at this moment.
  const weather01 = clamp(
    transparency01 * 0.42 +
      darkness01 * 0.20 +
      seeing01 * 0.14 +
      moon01 * 0.12 +
      aerosols01 * 0.12,
    0,
    1
  );

  // Site baseline should matter a lot for astronomy.
  const observer01 = clamp(weather01 * 0.68 + site01 * 0.32, 0, 1);
  const score = Math.round(observer01 * 100);

  return {
    score,
    parts: {
      transparency: transparency01,
      seeing: seeing01,
      darkness: darkness01,
      moon: moon01,
      aerosols: aerosols01,
      site: site01,
      weather: weather01,
      observer: observer01,
    },
  };
}

export function computeSkyScoreGrid(args: {
  inputs: AstroInputs[];
  darknessScoreAt?: (lat: number, lon: number) => number;
}): SkyScorePoint[] {
  const darknessScoreAt = args.darknessScoreAt ?? (() => 1);

  return args.inputs.map((p) => {
    const result = computeSkyScorePoint({
      input: p,
      darknessScore: darknessScoreAt(p.lat, p.lon),
      moonIsUp: false,
      moonIlluminationPct: 0,
    });

    return {
      lat: p.lat,
      lon: p.lon,
      score: result.score,
      parts: result.parts,
    };
  });
}

export function skyScoreLabel(score: number) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Very Good';
  if (score >= 55) return 'Good';
  if (score >= 35) return 'Fair';
  return 'Poor';
}

export function bortleLabel(bortle: number | null | undefined) {
  if (bortle == null) return 'Unknown site';
  if (bortle <= 2) return 'Dark site';
  if (bortle <= 4) return 'Rural sky';
  if (bortle <= 6) return 'Suburban sky';
  return 'Urban sky';
}

export function skyScoreSummary(args: {
  score: number;
  cloudTotal?: number | null;
  cloudHigh?: number | null;
  visibilityM?: number | null;
  gustMps?: number | null;
  humidityPct?: number | null;
  elevationM?: number | null;
  moonIsUp?: boolean;
  moonIlluminationPct?: number | null;
  bortleClass?: number | null;
  aerosolIndex?: number | null;
}) {
  const {
    score,
    cloudTotal,
    cloudHigh,
    visibilityM,
    gustMps,
    humidityPct,
    elevationM,
    moonIsUp,
    moonIlluminationPct,
    bortleClass,
    aerosolIndex,
  } = args;

  if ((cloudTotal ?? 0) >= 95) return 'Overcast skies block observing';
  if ((cloudTotal ?? 0) >= 85) return 'Mostly cloudy skies limit observing';
  if ((cloudHigh ?? 0) >= 80) return 'High clouds reduce visibility';
  if (moonIsUp && (moonIlluminationPct ?? 0) >= 60) {
    return 'Moonlight reduces contrast';
  }
  if (aerosolIndex != null && aerosolIndex >= 0.65) {
    return 'Smoke or aerosols reduce transparency';
  }
  if ((visibilityM ?? 20000) < 8000) return 'Hazy sky limits transparency';
  if ((humidityPct ?? 0) >= 88) return 'High humidity softens the sky';
  if ((gustMps ?? 0) >= 10) return 'Wind may reduce stability';
  if ((bortleClass ?? 0) >= 8) return 'Inner-city sky limits most deep-sky observing';
  if ((bortleClass ?? 0) >= 7) return 'Bright urban sky limits deep-sky observing';
  if ((bortleClass ?? 0) >= 5) return 'Suburban light pollution reduces contrast';
  if ((elevationM ?? 0) >= 1500 && score >= 70) {
    return 'Dark, clear mountain observing';
  }
  if (score >= 85) return 'Excellent observing conditions';
  if (score >= 70) return 'Very favorable observing';
  if (score >= 55) return 'Decent observing conditions';
  return 'Limited observing conditions';
}