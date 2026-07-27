import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    format: "json",
    includeNowcast: false,
    maxFrames: 24,
    scope: "national-mosaic",
    product: "precipitation",
    siteId: null,
    source: "rainviewer",
    hostOverride: null,
    output: null,
    apply: false,
    dbName: null,
    wranglerEnv: null,
    remote: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const [flag, inlineValue] = token.split("=", 2);
    const nextValue = inlineValue ?? argv[index + 1];
    const consumeNext = inlineValue == null;

    switch (flag) {
      case "--format":
        if (nextValue === "json" || nextValue === "sql") options.format = nextValue;
        if (consumeNext) index += 1;
        break;
      case "--include-nowcast":
        options.includeNowcast = true;
        break;
      case "--max-frames": {
        const parsed = Number(nextValue);
        if (Number.isFinite(parsed)) {
          options.maxFrames = Math.max(1, Math.min(96, Math.trunc(parsed)));
        }
        if (consumeNext) index += 1;
        break;
      }
      case "--scope":
        if (nextValue === "national-mosaic" || nextValue === "single-site") options.scope = nextValue;
        if (consumeNext) index += 1;
        break;
      case "--product":
        options.product = String(nextValue || options.product).trim() || options.product;
        if (consumeNext) index += 1;
        break;
      case "--site-id":
        options.siteId = String(nextValue || "").trim() || null;
        if (consumeNext) index += 1;
        break;
      case "--source":
        options.source = String(nextValue || options.source).trim() || options.source;
        if (consumeNext) index += 1;
        break;
      case "--host":
        options.hostOverride = String(nextValue || "").trim() || null;
        if (consumeNext) index += 1;
        break;
      case "--output":
        options.output = String(nextValue || "").trim() || null;
        if (consumeNext) index += 1;
        break;
      case "--apply":
        options.apply = true;
        break;
      case "--db":
        options.dbName = String(nextValue || "").trim() || null;
        if (consumeNext) index += 1;
        break;
      case "--env":
        options.wranglerEnv = String(nextValue || "").trim() || null;
        if (consumeNext) index += 1;
        break;
      case "--remote":
        options.remote = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function sqlValue(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSql(manifest, options = {}) {
  const useTransaction = options.useTransaction !== false;
  const lines = [];
  if (useTransaction) lines.push("BEGIN TRANSACTION;");

  lines.push(
    `DELETE FROM radar_frames WHERE manifest_id = ${sqlValue(manifest.id)};`,
    `DELETE FROM radar_manifests WHERE id = ${sqlValue(manifest.id)};`,
    "",
    [
      "INSERT INTO radar_manifests (",
      "  id, scope, product, site_id, source, status, generated_at, valid_from, valid_to, frame_count, metadata_json, created_at, updated_at",
      ") VALUES (",
      `  ${sqlValue(manifest.id)}, ${sqlValue(manifest.scope)}, ${sqlValue(manifest.product)}, ${sqlValue(manifest.siteId)},`,
      `  ${sqlValue(manifest.source)}, ${sqlValue(manifest.status)}, ${sqlValue(manifest.generatedAt)}, ${sqlValue(manifest.validFrom)},`,
      `  ${sqlValue(manifest.validTo)}, ${sqlValue(manifest.frames.length)}, ${sqlValue(JSON.stringify(manifest.metadata))},`,
      `  ${sqlValue(manifest.createdAt)}, ${sqlValue(manifest.updatedAt)}`,
      ");",
    ].join("\n"),
  );

  for (const frame of manifest.frames) {
    lines.push(
      [
        "INSERT INTO radar_frames (",
        "  id, manifest_id, frame_time, frame_iso, path, tile_url, kind, sort_order, metadata_json, created_at, updated_at",
        ") VALUES (",
        `  ${sqlValue(frame.id)}, ${sqlValue(manifest.id)}, ${sqlValue(frame.frameTime)}, ${sqlValue(frame.frameIso)},`,
        `  ${sqlValue(frame.path)}, ${sqlValue(frame.tileUrl)}, ${sqlValue(frame.kind)}, ${sqlValue(frame.sortOrder)},`,
        `  ${sqlValue(JSON.stringify(frame.metadata))}, ${sqlValue(manifest.createdAt)}, ${sqlValue(manifest.updatedAt)}`,
        ");",
      ].join("\n"),
    );
  }

  if (useTransaction) lines.push("", "COMMIT;");
  return `${lines.join("\n")}\n`;
}

async function writeOutput(outputPath, contents) {
  if (!outputPath) {
    process.stdout.write(contents);
    return;
  }

  const resolved = path.resolve(process.cwd(), outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, contents, "utf8");
  process.stdout.write(`${resolved}\n`);
}

async function executeSqlWithWrangler({ dbName, wranglerEnv, remote, sql }) {
  const tempDir = path.resolve(process.cwd(), "tmp");
  const tempFile = path.join(tempDir, `radar-manifest-${Date.now()}.sql`);
  await mkdir(tempDir, { recursive: true });
  await writeFile(tempFile, sql, "utf8");

  const args = ["wrangler", "d1", "execute", dbName, `--file=${tempFile}`];
  if (wranglerEnv) args.push("--env", wranglerEnv);
  if (remote) args.push("--remote");

  await new Promise((resolve, reject) => {
    const child = spawn("npx", args, {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`wrangler d1 execute failed with exit code ${code ?? 1}`));
    });
    child.on("error", reject);
  });

  process.stdout.write(`${tempFile}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const response = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
    headers: {
      "User-Agent": "omniwx-radar-manifest-builder/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`RainViewer timeline request failed with ${response.status}`);
  }

  const timeline = await response.json();
  const host = typeof timeline?.host === "string" && timeline.host.trim() ? timeline.host.trim() : null;
  const past = Array.isArray(timeline?.radar?.past) ? timeline.radar.past : [];
  const nowcast = options.includeNowcast && Array.isArray(timeline?.radar?.nowcast) ? timeline.radar.nowcast : [];
  const frames = [...past, ...nowcast]
    .filter((frame) => typeof frame?.time === "number" && typeof frame?.path === "string" && frame.path.length > 0)
    .sort((a, b) => Number(a.time) - Number(b.time))
    .slice(-options.maxFrames)
    .map((frame, index) => {
      const timestamp = Number(frame.time);
      const iso = new Date(timestamp * 1000).toISOString();
      const normalizedPath = String(frame.path);
      return {
        id: `${options.source}-${timestamp}-${index}`,
        frameTime: timestamp,
        frameIso: iso,
        path: normalizedPath,
        tileUrl: host ? `${options.hostOverride ?? host}${normalizedPath}` : null,
        kind: index < past.length ? "past" : "nowcast",
        sortOrder: index,
        metadata: {
          host: options.hostOverride ?? host,
          originalPath: normalizedPath,
        },
      };
    });

  if (!frames.length) {
    throw new Error("RainViewer returned no usable radar frames");
  }

  const generatedAt = new Date().toISOString();
  const manifest = {
    id: `radar-manifest-${options.scope}-${options.product}-${randomUUID()}`,
    scope: options.scope,
    product: options.product,
    siteId: options.scope === "single-site" ? options.siteId : null,
    source: options.source,
    status: "ready",
    generatedAt,
    validFrom: frames[0].frameIso,
    validTo: frames[frames.length - 1].frameIso,
    frameCount: frames.length,
    metadata: {
      host: options.hostOverride ?? host,
      includeNowcast: options.includeNowcast,
      generatedBy: "scripts/build-radar-manifest.mjs",
    },
    createdAt: generatedAt,
    updatedAt: generatedAt,
    frames,
  };

  const sql = buildSql(manifest);
  if (options.apply) {
    if (!options.dbName) {
      throw new Error("--db is required when using --apply");
    }
    await executeSqlWithWrangler({
      dbName: options.dbName,
      wranglerEnv: options.wranglerEnv,
      remote: options.remote,
      sql: buildSql(manifest, { useTransaction: false }),
    });
    return;
  }

  const contents = options.format === "sql" ? sql : `${JSON.stringify(manifest, null, 2)}\n`;
  await writeOutput(options.output, contents);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
