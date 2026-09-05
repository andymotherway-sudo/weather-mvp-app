#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const DEFAULT_MANIFEST = "../tmp/nexrad-level3/tiles/IWA/N0B/manifest.json";
const DEFAULT_BUCKET = "omniwx-radar-assets-dev";
const DEFAULT_PREFIX = "radar/level3/proof";
const DEFAULT_LATEST_PREFIX = "radar/level3/latest";

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    bucket: DEFAULT_BUCKET,
    prefix: DEFAULT_PREFIX,
    latestPrefix: DEFAULT_LATEST_PREFIX,
    maxTiles: 2000,
    retainFrames: 3,
    maxFrameAgeMinutes: 360,
    uploadConcurrency: 6,
    maxDeletes: 1000,
    dryRun: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest" && argv[i + 1]) args.manifest = argv[++i];
    else if (arg === "--bucket" && argv[i + 1]) args.bucket = argv[++i];
    else if (arg === "--prefix" && argv[i + 1]) args.prefix = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--latest-prefix" && argv[i + 1]) args.latestPrefix = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--max-tiles" && argv[i + 1]) args.maxTiles = Math.max(1, Math.floor(Number(argv[++i]) || args.maxTiles));
    else if (arg === "--retain-frames" && argv[i + 1]) args.retainFrames = Math.max(1, Math.min(12, Math.floor(Number(argv[++i]) || args.retainFrames)));
    else if (arg === "--max-frame-age-minutes" && argv[i + 1]) args.maxFrameAgeMinutes = Math.max(5, Math.floor(Number(argv[++i]) || args.maxFrameAgeMinutes));
    else if (arg === "--upload-concurrency" && argv[i + 1]) args.uploadConcurrency = Math.max(1, Math.floor(Number(argv[++i]) || args.uploadConcurrency));
    else if (arg === "--max-deletes" && argv[i + 1]) args.maxDeletes = Math.max(0, Math.floor(Number(argv[++i]) || args.maxDeletes));
    else if (arg === "--apply") args.dryRun = false;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run level3:publish-proof -- [options]

Publishes one NOAA NEXRAD Level III tile proof to R2. Dry-run by default.

Options:
  --manifest <path>              Local Level III tile manifest
  --bucket <name>                R2 bucket. Default: ${DEFAULT_BUCKET}
  --prefix <key>                 Frame prefix root. Default: ${DEFAULT_PREFIX}
  --latest-prefix <key>          Latest pointer root. Default: ${DEFAULT_LATEST_PREFIX}
  --max-tiles <count>            Publish safety cap. Default: 2000
  --retain-frames <n>            Latest playlist retention count. Default: 3
  --max-frame-age-minutes <n>    Drop retained frames older than this. Default: 360
  --upload-concurrency <n>       S3 upload concurrency. Default: 6
  --max-deletes <n>              Cleanup safety cap. Default: 1000
  --apply                        Actually write to R2
`);
}

function normalizeSite(value) {
  const site = String(value || "").trim().toUpperCase().replace(/^K([A-Z0-9]{3})$/, "$1");
  if (!/^[A-Z0-9]{3}$/.test(site)) throw new Error(`Invalid Level III site: ${value}`);
  return site;
}

function normalizeProduct(value) {
  const product = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3}$/.test(product)) throw new Error(`Invalid Level III product: ${value}`);
  return product;
}

function normalizeUtcIso(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function frameKey(manifest) {
  const iso = normalizeUtcIso(manifest.validTime || manifest.productTime);
  if (iso) return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("Z", "").slice(0, 15);
  return String(manifest.input || "frame").replace(/[^0-9A-Za-z]+/g, "").slice(-32);
}

function frameTimeMs(entry) {
  const iso = normalizeUtcIso(entry?.validTime || entry?.productTime);
  if (iso) return Date.parse(iso);
  const frame = String(entry?.frame || "");
  const match = /^(\d{8})T(\d{6})$/.exec(frame);
  if (!match) return Number.NaN;
  const [, date, time] = match;
  return Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`);
}

function r2S3Config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const endpoint = String(process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")).trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, accessKeyId, secretAccessKey };
}

async function createS3Client() {
  const config = r2S3Config();
  if (!config) throw new Error("R2 S3 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.");
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

async function readR2Json(client, bucket, key) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await response.Body?.transformToString?.();
    return body ? JSON.parse(body) : null;
  } catch (error) {
    const status = Number(error?.$metadata?.httpStatusCode);
    if (status === 404 || error?.name === "NoSuchKey") return null;
    throw error;
  }
}

async function uploadObjects(client, bucket, uploads, concurrency) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < uploads.length) {
      const index = nextIndex++;
      const upload = uploads[index];
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: upload.key,
        Body: createReadStream(upload.localPath),
        ContentType: upload.key.endsWith(".json") ? "application/json; charset=utf-8" : "image/png",
        CacheControl: upload.key.endsWith(".json") ? "public, max-age=30" : "public, max-age=300, stale-while-revalidate=1800",
      }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), uploads.length) }, () => worker()));
}

async function listKeys(client, bucket, prefix) {
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const keys = [];
  let ContinuationToken;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken,
    }));
    for (const object of response.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    ContinuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

function frameFromKey(prefixRoot, key) {
  const normalizedRoot = prefixRoot.replace(/\/+$/g, "");
  const normalizedKey = String(key || "");
  if (!normalizedKey.startsWith(`${normalizedRoot}/`)) return null;
  const rest = normalizedKey.slice(normalizedRoot.length + 1);
  const frame = rest.split("/")[0];
  return /^[0-9A-Za-z]{8,32}$/.test(frame) ? frame : null;
}

async function deleteKeys(client, bucket, keys, concurrency) {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < keys.length) {
      const index = nextIndex++;
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keys[index] }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), keys.length) }, () => worker()));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(args.manifest, "utf8"));
  const tiles = Array.isArray(manifest.tiles) ? manifest.tiles : [];
  if (tiles.length > args.maxTiles) {
    throw new Error(`Refusing to publish ${tiles.length} tiles with --max-tiles ${args.maxTiles}`);
  }

  const site = normalizeSite(manifest.site);
  const product = normalizeProduct(manifest.product);
  const frame = frameKey(manifest);
  const framePrefix = `${args.prefix}/${site}/${product}/${frame}`;
  const latestKey = `${args.latestPrefix}/${site}/${product}.json`;
  const client = args.dryRun ? null : await createS3Client();
  const previous = client ? await readR2Json(client, args.bucket, latestKey) : null;
  const previousFrames = Array.isArray(previous?.frames) ? previous.frames : [];

  const currentFrame = {
    frame,
    site,
    product,
    productName: manifest.productName || null,
    validTime: normalizeUtcIso(manifest.validTime),
    productTime: normalizeUtcIso(manifest.productTime),
    generatedAt: new Date().toISOString(),
    tileBasePrefix: framePrefix,
    tileSize: manifest.tileSize,
    minZoom: manifest.minZoom,
    maxZoom: manifest.maxZoom,
    bounds: manifest.bounds,
    lat: manifest.lat,
    lon: manifest.lon,
    maxRangeKm: manifest.maxRangeKm,
    tileCount: tiles.length,
    totalBytes: manifest.totalBytes,
    byZoom: manifest.byZoom,
    tiles: tiles.map((tile) => ({ z: tile.z, x: tile.x, y: tile.y, bytes: tile.bytes })),
  };

  const framesById = new Map();
  for (const entry of [currentFrame, ...previousFrames]) {
    if (!entry?.frame || framesById.has(entry.frame)) continue;
    framesById.set(entry.frame, entry);
  }
  const frames = Array.from(framesById.values())
    .sort((a, b) => String(b.frame).localeCompare(String(a.frame)))
    .filter((entry, _index, list) => {
      const newestMs = frameTimeMs(list[0]);
      const entryMs = frameTimeMs(entry);
      if (!Number.isFinite(newestMs) || !Number.isFinite(entryMs)) return true;
      return newestMs - entryMs <= args.maxFrameAgeMinutes * 60_000;
    })
    .slice(0, args.retainFrames);
  const retainedFrameIds = new Set(frames.map((entry) => entry.frame).filter(Boolean));

  const latestManifest = {
    ok: true,
    source: "NOAA NEXRAD Level III",
    site,
    product,
    frame: currentFrame.frame,
    validTime: currentFrame.validTime,
    productTime: currentFrame.productTime,
    generatedAt: currentFrame.generatedAt,
    tileBasePrefix: currentFrame.tileBasePrefix,
    tileSize: currentFrame.tileSize,
    minZoom: currentFrame.minZoom,
    maxZoom: currentFrame.maxZoom,
    bounds: currentFrame.bounds,
    lat: currentFrame.lat,
    lon: currentFrame.lon,
    maxRangeKm: currentFrame.maxRangeKm,
    tileCount: currentFrame.tileCount,
    totalBytes: currentFrame.totalBytes,
    byZoom: currentFrame.byZoom,
    frameCount: frames.length,
    retentionFrames: args.retainFrames,
    maxFrameAgeMinutes: args.maxFrameAgeMinutes,
    frames,
  };

  const latestDir = resolve("../tmp/nexrad-level3/publish");
  await mkdir(latestDir, { recursive: true });
  const latestManifestPath = join(latestDir, `${site}-${product}.latest.json`);
  await writeFile(latestManifestPath, JSON.stringify(latestManifest, null, 2), "utf8");

  const uploads = [
    ...tiles.map((tile) => ({ localPath: String(tile.path), key: `${framePrefix}/${tile.z}/${tile.x}/${tile.y}.png` })),
    { localPath: args.manifest, key: `${framePrefix}/manifest.json` },
    { localPath: latestManifestPath, key: latestKey },
  ];

  console.log(JSON.stringify({
    ok: true,
    dryRun: args.dryRun,
    bucket: args.bucket,
    site,
    product,
    frame,
    framePrefix,
    latestKey,
    retainFrames: args.retainFrames,
    retainedFrameIds: Array.from(retainedFrameIds),
    uploadCount: uploads.length,
    tileCount: tiles.length,
    totalBytes: manifest.totalBytes,
    byZoom: manifest.byZoom,
    uploads: uploads.slice(0, 20),
  }, null, 2));

  if (args.dryRun) return;

  await uploadObjects(client, args.bucket, uploads, args.uploadConcurrency);

  const prefixRoot = `${args.prefix}/${site}/${product}`;
  const existingKeys = await listKeys(client, args.bucket, `${prefixRoot}/`);
  const staleKeys = existingKeys.filter((key) => {
    const keyFrame = frameFromKey(prefixRoot, key);
    return keyFrame && !retainedFrameIds.has(keyFrame);
  });

  if (staleKeys.length > args.maxDeletes) {
    throw new Error(`Refusing to delete ${staleKeys.length} stale Level III objects with --max-deletes ${args.maxDeletes}`);
  }
  if (staleKeys.length) await deleteKeys(client, args.bucket, staleKeys, args.uploadConcurrency);

  console.log(JSON.stringify({
    ok: true,
    cleanup: "level3-retained-prefix",
    prefix: `${prefixRoot}/`,
    retainedFrameIds: Array.from(retainedFrameIds),
    existingObjectCount: existingKeys.length,
    deletedObjectCount: staleKeys.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
