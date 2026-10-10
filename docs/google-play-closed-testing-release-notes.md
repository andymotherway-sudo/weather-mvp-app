# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.262**
Android version code: **10279**
Track: **Closed testing / internal testing candidate**
Date: **October 10, 2026**

## Play Console Paste Notes

Makes wxLab denser, brings forecast nuance to the Land wxLab view, and prevents GeoColor from silently rendering infrared imagery when live GeoColor frames are unavailable. GeoColor now labels a daily true-color reference honestly while the live NESDIS catalog recovers. Radar publishing schedules remain contained.

## Tester Notes

Please focus testing on wxLab and Maps:

- In Land wxLab, verify the compact metric cells remain readable and tappable with default and increased Android font/display scaling.
- Confirm a Forecast nuance card appears only when the hourly forecast contains a meaningful short-term pattern, and that its language matches the nearby hourly values.
- In Maps, select GeoColor while the live feed is healthy and while it is unavailable. It must never render infrared as GeoColor. If the live feed is unavailable, the UI must explicitly say it is showing a daily true-color reference.
- Test Infrared loading and playback separately; it may render thermal imagery, but its source label must remain Infrared.
- Smoke-test Land, Hourly, Space, Almanac, Maps, and Astro after update/relaunch.

## Internal Release Checklist

- App version: `1.1.262`
- Android version code: `10279`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building.
- Run GitHub Actions -> `Radar health report` against production before upload when available.
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production Worker deploy: not required for this release; the production Worker already contains the satellite fallback changes. Radar publisher and watchdog schedules remain disabled and fail closed.
- Android build: `npm run build:android:prod`

## Release Verification Notes

- The production AAB build passed on Windows, including Android release lint. The signed bundle contains version `1.1.262`, code `10279`, label `internal-test-aab-10279`, and the production API configuration. SHA-256: `22E66BC0D510E300D4092E5BDA179D079AD6B7EC89944F4AA064783DFAD1978C`. Play upload and on-device validation remain pending.
- October 10 production health and backend-control checks passed. Expo config and the signed bundle resolve to the production API with build `10279` and MRMS preview enabled.
- The read-only radar health check passed its configured required-product thresholds at 7:41 PM Arizona time: MRMS was 30 minutes old; required Level III scans were about 207-211 minutes old. Minneapolis and Duluth echo tops were stale (479 and 822 minutes). These are not real-time Level III conditions.
- Timelines reported `worker-r2`, not `worker-r2-pack`; this build does not claim the packed-radar rollout is complete. Radar publishers and recovery watchdogs are disabled at GitHub and paused in Cloud Scheduler to prevent legacy tile-per-object writes.
- Satellite stability, cloud values, large-font layouts, and location-history behavior still need on-device internal-testing verification.
- App lint and TypeScript checks passed. Worker tests could not start on this Windows ARM64 host because the installed `workerd` package has no compatible binary; this is an environment limitation, not a test failure.
