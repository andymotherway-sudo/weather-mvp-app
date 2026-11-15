# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.271**
Android version code: **10289**
Track: **Closed testing / internal testing candidate**
Date: **November 14, 2026**

## Play Console Paste Notes

Updates GeoColor frame handling and server image encoding. Removes Forecast Nuance cards from Hourly. Satellite video exports no longer request the label overlay that produced an API-key watermark, and exports use direct frame transitions instead of fades.

## Tester Notes

Please focus testing on wxLab, Almanac, and Maps:

- In Land wxLab, verify the denser cells remain readable and tappable with default and increased Android font/display scaling.
- In Almanac, pull down to refresh and verify the updated state changes for forecast, normals, selected-day context, and records.
- In Maps, select GeoColor and zoom around the Southwest. Imagery should be crisp rather than blocky, and the map must not substitute infrared imagery for GeoColor.
- Let GeoColor load for a 2-hour loop, then scrub and play it. Valid frames should switch without flashing, opacity fading, native-layer recreation hitches, or resetting to the first frame; if an individual official source frame is unavailable, the app should retain valid imagery rather than blanking the map.
- Save a GeoColor video, then open it from Movies/OMNIwx. It must contain no `API KEY REQUIRED` watermark and no "crossfaded MP4" caption.
- Force-stop and relaunch the app, then open Maps. The initial map should render without requiring a second app restart.
- Test Infrared separately; thermal imagery must remain labeled Infrared.
- Smoke-test Land, Hourly, Space, Almanac, Maps, and Astro after update/relaunch.
- Confirm Forecast Nuance is absent from all Hourly layouts, including Simple and wxLab.

## Internal Release Checklist

- App version: `1.1.271`
- Android version code: `10289`
- Intended backend environment: `production`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `npm run build:android:prod`
- Before Play upload, verify the production Worker and renew `NOAA_NCEI_TOKEN` if records are expected to work.

## Release Verification Notes

- Production Worker fixes were deployed on October 17. The default Worker no longer reports a cron schedule, and production was deployed explicitly.
- The October 17 NOAA CDO probe returned `400: The token parameter provided is not valid`. This credential was not rechecked for this release; verify it before representing records as operational.
- GeoColor frames now come from the private production renderer through Cloudflare Access federation. It fetches the official 5424px GOES GeoColor source, renders regional map tiles with bilinear sampling, and does not substitute infrared or a daily still image.
- The private production GeoColor renderer was updated with fast PNG encoding (revision `omniwx-goes-renderer-00008-8zq`). Single uncached 1080x1920 probes measured about 10.4 seconds before and 4.2 seconds after, using different frames and potentially different container state. These are observations, not a controlled performance comparison. One repeated pre-change request hit the Worker cache in about 223 ms. Device loading/playback acceptance remains pending.
- Rendering capacity is intentionally bounded to two Cloud Run instances with four concurrent requests each. This limits configured capacity; it is not a latency or total-billing guarantee.
- The app keeps two native image sources mounted and uses a timed cutover. It does not receive a native image-decode-ready acknowledgment, so smooth, flash-free playback is not proven by the build or static checks.
- Radar publisher and watchdog schedules remain disabled or fail closed; this release does not enable radar publishing.
- Release gate note: the November 14 read-only radar-health report found the paused owned MRMS and Level III timelines stale. This is a known infrastructure limitation, not a result of this app/GeoColor renderer change. Keep RainViewer and IEM fallbacks enabled, and do not represent owned radar freshness as accepted by this release. No Worker code or bindings changed in this release, so no additional Worker deployment was required.

## Built Artifact Evidence

- Build: `npm run build:android:prod`, successful in 18m 45s; 999 actionable tasks (858 executed, 141 up-to-date).
- Artifact: `android/app/build/outputs/bundle/release/app-release.aab`, 170835826 bytes; modified `2026-11-14T18:14:56Z`.
- SHA-256: `6429F43197DF4EDCDB0C44A96F472A22DED68CCD7C1A7B603D5FE4A23F922FEA`.
- Native manifest: `com.anonymous.weatherapp`, version `1.1.271`, version code `10289`.
- Embedded Expo config: `1.1.271 / 10289`, `production`, `https://omniwx-api-production.omniwx.workers.dev`, build label `internal-test-aab-10289`.
- `npx tsc --noEmit` and `npm run lint -- --quiet`: passed November 14.
- `jarsigner -verify -certs`: passed. Signer matches the configured `android/signing/omniwx-upload.jks` certificate: SHA-256 `46:F8:21:65:2A:F8:43:54:F1:34:25:F4:27:E0:74:3F:A2:CE:1C:C9:B4:2A:AA:F6:71:BE:6D:74:EE:1F:76:6B`.
- Signing caveat: the much older archived `1.1.89 / 10106` bundle has a different signer. A recent accepted artifact was unavailable for comparison; the Play Console's current registered upload certificate has not been independently checked. Do not rotate keys based on the old archive alone.
- Play upload, installation, and physical-device Maps acceptance: pending. This is an internal-testing candidate, not an approved wider release.
