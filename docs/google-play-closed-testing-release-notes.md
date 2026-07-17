# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.215**
Android version code: **10232**
Track: **Closed testing / internal testing candidate**
Date: **July 17, 2026**

## Play Console Paste Notes

This build folds in the follow-up fixes from live field testing. The map zoom buttons are now truly one-shot camera zoom commands with no delayed region writeback left behind to interfere with the next pinch gesture. On the forecast side, the current AQI path now forces a fresh astro cache generation after the AirNow rollout and uses a wider AirNow reporting-area search so smoke-heavy northern Minnesota locations stop getting stuck on stale model-only values.

## Tester Notes

Please focus testing on maps and current air quality:

- Confirm pinch zoom stays smooth after using the `+` or `-` buttons.
- Confirm repeated zoom-button taps no longer leave the map fighting the next pinch or drag.
- Verify current AQI for northern Minnesota locations refreshes off the stale value path and better tracks active smoke conditions.
- Spot check Bemidji and Brainerd specifically for more realistic current AQI behavior.
- Confirm daily tiles still show `RH` and `DP` correctly in the collapsed state.

## Internal Release Checklist

- App version: `1.1.215`
- Android version code: `10232`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
