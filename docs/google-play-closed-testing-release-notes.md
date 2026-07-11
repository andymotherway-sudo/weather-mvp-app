# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.200**
Android version code: **10217**
Track: **Closed testing / internal testing candidate**
Date: **July 11, 2026**

## Play Console Paste Notes

Adds a copyable radar diagnostics control for testers so radar playback issues can be captured from Play Store builds. The diagnostics export includes provider mode, frame timestamps, source keys, visible tile hashes, redacted tile URLs, opacities, Storm Scope state, and selected radar product/site context. This build also includes continued radar source stabilization work intended to reduce MapLibre source churn during playback.

## Tester Notes

Please focus testing on Maps:

- Open radar before touching controls. If mosaic is blank or not autoplaying, tap `Diag` and paste the copied JSON into the test report.
- If radar starts only after FF/Rewind, capture diagnostics before and after pressing FF/Rewind.
- If frames flash or jump, tap `Diag` immediately after the bad transition.
- Recheck Storm Scope open/close behavior and product selection.

## Internal Release Checklist

- App version: `1.1.200`
- Android version code: `10217`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
