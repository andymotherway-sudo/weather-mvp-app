# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.185**
Android version code: **10202**
Track: **Closed testing / internal testing candidate**
Date: **July 7, 2026**

## Play Console Paste Notes

Maps radar playback polish. The broad RainViewer mosaic now stays armed while frames load, starts playback from the first frame when Maps opens, and no longer waits for optional buffered imagery before advancing. Storm Scope behavior is unchanged from the prior working build.

## Tester Notes

Please focus testing on Maps radar, Storm Scope, and broad mosaic playback.

### What Changed

- Keep mosaic playback active while provider frames load.
- Start Maps radar playback from the first frame.
- Let buffered radar frames warm in the background without freezing the visible mosaic.

### What To Test

- Confirm the RainViewer mosaic visibly animates as the timestamp advances.
- Open Maps fresh and confirm radar begins playing from the first frame.
- Confirm Storm Scope still toggles cleanly.

### Known Watch Areas

- Radar providers can still return stale or missing frames; playback should remain armed until valid frames arrive.
- Echo tops and less common station products depend on upstream support and may be hidden or unavailable.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.185`
- Android version code: `10202`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
