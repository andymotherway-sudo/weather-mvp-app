# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.232**
Android version code: **10249**
Track: **Closed testing / internal testing candidate**
Date: **July 19, 2026**

## Play Console Paste Notes

This build establishes a clean radar delivery break at the OMNIwx edge: the worker now owns D1-backed radar timeline storage, R2-backed national radar delivery, and a first owned local ridge slice for Phoenix-area `IWA` tiles, while still using RainViewer and IEM only as upstream ingest sources behind the worker.

## Tester Notes

Please focus testing on radar stability and the new owned-delivery path:

- Confirm radar still loads normally on first open and after app relaunch, without blank frames or provider-limit style errors.
- Confirm radar animation still advances smoothly and recent frames look current.
- Confirm national radar context and local radar views still behave the same visually as before this build.
- Confirm zooming into Phoenix/Mesa radar still looks normal and does not introduce missing local tiles or strange station-switching behavior.
- Confirm the Land home screen still shows current conditions and forecast details correctly after refreshes and app relaunches.
- Confirm favorite place previews and location search still return sensible results without blank/error states.
- Confirm Astro map / Sky map still renders after panning and zooming and does not regress cloud or visibility overlays.

## Internal Release Checklist

- App version: `1.1.232`
- Android version code: `10249`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
