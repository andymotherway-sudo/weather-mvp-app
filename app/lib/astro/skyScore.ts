// app/lib/astro/skyScore.ts
import type { AstroInputs } from './openMeteoAstro';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pct01(p: number | null) {
  if (p == null) return null;
  return clamp(p / 100, 0, 1);
}

export type SkyScorePoint = { lat: number; lon: number; score: number; parts: { weather: number; darkness: number } };

export function computeSkyScoreGrid(args: {
  inputs: AstroInputs[];
  // 0..1 darkness score (Bortle/VIIRS). For now default 1 and plug later.
  darknessScoreAt?: (lat: number, lon: number) => number;
}): SkyScorePoint[] {
  const darknessScoreAt = args.darknessScoreAt ?? (() => 1);

  return args.inputs.map((p) => {
    // --- Weather score (0..1)
    // Weight high clouds as most damaging to transparency.
    const low = pct01(p.cloudLow) ?? 0;
    const mid = pct01(p.cloudMid) ?? 0;
    const high = pct01(p.cloudHigh) ?? 0;

    // “clear fraction” style
    const cloudPenalty = clamp(0.35 * low + 0.55 * mid + 0.85 * high, 0, 1);

    // Visibility: treat <10km as haze; >20km as good (rough; tune later)
    const visKm = p.visibilityM != null ? p.visibilityM / 1000 : null;
    const visPenalty =
      visKm == null ? 0.15 : clamp((20 - clamp(visKm, 0, 20)) / 20, 0, 1) * 0.6;

    // Wind/gust penalty (seeing/stability proxy)
    const gust = p.gustMps ?? p.windMps ?? 0;
    const windPenalty = clamp((gust - 6) / 14, 0, 1) * 0.35; // >6 m/s starts to hurt; tune

    const weather01 = clamp(1 - (cloudPenalty * 0.75 + visPenalty + windPenalty), 0, 1);

    // --- Darkness multiplier (0..1)
    const darkness01 = clamp(darknessScoreAt(p.lat, p.lon), 0, 1);

    const score01 = clamp(weather01 * darkness01, 0, 1);
    const score = Math.round(score01 * 100);

    return { lat: p.lat, lon: p.lon, score, parts: { weather: weather01, darkness: darkness01 } };
  });
}
