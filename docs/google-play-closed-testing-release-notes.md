# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.273**
Android version code: **10291**
Track: **Closed testing / internal testing candidate**
Date: **November 21, 2026**

## Play Console Paste Notes

Faster GeoColor startup and smoother saved weather videos. Map zoom now stays
on your chosen area, and overlay selection no longer shifts while browsing.
Aviation filters now include PIREPs, CWAs, and observations. Land and Hourly
screens now honor Celsius and metric wind settings.

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
- Exercise standard radar and GeoColor playback. Confirm the first preview
  appears promptly, sharpens without moving the camera, and the loop continues
  without blank frames, flashing, or stale source labels.
- Save GeoColor and radar videos. Confirm gallery playback lasts at least 12
  seconds, retains the expected animation speed, and loops without a blank cut.
- Review astronomy seeing and marine condition labels. Confirm they describe
  estimated or derived guidance and remain cautious when inputs are missing.
- Open Profile and confirm the OMNIwx Free status is informational. No purchase,
  restore, account requirement, or premium lock should be active.

## Internal Release Checklist

- App version: `1.1.273`
- Android version code: `10291`
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

- Built with `npm run build:android:prod` on November 21, 2026 (Arizona time).
  The Windows release script applied the documented Java local-TCP fallback
  (`jdk.net.unixdomain.tmpdir=NUL`) before running Gradle.
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- Artifact UTC timestamp: `2026-11-22T00:16:11.1267409Z`
- Size: `170,845,269` bytes
- SHA-256: `D31F47A900E3CED8815795DAA2B6397411AB7DBF757B47E30975A8752662F7A9`
- Embedded configuration confirms version `1.1.273`, Android version code
  `10291`, and `https://omniwx-api-production.omniwx.workers.dev`.
- The signed bundle certificate was readable. Certificate SHA-256:
  `46:F8:21:65:2A:F8:43:54:F1:34:25:F4:27:E0:74:3F:A2:CE:1C:C9:B4:2A:AA:F6:71:BE:6D:74:EE:1F:76:6B`.
- Post-build production probes returned HTTP `200` at `2026-11-22T00:22:04Z`
  for `/v1/health` and `/v1/radar/backend/status`. The latter continues to
  report the owned radar read path as disabled for free-tier protection; this
  release does not change that safeguard.
- Do not upload an older artifact left at the standard output path. Confirm the
  Play Console recognizes version code `10291` before completing rollout.

## Remaining Acceptance

- Upload to the intended Play internal-testing track.
- Install the Play-delivered build on physical Android devices.
- Complete the tester checks above, with Maps and imagery playback treated as
  the highest-risk acceptance area.
