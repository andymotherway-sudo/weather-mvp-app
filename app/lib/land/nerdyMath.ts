
export function fToC(f: number) {
  return (f - 32) * (5 / 9);
}
export function cToF(c: number) {
  return c * (9 / 5) + 32;
}

export function dewPointBandF(dpF: number): string {
  // Simple, familiar bands
  if (dpF < 50) return 'Dry';
  if (dpF < 60) return 'Comfortable';
  if (dpF < 65) return 'Humid';
  if (dpF < 70) return 'Muggy';
  return 'Oppressive';
}

export function heatIndexF(tF: number, rhPct: number): number | null {
  // Only valid-ish for warm temps
  if (tF < 80 || rhPct < 40) return null;
  const T = tF;
  const R = rhPct;
  const HI =
    -42.379 +
    2.04901523 * T +
    10.14333127 * R -
    0.22475541 * T * R -
    0.00683783 * T * T -
    0.05481717 * R * R +
    0.00122874 * T * T * R +
    0.00085282 * T * R * R -
    0.00000199 * T * T * R * R;
  return HI;
}

export function windChillF(tF: number, windMph: number): number | null {
  // NWS wind chill formula conditions
  if (tF > 50 || windMph <= 3) return null;
  const WC =
    35.74 +
    0.6215 * tF -
    35.75 * Math.pow(windMph, 0.16) +
    0.4275 * tF * Math.pow(windMph, 0.16);
  return WC;
}

export function gustFactor(windMph: number | null, gustMph: number | null): number | null {
  if (windMph == null || gustMph == null) return null;
  if (windMph <= 0) return null;
  return gustMph / windMph;
}
