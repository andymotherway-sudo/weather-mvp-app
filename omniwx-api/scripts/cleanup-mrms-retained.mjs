#!/usr/bin/env node

const DEFAULT_PRODUCT = "MergedReflectivityQCComposite";
const CONFIRM = "cleanup-mrms-proof-dev";
const API_BASES = {
  dev: "https://omniwx-api.omniwx.workers.dev",
  production: "https://omniwx-api-production.omniwx.workers.dev",
  prod: "https://omniwx-api-production.omniwx.workers.dev",
};

function parseArgs(argv) {
  const args = {
    env: "dev",
    apiBase: null,
    product: DEFAULT_PRODUCT,
    maxDeletes: 1000,
    dryRun: true,
    allowDisabled: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env" && argv[i + 1]) args.env = argv[++i];
    else if (arg === "--api-base" && argv[i + 1]) args.apiBase = argv[++i].replace(/\/+$/g, "");
    else if (arg === "--product" && argv[i + 1]) args.product = argv[++i];
    else if (arg === "--max-deletes" && argv[i + 1]) args.maxDeletes = Math.max(1, Math.floor(Number(argv[++i]) || args.maxDeletes));
    else if (arg === "--apply") args.dryRun = false;
    else if (arg === "--allow-disabled") args.allowDisabled = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!/^[A-Za-z0-9_-]{3,80}$/.test(args.product)) {
    throw new Error(`Invalid product: ${args.product}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run mrms:cleanup-retained -- [options]

Deletes MRMS proof frame prefixes that are not listed in the live latest manifest.
Default is dry-run.

Options:
  --env <dev|production>  Worker environment. Default: dev
  --api-base <url>        Override Worker API base URL
  --product <name>        MRMS product. Default: ${DEFAULT_PRODUCT}
  --max-deletes <n>       Delete safety cap. Default: 1000
  --apply                 Actually delete. Default is dry-run
  --allow-disabled        Exit 0 if maintenance is disabled
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiBase = args.apiBase || API_BASES[args.env] || API_BASES.dev;
  const url = new URL(`${apiBase}/v1/radar/mrms/maintenance/cleanup-retained`);
  url.searchParams.set("product", args.product);
  url.searchParams.set("confirm", CONFIRM);
  url.searchParams.set("maxDeletes", String(args.maxDeletes));
  if (!args.dryRun) url.searchParams.set("dryRun", "0");

  const response = await fetch(url, { method: "POST" });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Keep the raw body in the output below.
  }

  const disabledAllowed = args.allowDisabled && json?.error === "mrms-maintenance-disabled";
  console.log(JSON.stringify({
    ok: disabledAllowed || (response.ok && (json?.ok !== false)),
    status: response.status,
    env: args.env,
    apiBase,
    dryRun: args.dryRun,
    allowedDisabled: disabledAllowed,
    response: json ?? text,
  }, null, 2));

  if (!response.ok || json?.ok === false) {
    if (disabledAllowed) return;
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
