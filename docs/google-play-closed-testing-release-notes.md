# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.170**
Android version code: **10187**
Track: **Closed testing / internal testing candidate**
Date: **July 4, 2026**

## Play Console Paste Notes

Radar smoothness update for Maps. Broad zoom stays on the RainViewer mosaic, close zoom latches into local NEXRAD, and Storm Scope remains an explicit chaser/workstation toggle. Radar source IDs now change by mode so stale NEXRAD and mosaic layers do not linger together. Radar playback keeps last good frames during provider refreshes to reduce flashing and first-frame jumps.

## Tester Notes

Please focus testing on Maps radar. Broad zoom should show RainViewer mosaic, close zoom should transition into local NEXRAD, and Storm Scope should toggle on/off without forcing the camera or stacking mosaic and NEXRAD.

### What Changed

- Add zoom hysteresis so automatic NEXRAD handoff does not flicker around the threshold.
- Give radar raster sources mode-specific IDs so old provider tiles are removed cleanly.
- Preserve last good RainViewer/IEM frames on transient refresh failures.
- Keep Storm Scope playback state consistent with the timeline.

### What To Test

- Open Maps at national scale and confirm the RainViewer mosaic appears and animates.
- Zoom close and confirm nearest NEXRAD appears without a blank or stale mosaic layer.
- Zoom back out and confirm the RainViewer mosaic returns without local NEXRAD lingering.
- Toggle Storm Scope repeatedly and confirm it remains a tool, not a forced camera lock.

### Known Watch Areas

- Radar providers can still return stale or missing frames; the app should hold the last good frame rather than flashing blank.
- Storm Scope remains a local NEXRAD workstation toggle, not a forced camera view or map recenter.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.170`
- Android version code: `10187`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
