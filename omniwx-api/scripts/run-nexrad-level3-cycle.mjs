#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BUCKETS = {
  dev: "omniwx-radar-assets-dev",
  development: "omniwx-radar-assets-dev",
  prod: "omniwx-radar-assets-prod",
  production: "omniwx-radar-assets-prod",
};

function parseArgs(argv) {
  const args = {
    env: "dev",
    site: "IWA",
    product: "N0B",
    minZoom: 7,
    maxZoom: 10,
    maxTiles: 2000,
    minTiles: 1,
    retainFrames: 3,
    maxFrameAgeMinutes: 360,
    supersample: 1,
    maxRangeKm: null,
    python: process.env.OMNIWX_PYTHON || null,
    apply: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env" && argv[i + 1]) args.env = argv[++i].trim().toLowerCase();
    else if (arg === "--site" && argv[i + 1]) args.site = argv[++i].trim().toUpperCase().replace(/^K([A-Z0-9]{3})$/, "$1");
    else if (arg === "--product" && argv[i + 1]) args.product = argv[++i].trim().toUpperCase();
    else if (arg === "--min-z" && argv[i + 1]) args.minZoom = Math.max(0, Math.floor(Number(argv[++i]) || args.minZoom));
    else if (arg === "--max-z" && argv[i + 1]) args.maxZoom = Math.max(0, Math.floor(Number(argv[++i]) || args.maxZoom));
    else if (arg === "--max-tiles" && argv[i + 1]) args.maxTiles = Math.max(1, Math.floor(Number(argv[++i]) || args.maxTiles));
    else if (arg === "--min-tiles" && argv[i + 1]) args.minTiles = Math.max(0, Math.floor(Number(argv[++i]) || args.minTiles));
    else if (arg === "--retain-frames" && argv[i + 1]) args.retainFrames = Math.max(1, Math.min(12, Math.floor(Number(argv[++i]) || args.retainFrames)));
    else if (arg === "--max-frame-age-minutes" && argv[i + 1]) args.maxFrameAgeMinutes = Math.max(5, Math.floor(Number(argv[++i]) || args.maxFrameAgeMinutes));
    else if (arg === "--supersample" && argv[i + 1]) args.supersample = Math.max(1, Math.min(4, Math.floor(Number(argv[++i]) || args.supersample)));
    else if (arg === "--max-range-km" && argv[i + 1]) args.maxRangeKm = Math.max(25, Math.min(460, Number(argv[++i]) || 0));
    else if (arg === "--python" && argv[i + 1]) args.python = argv[++i];
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!(args.env in BUCKETS)) throw new Error(`Unsupported env "${args.env}". Use dev or production.`);
  if (!/^[A-Z0-9]{3}$/.test(args.site)) throw new Error(`Invalid Level III site: ${args.site}`);
  if (!/^[A-Z0-9]{3}$/.test(args.product)) throw new Error(`Invalid Level III product: ${args.product}`);
  args.maxZoom = Math.max(args.minZoom, Math.min(12, args.maxZoom));
  return args;
}

function printHelp() {
  console.log(`Usage: npm run level3:cycle -- [options]

Downloads, tiles, and dry-run/publishes one NOAA Level III station product.

Options:
  --env <dev|production>       Target environment. Default: dev
  --site <id>                  3-letter Level III site. Default: IWA
  --product <code>             Level III product. Default: N0B
  --min-z <n>                  Minimum zoom. Default: 7
  --max-z <n>                  Maximum zoom. Default: 10
  --max-tiles <n>              Publish safety cap. Default: 2000
  --min-tiles <n>              Minimum non-empty tiles required. Default: 1
  --retain-frames <n>          Retained frames. Default: 3
  --supersample <n>            Supersample factor. Default: 1
  --max-range-km <km>          Optional render radius cap
  --python <path>              Python executable
  --apply                      Actually write to R2. Default is dry-run
`);
}

function runStep(label, command, args) {
  console.log(`\n== ${label} ==`);
  console.log([command, ...args].join(" "));
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
}

function runStepCapture(label, command, args) {
  console.log(`\n== ${label} ==`);
  console.log([command, ...args].join(" "));
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  return result.stdout || "";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const bucket = BUCKETS[args.env];
  const downloadJson = runStepCapture("Download latest Level III frame", process.execPath, [
    join(SCRIPT_DIR, "download-nexrad-level3.mjs"),
    "--site", args.site,
    "--product", args.product,
    "--output-dir", resolve("../tmp/nexrad-level3"),
    "--json",
  ]);
  const downloaded = JSON.parse(downloadJson);
  const tileDir = resolve(`../tmp/nexrad-level3/tiles/${args.site}/${args.product}/${downloaded.key}`);
  const tileArgs = [
    join(SCRIPT_DIR, "tile-nexrad-level3-proof.mjs"),
    "--input", downloaded.outputPath,
    "--output-dir", tileDir,
    "--min-z", String(args.minZoom),
    "--max-z", String(args.maxZoom),
    "--supersample", String(args.supersample),
  ];
  if (args.maxRangeKm) tileArgs.push("--max-range-km", String(args.maxRangeKm));
  if (args.python) tileArgs.push("--python", args.python);
  runStep("Render Level III XYZ tiles", process.execPath, tileArgs);

  const publishArgs = [
    join(SCRIPT_DIR, "publish-nexrad-level3-proof.mjs"),
    "--manifest", join(tileDir, "manifest.json"),
    "--bucket", bucket,
    "--max-tiles", String(args.maxTiles),
    "--min-tiles", String(args.minTiles),
    "--retain-frames", String(args.retainFrames),
    "--max-frame-age-minutes", String(args.maxFrameAgeMinutes),
  ];
  if (args.apply) publishArgs.push("--apply");
  runStep(args.apply ? `Publish Level III ${args.site} ${args.product}` : `Dry-run Level III ${args.site} ${args.product}`, process.execPath, publishArgs);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
