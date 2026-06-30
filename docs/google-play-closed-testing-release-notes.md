# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.141**
Android version code: **10158**
Track: **Closed testing / internal testing candidate**
Date: **June 29, 2026**

## Play Console Paste Notes

Maps radar behavior is restored: Weather mode now uses the national radar mosaic again, Storm Scope no longer forces the map to the nearest NEXRAD site, and zoomed-in NEXRAD enhancement remains limited to normal Weather mode.

## Tester Notes

This build is a focused Maps radar restoration pass.

### What Changed

- Restored Weather mode to the IEM national radar mosaic path.
- Storm Scope is now treated as a layer preset/workflow, not as forced nearest-site radar.
- Storm Scope no longer centers the camera on the nearest radar station.
- Automatic nearest-NEXRAD enhancement is preserved for normal Weather mode when zoomed in.
- Kept manual station radar behavior available only when explicitly selected.

### What To Test

- Open Maps in Weather mode and confirm national radar is visible before entering Storm Scope.
- Zoom in while still in Weather mode and confirm local NEXRAD enhancement appears when available.
- Enter Storm Scope and confirm the camera does not jump to the nearest radar station.
- Pan/zoom in Storm Scope and confirm the map stays where the user moved it.
- Confirm manual station radar still works when deliberately selected.

### Known Watch Areas

- The location button is still intentionally allowed to recenter the map.
- Manual station radar and feature focus actions may still intentionally move the camera.
- If national radar is missing, include the active mode, zoom level, and whether Weather or Storm Scope was active.

## Internal Release Checklist

- App version: `1.1.141`
- Android version code: `10158`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
