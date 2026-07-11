# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.201**
Android version code: **10218**
Track: **Closed testing / internal testing candidate**
Date: **July 11, 2026**

## Play Console Paste Notes

Improves radar playback diagnostics and frame synchronization. Radar diagnostics now show whether the active timeline frame, dominant rendered radar tile, and MapLibre source key agree, making tester reports much more actionable. This build also removes a delayed preload state that could let the scrubber/timestamp advance while an older radar raster remained visually dominant.

## Tester Notes

Please focus testing on Maps:

- Open radar before touching controls. It should autoplay and show mosaic data.
- If mosaic is blank or starts only after FF/Rewind, tap `Diag` before pressing anything else.
- If frames flash, jump, or show the wrong timestamp, tap `Diag` immediately after the bad transition.
- In copied diagnostics, check `activeFrameMatchesDominantTemplate` and `sourceKeyUsesActiveFrame`.
- Recheck Storm Scope open/close behavior and product selection.

## Internal Release Checklist

- App version: `1.1.201`
- Android version code: `10218`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`