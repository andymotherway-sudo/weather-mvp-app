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
    maxZoom: 4,
    maxTiles: 20,
    apply: false,
    python: process.env.OMNIWX_PYTHON || null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--product" && argv[i + 1]) args.product = argv[++i];
    else if (arg === "--min-z" && argv[i + 1]) args.minZoom = parseInt(argv[++i], 10);
    else if (arg === "--max-z" && argv[i + 1]) args.maxZoom = parseInt(argv[++i], 10);
    else if (arg === "--max-tiles" && argv[i + 1]) args.maxTiles = Math.max(1, Math.floor(Number(argv[++i]) || args.maxTiles));
    else if (arg === "--python" && argv[i + 1]) args.python = argv[++i];
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
  --max-z <zoom>       Maximum XYZ zoom. Default: 4
  --max-tiles <count>  Publish safety cap. Default: 20
  --python <path>      Python executable for the tile step
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
  const publishPrefix = `radar/mrms/proof/${args.product}`;

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
  ];
  if (args.python) tileArgs.push("--python", args.python);
  runStep("Render non-empty MRMS XYZ tiles", process.execPath, tileArgs);

  const publishArgs = [
    join(SCRIPT_DIR, "publish-mrms-proof.mjs"),
    "--manifest",
    manifest,
    "--prefix",
    publishPrefix,
    "--max-tiles",
    String(args.maxTiles),
  ];
  if (args.apply) publishArgs.push("--apply");
  runStep(args.apply ? "Publish MRMS latest to dev R2" : "Dry-run MRMS dev R2 publish", process.execPath, publishArgs);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
