// app/lib/climatology/normals.ts
import { nceiData } from './ncei';
import type { MonthlyNormalsF } from './types';
import { ClimoError } from './types';

/**
 * Monthly normals (temperature) from NORMAL_MLY (CDO API).
 * ✅ Worker-proxied: token is optional (Worker holds the token).
 */
export async function fetchMonthlyTempNormalsF(
  stationId: string,
  token?: string,
  signal?: AbortSignal
): Promise<MonthlyNormalsF[]> {
  const startdate = '2010-01-01';
  const enddate = '2010-12-31';

  const tavg = await nceiData(
    {
      datasetid: 'NORMAL_MLY',
      stationid: stationId,
      startdate,
      enddate,
      datatypeid: 'MLY-TAVG-NORMAL',
      units: 'standard',
      limit: 1000,
    },
    token,
    signal
  );
  const tmin = await nceiData(
    {
      datasetid: 'NORMAL_MLY',
      stationid: stationId,
      startdate,
      enddate,
      datatypeid: 'MLY-TMIN-NORMAL',
      units: 'standard',
      limit: 1000,
    },
    token,
    signal
  );
  const tmax = await nceiData(
    {
      datasetid: 'NORMAL_MLY',
      stationid: stationId,
      startdate,
      enddate,
      datatypeid: 'MLY-TMAX-NORMAL',
      units: 'standard',
      limit: 1000,
    },
    token,
    signal
  );

  const rows = new MonthsGrid();

  function normUnits(u: any): string {
    return String(u ?? '').trim().toLowerCase();
  }

  function unitHintFromPayload(payload: any): string {
    return normUnits(payload?.metadata?.units || payload?.units || payload?.results?.[0]?.units);
  }

  function normalizeTempToF(valueRaw: number, unitsHint: string): number {
    const u = normUnits(unitsHint);

    let v = valueRaw;
    if (u.includes('tenth') || u.includes('tenths')) v = v / 10;

    if (u.includes('c') || u.includes('celsius') || u.includes('degc') || u.includes('°c')) {
      return (v * 9) / 5 + 32;
    }

    if (u.includes('f') || u.includes('fahrenheit') || u.includes('degf') || u.includes('°f')) {
      return v;
    }

    if (Math.abs(valueRaw) > 150) {
      return valueRaw / 10;
    }

    return valueRaw;
  }

  function ingest(payload: any, kind: 'tavg' | 'tmin' | 'tmax') {
    const res = (payload?.results ?? []) as any[];
    const payloadUnits = unitHintFromPayload(payload);

    for (const r of res) {
      const dateStr = String(r.date ?? '');
      const m = parseMonthFromDate(dateStr);
      if (!m) continue;

      const v = Number(r.value);
      if (!Number.isFinite(v)) continue;

      const rowUnits = normUnits(r.units) || payloadUnits;
      const f = normalizeTempToF(v, rowUnits);

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

/**
 * Monthly precip normals (inches) from NORMAL_MLY (CDO API).
 * ✅ Worker-proxied: token is optional (Worker holds the token).
 */
export async function fetchMonthlyPrecipNormalsIn(
  stationId: string,
  token?: string,
  signal?: AbortSignal
): Promise<Array<number | null>> {
  const startdate = '2010-01-01';
  const enddate = '2010-12-31';

  const prcp = await nceiData(
    {
      datasetid: 'NORMAL_MLY',
      stationid: stationId,
      startdate,
      enddate,
      datatypeid: 'MLY-PRCP-NORMAL',
      units: 'standard',
      limit: 1000,
    },
    token,
    signal
  );

  const out: Array<number | null> = Array.from({ length: 12 }, () => null);

  const res = (prcp?.results ?? []) as any[];
  for (const r of res) {
    const dateStr = String(r.date ?? '');
    const m = parseMonthFromDate(dateStr);
    if (!m) continue;

    const v = Number(r.value);
    if (!Number.isFinite(v)) continue;

    const rowUnits = String(r.units ?? prcp?.metadata?.units ?? prcp?.units ?? prcp?.results?.[0]?.units ?? '')
      .trim()
      .toLowerCase();
    let inches = v;
    if (rowUnits.includes('tenth') || rowUnits.includes('tenths')) inches = inches / 10;
    if (rowUnits.includes('mm') || rowUnits.includes('millimeter')) inches = inches / 25.4;
    if (inches < 0) continue;

    out[m - 1] = inches;
  }

  const any = out.some((x) => x != null);
  if (!any) throw new ClimoError('NO_DATA', 'No precip normals returned by NOAA for this station.', { stationId });

  return out;
}

function parseMonthFromDate(dateStr: string): number | null {
  if (!dateStr || dateStr.length < 7) return null;
  const m = Number(dateStr.slice(5, 7));
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return m;
}

class MonthsGrid {
  private map = new Map<string, number>();
  set(kind: 'tavg' | 'tmin' | 'tmax', month: number, value: number) {
    this.map.set(`${kind}:${month}`, value);
  }
  get(kind: 'tavg' | 'tmin' | 'tmax', month: number): number | null {
    const v = this.map.get(`${kind}:${month}`);
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
}
