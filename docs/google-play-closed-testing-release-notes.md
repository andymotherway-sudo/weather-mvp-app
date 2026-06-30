# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.142**
Android version code: **10159**
Track: **Closed testing / internal testing candidate**
Date: **June 30, 2026**

## Play Console Paste Notes

Maps radar controls are restored and the radar workflow is easier to reason about: Weather mode starts with the animated national radar mosaic, zooming in can automatically reveal nearest NEXRAD detail, and Storm Scope can select radar products without forcing the camera to a radar site.

## Tester Notes

This build is a focused Maps radar product and animation restoration pass.

### What Changed

- Restored the animated national radar mosaic for the broad Weather and Storm Scope views.
- Restored radar product controls so testers can choose NEXRAD products again.
- Added a National Radar option in Storm Scope to return from single-site products to the animated mosaic.
- Preserved automatic nearest-NEXRAD enhancement when zooming in from national radar.
- Storm Scope radar product selection no longer forces the map camera to a radar site.
- Clarified the radar panel labels so national mosaic, nearest NEXRAD, and manual product states read differently.

### What To Test

- Open Maps in Weather mode and confirm national radar animates.
- Zoom in while in Weather mode and confirm nearest NEXRAD detail appears when available.
- Confirm the radar product panel appears after zoomed-in NEXRAD is active.
- Enter Storm Scope and confirm it starts with the animated national radar mosaic.
- In Storm Scope, choose a single-site radar product and confirm the map does not jump.
- In Storm Scope, choose National Radar and confirm the animated mosaic returns.

### Known Watch Areas

- The location button is still intentionally allowed to recenter the map.
- Manual station radar, explicit location recenter, and feature focus actions may still intentionally move the camera.
- If radar is missing or not animating, include the active mode, zoom level, radar product, and whether Weather or Storm Scope was active.

## Internal Release Checklist

- App version: `1.1.142`
- Android version code: `10159`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
