# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.193**
Android version code: **10210**
Track: **Closed testing / internal testing candidate**
Date: **July 9, 2026**

## Play Console Paste Notes

Radar playback polish. This build improves radar startup and frame transitions by keeping the radar loop armed as frames arrive, preserving stable MapLibre source identity during playback, and warming the next radar frame with a tiny nonzero opacity so native tiles actually download before crossfade. Please test Maps radar by opening the radar view and confirming the mosaic appears and animates without needing fast-forward or rewind.

## Tester Notes

Please focus testing on broad radar mosaic startup, playback smoothness, and Storm Scope product switching.

### What Changed

- Improved radar frame preloading so the first visible loop should not stay blank.
- Reduced large flashes between radar frames.
- Kept animated tiled radar source identity stable across frame changes.
- Preserved Storm Scope product-integrity behavior from the prior build.

### What To Test

- Open Maps and confirm radar appears without pressing fast-forward or rewind.
- Let the radar loop run through several frames and watch for blank flashes.
- Turn Storm Scope on/off and switch station products.

## Internal Release Checklist

- App version: `1.1.193`
- Android version code: `10210`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
