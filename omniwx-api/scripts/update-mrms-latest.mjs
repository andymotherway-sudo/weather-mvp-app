#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PRODUCT = "MergedReflectivityQCComposite";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    product: DEFAULT_PRODUCT,
    minZoom: 3,
    maxZoom: 10,
    maxTiles: 12000,
    retainFrames: 12,
    maxFrameAgeMinutes: 360,
    minRetainedMaxZoom: null,
    bucket: "omniwx-radar-assets-dev",
    prefix: null,
    latestPrefix: "radar/mrms/latest",
    pydeps: null,
    apply: false,
    python: process.env.OMNIWX_PYTHON || null,
    uploader: "auto",
    uploadConcurrency: 6,
    sampling: "bilinear",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--product" && argv[i + 1]) args.product = argv[++i];
    else if (arg === "--min-z" && argv[i + 1]) args.minZoom = parseInt(argv[++i], 10);
    else if (arg === "--max-z" && argv[i + 1]) args.maxZoom = parseInt(argv[++i], 10);
    else if (arg === "--max-tiles" && argv[i + 1]) args.maxTiles = Math.max(1, Math.floor(Number(argv[++i]) || args.maxTiles));
    else if (arg === "--retain-frames" && argv[i + 1]) args.retainFrames = Math.max(1, Math.floor(Number(argv[++i]) || args.retainFrames));
    else if (arg === "--max-frame-age-minutes" && argv[i + 1]) args.maxFrameAgeMinutes = Math.max(5, Math.floor(Number(argv[++i]) || args.maxFrameAgeMinutes));
    else if (arg === "--min-retained-max-z" && argv[i + 1]) args.minRetainedMaxZoom = Math.max(0, Math.floor(Number(argv[++i])));
    else if (arg === "--bucket" && argv[i + 1]) args.bucket = argv[++i];
    else if (arg === "--prefix" && argv[i + 1]) args.prefix = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--latest-prefix" && argv[i + 1]) args.latestPrefix = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--pydeps" && argv[i + 1]) args.pydeps = argv[++i];
    else if (arg === "--python" && argv[i + 1]) args.python = argv[++i];
    else if (arg === "--uploader" && argv[i + 1]) args.uploader = argv[++i].trim().toLowerCase();
    else if (arg === "--upload-concurrency" && argv[i + 1]) args.uploadConcurrency = Math.max(1, Math.floor(Number(argv[++i]) || args.uploadConcurrency));
    else if (arg === "--sampling" && argv[i + 1]) args.sampling = argv[++i].trim().toLowerCase();
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!/^[A-Za-z0-9_-]{3,80}$/.test(args.product)) {
    throw new Error(`Invalid product: ${args.product}`);
  }
  args.minZoom = Math.max(0, Math.min(10, Number.isFinite(args.minZoom) ? args.minZoom : 3));
  args.maxZoom = Math.max(args.minZoom, Math.min(10, Number.isFinite(args.maxZoom) ? args.maxZoom : args.minZoom));
  if (!["bilinear", "nearest"].includes(args.sampling)) {
    throw new Error(`Unsupported sampling mode "${args.sampling}". Use bilinear or nearest.`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: npm run mrms:update-latest -- [options]

Downloads the latest NOAA MRMS frame, creates local non-empty XYZ proof tiles,
and publishes the bounded frame plus stable latest pointer. R2 writes are dry-run
unless --apply is passed.

Options:
  --product <name>     MRMS 2D product. Default: ${DEFAULT_PRODUCT}
  --min-z <zoom>       Minimum XYZ zoom. Default: 3
  --max-z <zoom>       Maximum XYZ zoom. Default: 10
  --max-tiles <count>  Publish safety cap. Default: 12000
  --retain-frames <n>  Latest playlist retention count. Default: 12
  --max-frame-age-minutes <n> Drop retained frames older than this from newest. Default: 360
  --min-retained-max-z <n> Drop retained playlist frames below this max zoom
  --bucket <name>      R2 bucket. Default: omniwx-radar-assets-dev
  --prefix <key>       R2 frame prefix. Default: radar/mrms/proof/<product>
  --latest-prefix <key> Stable latest prefix. Default: radar/mrms/latest
  --pydeps <path>      Python dependency directory for tile rendering
  --python <path>      Python executable for the tile step
  --uploader <auto|s3|wrangler> Upload transport. Default: auto
  --upload-concurrency <n> S3 upload concurrency. Default: 6
  --sampling <mode>    Raster sampling mode: bilinear or nearest. Default: bilinear
  --apply              Actually write to dev R2. Default is dry-run
`);
}

function runStep(label, command, args) {
  console.log(`\n== ${label} ==`);
  console.log([command, ...args].join(" "));
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = resolve(`../tmp/mrms/MRMS_${args.product}.latest.grib2.gz`);
  const outputDir = resolve(`../tmp/mrms/tiles/${args.product}-z${args.minZoom}z${args.maxZoom}`);
  const manifest = resolve(outputDir, "manifest.json");
  const publishPrefix = args.prefix || `radar/mrms/proof/${args.product}`;

  runStep("Download latest MRMS frame", process.execPath, [
    join(SCRIPT_DIR, "download-mrms-frame.mjs"),
    "--product",
    args.product,
  ]);

  const tileArgs = [
    join(SCRIPT_DIR, "tile-mrms-proof.mjs"),
    "--product",
    args.product,
    "--input",
    input,
    "--output-dir",
    outputDir,
    "--min-z",
    String(args.minZoom),
    "--max-z",
    String(args.maxZoom),
    "--sampling",
    args.sampling,
  ];
  if (args.python) tileArgs.push("--python", args.python);
  if (args.pydeps) tileArgs.push("--pydeps", args.pydeps);
  runStep("Render non-empty MRMS XYZ tiles", process.execPath, tileArgs);

  const publishArgs = [
    join(SCRIPT_DIR, "publish-mrms-proof.mjs"),
    "--manifest",
    manifest,
    "--bucket",
    args.bucket,
    "--prefix",
    publishPrefix,
    "--latest-prefix",
    args.latestPrefix,
    "--max-tiles",
    String(args.maxTiles),
    "--retain-frames",
    String(args.retainFrames),
    "--max-frame-age-minutes",
    String(args.maxFrameAgeMinutes),
    "--uploader",
    args.uploader,
    "--upload-concurrency",
    String(args.uploadConcurrency),
  ];
  if (args.minRetainedMaxZoom != null && Number.isFinite(args.minRetainedMaxZoom)) {
    publishArgs.push("--min-retained-max-z", String(args.minRetainedMaxZoom));
  }
  if (args.apply) publishArgs.push("--apply");
  runStep(args.apply ? `Publish MRMS latest to ${args.bucket}` : `Dry-run MRMS publish to ${args.bucket}`, process.execPath, publishArgs);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
