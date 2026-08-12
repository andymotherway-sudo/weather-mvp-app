#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PRODUCT = "MergedReflectivityQCComposite";
const BUCKETS = {
  dev: "omniwx-radar-assets-dev",
  development: "omniwx-radar-assets-dev",
  prod: "omniwx-radar-assets-prod",
  production: "omniwx-radar-assets-prod",
};

function parseArgs(argv) {
  const args = {
    env: "dev",
    product: DEFAULT_PRODUCT,
    minZoom: 3,
    maxZoom: 10,
    maxTiles: 12000,
    retainFrames: 12,
    maxFrameAgeMinutes: 360,
    minRetainedMaxZoom: null,
    backfillFrames: 1,
    python: process.env.OMNIWX_PYTHON || null,
    uploader: "auto",
    uploadConcurrency: 6,
    sampling: "bilinear",
    apply: false,
    skipCleanup: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env" && argv[i + 1]) args.env = argv[++i].trim().toLowerCase();
    else if (arg === "--product" && argv[i + 1]) args.product = argv[++i];
    else if (arg === "--min-z" && argv[i + 1]) args.minZoom = Math.max(0, Math.floor(Number(argv[++i]) || args.minZoom));
    else if (arg === "--max-z" && argv[i + 1]) args.maxZoom = Math.max(0, Math.floor(Number(argv[++i]) || args.maxZoom));
    else if (arg === "--max-tiles" && argv[i + 1]) args.maxTiles = Math.max(1, Math.floor(Number(argv[++i]) || args.maxTiles));
    else if (arg === "--retain-frames" && argv[i + 1]) args.retainFrames = Math.max(1, Math.floor(Number(argv[++i]) || args.retainFrames));
    else if (arg === "--max-frame-age-minutes" && argv[i + 1]) args.maxFrameAgeMinutes = Math.max(5, Math.floor(Number(argv[++i]) || args.maxFrameAgeMinutes));
    else if (arg === "--min-retained-max-z" && argv[i + 1]) args.minRetainedMaxZoom = Math.max(0, Math.floor(Number(argv[++i])));
    else if (arg === "--backfill-frames" && argv[i + 1]) args.backfillFrames = Math.max(1, Math.min(12, Math.floor(Number(argv[++i]) || args.backfillFrames)));
    else if (arg === "--python" && argv[i + 1]) args.python = argv[++i];
    else if (arg === "--uploader" && argv[i + 1]) args.uploader = argv[++i].trim().toLowerCase();
    else if (arg === "--upload-concurrency" && argv[i + 1]) args.uploadConcurrency = Math.max(1, Math.floor(Number(argv[++i]) || args.uploadConcurrency));
    else if (arg === "--sampling" && argv[i + 1]) args.sampling = argv[++i].trim().toLowerCase();
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--skip-cleanup") args.skipCleanup = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!/^[A-Za-z0-9_-]{3,80}$/.test(args.product)) {
    throw new Error(`Invalid product: ${args.product}`);
  }
  if (!(args.env in BUCKETS)) {
    throw new Error(`Unsupported env "${args.env}". Use dev or production.`);
  }
  if (!["bilinear", "nearest"].includes(args.sampling)) {
    throw new Error(`Unsupported sampling mode "${args.sampling}". Use bilinear or nearest.`);
  }
  args.maxZoom = Math.max(args.minZoom, args.maxZoom);
  if (args.minRetainedMaxZoom == null || !Number.isFinite(args.minRetainedMaxZoom)) {
    args.minRetainedMaxZoom = args.maxZoom;
  }
  return args;
}

function printHelp() {
  console.log(`Usage: npm run mrms:cycle -- [options]

Runs one bounded MRMS publish cycle:
1. Download latest NOAA MRMS frame
2. Render non-empty XYZ tiles
3. Publish latest manifest to the target R2 bucket
4. Ask Worker cleanup to remove retained-frame objects not in latest manifest

Options:
  --env <dev|production>     Target environment. Default: dev
  --product <name>           MRMS product. Default: ${DEFAULT_PRODUCT}
  --min-z <n>                Minimum zoom. Default: 3
  --max-z <n>                Maximum zoom. Default: 10
  --max-tiles <n>            Publish safety cap. Default: 12000
  --retain-frames <n>        Latest playlist retention count. Default: 12
  --max-frame-age-minutes <n> Drop retained frames older than this. Default: 360
  --min-retained-max-z <n>   Drop retained playlist frames below this max zoom. Default: --max-z
  --backfill-frames <n>      Publish newest N timestamped frames in one run. Default: 1
  --python <path>            Python executable for cfgrib/eccodes rendering
  --uploader <auto|s3|wrangler> Upload transport. Default: auto
  --upload-concurrency <n>   S3 upload concurrency. Default: 6
  --sampling <mode>          Raster sampling mode: bilinear or nearest. Default: bilinear
  --skip-cleanup             Skip retained cleanup request
  --apply                    Actually write to R2. Default is dry-run
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

function runStepCapture(label, command, args) {
  console.log(`\n== ${label} ==`);
  console.log([command, ...args].join(" "));
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
  return result.stdout || "";
}

function frameLabelFromDiscoveredFrame(frame) {
  const raw = String(frame?.frameTime || frame?.name || "").trim();
  const match = /(\d{4})-?(\d{2})-?(\d{2})T?(\d{2}):?(\d{2}):?(\d{2})?/i.exec(raw);
  if (match) {
    const [, year, month, day, hour, minute, second = "00"] = match;
    return `${year}${month}${day}T${hour}${minute}${second}`;
  }
  return String(frame?.name || "frame").replace(/[^0-9A-Za-z_-]+/g, "").slice(0, 40);
}

function discoverBackfillFrames(args) {
  const output = runStepCapture("Discover MRMS timestamped frames", process.execPath, [
    join(SCRIPT_DIR, "discover-mrms.mjs"),
    "--product",
    args.product,
    "--max-frames",
    String(args.backfillFrames),
    "--json",
  ]);
  const payload = JSON.parse(output);
  const frames = Array.isArray(payload.frames) ? payload.frames : [];
  if (!frames.length) throw new Error("MRMS discovery returned no timestamped frames");
  return frames.slice(0, args.backfillFrames).reverse();
}

function publishFrame(args, bucket, workerEnv, frame = null) {
  const frameUrl = frame?.url ? String(frame.url) : null;
  const frameLabel = frame ? frameLabelFromDiscoveredFrame(frame) : null;
  const updateArgs = [
    join(SCRIPT_DIR, "update-mrms-latest.mjs"),
    "--product",
    args.product,
    "--bucket",
    bucket,
    "--min-z",
    String(args.minZoom),
    "--max-z",
    String(args.maxZoom),
    "--max-tiles",
    String(args.maxTiles),
    "--sampling",
    args.sampling,
    "--retain-frames",
    String(args.retainFrames),
    "--max-frame-age-minutes",
    String(args.maxFrameAgeMinutes),
    "--min-retained-max-z",
    String(args.minRetainedMaxZoom),
    "--uploader",
    args.uploader,
    "--upload-concurrency",
    String(args.uploadConcurrency),
  ];
  if (frameUrl) updateArgs.push("--frame-url", frameUrl);
  if (frameLabel) updateArgs.push("--frame-label", frameLabel);
  if (args.python) updateArgs.push("--python", args.python);
  if (args.apply) updateArgs.push("--apply");

  const suffix = frameLabel ? ` ${frameLabel}` : "";
  runStep(args.apply ? `Publish MRMS ${workerEnv}${suffix}` : `Dry-run MRMS ${workerEnv}${suffix}`, process.execPath, updateArgs);
}

function cleanupRetained(args, workerEnv) {
  if (args.skipCleanup) return;
  const cleanupArgs = [
    join(SCRIPT_DIR, "cleanup-mrms-retained.mjs"),
    "--env",
    workerEnv,
    "--product",
    args.product,
    "--uploader",
    args.uploader === "wrangler" ? "worker" : args.uploader,
    "--max-deletes",
    String(Math.max(10000, args.maxTiles * 2)),
    "--allow-disabled",
  ];
  if (args.apply) cleanupArgs.push("--apply");
  runStep(args.apply ? `Cleanup retained MRMS ${workerEnv}` : `Dry-run cleanup retained MRMS ${workerEnv}`, process.execPath, cleanupArgs);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const bucket = BUCKETS[args.env];
  const workerEnv = args.env === "production" || args.env === "prod" ? "production" : "dev";

  if (args.backfillFrames > 1) {
    const frames = discoverBackfillFrames(args);
    for (const frame of frames) {
      publishFrame(args, bucket, workerEnv, frame);
    }
    cleanupRetained(args, workerEnv);
    return;
  }

  publishFrame(args, bucket, workerEnv);
  cleanupRetained(args, workerEnv);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
