#!/usr/bin/env node

const DEFAULT_PRODUCT = "MergedReflectivityQCComposite";
const BUCKETS = {
  dev: "omniwx-radar-assets-dev",
  development: "omniwx-radar-assets-dev",
  prod: "omniwx-radar-assets-prod",
  production: "omniwx-radar-assets-prod",
};
const API_BASES = {
  dev: "https://omniwx-api.omniwx.workers.dev",
  development: "https://omniwx-api.omniwx.workers.dev",
  prod: "https://omniwx-api-production.omniwx.workers.dev",
  production: "https://omniwx-api-production.omniwx.workers.dev",
};

function parseArgs(argv) {
  const args = {
    env: "dev",
    apiBase: null,
    product: DEFAULT_PRODUCT,
    bucket: null,
    prefix: null,
    json: false,
    failStorageMb: null,
    failStaleObjects: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env" && argv[i + 1]) args.env = argv[++i].trim().toLowerCase();
    else if (arg === "--api-base" && argv[i + 1]) args.apiBase = argv[++i].replace(/\/+$/g, "");
    else if (arg === "--product" && argv[i + 1]) args.product = argv[++i];
    else if (arg === "--bucket" && argv[i + 1]) args.bucket = argv[++i];
    else if (arg === "--prefix" && argv[i + 1]) args.prefix = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--fail-storage-mb" && argv[i + 1]) args.failStorageMb = Number(argv[++i]);
    else if (arg === "--fail-stale-objects" && argv[i + 1]) args.failStaleObjects = Number(argv[++i]);
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!/^[A-Za-z0-9_-]{3,80}$/.test(args.product)) {
    throw new Error(`Invalid product: ${args.product}`);
  }
  args.bucket ||= BUCKETS[args.env] || BUCKETS.dev;
  args.prefix ||= `radar/mrms/proof/${args.product}`;
  return args;
}

function printHelp() {
  console.log(`Usage: npm run mrms:storage-status -- [options]

Reports the live MRMS retained timeline plus R2 object storage under the product prefix.

Options:
  --env <dev|production>       Target environment. Default: dev
  --api-base <url>             Override Worker API base URL
  --product <name>             MRMS product. Default: ${DEFAULT_PRODUCT}
  --bucket <name>              R2 bucket. Default follows --env
  --prefix <key>               R2 frame prefix. Default: radar/mrms/proof/<product>
  --fail-storage-mb <n>        Exit non-zero if total prefix storage is above n MB
  --fail-stale-objects <n>     Exit non-zero if stale object count is above n
  --json                       Print machine-readable JSON only
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

async function fetchTimeline(args) {
  const apiBase = args.apiBase || API_BASES[args.env] || API_BASES.dev;
  const url = new URL(`${apiBase}/v1/radar/mrms/timeline`);
  url.searchParams.set("product", args.product);
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`MRMS timeline failed with ${response.status}: ${text}`);
  return JSON.parse(text);
}

function framePrefixForKey(productPrefix, key) {
  const prefix = `${productPrefix.replace(/^\/+|\/+$/g, "")}/`;
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const frame = rest.split("/")[0];
  if (!/^[0-9A-Za-z]{8,32}$/.test(frame)) return null;
  return `${prefix}${frame}`;
}

async function listObjects(args) {
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const client = await createS3Client();
  const objects = [];
  let continuationToken;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: args.bucket,
      Prefix: `${args.prefix}/`,
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [timeline, objects] = await Promise.all([fetchTimeline(args), listObjects(args)]);
  const frames = Array.isArray(timeline.frames) ? timeline.frames : [];
  const retainedPrefixes = new Set(frames
    .map((frame) => String(frame?.tileBasePrefix || "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean));

  let retainedObjectCount = 0;
  let retainedBytes = 0;
  let staleObjectCount = 0;
  let staleBytes = 0;
  const prefixes = new Map();

  for (const object of objects) {
    const framePrefix = framePrefixForKey(args.prefix, object.key);
    if (!framePrefix) continue;
    const current = prefixes.get(framePrefix) || {
      prefix: framePrefix,
      retained: retainedPrefixes.has(framePrefix),
      objectCount: 0,
      bytes: 0,
    };
    current.objectCount += 1;
    current.bytes += object.size;
    prefixes.set(framePrefix, current);
    if (retainedPrefixes.has(framePrefix)) {
      retainedObjectCount += 1;
      retainedBytes += object.size;
    } else {
      staleObjectCount += 1;
      staleBytes += object.size;
    }
  }

  const newestMs = frames.reduce((best, frame) => {
    const ms = Date.parse(String(frame?.validTime || frame?.time || ""));
    return Number.isFinite(ms) ? Math.max(best, ms) : best;
  }, Number.NEGATIVE_INFINITY);
  const newestAgeMinutes = Number.isFinite(newestMs) ? Math.round((Date.now() - newestMs) / 60_000) : null;
  const totalBytes = objects.reduce((total, object) => total + object.size, 0);
  const summary = {
    ok: true,
    env: args.env,
    bucket: args.bucket,
    product: args.product,
    prefix: args.prefix,
    timeline: {
      ok: timeline.ok === true,
      frameCount: frames.length,
      newestFrame: frames[0]?.frame || timeline.frame || null,
      newestValidTime: frames[0]?.validTime || timeline.validTime || null,
      newestAgeMinutes,
      maxZoom: timeline.maxZoom ?? frames[0]?.maxZoom ?? null,
      tileDelivery: frames[0]?.tileDelivery || timeline.tileDelivery || null,
      retentionFrames: timeline.retentionFrames ?? null,
      maxFrameAgeMinutes: timeline.maxFrameAgeMinutes ?? null,
    },
    storage: {
      objectCount: objects.length,
      totalBytes,
      totalMb: mb(totalBytes),
      retainedObjectCount,
      retainedBytes,
      retainedMb: mb(retainedBytes),
      staleObjectCount,
      staleBytes,
      staleMb: mb(staleBytes),
      retainedPrefixCount: retainedPrefixes.size,
      discoveredPrefixCount: prefixes.size,
      prefixes: Array.from(prefixes.values())
        .sort((a, b) => String(b.prefix).localeCompare(String(a.prefix)))
        .map((entry) => ({ ...entry, mb: mb(entry.bytes) })),
    },
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`MRMS ${summary.env} ${summary.product}`);
    console.log(`Timeline: ${summary.timeline.frameCount} frame(s), newest ${summary.timeline.newestFrame}, age ${summary.timeline.newestAgeMinutes} min, z${summary.timeline.maxZoom}, ${summary.timeline.tileDelivery}`);
    console.log(`R2: ${summary.storage.objectCount} objects, ${summary.storage.totalMb} MB total`);
    console.log(`Retained: ${summary.storage.retainedObjectCount} objects, ${summary.storage.retainedMb} MB`);
    console.log(`Stale: ${summary.storage.staleObjectCount} objects, ${summary.storage.staleMb} MB`);
  }

  if (Number.isFinite(args.failStorageMb) && summary.storage.totalMb > args.failStorageMb) {
    throw new Error(`MRMS storage ${summary.storage.totalMb} MB exceeds --fail-storage-mb ${args.failStorageMb}`);
  }
  if (Number.isFinite(args.failStaleObjects) && summary.storage.staleObjectCount > args.failStaleObjects) {
    throw new Error(`MRMS stale object count ${summary.storage.staleObjectCount} exceeds --fail-stale-objects ${args.failStaleObjects}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
