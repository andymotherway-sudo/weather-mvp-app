// app/lib/alerts/nws.ts
export type NWSAlert = {
  id: string;
  event: string; // e.g., "Winter Weather Advisory"
  headline?: string;
  severity?: string; // Extreme/Severe/Moderate/Minor/Unknown
  urgency?: string; // Immediate/Expected/Future/Past/Unknown
  certainty?: string;
  effective?: string | null; // ISO
  onset?: string | null; // ISO
  ends?: string | null; // ISO
  expires?: string | null; // ISO
  areaDesc?: string;
  description?: string;
  instruction?: string;
  sent?: string | null; // ISO
  senderName?: string;
};

const NWS_BASE = 'https://api.weather.gov';

function safeIso(v: any): string | null {
  if (!v || typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function severityRank(sev?: string): number {
  switch ((sev ?? '').toLowerCase()) {
    case 'extreme':
      return 4;
    case 'severe':
      return 3;
    case 'moderate':
      return 2;
    case 'minor':
      return 1;
    default:
      return 0;
  }
}

export function urgencyRank(u?: string): number {
  switch ((u ?? '').toLowerCase()) {
    case 'immediate':
      return 4;
    case 'expected':
      return 3;
    case 'future':
      return 2;
    case 'past':
      return 1;
    default:
      return 0;
  }
}

export function pickPrimaryAlert(alerts: NWSAlert[]): NWSAlert | null {
  if (!alerts.length) return null;
  const sorted = [...alerts].sort((a, b) => {
    const s = severityRank(b.severity) - severityRank(a.severity);
    if (s !== 0) return s;
    const u = urgencyRank(b.urgency) - urgencyRank(a.urgency);
    if (u !== 0) return u;

    // tiebreaker: soonest end (more "active/urgent")
    const aEnd = a.ends ? new Date(a.ends).getTime() : Number.POSITIVE_INFINITY;
    const bEnd = b.ends ? new Date(b.ends).getTime() : Number.POSITIVE_INFINITY;
    return aEnd - bEnd;
  });
  return sorted[0] ?? null;
}

export async function fetchNwsAlertsByPoint(lat: number, lon: number): Promise<NWSAlert[]> {
  // NWS wants a User-Agent header for good behavior
  const url = `${NWS_BASE}/alerts/active?point=${lat},${lon}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'omniwx (dev)',
      Accept: 'application/geo+json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`NWS alerts failed (${res.status}): ${text.slice(0, 120)}`);
  }

  const json = await res.json();
  const features = Array.isArray(json?.features) ? json.features : [];

  const alerts: NWSAlert[] = features
    .map((f: any) => {
      const p = f?.properties ?? {};
      const id = String(f?.id ?? p?.id ?? `${p?.event ?? 'alert'}-${p?.sent ?? ''}`);
      return {
        id,
        event: String(p?.event ?? 'Weather Alert'),
        headline: p?.headline ? String(p.headline) : undefined,
        severity: p?.severity ? String(p.severity) : undefined,
        urgency: p?.urgency ? String(p.urgency) : undefined,
        certainty: p?.certainty ? String(p.certainty) : undefined,
        effective: safeIso(p?.effective),
        onset: safeIso(p?.onset),
        ends: safeIso(p?.ends),
        expires: safeIso(p?.expires),
        sent: safeIso(p?.sent),
        areaDesc: p?.areaDesc ? String(p.areaDesc) : undefined,
        description: p?.description ? String(p.description) : undefined,
        instruction: p?.instruction ? String(p.instruction) : undefined,
        senderName: p?.senderName ? String(p.senderName) : undefined,
      } as NWSAlert;
    })
    .filter((a: NWSAlert) => !!a.event);

  return alerts;
}
