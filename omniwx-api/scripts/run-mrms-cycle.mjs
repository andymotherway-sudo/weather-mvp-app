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
    maxZoom: 5,
    maxTiles: 80,
    retainFrames: 12,
    maxFrameAgeMinutes: 360,
    minRetainedMaxZoom: null,
    python: process.env.OMNIWX_PYTHON || null,
    uploader: "auto",
    uploadConcurrency: 6,
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
    else if (arg === "--python" && argv[i + 1]) args.python = argv[++i];
    else if (arg === "--uploader" && argv[i + 1]) args.uploader = argv[++i].trim().toLowerCase();
    else if (arg === "--upload-concurrency" && argv[i + 1]) args.uploadConcurrency = Math.max(1, Math.floor(Number(argv[++i]) || args.uploadConcurrency));
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
  --max-z <n>                Maximum zoom. Default: 5
  --max-tiles <n>            Publish safety cap. Default: 80
  --retain-frames <n>        Latest playlist retention count. Default: 12
  --max-frame-age-minutes <n> Drop retained frames older than this. Default: 360
  --min-retained-max-z <n>   Drop retained playlist frames below this max zoom. Default: --max-z
  --python <path>            Python executable for cfgrib/eccodes rendering
  --uploader <auto|s3|wrangler> Upload transport. Default: auto
  --upload-concurrency <n>   S3 upload concurrency. Default: 6
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const bucket = BUCKETS[args.env];
  const workerEnv = args.env === "production" || args.env === "prod" ? "production" : "dev";

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
  if (args.python) updateArgs.push("--python", args.python);
  if (args.apply) updateArgs.push("--apply");

  runStep(args.apply ? `Publish MRMS ${workerEnv}` : `Dry-run MRMS ${workerEnv}`, process.execPath, updateArgs);

  if (args.skipCleanup) return;

  const cleanupArgs = [
    join(SCRIPT_DIR, "cleanup-mrms-retained.mjs"),
    "--env",
    workerEnv,
    "--product",
    args.product,
    "--max-deletes",
    "1000",
    "--allow-disabled",
  ];
  if (args.apply) cleanupArgs.push("--apply");
  runStep(args.apply ? `Cleanup retained MRMS ${workerEnv}` : `Dry-run cleanup retained MRMS ${workerEnv}`, process.execPath, cleanupArgs);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
