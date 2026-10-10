# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.259**
Android version code: **10276**
Track: **Closed testing / internal testing candidate**
Date: **October 9, 2026**

## Play Console Paste Notes

Simplifies Space observing information and cloud-layer profiles, clarifies unavailable Almanac records, and keeps satellite frames visible during temporary imagery-catalog failures. Includes recent map-control, location-history, and radar-source diagnostics improvements.

## Tester Notes

Please focus testing on Space, Almanac, and Maps:

- In Space, select different forecast hours and confirm the cloud profile updates without a duplicate selected-hour panel. Compare layer values with hourly data, including missing-data cases.
- Check observing-window text and map controls with large system fonts and in landscape.
- In Almanac, verify unavailable daily records are clearly distinguished from working forecasts and normals; try Retry.
- In Maps, test TrueColor and Infrared loading, playback, and recovery from a temporary connection loss. Confirm retained frames keep their original timestamps.
- Confirm current-location updates do not accumulate saved locations or duplicate map markers.
- Confirm radar labels match the rendered source and RainViewer/IEM fallback works when owned data is unavailable. This release does not enable radar publishing schedules.
- Smoke-test Land, Hourly, and Astro after update/relaunch.

## Internal Release Checklist

- App version: `1.1.259`
- Android version code: `10276`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building.
- Run GitHub Actions -> `Radar health report` against production before upload when available.
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: not required for this app-only release; use the existing production Worker. Radar publishing schedules and storage settings are unchanged.
- Android build: `npm run build:android:prod`

## Release Verification Notes

- Production AAB build passed on Windows, including Kotlin compilation and Android release lint. The signed bundle contains version `1.1.259`, code `10276`, and the production API configuration. App lint and TypeScript checks passed. Play upload and on-device validation are pending.
- October 9 production health probe returned `status=ok`; Expo config resolves to the production API with build `10276`.
- The read-only radar health check passed its configured required-product thresholds at 7:41 PM Arizona time: MRMS was 30 minutes old; required Level III scans were about 207-211 minutes old. Minneapolis and Duluth echo tops were stale (479 and 822 minutes). These are not real-time Level III conditions.
- Timelines reported `worker-r2`, not `worker-r2-pack`; this build does not claim the packed-radar rollout is complete. No publisher, scheduler, or storage settings were changed during this release.
- Satellite stability, cloud values, large-font layouts, and location-history behavior still need on-device internal-testing verification.
