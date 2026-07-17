# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.218**
Android version code: **10235**
Track: **Closed testing / internal testing candidate**
Date: **July 17, 2026**

## Play Console Paste Notes

This build targets the remaining post-button pinch conflict directly. The map zoom buttons now use a pure `zoomTo(...)` camera command instead of a broader camera transaction, so tapping `+` or `-` should no longer leave MapLibre in a state that interferes with the next native pinch gesture. The Land and wxLab daily forecast also now keep today aligned with the live current AQI reading so severe smoke is not understated by the daily view.

## Tester Notes

Please focus testing on pinch handoff and today AQI consistency:

- Confirm pinch zoom still works cleanly after using the `+` or `-` buttons first.
- Confirm the map no longer reacts to each finger as separate pan inputs after a button zoom.
- Confirm ordinary one-finger panning still feels normal before and after button zooms.
- Confirm today in wxLab daily forecast reflects the live current AQI when current smoke is worse than the forecast trace.
- Confirm the main AQI card and today's wxLab daily AQI are no longer obviously mismatched during major smoke events.

## Internal Release Checklist

- App version: `1.1.218`
- Android version code: `10235`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
