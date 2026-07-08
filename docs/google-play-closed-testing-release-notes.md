# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.187**
Android version code: **10204**
Track: **Closed testing / internal testing candidate**
Date: **July 8, 2026**

## Play Console Paste Notes

Radar, wxLab, and settings polish. Improves radar frame blending to reduce flashing between frames, keeps Storm Scope station products isolated from normal mosaic playback, restores UV fallback handling, moves the Land wxLab daily graph above Sun/Moon detail, removes the duplicate wxLab hourly graph, and adds a wxLearn topic in Settings explaining forecast model choices.

## Tester Notes

Please focus testing on Maps radar, Storm Scope products, Land wxLab, UV values, and the Settings forecast model selector.

### What Changed

- Reduce visible radar flashing between frames.
- Keep Storm Scope station products from falling back to mosaic tiles.
- Add UV fallback handling for Open-Meteo field variants.
- Move Land wxLab daily graph above Sun/Moon detail.
- Remove the duplicate wxLab hourly graph from Land.
- Add wxLearn guidance for forecast model choices in Settings.

### What To Test

- Confirm RainViewer mosaic and Storm Scope still animate cleanly.
- Confirm Storm Scope products do not show mosaic fallback tiles.
- Confirm UV index appears when upstream fields are available.
- Confirm Settings > Forecast Model opens the new wxLearn explanation.

### Known Watch Areas

- Radar providers can still return stale or missing frames; playback should remain armed until valid frames arrive.
- Echo tops and less common station products depend on upstream support and may be hidden or unavailable.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.187`
- Android version code: `10204`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
