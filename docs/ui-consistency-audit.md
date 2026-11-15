# UI Consistency Audit

Last reviewed: November 14, 2026

## Scope

This audit covers every user-facing Expo route in `app/` and the shared controls used by those routes. It is a static code and automated-check pass. Physical-device verification is still required for responsive layout, large text, map gestures, imagery animation, safe areas, and screen-reader behavior.

## Shared Standards

- Use `OmniStatusCard` for loading, error, empty, unavailable, and informational states. Unsupported or not-configured data is `unavailable`, not a failure.
- Use `ModeToggle` for Simple and wxLab mode selection instead of screen-specific segmented controls.
- Give interactive controls an accessible role, descriptive label, selected or disabled state where applicable, and a practical touch target.
- Keep free weather available without an account and represent premium access through the centralized entitlement layer.
- Preserve map state across normal tab changes. Product changes must not silently reset the user's camera.
- Label stale, missing, fallback, or provider-unavailable data honestly. Never present it as current.
- Keep source, update-time, and freshness language consistent within each feature family.

## Route Acceptance Matrix

| Route | Primary feature | Consistency status | Remaining validation |
| --- | --- | --- | --- |
| `app/(onboarding)/default-city.tsx` | Initial location selection | Search, GPS, errors, results, and busy states expose accessibility metadata. | Large-font layout, denied-location flow, keyboard behavior. |
| `app/(tabs)/index.tsx` | Land/current weather | Shared mode control and standardized no-location, loading, and error states. | Device spacing, refresh behavior, saved-location switching. |
| `app/(tabs)/hourly.tsx` | Hourly forecast | Shared mode control and standardized no-location, loading, error, and empty states. | Graph gestures, large text, timezone changes. |
| `app/(tabs)/almanac.tsx` | Almanac and climatology | Standardized location, provider, observed-day, and climate-normal states. | Chart labels, partial-provider failures, tablet widths. |
| `app/(tabs)/maps.tsx` | Radar and satellite maps | Map route now remains mounted across tabs; primary map controls expose accessibility labels and state. | Camera persistence, radar animation, imagery freshness, memory use on physical devices. |
| `app/(tabs)/solar.tsx` | Space weather and astronomy | Standardized primary astronomy and space-weather loading/error states. | Dense technical sections, image-feed failures, large-font hierarchy. |
| `app/(tabs)/nautical.tsx` | Marine overview | Standardized marine and official-bulletin loading, error, unavailable, and empty states. | Zone/buoy switching, tide layouts, provider fallback. |
| `app/(tabs)/aviation.tsx` | Aviation overview | Segmented, help, primary, and secondary controls expose roles and interaction state. | Disabled flows, dense cards, aviation-source freshness. |
| `app/(tabs)/extremes.tsx` | Land, marine, and Mars extremes | Standardized provider loading, error, and empty states across feature sections. | Cross-provider partial failure and narrow-screen card flow. |
| `app/(tabs)/aviation-map.tsx` | Aviation hazards map | Slider and chips expose adjustable/selected semantics; live errors are announced. | Map gestures, time-slider precision, overlay contrast. |
| `app/(tabs)/astro-map.tsx` | Sky-score map | Audited for shared navigation and map-shell compatibility; no broad redesign applied. | Camera persistence, map control spacing, data-freshness labels. |
| `app/(tabs)/astronomer.tsx` | Advanced astronomy | Audited for feature-depth preservation; no broad redesign applied. | Information hierarchy, empty states, large-font behavior. |
| `app/(tabs)/mariner.tsx` | Advanced marine tools | Audited for feature-depth preservation; no broad redesign applied. | Control density, empty states, source/freshness language. |
| `app/profile.tsx` | Settings, account, subscription | Startup now uses the shared loading treatment; existing account and notification activity indicators remain local to their controls. | Account-state transitions, purchase/restore states, large text. |
| `app/buoy/[buoyId].tsx` | Buoy detail | Standardized missing-ID, loading, error, and empty-observation states. | Long station names, stale observations, chart responsiveness. |
| `app/nautical/zone/[zoneId].tsx` | Marine-zone detail | Standardized loading, failure, unsupported-zone, content card, and navigation treatment. | Long bulletins, refresh behavior, screen-reader reading order. |

## Cross-Feature Results

### Completed in code

- A reusable status-state component now replaces divergent error boxes and indefinite blank/loading screens in the highest-traffic routes.
- Simple/wxLab selection is presented consistently on Land and Hourly and can be reused by other feature families.
- Maps no longer opt into automatic unmounting when another tab is selected, reducing unnecessary camera and loading resets.
- Map, aviation, onboarding, and profile controls received targeted accessibility semantics without changing their core workflows.
- Marine and buoy detail routes now distinguish unavailable data from operational failures.

### Intentionally not claimed complete

- Smooth radar and satellite animation cannot be accepted from TypeScript or lint results; it needs release-device testing under realistic networks.
- Large-font support needs Android font-scale testing at 1.0x, 1.3x, and 1.5x.
- Map camera persistence needs cold-start, tab-switch, product-switch, and background/resume testing.
- Hidden specialty routes retain some domain-specific controls. They were audited but should migrate to shared primitives when those screens are next changed rather than through a risky wholesale rewrite.

## Device Acceptance Checklist

1. Test a small Android phone, a common 1080p phone, and one tablet-width emulator or device.
2. Repeat primary flows at default, 1.3x, and 1.5x font scales.
3. Verify loading, no-network, provider-error, empty, stale, and recovery states for every feature family.
4. Switch among tabs repeatedly and confirm Maps retains camera, selected product, timeline position, and visible controls.
5. Enable TalkBack and verify onboarding, mode selection, map controls, aviation slider, retry actions, and profile controls.
6. Test saved-location changes across Land, Hourly, Almanac, Astronomy, Marine, Aviation, and Extremes.
7. Confirm all provider timestamps and fallback labels match the data actually displayed.

## Follow-Up Priority

1. Run the device acceptance checklist and record screenshots plus failures by route.
2. Profile Maps imagery loading and animation on a release build before making further visual changes.
3. Migrate specialty-route state panels to `OmniStatusCard` as those routes receive feature work.
4. Add visual regression coverage for the shared status card and mode control when a stable screenshot-test harness is available.
5. Address only verified spacing or hierarchy defects; avoid broad redesigns that could destabilize working domain features.
