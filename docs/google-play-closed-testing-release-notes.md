# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.275**
Android version code: **10293**
Track: **Closed testing / internal testing candidate**
Date: **November 22, 2026**

## Play Console Paste Notes

GeoColor now waits for its sharp image instead of briefly showing a soft
preview. Map zoom buttons respect pinch zoom and never recenter. Aviation maps
separate advisory valid times from PIREP reports and remove duplicate labels.

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
  flashing, or stale source labels.
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

- App version: `1.1.275`
- Android version code: `10293`
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
- This release does not resume MRMS or Level III publishers. Existing radar
  fallbacks remain required while owned timelines are paused or stale.
- The Cloudflare Worker contract is unchanged. The bounded private GeoColor
  Cloud Run renderer must be promoted before building this paired app release;
  no D1 migration or radar-publisher activation is part of this release.
- Before Play upload, verify the production Worker and renew `NOAA_NCEI_TOKEN`
  if records are expected to work.

## Built Artifact Evidence

- Built successfully with `npm run build:android:prod` on November 22, 2026.
  The documented Windows Java local-TCP fallback was applied by the release
  script.
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- Size: `170,845,108` bytes. Build timestamp: `2026-11-22T15:45:25Z`.
- SHA-256: `F8B82024B2237AEEB05A0D667A26B997686FF4E3F4C21ED98472F9808D7674B5`
- Embedded configuration confirms app version `1.1.275`, Android version code
  `10293`, build label `internal-test-aab-10293`, and the production Worker URL.
- The signing certificate SHA-256 is
  `46:F8:21:65:2A:F8:43:54:F1:34:25:F4:27:E0:74:3F:A2:CE:1C:C9:B4:2A:AA:F6:71:BE:6D:74:EE:1F:76:6B`.
- Post-build production checks returned HTTP 200 for Worker health and radar
  status. The actual GeoColor catalog route returned 11 NOAA STAR / CIRA frames;
  aviation overlays returned G-AIRMET, AIRMET/SIGMET, CWA, PIREP, and METAR with
  no provider errors.
- This is an app-only release: no Worker deployment, D1 migration, or radar
  publisher change was made. The local Windows ARM64 Worker integration suite
  was not rerun because `workerd` is unsupported on this host; Linux CI remains
  the full Worker-test gate.
- Upload only this version-code `10293` AAB. Do not reuse or upload `10292`.

## Remaining Acceptance

- Upload to the intended Play internal-testing track.
- Install the Play-delivered build on physical Android devices.
- Complete the tester checks above, with Maps and imagery playback treated as
  the highest-risk acceptance area.
