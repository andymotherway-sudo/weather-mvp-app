#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { open, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const MAGIC = "OMNIWX_TILE_PACK_V1\n";

function parseArgs(argv) {
  const args = {
    manifest: "",
    output: "",
    latestOut: "",
    tilePackKey: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest" && argv[i + 1]) args.manifest = argv[++i];
    else if (arg === "--output" && argv[i + 1]) args.output = argv[++i];
    else if (arg === "--latest-out" && argv[i + 1]) args.latestOut = argv[++i];
    else if (arg === "--tile-pack-key" && argv[i + 1]) args.tilePackKey = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!args.manifest) throw new Error("--manifest is required");
  return args;
}

function printHelp() {
  console.log(`Usage: node ./scripts/build-radar-tile-pack.mjs -- --manifest <path> [options]

Builds a local packed tile artifact from an existing radar tile manifest.
This never writes to R2. The pack format stores all non-empty PNG tiles in
one object plus an index that the Worker can use for range reads.

Options:
  --manifest <path>    Local tile manifest.json
  --output <path>      Output .owxpack path. Default: beside manifest
  --latest-out <path>  Optional latest-style manifest output path
  --tile-pack-key <key> Future R2 key for this pack in generated manifest
`);
}

function normalizeUtcIso(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function frameKey(manifest) {
  const source = manifest.validTime || manifest.productTime || manifest.time || manifest.input || "frame";
  return String(source).replace(/[^0-9A-Za-z]+/g, "").slice(0, 32) || "frame";
}

function tileId(tile) {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

async function pipeFileToHandle(handle, path, position) {
  const source = createReadStream(path);
  let cursor = position;
  for await (const chunk of source) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    await handle.write(buffer, 0, buffer.length, cursor);
    cursor += buffer.length;
  }
  return cursor;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(args.manifest);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const tiles = Array.isArray(manifest.tiles) ? manifest.tiles : [];
  if (!tiles.length) throw new Error("Manifest has no tiles to pack");

  const outputPath = resolve(args.output || join(dirname(manifestPath), `${frameKey(manifest)}.owxpack`));
  const handle = await open(outputPath, "w");
  const index = {};
  let cursor = Buffer.byteLength(MAGIC);
  await handle.write(MAGIC, 0, "utf8");

  for (const tile of tiles) {
    const path = String(tile.path || "");
    if (!path) throw new Error(`Tile ${tileId(tile)} is missing path`);
    const absolutePath = resolve(path);
    const size = (await stat(absolutePath)).size;
    index[tileId(tile)] = {
      offset: cursor,
      length: size,
      contentType: "image/png",
    };
    cursor = await pipeFileToHandle(handle, absolutePath, cursor);
  }

  await handle.close();

  const packBytes = (await stat(outputPath)).size;
  const packManifest = {
    ...manifest,
    packFormat: "omniwx-tile-pack-v1",
    tilePackLocalPath: outputPath,
    tilePackKey: args.tilePackKey || null,
    packedAt: new Date().toISOString(),
    packBytes,
    tileIndex: index,
    tiles: tiles.map((tile) => ({
      z: tile.z,
      x: tile.x,
      y: tile.y,
      bytes: tile.bytes,
    })),
  };

  const latestOut = args.latestOut ? resolve(args.latestOut) : null;
  if (latestOut) {
    const frame = frameKey(manifest);
    const currentFrame = {
      frame,
      site: manifest.site ?? null,
      product: manifest.product,
      productName: manifest.productName ?? null,
      validTime: normalizeUtcIso(manifest.validTime),
      productTime: normalizeUtcIso(manifest.productTime),
      time: normalizeUtcIso(manifest.time),
      generatedAt: new Date().toISOString(),
      tileBasePrefix: null,
      tilePackKey: args.tilePackKey || null,
      tilePackLocalPath: outputPath,
      packFormat: "omniwx-tile-pack-v1",
      tileIndex: index,
      tileSize: manifest.tileSize,
      minZoom: manifest.minZoom,
      maxZoom: manifest.maxZoom,
      bounds: manifest.bounds,
      lat: manifest.lat,
      lon: manifest.lon,
      maxRangeKm: manifest.maxRangeKm,
      tileCount: tiles.length,
      totalBytes: manifest.totalBytes,
      packBytes,
      byZoom: manifest.byZoom,
      rendererCleanup: manifest.rendererCleanup ?? null,
      tiles: packManifest.tiles,
    };
    const latestManifest = {
      ok: true,
      source: manifest.source || (manifest.site ? "NOAA NEXRAD Level III" : "NOAA MRMS"),
      product: manifest.product,
      site: manifest.site ?? undefined,
      frame,
      validTime: currentFrame.validTime,
      productTime: currentFrame.productTime,
      time: currentFrame.time,
      generatedAt: currentFrame.generatedAt,
      tileBasePrefix: null,
      tilePackKey: args.tilePackKey || null,
      tilePackLocalPath: outputPath,
      packFormat: "omniwx-tile-pack-v1",
      tileIndex: index,
      tileSize: currentFrame.tileSize,
      minZoom: currentFrame.minZoom,
      maxZoom: currentFrame.maxZoom,
      bounds: currentFrame.bounds,
      lat: currentFrame.lat,
      lon: currentFrame.lon,
      maxRangeKm: currentFrame.maxRangeKm,
      tileCount: currentFrame.tileCount,
      totalBytes: currentFrame.totalBytes,
      packBytes,
      byZoom: currentFrame.byZoom,
      rendererCleanup: currentFrame.rendererCleanup,
      frameCount: 1,
      frames: [currentFrame],
    };
    await writeFile(latestOut, JSON.stringify(latestManifest, null, 2), "utf8");
  }

  console.log(JSON.stringify({
    ok: true,
    manifest: manifestPath,
    output: outputPath,
    latestOut,
    tileCount: tiles.length,
    packBytes,
    writeObjectsIfPublished: latestOut ? 2 : 1,
    oldTileObjectCount: tiles.length + 2,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
