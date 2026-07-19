import { describe, expect, it } from "vitest";

import { readLatestRadarManifest, upsertRadarManifest } from "../src/services/radarManifest";

type StoredManifest = {
  id: string;
  scope: "national-mosaic" | "single-site";
  product: string;
  site_id: string | null;
  source: string;
  status: string;
  generated_at: string;
  valid_from: string | null;
  valid_to: string | null;
  frame_count: number;
  metadata_json: string | null;
};

type StoredFrame = {
  id: string;
  manifest_id: string;
  frame_time: number;
  frame_iso: string;
  path: string | null;
  tile_url: string | null;
  kind: string;
  sort_order: number;
  metadata_json: string | null;
};

function createMockDb() {
  const manifests = new Map<string, StoredManifest>();
  const frames = new Map<string, StoredFrame>();

  return {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (!normalized.startsWith("SELECT id, scope, product, site_id")) return null;
              const [scope, product, siteId, , source] = values as [string, string, string | null, string | null, string | null];
              const matches = [...manifests.values()]
                .filter((manifest) => manifest.scope === scope)
                .filter((manifest) => manifest.product === product)
                .filter((manifest) => siteId == null || manifest.site_id === siteId)
                .filter((manifest) => source == null || manifest.source === source)
                .filter((manifest) => manifest.status === "ready")
                .sort((a, b) => b.generated_at.localeCompare(a.generated_at));
              return (matches[0] as T | undefined) ?? null;
            },
            async all<T>() {
              if (!normalized.startsWith("SELECT id, frame_time, frame_iso")) return { results: [] as T[] };
              const [manifestId] = values as [string];
              const results = [...frames.values()]
                .filter((frame) => frame.manifest_id === manifestId)
                .sort((a, b) => a.sort_order - b.sort_order || a.frame_time - b.frame_time) as T[];
              return { results };
            },
            async run() {
              if (normalized.startsWith("INSERT INTO radar_manifests")) {
                const [
                  id,
                  scope,
                  product,
                  siteId,
                  source,
                  status,
                  generatedAt,
                  validFrom,
                  validTo,
                  frameCount,
                  metadataJson,
                ] = values as [string, StoredManifest["scope"], string, string | null, string, string, string, string | null, string | null, number, string | null];
                manifests.set(id, {
                  id,
                  scope,
                  product,
                  site_id: siteId,
                  source,
                  status,
                  generated_at: generatedAt,
                  valid_from: validFrom,
                  valid_to: validTo,
                  frame_count: frameCount,
                  metadata_json: metadataJson,
                });
                return {};
              }

              if (normalized.startsWith("DELETE FROM radar_frames")) {
                const [manifestId] = values as [string];
                for (const [frameId, frame] of frames.entries()) {
                  if (frame.manifest_id === manifestId) frames.delete(frameId);
                }
                return {};
              }

              if (normalized.startsWith("INSERT INTO radar_frames")) {
                const [id, manifestId, frameTime, frameIso, path, tileUrl, kind, sortOrder, metadataJson] = values as [
                  string,
                  string,
                  number,
                  string,
                  string | null,
                  string | null,
                  string,
                  number,
                  string | null,
                ];
                frames.set(id, {
                  id,
                  manifest_id: manifestId,
                  frame_time: frameTime,
                  frame_iso: frameIso,
                  path,
                  tile_url: tileUrl,
                  kind,
                  sort_order: sortOrder,
                  metadata_json: metadataJson,
                });
              }

              return {};
            },
          };
        },
      };
    },
  };
}

describe("radar manifest storage", () => {
  it("stores and reads back the latest manifest frames", async () => {
    const db = createMockDb();

    await upsertRadarManifest(db, {
      id: "manifest-a",
      scope: "national-mosaic",
      product: "precipitation",
      source: "rainviewer",
      generatedAt: "2026-07-19T09:00:00.000Z",
      validFrom: "2026-07-19T08:30:00.000Z",
      validTo: "2026-07-19T09:00:00.000Z",
      metadata: { host: "https://tilecache.example.com" },
      frames: [
        {
          id: "frame-a1",
          frameTime: 1_784_400_000,
          frameIso: "2026-07-19T08:30:00.000Z",
          path: "/radar/a1",
          tileUrl: "https://tilecache.example.com/radar/a1",
          sortOrder: 0,
        },
        {
          id: "frame-a2",
          frameTime: 1_784_401_800,
          frameIso: "2026-07-19T09:00:00.000Z",
          path: "/radar/a2",
          tileUrl: "https://tilecache.example.com/radar/a2",
          sortOrder: 1,
        },
      ],
    });

    const manifest = await readLatestRadarManifest(db, {
      scope: "national-mosaic",
      product: "precipitation",
    });

    expect(manifest?.id).toBe("manifest-a");
    expect(manifest?.metadata).toEqual({ host: "https://tilecache.example.com" });
    expect(manifest?.frames.map((frame) => frame.id)).toEqual(["frame-a1", "frame-a2"]);
    expect(manifest?.frames[1]?.tileUrl).toBe("https://tilecache.example.com/radar/a2");
  });

  it("replaces frame rows when a manifest id is updated", async () => {
    const db = createMockDb();

    await upsertRadarManifest(db, {
      id: "manifest-b",
      scope: "single-site",
      product: "N0Q",
      siteId: "PHX",
      source: "nexrad",
      generatedAt: "2026-07-19T09:00:00.000Z",
      frames: [
        {
          id: "frame-b1",
          frameTime: 1_784_400_000,
          frameIso: "2026-07-19T08:30:00.000Z",
          path: "/ridge/old",
          sortOrder: 0,
        },
      ],
    });

    await upsertRadarManifest(db, {
      id: "manifest-b",
      scope: "single-site",
      product: "N0Q",
      siteId: "PHX",
      source: "nexrad",
      generatedAt: "2026-07-19T09:05:00.000Z",
      frames: [
        {
          id: "frame-b2",
          frameTime: 1_784_401_500,
          frameIso: "2026-07-19T08:55:00.000Z",
          path: "/ridge/new-1",
          sortOrder: 0,
        },
        {
          id: "frame-b3",
          frameTime: 1_784_401_800,
          frameIso: "2026-07-19T09:00:00.000Z",
          path: "/ridge/new-2",
          sortOrder: 1,
        },
      ],
    });

    const manifest = await readLatestRadarManifest(db, {
      scope: "single-site",
      product: "N0Q",
      siteId: "PHX",
    });

    expect(manifest?.generatedAt).toBe("2026-07-19T09:05:00.000Z");
    expect(manifest?.frames.map((frame) => frame.id)).toEqual(["frame-b2", "frame-b3"]);
    expect(manifest?.frames.some((frame) => frame.id === "frame-b1")).toBe(false);
  });
});
