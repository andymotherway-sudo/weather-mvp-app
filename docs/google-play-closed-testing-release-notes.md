# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.186**
Android version code: **10203**
Track: **Closed testing / internal testing candidate**
Date: **July 7, 2026**

## Play Console Paste Notes

Maps control polish. Restores camera-only zoom buttons that only zoom the current map view, with no forced recentering or radar-mode changes. Restores the old-school red record-dot control beside the playback buttons for radar, satellite, and animated map loops. Keeps the latest radar mosaic playback path unchanged from the previous build.

## Tester Notes

Please focus testing on Maps radar, Storm Scope, and broad mosaic playback.

### What Changed

- Restore map zoom in/out buttons as camera-only controls.
- Move map recording back into the playback row as a red record-dot button.
- Preserve the existing radar mosaic playback behavior from the previous build.

### What To Test

- Tap zoom in/out and confirm the map zooms without snapping to a location.
- Confirm the red record button opens the MP4 export workflow.
- Confirm RainViewer mosaic and Storm Scope behavior match the previous build.

### Known Watch Areas

- Radar providers can still return stale or missing frames; playback should remain armed until valid frames arrive.
- Echo tops and less common station products depend on upstream support and may be hidden or unavailable.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.186`
- Android version code: `10203`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
