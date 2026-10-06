#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_BUCKET = "omniwx-radar-assets-dev";
const CONFIRM_PHRASE = "packed-radar-writes";
const PROD_BUCKET = "omniwx-radar-assets-prod";
const DEV_BUCKET = "omniwx-radar-assets-dev";

function parseArgs(argv) {
  const args = {
    latest: "",
    latestKey: "",
    packFile: "",
    tilePackKey: "",
    bucket: DEFAULT_BUCKET,
    targetEnv: "dev",
    retainFrames: 12,
    maxFrameAgeMinutes: 90,
    maxClassAOps: 4,
    confirm: "",
    dryRun: true,
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--latest" && argv[i + 1]) args.latest = argv[++i];
    else if (arg === "--latest-key" && argv[i + 1]) args.latestKey = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--pack-file" && argv[i + 1]) args.packFile = argv[++i];
    else if (arg === "--tile-pack-key" && argv[i + 1]) args.tilePackKey = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--bucket" && argv[i + 1]) args.bucket = argv[++i];
    else if (arg === "--target-env" && argv[i + 1]) args.targetEnv = argv[++i].trim().toLowerCase();
    else if (arg === "--retain-frames" && argv[i + 1]) args.retainFrames = Math.max(1, Math.min(48, Math.floor(Number(argv[++i]) || args.retainFrames)));
    else if (arg === "--max-frame-age-minutes" && argv[i + 1]) args.maxFrameAgeMinutes = Math.max(5, Math.floor(Number(argv[++i]) || args.maxFrameAgeMinutes));
    else if (arg === "--max-class-a-ops" && argv[i + 1]) args.maxClassAOps = Math.max(0, Math.floor(Number(argv[++i]) || args.maxClassAOps));
    else if (arg === "--confirm" && argv[i + 1]) args.confirm = argv[++i];
    else if (arg === "--apply") args.dryRun = false;
    else if (arg === "--force") args.force = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!args.latest) throw new Error("--latest is required");
  if (!args.latestKey) throw new Error("--latest-key is required");
  return args;
}

function printHelp() {
  console.log(`Usage: node ./scripts/publish-radar-tile-pack.mjs -- --latest <path> --latest-key <key> [options]

Publishes a packed radar frame by writing exactly two R2 objects:
one .owxpack artifact and one latest manifest. Dry-run by default.

Options:
  --latest <path>             Latest-style packed manifest JSON
  --latest-key <key>          R2 key for latest manifest
  --pack-file <path>          Override local .owxpack file path
  --tile-pack-key <key>       Override R2 key for .owxpack artifact
  --bucket <name>             R2 bucket. Default: ${DEFAULT_BUCKET}
  --target-env <dev|production> Environment guard. Default: dev
  --retain-frames <n>         Retained packed frames in latest manifest. Default: 12
  --max-frame-age-minutes <n> Refuse stale source frames. Default: 90
  --max-class-a-ops <n>       Refuse if planned Class A ops exceed n. Default: 4
  --confirm ${CONFIRM_PHRASE} Required with --apply
  --force                     Allow republishing the same frame/key
  --apply                     Actually write to R2
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

async function createS3Client() {
  const config = r2S3Config();
  if (!config) throw new Error("R2 S3 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.");
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

async function readR2ObjectText(client, bucket, key) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await response.Body?.transformToString?.();
  } catch (error) {
    const status = Number(error?.$metadata?.httpStatusCode);
    if (status === 404 || error?.name === "NoSuchKey") return null;
    throw error;
  }
}

function normalizeUtcIso(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function frameTimeMs(frame) {
  const iso = normalizeUtcIso(frame?.validTime ?? frame?.productTime ?? frame?.time);
  if (iso) return Date.parse(iso);
  const id = String(frame?.frame || "");
  const match = /^(\d{8})T(\d{6})$/.exec(id);
  if (!match) return Number.NaN;
  const [, date, time] = match;
  return Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`);
}

function currentFrameFromManifest(manifest, tilePackKey) {
  const firstFrame = Array.isArray(manifest.frames) ? manifest.frames[0] : null;
  return {
    ...manifest,
    ...(firstFrame || {}),
    tileBasePrefix: null,
    tilePackKey,
    tilePackLocalPath: undefined,
  };
}

function buildPublishManifest({ manifest, previous, tilePackKey, retainFrames, maxFrameAgeMinutes }) {
  const currentFrame = currentFrameFromManifest(manifest, tilePackKey);
  const previousFrames = Array.isArray(previous?.frames) && previous.frames.length ? previous.frames : previous ? [previous] : [];
  const byFrame = new Map();
  for (const frame of [currentFrame, ...previousFrames]) {
    if (!frame?.frame || byFrame.has(frame.frame)) continue;
    byFrame.set(frame.frame, { ...frame, tileBasePrefix: null, tilePackLocalPath: undefined });
  }

  const frames = Array.from(byFrame.values())
    .sort((a, b) => {
      const bMs = frameTimeMs(b);
      const aMs = frameTimeMs(a);
      if (Number.isFinite(aMs) && Number.isFinite(bMs)) return bMs - aMs;
      return String(b.frame || "").localeCompare(String(a.frame || ""));
    })
    .filter((frame, index, list) => {
      const newestMs = frameTimeMs(list[0]);
      const entryMs = frameTimeMs(frame);
      if (!Number.isFinite(newestMs) || !Number.isFinite(entryMs)) return true;
      return newestMs - entryMs <= maxFrameAgeMinutes * 60_000;
    })
    .slice(0, retainFrames);

  return {
    ...manifest,
    ...currentFrame,
    tileBasePrefix: null,
    tilePackKey,
    tilePackLocalPath: undefined,
    frameCount: frames.length,
    retentionFrames: retainFrames,
    maxFrameAgeMinutes,
    frames,
  };
}

function validateEnv(args, tilePackKey) {
  const env = args.targetEnv === "prod" ? "production" : args.targetEnv === "development" ? "dev" : args.targetEnv;
  if (!["dev", "production"].includes(env)) throw new Error(`Unsupported --target-env ${args.targetEnv}`);
  if (env === "production" && args.bucket !== PROD_BUCKET) {
    throw new Error(`Refusing production publish to bucket ${args.bucket}; expected ${PROD_BUCKET}`);
  }
  if (env === "dev" && args.bucket !== DEV_BUCKET) {
    throw new Error(`Refusing dev publish to bucket ${args.bucket}; expected ${DEV_BUCKET}`);
  }
  if (env === "production" && /(?:dev|proof|example|test)/i.test(tilePackKey)) {
    throw new Error(`Refusing production publish with non-production-looking tile pack key: ${tilePackKey}`);
  }
  return env;
}

function validateFreshness(manifest, maxFrameAgeMinutes) {
  const frame = Array.isArray(manifest.frames) && manifest.frames.length ? manifest.frames[0] : manifest;
  const validMs = frameTimeMs(frame);
  if (!Number.isFinite(validMs)) {
    throw new Error("Refusing publish: packed manifest has no parseable validTime/productTime/time/frame");
  }
  const ageMinutes = Math.round((Date.now() - validMs) / 60_000);
  if (ageMinutes < -15) throw new Error(`Refusing publish: source frame is ${Math.abs(ageMinutes)} minutes in the future`);
  if (ageMinutes > maxFrameAgeMinutes) {
    throw new Error(`Refusing publish: source frame is ${ageMinutes} minutes old, above --max-frame-age-minutes ${maxFrameAgeMinutes}`);
  }
  return ageMinutes;
}

function stalePackKeys(previous, retainedFrames) {
  const retained = new Set(retainedFrames.map((frame) => frame?.tilePackKey).filter(Boolean));
  const previousFrames = Array.isArray(previous?.frames) && previous.frames.length ? previous.frames : previous ? [previous] : [];
  return Array.from(new Set(previousFrames
    .map((frame) => frame?.tilePackKey)
    .filter((key) => key && !retained.has(key))));
}

async function putObject(client, bucket, key, filePath, contentType, cacheControl) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(filePath),
    ContentType: contentType,
    CacheControl: cacheControl,
  }));
}

async function putJson(client, bucket, key, json, cacheControl = "private, max-age=0") {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: json,
    ContentType: "application/json; charset=utf-8",
    CacheControl: cacheControl,
  }));
}

async function deleteObject(client, bucket, key) {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const latestPath = resolve(args.latest);
  const manifest = JSON.parse(await readFile(latestPath, "utf8"));
  const firstFrame = Array.isArray(manifest.frames) ? manifest.frames[0] : null;
  const packFile = resolve(args.packFile || manifest.tilePackLocalPath || firstFrame?.tilePackLocalPath || "");
  const tilePackKey = args.tilePackKey || manifest.tilePackKey || firstFrame?.tilePackKey || "";
  if (!packFile) throw new Error("--pack-file is required when latest manifest has no tilePackLocalPath");
  if (!tilePackKey) throw new Error("--tile-pack-key is required when latest manifest has no tilePackKey");
  const packStat = await stat(packFile).catch(() => null);
  if (!packStat?.isFile()) throw new Error(`Pack file not found or not a file: ${packFile}`);
  const targetEnv = validateEnv(args, tilePackKey);
  const sourceAgeMinutes = validateFreshness(manifest, args.maxFrameAgeMinutes);

  const client = args.dryRun ? null : await createS3Client();
  const previousText = client ? await readR2ObjectText(client, args.bucket, args.latestKey) : null;
  const previous = previousText ? JSON.parse(previousText) : null;
  const publishManifest = buildPublishManifest({
    manifest,
    previous,
    tilePackKey,
    retainFrames: args.retainFrames,
    maxFrameAgeMinutes: args.maxFrameAgeMinutes,
  });
  const duplicateLatest = previous?.frame && previous.frame === publishManifest.frame && previous?.tilePackKey === tilePackKey;
  if (duplicateLatest && !args.force) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: "same-frame-and-pack-already-latest",
      bucket: args.bucket,
      latestKey: args.latestKey,
      tilePackKey,
      sourceAgeMinutes,
    }, null, 2));
    return;
  }

  const rollbackKey = previousText ? `${args.latestKey}.rollback/${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}.json` : null;
  const stalePacks = stalePackKeys(previous, publishManifest.frames ?? []);
  const plannedClassAOps = 2 + (rollbackKey ? 1 : 0) + stalePacks.length;
  if (plannedClassAOps > args.maxClassAOps) {
    throw new Error(`Refusing ${plannedClassAOps} planned Class A ops with --max-class-a-ops ${args.maxClassAOps}`);
  }
  if (!args.dryRun && args.confirm !== CONFIRM_PHRASE) {
    throw new Error(`Refusing writes. Use --confirm ${CONFIRM_PHRASE} with --apply.`);
  }

  const publishManifestPath = resolve(`${latestPath}.publish.json`);
  await writeFile(publishManifestPath, JSON.stringify(publishManifest, null, 2), "utf8");

  const uploads = [
    {
      key: tilePackKey,
      file: packFile,
      contentType: "application/octet-stream",
      cacheControl: "public, max-age=300, stale-while-revalidate=1800",
    },
    {
      key: args.latestKey,
      file: publishManifestPath,
      contentType: "application/json; charset=utf-8",
      cacheControl: "public, max-age=30, stale-while-revalidate=120",
    },
  ];

  console.log(JSON.stringify({
    ok: true,
    dryRun: args.dryRun,
    targetEnv,
    bucket: args.bucket,
    plannedClassAOps,
    maxClassAOps: args.maxClassAOps,
    sourceAgeMinutes,
    packBytes: packStat.size,
    latestKey: args.latestKey,
    tilePackKey,
    rollbackKey,
    retainedFrameCount: publishManifest.frames?.length ?? 1,
    stalePackDeletes: stalePacks,
    uploads,
  }, null, 2));

  if (args.dryRun) return;

  if (rollbackKey && previousText) {
    await putJson(client, args.bucket, rollbackKey, previousText);
  }
  for (const upload of uploads) {
    await putObject(client, args.bucket, upload.key, upload.file, upload.contentType, upload.cacheControl);
  }
  for (const key of stalePacks) {
    await deleteObject(client, args.bucket, key);
  }

  console.log(JSON.stringify({
    ok: true,
    published: true,
    targetEnv,
    bucket: args.bucket,
    classAOps: plannedClassAOps,
    latestKey: args.latestKey,
    tilePackKey,
    rollbackKey,
    deletedStalePacks: stalePacks,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
