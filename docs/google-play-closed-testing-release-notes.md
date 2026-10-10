# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.261**
Android version code: **10278**
Track: **Closed testing / internal testing candidate**
Date: **October 10, 2026**

## Play Console Paste Notes

Simplifies Space observing information and cloud-layer profiles, clarifies unavailable Almanac records, and keeps satellite imagery visible during temporary imagery-catalog failures. Includes map-control, location-history, and radar-source diagnostics improvements, plus fail-closed protection for radar publishing schedules.

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

- App version: `1.1.261`
- Android version code: `10278`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building.
- Run GitHub Actions -> `Radar health report` against production before upload when available.
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production Worker deploy: not required for this release; the production Worker already contains the satellite fallback changes. Radar publisher and watchdog schedules remain disabled and fail closed.
- Android build: `npm run build:android:prod`

## Release Verification Notes

- The production AAB build passed on Windows, including Android release lint. The signed bundle contains version `1.1.261`, code `10278`, and the production API configuration. SHA-256: `DA729E3322B55C9168654C8E7EF1D776FD71A43822DF18FB8E43C86BBD7DE73E`. Play upload and on-device validation remain pending.
- October 10 production health and backend-control checks passed. Expo config resolves to the production API with build `10278`.
- The read-only radar health check passed its configured required-product thresholds at 7:41 PM Arizona time: MRMS was 30 minutes old; required Level III scans were about 207-211 minutes old. Minneapolis and Duluth echo tops were stale (479 and 822 minutes). These are not real-time Level III conditions.
- Timelines reported `worker-r2`, not `worker-r2-pack`; this build does not claim the packed-radar rollout is complete. Radar publishers and recovery watchdogs are disabled at GitHub and paused in Cloud Scheduler to prevent legacy tile-per-object writes.
- Satellite stability, cloud values, large-font layouts, and location-history behavior still need on-device internal-testing verification.
- App lint and TypeScript checks passed. Worker tests could not start on this Windows ARM64 host because the installed `workerd` package has no compatible binary; this is an environment limitation, not a test failure.
