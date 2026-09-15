# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.257**
Android version code: **10274**
Track: **Closed testing / internal testing candidate**
Date: **September 14, 2026**

## Play Console Paste Notes

Fixes MRMS radar state handling so stale fallback frames do not make owned MRMS appear unavailable when fresh owned frames are loaded.

## Tester Notes

Please focus testing on Maps radar, then smoke-test Space and Land:

- In Maps wide radar, select `MRMS` and confirm the bottom timeline reports owned MRMS history when frames are available.
- If MRMS is unavailable, confirm the diagnostic text reports `ownedFrames`, `visible`, and `template` instead of silently mixing fallback history.
- In Storm Scope near Phoenix/KIWA, confirm `Local` + `Owned L3` + `HREFL` still works and IEM fallback still works when selected.
- Confirm Space, Land, Hourly, and Astro still load normally after update/relaunch.

## Internal Release Checklist

- App version: `1.1.257`
- Android version code: `10274`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building.
- Run GitHub Actions -> `Radar health report` against production before upload when available.
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: not required unless Worker code changed.
- Android build: `npm run build:android:prod`
