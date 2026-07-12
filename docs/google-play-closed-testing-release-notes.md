# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.206**
Android version code: **10223**
Track: **Closed testing / internal testing candidate**
Date: **July 12, 2026**

## Play Console Paste Notes

Improves Maps overlay polish. Wind Particles now render denser, smoother streamlines while staying capped for performance, with warmed paths so enabling the layer feels immediate without running hidden animation work while off. The overlay selector also has refreshed visual thumbnails for radar, satellite, wildfire, fronts, marine, water stations, alerts, and wind particles so testers can understand each layer before enabling it.

## Tester Notes

Please focus testing on Maps:

- Turn Wind Particles on and off; panning and zooming should remain responsive.
- Confirm overlay thumbnails match the layers they describe.
- Verify radar and satellite layer behavior is unchanged.

## Internal Release Checklist

- App version: `1.1.206`
- Android version code: `10223`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
