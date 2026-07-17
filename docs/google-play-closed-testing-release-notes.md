# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.216**
Android version code: **10233**
Track: **Closed testing / internal testing candidate**
Date: **July 17, 2026**

## Play Console Paste Notes

This build keeps chasing the remaining two issues called out in live use. The map wrapper now tightens when it emits a settled region after user interaction so a pinch gesture is less likely to get an early state writeback while it is still in flight. The daily forecast path also stops reusing the current AQI value across every daily tile and instead uses each day’s own AQI enrichment value.

## Tester Notes

Please focus testing on pinch zoom and forecast AQI:

- Confirm a pure two-finger pinch no longer gets a premature camera/state snap while zooming.
- Confirm pinch zoom still works cleanly after using the `+` or `-` buttons first.
- Verify daily AQI values are no longer identical across every day unless the source data really matches.
- Spot check hourly and daily AQI together to make sure the daily rollup now differs by day when hourly values differ.
- Confirm current AQI for smoke-heavy northern Minnesota locations still loads and updates normally.

## Internal Release Checklist

- App version: `1.1.216`
- Android version code: `10233`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
