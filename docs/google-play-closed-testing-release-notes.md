# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.184**
Android version code: **10201**
Track: **Closed testing / internal testing candidate**
Date: **July 7, 2026**

## Play Console Paste Notes

Maps radar polish. Storm Scope can activate at a wider zoom range, close-range Storm Scope products avoid unsupported mosaic tiles behind NEXRAD, and mosaic raster frames now update with the playback timeline. This build keeps user-controlled panning/zooming and remains signed with the reset Google Play upload key.

## Tester Notes

Please focus testing on Maps radar, Storm Scope, and broad mosaic playback.

### What Changed

- Let Storm Scope station radar activate sooner.
- Suppress unsupported mosaic/zoom tiles behind close-range Storm Scope NEXRAD.
- Make mosaic frame changes propagate to MapLibre raster sources during playback.
- Keep zoom/pan behavior user-controlled.

### What To Test

- Confirm the RainViewer mosaic animates while the timeline advances.
- Confirm Storm Scope activates before extreme close zoom.
- Confirm Storm Scope no longer shows giant unsupported zoom tiles behind NEXRAD.
- Toggle Storm Scope on/off repeatedly without closing Maps.
- Confirm zooming/panning remains user-controlled.

### Known Watch Areas

- Radar providers can still return stale or missing frames; the app should keep normal mosaic and Storm Scope visually separate.
- Echo tops and less common station products depend on upstream support and may be hidden or unavailable instead of showing bad provider tiles.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.184`
- Android version code: `10201`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
