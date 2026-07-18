# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.229**
Android version code: **10246**
Track: **Closed testing / internal testing candidate**
Date: **July 18, 2026**

## Play Console Paste Notes

This build routes more forecast, geocoding, and sky-map weather traffic through the OMNIwx worker to reduce provider-limit failures, adds lightning density back to Maps, and tightens several current-weather fallback paths so saved places and marine/aviation surfaces stay more resilient.

## Tester Notes

Please focus testing on provider-limit protection and the refreshed map/current paths:

- Confirm city search and onboarding location search still return sensible matches without blank/error states.
- Confirm land forecasts, saved-place previews, and saved-place extremes still load after repeated refreshes and do not show daily-limit errors during normal use.
- Confirm aviation and marine fallback weather still populate wind/current conditions when official upstreams are slow.
- Confirm the Sky map still renders after panning/zooming and does not regress cloud or visibility overlays.
- Confirm the new lightning density layer renders on Maps and that unsupported station-radar products now explain why they are unavailable.

## Internal Release Checklist

- App version: `1.1.229`
- Android version code: `10246`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
