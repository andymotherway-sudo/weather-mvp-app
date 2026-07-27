#!/usr/bin/env node

const DEFAULT_PRODUCT = "ReflectivityAtLowestAltitude";
const DEFAULT_BASE_URL = "https://mrms.ncep.noaa.gov/2D";
const USER_AGENT = "omniwx-mrms-discovery/0.1";

function parseArgs(argv) {
  const args = {
    product: DEFAULT_PRODUCT,
    baseUrl: DEFAULT_BASE_URL,
    maxFrames: 12,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--product" && argv[i + 1]) {
      args.product = argv[++i];
    } else if (arg === "--base-url" && argv[i + 1]) {
      args.baseUrl = argv[++i].replace(/\/+$/, "");
    } else if (arg === "--max-frames" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      args.maxFrames = Number.isFinite(parsed) ? Math.max(1, Math.min(288, Math.floor(parsed))) : args.maxFrames;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run mrms:discover -- [options]

Options:
  --product <name>      MRMS 2D product directory. Default: ${DEFAULT_PRODUCT}
  --base-url <url>      MRMS 2D base URL. Default: ${DEFAULT_BASE_URL}
  --max-frames <count>  Number of newest timestamped frames to report. Default: 12
  --json                Print machine-readable JSON
`);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`MRMS directory fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSize(value) {
  const trimmed = value.trim();
  const match = /^([\d.]+)\s*([KMG]?)$/i.exec(trimmed);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2].toUpperCase();
  const multiplier = unit === "G" ? 1024 ** 3 : unit === "M" ? 1024 ** 2 : unit === "K" ? 1024 : 1;
  return Math.round(amount * multiplier);
}

function parseFrameTimestamp(filename) {
  const match = /_(\d{8})-(\d{6})\.grib2\.gz$/i.exec(filename);
  if (!match) return null;
  const [, date, time] = match;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`;
}

function parseMrmsDirectory(html, directoryUrl) {
  const rows = [...html.matchAll(/<tr><td><a href="([^"]+)">([^<]+)<\/a><\/td><td align="right">([^<]*)<\/td><td align="right">([^<]*)<\/td><\/tr>/g)];
  const files = rows
    .map((match) => {
      const href = decodeHtml(match[1]);
      const name = decodeHtml(match[2]);
      if (!name.endsWith(".grib2.gz")) return null;
      return {
        name,
        url: new URL(href, directoryUrl).toString(),
        modifiedLabel: match[3].trim(),
        sizeLabel: match[4].trim(),
        sizeBytes: parseSize(match[4]),
        frameTime: parseFrameTimestamp(name),
        latestAlias: /\.latest\.grib2\.gz$/i.test(name),
      };
    })
    .filter(Boolean);

  const latest = files.find((file) => file.latestAlias) ?? null;
  const frames = files
    .filter((file) => file.frameTime)
    .sort((a, b) => String(b.frameTime).localeCompare(String(a.frameTime)));

  return { latest, frames };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const directoryUrl = `${args.baseUrl}/${encodeURIComponent(args.product)}/`;
  const html = await fetchText(directoryUrl);
  const parsed = parseMrmsDirectory(html, directoryUrl);
  const payload = {
    ok: true,
    source: "NOAA MRMS",
    product: args.product,
    directoryUrl,
    latest: parsed.latest,
    frames: parsed.frames.slice(0, args.maxFrames),
    discoveredFrameCount: parsed.frames.length,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`MRMS product: ${payload.product}`);
  console.log(`Directory: ${payload.directoryUrl}`);
  console.log(`Latest alias: ${payload.latest?.url ?? "none"}`);
  console.log(`Discovered timestamped frames: ${payload.discoveredFrameCount}`);
  for (const frame of payload.frames) {
    console.log(`${frame.frameTime}  ${frame.sizeLabel.padStart(6)}  ${frame.url}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
