# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.190**
Android version code: **10207**
Track: **Closed testing / internal testing candidate**
Date: **July 9, 2026**

## Play Console Paste Notes

Space Weather and map polish. Solar wind now falls back to NOAA RTSW feeds when older SWPC tables fail, restoring Solar Wx panels. Map layers now include visual previews, page header glows are calmer, and the Settings logo alignment is cleaner.

## Tester Notes

Please focus testing on the Solar Wx section, live solar imagery, Earth disk imagery, map layer sheet previews, and Settings/logo alignment.

### What Changed

- Added NOAA RTSW fallback data for solar wind plasma and magnetic field.
- Updated the Cloudflare Worker space-weather cache version and deployed the worker.
- Added compact visual previews to map layer rows.
- Reduced overly strong page-header glow circles on Land and Hourly.
- Cleaned up Settings logo sizing and centering.

### What To Test

- Open Space and confirm Solar Wx loads without the plasma 404 error.
- Confirm Solar Disk, Earth disk, and Mars archive panels still render.
- Open Maps > Layers and confirm layer previews are readable and not distracting.
- Open Settings and confirm the logo is centered and not clipped.

### Known Watch Areas

- NOAA/SWPC and NASA image feeds may still be temporarily stale or unavailable upstream.
- The worker is deployed, but app installs may still show cached data briefly.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.190`
- Android version code: `10207`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
