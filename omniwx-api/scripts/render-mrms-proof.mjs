#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const DEFAULT_PYDEPS = resolve(REPO_ROOT, "tmp/mrms-pydeps");
const PY_SCRIPT = join(SCRIPT_DIR, "render_mrms_proof.py");

function parseArgs(argv) {
  const args = {
    input: resolve(REPO_ROOT, "tmp/mrms/MRMS_ReflectivityAtLowestAltitude.latest.grib2.gz"),
    output: resolve(REPO_ROOT, "tmp/mrms/MRMS_ReflectivityAtLowestAltitude.proof.png"),
    product: "ReflectivityAtLowestAltitude",
    maxWidth: 1400,
    pydeps: DEFAULT_PYDEPS,
    python: process.env.OMNIWX_PYTHON || null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) args.input = resolve(argv[++i]);
    else if (arg === "--output" && argv[i + 1]) args.output = resolve(argv[++i]);
    else if (arg === "--product" && argv[i + 1]) args.product = argv[++i];
    else if (arg === "--max-width" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed)) args.maxWidth = Math.max(256, Math.min(7000, Math.floor(parsed)));
    } else if (arg === "--pydeps" && argv[i + 1]) args.pydeps = resolve(argv[++i]);
    else if (arg === "--python" && argv[i + 1]) args.python = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run mrms:render-proof -- [options]

Options:
  --input <path>       Input .grib2 or .grib2.gz file
  --output <path>      Output transparent PNG proof
  --product <name>     MRMS product label for palette selection. Default: ReflectivityAtLowestAltitude
  --max-width <px>     Downsampled proof width. Default: 1400
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
    if (python.includes("\\") || python.includes("/")) {
      if (!existsSync(python)) continue;
    }
    const result = spawnSync(python, [
      PY_SCRIPT,
      "--input", args.input,
      "--output", args.output,
      "--product", args.product,
      "--max-width", String(args.maxWidth),
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
