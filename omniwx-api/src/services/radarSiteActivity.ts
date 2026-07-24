import type { D1DatabaseLike } from "../database/queries";

export type RadarSiteActivityRecord = {
  siteId: string;
  lastRequestedAt: string;
  requestCount: number;
  createdAt: string;
  updatedAt: string;
};

type RadarSiteActivityRow = {
  site_id: string;
  last_requested_at: string;
  request_count: number | null;
  created_at: string;
  updated_at: string;
};

async function ensureRadarSiteActivityTable(db: D1DatabaseLike) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS radar_site_activity (
      site_id TEXT PRIMARY KEY,
      last_requested_at TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).bind().run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_radar_site_activity_last_requested
      ON radar_site_activity(last_requested_at DESC)
  `).bind().run();
}

function mapRow(row: RadarSiteActivityRow): RadarSiteActivityRecord {
  return {
    siteId: row.site_id,
    lastRequestedAt: row.last_requested_at,
    requestCount: typeof row.request_count === "number" ? row.request_count : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function recordRadarSiteActivity(db: D1DatabaseLike, siteId: string, nowIso?: string) {
  const normalizedSiteId = String(siteId || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3}$/.test(normalizedSiteId)) return;

  await ensureRadarSiteActivityTable(db);

  const at = nowIso ?? new Date().toISOString();
  await db.prepare(`
    INSERT INTO radar_site_activity (
      site_id, last_requested_at, request_count, created_at, updated_at
    )
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(site_id) DO UPDATE SET
      last_requested_at = excluded.last_requested_at,
      request_count = radar_site_activity.request_count + 1,
      updated_at = excluded.updated_at
  `).bind(normalizedSiteId, at, at, at).run();
}

export async function readRecentRadarSiteActivity(db: D1DatabaseLike, limit = 12): Promise<RadarSiteActivityRecord[]> {
  await ensureRadarSiteActivityTable(db);

  const safeLimit = Math.max(1, Math.min(48, Math.floor(limit)));
  const rows = await db.prepare(`
    SELECT site_id, last_requested_at, request_count, created_at, updated_at
    FROM radar_site_activity
    ORDER BY last_requested_at DESC, request_count DESC, site_id ASC
    LIMIT ?
  `).bind(safeLimit).all<RadarSiteActivityRow>();

  return (rows.results ?? []).map(mapRow);
}
