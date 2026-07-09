# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.191**
Android version code: **10208**
Track: **Closed testing / internal testing candidate**
Date: **July 9, 2026**

## Play Console Paste Notes

Radar playback and Storm Scope product cleanup. Radar now auto-arms playback when frames are ready, Storm Scope no longer routes Echo Tops through unsupported local imagery, and unavailable station products should report honestly instead of showing the wrong raster.

## Tester Notes

Please focus testing on Maps radar playback, Storm Scope product switching, and Echo Tops availability messaging.

### What Changed

- Fixed radar autoplay getting stuck until fast-forward was tapped.
- Prevented unsupported local WMS rendering for Echo Tops and base velocity.
- Echo Tops now uses real IEM `EET`/`NET` scans when available, otherwise it reports unavailable.
- Missing station-product frames no longer fall back to fake placeholder frames.

### What To Test

- Open Maps and confirm radar starts moving without pressing fast-forward.
- Turn on Storm Scope, select Echo Tops, and confirm it either renders actual Echo Tops or says no recent scans.
- Switch between reflectivity, velocity, and Echo Tops without seeing a mismatched product.

### Known Watch Areas

- Echo Tops are not available from every radar at every time.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile.

## Internal Release Checklist

- App version: `1.1.191`
- Android version code: `10208`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
