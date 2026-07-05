# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.180**
Android version code: **10197**
Track: **Closed testing / internal testing candidate**
Date: **July 4, 2026**

## Play Console Paste Notes

Maps radar stability update. Broad radar uses the animated RainViewer mosaic, close zoom can hand off to local NEXRAD, and Storm Scope remains a deliberate on/off radar workstation. This build keeps tiled radar sources stable during playback to reduce flashing and prevents unsupported single-site products from showing giant provider warnings over the map.

## Tester Notes

Please focus testing on Maps radar. Test mosaic playback, zooming between broad and local radar, Storm Scope on/off, and station product switching.

### What Changed

- Stabilize MapLibre radar sources during animated playback.
- Keep broad radar on the RainViewer mosaic.
- Restore close-zoom automatic nearest NEXRAD behavior.
- Keep Storm Scope as a true on/off workstation control.
- Hide unsupported station products instead of rendering provider warning tiles.

### What To Test

- Confirm the mosaic visibly advances without jumping to frame 0.
- Toggle Storm Scope on/off repeatedly without closing Maps.
- Confirm broad zoom uses the RainViewer mosaic.
- Zoom close and confirm local NEXRAD/range rings can appear.
- Confirm unsupported station products do not show "Zoom Not Supported" tiles.
- Confirm zooming/panning remains user-controlled.

### Known Watch Areas

- Radar providers can still return stale or missing frames; the app should keep normal mosaic and Storm Scope visually separate.
- Storm Scope does not force the map camera; close-zoom station products depend on the user's current zoom.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.180`
- Android version code: `10197`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
