#!/usr/bin/env node

const DEFAULT_PRODUCT = "MergedReflectivityQCComposite";
const CONFIRM = "cleanup-mrms-proof-dev";
const BUCKETS = {
  dev: "omniwx-radar-assets-dev",
  production: "omniwx-radar-assets-prod",
  prod: "omniwx-radar-assets-prod",
};
const API_BASES = {
  dev: "https://omniwx-api.omniwx.workers.dev",
  production: "https://omniwx-api-production.omniwx.workers.dev",
  prod: "https://omniwx-api-production.omniwx.workers.dev",
};

function parseArgs(argv) {
  const args = {
    env: "dev",
    apiBase: null,
    product: DEFAULT_PRODUCT,
    bucket: null,
    prefix: null,
    maxDeletes: 1000,
    dryRun: true,
    allowDisabled: false,
    uploader: "auto",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env" && argv[i + 1]) args.env = argv[++i];
    else if (arg === "--api-base" && argv[i + 1]) args.apiBase = argv[++i].replace(/\/+$/g, "");
    else if (arg === "--product" && argv[i + 1]) args.product = argv[++i];
    else if (arg === "--bucket" && argv[i + 1]) args.bucket = argv[++i];
    else if (arg === "--prefix" && argv[i + 1]) args.prefix = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--max-deletes" && argv[i + 1]) args.maxDeletes = Math.max(1, Math.floor(Number(argv[++i]) || args.maxDeletes));
    else if (arg === "--uploader" && argv[i + 1]) args.uploader = argv[++i].trim().toLowerCase();
    else if (arg === "--apply") args.dryRun = false;
    else if (arg === "--allow-disabled") args.allowDisabled = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!/^[A-Za-z0-9_-]{3,80}$/.test(args.product)) {
    throw new Error(`Invalid product: ${args.product}`);
  }
  if (!["auto", "s3", "worker"].includes(args.uploader)) {
    throw new Error(`Unsupported cleanup uploader "${args.uploader}". Use auto, s3, or worker.`);
  }
  args.bucket ||= BUCKETS[args.env] || BUCKETS.dev;
  args.prefix ||= `radar/mrms/proof/${args.product}`;

  return args;
}

function printHelp() {
  console.log(`Usage: npm run mrms:cleanup-retained -- [options]

Deletes MRMS proof frame prefixes that are not listed in the live latest manifest.
Default is dry-run.

Options:
  --env <dev|production>  Worker environment. Default: dev
  --api-base <url>        Override Worker API base URL
  --product <name>        MRMS product. Default: ${DEFAULT_PRODUCT}
  --bucket <name>         R2 bucket. Default follows --env
  --prefix <key>          Product frame prefix. Default: radar/mrms/proof/<product>
  --max-deletes <n>       Delete safety cap. Default: 1000
  --uploader <auto|s3|worker> Cleanup transport. Default: auto
  --apply                 Actually delete. Default is dry-run
  --allow-disabled        Exit 0 if maintenance is disabled
`);
}

function r2S3Config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const endpoint = String(process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")).trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, accessKeyId, secretAccessKey };
}

function resolveUploader(args) {
  if (args.uploader === "worker") return "worker";
  return r2S3Config() ? "s3" : "worker";
}

async function createS3Client() {
  const config = r2S3Config();
  if (!config) {
    throw new Error("R2 S3 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.");
  }
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

async function workerTimeline(args) {
  const apiBase = args.apiBase || API_BASES[args.env] || API_BASES.dev;
  const timelineUrl = new URL(`${apiBase}/v1/radar/mrms/timeline`);
  timelineUrl.searchParams.set("product", args.product);
  const response = await fetch(timelineUrl);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Latest MRMS timeline request failed with ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

function retainedPrefixesFromTimeline(timeline) {
  const frames = Array.isArray(timeline?.frames) ? timeline.frames : [];
  return new Set(frames
    .map((frame) => String(frame?.tileBasePrefix || "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean));
}

function framePrefixForKey(productPrefix, key) {
  const prefix = `${productPrefix.replace(/^\/+|\/+$/g, "")}/`;
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const frame = rest.split("/")[0];
  if (!/^[0-9A-Za-z]{8,32}$/.test(frame)) return null;
  return `${prefix}${frame}`;
}

async function listStaleObjectsS3(args, client, retainedPrefixes) {
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const staleObjects = [];
  const stalePrefixes = new Set();
  let continuationToken;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: args.bucket,
      Prefix: `${args.prefix}/`,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));
    for (const object of response.Contents || []) {
      const key = String(object.Key || "");
      const framePrefix = framePrefixForKey(args.prefix, key);
      if (!framePrefix || retainedPrefixes.has(framePrefix)) continue;
      staleObjects.push({ Key: key, Size: object.Size });
      stalePrefixes.add(framePrefix);
      if (staleObjects.length > args.maxDeletes) {
        throw new Error(`Refusing cleanup: ${staleObjects.length} stale objects exceeds --max-deletes ${args.maxDeletes}`);
      }
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return { staleObjects, stalePrefixes: Array.from(stalePrefixes).sort() };
}

async function deleteObjectsS3(args, client, staleObjects) {
  const { DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
  let deleted = 0;
  for (let i = 0; i < staleObjects.length; i += 1000) {
    const chunk = staleObjects.slice(i, i + 1000);
    const response = await client.send(new DeleteObjectsCommand({
      Bucket: args.bucket,
      Delete: {
        Quiet: true,
        Objects: chunk.map((object) => ({ Key: object.Key })),
      },
    }));
    if (response.Errors?.length) {
      throw new Error(`R2 cleanup failed for ${response.Errors.length} objects: ${response.Errors[0]?.Key || "unknown key"}`);
    }
    deleted += chunk.length;
  }
  return deleted;
}

async function cleanupWithS3(args) {
  const timeline = await workerTimeline(args);
  const retainedPrefixes = retainedPrefixesFromTimeline(timeline);
  if (!retainedPrefixes.size) {
    throw new Error("Refusing cleanup: latest MRMS timeline has no retained frame prefixes.");
  }

  const client = await createS3Client();
  const { staleObjects, stalePrefixes } = await listStaleObjectsS3(args, client, retainedPrefixes);
  const deletedObjects = args.dryRun ? 0 : await deleteObjectsS3(args, client, staleObjects);
  return {
    ok: true,
    transport: "s3",
    env: args.env,
    bucket: args.bucket,
    prefix: args.prefix,
    product: args.product,
    dryRun: args.dryRun,
    retainedPrefixes: Array.from(retainedPrefixes).sort(),
    stalePrefixes,
    staleObjectCount: staleObjects.length,
    staleBytes: staleObjects.reduce((total, object) => total + (Number(object.Size) || 0), 0),
    deletedObjects,
  };
}

async function cleanupWithWorker(args) {
  const apiBase = args.apiBase || API_BASES[args.env] || API_BASES.dev;
  const url = new URL(`${apiBase}/v1/radar/mrms/maintenance/cleanup-retained`);
  url.searchParams.set("product", args.product);
  url.searchParams.set("confirm", CONFIRM);
  url.searchParams.set("maxDeletes", String(args.maxDeletes));
  if (!args.dryRun) url.searchParams.set("dryRun", "0");

  const response = await fetch(url, { method: "POST" });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Keep the raw body in the output below.
  }

  const disabledAllowed = args.allowDisabled && json?.error === "mrms-maintenance-disabled";
  console.log(JSON.stringify({
    ok: disabledAllowed || (response.ok && (json?.ok !== false)),
    status: response.status,
    env: args.env,
    apiBase,
    dryRun: args.dryRun,
    allowedDisabled: disabledAllowed,
    response: json ?? text,
  }, null, 2));

  if (!response.ok || json?.ok === false) {
    if (disabledAllowed) return;
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uploader = resolveUploader(args);
  if (uploader === "s3") {
    console.log(JSON.stringify(await cleanupWithS3(args), null, 2));
    return;
  }
  await cleanupWithWorker(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
