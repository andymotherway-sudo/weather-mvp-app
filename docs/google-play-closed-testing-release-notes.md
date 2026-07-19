# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.231**
Android version code: **10248**
Track: **Closed testing / internal testing candidate**
Date: **July 19, 2026**

## Play Console Paste Notes

This build moves the radar read path behind the OMNIwx worker and D1-backed manifest storage, keeps radar frame discovery off direct RainViewer lookups, and continues pushing weather traffic through the worker so users hit fewer provider-limit errors.

## Tester Notes

Please focus testing on radar stability and provider-limit protection:

- Confirm radar still loads normally on first open and after app relaunch, without blank frames or provider-limit style errors.
- Confirm radar animation still advances smoothly and recent frames look current.
- Confirm national radar context and local radar views still behave the same visually as before this build.
- Confirm the Land home screen still shows current conditions and forecast details correctly after refreshes and app relaunches.
- Confirm favorite place previews and location search still return sensible results without blank/error states.
- Confirm Astro map / Sky map still renders after panning and zooming and does not regress cloud or visibility overlays.

## Internal Release Checklist

- App version: `1.1.231`
- Android version code: `10248`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
