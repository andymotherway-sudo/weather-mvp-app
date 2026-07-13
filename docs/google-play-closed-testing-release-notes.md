# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.207**
Android version code: **10224**
Track: **Closed testing / internal testing candidate**
Date: **July 12, 2026**

## Play Console Paste Notes

Stabilizes Maps after the recent radar work. This build keeps the working mosaic autoplay path intact, removes the ordinary zoom path that was slipping back into station radar, and keeps Storm Scope's zoom-out auto-exit behavior unchanged. Wind Particles stay disabled for now so map performance and radar playback remain the priority.

## Tester Notes

Please focus testing on Maps:

- Verify standard radar mosaic resumes cleanly after turning Storm Scope off.
- Confirm zoom buttons no longer pin the map into a forced station-radar state.
- Confirm zooming far enough out still exits Storm Scope on its own.

## Internal Release Checklist

- App version: `1.1.207`
- Android version code: `10224`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
