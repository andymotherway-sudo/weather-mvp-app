#!/usr/bin/env node

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

const DEFAULT_PRODUCT = "ReflectivityAtLowestAltitude";
const DEFAULT_BASE_URL = "https://mrms.ncep.noaa.gov/2D";
const DEFAULT_OUTPUT_DIR = "../tmp/mrms";
const USER_AGENT = "omniwx-mrms-download/0.1";
const DEFAULT_RETRIES = 3;
const MIN_GZIP_BYTES = 1024;
function parseArgs(argv) {
  const args = {
    product: DEFAULT_PRODUCT,
    baseUrl: DEFAULT_BASE_URL,
    outputDir: DEFAULT_OUTPUT_DIR,
    frameUrl: null,
    retries: DEFAULT_RETRIES,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--product" && argv[i + 1]) {
      args.product = argv[++i];
    } else if (arg === "--base-url" && argv[i + 1]) {
      args.baseUrl = argv[++i].replace(/\/+$/, "");
    } else if (arg === "--output-dir" && argv[i + 1]) {
      args.outputDir = argv[++i];
    } else if (arg === "--url" && argv[i + 1]) {
      args.frameUrl = argv[++i];
    } else if (arg === "--retries" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      args.retries = Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : DEFAULT_RETRIES;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run mrms:download -- [options]

Options:
  --product <name>      MRMS 2D product directory. Default: ${DEFAULT_PRODUCT}
  --base-url <url>      MRMS 2D base URL. Default: ${DEFAULT_BASE_URL}
  --url <frame-url>     Exact frame URL to download instead of the latest alias
  --output-dir <path>   Output directory. Default: ${DEFAULT_OUTPUT_DIR}
  --retries <count>     Retry incomplete/truncated downloads. Default: ${DEFAULT_RETRIES}
`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function validateDownloadedFile(outputPath) {
  const info = await stat(outputPath);
  if (info.size < MIN_GZIP_BYTES) {
    throw new Error(`MRMS download too small: ${info.size} bytes`);
  }
  if (!outputPath.endsWith(".gz")) {
    return info;
  }

  await pipeline(
    createReadStream(outputPath),
    createGunzip(),
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  );
  return info;
}

async function downloadFile(url, outputDir) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(`MRMS download failed: ${response.status} ${response.statusText}`);
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, basename(new URL(response.url).pathname));
  await pipeline(response.body, createWriteStream(outputPath));
  const info = await validateDownloadedFile(outputPath);
  return { outputPath, sizeBytes: info.size, finalUrl: response.url };
}

async function downloadFileWithRetry(url, outputDir, retries) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await downloadFile(url, outputDir);
    } catch (error) {
      lastError = error;
      const outputPath = join(outputDir, basename(new URL(url).pathname));
      await rm(outputPath, { force: true }).catch(() => undefined);
      if (attempt >= retries) break;
      const delayMs = 1500 * attempt;
      console.warn(`MRMS download attempt ${attempt} failed; retrying in ${delayMs}ms: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(delayMs);
    }
  }
  throw lastError ?? new Error("MRMS download failed");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const frameUrl = args.frameUrl ?? `${args.baseUrl}/${encodeURIComponent(args.product)}/MRMS_${args.product}.latest.grib2.gz`;
  const result = await downloadFileWithRetry(frameUrl, args.outputDir, args.retries);
  console.log(JSON.stringify({
    ok: true,
    source: "NOAA MRMS",
    product: args.product,
    url: result.finalUrl,
    outputPath: result.outputPath,
    sizeBytes: result.sizeBytes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
