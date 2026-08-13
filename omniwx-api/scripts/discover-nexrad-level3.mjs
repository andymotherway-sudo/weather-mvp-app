#!/usr/bin/env node

const DEFAULT_BUCKET_URL = "https://unidata-nexrad-level3.s3.amazonaws.com";
const DEFAULT_PRODUCTS = ["N0B", "N0S", "N0Q", "N0U", "N0Z", "EET", "NET", "N0C", "N0X", "DVL", "N0H"];
const USER_AGENT = "omniwx-nexrad-level3-discovery/0.1";

function parseArgs(argv) {
  const args = {
    site: "IWA",
    products: DEFAULT_PRODUCTS,
    bucketUrl: DEFAULT_BUCKET_URL,
    days: 2,
    maxFrames: 24,
    maxKeys: 1000,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--site" || arg === "--radar") && argv[i + 1]) {
      args.site = normalizeSite(argv[++i]);
    } else if (arg === "--products" && argv[i + 1]) {
      args.products = argv[++i].split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
    } else if (arg === "--product" && argv[i + 1]) {
      args.products = [argv[++i].trim().toUpperCase()].filter(Boolean);
    } else if (arg === "--bucket-url" && argv[i + 1]) {
      args.bucketUrl = argv[++i].replace(/\/+$/, "");
    } else if (arg === "--days" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      args.days = Number.isFinite(parsed) ? Math.max(1, Math.min(7, Math.floor(parsed))) : args.days;
    } else if (arg === "--max-frames" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      args.maxFrames = Number.isFinite(parsed) ? Math.max(1, Math.min(288, Math.floor(parsed))) : args.maxFrames;
    } else if (arg === "--max-keys" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      args.maxKeys = Number.isFinite(parsed) ? Math.max(1, Math.min(1000, Math.floor(parsed))) : args.maxKeys;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!/^[A-Z0-9]{3}$/.test(args.site)) {
    throw new Error("--site must be a 3-character NEXRAD site id like IWA, MPX, or TLX");
  }
  if (!args.products.length) throw new Error("At least one product is required");
  return args;
}

function printHelp() {
  console.log(`Usage: npm run level3:discover -- [options]

Read-only NOAA NEXRAD Level III availability discovery.

Options:
  --site <id>              3-letter Level III site id. Default: IWA
  --product <code>         Single product code, for example N0B or N0S
  --products <codes>       Comma-separated products. Default: ${DEFAULT_PRODUCTS.join(",")}
  --days <count>           UTC days to inspect, newest first. Default: 2
  --max-frames <count>     Newest frames to report per product. Default: 24
  --bucket-url <url>       Public S3 HTTPS bucket URL. Default: ${DEFAULT_BUCKET_URL}
  --json                   Print machine-readable JSON
`);
}

function normalizeSite(value) {
  return String(value || "").trim().toUpperCase().replace(/^K([A-Z0-9]{3})$/, "$1");
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
        url: `${bucketUrl}/${encodeURIComponent(key)}`,
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
    url.searchParams.set("max-keys", String(args.maxKeys));
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

async function discoverProduct(args, product) {
  const now = new Date();
  const allItems = [];

  for (let offset = 0; offset < args.days; offset += 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60_000);
    const prefix = datePrefix(args.site, product, date);
    allItems.push(...await listPrefix(args, prefix));
  }

  const frames = allItems
    .sort((a, b) => String(b.time).localeCompare(String(a.time)))
    .slice(0, args.maxFrames);

  return {
    product,
    frameCount: allItems.length,
    newestFrame: frames[0] ?? null,
    frames,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const products = [];
  for (const product of args.products) {
    products.push(await discoverProduct(args, product));
  }

  const payload = {
    ok: true,
    source: "NOAA NEXRAD Level III",
    bucketUrl: args.bucketUrl,
    site: args.site,
    days: args.days,
    products,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`NEXRAD Level III site: ${payload.site}`);
  console.log(`Bucket: ${payload.bucketUrl}`);
  console.log(`Days inspected: ${payload.days}`);
  for (const product of products) {
    const newest = product.newestFrame?.time ?? "none";
    console.log(`${product.product.padEnd(4)} ${String(product.frameCount).padStart(4)} frames  newest ${newest}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
