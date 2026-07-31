#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const DEFAULT_PYDEPS = resolve(REPO_ROOT, "tmp/mrms-pydeps");
const PY_SCRIPT = join(SCRIPT_DIR, "tile_mrms_proof.py");

function parseArgs(argv) {
  const args = {
    input: resolve(REPO_ROOT, "tmp/mrms/MRMS_MergedReflectivityQCComposite.latest.grib2.gz"),
    outputDir: resolve(REPO_ROOT, "tmp/mrms/tiles/MergedReflectivityQCComposite"),
    minZoom: 3,
    maxZoom: 4,
    tileSize: 256,
    product: "MergedReflectivityQCComposite",
    pydeps: DEFAULT_PYDEPS,
    python: process.env.OMNIWX_PYTHON || null,
    sampling: "bilinear",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) args.input = resolve(argv[++i]);
    else if (arg === "--output-dir" && argv[i + 1]) args.outputDir = resolve(argv[++i]);
    else if (arg === "--product" && argv[i + 1]) args.product = argv[++i];
    else if (arg === "--min-z" && argv[i + 1]) args.minZoom = parseInt(argv[++i], 10);
    else if (arg === "--max-z" && argv[i + 1]) args.maxZoom = parseInt(argv[++i], 10);
    else if (arg === "--tile-size" && argv[i + 1]) args.tileSize = parseInt(argv[++i], 10);
    else if (arg === "--sampling" && argv[i + 1]) args.sampling = argv[++i].trim().toLowerCase();
    else if (arg === "--pydeps" && argv[i + 1]) args.pydeps = resolve(argv[++i]);
    else if (arg === "--python" && argv[i + 1]) args.python = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  args.minZoom = Math.max(0, Math.min(10, Number.isFinite(args.minZoom) ? args.minZoom : 3));
  args.maxZoom = Math.max(args.minZoom, Math.min(10, Number.isFinite(args.maxZoom) ? args.maxZoom : args.minZoom));
  args.tileSize = Math.max(128, Math.min(512, Number.isFinite(args.tileSize) ? args.tileSize : 256));
  if (!["bilinear", "nearest"].includes(args.sampling)) {
    throw new Error(`Unsupported sampling mode "${args.sampling}". Use bilinear or nearest.`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: npm run mrms:tile-proof -- [options]

Options:
  --input <path>       Input .grib2 or .grib2.gz file
  --output-dir <path>  Output XYZ tile directory
  --product <name>     Product label for manifest
  --min-z <zoom>       Minimum XYZ zoom. Default: 3
  --max-z <zoom>       Maximum XYZ zoom. Default: 4
  --tile-size <px>     Tile size. Default: 256
  --sampling <mode>    Raster sampling mode: bilinear or nearest. Default: bilinear
  --pydeps <path>      Python dependency directory. Default: ../tmp/mrms-pydeps
  --python <path>      Python executable. Also supports OMNIWX_PYTHON
`);
}

function candidatePythons(explicitPython) {
  const candidates = [];
  if (explicitPython) candidates.push(explicitPython);
  if (process.env.USERPROFILE) {
    candidates.push(join(
      process.env.USERPROFILE,
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
    ));
  }
  candidates.push("python3", "python");
  return candidates;
}

function runPython(args) {
  for (const python of candidatePythons(args.python)) {
    if ((python.includes("\\") || python.includes("/")) && !existsSync(python)) continue;
    const result = spawnSync(python, [
      PY_SCRIPT,
      "--input", args.input,
      "--output-dir", args.outputDir,
      "--product", args.product,
      "--min-z", String(args.minZoom),
      "--max-z", String(args.maxZoom),
      "--tile-size", String(args.tileSize),
      "--sampling", args.sampling,
    ], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PYTHONPATH: [args.pydeps, process.env.PYTHONPATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":"),
      },
      encoding: "utf8",
    });

    if (result.error && result.error.code === "ENOENT") continue;
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    return result.status ?? 1;
  }

  console.error("No usable Python executable found. Set OMNIWX_PYTHON or pass --python.");
  return 1;
}

const args = parseArgs(process.argv.slice(2));
process.exit(runPython(args));
