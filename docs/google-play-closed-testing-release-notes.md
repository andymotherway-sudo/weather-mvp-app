# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.143**
Android version code: **10160**
Track: **Closed testing / internal testing candidate**
Date: **June 30, 2026**

## Play Console Paste Notes

This build is a code hygiene and maintainability release. It removes shipped debug logging, replaces patch-history comments with durable developer-facing comments, cleans stale note-to-self comments, and keeps the app behavior unchanged while making future map, weather, nautical, space, and Android Auto work easier to maintain.

## Tester Notes

This build should feel the same in normal use. Please regression-test the main surfaces that depend on cleaned fallback paths: Land, Hourly, Almanac records, Maps radar, Nautical, Space Weather, widgets, and Android Auto radar.

### What Changed

- Removed debug console logging from shipped React Native app and Worker source paths.
- Removed an Android Auto radar warning log because the car UI already shows a friendly error state.
- Removed the Nautical wxLab development-only raw JSON dump.
- Rewrote stale patch notes and note-to-self comments into durable comments explaining why key code exists.
- Cleaned broken mojibake in a Nautical official forecast loading message.
- Preserved existing user-facing behavior and release-critical map, aviation, nautical, and radar changes already in the working tree.

### What To Test

- Open Land and Hourly and confirm forecast cards still load normally.
- Open Almanac and confirm record building/cached records still progress normally.
- Open Maps and confirm radar, Storm Scope, zoom controls, and recording controls still behave as expected.
- Open Nautical and confirm sea state, tides, wxLab rows, and official forecast unsupported states still render cleanly.
- Open Space and confirm SWPC/DONKI fallback content still loads when available.
- Try Android Auto radar and confirm failures show friendly UI instead of crashing.

### Known Watch Areas

- This is intentionally a maintainability pass, so any UI or data behavior changes should be treated as regressions.
- Provider outages should still fail gracefully without developer-only logs appearing in the shipped app.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.143`
- Android version code: `10160`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
