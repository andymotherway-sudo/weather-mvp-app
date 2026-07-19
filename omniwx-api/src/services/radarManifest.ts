import type { D1DatabaseLike } from "../database/queries";

export type RadarManifestScope = "national-mosaic" | "single-site";

export type RadarManifestFrame = {
  id: string;
  frameTime: number;
  frameIso: string;
  path: string | null;
  tileUrl: string | null;
  kind: string;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
};

export type RadarManifestRecord = {
  id: string;
  scope: RadarManifestScope;
  product: string;
  siteId: string | null;
  source: string;
  status: string;
  generatedAt: string;
  validFrom: string | null;
  validTo: string | null;
  frameCount: number;
  metadata: Record<string, unknown> | null;
  frames: RadarManifestFrame[];
};

type RadarManifestRow = {
  id: string;
  scope: RadarManifestScope;
  product: string;
  site_id: string | null;
  source: string;
  status: string;
  generated_at: string;
  valid_from: string | null;
  valid_to: string | null;
  frame_count: number | null;
  metadata_json: string | null;
};

type RadarFrameRow = {
  id: string;
  frame_time: number;
  frame_iso: string;
  path: string | null;
  tile_url: string | null;
  kind: string;
  sort_order: number | null;
  metadata_json: string | null;
};

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function mapManifestRow(row: RadarManifestRow, frames: RadarFrameRow[]): RadarManifestRecord {
  return {
    id: row.id,
    scope: row.scope,
    product: row.product,
    siteId: row.site_id,
    source: row.source,
    status: row.status,
    generatedAt: row.generated_at,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    frameCount: typeof row.frame_count === "number" ? row.frame_count : frames.length,
    metadata: parseJsonObject(row.metadata_json),
    frames: frames.map((frame) => ({
      id: frame.id,
      frameTime: frame.frame_time,
      frameIso: frame.frame_iso,
      path: frame.path,
      tileUrl: frame.tile_url,
      kind: frame.kind,
      sortOrder: typeof frame.sort_order === "number" ? frame.sort_order : 0,
      metadata: parseJsonObject(frame.metadata_json),
    })),
  };
}

export async function readLatestRadarManifest(
  db: D1DatabaseLike,
  args: { scope: RadarManifestScope; product: string; siteId?: string | null; source?: string | null },
): Promise<RadarManifestRecord | null> {
  const manifest = await db
    .prepare(`
      SELECT id, scope, product, site_id, source, status, generated_at, valid_from, valid_to, frame_count, metadata_json
      FROM radar_manifests
      WHERE scope = ?
        AND product = ?
        AND (? IS NULL OR site_id = ?)
        AND (? IS NULL OR source = ?)
        AND status = 'ready'
      ORDER BY generated_at DESC
      LIMIT 1
    `)
    .bind(args.scope, args.product, args.siteId ?? null, args.siteId ?? null, args.source ?? null, args.source ?? null)
    .first<RadarManifestRow>();

  if (!manifest) return null;

  const frameRows = await db
    .prepare(`
      SELECT id, frame_time, frame_iso, path, tile_url, kind, sort_order, metadata_json
      FROM radar_frames
      WHERE manifest_id = ?
      ORDER BY sort_order ASC, frame_time ASC
    `)
    .bind(manifest.id)
    .all<RadarFrameRow>();

  return mapManifestRow(manifest, frameRows.results ?? []);
}

export async function upsertRadarManifest(
  db: D1DatabaseLike,
  input: {
    id: string;
    scope: RadarManifestScope;
    product: string;
    siteId?: string | null;
    source: string;
    status?: string;
    generatedAt: string;
    validFrom?: string | null;
    validTo?: string | null;
    metadata?: Record<string, unknown> | null;
    frames: Array<{
      id: string;
      frameTime: number;
      frameIso: string;
      path?: string | null;
      tileUrl?: string | null;
      kind?: string;
      sortOrder?: number;
      metadata?: Record<string, unknown> | null;
    }>;
  },
) {
  const nowIso = new Date().toISOString();
  await db
    .prepare(`
      INSERT INTO radar_manifests (
        id, scope, product, site_id, source, status, generated_at, valid_from, valid_to, frame_count, metadata_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        scope = excluded.scope,
        product = excluded.product,
        site_id = excluded.site_id,
        source = excluded.source,
        status = excluded.status,
        generated_at = excluded.generated_at,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        frame_count = excluded.frame_count,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `)
    .bind(
      input.id,
      input.scope,
      input.product,
      input.siteId ?? null,
      input.source,
      input.status ?? "ready",
      input.generatedAt,
      input.validFrom ?? null,
      input.validTo ?? null,
      input.frames.length,
      input.metadata ? JSON.stringify(input.metadata) : null,
      nowIso,
      nowIso,
    )
    .run();

  await db.prepare(`DELETE FROM radar_frames WHERE manifest_id = ?`).bind(input.id).run();

  for (const frame of input.frames) {
    await db
      .prepare(`
        INSERT INTO radar_frames (
          id, manifest_id, frame_time, frame_iso, path, tile_url, kind, sort_order, metadata_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        frame.id,
        input.id,
        frame.frameTime,
        frame.frameIso,
        frame.path ?? null,
        frame.tileUrl ?? null,
        frame.kind ?? "past",
        frame.sortOrder ?? 0,
        frame.metadata ? JSON.stringify(frame.metadata) : null,
        nowIso,
        nowIso,
      )
      .run();
  }
}
