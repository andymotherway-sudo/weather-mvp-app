# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.256**
Android version code: **10273**
Track: **Closed testing / internal testing candidate**
Date: **September 14, 2026**

## Play Console Paste Notes

Clarifies Storm Scope Owned L3 status so owned NOAA Level III frames are reported separately from IEM fallback frames.

## Tester Notes

Please focus testing on Maps Storm Scope, then smoke-test Space and Land:

- In Maps, open Storm Scope near Phoenix/KIWA and select `Local` + `Owned L3` + `HREFL`.
- Confirm the Storm Scope health line reports `provider=level3`, `requested=level3`, `ownedFrames>0`, `visibleFrames`, and `template=level3`.
- Confirm the bottom radar timeline says `owned Level III` rather than generic local/IEM history when Owned L3 is selected.
- Confirm IEM fallback still works when switching the local provider back to `IEM`.
- Confirm MRMS broad radar still loads or falls back cleanly when using the wide radar controls.
- Confirm Space, Land, Hourly, and Astro still load normally after update/relaunch.

## Internal Release Checklist

- App version: `1.1.256`
- Android version code: `10273`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building.
- Run GitHub Actions -> `Radar health report` against production before upload when available.
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: not required unless Worker code changed.
- Android build: `npm run build:android:prod`
