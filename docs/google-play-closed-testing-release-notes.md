# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.176**
Android version code: **10193**
Track: **Closed testing / internal testing candidate**
Date: **July 4, 2026**

## Play Console Paste Notes

Maps radar playback and Storm Scope reliability update. Animated mosaic tiles now refresh with the visible frame, so the timeline and raster should advance together. Storm Scope now uses explicit on/off state: one tap opens station/NEXRAD tools and rings, the next tap returns to standard animated mosaic without immediately relatching auto-nearest radar.

## Tester Notes

Please focus testing on Maps radar. Let mosaic and NEXRAD loops run, then toggle Storm Scope on/off repeatedly at broad and close zoom.

### What Changed

- Promote refreshed radar playlists only at loop end.
- Preserve visible radar timestamp/index during playlist promotion.
- Reset radar crossfade state when a pending playlist is promoted.
- Key radar tile sources by visible frame/template so mosaic images advance.
- Keep auto-nearest out of Storm Scope station mode when Storm Scope is off.
- Clear station state, rings, and auto-nearest latch on Storm Scope shutoff.

### What To Test

- Toggle Storm Scope on/off repeatedly without closing Maps.
- Enter Maps from any route and confirm Storm Scope does not get stuck active.
- Watch RainViewer and NEXRAD loops for frame-zero jumps during refresh.
- Confirm mosaic imagery changes as the timestamp advances.
- Confirm range rings disappear when Storm Scope turns off.
- Confirm zooming/panning remains user-controlled.

### Known Watch Areas

- Radar providers can still return stale or missing frames; the app should hold the current loop until a clean loop-end swap.
- Storm Scope remains a local NEXRAD workstation toggle, not a forced camera view or map recenter.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.176`
- Android version code: `10193`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
