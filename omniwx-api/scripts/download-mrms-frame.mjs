#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";

const DEFAULT_PRODUCT = "ReflectivityAtLowestAltitude";
const DEFAULT_BASE_URL = "https://mrms.ncep.noaa.gov/2D";
const DEFAULT_OUTPUT_DIR = "../tmp/mrms";
const USER_AGENT = "omniwx-mrms-download/0.1";

function parseArgs(argv) {
  const args = {
    product: DEFAULT_PRODUCT,
    baseUrl: DEFAULT_BASE_URL,
    outputDir: DEFAULT_OUTPUT_DIR,
    frameUrl: null,
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
`);
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
  const info = await stat(outputPath);
  return { outputPath, sizeBytes: info.size, finalUrl: response.url };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const frameUrl = args.frameUrl ?? `${args.baseUrl}/${encodeURIComponent(args.product)}/MRMS_${args.product}.latest.grib2.gz`;
  const result = await downloadFile(frameUrl, args.outputDir);
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
