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
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest" && argv[i + 1]) args.manifest = argv[++i];
    else if (arg === "--bucket" && argv[i + 1]) args.bucket = argv[++i];
    else if (arg === "--prefix" && argv[i + 1]) args.prefix = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--latest-prefix" && argv[i + 1]) args.latestPrefix = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--max-tiles" && argv[i + 1]) args.maxTiles = Math.max(1, Math.floor(Number(argv[++i]) || args.maxTiles));
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
    const latestManifest = {
      ok: true,
      source: manifest.source || "NOAA MRMS",
      product,
      frame,
      validTime: manifest.validTime || null,
      time: manifest.time || null,
      generatedAt: new Date().toISOString(),
      tileBasePrefix: basePrefix,
      tileSize: manifest.tileSize,
      minZoom: manifest.minZoom,
      maxZoom: manifest.maxZoom,
      bounds: manifest.bounds,
      sourceShape: manifest.sourceShape,
      tileCount: tiles.length,
      totalBytes: manifest.totalBytes,
      tiles: tiles.map((tile) => ({
        z: tile.z,
        x: tile.x,
        y: tile.y,
        bytes: tile.bytes,
      })),
    };
    const latestDir = resolve("../tmp/mrms/publish");
    await mkdir(latestDir, { recursive: true });
    latestManifestPath = join(latestDir, `${product}.latest.json`);
    await writeFile(latestManifestPath, JSON.stringify(latestManifest, null, 2), "utf8");
    uploads.push({
      localPath: latestManifestPath,
      objectPath: `${args.bucket}/${args.latestPrefix}/${product}.json`,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: args.dryRun,
    bucket: args.bucket,
    prefix: basePrefix,
    latestKey: args.publishLatest ? `${args.latestPrefix}/${product}.json` : null,
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
