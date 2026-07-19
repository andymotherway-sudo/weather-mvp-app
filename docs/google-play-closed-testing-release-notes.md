# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.230**
Android version code: **10247**
Track: **Closed testing / internal testing candidate**
Date: **July 19, 2026**

## Play Console Paste Notes

This build moves Solar summary traffic fully behind the worker, adds a worker-backed favorites preview bundle and a bundled Land home summary path, and keeps pushing forecast/current traffic away from direct provider fan-out so users hit fewer limit-related errors.

## Tester Notes

Please focus testing on provider-limit protection and the new bundled home paths:

- Confirm city search and onboarding location search still return sensible matches without blank/error states.
- Confirm the Land home screen still shows current conditions, forecast details, and air-quality-enriched values correctly after refreshes and app relaunches.
- Confirm favorite place previews in the location picker still show the right icon/condition/high/low without blank rows.
- Confirm aviation and marine fallback weather still populate wind/current conditions when official upstreams are slow.
- Confirm the Sky map still renders after panning/zooming and does not regress cloud or visibility overlays.
- Confirm Solar still loads space-weather cards normally and no longer falls back into direct summary fetches.

## Internal Release Checklist

- App version: `1.1.230`
- Android version code: `10247`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
