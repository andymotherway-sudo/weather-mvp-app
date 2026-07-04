# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.177**
Android version code: **10194**
Track: **Closed testing / internal testing candidate**
Date: **July 4, 2026**

## Play Console Paste Notes

Maps radar mode separation update. Normal radar now stays on the animated RainViewer mosaic, while Storm Scope is a deliberate close-zoom NEXRAD inspection mode. Zooming out hard-exits Storm Scope so single-site radar disks, range rings, and station controls do not remain over the mosaic. Station product buttons now respond optimistically while scans load.

## Tester Notes

Please focus testing on Maps radar. Test mosaic playback, Storm Scope on/off, zooming out of Storm Scope, and station product switching.

### What Changed

- Separate normal mosaic radar from Storm Scope station radar.
- Disable auto-nearest NEXRAD rendering while the architecture settles.
- Hard-exit Storm Scope below close radar zoom.
- Make Storm Scope on/off handlers explicit and debounced.
- Optimistically update selected station radar product buttons.
- Block station radar from running the normal mosaic animation loop.

### What To Test

- Toggle Storm Scope on/off repeatedly without closing Maps.
- Zoom out of Storm Scope and confirm single-site radar disappears.
- Confirm broad zoom uses mosaic only.
- Confirm station product buttons visibly select immediately.
- Confirm range rings and station controls only show in close Storm Scope.
- Confirm zooming/panning remains user-controlled.

### Known Watch Areas

- Radar providers can still return stale or missing frames; the app should keep normal mosaic and Storm Scope visually separate.
- Storm Scope may zoom in when first opened so station products can render, but zooming out should return to mosaic.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.177`
- Android version code: `10194`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
