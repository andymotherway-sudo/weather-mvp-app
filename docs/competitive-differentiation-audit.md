# OMNIwx Competitive Differentiation And Feature Gap Audit

Last reviewed: November 14, 2026

## Executive Assessment

OMNIwx should not try to become a lower-cost copy of four specialist product
categories. Its strongest commercial position is a cross-domain decision app:
weather enthusiasts, observers, boaters, and pilots can move from a forecast to
official observations, warnings, radar, and explainable derived signals without
changing products.

The repository contains considerably more real capability than a typical beta,
but the evidence is uneven. Worker radar, marine, and aviation contracts have
automated coverage. Most screen behavior, map rendering, scientific labels, and
device workflows are only type-checked or manually exercised. A feature is not
classified as verified merely because code exists.

The best near-term Plus proposition is a small group of trusted decision tools:

1. Best Sky Tonight with bounded saved-site comparison.
2. Coherent Storm Scope inspection backed by truthful source health.
3. Forecast-versus-observation comparisons across land, marine, and aviation.
4. Marine Weather Window with official-warning precedence.
5. Supplemental Flight Weather Brief with clear non-EFB boundaries.

## Method And Status Definitions

This audit inspected screen components, hooks, Worker handlers, bindings, schema,
and tests. Documentation was used as supporting context, not implementation
proof.

- **Implemented and verified:** working code plus relevant automated contract or
  calculation coverage. Device rendering still needs release acceptance where
  noted.
- **Implemented but unverified:** working path exists, but meaningful automated
  or production/device evidence is absent.
- **Partially implemented:** useful parts exist, but the user outcome is
  incomplete or a required input is only a proxy.
- **Planned:** architecture or documentation exists without a complete user path.
- **Missing:** no meaningful implementation was found.

## Screen-By-Screen Competitive Feature Matrix

| OMNIwx surface | Actual capability found | Status | Specialist benchmark | Differentiation or gap |
| --- | --- | --- | --- | --- |
| Land | Current/daily forecast, official alerts, wxLab, NWS discussion/HWO, storm reports, SPC context, current NWS period, nearby station observation, and Forecast vs Reality model/observation deltas | Implemented but unverified | General weather apps usually show forecasts; specialist products emphasize one domain | Strong cross-domain foundation, but Forecast vs Reality is buried in wxLab and lacks reusable history/quality UI |
| Hourly | 72-hour forecast, Simple/wxLab modes, explainable metrics and responsive graphs | Implemented but unverified | Clear Outside emphasizes dense hourly astronomy; Windy emphasizes model maps | Good consumer depth; freshness and provider confidence should use one shared component |
| Almanac / Extremes | Historical observations, normals, records, forecast context, derived rankings | Implemented but unverified | Specialist competitors are not primarily climatology products | Potential Plus value, blocked by provider rights/token reliability and calculation tests |
| Maps - standard radar | Radar timeline, animation, stale detection, MRMS-auto strategy, RainViewer fallback, camera preservation work, source labels | Partially implemented | RadarScope offers operational Level II/III products; RadarOmega adds broad visualization and 3D | Broad experience exists, but owned publishers are paused/stale and device animation acceptance remains unresolved |
| Maps - Storm Scope | Mosaic/local modes, radar-site selection, product picker, Level III and IEM paths, dual-pol products, status/health lines, truthful unavailable states, legends | Partially implemented | RadarScope/RadarOmega provide mature radar interrogation and product depth | Coherent controls exist; missing a sampled-value inspector, verified owned freshness, and end-to-end product integrity evidence |
| Maps - other layers | Satellite/GeoColor, aviation, marine, fire, air quality, astro, boundaries and specialty overlays | Implemented but unverified | RadarOmega and Windy offer large overlay catalogs | Breadth is distinctive, but the launch value is reliability and decisions, not layer count |
| Space / astronomy | Solar/lunar events, twilight, moon phase, hourly cloud/wind/visibility, site darkness, aerosols, single-site best window and SkyScore | Partially implemented | Astrospheric offers dedicated seeing/transparency guidance, model comparison, favorites and alerts; Clear Outside offers dense hourly observing forecasts | Best window is real; multi-site comparison is missing and the current stability input is not true astronomical seeing |
| Astro map | Bounded SkyScore grid, hour offset, Bortle/site context, cloud layers, visibility, wind, humidity and point inspection | Implemented but unverified | Astrospheric provides weather-model astronomy overlays and spot checks | Useful map exists; confidence/completeness and dedicated seeing-model data are gaps |
| Nautical | Area/buoy search, NDBC observations, model fallback, tide predictions, official forecast text, wave mechanics, wind-wave interaction, source/freshness and model-observation deltas | Partially implemented | PredictWind and Windy emphasize model comparison, routing, waves and observations | Strong observation/official-text mix; no multi-hour go/no-go Weather Window and calculation coverage is absent |
| Aviation - airport | Nearest-airport selection, decoded/raw METAR and TAF, TAF trend, flight category, favorites and map handoff | Implemented but unverified | ForeFlight and Garmin Pilot integrate briefing, airport, route and navigation workflows | Valuable supplemental weather view; not an EFB and should remain explicit about that boundary |
| Aviation - route | Route sampling by time/altitude, METAR endpoint risk, SIGMET/CWA/PIREP matching, turbulence/icing counts, checkpoints and route map | Partially implemented | ForeFlight/Garmin provide recorded briefings, NOTAMs, route profiles and flight-planning integration | Good lightweight Flight Weather Brief foundation; missing NOTAMs, official briefing record, vertical profile, tests, and stronger time interpolation |
| Aviation map | METAR categories and AWC hazard overlays including SIGMET, Convective SIGMET, CWA, PIREP, icing/turbulence and altitude filtering | Implemented but unverified | ForeFlight/Garmin offer highly integrated route/profile interrogation | Broad situational awareness exists; operational validation and accessibility remain gaps |
| Profile / account | Local settings, plan display, centralized fail-closed entitlement catalog | Planned | Competitors have mature account, restore and subscription management | Architecture is sound, but no production identity or billing lifecycle is active |

## Competitive Boundaries

### RadarScope And RadarOmega

RadarScope's product value is mature Level II/III radar interrogation, warning
context, storm tracks, and dual-pol depth. RadarOmega adds broad overlays,
lightning, satellite/MRMS visualization, and 3D products. OMNIwx should compete
on an understandable storm workflow, truthful fallback health, and cross-domain
context, not on duplicating every product or 3D mode.

Official references: [RadarScope purchase and feature guide](https://radarscope.zendesk.com/hc/en-us/articles/8991808352914-How-to-Purchase),
[RadarOmega product site](https://www.radaromega.com/).

### Astrospheric And Clear Outside

Astrospheric exposes dedicated cloud, transparency, and seeing guidance plus
model-aware astronomy tools. Clear Outside's strength is a dense hourly observing
forecast. OMNIwx has a strong observing-window shell and site-context inputs, but
surface wind and humidity are only a stability proxy; they cannot be labeled as
astronomical seeing in arc-seconds or model-derived seeing.

Official references: [Astrospheric feature table](https://astrospheric.com/parts/Feature_Table),
[Astrospheric map documentation](https://www.astrospheric.com/DynamicContent/map),
[Clear Outside app](https://clearoutside.com/page/app?desktop=true).

### PredictWind And Windy

PredictWind and Windy are deep model/map products with model comparison, waves,
observations, alerts and routing. OMNIwx should not build marine routing. Its
distinctive opportunity is an explainable time window that combines official
warnings, buoy reality, model trend, waves, wind, tides and source freshness.

Official references: [PredictWind features](https://www.predictwind.com/features),
[Windy Premium features](https://www.windy.com/articles/23730),
[Windy API pricing](https://api.windy.com/map-forecast/pricing).

### ForeFlight And Garmin Pilot

ForeFlight and Garmin Pilot combine aviation weather with flight planning,
briefing records, NOTAMs and navigation. OMNIwx should remain a supplemental
weather brief, never imply dispatch or official EFB equivalence, and avoid a
full navigation system.

Official references: [ForeFlight weather](https://www.foreflight.com/products/foreflight-mobile/weather/),
[ForeFlight briefing records](https://support.foreflight.com/hc/en-us/articles/13175606540951-Does-ForeFlight-keep-a-record-of-preflight-briefings),
[Garmin Pilot graphical briefings](https://www.garmin.com/en-US/newsroom/press-release/aviation/garmin-pilot-adds-graphical-weather-briefings-and-navaid-notams/).

## Priority Opportunity Audit

### 1. Best Sky Tonight And Site Comparisons

**Current status: Partially implemented.** `app/lib/astro/locationAstro.ts`
builds an hourly score, best window and darkest window for one location. Space
and astro-map surfaces display the result. No saved-site ranking or batch
comparison workflow exists.

**Science finding:** `app/lib/astro/skyScore.ts` used surface wind, gusts and
humidity under the name `seeing`. That is an atmospheric stability proxy, not a
dedicated astronomical-seeing forecast. Missing cloud/wind inputs could also
produce overly favorable values. This audit adds explicit data quality,
`surfaceStability`, neutral missing-input behavior, and a compatibility alias.

**Can use existing data:** single-site ranking, darkness, moon, cloud layers,
visibility, humidity, wind, aerosols, Bortle and elevation.

**Needs normalization:** bounded multi-location request scheduling, one timezone
contract, confidence/completeness, tie-breaking, and saved-site comparison.

**Needs a new provider:** any claim of actual astronomical seeing, jet-stream
seeing, model ensemble, or arc-second resolution. Commercial terms and model
provenance must be approved before Plus promises.

**Acceptance criteria**

- Compare 2-10 saved sites for the same user-selected observing interval.
- Rank only sites with valid cloud data; mark partial inputs without silently
  treating them as clear or calm.
- Explain the top three drivers and show source/freshness at each site.
- Preserve each site's timezone while comparing a common real-world interval.
- Never label the surface-stability proxy as astronomical seeing.
- Unit-test missing clouds, missing wind, moon unknown, timezone boundaries, and
  deterministic ranking ties.

### 2. Owned MRMS / Level III And Storm Scope Inspection

**Current status: Partially implemented.** App and Worker contain MRMS and Level
III manifests, timelines, tiles, fallback selection, health copy, product
integrity logic, and substantial Worker tests. Current release documentation
records paused/stale owned timelines. Storm Scope has coherent controls and
legends but no numeric value probe under a map point.

**Can use existing data:** MRMS composite, selected Level III products, radar
site metadata, official warnings, timeline health and IEM fallback.

**Needs normalization:** common frame-health contract, product units/color
tables, source transitions, nearest timestamp, stale thresholds and unsupported
product states.

**Substantial infrastructure cost:** continuous Level II/III ingestion, decoded
value tiles, deep archives, 3D volumes or national high-resolution history would
increase compute, R2 operations/storage, egress and on-call burden.

**Acceptance criteria**

- Seven consecutive days of fresh owned timelines for the pilot footprint before
  advertising owned radar reliability.
- A selected product never renders another product as fallback.
- Source/product/station changes preserve camera and nearest valid timestamp.
- Stale or missing frames are visibly unavailable, never current-looking.
- Inspector returns value, unit, valid time, radar/product and quality flag from
  a documented data path; a color-pixel guess is not sufficient.
- Physical-device playback passes cold-open, scrub, zoom, product-switch and
  fallback tests without blank maps or visible first-frame flashes.

### 3. Cross-Domain Forecast Versus Observation

**Current status: Partially implemented.** Land has a real Forecast vs Reality
card using NWS observations and forecast/model deltas. Marine calculates buoy
versus model wave/wind deltas. Aviation compares station reports and route
products, but there is no shared comparison model or historical verification.

**Can use existing data:** NWS station observations, Open-Meteo forecast values,
NDBC buoy observations, marine model values, METAR/TAF and timestamps.

**Needs normalization:** variable names/units, valid-time matching, observation
age, provider attribution, tolerances, confidence and a reusable delta contract.

**Acceptance criteria**

- One shared model represents forecast, observation, delta, units, valid time,
  source and freshness.
- Comparisons match the nearest valid forecast time within a documented window.
- Stale observations are excluded from error language and shown as stale.
- Land, marine and aviation use domain-specific thresholds without calling a
  single sample model skill.
- Provider fallback and missing pairs produce an unavailable state, not zero.

### 4. Marine Weather Window

**Current status: Missing as a product; inputs are partially implemented.** The
Nautical screen already combines waves, wind/gust, buoys, tides, official marine
text and derived mechanics. It does not calculate a bounded multi-hour window.

**Correctness finding:** the old simple risk function treated missing waves and
light/missing wind as `Low` and said conditions were generally safe. Its `High`
branch also used an `OR` condition that could understate extreme single-variable
conditions. This audit replaces it with a reusable signal that takes the worst
available wind/gust or wave severity and returns `Unknown` when both are absent.
The wording no longer declares conditions safe for a vessel.

**Can use existing data:** NDBC observations, model wind/waves, official marine
forecast/warnings, tide predictions and source timestamps.

**Needs normalization:** hourly wave/wind/tide arrays, warning validity, vessel-
neutral thresholds, confidence, location/zone matching and window continuity.

**New provider only if expanded:** global high-resolution currents, proprietary
wave ensembles or routing-grade products may require paid data. Windy's published
production API price illustrates that map/model licensing can be material; it is
not a recommended dependency without a contract review.

**Acceptance criteria**

- User chooses a duration and conservative wind, gust and wave thresholds.
- Official warnings override a favorable derived window.
- Every hour shows source, valid time, freshness and missing inputs.
- A window is contiguous and does not bridge unavailable hours.
- No language says `safe`; output is a planning signal tied to user limits.
- Unit tests cover missing waves, missing wind, gust-only data, threshold edges,
  stale buoy data and an active official warning.

### 5. Supplemental Aviation Flight Weather Brief

**Current status: Partially implemented.** `app/(tabs)/aviation.tsx` already
resolves route endpoints, samples six checkpoints by estimated time, filters AWC
hazards by corridor/altitude/time, includes endpoint METAR risk and presents a
route summary/map. It is not an official briefing and does not retain a briefing
record.

**Can use existing data:** METAR, TAF, AWC SIGMET/Convective SIGMET/CWA/PIREP,
icing/turbulence products and forecast wind/cloud/visibility.

**Needs normalization:** route timing, vertical levels, forecast interpolation,
product update age, explicit partial-product states and a printable/shareable
supplemental summary.

**New provider or program needed:** authoritative NOTAM access, filed-route/EFB
integration, recorded official briefings and navigation data introduce licensing,
compliance and support obligations. They are outside the current product scope.

**Acceptance criteria**

- Brief header says supplemental and lists included/excluded products.
- Each checkpoint uses an explicit ETA and altitude with valid-time matching.
- Product outages are shown independently; an empty collection is not reported
  as no hazards unless the fetch succeeded.
- The worst concern links back to the source product and issue/valid times.
- Results are deterministic for fixed fixtures and tested for corridor, altitude,
  time, dateline and missing-product cases.
- No copy claims official briefing, flight release, navigation or go/no-go status.

## Data, Normalization, Provider And Cost Matrix

| Capability | Existing data sufficient | Better normalization required | New provider likely | Cost/licensing exposure |
| --- | --- | --- | --- | --- |
| Best Sky single site | Yes | Confidence and terminology | Only for true seeing/ensemble | Forecast commercial rights; low incremental runtime |
| Saved-site sky comparison | Mostly | Batch limits, timezone, ranking | No for MVP | Bounded forecast requests/cache growth |
| Storm Scope product workflow | Mostly | Health, units, inspection contract | No for current Level III | Publisher compute/R2/egress/support |
| True radar value inspector | Maybe, if decoded values are retained | Point/value lookup and quality | No, but pipeline work required | Moderate compute/storage; avoid image-color inference |
| Land forecast verification | Yes | Shared delta model and valid-time matching | No | Low incremental cost |
| Marine Weather Window | Mostly | Hourly arrays, warning precedence, confidence | No for US coastal MVP | Medium request/cache cost; NOAA/NDBC terms review |
| Global routing/current optimization | No | Major routing domain | Yes | High data licensing and infrastructure; out of scope |
| Supplemental Flight Weather Brief | Mostly | Time/altitude/product status | No for MVP | Moderate AWC traffic/cache/support |
| Official briefing/NOTAM/EFB | No | Compliance-grade workflow | Yes/program access | High licensing, compliance and support; out of scope |

Commercial gating already recorded in `docs/freemium-feature-matrix.md` remains
in force: Open-Meteo commercial use, RainViewer, IEM, map providers, export
rights, and source-specific attribution require manual approval before paid use.

## Proposed Shared UI And Data Components

1. `DataFreshnessBadge`: source timestamp, age, stale threshold and timezone.
2. `DataCompletenessNotice`: required/optional inputs and partial/unknown state.
3. `SourceProvenanceSheet`: provider, product, valid time, fallback and link.
4. `ForecastObservationDelta`: forecast, observation, delta, matching window and
   domain-specific interpretation.
5. `DecisionWindowTimeline`: contiguous acceptable/uncertain/unavailable hours
   with threshold explanations.
6. `LocationComparisonRail`: bounded saved-location ranking with common interval,
   local labels and deterministic ties.
7. `OfficialWarningBanner`: warning-first override used by land, marine and maps.
8. `ProductHealthState`: success, partial, stale, unavailable and fallback without
   conflating no data with no hazard.
9. `SupplementalUseNotice`: concise domain boundary for aviation and marine
   derived guidance.

These should be introduced as real reuse appears. Do not build a generic design
system abstraction before two working consumers need it.

## Low-Effort, High-Value Improvements

1. Show `surface stability proxy` anywhere the legacy `seeing` field reaches UI
   or external API documentation; retain the alias only for compatibility.
2. Add partial-input and freshness badges to SkyScore, Nautical summary and
   aviation route results.
3. Surface the existing marine model-versus-buoy delta in Simple mode when both
   values are available.
4. Add an explicit `Supplemental weather scan - not an official briefing` line
   above aviation route results.
5. Link every top-level derived conclusion to source/freshness details.
6. Reuse the existing Forecast vs Reality visual pattern for marine deltas.
7. Add a bounded two-site Best Sky comparison before building a global ranking.
8. Add calculation unit-test infrastructure for app domain helpers; app currently
   has lint/type checks but no conventional unit-test command.

## Prioritized 90-Day Roadmap

### Days 0-30: Trust And Measurement

- Finish unit coverage for SkyScore quality, marine signal/risk, valid-time
  matching and timezone edges.
- Add shared freshness, completeness and provenance components to the five
  priority surfaces.
- Add product-health analytics without precise location or raw provider payloads.
- Run the owned-radar seven-day health exercise only when separately approved;
  do not resume publishers as part of UI work.
- Validate competitor-facing terminology and provider rights with a written
  source register.
- Conduct five moderated tests focused on finding a window, understanding source
  age, and recovering from unavailable data.

### Days 31-60: Decision Products

- Ship bounded Best Sky Tonight comparisons for saved sites.
- Build Marine Weather Window MVP for US coastal areas with official-warning
  precedence.
- Extract the cross-domain ForecastObservationDelta model and use it in Land and
  Nautical.
- Add supplemental Flight Weather Brief product-status disclosure and fixture
  tests.
- Prototype a Storm Scope point inspector only if decoded value provenance is
  available without pixel-color inference.

### Days 61-90: Paid-Beta Evidence

- Complete device acceptance for maps/radar and accessibility at large fonts.
- Measure repeat use, decision-tool completion, provider fallback and premium
  interest with the privacy-safe analytics boundary.
- Resolve provider commercial rights and cost models at 100, 1,000 and 10,000
  active users.
- Gate only validated Plus decision tools through the centralized entitlement;
  keep free weather accountless.
- Run a small tester cohort before activating billing or making public Plus
  promises.

## Verification And Test Gaps

### Existing automated evidence

- Worker tests cover health/security headers, capability contracts, radar
  manifests, schedules, maintenance authorization, retention, marine routes,
  alert routes and account/subscription foundations.
- TypeScript and lint validate app structure.

### Missing automated evidence

- No app-level unit suite exercises SkyScore, marine risk, timezone math, route
  matching or screen state reducers.
- No automated physical-device map/radar animation test exists.
- No production freshness test can make paused owned publishers verified.
- Aviation route summaries and cross-domain forecast deltas lack fixtures.

## Changes Made During This Audit

- Added `app/lib/nautical/conditionSignal.ts` as a vessel-neutral, missing-data-
  safe wind/wave condition foundation.
- Updated Nautical Simple mode to include gust severity, expose `Unknown`, and
  remove declarations that conditions are safe.
- Updated wxLab risk and confidence so absent inputs are not normalized to calm
  or moderate-confidence data.
- Updated client and Worker SkyScore calculations to use a named surface-
  stability proxy, neutral missing-input behavior, explicit quality metadata,
  and a compatibility `seeing` alias.
- Added `surfaceStability01` to astro map/Worker contracts while retaining
  `seeing01` for existing clients.
- Clarified wxLearn terminology.

No production deploy, paid billing activation, radar publisher change, data
migration or external account operation was performed.
