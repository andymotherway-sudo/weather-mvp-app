# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.294**
Android version code: **10312**
Track: **Closed testing / internal testing candidate**
Date: **November 26, 2026**

## Play Console Paste Notes

Redesigned responsive Android home-screen widgets and added a live Space
Weather widget with cached NOAA SWPC Kp, solar-wind, Bz, and X-ray context.

## Tester Notes

Please focus on these areas:

- Move among Land, Hourly, Almanac, Maps, Space, Nautical, Aviation, and
  Extremes. Verify shared loading, unavailable, and retry states are readable
  and do not overlap navigation or map controls.
- Open Maps, the layer selector, the Maps drawer, wxLearn, and weather
  explanations on a small phone and a tablet if available. Confirm every sheet
  clears system bars, has even side gutters, and leaves all buttons reachable.
- Open Storm Scope. Confirm `Exit` is visible beside `Done` at the top of the
  controller rather than being buried at the bottom of the sheet.
- Open Settings. Confirm the header and cards remain centered and readable on
  both narrow phones and larger screens without edge-clipped controls.
- Start a long GeoColor, infrared, or layered video export, then leave Maps and
  use another tab. Confirm a local notification reports saved or failed when it
  finishes. If notification permission is denied, confirm the in-app result is
  still shown. Force-closing the app is not supported during an active export.
- Test an export with some source frames unavailable. A usable two-thirds
  chronological timeline should save once; sparse timelines must still fail
  clearly rather than replaying frames or producing a flashing loop.
- Save a five-hour GeoColor plus infrared video. Confirm preparation remains
  fast and country/continent and U.S. state borders track the imagery without
  an offset. No city, ocean, country, or state labels should be baked into it.
- Start that export after reopening the app, before imagery has fully warmed.
  Confirm source preparation waits and retries as needed rather than failing
  immediately with zero ready frames; sparse timelines must still fail clearly.
- Test default and increased Android font/display scaling. Cards, mode toggles,
  buttons, and status messages should remain usable without clipped actions.
- Change saved locations repeatedly and verify forecasts, timestamps, and
  location context update without retaining stale content from the prior place.
- Add Current Conditions, Current + Radar, Sky Score, and Aviation widgets at
  compact, standard, and expanded launcher sizes. Confirm compact layouts keep
  the primary metric readable, while larger layouts reveal only verified cached
  detail without clipping at large system font sizes.
- Resize the Current Conditions widget. Confirm the six-point temperature
  curve starts near the current local hour, and wind, humidity, and dew point
  appear only on the expanded layout. Turn off connectivity and confirm cached
  content is not presented as live after refresh fails.
- Add the new Space Weather widget. Confirm it opens Space, refreshes through
  the existing widget refresh action, displays Kp/solar-wind/Bz/X-ray values
  when the cached Worker summary is available, and shows an unavailable state
  rather than stale data presented as current.
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
- Turn on Infrared and GeoColor independently at several zoom levels. Confirm
  each image retains correct geographic proportions with no vertical stretching.
- While GeoColor or infrared is still buffering, confirm the animation keeps
  moving from its current timestamp rather than jumping back to the first or
  newest catalog frame when another source image finishes loading.
- Turn on GeoColor with infrared, radar, or clouds. Confirm the map advances
  as one clean scene rather than showing an independently timed duplicate
  beneath it. The blue current-location dot must remain visible above imagery.
- Save a layered GeoColor/infrared, radar/GeoColor, and radar/clouds video.
  Confirm the export matches the map's intended relative layer visibility.
- Open Maps with True Color already enabled. Confirm it loads without a manual
  layer toggle after a cold app launch or tab switch.
- In Aviation, choose All products and scan valid times. Confirm each clock
  label is distinct, PIREPs remain visible as recent reports, and the header
  has a real update time rather than `pending`.
- Save five-hour GeoColor plus infrared and radar videos. Confirm each uses the
  complete chronological timeline once, lasts at least 12 seconds, does not
  jump from the newest scene back to the oldest, and reports incomplete imagery
  rather than saving a flashing two-frame loop.
- Review astronomy seeing and marine condition labels. Confirm they describe
  estimated or derived guidance and remain cautious when inputs are missing.
- Open Profile and confirm the OMNIwx Free status is informational. No purchase,
  restore, account requirement, or premium lock should be active.

## Internal Release Checklist

- App version: `1.1.294`
- Android version code: `10312`
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
- The Worker shares the home-summary and hourly forecast cache key, reducing
  duplicate Open-Meteo requests. Its failure response remains privacy-safe and
  concise. No D1 migration or radar-publisher activation is part of this release.
- This is an app-only native widget redesign. The existing widget suite now
  shares OMNIwx headers and progressive compact, balanced, and detailed
  layouts, including Airport Board, Route Briefing, Climatology, and Climate
  Arch resize behavior. No Worker deploy, production configuration change, D1
  migration, or radar-publisher activation is required. The existing widget
  refresh path remains serialized and cached.
- Before Play upload, verify the production Worker and renew `NOAA_NCEI_TOKEN`
  if records are expected to work.

## Production Evidence Before Build

- Worker deployment: `omniwx-api-production` version
  `2eb6b3fc-9fa4-484d-8f76-d3e60a4634da`.
- Production `/v1/health`, `/v1/radar/backend/status`, and a Mesa home-summary
  request returned successful responses after deployment. Radar writers remain
  disabled; no production D1 migration or publisher activation occurred.
- The private GeoColor renderer is production revision
  `omniwx-goes-renderer-00010-f5z`, serving 100% of traffic from image
  `sha256:b61db6dea0e7e76f42ac9e00139fb85976d768e1da264e2dc1e10864c6d58078`.
- Its cap remains two instances; its request deadline is 120 seconds and each
  NOAA source request is capped at 20 seconds across four attempts.
- The production frame catalog returned 11 frames. A fresh cache-v4 512px
  export returned `200 image/png` (446,666 bytes) through the production Worker.
- Radar publishers remain paused; no D1 migration or publisher activation is
  part of this release.
- On November 24, production `/v1/health` returned `ok` and the radar backend
  status confirmed its D1 writes remain disabled. This is an app-only Maps and
  export release, so no Worker deployment was required. Level III remains
  intentionally stale while its publisher is paused and is not represented as
  fresh owned imagery.

## Built Artifact Evidence

### Previous `1.1.293` Artifact

- Built successfully with `npm run build:android:prod` on November 26, 2026.
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- Size: `170865743` bytes. Build timestamp: `2026-11-27T04:18:44Z`.
- SHA-256: `EDD4FECBB0B893FFBFC209A7D16701ABC78A2EC917EE8235A692A94093BF362B`
- Embedded configuration confirms app version `1.1.293`, Android version code
  `10311`, build label `internal-test-aab-10311`, and the production Worker URL.
- Signing certificate SHA-256:
  `46:F8:21:65:2A:F8:43:54:F1:34:25:F4:27:E0:74:3F:A2:CE:1C:C9:B4:2A:AA:F6:71:BE:6D:74:EE:1F:76`

## `1.1.294` Tester Focus

- Add Current Conditions, Current + Radar, Sky Score, Aviation, Airport Board,
  Route Briefing, Climatology, Climate Arch, and Space Weather widgets on a
  Pixel and Samsung launcher. Resize each through its supported sizes and
  confirm compact widgets retain the decision metric without clipped text.
- Confirm Airport Board, Route Briefing, Climatology, and Climate Arch refresh
  after resize and retain their existing active-place or aviation selection.
- Confirm tapping each widget still deep-links to the intended OMNIwx screen.

## Remaining Acceptance

- Upload only version code `10312` to the intended Play internal-testing track.
- Install the Play-delivered build on physical Android devices.
- Complete the tester checks above, with Maps and imagery playback treated as
  the highest-risk acceptance area. Specifically verify a five-hour GeoColor
  plus infrared recording contains the full forward timeline and no repeated
  two-frame loop.
