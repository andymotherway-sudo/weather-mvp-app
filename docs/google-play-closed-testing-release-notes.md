# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.174**
Android version code: **10191**
Track: **Closed testing / internal testing candidate**
Date: **July 4, 2026**

## Play Console Paste Notes

Maps radar reliability update. Storm Scope now has one source of truth and writes an explicit on/off state, so the button should toggle the chaser/workstation mode reliably. RainViewer mosaic playback now holds the last good frame through refresh gaps instead of flashing blank or snapping back while new frames arrive.

## Tester Notes

Please focus testing on Maps radar. Toggle Storm Scope repeatedly at broad and close zoom, then confirm broad-zoom RainViewer mosaic and close-zoom NEXRAD handoff still work without camera forcing.

### What Changed

- Make Storm Scope read from `radarTime.stormMode` only.
- Replace reducer toggling with explicit Storm Scope on/off writes.
- Preserve RainViewer mosaic tile holds during transient refresh gaps.
- Keep Storm Scope playback enabled without recentering the map.

### What To Test

- Toggle Storm Scope on/off repeatedly without closing Maps.
- Enter Maps from any route and confirm Storm Scope does not get stuck active.
- Watch RainViewer and NEXRAD loops for frame-zero jumps during refresh.
- Confirm zooming/panning remains user-controlled.

### Known Watch Areas

- Radar providers can still return stale or missing frames; the app should hold the current loop instead of snapping backward.
- Storm Scope remains a local NEXRAD workstation toggle, not a forced camera view or map recenter.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.174`
- Android version code: `10191`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
