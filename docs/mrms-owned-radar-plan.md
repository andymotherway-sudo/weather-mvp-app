# MRMS owned radar plan

This is the new phase 1 owned radar path for OMNIwx. The goal is to replace the broad national radar mosaic first, while keeping local Storm Scope/NEXRAD products on the existing external fallback path until a real station renderer exists.

MRMS and local NEXRAD are related but separate workstreams:

- MRMS is the owned US national mosaic/backbone.
- NOAA NEXRAD Level III is the first owned local station-product candidate.
- Level II is a later option for deeper raw radar/dual-pol work after Level III proves the user experience and cost model.

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
- A z3-z7 nearest-neighbor composite proof generated 280 non-empty tiles totaling about 883 KB.
- A z3-z7 bilinear composite proof generated 274 non-empty tiles totaling about 821 KB.
- A z3-z10 bilinear composite proof generated 5,223 non-empty tiles totaling about 9.5 MB for a sparse-weather frame.

Current renderer checkpoint:

- Publish z3-z10 only with a hard tile cap.
- Keep bilinear sampling as the default for cleaner zoomed-in tiles.
- Keep MRMS-auto as the US beta default only while RainViewer fallback remains warm and reliable.
- Rebuild history with same-quality z10 frames before widening MRMS beyond the beta posture.
- Production MRMS preview now serves tiles through the Worker (`worker-r2`) rather than exposing public R2 tile templates to the app.
- MRMS history can be populated with a bounded backfill run instead of waiting for many separate single-frame publishes.
- The app now gives Storm Scope explicit `Auto`, `Mosaic`, and `Local` source controls so the owned MRMS mosaic path and local NEXRAD fallback path are not hidden behind zoom heuristics.
- MRMS playback uses a dedicated smoother animation profile in the app: longer blends, shorter dwell, and temporal tailing. This improves visual continuity, but true RainViewer-grade motion still depends on publishing enough fresh MRMS frames at a consistent cadence.

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

## MRMS history backfill

The normal MRMS cycle still publishes one latest frame by default. To build a short loop quickly, run the GitHub Action `MRMS radar cycle` with:

- `target_env=production`
- `apply=true`
- `min_zoom=3`
- `max_zoom=10`
- `retain_frames=12`
- `backfill_frames=3` or `6`
- `max_frame_age_minutes=360`

Backfill discovers recent timestamped NOAA MRMS frames, publishes them oldest-to-newest, and then runs retained-frame cleanup once. This keeps the latest manifest pointed at the freshest frame while building a usable playlist.

Guardrails:

- `backfill_frames` defaults to `1`.
- The workflow only offers `1`, `2`, or `3` frames for z10 safety.
- The publish cap remains `12000` tiles per frame.
- Cleanup still treats the live latest manifest as the source of truth for retained prefixes.
- Use `3` for release validation. A 6-frame z10 backfill exceeded the 60-minute job limit on August 12, 2026, so longer loops should be built through repeated smaller runs or a future faster job runner.

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

The app can now request `auto` for wide radar in the US beta footprint. In auto mode, the controller fetches MRMS and RainViewer together, displays owned MRMS when the MRMS timeline is healthy, and silently falls back to RainViewer while MRMS is warming, stale, missing, or outside the US beta footprint.

## App preview gate

The app preview is intentionally not a production cutover.

Preview rules:

- `EXPO_PUBLIC_MRMS_RADAR_PREVIEW=1` enables the MRMS preview toggle.
- The app reads the build-time flag from Expo config so production/internal-testing builds can intentionally opt in.
- EAS `development` and `preview` profiles opt in.
- EAS `production` currently opts in with `EXPO_PUBLIC_MRMS_RADAR_PREVIEW=1` for the small internal testing group.
- Station radar and Storm Scope local products continue to use the existing IEM/RIDGE path.
- Normal wide radar defaults to `MRMS auto` for the internal-testing US beta footprint. RainViewer remains the fallback path and can still be manually selected from the radar legend toggle.

The preview/auto toggle is still a beta safety valve. It should not be treated as DONE for broad commercial radar until MRMS has a rolling multi-frame timeline, retention cleanup exercised with real repeated publishes, visual QA against RainViewer, and clear operational runbooks.

## Local NEXRAD Level III discovery

The first owned local radar step is read-only discovery against NOAA/Unidata Level III objects. This avoids writing anything to R2 until we know which products have real recent data for a station.

```powershell
cd C:\Users\andym_au640pp\weather-app\omniwx-api
npm run level3:discover -- --site IWA --products N0B,N0S,N0Q,N0U,EET,NET --days 1
```

For a multi-site inventory:

```powershell
cd C:\Users\andym_au640pp\weather-app\omniwx-api
npm run level3:inventory -- --sites IWA,MPX,DLH,TLX,CAE --products N0B,N0S,EET --days 1
```

For a local-only raw frame download:

```powershell
cd C:\Users\andym_au640pp\weather-app\omniwx-api
npm run level3:download -- --site IWA --product N0B --days 1
```

For a local-only transparent PNG render proof:

```powershell
cd C:\Users\andym_au640pp\weather-app\omniwx-api
npm run level3:render-proof -- --input ../tmp/nexrad-level3/IWA_N0B_2026_08_13_04_08_27 --output ../tmp/nexrad-level3/IWA_N0B.proof.png --metadata-output ../tmp/nexrad-level3/IWA_N0B.proof.json
```

For a local-only XYZ tile proof:

```powershell
cd C:\Users\andym_au640pp\weather-app\omniwx-api
npm run level3:tile-proof -- --input ../tmp/nexrad-level3/IWA_N0B_2026_08_13_04_08_27 --output-dir ../tmp/nexrad-level3/tiles/IWA/N0B/20260813T040827 --min-z 6 --max-z 7
```

Important findings from the first Phoenix/Minnesota check:

- The public Level III bucket uses `IWA` keys, not `KIWA`.
- `N0B` reflectivity, `N0S` storm-relative velocity, and `EET` echo tops had recent frames for `IWA`, `MPX`, and `DLH`.
- `N0Q`, `N0U`, `N0Z`, and `NET` were not present for the first checked Phoenix/Minnesota sample.
- A sampled 5-site pilot inventory (`IWA`, `MPX`, `DLH`, `TLX`, `CAE`) showed recent `N0B`, `N0S`, and `EET` frames for all five sites.
- A sampled 8-site app-catalog inventory showed recent `N0B` and `EET` frames for all eight sampled NEXRAD sites.
- The app should default local reflectivity to products with measured availability instead of forcing unavailable product codes.

Next Level III step:

- Download one current Level III `N0B` frame locally. Done for `IWA`.
- Identify the file format/decoder path. Done with MetPy `Level3File`.
- Render a transparent proof PNG locally. Done for `IWA N0B` and `MPX EET`.
- Render a transparent local XYZ tile proof. Done for z6-z7 `IWA N0B` and `MPX EET`.
- Only after visual QA, define a small station/product pilot and a separate bounded R2 prefix.

Current local-only Level III proof status:

- `IWA N0B` raw frame downloaded at about 243 KB.
- `IWA N0B` render decoded 720 radials x 1840 gates, max range 460 km, and produced a transparent 1024 px proof image.
- `IWA N0B` z6-z7 local tile proof produced 10 non-empty tiles totaling about 50 KB.
- `MPX EET` raw frame downloaded at about 8.7 KB.
- `MPX EET` render decoded 360 radials x 346 gates, max range 345 km, and produced a transparent 1024 px proof image.
- `MPX EET` z6-z7 local tile proof produced 9 non-empty tiles totaling about 20 KB.
- All files are written under ignored `tmp/nexrad-level3`; nothing is published to R2 by these commands.
- The current renderer is nearest-neighbor and proof-grade. Production quality still needs smoothing, tile seam QA, product-specific legends, retention/publish code, and app fallback wiring.

## Rolling MRMS latest playlist

The stable latest pointer is now backward-compatible with the one-frame preview and forward-compatible with rolling playback:

- Top-level fields such as `frame`, `validTime`, `tileBasePrefix`, `tiles`, and `maxZoom` still describe the latest frame.
- `frames[]` contains the retained MRMS frame playlist.
- Retained frames are freshness-gated, so old proof frames do not create multi-day radar jumps.
- The stored R2 latest manifest can still include `tiles`, but the Worker app-facing timeline response is slimmed and does not send the full per-tile inventory.
- If `MRMS_PUBLIC_TILE_BASE_URL` is configured, each timeline frame includes a direct public R2 `tileTemplate`; otherwise the app falls back to the Worker tile route.
- `/v1/radar/mrms/tiles/{z}/{x}/{y}.png?product=...` still serves the latest frame.
- `/v1/radar/mrms/tiles/{z}/{x}/{y}.png?product=...&frame=<frame>` serves a specific retained frame.
- The mobile app currently uses the Worker MRMS tile route even when public R2 templates are present. MRMS is sparse and only stores non-empty tiles; the Worker returns a cacheable transparent PNG for empty tile coordinates so MapLibre does not treat clear-air tiles as noisy 404s.
- `npm run mrms:update-latest -- --apply --retain-frames 12 --max-frame-age-minutes 360` publishes a bounded rolling manifest. Retention cleanup should still be run after repeated publishes so old frame prefixes do not become an archive.
- `POST /v1/radar/mrms/maintenance/cleanup-retained?product=...&confirm=cleanup-mrms-proof-dev&dryRun=0` deletes MRMS proof frame prefixes that are not listed in the live latest manifest.

Current verified capability:

- Dev and production Workers support explicit retained-frame tile reads.
- MRMS tile templates preserve literal `{z}/{x}/{y}` placeholders for MapLibre.
- MRMS timestamps are normalized as UTC before display.
- Retained history filters out lower-quality frames when higher-maxZoom frames are available.
- Direct R2 S3-compatible upload and cleanup are available through `--uploader auto|s3|wrangler`.
- R2 S3 upload uses the AWS SDK pointed at Cloudflare R2; it does not require an AWS account.
- Keep real credentials in `.env` or scheduler secrets only.
- Applied MRMS cycle and maintenance workflows write a bounded storage trend to `radar/mrms/status/<product>/storage-history.json`.
- Current z3-z10 bilinear output has measured around 5,200 non-empty sparse-weather tiles and roughly 10-18 MB per frame depending on weather coverage and metadata overhead.
- Legacy RainViewer-backed overview image publishing remains disabled while MRMS is the owned national path.

Useful commands:

```powershell
npm run mrms:cycle -- --env production --max-z 10 --max-tiles 12000 --min-retained-max-z 10 --sampling bilinear --uploader s3 --apply
```

```bash
npm run mrms:cleanup-retained -- --env dev
npm run mrms:cleanup-retained -- --env dev --apply
npm run mrms:cleanup-retained -- --env production --uploader s3
npm run mrms:cleanup-retained -- --env production --uploader s3 --apply
```

## GitHub Actions job runner

The first repeatable production job runner is `.github/workflows/mrms-radar-cycle.yml`. It is manual-run only while we are holding Cloudflare cost at zero.

Cost-control guardrails:

- The job uses the S3-compatible R2 uploader, not per-object Wrangler uploads.
- It keeps the retained playlist bounded by frame count and age.
- It filters retained history to the requested maximum zoom so older blurry frames do not reappear.
- `publish-mrms-proof` skips R2 writes when NOAA's latest frame is already published at the requested zoom and tile count.
- The job cancels overlapping runs so slow renders do not stack up.
- The public timeline smoke test only runs after apply writes and verifies `tileDelivery=worker-r2` plus a fresh frame valid time.
- Applied runs report retained R2 object count, retained bytes, stale object count, and stale bytes to the GitHub Actions summary.
- Applied runs fail if the MRMS product prefix exceeds 5 GB or if retained cleanup leaves stale objects.
- Dry-runs log an explicit warning because they do not update the live app timeline.

Required GitHub repository secrets:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Optional GitHub repository secret:

- `R2_ENDPOINT`

Manual dry-run path:

1. Open GitHub Actions.
2. Select `MRMS radar cycle`.
3. Run workflow with `target_env=production`, `apply=false`, `min_zoom=3`, `max_zoom=10`, `retain_frames=12`, `max_frame_age_minutes=360`.
4. Confirm the job downloads NOAA MRMS, renders z3-z10 tiles, reports `uploader: "s3"`, and reaches cleanup dry-run with no unexpected stale prefixes.

Manual apply path after dry-run succeeds:

1. Run the same workflow with `apply=true`.
2. Verify `/v1/radar/mrms/timeline?product=MergedReflectivityQCComposite` shows a new latest frame and `tileDelivery=worker-r2`.
3. Verify a known Worker-served tile returns `image/png` from `/v1/radar/mrms/tiles/{z}/{x}/{y}.png`.
4. Check R2 storage after a few runs; storage should grow only within the retained rolling window.

Future scheduled path:

- Do not enable high-cadence z10 scheduling while cost must remain zero.
- A rough zero-cost-safe starter cadence is a few manual or scheduled applies per day, then measure R2 Class A operations and cleanup deletes before increasing.
- A polished production cadence such as every 10-30 minutes at z10 is a paid-growth step because each fresh frame writes thousands of tile objects.
- Use GitHub Actions -> `MRMS radar maintenance` after canceled publish runs or anytime storage posture needs checking without rendering new frames.
