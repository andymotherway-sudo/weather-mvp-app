# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.272**
Android version code: **10290**
Track: **Closed testing / internal testing candidate**
Date: **November 15, 2026**

## Play Console Paste Notes

Improves consistency and recovery states across Land, Hourly, Almanac, Maps,
astronomy, marine, aviation, and extremes. Refines astronomy seeing language and
marine condition signals so derived guidance is clearer about its inputs and
limitations. Adds a safe, inactive foundation for future OMNIwx Free and Plus
accounts; purchases and paid feature enforcement are not enabled in this build.

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
- Exercise standard radar and GeoColor playback. Report blank first-open maps,
  unexpected camera resets, stale source labels, flashing, frame jumps, or slow
  recovery after a failed frame.
- Review astronomy seeing and marine condition labels. Confirm they describe
  estimated or derived guidance and remain cautious when inputs are missing.
- Open Profile and confirm the OMNIwx Free status is informational. No purchase,
  restore, account requirement, or premium lock should be active.

## Internal Release Checklist

- App version: `1.1.272`
- Android version code: `10290`
- Intended backend environment: `production`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Lint check: `npm run lint -- --quiet`
- Worker focused tests: `npm run test:unit`
- Android build: `npm run build:android:prod`

## Release Verification Notes

- App lint and TypeScript checks pass locally.
- Worker TypeScript and 12 focused unit tests pass locally.
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
- Production Worker deployment is not part of the app build step. Backend and D1
  activation require a separate approved deployment and migration procedure.
- Before Play upload, verify the production Worker and renew `NOAA_NCEI_TOKEN`
  if records are expected to work.

## Built Artifact Evidence

Pending fresh production AAB build and verification.

## Remaining Acceptance

- Upload to the intended Play internal-testing track.
- Install the Play-delivered build on physical Android devices.
- Complete the tester checks above, with Maps and imagery playback treated as
  the highest-risk acceptance area.
