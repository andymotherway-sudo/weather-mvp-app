// app/lib/land/nerdyInsights.ts
import type { ForecastHour } from '../openmeteo/hooks';

export type NerdyInsight = {
  id: string;
  title: string;
  value: string;
  badge?: string;
  explain: {
    summary: string;
    whyItMatters?: string;
    howComputed?: string;
    confidence?: 'high' | 'medium' | 'low';
    learnTopicId?: string;
  };
};

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function pick(h: ForecastHour, key: string): number | null {
  const any = h as any;
  switch (key) {
    case 'pressureHpa':
      return safeNum(any.pressureHpa ?? any.mslPressureHpa ?? any.pressure);
    case 'cloudPct':
      return safeNum(any.cloudCoverPct ?? any.cloudPct ?? any.cloudsPct);
    case 'shortwaveWm2':
      return safeNum(any.shortwaveRadiationWm2 ?? any.shortwaveWm2 ?? any.solarWm2);
    default:
      return safeNum(any[key]);
  }
}

function fmt(n: number, digits = 0) {
  return digits ? n.toFixed(digits) : `${Math.round(n)}`;
}

/** Δ pressure over N hours, using first/last valid samples */
function pressureDelta(hours: ForecastHour[], lookbackHours: number) {
  if (hours.length < 2) return null;

  const endIdx = Math.min(hours.length - 1, Math.max(1, lookbackHours));
  // Use first valid near start and last valid near end
  let p0: number | null = null;
  let t0 = '';
  for (let i = 0; i <= endIdx; i++) {
    const p = pick(hours[i], 'pressureHpa');
    if (p != null) {
      p0 = p;
      t0 = (hours[i] as any).time ?? '';
      break;
    }
  }
  let p1: number | null = null;
  let t1 = '';
  for (let i = endIdx; i >= 0; i--) {
    const p = pick(hours[i], 'pressureHpa');
    if (p != null) {
      p1 = p;
      t1 = (hours[i] as any).time ?? '';
      break;
    }
  }
  if (p0 == null || p1 == null) return null;
  return { dp: p1 - p0, t0, t1, spanH: endIdx };
}

export function pressureRegime(hours: ForecastHour[]) {
  // Use ~3h tendency if possible
  const d = pressureDelta(hours, 3);
  if (!d) return null;

  const rate = d.dp; // hPa per ~3h
  const abs = Math.abs(rate);

  let label = 'Steady';
  let outcome = 'Little organized change implied by pressure trend alone.';
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  if (abs < 0.6) {
    label = 'Steady';
    outcome = 'Often stagnant pattern; clouds/fog can linger if winds stay light.';
  } else if (rate <= -0.6 && rate > -1.8) {
    label = 'Falling';
    outcome = 'More lift nearby; clouds may increase and winds can pick up or shift.';
  } else if (rate <= -1.8) {
    label = 'Falling fast';
    outcome = 'Stronger signal for an approaching system/front; rising wind and increasing clouds are common.';
    confidence = 'high';
  } else if (rate >= 0.6 && rate < 1.8) {
    label = 'Rising';
    outcome = 'Often drying/clearing as sinking air increases; winds may ease.';
  } else if (rate >= 1.8) {
    label = 'Rising fast';
    outcome = 'Strong stabilization/clearing signal; rapid drying and improving conditions are common.';
    confidence = 'high';
  }

  return { label, rate3h: rate, outcome, confidence };
}

export function buildNerdyInsights(args: {
  tempF: number | null;
  dewpointF: number | null;
  humidityPct: number | null;
  windMph: number | null;
  gustMph: number | null;
  hourly: ForecastHour[];
}) {
  const { tempF, dewpointF, humidityPct, windMph, gustMph, hourly } = args;

  const insights: NerdyInsight[] = [];

  // 1) Thermal spread
  if (tempF != null && dewpointF != null) {
    const spread = tempF - dewpointF;
    const fogRisk =
      spread <= 2 ? 'High fog/dew risk' : spread <= 5 ? 'Some fog/dew risk' : 'Low fog risk';

    insights.push({
      id: 'thermal_spread',
      title: 'Thermal Spread',
      value: `${fmt(spread)}°F`,
      badge: fogRisk,
      explain: {
        summary:
          'Thermal spread is Temperature minus Dew Point. Small spreads mean the air is close to saturation.',
        whyItMatters:
          'When spread is tiny (often < 3°F), a little cooling can produce fog, dew, or frost—especially overnight with light wind.',
        howComputed: `Spread = T (${fmt(tempF)}°F) − DP (${fmt(dewpointF)}°F) = ${fmt(spread)}°F`,
        confidence: 'high',
        learnTopicId: 'thermal_spread',
      },
    });
  }

  // 2) Moisture (dew point “feel”)
  if (dewpointF != null) {
    const band =
      dewpointF < 30 ? 'Very dry' :
      dewpointF < 45 ? 'Dry' :
      dewpointF < 55 ? 'Comfortable' :
      dewpointF < 65 ? 'Humid' : 'Very humid';

    insights.push({
      id: 'dewpoint_band',
      title: 'Moisture Level',
      value: `${fmt(dewpointF)}°F DP`,
      badge: band,
      explain: {
        summary: 'Dew point is the most direct “how much moisture is in the air” number.',
        whyItMatters:
          'Dew point tracks how sticky/dry the air feels and influences fog potential and nighttime cooling.',
        howComputed: 'Uses the reported dew point from your current conditions source.',
        confidence: 'high',
        learnTopicId: 'dewpoint',
      },
    });
  }

  // 3) Gust factor (wow + actionable)
  if (windMph != null && gustMph != null && windMph > 0) {
    const gf = gustMph / windMph;
    const feel =
      gf >= 2.0 ? 'Very gusty' : gf >= 1.6 ? 'Gusty' : gf >= 1.3 ? 'Some gusts' : 'Steady wind';

    insights.push({
      id: 'gust_factor',
      title: 'Gust Factor',
      value: gf.toFixed(2),
      badge: feel,
      explain: {
        summary:
          'Gust factor compares gusts to sustained wind. Higher values mean turbulence / mixing / bursts.',
        whyItMatters:
          'High gust factors can mean turbulent low-level flow (terrain, fronts, mixing). It affects comfort and wind-sensitive plans.',
        howComputed: `Gust factor = Gust (${fmt(gustMph)} mph) ÷ Wind (${fmt(windMph)} mph) = ${gf.toFixed(2)}`,
        confidence: 'medium',
      },
    });
  }

  // 4) Pressure regime + outcome (big wow)
  const pr = pressureRegime(hourly);
  if (pr) {
    insights.push({
      id: 'pressure_regime',
      title: 'Pressure Regime',
      value: `${pr.label}`,
      badge: `${pr.rate3h >= 0 ? '↗' : '↘'} ${Math.abs(pr.rate3h).toFixed(2)} hPa / ~3h`,
      explain: {
        summary: pr.outcome,
        whyItMatters:
          'Pressure trend is a powerful “big picture” clue: it often leads changes in wind, clouds, and precipitation.',
        howComputed:
          'Compute Δ pressure using the last ~3 hours of forecast pressure (first valid vs last valid sample).',
        confidence: pr.confidence,
        learnTopicId: 'pressure',
      },
    });
  }

  // 5) Radiation regime (if Open-Meteo provides shortwave)
  const sw = hourly.length ? pick(hourly[0], 'shortwaveWm2') : null;
  const cl = hourly.length ? pick(hourly[0], 'cloudPct') : null;

  if (sw != null || cl != null) {
    const swText = sw != null ? `${fmt(sw)} W/m²` : '—';
    const clText = cl != null ? `${fmt(cl)}%` : '—';

    let badge = 'Mixed';
    if (sw != null && sw > 350 && (cl == null || cl < 35)) badge = 'Strong heating';
    else if (sw != null && sw < 120 && (cl == null || cl > 60)) badge = 'Muted heating';
    else if (cl != null && cl > 75) badge = 'Cloud-dominated';

    insights.push({
      id: 'radiation_regime',
      title: 'Radiation Regime',
      value: badge,
      badge: `SW ${swText} · ☁ ${clText}`,
      explain: {
        summary:
          'Shortwave radiation approximates sunlight reaching the surface. Clouds strongly modulate it.',
        whyItMatters:
          'More shortwave → stronger daytime warming and mixing (often changing wind/humidity). Less shortwave → slower warming and more stable air.',
        howComputed:
          'Uses Open-Meteo hourly shortwave radiation (if available) and cloud cover for a quick qualitative regime.',
        confidence: 'medium',
        learnTopicId: 'radiation',
      },
    });
  }

  // Optional: RH context (if present)
  if (humidityPct != null) {
    insights.push({
      id: 'humidity_context',
      title: 'Relative Humidity',
      value: `${fmt(humidityPct)}%`,
      explain: {
        summary:
          'Relative humidity depends on temperature — it can change a lot without moisture changing much.',
        whyItMatters:
          'Use dew point for moisture. Use RH mainly for comfort, fog potential, and drying rate context.',
        howComputed: 'Uses reported RH from current conditions source.',
        confidence: 'high',
        learnTopicId: 'dewpoint',
      },
    });
  }

  return insights;
}
