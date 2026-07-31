# MRMS owned radar plan

This is the new phase 1 owned radar path for OMNIwx. The goal is to replace the broad national radar mosaic first, while keeping local Storm Scope/NEXRAD products on the existing external fallback path until a real station renderer exists.

## Starting source

Use NOAA MRMS 2D products from:

- `https://mrms.ncep.noaa.gov/2D/ReflectivityAtLowestAltitude/`
- `https://mrms.ncep.noaa.gov/2D/MergedReflectivityQCComposite/`

Initial product choice:

- `ReflectivityAtLowestAltitude` for the first proof of life because compressed frames are small and frequent.
- `MergedReflectivityQCComposite` as the likely beautiful national composite radar candidate once rendering is proven.

## Phase 1 definition

Done means:

- Discover current MRMS frames repeatably.
- Download one latest `.grib2.gz` frame locally without writing to R2.
- Decode GRIB2 into a georeferenced raster.
- Render one transparent PNG proof image.
- Produce a small Web Mercator tile set for one frame.
- Publish only a bounded rolling test prefix to R2 after local rendering is proven.
- Expose a worker timeline/tiles route that prefers MRMS only when a valid manifest exists.
- Keep RainViewer/IEM fallback active until MRMS visual quality and retention are proven.

## Storage guardrails

- No MRMS archive.
- Start with one product and one latest frame locally.
- Do not write MRMS to R2 until local render output is inspected.
- First R2 publish target should be a separate prefix such as `radar/mrms/reflectivity-lowest/`.
- Retention starts at 2 hours and only moves to 5 hours after object count and byte size are measured.

## First command

```powershell
cd C:\Users\andym_au640pp\weather-app\omniwx-api
npm run mrms:discover -- --product ReflectivityAtLowestAltitude --max-frames 12
```

This discovery command is read-only. It does not download GRIB2 payloads, render images, or write to R2.

## Local download checkpoint

```powershell
cd C:\Users\andym_au640pp\weather-app\omniwx-api
npm run mrms:download -- --product ReflectivityAtLowestAltitude
```

This downloads only the latest compressed GRIB2 frame into `tmp/mrms`. It still does not write to R2. Rendering requires GDAL/wgrib2 or an equivalent containerized job runner; the current WSL environment does not have those tools installed yet.

## Local render checkpoint

For the current Codex desktop environment, install Python dependencies into ignored local storage:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m pip install --target tmp\mrms-pydeps cfgrib eccodes xarray numpy matplotlib pillow
```

Then render a first transparent PNG proof:

```powershell
cd C:\Users\andym_au640pp\weather-app\omniwx-api
npm run mrms:render-proof
```

The proof renderer reads `tmp/mrms/MRMS_ReflectivityAtLowestAltitude.latest.grib2.gz` and writes `tmp/mrms/MRMS_ReflectivityAtLowestAltitude.proof.png`. It is intentionally downsampled and local-only.

Current proof status:

- `ReflectivityAtLowestAltitude` discovery works.
- `MergedReflectivityQCComposite` discovery works.
- The first `ReflectivityAtLowestAltitude` latest-frame download was about 656 KB.
- The local renderer decoded a 7000 x 3500 MRMS raster and wrote a 1400 x 700 transparent PNG proof.
- The proof renderer is not yet a tile generator and does not write to R2.
- The first local XYZ tile proof generated 12 non-empty zoom 3-4 composite tiles totaling about 31 KB.
- A z5-only composite proof generated 23 non-empty tiles totaling about 66 KB.
- A z6-only composite proof generated 59 non-empty tiles totaling about 172 KB.
- Based on measured local proof output, z3-z6 is roughly 270 KB per frame for this sparse-weather sample.

Next renderer checkpoint:

- Publish only the z3-z4 proof prefix to dev R2 first.
- Add a Worker MRMS test route that can serve dev/prod tiles only when a manifest exists.
- Keep app radar unchanged until the MRMS route renders correctly in isolation.

## Current storage read

The proof tile sizes are tiny at low zooms because empty/no-echo tiles are skipped. This is exactly the cost posture we want for early MRMS: publish only non-empty transparent PNG tiles and keep a rolling retention window. The next storage decision should be made from measured tile output, not theoretical full-grid math.

Initial R2 test prefix:

- `radar/mrms/proof/MergedReflectivityQCComposite/<valid-time>/`

Initial publish scope:

- dev R2 only
- z3-z4 only
- one frame only
- no app cutover

Dry-run the tiny publish plan:

```powershell
cd C:\Users\andym_au640pp\weather-app\omniwx-api
npm run mrms:publish-proof
```

Apply only after the dry run shows the expected small z3-z4 manifest:

```powershell
npm run mrms:publish-proof -- --apply
```

Current dev publish status:

- Uploaded 12 z3-z4 composite proof tiles plus one manifest to dev R2.
- Prefix: `radar/mrms/proof/MergedReflectivityQCComposite/20260727T131600/`
- Stable latest pointer: `radar/mrms/latest/MergedReflectivityQCComposite.json`
- Total tile bytes: about 31 KB.
- Dev Worker can serve this proof through:
- Manifest: `/v1/radar/mrms/proof/manifest?product=MergedReflectivityQCComposite&frame=20260727T131600`
- Tile: `/v1/radar/mrms/proof/tiles/{z}/{x}/{y}.png?product=MergedReflectivityQCComposite&frame=20260727T131600`
- Stable timeline: `/v1/radar/mrms/timeline?product=MergedReflectivityQCComposite`
- Stable tile: `/v1/radar/mrms/tiles/{z}/{x}/{y}.png?product=MergedReflectivityQCComposite`
- Production keeps `MRMS_PROOF_ENABLED=0`, so this is not user-facing.
- Production keeps `MRMS_ENABLED=0`, so stable MRMS is not user-facing either.

Validated proof tile:

- `/v1/radar/mrms/proof/tiles/4/4/6.png?product=MergedReflectivityQCComposite&frame=20260727T131600`
- Response header included `x-omni-radar-source: r2-mrms-proof`.
- Downloaded Worker-served tile size: 5389 bytes.

Validated stable dev tile:

- `/v1/radar/mrms/tiles/4/4/6.png?product=MergedReflectivityQCComposite`
- Response header includes `x-omni-radar-source: r2-mrms`.
- Downloaded Worker-served tile size: 5389 bytes.

## MRMS retention brake

The retention brake now runs directly against R2 through Cloudflare's S3-compatible API when credentials are present. This avoids Wrangler object-listing limits and avoids depending on a production Worker maintenance route.

Direct cleanup command:

```powershell
cd C:\Users\andym_au640pp\weather-app\omniwx-api
npm run mrms:cleanup-retained -- --env production --product MergedReflectivityQCComposite --uploader s3
```

Apply only after the dry run shows expected stale prefixes:

```powershell
npm run mrms:cleanup-retained -- --env production --product MergedReflectivityQCComposite --uploader s3 --max-deletes 1000 --apply
```

Guardrails:

- Cleanup is dry-run by default.
- Cleanup is scoped to `radar/mrms/proof/<product>/`.
- The latest Worker timeline is treated as the source of truth for retained frame prefixes.
- Objects are deleted only when their frame prefix is not listed in the latest retained playlist.
- `--max-deletes` is a hard safety cap.
- If R2 S3 credentials are missing and `--uploader auto` is used, the script falls back to the older Worker maintenance route.

This is the storage safety valve before increasing MRMS publish cadence or zoom depth. It prevents a proof prefix from becoming an accidental archive.

## One-command dev update

After the local Python MRMS dependencies are installed, the dev update flow can be run as one bounded command:

```powershell
cd C:\Users\andym_au640pp\weather-app\omniwx-api
npm run mrms:update-latest
```

By default this downloads the latest composite frame, generates z3-z4 non-empty tiles, and dry-runs the dev R2 publish. To actually write the bounded frame prefix and latest pointer to dev R2, run the same command through WSL with `--apply`:

```powershell
wsl bash -lc 'cd /mnt/c/Users/andym_au640pp/weather-app/omniwx-api && npm run mrms:update-latest -- --apply'
```

Safety defaults:

- Product: `MergedReflectivityQCComposite`
- Zoom range: z3-z4
- Publish cap: 20 tiles
- R2 writes: disabled unless `--apply` is passed

## Current MRMS backend contract

The dev contract now looks like this:

1. Local job downloads the latest NOAA MRMS GRIB2 frame.
2. Local renderer creates only non-empty transparent XYZ PNG tiles.
3. Publisher uploads the bounded frame prefix to dev R2.
4. Publisher writes `radar/mrms/latest/<product>.json`.
5. Worker reads the latest pointer through `/v1/radar/mrms/timeline`.
6. Worker serves tiles through `/v1/radar/mrms/tiles/{z}/{x}/{y}.png`.

The app should not point at this by default yet. The next app-side step is a dev-only MRMS preview source that can be visually compared against RainViewer without degrading the shipped radar experience.

## App preview gate

The app preview is intentionally not a production cutover.

Preview rules:

- `EXPO_PUBLIC_MRMS_RADAR_PREVIEW=1` enables the MRMS preview toggle.
- The app reads the build-time flag from Expo config so production/internal-testing builds can intentionally opt in.
- EAS `development` and `preview` profiles opt in.
- EAS `production` currently opts in with `EXPO_PUBLIC_MRMS_RADAR_PREVIEW=1` for the small internal testing group.
- Station radar and Storm Scope local products continue to use the existing IEM/RIDGE path.
- Normal wide radar remains RainViewer unless the preview toggle is manually enabled.

The preview toggle is meant for visual comparison only. It should not be treated as DONE for default production radar until MRMS has a rolling multi-frame timeline, more zoom depth, retention cleanup exercised with real repeated publishes, and a visual QA pass against RainViewer.

## Rolling MRMS latest playlist

The stable latest pointer is now backward-compatible with the one-frame preview and forward-compatible with rolling playback:

- Top-level fields such as `frame`, `validTime`, `tileBasePrefix`, `tiles`, and `maxZoom` still describe the latest frame.
- `frames[]` contains the retained MRMS frame playlist.
- Retained frames are freshness-gated, so old proof frames do not create multi-day radar jumps.
- `/v1/radar/mrms/tiles/{z}/{x}/{y}.png?product=...` still serves the latest frame.
- `/v1/radar/mrms/tiles/{z}/{x}/{y}.png?product=...&frame=<frame>` serves a specific retained frame.
- `npm run mrms:update-latest -- --apply --retain-frames 12 --max-frame-age-minutes 360` publishes a bounded rolling manifest. Retention cleanup should still be run after repeated publishes so old frame prefixes do not become an archive.
- `POST /v1/radar/mrms/maintenance/cleanup-retained?product=...&confirm=cleanup-mrms-proof-dev&dryRun=0` deletes MRMS proof frame prefixes that are not listed in the live latest manifest.

Verified on 2026-07-30:

- Dev and production Workers support explicit retained-frame tile reads.
- Dev latest manifest retained `20260730T141000` plus the previous dev frame.
- Production latest manifest retained `20260730T141000` plus the previous production frame.
- The `20260730T141000` frame produced 11 non-empty z3-z4 tiles totaling about 35 KB before manifests.
- Legacy RainViewer-backed overview image publishing remained disabled while MRMS was updated.
- Retained-frame cleanup deleted stale dev/prod proof frame prefixes and left only `20260730T141000` active in each bucket.
- A second fresh frame, `20260730T200800`, was published to dev and production. Both latest manifests now expose a two-frame retained playlist: `20260730T200800` and `20260730T141000`.
- Dev retained cleanup dry-run reported 23 matched MRMS proof objects and zero delete candidates after the second frame publish.
- z5 was measured and promoted for `20260730T200800`: 32 non-empty z3-z5 tiles totaling about 129 KB before manifests. Dev/prod latest manifests now advertise `maxZoom=5` for that latest frame.
- App preview bug fixed in `1.1.240`: MRMS tile templates now preserve literal `{z}/{x}/{y}` placeholders for MapLibre instead of URL-encoding them, so the native map can request real owned MRMS tiles.
- App preview timing/quality bug fixed in `1.1.241`: MRMS timestamps without an explicit zone are normalized as UTC before display, and lower-maxZoom retained frames are filtered out when higher-quality frames exist.
- Pipeline hardening added after `1.1.241`: `npm run mrms:cycle -- --env production --max-z 5 --max-tiles 80 --min-retained-max-z 5` runs the bounded download/render/publish path, while `publish-mrms-proof` now normalizes manifest timestamps to UTC ISO and can rewrite only the stable latest pointer with `--latest-only`.
- Production latest manifest was repaired to retain only same-quality z5 frames. Live production now advertises `20260731T000200` and `20260730T200800`, both with `maxZoom=5`, preventing the earlier blurry z4 retained frame from being shown.
- Direct R2 S3-compatible upload path added: `publish-mrms-proof` and `mrms:cycle` support `--uploader auto|s3|wrangler`. `auto` uses S3-compatible R2 uploads when `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` are present; otherwise it falls back to Wrangler.
- R2 S3 upload uses the AWS SDK pointed at Cloudflare R2. It does not require an AWS account. Keep real credentials in `.env` or scheduler secrets only.
- Direct R2 S3-compatible cleanup path added: `mrms:cleanup-retained` supports `--uploader auto|s3|worker`, and `mrms:cycle -- --uploader s3` now uses direct S3 cleanup after publish.
- Production S3 publish was verified with `20260731T004000`: 36 z3-z5 non-empty tiles, 125 KB of tile bytes, and the live tile route returned `x-omni-radar-source: r2-mrms`.
- Production S3 cleanup removed stale frame `20260730T141000`: 11 objects, 34 KB. A follow-up dry run reported zero stale objects.

Useful commands:

```powershell
npm run mrms:update-latest -- --retain-frames 12 --python C:\Users\andym_au640pp\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
```

```powershell
npm run mrms:cycle -- --env production --max-z 5 --max-tiles 80 --min-retained-max-z 5 --uploader s3 --apply
```

```bash
node ./scripts/publish-mrms-proof.mjs --manifest /mnt/c/Users/andym_au640pp/weather-app/tmp/mrms/tiles/MergedReflectivityQCComposite-z3z4/manifest.json --bucket omniwx-radar-assets-prod --prefix radar/mrms/proof/MergedReflectivityQCComposite --max-tiles 20 --retain-frames 12 --apply
```

```bash
npm run mrms:cleanup-retained -- --env dev
npm run mrms:cleanup-retained -- --env dev --apply
npm run mrms:cleanup-retained -- --env production --uploader s3
npm run mrms:cleanup-retained -- --env production --uploader s3 --apply
```

## GitHub Actions job runner

The first repeatable production job runner is `.github/workflows/mrms-radar-cycle.yml`. It is manual-run only right now so we do not accidentally consume recurring GitHub Actions minutes or R2 operations before the first hosted run is proven.

Required GitHub repository secrets:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Optional GitHub repository secret:

- `R2_ENDPOINT`

Manual dry-run path:

1. Open GitHub Actions.
2. Select `MRMS radar cycle`.
3. Run workflow with `target_env=production`, `apply=false`, `max_zoom=5`, `retain_frames=12`.
4. Confirm the job downloads NOAA MRMS, renders z3-z5 tiles, reports `uploader: "s3"`, and reaches cleanup dry-run with no unexpected stale prefixes.

Manual apply path after dry-run succeeds:

1. Run the same workflow with `apply=true`.
2. Verify `/v1/radar/mrms/timeline?product=MergedReflectivityQCComposite` shows a new latest frame.
3. Verify a known tile returns `x-omni-radar-source: r2-mrms`.
4. Check R2 storage after a few runs; storage should grow only within the retained rolling window.

Schedule is intentionally not enabled yet. After one hosted dry-run and one hosted apply succeed, add a conservative cron such as every 10 minutes while we stay at z3-z5 and 12 retained frames.
