export type MarineConditionLevel = 'Unknown' | 'Low' | 'Moderate' | 'High' | 'Extreme';

export type MarineConditionSignal = {
  level: MarineConditionLevel;
  text: string;
  completeness: 'none' | 'partial' | 'complete';
};

function severityForWaveHeight(waveM: number | null | undefined): MarineConditionLevel | null {
  if (waveM == null || !Number.isFinite(waveM)) return null;
  const feet = Math.max(0, waveM) * 3.28084;
  if (feet < 3) return 'Low';
  if (feet < 6) return 'Moderate';
  if (feet < 10) return 'High';
  return 'Extreme';
}

function severityForWind(
  windKts: number | null | undefined,
  gustKts: number | null | undefined,
): MarineConditionLevel | null {
  const available = [windKts, gustKts].filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (!available.length) return null;

  const strongest = Math.max(0, ...available);
  if (strongest < 15) return 'Low';
  if (strongest < 25) return 'Moderate';
  if (strongest < 35) return 'High';
  return 'Extreme';
}

const LEVEL_RANK: Record<Exclude<MarineConditionLevel, 'Unknown'>, number> = {
  Low: 1,
  Moderate: 2,
  High: 3,
  Extreme: 4,
};

/**
 * A deliberately small condition signal for scanning current wind and waves.
 * It is not a vessel-specific safety rating and never treats missing data as calm.
 */
export function getMarineConditionSignal(args: {
  waveM: number | null | undefined;
  windKts: number | null | undefined;
  gustKts?: number | null;
}): MarineConditionSignal {
  const waveLevel = severityForWaveHeight(args.waveM);
  const windLevel = severityForWind(args.windKts, args.gustKts);
  const levels = [waveLevel, windLevel].filter(
    (value): value is Exclude<MarineConditionLevel, 'Unknown'> => value != null,
  );

  if (!levels.length) {
    return {
      level: 'Unknown',
      completeness: 'none',
      text: 'Wind and wave inputs are unavailable. Check official forecasts and warnings before making decisions.',
    };
  }

  const level = levels.reduce((worst, current) =>
    LEVEL_RANK[current] > LEVEL_RANK[worst] ? current : worst,
  );
  const completeness = waveLevel && windLevel ? 'complete' : 'partial';
  const partialSuffix = completeness === 'partial' ? ' One of wind or wave height is unavailable.' : '';

  const textByLevel: Record<Exclude<MarineConditionLevel, 'Unknown'>, string> = {
    Low: 'Lower wind and wave exposure in the available data. Check official warnings and vessel limits.',
    Moderate: 'Elevated wind or sea-state exposure. Check the official forecast, warnings, and local conditions.',
    High: 'High wind or sea-state exposure that may challenge small craft. Use official guidance and local knowledge.',
    Extreme: 'Severe wind or sea-state exposure. Follow official warnings and local authorities.',
  };

  return {
    level,
    completeness,
    text: `${textByLevel[level]}${partialSuffix}`,
  };
}
