#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const BOOL_TRUE = new Set(["1", "true", "yes", "on"]);
const DEFAULT_MRMS_PRODUCTS = "MergedReflectivityQCComposite";
const DEFAULT_LEVEL3_SITES = "IWA,MPX,DLH";
const DEFAULT_LEVEL3_PRODUCTS = "N0B,N0S,EET";

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return BOOL_TRUE.has(String(raw).trim().toLowerCase());
}

function envInt(name, fallback, min, max = Number.POSITIVE_INFINITY) {
  const value = Math.floor(Number(process.env[name]));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function envString(name, fallback) {
  const value = String(process.env[name] ?? "").trim();
  return value || fallback;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function run(label, args) {
  console.log(`\n== ${label} ==`);
  console.log(["node", ...args].join(" "));
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1} after ${elapsedSeconds}s`);
  }
  console.log(`== ${label} completed in ${elapsedSeconds}s ==`);
}

function requireApplyConfirmation({ targetEnv, apply }) {
  if (!apply) return;
  if (targetEnv !== "production") return;
  const confirm = envString("RADAR_RUNNER_CONFIRM", "");
  if (confirm !== "production-radar-writes") {
    throw new Error(
      "Refusing production R2 writes. Set RADAR_RUNNER_CONFIRM=production-radar-writes after budget/storage guardrails are configured."
    );
  }
}

function runMrms({ targetEnv, apply }) {
  if (!envFlag("RADAR_RUNNER_MRMS_ENABLED", true)) {
    console.log("MRMS runner disabled by RADAR_RUNNER_MRMS_ENABLED.");
    return;
  }

  const products = splitCsv(envString("MRMS_PRODUCTS", envString("MRMS_PRODUCT", DEFAULT_MRMS_PRODUCTS)))
    .filter((product) => /^[A-Za-z0-9_-]{3,80}$/.test(product));
  if (!products.length) {
    console.log("MRMS runner has no valid products.");
    return;
  }

  const minZoom = String(envInt("MRMS_MIN_ZOOM", 3, 0, 10));
  const maxZoom = String(envInt("MRMS_MAX_ZOOM", 8, 0, 10));
  const maxTiles = String(envInt("MRMS_MAX_TILES", 12000, 1));
  const retainFrames = String(envInt("MRMS_RETAIN_FRAMES", 12, 1, 12));
  const maxFrameAgeMinutes = String(envInt("MRMS_MAX_FRAME_AGE_MINUTES", 360, 5));
  const backfillFrames = String(envInt("MRMS_BACKFILL_FRAMES", 1, 1, 3));
  const uploader = envString("RADAR_RUNNER_UPLOADER", "s3");
  const uploadConcurrency = String(envInt("MRMS_UPLOAD_CONCURRENCY", 6, 1, 24));

  for (const product of products) {
    const args = [
      "./scripts/run-mrms-cycle.mjs",
      "--env", targetEnv,
      "--product", product,
      "--min-z", minZoom,
      "--max-z", maxZoom,
      "--max-tiles", maxTiles,
      "--retain-frames", retainFrames,
      "--max-frame-age-minutes", maxFrameAgeMinutes,
      "--backfill-frames", backfillFrames,
      "--uploader", uploader,
      "--upload-concurrency", uploadConcurrency,
    ];
    if (apply) args.push("--apply");
    run(`MRMS ${product}`, args);
  }
}

function runLevel3({ targetEnv, apply }) {
  if (!envFlag("RADAR_RUNNER_LEVEL3_ENABLED", true)) {
    console.log("Level III runner disabled by RADAR_RUNNER_LEVEL3_ENABLED.");
    return;
  }

  const sites = splitCsv(envString("LEVEL3_SITES", DEFAULT_LEVEL3_SITES))
    .map((site) => site.toUpperCase().replace(/^K([A-Z0-9]{3})$/, "$1"))
    .filter((site) => /^[A-Z0-9]{3}$/.test(site));
  const products = splitCsv(envString("LEVEL3_PRODUCTS", DEFAULT_LEVEL3_PRODUCTS))
    .map((product) => product.toUpperCase())
    .filter((product) => /^[A-Z0-9]{3}$/.test(product));

  if (!sites.length || !products.length) {
    console.log("Level III runner has no valid sites/products.");
    return;
  }

  const minZoom = String(envInt("LEVEL3_MIN_ZOOM", 7, 0, 12));
  const maxZoom = String(envInt("LEVEL3_MAX_ZOOM", 10, 0, 12));
  const maxTiles = String(envInt("LEVEL3_MAX_TILES", 2000, 1));
  const retainFrames = String(envInt("LEVEL3_RETAIN_FRAMES", 12, 1, 12));
  const maxFrameAgeMinutes = String(envInt("LEVEL3_MAX_FRAME_AGE_MINUTES", 360, 5));
  const maxDeletes = String(envInt("LEVEL3_MAX_DELETES", 5000, 0));
  const supersample = String(envInt("LEVEL3_SUPERSAMPLE", 1, 1, 4));
  const allowEmptySkip = envFlag("LEVEL3_ALLOW_EMPTY_SKIP", true);

  for (const site of sites) {
    for (const product of products) {
      const args = [
        "./scripts/run-nexrad-level3-cycle.mjs",
        "--env", targetEnv,
        "--site", site,
        "--product", product,
        "--min-z", minZoom,
        "--max-z", maxZoom,
        "--max-tiles", maxTiles,
        "--retain-frames", retainFrames,
        "--max-frame-age-minutes", maxFrameAgeMinutes,
        "--max-deletes", maxDeletes,
        "--supersample", supersample,
      ];
      if (allowEmptySkip) args.push("--allow-empty-skip");
      if (apply) args.push("--apply");
      run(`Level III ${site} ${product}`, args);
    }
  }
}

function main() {
  if (!envFlag("RADAR_RUNNER_ENABLED", true)) {
    console.log("Radar runner disabled by RADAR_RUNNER_ENABLED.");
    return;
  }

  const targetEnv = envString("RADAR_RUNNER_TARGET_ENV", "production").toLowerCase();
  if (!["dev", "development", "prod", "production"].includes(targetEnv)) {
    throw new Error(`Unsupported RADAR_RUNNER_TARGET_ENV=${targetEnv}`);
  }
  const normalizedEnv = targetEnv === "prod" ? "production" : targetEnv === "development" ? "dev" : targetEnv;
  const apply = envFlag("RADAR_RUNNER_APPLY", false);
  requireApplyConfirmation({ targetEnv: normalizedEnv, apply });

  const startedAt = new Date();
  console.log(JSON.stringify({
    ok: true,
    runner: "omniwx-radar-runner",
    startedAt: startedAt.toISOString(),
    targetEnv: normalizedEnv,
    apply,
    mrmsEnabled: envFlag("RADAR_RUNNER_MRMS_ENABLED", true),
    mrmsProducts: splitCsv(envString("MRMS_PRODUCTS", envString("MRMS_PRODUCT", DEFAULT_MRMS_PRODUCTS))),
    level3Enabled: envFlag("RADAR_RUNNER_LEVEL3_ENABLED", true),
    level3Sites: splitCsv(envString("LEVEL3_SITES", DEFAULT_LEVEL3_SITES)),
    level3Products: splitCsv(envString("LEVEL3_PRODUCTS", DEFAULT_LEVEL3_PRODUCTS)),
  }, null, 2));

  runMrms({ targetEnv: normalizedEnv, apply });
  runLevel3({ targetEnv: normalizedEnv, apply });

  console.log(JSON.stringify({
    ok: true,
    runner: "omniwx-radar-runner",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
