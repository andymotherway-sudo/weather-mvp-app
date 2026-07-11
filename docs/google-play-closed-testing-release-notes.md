# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.202**
Android version code: **10219**
Track: **Closed testing / internal testing candidate**
Date: **July 11, 2026**

## Play Console Paste Notes

Improves synchronized weather-map playback. Radar remains the master timeline when active, and satellite/weather imagery now aligns to the radar frame timestamp so radar, infrared, true color, water vapor, and cloud overlays can animate together instead of drifting apart. This build also keeps catalog-backed satellite layers tied to their own frame IDs while compositing against the shared map timeline.

## Tester Notes

Please focus testing on Maps:

- Open radar before touching controls. It should autoplay and show mosaic data.
- If mosaic is blank or starts only after FF/Rewind, tap `Diag` before pressing anything else.
- If frames flash, jump, or show the wrong timestamp, tap `Diag` immediately after the bad transition.
- In copied diagnostics, check `activeFrameMatchesDominantTemplate` and `sourceKeyUsesActiveFrame`.
- Recheck Storm Scope open/close behavior and product selection.
- Enable radar plus infrared/true color/cloud layers and confirm the overlays advance on the same timeline.

## Internal Release Checklist

- App version: `1.1.202`
- Android version code: `10219`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
