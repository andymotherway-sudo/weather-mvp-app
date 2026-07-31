#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const DEFAULT_MANIFEST = "../tmp/mrms/tiles/MergedReflectivityQCComposite-z3z4/manifest.json";
const DEFAULT_BUCKET = "omniwx-radar-assets-dev";
const DEFAULT_PREFIX = "radar/mrms/proof/MergedReflectivityQCComposite";
const DEFAULT_LATEST_PREFIX = "radar/mrms/latest";

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    bucket: DEFAULT_BUCKET,
    prefix: DEFAULT_PREFIX,
    maxTiles: 20,
    remote: true,
    dryRun: true,
    publishLatest: true,
    latestOnly: false,
    latestPrefix: DEFAULT_LATEST_PREFIX,
    retainFrames: 12,
    maxFrameAgeMinutes: 360,
    minRetainedMaxZoom: null,
    uploader: "auto",
    uploadConcurrency: 6,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest" && argv[i + 1]) args.manifest = argv[++i];
    else if (arg === "--bucket" && argv[i + 1]) args.bucket = argv[++i];
    else if (arg === "--prefix" && argv[i + 1]) args.prefix = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--latest-prefix" && argv[i + 1]) args.latestPrefix = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--max-tiles" && argv[i + 1]) args.maxTiles = Math.max(1, Math.floor(Number(argv[++i]) || args.maxTiles));
    else if (arg === "--retain-frames" && argv[i + 1]) args.retainFrames = Math.max(1, Math.floor(Number(argv[++i]) || args.retainFrames));
    else if (arg === "--max-frame-age-minutes" && argv[i + 1]) args.maxFrameAgeMinutes = Math.max(5, Math.floor(Number(argv[++i]) || args.maxFrameAgeMinutes));
    else if (arg === "--min-retained-max-z" && argv[i + 1]) args.minRetainedMaxZoom = Math.max(0, Math.floor(Number(argv[++i])));
    else if (arg === "--uploader" && argv[i + 1]) args.uploader = argv[++i].trim().toLowerCase();
    else if (arg === "--upload-concurrency" && argv[i + 1]) args.uploadConcurrency = Math.max(1, Math.floor(Number(argv[++i]) || args.uploadConcurrency));
    else if (arg === "--local") args.remote = false;
    else if (arg === "--apply") args.dryRun = false;
    else if (arg === "--no-latest") args.publishLatest = false;
    else if (arg === "--latest-only") args.latestOnly = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!["auto", "s3", "wrangler"].includes(args.uploader)) {
    throw new Error(`Unsupported uploader "${args.uploader}". Use auto, s3, or wrangler.`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run mrms:publish-proof -- [options]

Options:
  --manifest <path>    Local tile manifest. Default: ${DEFAULT_MANIFEST}
  --bucket <name>      R2 bucket. Default: ${DEFAULT_BUCKET}
  --prefix <key>       R2 key prefix. Default: ${DEFAULT_PREFIX}
  --latest-prefix <key> Stable latest manifest prefix. Default: ${DEFAULT_LATEST_PREFIX}
  --max-tiles <count>  Safety cap. Default: 20
  --retain-frames <n>  Latest playlist retention count. Default: 12
  --max-frame-age-minutes <n> Drop retained frames older than this from newest. Default: 360
  --min-retained-max-z <n> Drop retained frames below this max zoom
  --uploader <auto|s3|wrangler> Upload transport. Default: auto
  --upload-concurrency <n> S3 upload concurrency. Default: 6
  --no-latest          Skip stable latest manifest upload
  --latest-only        Only upload the stable latest manifest, not frame tiles
  --apply              Actually upload. Default is dry-run
  --local              Use Wrangler local R2 instead of remote
`);
}

function frameKey(manifest) {
  return String(manifest.validTime || manifest.time || "unknown-frame")
    .replace(/[^0-9A-Za-z]+/g, "")
    .slice(0, 32) || "unknown-frame";
}

function normalizeUtcIso(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function contentTypeFor(path) {
  return path.endsWith(".json") ? "application/json; charset=utf-8" : "image/png";
}

function cacheControlFor(path) {
  return path.endsWith(".json") ? "public, max-age=30" : "public, max-age=300, stale-while-revalidate=1800";
}

function productKey(manifest) {
  const product = String(manifest.product || "MergedReflectivityQCComposite").trim();
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(product)) {
    throw new Error(`Invalid manifest product: ${product}`);
  }
  return product;
}

function normalizeLocalPath(path) {
  if (process.platform === "win32") return path;
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(path);
  if (!match) return path;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
}

function parseObjectPath(objectPath) {
  const normalized = String(objectPath || "").replace(/^\/+/, "");
  const slash = normalized.indexOf("/");
  if (slash <= 0 || slash >= normalized.length - 1) {
    throw new Error(`Invalid R2 object path: ${objectPath}`);
  }
  return {
    bucket: normalized.slice(0, slash),
    key: normalized.slice(slash + 1),
  };
}

function r2S3Config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const endpoint = String(process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")).trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, accessKeyId, secretAccessKey };
}

function resolveUploader(args) {
  if (args.uploader === "wrangler") return "wrangler";
  const config = r2S3Config();
  if (args.uploader === "s3" && !config) {
    throw new Error("S3 uploader requested but R2 S3 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.");
  }
  return config ? "s3" : "wrangler";
}

function uploadObject(args, objectPath, filePath) {
  const wranglerArgs = [
    "./node_modules/wrangler/bin/wrangler.js",
    "r2",
    "object",
    "put",
    objectPath,
    args.remote ? "--remote" : "--local",
    "--file",
    normalizeLocalPath(filePath),
    "--content-type",
    contentTypeFor(filePath),
    "--cache-control",
    cacheControlFor(filePath),
  ];
  const result = spawnSync(process.execPath, wranglerArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`wrangler upload failed for ${objectPath}`);
  }
}

async function createS3Client() {
  const config = r2S3Config();
  if (!config) {
    throw new Error("R2 S3 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.");
  }
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

async function uploadObjectS3(client, objectPath, filePath) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { bucket, key } = parseObjectPath(objectPath);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(filePath),
    ContentType: contentTypeFor(filePath),
    CacheControl: cacheControlFor(filePath),
  }));
}

async function uploadObjectsS3(args, uploads) {
  const client = await createS3Client();
  let nextIndex = 0;
  const concurrency = Math.max(1, Math.min(32, args.uploadConcurrency));

  async function worker() {
    while (nextIndex < uploads.length) {
      const index = nextIndex;
      nextIndex += 1;
      const upload = uploads[index];
      await uploadObjectS3(client, upload.objectPath, upload.localPath);
      console.log(JSON.stringify({
        ok: true,
        uploader: "s3",
        uploaded: index + 1,
        total: uploads.length,
        objectPath: upload.objectPath,
      }));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, uploads.length) }, () => worker()));
}

function downloadTextObject(args, objectPath) {
  const wranglerArgs = [
    "./node_modules/wrangler/bin/wrangler.js",
    "r2",
    "object",
    "get",
    objectPath,
    args.remote ? "--remote" : "--local",
    "--pipe",
  ];
  const result = spawnSync(process.execPath, wranglerArgs, { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout || null;
}

async function downloadTextObjectS3(objectPath) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await createS3Client();
  const { bucket, key } = parseObjectPath(objectPath);
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) return null;
    if (typeof response.Body.transformToString === "function") {
      return await response.Body.transformToString();
    }
    const chunks = [];
    for await (const chunk of response.Body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    const name = String(error?.name || "");
    const status = Number(error?.$metadata?.httpStatusCode);
    if (name === "NoSuchKey" || name === "NotFound" || status === 404) return null;
    throw error;
  }
}

function normalizeFrameEntry(value) {
  if (!value || typeof value !== "object") return null;
  const frame = String(value.frame || "").trim();
  const tileBasePrefix = String(value.tileBasePrefix || "").trim();
  if (!/^[0-9A-Za-z]{8,32}$/.test(frame) || !tileBasePrefix) return null;
  return {
    frame,
    validTime: normalizeUtcIso(value.validTime) || null,
    time: normalizeUtcIso(value.time) || null,
    generatedAt: value.generatedAt || null,
    tileBasePrefix,
    tileSize: value.tileSize,
    sampling: value.sampling || null,
    minZoom: value.minZoom,
    maxZoom: value.maxZoom,
    bounds: value.bounds,
    tileCount: value.tileCount,
    totalBytes: value.totalBytes,
    tiles: Array.isArray(value.tiles) ? value.tiles : [],
  };
}

function frameTimeMs(entry) {
  const explicit = Date.parse(String(normalizeUtcIso(entry?.validTime || entry?.time) || ""));
  if (Number.isFinite(explicit)) return explicit;
  const frame = String(entry?.frame || "");
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(frame);
  if (!match) return Number.NaN;
  const [, year, month, day, hour, minute, second = "00"] = match;
  return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
}

async function existingPlaylistFrames(args, latestKey, uploader) {
  const objectPath = `${args.bucket}/${latestKey}`;
  const text = uploader === "s3"
    ? await downloadTextObjectS3(objectPath)
    : downloadTextObject(args, objectPath);
  if (!text) return [];
  try {
    const manifest = JSON.parse(text);
    const frames = Array.isArray(manifest.frames) ? manifest.frames.map(normalizeFrameEntry).filter(Boolean) : [];
    const topFrame = normalizeFrameEntry(manifest);
    if (topFrame && !frames.some((entry) => entry.frame === topFrame.frame)) frames.push(topFrame);
    return frames;
  } catch {
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uploader = resolveUploader(args);
  const manifest = JSON.parse(await readFile(args.manifest, "utf8"));
  const tiles = Array.isArray(manifest.tiles) ? manifest.tiles : [];
  if (tiles.length > args.maxTiles) {
    throw new Error(`Refusing to publish ${tiles.length} tiles with --max-tiles ${args.maxTiles}`);
  }

  const product = productKey(manifest);
  const frame = frameKey(manifest);
  const basePrefix = `${args.prefix}/${frame}`;
  const uploads = args.latestOnly ? [] : tiles.map((tile) => {
    const localPath = String(tile.path);
    return {
      localPath,
      objectPath: `${args.bucket}/${basePrefix}/${tile.z}/${tile.x}/${tile.y}.png`,
    };
  });
  if (!args.latestOnly) {
    uploads.push({
      localPath: args.manifest,
      objectPath: `${args.bucket}/${basePrefix}/manifest.json`,
    });
  }

  let latestManifestPath = null;
  if (args.publishLatest) {
    const currentFrame = {
      frame,
      validTime: normalizeUtcIso(manifest.validTime) || null,
      time: normalizeUtcIso(manifest.time) || null,
      generatedAt: new Date().toISOString(),
      tileBasePrefix: basePrefix,
      tileSize: manifest.tileSize,
      sampling: manifest.sampling || null,
      minZoom: manifest.minZoom,
      maxZoom: manifest.maxZoom,
      bounds: manifest.bounds,
      tileCount: tiles.length,
      totalBytes: manifest.totalBytes,
      tiles: tiles.map((tile) => ({
        z: tile.z,
        x: tile.x,
        y: tile.y,
        bytes: tile.bytes,
      })),
    };
    const latestKey = `${args.latestPrefix}/${product}.json`;
    const previousFrames = args.dryRun ? [] : await existingPlaylistFrames(args, latestKey, uploader);
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
      .filter((entry) => {
        if (args.minRetainedMaxZoom == null || !Number.isFinite(args.minRetainedMaxZoom)) return true;
        const maxZoom = Number(entry.maxZoom);
        return Number.isFinite(maxZoom) && maxZoom >= args.minRetainedMaxZoom;
      })
      .slice(0, args.retainFrames);
    const latestManifest = {
      ok: true,
      source: manifest.source || "NOAA MRMS",
      product,
      frame: currentFrame.frame,
      validTime: currentFrame.validTime,
      time: currentFrame.time,
      generatedAt: new Date().toISOString(),
      tileBasePrefix: currentFrame.tileBasePrefix,
      tileSize: currentFrame.tileSize,
      sampling: currentFrame.sampling,
      minZoom: currentFrame.minZoom,
      maxZoom: currentFrame.maxZoom,
      bounds: manifest.bounds,
      sourceShape: manifest.sourceShape,
      tileCount: currentFrame.tileCount,
      totalBytes: currentFrame.totalBytes,
      tiles: currentFrame.tiles,
      frameCount: frames.length,
      retentionFrames: args.retainFrames,
      maxFrameAgeMinutes: args.maxFrameAgeMinutes,
      frames,
    };
    const latestDir = resolve("../tmp/mrms/publish");
    await mkdir(latestDir, { recursive: true });
    latestManifestPath = join(latestDir, `${product}.latest.json`);
    await writeFile(latestManifestPath, JSON.stringify(latestManifest, null, 2), "utf8");
    uploads.push({
      localPath: latestManifestPath,
      objectPath: `${args.bucket}/${latestKey}`,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: args.dryRun,
    uploader,
    bucket: args.bucket,
    prefix: basePrefix,
    latestKey: args.publishLatest ? `${args.latestPrefix}/${product}.json` : null,
    latestOnly: args.latestOnly,
    retainFrames: args.publishLatest ? args.retainFrames : null,
    maxFrameAgeMinutes: args.publishLatest ? args.maxFrameAgeMinutes : null,
    uploadCount: uploads.length,
    tileCount: tiles.length,
    totalBytes: manifest.totalBytes,
    uploads: uploads.slice(0, 20),
  }, null, 2));

  if (args.dryRun) return;
  if (uploader === "s3") {
    await uploadObjectsS3(args, uploads);
  } else {
    for (const upload of uploads) {
      uploadObject(args, upload.objectPath, upload.localPath);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
