import { describe, expect, it } from 'vitest';

import { computeSkyScorePoint } from '../../app/lib/astro/skyScore';
import { getMarineConditionSignal } from '../../app/lib/nautical/conditionSignal';

describe('derived decision signals', () => {
  it('does not describe missing marine inputs as low risk', () => {
    const signal = getMarineConditionSignal({ waveM: null, windKts: null, gustKts: null });

    expect(signal.level).toBe('Unknown');
    expect(signal.completeness).toBe('none');
    expect(signal.text).toContain('unavailable');
  });

  it('uses gust-only marine data and preserves partial-input disclosure', () => {
    const signal = getMarineConditionSignal({ waveM: null, windKts: null, gustKts: 38 });

    expect(signal.level).toBe('Extreme');
    expect(signal.completeness).toBe('partial');
    expect(signal.text).toContain('unavailable');
  });

  it('takes the more severe available marine input', () => {
    const signal = getMarineConditionSignal({ waveM: 3.2, windKts: 8, gustKts: 11 });

    expect(signal.level).toBe('Extreme');
    expect(signal.completeness).toBe('complete');
  });

  it('marks SkyScore as insufficient without cloud data and avoids perfect fallbacks', () => {
    const result = computeSkyScorePoint({
      input: {
        lat: 33.45,
        lon: -111.8,
        cloudTotal: null,
        cloudLow: null,
        cloudMid: null,
        cloudHigh: null,
        visibilityM: null,
        windMps: null,
        gustMps: null,
        humidityPct: null,
        aerosolIndex: null,
        bortleClass: null,
        elevationM: null,
      },
      darknessScore: 1,
    });

    expect(result.quality.status).toBe('insufficient');
    expect(result.parts.surfaceStability).toBe(0.5);
    expect(result.parts.seeing).toBe(result.parts.surfaceStability);
    expect(result.parts.moon).toBe(0.5);
    expect(result.parts.aerosols).toBe(0.5);
    expect(result.score).toBeLessThan(55);
  });

  it('reports complete SkyScore inputs while retaining the compatibility alias', () => {
    const result = computeSkyScorePoint({
      input: {
        lat: 33.45,
        lon: -111.8,
        cloudTotal: 5,
        cloudLow: 2,
        cloudMid: 3,
        cloudHigh: 5,
        visibilityM: 24000,
        windMps: 3,
        gustMps: 5,
        humidityPct: 35,
        aerosolIndex: 0.1,
        bortleClass: 3,
        elevationM: 900,
      },
      darknessScore: 1,
      moonIsUp: false,
      moonIlluminationPct: 20,
    });

    expect(result.quality.status).toBe('complete');
    expect(result.parts.surfaceStability).toBe(result.parts.seeing);
    expect(result.score).toBeGreaterThan(55);
  });
});
