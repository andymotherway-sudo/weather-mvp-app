# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.258**
Android version code: **10275**
Track: **Closed testing / internal testing candidate**
Date: **September 20, 2026**

## Play Console Paste Notes

Improves owned radar freshness by moving MRMS and Level III publishing to dedicated Cloud Run schedules.

## Tester Notes

Please focus testing on Maps radar, then smoke-test Space and Land:

- In Maps wide radar, select `MRMS` and confirm the timeline shows fresh owned MRMS history.
- In Storm Scope near Phoenix/KIWA, confirm `Local` + `Owned L3` + `HREFL` still works with fresh Level III frames.
- Confirm RainViewer/IEM fallback still works if owned radar is stale or unavailable.
- Confirm Space, Land, Hourly, and Astro still load normally after update/relaunch.

## Internal Release Checklist

- App version: `1.1.258`
- Android version code: `10275`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building.
- Run GitHub Actions -> `Radar health report` against production before upload when available.
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: not required; this release uses the existing Worker plus new Cloud Run radar cadence.
- Android build: `npm run build:android:prod`
