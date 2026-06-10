import { fetchWithTimeout } from '../net/fetchWithTimeout';

export type SatelliteFrame = {
  index: number;
  iso: string;
  sourceName?: string;
  rasterId?: number;
};

export const SATELLITE_LOOP_MINUTES_BACK = 120;
export const SATELLITE_FRAME_STEP_MINUTES = 5;
export const SATELLITE_PLAY_INTERVAL_MS = 950;
export const SATELLITE_WARM_OPACITY = 0.01;
export const SATELLITE_LOOP_HOUR_OPTIONS = [2, 3, 5] as const;
export type SatelliteLoopHours = (typeof SATELLITE_LOOP_HOUR_OPTIONS)[number];

export const GIBS_DAILY_FRAME_COUNT = 5;
export const GIBS_IMERG_FRAME_STEP_MINUTES = 30;
const GIBS_IMERG_SOURCE_LAG_MINUTES = 12 * 60;

export const NESDIS_GEOCOLOR_ARCHIVE_EXPORT_URL =
  'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/MERGEDGC_Last_24hr/ImageServer/exportImage';
export const NESDIS_ABI13_ARCHIVE_EXPORT_URL =
  'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/ABI13_Last_24hr/ImageServer/exportImage';
const GIBS_WMTS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

export function arcGisLockedRasterParam(rasterId?: number | null) {
  if (rasterId == null || !Number.isFinite(rasterId)) return '';
  return `&mosaicRule=${encodeURIComponent(
    JSON.stringify({ mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [Math.round(rasterId)] }),
  )}`;
}

export function arcGisImageServerTileTemplate(
  baseUrl: string,
  iso?: string | null,
  tileSize = 512,
  rasterId?: number | null,
) {
  const timeMs = iso ? new Date(iso).getTime() : Number.NaN;
  const timeParam = Number.isFinite(timeMs) ? `&time=${Math.round(timeMs)}` : '';
  const mosaicParam = arcGisLockedRasterParam(rasterId);
  const size = Math.max(512, Math.min(1024, Math.round(tileSize)));
  return `${baseUrl}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=${size},${size}&format=png32&transparent=true${timeParam}${mosaicParam}&f=image`;
}

function isoDateDaysAgo(daysAgo: number, now = new Date()) {
  const d = new Date(now.getTime() - Math.max(0, daysAgo) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function gibsWmtsTileTemplate(args: {
  layer: string;
  matrixSet: string;
  extension: 'jpeg' | 'png';
  time?: string | null;
}) {
  const timePath = args.time?.trim() ? `/${encodeURIComponent(args.time.trim())}` : '';
  return `${GIBS_WMTS_BASE}/${args.layer}/default${timePath}/${args.matrixSet}/{z}/{y}/{x}.${args.extension}`;
}

export function buildSatelliteFrames(opts?: { minutesBack?: number; stepMinutes?: number; now?: Date }): SatelliteFrame[] {
  const minutesBack = opts?.minutesBack ?? SATELLITE_LOOP_MINUTES_BACK;
  const stepMinutes = opts?.stepMinutes ?? SATELLITE_FRAME_STEP_MINUTES;
  const now = opts?.now ?? new Date();
  if (minutesBack <= 0 || stepMinutes <= 0) return [];

  const alignedMs = Math.floor(now.getTime() / (stepMinutes * 60_000)) * stepMinutes * 60_000;
  const latestMs = alignedMs - stepMinutes * 60_000;
  const frameCount = Math.floor(minutesBack / stepMinutes) + 1;

  return Array.from({ length: frameCount }, (_, index) => {
    const minutesAgo = (frameCount - 1 - index) * stepMinutes;
    return { index, iso: new Date(latestMs - minutesAgo * 60_000).toISOString() };
  });
}

export function buildGibsDailyFrames(opts?: { days?: number; now?: Date }): SatelliteFrame[] {
  const count = Math.max(2, Math.round(opts?.days ?? GIBS_DAILY_FRAME_COUNT));
  const now = opts?.now ?? new Date();
  return Array.from({ length: count }, (_, index) => {
    const daysAgo = count - index;
    const date = isoDateDaysAgo(daysAgo, now);
    return { index, iso: `${date}T12:00:00.000Z` };
  });
}

export function buildGibsImergFrames(opts?: { minutesBack?: number; now?: Date }): SatelliteFrame[] {
  const minutesBack = Math.max(GIBS_IMERG_FRAME_STEP_MINUTES, opts?.minutesBack ?? SATELLITE_LOOP_MINUTES_BACK);
  const now = opts?.now ?? new Date();
  const stepMs = GIBS_IMERG_FRAME_STEP_MINUTES * 60_000;
  const sourceLagMs = GIBS_IMERG_SOURCE_LAG_MINUTES * 60_000;
  const alignedMs = Math.floor((now.getTime() - sourceLagMs) / stepMs) * stepMs;
  const frameCount = Math.floor(minutesBack / GIBS_IMERG_FRAME_STEP_MINUTES) + 1;

  return Array.from({ length: frameCount }, (_, index) => {
    const minutesAgo = (frameCount - 1 - index) * GIBS_IMERG_FRAME_STEP_MINUTES;
    return { index, iso: new Date(alignedMs - minutesAgo * 60_000).toISOString() };
  });
}

export function gibsDailyTime(frame?: { iso?: string | null } | null) {
  const iso = frame?.iso;
  if (!iso) return isoDateDaysAgo(1);
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return isoDateDaysAgo(1);
  return new Date(ms).toISOString().slice(0, 10);
}

export function gibsHalfHourTime(frame?: { iso?: string | null } | null) {
  const iso = frame?.iso;
  const ms = iso ? new Date(iso).getTime() : Number.NaN;
  if (!Number.isFinite(ms)) return null;
  const stepMs = GIBS_IMERG_FRAME_STEP_MINUTES * 60_000;
  return new Date(Math.floor(ms / stepMs) * stepMs).toISOString().replace('.000Z', 'Z');
}

async function fetchNesdisImageServerFrames(exportUrl: string, minutesBack: number): Promise<SatelliteFrame[]> {
  const query = new URL(`${exportUrl.replace(/\/exportImage$/, '')}/query`);
  query.searchParams.set('f', 'json');
  query.searchParams.set('where', 'end_time is not null');
  query.searchParams.set('outFields', 'objectid,name,start_time,end_time');
  query.searchParams.set('returnGeometry', 'false');
  query.searchParams.set('orderByFields', 'end_time desc');
  query.searchParams.set('resultRecordCount', '240');

  const res = await fetchWithTimeout(query.toString(), 14000);
  if (!res.ok) throw new Error(`NESDIS catalog returned ${res.status}.`);
  const json = await res.json();
  const features = Array.isArray(json?.features) ? json.features : [];
  const cutoff = Date.now() - Math.max(30, minutesBack + 30) * 60_000;
  const seen = new Set<string>();

  const frames = features
    .map((feature: any) => {
      const attrs = feature?.attributes ?? {};
      const objectId = Number(attrs.objectid ?? attrs.OBJECTID ?? attrs.ObjectID);
      const start = Number(attrs.start_time ?? attrs.Start_Time);
      const end = Number(attrs.end_time ?? attrs.End_Time);
      const name = String(attrs.name ?? attrs.Name ?? '');
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < cutoff) return null;

      const midpoint = start + Math.max(0, Math.min(end - start, 4 * 60_000));
      const key = name || String(end);
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        index: 0,
        iso: new Date(midpoint).toISOString(),
        sourceName: name || undefined,
        rasterId: Number.isFinite(objectId) ? objectId : undefined,
      } satisfies SatelliteFrame;
    })
    .filter(Boolean) as SatelliteFrame[];

  return frames
    .sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime())
    .map((frame: SatelliteFrame, index: number) => ({ ...frame, index }));
}

export async function fetchNesdisGeoColorFrames(minutesBack: number): Promise<SatelliteFrame[]> {
  return fetchNesdisImageServerFrames(NESDIS_GEOCOLOR_ARCHIVE_EXPORT_URL, minutesBack);
}

export async function fetchNesdisAbi13Frames(minutesBack: number): Promise<SatelliteFrame[]> {
  return fetchNesdisImageServerFrames(NESDIS_ABI13_ARCHIVE_EXPORT_URL, minutesBack);
}
