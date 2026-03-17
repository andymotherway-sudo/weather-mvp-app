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
  note?: string;
  fullText?: string;
  sent?: string | null; // ISO
  senderName?: string;
};

const NWS_BASE = 'https://api.weather.gov';

function safeIso(v: any): string | null {
  if (!v || typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function cleanText(v: any): string | undefined {
  if (typeof v !== 'string') return undefined;

  const s = v
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return s ? s : undefined;
}

function buildFullText(p: any): string | undefined {
  const headline = cleanText(p?.headline);
  const description = cleanText(p?.description);
  const instruction = cleanText(p?.instruction);
  const note = cleanText(p?.note);

  const parts = [
    headline,
    description,
    instruction ? `Instructions: ${instruction}` : undefined,
    note ? `Note: ${note}` : undefined,
  ].filter(Boolean) as string[];

  if (!parts.length) return undefined;
  return parts.join('\n\n');
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

function activeEndTs(alert: NWSAlert): number {
  const iso = alert.ends ?? alert.expires;
  if (!iso) return Number.POSITIVE_INFINITY;
  const ts = new Date(iso).getTime();
  return Number.isNaN(ts) ? Number.POSITIVE_INFINITY : ts;
}

export function pickPrimaryAlert(alerts: NWSAlert[]): NWSAlert | null {
  if (!alerts.length) return null;

  const sorted = [...alerts].sort((a, b) => {
    const s = severityRank(b.severity) - severityRank(a.severity);
    if (s !== 0) return s;

    const u = urgencyRank(b.urgency) - urgencyRank(a.urgency);
    if (u !== 0) return u;

    // Tiebreaker: sooner end/expires first
    const endDiff = activeEndTs(a) - activeEndTs(b);
    if (endDiff !== 0) return endDiff;

    // Final tiebreaker: most recently sent first
    const aSent = a.sent ? new Date(a.sent).getTime() : 0;
    const bSent = b.sent ? new Date(b.sent).getTime() : 0;
    return bSent - aSent;
  });

  return sorted[0] ?? null;
}

export async function fetchNwsAlertsByPoint(lat: number, lon: number): Promise<NWSAlert[]> {
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

      const headline = cleanText(p?.headline);
      const description = cleanText(p?.description);
      const instruction = cleanText(p?.instruction);
      const note = cleanText(p?.note);

      return {
        id,
        event: String(p?.event ?? 'Weather Alert'),
        headline,
        severity: p?.severity ? String(p.severity) : undefined,
        urgency: p?.urgency ? String(p.urgency) : undefined,
        certainty: p?.certainty ? String(p.certainty) : undefined,
        effective: safeIso(p?.effective),
        onset: safeIso(p?.onset),
        ends: safeIso(p?.ends),
        expires: safeIso(p?.expires),
        sent: safeIso(p?.sent),
        areaDesc: cleanText(p?.areaDesc),
        description,
        instruction,
        note,
        fullText: buildFullText(p),
        senderName: p?.senderName ? String(p.senderName) : undefined,
      } as NWSAlert;
    })
    .filter((a: NWSAlert) => !!a.event);

  return alerts;
}