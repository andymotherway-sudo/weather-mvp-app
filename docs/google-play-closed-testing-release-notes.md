# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.214**
Android version code: **10231**
Track: **Closed testing / internal testing candidate**
Date: **July 17, 2026**

## Play Console Paste Notes

This build shifts the focus away from maps and tightens two forecast details that were easy to spot in normal use. Current air quality can now prefer AirNow observations when the worker has a configured AirNow key, which should better reflect active U.S. smoke and pollution events than the prior model-only snapshot path. The compact daily forecast tiles also now show relative humidity and dew point before expansion, so high-moisture and muggy setups are easier to scan at a glance.

## Tester Notes

Please focus testing on forecast and air-quality behavior:

- Verify the current AQI card better reflects active U.S. air-quality events in smoke-heavy areas.
- Confirm AQI still loads cleanly when AirNow is unavailable and falls back gracefully.
- Confirm the compact daily tiles show both `RH` and `DP` without needing expansion.
- Confirm expanded daily details still match the compact tile values for humidity and dew point.
- Spot check a few different cities to make sure daily tile layout still holds on shorter and longer condition labels.

## Internal Release Checklist

- App version: `1.1.214`
- Android version code: `10231`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
