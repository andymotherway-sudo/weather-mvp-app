#!/usr/bin/env node

const API_BASES = {
  dev: "https://omniwx-api.omniwx.workers.dev",
  development: "https://omniwx-api.omniwx.workers.dev",
  prod: "https://omniwx-api-production.omniwx.workers.dev",
  production: "https://omniwx-api-production.omniwx.workers.dev",
};

const BUCKETS = {
  dev: "omniwx-radar-assets-dev",
  development: "omniwx-radar-assets-dev",
  prod: "omniwx-radar-assets-prod",
  production: "omniwx-radar-assets-prod",
};

const DEFAULT_MRMS_PRODUCTS = [
  "MergedReflectivityQCComposite",
  "ReflectivityAtLowestAltitude",
  "EchoTop_18",
  "PrecipRate",
];
const DEFAULT_LEVEL3_SITES = ["IWA", "MPX", "DLH"];
const DEFAULT_LEVEL3_PRODUCTS = ["N0B", "N0S", "EET", "N0C", "N0X", "DVL", "N0H"];

function parseCsv(value, fallback, transform = (item) => item) {
  if (!value) return fallback;
  const parsed = String(value)
    .split(",")
    .map((entry) => transform(entry.trim()))
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function parseArgs(argv) {
  const args = {
    env: "production",
    apiBase: null,
    bucket: null,
    mrmsProducts: DEFAULT_MRMS_PRODUCTS,
    level3Sites: DEFAULT_LEVEL3_SITES,
    level3Products: DEFAULT_LEVEL3_PRODUCTS,
    failStorageMb: null,
    warnStorageMb: 500,
    warnStaleObjects: 0,
    failStaleObjects: null,
    failStaleMb: 50,
    json: false,
    fail: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env" && argv[i + 1]) args.env = argv[++i].trim().toLowerCase();
    else if (arg === "--api-base" && argv[i + 1]) args.apiBase = argv[++i].replace(/\/+$/g, "");
    else if (arg === "--bucket" && argv[i + 1]) args.bucket = argv[++i];
    else if (arg === "--mrms-products" && argv[i + 1]) args.mrmsProducts = parseCsv(argv[++i], DEFAULT_MRMS_PRODUCTS);
    else if (arg === "--level3-sites" && argv[i + 1]) {
      args.level3Sites = parseCsv(argv[++i], DEFAULT_LEVEL3_SITES, (site) => site.toUpperCase().replace(/^K([A-Z0-9]{3})$/, "$1"));
    } else if (arg === "--level3-products" && argv[i + 1]) {
      args.level3Products = parseCsv(argv[++i], DEFAULT_LEVEL3_PRODUCTS, (product) => product.toUpperCase());
    } else if (arg === "--fail-storage-mb" && argv[i + 1]) args.failStorageMb = Number(argv[++i]);
    else if (arg === "--warn-storage-mb" && argv[i + 1]) args.warnStorageMb = Number(argv[++i]);
    else if (arg === "--warn-stale-objects" && argv[i + 1]) args.warnStaleObjects = Number(argv[++i]);
    else if (arg === "--fail-stale-objects" && argv[i + 1]) args.failStaleObjects = Number(argv[++i]);
    else if (arg === "--fail-stale-mb" && argv[i + 1]) args.failStaleMb = Number(argv[++i]);
    else if (arg === "--json") args.json = true;
    else if (arg === "--fail") args.fail = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  args.apiBase ||= API_BASES[args.env] || API_BASES.production;
  args.bucket ||= BUCKETS[args.env] || BUCKETS.production;
  args.warnStorageMb = finiteNumber(args.warnStorageMb, 500);
  args.failStorageMb = Number.isFinite(args.failStorageMb) ? args.failStorageMb : null;
  args.warnStaleObjects = Number.isFinite(args.warnStaleObjects) ? Math.max(0, Math.floor(args.warnStaleObjects)) : 0;
  args.failStaleObjects = Number.isFinite(args.failStaleObjects) ? Math.max(0, Math.floor(args.failStaleObjects)) : null;
  args.failStaleMb = Number.isFinite(args.failStaleMb) ? args.failStaleMb : null;
  return args;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function printHelp() {
  console.log(`Usage: npm run radar:storage-health -- [options]

Read-only R2 storage guardrail report for owned radar.
Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY in the environment.

Options:
  --env <dev|production>           Target environment. Default: production
  --api-base <url>                 Override Worker API base
  --bucket <name>                  Override R2 bucket
  --mrms-products <csv>            MRMS products to inspect
  --level3-sites <csv>             Level III sites to inspect
  --level3-products <csv>          Level III products to inspect
  --warn-storage-mb <n>            Add warning above n MB. Default: 500
  --fail-storage-mb <n>            Fail above n MB
  --warn-stale-objects <n>         Warn if stale frame objects exceed n. Default: 0
  --fail-stale-objects <n>         Fail if stale objects exceed n
  --fail-stale-mb <n>              Fail if stale frame storage exceeds n MB. Default: 50
  --fail                           Exit non-zero for guardrail failures
  --json                           Print machine-readable JSON only
`);
}

function r2S3Config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const endpoint = String(process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")).trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 S3 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.");
  }
  return { endpoint, accessKeyId, secretAccessKey };
}

async function createS3Client() {
  const config = r2S3Config();
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
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
  if (!response.ok) throw new Error(`${url} failed with ${response.status}: ${JSON.stringify(json).slice(0, 240)}`);
  return json;
}

async function listObjects(client, bucket, prefix) {
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const objects = [];
  let continuationToken;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));
    for (const object of response.Contents || []) {
      objects.push({
        key: String(object.Key || ""),
        size: Number(object.Size) || 0,
        lastModified: object.LastModified ? new Date(object.LastModified).toISOString() : null,
      });
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

function mb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function ageMinutes(value) {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return null;
  return Math.round((Date.now() - ms) / 60_000);
}

function framePrefixFromKey(prefix, key) {
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const frame = rest.split("/")[0];
  if (!frame || !/^[0-9A-Za-z_-]{6,48}$/.test(frame)) return null;
  return `${prefix}${frame}`.replace(/\/+$/g, "");
}

function retainedPrefixesFromTimeline(timeline) {
  const frames = Array.isArray(timeline?.frames) ? timeline.frames : [];
  return new Set(frames
    .map((frame) => String(frame?.tileBasePrefix || "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean));
}

function newestFrame(timeline) {
  const frames = Array.isArray(timeline?.frames) ? timeline.frames : [];
  return frames[0] || null;
}

function summarizePrefix({ label, kind, objects, timeline, prefix }) {
  const retainedPrefixes = retainedPrefixesFromTimeline(timeline);
  let retainedObjects = 0;
  let retainedBytes = 0;
  let staleObjects = 0;
  let staleBytes = 0;
  let metadataObjects = 0;
  let metadataBytes = 0;

  for (const object of objects) {
    const framePrefix = framePrefixFromKey(prefix, object.key);
    if (!framePrefix) {
      metadataObjects += 1;
      metadataBytes += object.size;
    } else if (retainedPrefixes.has(framePrefix)) {
      retainedObjects += 1;
      retainedBytes += object.size;
    } else {
      staleObjects += 1;
      staleBytes += object.size;
    }
  }

  const frame = newestFrame(timeline);
  const validTime = frame?.validTime || frame?.productTime || frame?.time || timeline?.validTime || null;
  const totalBytes = objects.reduce((total, object) => total + object.size, 0);
  return {
    label,
    kind,
    prefix: prefix.replace(/\/+$/g, ""),
    ok: staleObjects === 0,
    frameCount: Array.isArray(timeline?.frames) ? timeline.frames.length : 0,
    newestValidTime: validTime,
    newestAgeMinutes: ageMinutes(validTime),
    objectCount: objects.length,
    totalBytes,
    totalMb: mb(totalBytes),
    retainedObjects,
    retainedMb: mb(retainedBytes),
    staleObjects,
    staleMb: mb(staleBytes),
    metadataObjects,
    metadataMb: mb(metadataBytes),
  };
}

async function inspectMrms(client, args, product) {
  const prefix = `radar/mrms/proof/${product}/`;
  const url = new URL(`${args.apiBase}/v1/radar/mrms/timeline`);
  url.searchParams.set("product", product);
  const [timeline, objects] = await Promise.all([
    fetchJson(url),
    listObjects(client, args.bucket, prefix),
  ]);
  return summarizePrefix({ label: `MRMS ${product}`, kind: "mrms", objects, timeline, prefix });
}

async function inspectLevel3(client, args, site, product) {
  const prefix = `radar/level3/proof/${site}/${product}/`;
  const url = new URL(`${args.apiBase}/v1/radar/level3/timeline`);
  url.searchParams.set("site", site);
  url.searchParams.set("product", product);
  const [timeline, objects] = await Promise.all([
    fetchJson(url),
    listObjects(client, args.bucket, prefix),
  ]);
  return summarizePrefix({ label: `Level III ${site} ${product}`, kind: "level3", objects, timeline, prefix });
}

function summarizeTotals(checks) {
  const totals = checks.reduce((acc, check) => {
    acc.objectCount += check.objectCount;
    acc.totalBytes += check.totalBytes;
    acc.retainedObjects += check.retainedObjects;
    acc.staleObjects += check.staleObjects;
    acc.metadataObjects += check.metadataObjects;
    return acc;
  }, {
    objectCount: 0,
    totalBytes: 0,
    retainedObjects: 0,
    staleObjects: 0,
    metadataObjects: 0,
  });
  totals.totalMb = mb(totals.totalBytes);
  totals.staleMb = Math.round(checks.reduce((total, check) => total + check.staleMb, 0) * 100) / 100;
  return totals;
}

function printHuman(report) {
  console.log(`Radar storage health: ${report.ok ? "OK" : "ATTENTION"}`);
  console.log(`Environment: ${report.env}`);
  console.log(`Bucket: ${report.bucket}`);
  console.log(`Checked: ${report.checkedAt}`);
  console.log(`Total tracked: ${report.totals.objectCount} objects, ${report.totals.totalMb} MB`);
  console.log(`Stale frame objects: ${report.totals.staleObjects}`);
  console.log("");
  for (const check of report.checks) {
    console.log(`- ${check.ok ? "OK" : "STALE"} ${check.label}: ${check.frameCount} frame(s), ${check.objectCount} objects, ${check.totalMb} MB, stale ${check.staleObjects}`);
  }
  console.log("");
  if (report.warnings.length) {
    console.log("Warnings");
    for (const warning of report.warnings) console.log(`- ${warning}`);
  } else {
    console.log("Warnings: none");
  }
  if (report.failures.length) {
    console.log("Failures");
    for (const failure of report.failures) console.log(`- ${failure}`);
  } else {
    console.log("Failures: none");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = await createS3Client();
  const checks = [];

  for (const product of args.mrmsProducts) {
    checks.push(await inspectMrms(client, args, product));
  }
  for (const site of args.level3Sites) {
    for (const product of args.level3Products) {
      checks.push(await inspectLevel3(client, args, site, product));
    }
  }

  const totals = summarizeTotals(checks);
  const warnings = [];
  const failures = [];
  if (Number.isFinite(args.warnStorageMb) && totals.totalMb > args.warnStorageMb) {
    warnings.push(`Tracked radar storage ${totals.totalMb} MB exceeds warning threshold ${args.warnStorageMb} MB`);
  }
  if (Number.isFinite(args.warnStaleObjects) && totals.staleObjects > args.warnStaleObjects) {
    warnings.push(`Stale frame objects ${totals.staleObjects} exceeds warning threshold ${args.warnStaleObjects}; this can happen during active publish/cleanup windows`);
  }
  if (Number.isFinite(args.failStorageMb) && totals.totalMb > args.failStorageMb) {
    failures.push(`Tracked radar storage ${totals.totalMb} MB exceeds failure threshold ${args.failStorageMb} MB`);
  }
  if (Number.isFinite(args.failStaleMb) && totals.staleMb > args.failStaleMb) {
    failures.push(`Stale frame storage ${totals.staleMb} MB exceeds failure threshold ${args.failStaleMb} MB`);
  }
  if (Number.isFinite(args.failStaleObjects) && totals.staleObjects > args.failStaleObjects) {
    failures.push(`Stale frame objects ${totals.staleObjects} exceeds failure threshold ${args.failStaleObjects}`);
  }

  const report = {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    env: args.env,
    apiBase: args.apiBase,
    bucket: args.bucket,
    guardrails: {
      warnStorageMb: args.warnStorageMb,
      failStorageMb: args.failStorageMb,
      warnStaleObjects: args.warnStaleObjects,
      failStaleObjects: args.failStaleObjects,
      failStaleMb: args.failStaleMb,
    },
    totals,
    warnings,
    failures,
    checks,
  };

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (args.fail && failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
