#!/usr/bin/env node

const API_BASES = {
  dev: "https://omniwx-api.omniwx.workers.dev",
  development: "https://omniwx-api.omniwx.workers.dev",
  prod: "https://omniwx-api-production.omniwx.workers.dev",
  production: "https://omniwx-api-production.omniwx.workers.dev",
};

const DEFAULT_MRMS_PRODUCTS = ["MergedReflectivityQCComposite"];
const DEFAULT_LEVEL3_SITES = ["IWA", "MPX", "DLH"];
const DEFAULT_LEVEL3_PRODUCTS = ["N0B", "N0S", "EET", "N0C", "N0X", "DVL", "N0H"];
const DEFAULT_REQUIRED_LEVEL3_PRODUCTS = ["N0B", "N0S"];

function parseCsv(value, fallback) {
  if (!value) return fallback;
  const parsed = String(value)
    .split(",")
    .map((entry) => entry.trim().toUpperCase().replace(/^K([A-Z0-9]{3})$/, "$1"))
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function parseArgs(argv) {
  const args = {
    env: "production",
    apiBase: null,
    mrmsProducts: DEFAULT_MRMS_PRODUCTS,
    level3Sites: DEFAULT_LEVEL3_SITES,
    level3Products: DEFAULT_LEVEL3_PRODUCTS,
    requiredLevel3Products: DEFAULT_REQUIRED_LEVEL3_PRODUCTS,
    mrmsStaleMinutes: 90,
    level3StaleMinutes: 120,
    minMrmsFrames: 1,
    minLevel3Frames: 1,
    json: false,
    fail: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env" && argv[i + 1]) args.env = argv[++i].trim().toLowerCase();
    else if (arg === "--api-base" && argv[i + 1]) args.apiBase = argv[++i].replace(/\/+$/g, "");
    else if (arg === "--mrms-products" && argv[i + 1]) args.mrmsProducts = parseCsv(argv[++i], DEFAULT_MRMS_PRODUCTS);
    else if (arg === "--level3-sites" && argv[i + 1]) args.level3Sites = parseCsv(argv[++i], DEFAULT_LEVEL3_SITES);
    else if (arg === "--level3-products" && argv[i + 1]) args.level3Products = parseCsv(argv[++i], DEFAULT_LEVEL3_PRODUCTS);
    else if (arg === "--required-level3-products" && argv[i + 1]) args.requiredLevel3Products = parseCsv(argv[++i], DEFAULT_REQUIRED_LEVEL3_PRODUCTS);
    else if (arg === "--mrms-stale-minutes" && argv[i + 1]) args.mrmsStaleMinutes = Number(argv[++i]);
    else if (arg === "--level3-stale-minutes" && argv[i + 1]) args.level3StaleMinutes = Number(argv[++i]);
    else if (arg === "--min-mrms-frames" && argv[i + 1]) args.minMrmsFrames = Number(argv[++i]);
    else if (arg === "--min-level3-frames" && argv[i + 1]) args.minLevel3Frames = Number(argv[++i]);
    else if (arg === "--json") args.json = true;
    else if (arg === "--fail") args.fail = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  args.apiBase ||= API_BASES[args.env] || API_BASES.production;
  args.mrmsStaleMinutes = positiveNumber(args.mrmsStaleMinutes, 90);
  args.level3StaleMinutes = positiveNumber(args.level3StaleMinutes, 120);
  args.minMrmsFrames = Math.max(1, Math.floor(positiveNumber(args.minMrmsFrames, 1)));
  args.minLevel3Frames = Math.max(1, Math.floor(positiveNumber(args.minLevel3Frames, 1)));
  return args;
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function printHelp() {
  console.log(`Usage: npm run radar:health -- [options]

Reads live Worker radar endpoints and reports MRMS plus Level III freshness.
This script is read-only: it does not publish tiles, delete R2 objects, or dispatch workflows.

Options:
  --env <dev|production>              Target environment. Default: production
  --api-base <url>                    Override Worker API base
  --mrms-products <csv>               MRMS products to check
  --level3-sites <csv>                Level III sites to check
  --level3-products <csv>             Level III products to check
  --required-level3-products <csv>    Products that fail health when stale. Default: N0B,N0S
  --mrms-stale-minutes <n>            MRMS stale threshold. Default: 90
  --level3-stale-minutes <n>          Level III stale threshold. Default: 120
  --min-mrms-frames <n>               Minimum MRMS frames expected. Default: 1
  --min-level3-frames <n>             Minimum Level III frames expected. Default: 1
  --fail                              Exit non-zero if required health fails
  --json                              Print machine-readable JSON only
`);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${url} returned non-JSON ${response.status}: ${text.slice(0, 240)}`);
  }
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${JSON.stringify(json).slice(0, 240)}`);
  }
  return json;
}

function ageMinutes(value) {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return null;
  return Math.round((Date.now() - ms) / 60_000);
}

function newestFrame(timeline) {
  const frames = Array.isArray(timeline?.frames) ? timeline.frames : [];
  return frames[0] || null;
}

async function checkMrmsProduct(apiBase, product, args) {
  const url = new URL(`${apiBase}/v1/radar/mrms/timeline`);
  url.searchParams.set("product", product);
  try {
    const timeline = await fetchJson(url);
    const frame = newestFrame(timeline);
    const age = ageMinutes(frame?.validTime || frame?.time || timeline.validTime || timeline.time);
    const frameCount = Array.isArray(timeline.frames) ? timeline.frames.length : Number(timeline.frameCount || 0);
    const failures = [];
    if (!timeline.ok) failures.push("timeline-not-ok");
    if (!frame) failures.push("missing-frame");
    if (age == null) failures.push("missing-valid-time");
    else if (age > args.mrmsStaleMinutes) failures.push(`stale>${args.mrmsStaleMinutes}m`);
    if (frameCount < args.minMrmsFrames) failures.push(`frames<${args.minMrmsFrames}`);
    return {
      kind: "mrms",
      product,
      ok: failures.length === 0,
      required: true,
      failures,
      newestFrame: frame?.frame || frame?.validTime || null,
      validTime: frame?.validTime || frame?.time || null,
      ageMinutes: age,
      frameCount,
      maxZoom: timeline.maxZoom ?? frame?.maxZoom ?? null,
      tileDelivery: frame?.tileDelivery || timeline.tileDelivery || null,
    };
  } catch (error) {
    return {
      kind: "mrms",
      product,
      ok: false,
      required: true,
      failures: [error instanceof Error ? error.message : String(error)],
      newestFrame: null,
      validTime: null,
      ageMinutes: null,
      frameCount: 0,
      maxZoom: null,
      tileDelivery: null,
    };
  }
}

async function checkLevel3Product(apiBase, site, product, args) {
  const url = new URL(`${apiBase}/v1/radar/level3/timeline`);
  url.searchParams.set("site", site);
  url.searchParams.set("product", product);
  const required = args.requiredLevel3Products.includes(product);
  try {
    const timeline = await fetchJson(url);
    const frame = newestFrame(timeline);
    const age = ageMinutes(frame?.validTime || frame?.productTime);
    const frameCount = Array.isArray(timeline.frames) ? timeline.frames.length : Number(timeline.frameCount || 0);
    const failures = [];
    if (!timeline.ok) failures.push("timeline-not-ok");
    if (!frame) failures.push("missing-frame");
    if (age == null) failures.push("missing-valid-time");
    else if (age > args.level3StaleMinutes) failures.push(`stale>${args.level3StaleMinutes}m`);
    if (frameCount < args.minLevel3Frames) failures.push(`frames<${args.minLevel3Frames}`);
    return {
      kind: "level3",
      site,
      product,
      ok: failures.length === 0,
      required,
      failures,
      newestFrame: frame?.frame || frame?.validTime || null,
      validTime: frame?.validTime || frame?.productTime || null,
      ageMinutes: age,
      frameCount,
      maxZoom: frame?.maxZoom ?? timeline.maxZoom ?? null,
      tileDelivery: frame?.tileDelivery || timeline.tileDelivery || null,
      tileCount: frame?.tileCount ?? null,
      totalMb: frame?.totalBytes ? Math.round((Number(frame.totalBytes) / 1024 / 1024) * 100) / 100 : null,
    };
  } catch (error) {
    return {
      kind: "level3",
      site,
      product,
      ok: false,
      required,
      failures: [error instanceof Error ? error.message : String(error)],
      newestFrame: null,
      validTime: null,
      ageMinutes: null,
      frameCount: 0,
      maxZoom: null,
      tileDelivery: null,
      tileCount: null,
      totalMb: null,
    };
  }
}

function printHuman(report) {
  console.log(`Radar health: ${report.ok ? "OK" : "ATTENTION"}`);
  console.log(`Environment: ${report.env}`);
  console.log(`API: ${report.apiBase}`);
  console.log(`Checked: ${report.checkedAt}`);
  console.log("");

  console.log("MRMS");
  for (const check of report.mrms) {
    console.log(`- ${check.ok ? "OK" : "FAIL"} ${check.product}: ${check.ageMinutes ?? "?"}m old, ${check.frameCount} frame(s), z${check.maxZoom ?? "?"}, ${check.tileDelivery ?? "unknown"}${check.failures.length ? ` (${check.failures.join(", ")})` : ""}`);
  }
  console.log("");

  console.log("Level III");
  for (const check of report.level3) {
    const label = `${check.site} ${check.product}${check.required ? " required" : " optional"}`;
    console.log(`- ${check.ok ? "OK" : check.required ? "FAIL" : "WARN"} ${label}: ${check.ageMinutes ?? "?"}m old, ${check.frameCount} frame(s), z${check.maxZoom ?? "?"}, ${check.tileCount ?? "?"} tiles${check.failures.length ? ` (${check.failures.join(", ")})` : ""}`);
  }
  console.log("");

  if (report.failures.length) {
    console.log("Required failures");
    for (const failure of report.failures) console.log(`- ${failure}`);
  } else {
    console.log("Required failures: none");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checkedAt = new Date().toISOString();
  const mrms = [];
  for (const product of args.mrmsProducts) {
    mrms.push(await checkMrmsProduct(args.apiBase, product, args));
  }

  const level3 = [];
  for (const site of args.level3Sites) {
    for (const product of args.level3Products) {
      level3.push(await checkLevel3Product(args.apiBase, site, product, args));
    }
  }

  const failures = [
    ...mrms.filter((check) => check.required && !check.ok).map((check) => `MRMS ${check.product}: ${check.failures.join(", ")}`),
    ...level3.filter((check) => check.required && !check.ok).map((check) => `Level III ${check.site} ${check.product}: ${check.failures.join(", ")}`),
  ];

  const report = {
    ok: failures.length === 0,
    checkedAt,
    env: args.env,
    apiBase: args.apiBase,
    thresholds: {
      mrmsStaleMinutes: args.mrmsStaleMinutes,
      level3StaleMinutes: args.level3StaleMinutes,
      minMrmsFrames: args.minMrmsFrames,
      minLevel3Frames: args.minLevel3Frames,
      requiredLevel3Products: args.requiredLevel3Products,
    },
    mrms,
    level3,
    failures,
  };

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (args.fail && !report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
