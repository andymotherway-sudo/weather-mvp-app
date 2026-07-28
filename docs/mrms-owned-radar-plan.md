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

Wrangler 4.105.0 supports R2 object get/put/delete here, but not object listing. Because retention requires listing, the Worker owns the cleanup path.

Dev-only cleanup route:

```text
POST /v1/radar/mrms/maintenance/cleanup-proof?product=MergedReflectivityQCComposite&keepFrames=12&dryRun=1&confirm=cleanup-mrms-proof-dev
```

Guardrails:

- `MRMS_MAINTENANCE_ENABLED=1` only in dev.
- `MRMS_MAINTENANCE_ENABLED=0` in production.
- POST is required.
- `confirm=cleanup-mrms-proof-dev` is required.
- `dryRun` defaults on; use `dryRun=0` only after inspecting candidates.
- `keepFrames` is clamped from 1 to 24.
- `maxDeletes` is clamped from 1 to 1000 per request.

This is the storage safety valve before increasing MRMS publish cadence or zoom depth. It prevents a proof prefix from becoming an accidental archive.

## Current MRMS backend contract

The dev contract now looks like this:

1. Local job downloads the latest NOAA MRMS GRIB2 frame.
2. Local renderer creates only non-empty transparent XYZ PNG tiles.
3. Publisher uploads the bounded frame prefix to dev R2.
4. Publisher writes `radar/mrms/latest/<product>.json`.
5. Worker reads the latest pointer through `/v1/radar/mrms/timeline`.
6. Worker serves tiles through `/v1/radar/mrms/tiles/{z}/{x}/{y}.png`.

The app should not point at this by default yet. The next app-side step is a dev-only MRMS preview source that can be visually compared against RainViewer without degrading the shipped radar experience.
