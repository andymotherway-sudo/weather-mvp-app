#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const DEFAULT_PYDEPS = resolve(REPO_ROOT, "tmp/level3-pydeps");
const PY_SCRIPT = join(SCRIPT_DIR, "render_nexrad_level3_proof.py");

function parseArgs(argv) {
  const args = {
    input: resolve(REPO_ROOT, "tmp/nexrad-level3/IWA_N0B_2026_08_13_04_08_27"),
    output: resolve(REPO_ROOT, "tmp/nexrad-level3/IWA_N0B.proof.png"),
    metadataOutput: null,
    size: 1024,
    maxRangeKm: null,
    pydeps: DEFAULT_PYDEPS,
    python: process.env.OMNIWX_PYTHON || null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) args.input = resolve(argv[++i]);
    else if (arg === "--output" && argv[i + 1]) args.output = resolve(argv[++i]);
    else if (arg === "--metadata-output" && argv[i + 1]) args.metadataOutput = resolve(argv[++i]);
    else if (arg === "--size" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed)) args.size = Math.max(256, Math.min(2048, Math.floor(parsed)));
    } else if (arg === "--max-range-km" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed)) args.maxRangeKm = Math.max(25, Math.min(460, parsed));
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
  console.log(`Usage: npm run level3:render-proof -- [options]

Render one NOAA NEXRAD Level III raw frame into a local transparent proof PNG.

Options:
  --input <path>            Input Level III file
  --output <path>           Output transparent PNG proof
  --metadata-output <path>  Optional JSON metadata output
  --size <px>               Square proof size. Default: 1024
  --max-range-km <km>       Override render radius. Default: file max range
  --pydeps <path>           Python dependency directory. Default: ../tmp/level3-pydeps
  --python <path>           Python executable. Also supports OMNIWX_PYTHON
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
    const pythonArgs = [
      PY_SCRIPT,
      "--input", args.input,
      "--output", args.output,
      "--size", String(args.size),
    ];
    if (args.metadataOutput) pythonArgs.push("--metadata-output", args.metadataOutput);
    if (args.maxRangeKm) pythonArgs.push("--max-range-km", String(args.maxRangeKm));

    const result = spawnSync(python, pythonArgs, {
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
