#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";

const DEFAULT_BUCKET_URL = "https://unidata-nexrad-level3.s3.amazonaws.com";
const USER_AGENT = "omniwx-nexrad-level3-download/0.1";

function normalizeSite(value) {
  return String(value || "").trim().toUpperCase().replace(/^K([A-Z0-9]{3})$/, "$1");
}

function parseArgs(argv) {
  const args = {
    site: "IWA",
    product: "N0B",
    bucketUrl: DEFAULT_BUCKET_URL,
    outputDir: "../tmp/nexrad-level3",
    days: 2,
    frameUrl: null,
    key: null,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--site" || arg === "--radar") && argv[i + 1]) {
      args.site = normalizeSite(argv[++i]);
    } else if (arg === "--product" && argv[i + 1]) {
      args.product = argv[++i].trim().toUpperCase();
    } else if (arg === "--bucket-url" && argv[i + 1]) {
      args.bucketUrl = argv[++i].replace(/\/+$/, "");
    } else if (arg === "--output-dir" && argv[i + 1]) {
      args.outputDir = argv[++i];
    } else if (arg === "--days" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      args.days = Number.isFinite(parsed) ? Math.max(1, Math.min(7, Math.floor(parsed))) : args.days;
    } else if (arg === "--url" && argv[i + 1]) {
      args.frameUrl = argv[++i];
    } else if (arg === "--key" && argv[i + 1]) {
      args.key = argv[++i];
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!args.frameUrl && !args.key && !/^[A-Z0-9]{3}$/.test(args.site)) {
    throw new Error("--site must be a 3-character NEXRAD site id like IWA, MPX, or DLH");
  }
  if (!args.frameUrl && !args.key && !/^[A-Z0-9]{3}$/.test(args.product)) {
    throw new Error("--product must be a 3-character Level III product code like N0B, N0S, or EET");
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run level3:download -- [options]

Download one NOAA NEXRAD Level III object locally. This never writes to R2.

Options:
  --site <id>              3-letter Level III site id. Default: IWA
  --product <code>         Product code. Default: N0B
  --days <count>           UTC days to inspect for latest object. Default: 2
  --key <object-key>       Exact S3 object key to download
  --url <object-url>       Exact HTTPS object URL to download
  --output-dir <path>      Output directory. Default: ../tmp/nexrad-level3
  --json                   Print machine-readable JSON
`);
}

function utcDateParts(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return { y: String(y), m, d };
}

function datePrefix(site, product, date) {
  const { y, m, d } = utcDateParts(date);
  return `${site}_${product}_${y}_${m}_${d}`;
}

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseLevel3Key(key) {
  const match = /^([A-Z0-9]{3})_([A-Z0-9]{3})_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})$/.exec(key);
  if (!match) return null;
  const [, site, product, y, m, d, hh, mm, ss] = match;
  return {
    site,
    product,
    time: `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`,
  };
}

function objectUrl(bucketUrl, key) {
  return `${bucketUrl}/${encodeURIComponent(key)}`;
}

function parseListBucketXml(xml, bucketUrl) {
  const items = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)]
    .map((match) => {
      const block = match[1];
      const key = decodeXml(/<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1] ?? "");
      const lastModified = decodeXml(/<LastModified>([\s\S]*?)<\/LastModified>/.exec(block)?.[1] ?? "");
      const size = Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] ?? NaN);
      const parsed = parseLevel3Key(key);
      if (!key || !parsed) return null;
      return {
        key,
        url: objectUrl(bucketUrl, key),
        site: parsed.site,
        product: parsed.product,
        time: parsed.time,
        lastModified,
        sizeBytes: Number.isFinite(size) ? size : null,
      };
    })
    .filter(Boolean);

  const continuationToken = decodeXml(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] ?? "");
  const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  return { items, continuationToken: continuationToken || null, isTruncated };
}

async function listPrefix(args, prefix) {
  const items = [];
  let continuationToken = null;

  do {
    const url = new URL(args.bucketUrl);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("max-keys", "1000");
    if (continuationToken) url.searchParams.set("continuation-token", continuationToken);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/xml,text/xml",
      },
    });
    if (!response.ok) {
      throw new Error(`Level III list failed for ${prefix}: ${response.status} ${response.statusText}`);
    }

    const parsed = parseListBucketXml(await response.text(), args.bucketUrl);
    items.push(...parsed.items);
    continuationToken = parsed.isTruncated ? parsed.continuationToken : null;
  } while (continuationToken);

  return items;
}

async function findLatest(args) {
  const now = new Date();
  const allItems = [];

  for (let offset = 0; offset < args.days; offset += 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60_000);
    allItems.push(...await listPrefix(args, datePrefix(args.site, args.product, date)));
  }

  return allItems.sort((a, b) => String(b.time).localeCompare(String(a.time)))[0] ?? null;
}

async function downloadFile(url, outputDir) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(`Level III download failed: ${response.status} ${response.statusText}`);
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, basename(new URL(response.url).pathname));
  await pipeline(response.body, createWriteStream(outputPath));
  const info = await stat(outputPath);
  return { outputPath, sizeBytes: info.size, finalUrl: response.url };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selected = args.frameUrl
    ? { key: basename(new URL(args.frameUrl).pathname), url: args.frameUrl, time: null, site: args.site, product: args.product }
    : args.key
      ? { key: args.key, url: objectUrl(args.bucketUrl, args.key), ...parseLevel3Key(args.key) }
      : await findLatest(args);

  if (!selected) {
    throw new Error(`No Level III frame found for ${args.site} ${args.product} in the last ${args.days} UTC day(s)`);
  }

  const downloaded = await downloadFile(selected.url, args.outputDir);
  const payload = {
    ok: true,
    source: "NOAA NEXRAD Level III",
    site: selected.site,
    product: selected.product,
    time: selected.time,
    key: selected.key,
    url: selected.url,
    outputPath: downloaded.outputPath,
    sizeBytes: downloaded.sizeBytes,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Downloaded ${payload.site} ${payload.product} ${payload.time ?? ""}`.trim());
  console.log(`Key: ${payload.key}`);
  console.log(`Path: ${payload.outputPath}`);
  console.log(`Bytes: ${payload.sizeBytes}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
