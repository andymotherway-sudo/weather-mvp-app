# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.278**
Android version code: **10296**
Track: **Closed testing / internal testing candidate**
Date: **November 22, 2026**

## Play Console Paste Notes

GeoColor now retries transient source rendering within a bounded service budget,
reducing false skipped frames and blank playback. Radar publishers remain paused.

## Tester Notes

Please focus on these areas:

- Move among Land, Hourly, Almanac, Maps, Space, Nautical, Aviation, and
  Extremes. Verify shared loading, unavailable, and retry states are readable
  and do not overlap navigation or map controls.
- Test default and increased Android font/display scaling. Cards, mode toggles,
  buttons, and status messages should remain usable without clipped actions.
- Change saved locations repeatedly and verify forecasts, timestamps, and
  location context update without retaining stale content from the prior place.
- In Maps, pan and zoom before changing products. Verify the camera remains
  stable and missing data is represented as unavailable rather than current.
- Pan away from the selected or GPS location, then use the map `+` and `-`
  buttons repeatedly. Verify only zoom changes and the map never recenters.
- In Aviation, select every product and hazard, then change altitude and valid
  time. Verify CWA and PIREP reports remain discoverable when their filters are
  selected and no product silently falls into an unselectable category.
- Change Settings from Fahrenheit to Celsius, then revisit Land and Hourly.
  Verify temperatures, dew points, wind/gust labels, and forecast graphs use
  Celsius and km/h where shown; switching back must restore Fahrenheit and mph.
- Toggle several overlays while scrolled within the selector. Verify the list
  stays at the same position and no active-layers card appears above it.
- Exercise standard radar and GeoColor playback. Confirm GeoColor does not
  briefly show a soft or stretched preview, the sharp frame is state-scale
  readable when it appears, and the loop continues without blank frames,
  flashing, or stale source labels. It must not remain at one ready frame with
  the remaining frames marked skipped.
- Open Maps with True Color already enabled. Confirm it loads without a manual
  layer toggle after a cold app launch or tab switch.
- In Aviation, choose All products and scan valid times. Confirm each clock
  label is distinct, PIREPs remain visible as recent reports, and the header
  has a real update time rather than `pending`.
- Save GeoColor and radar videos. Confirm gallery playback lasts at least 12
  seconds, retains the expected animation speed, and loops without a blank cut.
- Review astronomy seeing and marine condition labels. Confirm they describe
  estimated or derived guidance and remain cautious when inputs are missing.
- Open Profile and confirm the OMNIwx Free status is informational. No purchase,
  restore, account requirement, or premium lock should be active.

## Internal Release Checklist

- App version: `1.1.278`
- Android version code: `10296`
- Intended backend environment: `production`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Lint check: `npm run lint -- --quiet`
- Worker tests: `npm test -- --run`
- Android build: `npm run build:android:prod`

## Release Verification Notes

- App lint and TypeScript checks must pass locally before artifact creation.
- Worker tests and the GeoColor renderer syntax check must pass before production promotion.
- The full Worker integration harness cannot run on the local Windows ARM64
  host because `workerd` does not support that platform. A Linux GitHub CI gate
  now runs the full Worker suite before integration.
- The account, preference-sync, entitlement, and RevenueCat webhook code in this
  release is foundation-only. Billing is not activated, no production D1
  migration is applied, and clients remain on the guest/free entitlement.
- Existing free weather remains available without account creation. The client
  contains no local premium override and does not trust client-provided paid
  status.
- This release does not resume MRMS or Level III publishers. A single packed
  MRMS pilot frame is serving through the Worker, but its corrected no-write
  runner has not yet been deployed; schedules remain paused and existing
  fallbacks remain required.
- The Cloudflare Worker contract is unchanged. The bounded private GeoColor
  Cloud Run renderer was promoted before building this paired app release; no
  D1 migration or radar-publisher activation is part of this release.
- Before Play upload, verify the production Worker and renew `NOAA_NCEI_TOKEN`
  if records are expected to work.

## Production Evidence Before Build

- The private GeoColor renderer is production revision
  `omniwx-goes-renderer-00009-8b6`, serving 100% of traffic from image
  `sha256:cf9871148c1452aed3d3a81186dd86c8abb3424dff1881f90e75dc64ed70f23a`.
- Its cap remains two instances; its request deadline is 120 seconds and each
  NOAA source request is capped at 20 seconds across four attempts.
- The production frame catalog returned 12 frames. A current 512px export
  returned `200 image/png` (363,613 bytes) through the production Worker.
- Radar publishers remain paused; no D1 migration or publisher activation is
  part of this release.

## Built Artifact Evidence

- Built successfully with `npm run build:android:prod` on November 22, 2026.
  The documented Windows Java local-TCP fallback was applied by the release
  script.
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- Size: `170,852,954` bytes. Build timestamp: `2026-11-22T19:27:46.9199452Z`.
- SHA-256: `F6B5286571FF8CDD2F4C694379D1FE21A0A53E196018672B0CBB46A02257B900`
- Embedded configuration confirms app version `1.1.278`, Android version code
  `10296`, build label `internal-test-aab-10296`, and the production Worker URL.
- The signing certificate SHA-256 is
  `46:F8:21:65:2A:F8:43:54:F1:34:25:F4:27:E0:74:3F:A2:CE:1C:C9:B4:2A:AA:F6:71:BE:6D:74:EE:1F:76:6B`.

## Remaining Acceptance

- Upload only version code `10296` to the intended Play internal-testing track.
- Install the Play-delivered build on physical Android devices.
- Complete the tester checks above, with Maps and imagery playback treated as
  the highest-risk acceptance area.
