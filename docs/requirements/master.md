OMNI wx — Master Requirements

Version: 1.0
Status: Active
Owner: Product (OMNI wx)

This document defines all product, platform, and delivery requirements for OMNI wx.
All changes must be made via Pull Request.

1. Product Philosophy (Non-Negotiable)

OMNI wx shall be calm, trustworthy, and data-honest.

The app shall integrate Land, Sea, Sky, and Extremes into a unified experience.

Radar shall lead the experience as the primary trust anchor.

NOAA-first data philosophy shall be preserved.

Enhancements from non-NOAA providers shall be clearly attributed.

Explainability shall be prioritized over novelty.

2. Navigation & Lenses (Core Pattern)

The app shall use a small number of primary domains (tabs).

Each domain shall use segmented lenses (tabs within tabs).

Each domain shall support no more than 3–4 lenses.

Switching lenses shall not reroute navigation by default.

Switching lenses shall not trigger unintended refetch loops by default.

Lenses shall represent different interpretations of the same data, not separate ownership.

Lens placement and behavior shall be consistent across domains.

3. Map & Radar (Leading Experience)

The app shall provide a single canonical map canvas.

The map shall support segmented lenses:

Radar (lead)

Satellite

Marine (nautical polygons + buoys)

Observations (stations/buoys)

Radar shall support time navigation (timeline/scrubber) within provider limits.

Tapping map entities shall deep-link to canonical detail screens.

Map architecture shall be provider-agnostic and overlay-driven.

Performance shall be prioritized:

no sustained blur or jitter

controlled request cancellation

stable animation cadence

4. Nautical (Zones + Buoys)

Nautical data shall be NOAA-first (NDBC + NWS).

Buoy data shall be owned by an authoritative buoy layer (app/lib/buoys).

Nautical derivations shall live in app/lib/nautical, not UI screens.

Map → Marine lens shall render:

nautical polygons (zones)

buoy explorer pins (clustered as needed)

There shall not be multiple competing full-screen maps for nautical use.

Interaction priority:

buoy tap selects buoy

polygon tap selects zone

Selection state shall support selectedBuoyId and selectedZoneId consistently.

Derived nautical metrics shall be tappable and explainable.

5. Land Weather
Daily

Land Daily shall exist as a core domain.

Land Daily shall use Day | Night lenses.

Dew point shall always be visible.

Day lens emphasis:

high temperature

conditions

wind & gusts

precip chance

UV (if available)

dew point

Night lens emphasis:

low temperature

cloud cover %

wind lull vs gusts

humidity

dew point

fog/frost risk (derived)

Hourly

Land Hourly shall display at least 72 hours (or max supported).

Hourly rows shall include:

temperature

conditions

precip chance

wind & gusts

dew point

cloud cover %

6. Hyperlocal Provider Strategy (Land)

Land shall support a provider abstraction.

NOAA shall remain the baseline provider.

A hyperlocal provider may enhance select fields:

nowcasting

high-resolution precip timing

Enhanced data usage shall be clearly labeled and attributed.

OMNI wx shall not attempt to replicate RadarScope-class storm-chaser radar tooling.

7. Astro Weather (Including Mars)

The app shall include an Astro domain with night-first design.

Astro lenses shall include:

Tonight

Clearsky

Solar/Aurora

Planets

The app shall provide an Astro Quality Score that is explainable in-app.

Mars weather shall ship under Astro → Planets → Mars.

Mars weather shall:

prefer currently updating sources

label archived/intermittent sources clearly

disclose source, timestamp, and limitations

Aurora visibility shall be localized to the user’s location.

8. Extremes

The app shall include an Extremes domain.

Extremes shall identify unusual or hazardous conditions.

Extremes lenses shall include:

Today

7-Day

Records / Anomalies (future)

Extremes shall be calm and explanatory, not alarmist.

Extremes logic shall be documented and explainable.

9. Simple ↔ Nerdy Mode

The final product shall support Simple ↔ Nerdy density modes.

Modes shall not fork data ownership.

Nerdy mode shall expose derivations and advanced metrics.

Simple mode shall prioritize clarity and speed.

10. Engineering & Quality Gates

All feature work shall go through Pull Requests.

CI shall run on PRs and main:

lint

typecheck

tests (minimal initially)

Lint shall be enforced locally and in CI.

Screens shall remain thin; derivations belong in domain libraries.

Derived metrics shall be explainable.

11. Documentation

The repo shall maintain:

master requirements

decisions log

roadmap

data sources

runbook

Behavior changes shall update documentation in the same PR.

12. Platform & Cross-Cutting Requirements
Data freshness & staleness

The app shall show “as of” timestamps where appropriate.

The app shall distinguish live, cached, and last-known data.

Stale data shall be clearly labeled.

Refresh intervals shall be documented per domain.

Location

The app shall support device geolocation with user consent.

The app shall support manual/default location fallback.

Location usage shall be transparent and documented.

Errors & degradation

The app shall distinguish network errors, provider outages, and unsupported regions.

The app shall degrade gracefully with calm messaging.

Time semantics

Observed, current, and forecasted values shall be clearly distinguished.

Map interaction consistency

Map gestures shall behave consistently across lenses.

Lens switching shall not reset camera position unless intentional.

Selection state shall persist across lens switches where possible.

Accessibility (baseline)

Text and icons shall maintain readable contrast.

Critical meaning shall not rely on color alone.

Release discipline

Releases shall be versioned and tracked in a changelog.

A release smoke checklist shall be used before shipping.

13. Branding, UI System, Widgets, and In-Car
Branding & UI

The app shall have a documented visual system (colors, typography, spacing, surfaces).

The app shall maintain a calm, cinematic, polished aesthetic.

Reusable UI primitives shall be used to prevent styling drift.

The OMNI wx brand mark shall be the canonical logo.

Widgets

The app shall ship widgets on iOS and Android.

Widgets shall prioritize glanceable decision data.

Widgets shall respect platform update constraints.

Widgets shall support at least two sizes per platform at Beta.

CarPlay & Android Auto

The app shall support an in-car experience where platform policy allows.

In-car UX shall be minimal, safe, and glanceable.

If restricted, the app shall fall back to approved surfaces (voice, widgets, deep links).

End of Master Requirements