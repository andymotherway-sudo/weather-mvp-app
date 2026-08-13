#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_BUCKET_URL = "https://unidata-nexrad-level3.s3.amazonaws.com";
const DEFAULT_PRODUCTS = ["N0B", "N0S", "EET"];
const DEFAULT_SITES = ["IWA", "MPX", "DLH", "TLX", "CAE"];
const USER_AGENT = "omniwx-nexrad-level3-inventory/0.1";

function normalizeSite(value) {
  return String(value || "").trim().toUpperCase().replace(/^K([A-Z0-9]{3})$/, "$1");
}

function parseArgs(argv) {
  const args = {
    bucketUrl: DEFAULT_BUCKET_URL,
    sites: [...DEFAULT_SITES],
    products: [...DEFAULT_PRODUCTS],
    days: 1,
    maxSites: 30,
    json: false,
    allNexrad: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--sites" && argv[i + 1]) {
      args.sites = argv[++i].split(",").map(normalizeSite).filter(Boolean);
    } else if (arg === "--site" && argv[i + 1]) {
      args.sites = [normalizeSite(argv[++i])].filter(Boolean);
    } else if (arg === "--products" && argv[i + 1]) {
      args.products = argv[++i].split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
    } else if (arg === "--product" && argv[i + 1]) {
      args.products = [argv[++i].trim().toUpperCase()].filter(Boolean);
    } else if (arg === "--days" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      args.days = Number.isFinite(parsed) ? Math.max(1, Math.min(7, Math.floor(parsed))) : args.days;
    } else if (arg === "--max-sites" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      args.maxSites = Number.isFinite(parsed) ? Math.max(1, Math.min(200, Math.floor(parsed))) : args.maxSites;
    } else if (arg === "--bucket-url" && argv[i + 1]) {
      args.bucketUrl = argv[++i].replace(/\/+$/, "");
    } else if (arg === "--all-nexrad") {
      args.allNexrad = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  args.sites = [...new Set(args.sites.map(normalizeSite).filter((site) => /^[A-Z0-9]{3}$/.test(site)))];
  args.products = [...new Set(args.products.filter((product) => /^[A-Z0-9]{3}$/.test(product)))];
  if (!args.products.length) throw new Error("At least one Level III product is required");
  return args;
}

function printHelp() {
  console.log(`Usage: npm run level3:inventory -- [options]

Read-only NOAA NEXRAD Level III inventory across multiple sites.

Options:
  --sites <ids>            Comma-separated 3-letter site ids. Default: ${DEFAULT_SITES.join(",")}
  --all-nexrad             Load the app's NEXRAD catalog and sample up to --max-sites
  --max-sites <count>      Safety cap for --all-nexrad. Default: 30
  --product <code>         Single product code
  --products <codes>       Comma-separated products. Default: ${DEFAULT_PRODUCTS.join(",")}
  --days <count>           UTC days to inspect. Default: 1
  --bucket-url <url>       Public S3 HTTPS bucket URL. Default: ${DEFAULT_BUCKET_URL}
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
  return { site, product, time: `${y}-${m}-${d}T${hh}:${mm}:${ss}Z` };
}

function parseListBucketXml(xml) {
  const items = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)]
    .map((match) => {
      const block = match[1];
      const key = decodeXml(/<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1] ?? "");
      const size = Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] ?? NaN);
      const parsed = parseLevel3Key(key);
      if (!parsed) return null;
      return {
        key,
        site: parsed.site,
        product: parsed.product,
        time: parsed.time,
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

    const parsed = parseListBucketXml(await response.text());
    items.push(...parsed.items);
    continuationToken = parsed.isTruncated ? parsed.continuationToken : null;
  } while (continuationToken);

  return items;
}

async function loadAppNexradSites(limit) {
  const raw = await readFile(join("..", "app", "lib", "maps", "nexradSites.json"), "utf8");
  const catalog = JSON.parse(raw);
  return catalog
    .filter((site) => String(site?.ownerType ?? "").toUpperCase() === "NEXRAD")
    .map((site) => normalizeSite(site?.id))
    .filter((site) => /^[A-Z0-9]{3}$/.test(site))
    .slice(0, limit);
}

async function inspectSiteProduct(args, site, product) {
  const now = new Date();
  const allItems = [];
  for (let offset = 0; offset < args.days; offset += 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60_000);
    allItems.push(...await listPrefix(args, datePrefix(site, product, date)));
  }
  const frames = allItems.sort((a, b) => String(b.time).localeCompare(String(a.time)));
  return {
    product,
    frameCount: allItems.length,
    newestTime: frames[0]?.time ?? null,
    newestKey: frames[0]?.key ?? null,
    newestSizeBytes: frames[0]?.sizeBytes ?? null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sites = args.allNexrad ? await loadAppNexradSites(args.maxSites) : args.sites.slice(0, args.maxSites);
  const results = [];

  for (const site of sites) {
    const products = [];
    for (const product of args.products) {
      products.push(await inspectSiteProduct(args, site, product));
    }
    results.push({ site, products });
  }

  const payload = {
    ok: true,
    source: "NOAA NEXRAD Level III",
    bucketUrl: args.bucketUrl,
    days: args.days,
    siteCount: sites.length,
    productCodes: args.products,
    sites: results,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`NEXRAD Level III inventory: ${payload.siteCount} site(s), products ${args.products.join(",")}`);
  for (const site of results) {
    const summary = site.products
      .map((product) => `${product.product}:${product.frameCount}${product.newestTime ? `@${product.newestTime.slice(11, 16)}Z` : ""}`)
      .join("  ");
    console.log(`${site.site.padEnd(4)} ${summary}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
