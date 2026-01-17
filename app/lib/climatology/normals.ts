// app/lib/climatology/normals.ts
import { nceiData } from './ncei';
import type { MonthlyNormalsF } from './types';
import { ClimoError } from './types';

/**
 * Monthly normals (temperature) from NORMAL_MLY.
 * Datatypes used:
 * - MLY-TAVG-NORMAL
 * - MLY-TMIN-NORMAL
 * - MLY-TMAX-NORMAL
 *
 * Values returned are in tenths of °F (divide by 10). :contentReference[oaicite:2]{index=2}
 *
 * Requires NOAA token. :contentReference[oaicite:3]{index=3}
 */
export async function fetchMonthlyTempNormalsF(
  stationId: string,
  token?: string,
  signal?: AbortSignal
): Promise<MonthlyNormalsF[]> {
  if (!token) throw new ClimoError('NO_TOKEN', 'NOAA token is required for normals fetch.');

  // NORMAL_MLY requires startdate/enddate in the request.
  // A common pattern: use a single year window; the dataset returns monthly normals.
  // We use 2010 as a harmless placeholder year.
  const startdate = '2010-01-01';
  const enddate = '2010-12-31';

  const json = await nceiData(
    {
      datasetid: 'NORMAL_MLY',
      stationid: stationId,
      startdate,
      enddate,
      limit: 1000,
      // Multiple datatypeid entries are allowed (repeat param)
      // Our URL builder sets single values, so we’ll inline manually below if needed.
    },
    token,
    signal
  );

  // If your NCEI instance doesn’t accept repeating datatypeid through our builder,
  // re-request using manual URL build. Safer approach: do 3 calls.
  // We'll do 3 calls (still fast + simple).

  const [tavg, tmin, tmax] = await Promise.all([
    nceiData(
      { datasetid: 'NORMAL_MLY', stationid: stationId, startdate, enddate, datatypeid: 'MLY-TAVG-NORMAL', limit: 1000 },
      token,
      signal
    ),
    nceiData(
      { datasetid: 'NORMAL_MLY', stationid: stationId, startdate, enddate, datatypeid: 'MLY-TMIN-NORMAL', limit: 1000 },
      token,
      signal
    ),
    nceiData(
      { datasetid: 'NORMAL_MLY', stationid: stationId, startdate, enddate, datatypeid: 'MLY-TMAX-NORMAL', limit: 1000 },
      token,
      signal
    ),
  ]);

  const rows = new suggestsMonths();

  function ingest(payload: any, kind: 'tavg' | 'tmin' | 'tmax') {
    const res = (payload?.results ?? []) as any[];
    for (const r of res) {
      // r.date often looks like "2010-01-01T00:00:00"
      const dateStr = String(r.date ?? '');
      const m = parseMonthFromDate(dateStr);
      if (!m) continue;

      const v = Number(r.value);
      if (!Number.isFinite(v)) continue;

      // tenths of °F -> °F
      const f = v / 10;

      rows.set(kind, m, f);
    }
  }

  ingest(tavg, 'tavg');
  ingest(tmin, 'tmin');
  ingest(tmax, 'tmax');

  const out: MonthlyNormalsF[] = [];
  for (let month = 1; month <= 12; month++) {
    out.push({
      month,
      tavgF: rows.get('tavg', month),
      tminF: rows.get('tmin', month),
      tmaxF: rows.get('tmax', month),
    });
  }

  const any = out.some((m) => m.tavgF != null || m.tminF != null || m.tmaxF != null);
  if (!any) throw new ClimoError('NO_DATA', 'No monthly normals returned by NOAA for this station.', { stationId });

  return out;
}

function parseMonthFromDate(dateStr: string): number | null {
  // "2010-01-01T00:00:00" -> 01
  if (!dateStr || dateStr.length < 7) return null;
  const m = Number(dateStr.slice(5, 7));
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return m;
}

class suggestsMonths {
  private map = new Map<string, number>();
  set(kind: 'tavg' | 'tmin' | 'tmax', month: number, value: number) {
    this.map.set(`${kind}:${month}`, value);
  }
  get(kind: 'tavg' | 'tmin' | 'tmax', month: number): number | null {
    const v = this.map.get(`${kind}:${month}`);
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
}
