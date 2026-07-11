# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.198**
Android version code: **10215**
Track: **Closed testing / internal testing candidate**
Date: **July 10, 2026**

## Play Console Paste Notes

Adds Weather Channel-style tropical cyclone cones, tracks, forecast points, wind fields, and tap details for active storms. The tropics layer now uses NHC/CPHC outlooks plus a global active cyclone feed so western Pacific systems such as Bavi can appear with useful storm context. Also includes the latest radar playback refinement work.

## Tester Notes

Please focus testing on Maps:

- Enable Tropical Cyclone Cones and confirm active storms show cone/track/wind-field geometry.
- Tap cone, track, point, or wind-field features and confirm the storm detail card opens.
- Confirm NHC Development Outlook remains available as the broad 2/7-day development layer.
- Recheck radar autoplay, play/pause, and Storm Scope open/close behavior.

## Internal Release Checklist

- App version: `1.1.198`
- Android version code: `10215`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
