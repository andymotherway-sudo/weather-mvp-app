#!/usr/bin/env node

// Discovers fresh, public NOAA GOES CMI files from Google's NODD mirror. It is
// intentionally read-only so it can prove source freshness before any R2 writes.
const SATELLITES = {
  G18: 'gcp-public-data-goes-18',
  G19: 'gcp-public-data-goes-19',
};

function parseArgs(argv) {
  const args = { satellite: 'AUTO', lookbackMinutes: 90, maxFrames: 6, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--satellite' && argv[index + 1]) args.satellite = argv[++index].trim().toUpperCase();
    else if (arg === '--lookback-minutes' && argv[index + 1]) args.lookbackMinutes = Math.max(15, Math.min(240, Number(argv[++index]) || 90));
    else if (arg === '--max-frames' && argv[index + 1]) args.maxFrames = Math.max(1, Math.min(12, Number(argv[++index]) || 6));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run goes:discover -- [--satellite auto|G18|G19] [--lookback-minutes 90] [--max-frames 6] [--json]');
      process.exit(0);
    }
  }
  if (args.satellite !== 'AUTO' && !SATELLITES[args.satellite]) throw new Error('--satellite must be auto, G18, or G19');
  return args;
}

function hourPrefixes(now, lookbackMinutes) {
  const start = new Date(now.getTime() - (lookbackMinutes + 20) * 60_000);
  const prefixes = [];
  for (let cursor = new Date(start); cursor <= now; cursor = new Date(cursor.getTime() + 60 * 60_000)) {
    const year = cursor.getUTCFullYear();
    const yearStart = Date.UTC(year, 0, 1);
    const day = String(Math.floor((cursor.getTime() - yearStart) / 86_400_000) + 1).padStart(3, '0');
    const hour = String(cursor.getUTCHours()).padStart(2, '0');
    prefixes.push(`ABI-L2-CMIPC/${year}/${day}/${hour}/`);
  }
  return [...new Set(prefixes)];
}

function startTimeFromName(name) {
  const match = /_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})\d*/.exec(name);
  if (!match) return null;
  const [, year, day, hour, minute, second] = match;
  const ms = Date.UTC(Number(year), 0, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function channelFromName(name) {
  const match = /-M\dC(0[123])_/.exec(name);
  return match?.[1] ?? null;
}

async function listObjects(bucket, prefix) {
  const url = new URL(`https://storage.googleapis.com/storage/v1/b/${bucket}/o`);
  url.searchParams.set('prefix', prefix);
  url.searchParams.set('maxResults', '1000');
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`GOES listing failed ${response.status} for ${bucket}`);
  const payload = await response.json();
  return Array.isArray(payload?.items) ? payload.items : [];
}

async function discoverSatellite(satellite, bucket, now, lookbackMinutes) {
  const items = (await Promise.all(hourPrefixes(now, lookbackMinutes).map((prefix) => listObjects(bucket, prefix)))).flat();
  const frames = new Map();
  for (const item of items) {
    const name = String(item?.name ?? '');
    const channel = channelFromName(name);
    const iso = startTimeFromName(name);
    if (!channel || !iso) continue;
    const frame = frames.get(iso) ?? { satellite, bucket, iso, channels: {} };
    frame.channels[channel] = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(name)}?alt=media`;
    frames.set(iso, frame);
  }
  return [...frames.values()].filter((frame) => frame.channels['01'] && frame.channels['02'] && frame.channels['03']);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const requested = args.satellite === 'AUTO' ? Object.entries(SATELLITES) : [[args.satellite, SATELLITES[args.satellite]]];
  const discovered = (await Promise.all(requested.map(([satellite, bucket]) => discoverSatellite(satellite, bucket, now, args.lookbackMinutes)))).flat();
  const cutoffMs = now.getTime() - args.lookbackMinutes * 60_000;
  const frames = discovered
    .filter((frame) => Date.parse(frame.iso) >= cutoffMs)
    .sort((a, b) => Date.parse(b.iso) - Date.parse(a.iso))
    .slice(0, args.maxFrames)
    .map((frame, index) => ({ ...frame, index, ageMinutes: Math.max(0, Math.round((now.getTime() - Date.parse(frame.iso)) / 60_000)) }));
  const payload = { ok: true, source: 'NOAA NODD public GOES CMI via Google Cloud', generatedAt: now.toISOString(), frames };
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.table(frames.map((frame) => ({ satellite: frame.satellite, time: frame.iso, ageMinutes: frame.ageMinutes, channels: Object.keys(frame.channels).join(',') })));
  if (!frames.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
