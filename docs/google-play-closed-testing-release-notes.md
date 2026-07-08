# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.188**
Android version code: **10205**
Track: **Closed testing / internal testing candidate**
Date: **July 8, 2026**

## Play Console Paste Notes

Maps reliability polish. Fixes the NWS HeatRisk map layer so it renders official NOAA HeatRisk tiles when enabled, keeps map zoom buttons from recentering to the active/default location, and preserves the existing Storm Scope/radar behavior from the prior build.

## Tester Notes

Please focus testing on Maps HeatRisk, zoom buttons, and normal radar/Storm Scope behavior.

### What Changed

- Wire NWS HeatRisk from the layer sheet to the rendered map overlay.
- Use the official NOAA HeatRisk ImageServer rendering rule.
- Make map zoom buttons zoom only, without recentering to the active location.

### What To Test

- Turn on NWS HeatRisk and confirm the colored risk layer appears.
- Press map zoom buttons after panning and confirm the map does not snap back.
- Confirm RainViewer mosaic and Storm Scope still behave normally.

### Known Watch Areas

- Radar providers can still return stale or missing frames; playback should remain armed until valid frames arrive.
- Echo tops and less common station products depend on upstream support and may be hidden or unavailable.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.188`
- Android version code: `10205`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
