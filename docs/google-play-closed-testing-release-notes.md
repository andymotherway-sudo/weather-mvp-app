# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.173**
Android version code: **10190**
Track: **Closed testing / internal testing candidate**
Date: **July 4, 2026**

## Play Console Paste Notes

Maps radar reliability update. Storm Scope now normalizes through the standard Weather radar view so its button can turn the chaser/workstation mode on and off consistently. Radar playlist refreshes now preserve the current loop position when provider frames update, reducing RainViewer and NEXRAD jumps back to the first frame.

## Tester Notes

Please focus testing on Maps radar. Toggle Storm Scope repeatedly at broad and close zoom, then confirm normal broad-zoom RainViewer mosaic and close-zoom NEXRAD handoff still work without camera forcing.

### What Changed

- Route legacy Storm Scope view state back through the standard Weather radar view.
- Add a reducer-level Storm Scope toggle so repeated presses use current map state.
- Preserve radar loop position when provider playlists refresh.
- Keep Storm Scope playback enabled without recentering the map.

### What To Test

- Toggle Storm Scope on/off repeatedly without closing Maps.
- Enter Maps from any route and confirm Storm Scope does not get stuck active.
- Watch RainViewer and NEXRAD loops for frame-zero jumps during refresh.
- Confirm zooming/panning remains user-controlled.

### Known Watch Areas

- Radar providers can still return stale or missing frames; the app should preserve the current loop instead of snapping backward.
- Storm Scope remains a local NEXRAD workstation toggle, not a forced camera view or map recenter.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.173`
- Android version code: `10190`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
