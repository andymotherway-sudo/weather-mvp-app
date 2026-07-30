#!/usr/bin/env node

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
    latestPrefix: DEFAULT_LATEST_PREFIX,
    retainFrames: 12,
    maxFrameAgeMinutes: 360,
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
    else if (arg === "--local") args.remote = false;
    else if (arg === "--apply") args.dryRun = false;
    else if (arg === "--no-latest") args.publishLatest = false;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
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
  --no-latest          Skip stable latest manifest upload
  --apply              Actually upload. Default is dry-run
  --local              Use Wrangler local R2 instead of remote
`);
}

function frameKey(manifest) {
  return String(manifest.validTime || manifest.time || "unknown-frame")
    .replace(/[^0-9A-Za-z]+/g, "")
    .slice(0, 32) || "unknown-frame";
}

function contentTypeFor(path) {
  return path.endsWith(".json") ? "application/json; charset=utf-8" : "image/png";
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
    filePath.endsWith(".json") ? "public, max-age=30" : "public, max-age=300, stale-while-revalidate=1800",
  ];
  const result = spawnSync(process.execPath, wranglerArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`wrangler upload failed for ${objectPath}`);
  }
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

function normalizeFrameEntry(value) {
  if (!value || typeof value !== "object") return null;
  const frame = String(value.frame || "").trim();
  const tileBasePrefix = String(value.tileBasePrefix || "").trim();
  if (!/^[0-9A-Za-z]{8,32}$/.test(frame) || !tileBasePrefix) return null;
  return {
    frame,
    validTime: value.validTime || null,
    time: value.time || null,
    generatedAt: value.generatedAt || null,
    tileBasePrefix,
    tileSize: value.tileSize,
    minZoom: value.minZoom,
    maxZoom: value.maxZoom,
    bounds: value.bounds,
    tileCount: value.tileCount,
    totalBytes: value.totalBytes,
    tiles: Array.isArray(value.tiles) ? value.tiles : [],
  };
}

function frameTimeMs(entry) {
  const explicit = Date.parse(String(entry?.validTime || entry?.time || ""));
  if (Number.isFinite(explicit)) return explicit;
  const frame = String(entry?.frame || "");
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(frame);
  if (!match) return Number.NaN;
  const [, year, month, day, hour, minute, second = "00"] = match;
  return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
}

function existingPlaylistFrames(args, latestKey) {
  const text = downloadTextObject(args, `${args.bucket}/${latestKey}`);
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
  const manifest = JSON.parse(await readFile(args.manifest, "utf8"));
  const tiles = Array.isArray(manifest.tiles) ? manifest.tiles : [];
  if (tiles.length > args.maxTiles) {
    throw new Error(`Refusing to publish ${tiles.length} tiles with --max-tiles ${args.maxTiles}`);
  }

  const product = productKey(manifest);
  const frame = frameKey(manifest);
  const basePrefix = `${args.prefix}/${frame}`;
  const uploads = tiles.map((tile) => {
    const localPath = String(tile.path);
    return {
      localPath,
      objectPath: `${args.bucket}/${basePrefix}/${tile.z}/${tile.x}/${tile.y}.png`,
    };
  });
  uploads.push({
    localPath: args.manifest,
    objectPath: `${args.bucket}/${basePrefix}/manifest.json`,
  });

  let latestManifestPath = null;
  if (args.publishLatest) {
    const currentFrame = {
      frame,
      validTime: manifest.validTime || null,
      time: manifest.time || null,
      generatedAt: new Date().toISOString(),
      tileBasePrefix: basePrefix,
      tileSize: manifest.tileSize,
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
    const previousFrames = args.dryRun ? [] : existingPlaylistFrames(args, latestKey);
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
    bucket: args.bucket,
    prefix: basePrefix,
    latestKey: args.publishLatest ? `${args.latestPrefix}/${product}.json` : null,
    retainFrames: args.publishLatest ? args.retainFrames : null,
    maxFrameAgeMinutes: args.publishLatest ? args.maxFrameAgeMinutes : null,
    uploadCount: uploads.length,
    tileCount: tiles.length,
    totalBytes: manifest.totalBytes,
    uploads: uploads.slice(0, 20),
  }, null, 2));

  if (args.dryRun) return;
  for (const upload of uploads) {
    uploadObject(args, upload.objectPath, upload.localPath);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
