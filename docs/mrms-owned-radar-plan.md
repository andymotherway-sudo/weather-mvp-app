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

Next renderer checkpoint:

- Render the composite product and compare visual quality against lowest-altitude reflectivity.
- Convert the georeferenced raster into Web Mercator tiles.
- Publish only a tiny test prefix to R2 after the tile output is visually inspected.
