import type { D1DatabaseLike } from "../database/queries";

export type RadarPipelineRunRecord = {
  pipelineKey: string;
  status: "success" | "skipped" | "error";
  lastRunAt: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type RadarPipelineRunRow = {
  pipeline_key: string;
  status: string;
  last_run_at: string;
  details_json: string | null;
  created_at: string;
  updated_at: string;
};

async function ensureRadarPipelineRunsTable(db: D1DatabaseLike) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS radar_pipeline_runs (
      pipeline_key TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      last_run_at TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).bind().run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_radar_pipeline_runs_last_run
      ON radar_pipeline_runs(last_run_at DESC)
  `).bind().run();
}

function parseDetails(json: string | null) {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function mapRow(row: RadarPipelineRunRow): RadarPipelineRunRecord {
  return {
    pipelineKey: row.pipeline_key,
    status: row.status === "success" || row.status === "skipped" || row.status === "error"
      ? row.status
      : "error",
    lastRunAt: row.last_run_at,
    details: parseDetails(row.details_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function recordRadarPipelineRun(
  db: D1DatabaseLike,
  pipelineKey: string,
  status: RadarPipelineRunRecord["status"],
  details?: Record<string, unknown> | null,
  nowIso?: string,
) {
  const normalizedKey = String(pipelineKey || "").trim().toLowerCase();
  if (!normalizedKey) return;

  await ensureRadarPipelineRunsTable(db);

  const at = nowIso ?? new Date().toISOString();
  await db.prepare(`
    INSERT INTO radar_pipeline_runs (
      pipeline_key, status, last_run_at, details_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(pipeline_key) DO UPDATE SET
      status = excluded.status,
      last_run_at = excluded.last_run_at,
      details_json = excluded.details_json,
      updated_at = excluded.updated_at
  `).bind(
    normalizedKey,
    status,
    at,
    details ? JSON.stringify(details) : null,
    at,
    at,
  ).run();
}

export async function readRadarPipelineRun(
  db: D1DatabaseLike,
  pipelineKey: string,
): Promise<RadarPipelineRunRecord | null> {
  const normalizedKey = String(pipelineKey || "").trim().toLowerCase();
  if (!normalizedKey) return null;

  await ensureRadarPipelineRunsTable(db);

  const row = await db.prepare(`
    SELECT pipeline_key, status, last_run_at, details_json, created_at, updated_at
    FROM radar_pipeline_runs
    WHERE pipeline_key = ?
    LIMIT 1
  `).bind(normalizedKey).first<RadarPipelineRunRow>();

  return row ? mapRow(row) : null;
}
