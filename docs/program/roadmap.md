# OMNI wx – Program Roadmap (Rebaselined)

This roadmap prioritizes testable delivery over feature completeness.
Radar + Map lead the experience at all stages.

---

## Milestone A — Private Alpha (3–5 users)
**Target:** End of March

### Goal
Deliver a stable, trustworthy core experience that real users can use daily.

### Scope (Must Have)
#### Map & Radar
- Single canonical Map tab
- Radar lens working reliably
- Basic time navigation (scrubber or step)
- Stable performance (no persistent jitter, blur, or crashes)
- Location awareness (device or manual fallback)

#### Nautical
- Map → Marine lens with:
  - nautical polygons
  - buoy pins (clustered if needed)
- Buoy selection → canonical buoy detail screen
- Core buoy metrics correct and attributed
- NOAA timestamps (“as of”) visible

#### Land Weather (Minimal but Real)
- Daily forecast
- Key metrics:
  - temperature
  - conditions
  - wind & gusts
  - dew point (always visible)
- Source attribution + timestamp

#### Quality & Ops
- CI passing (lint + typecheck)
- Graceful error/loading states
- Requirements & decisions tracked in git

### Explicitly Out of Scope (Alpha)
- Extremes engine
- Astro domain (beyond placeholder)
- Hyperlocal provider
- Simple ↔ Nerdy mode
- Advanced animations

---

## Milestone B — Closed Beta (~100 users)
**Target:** End of June

### Goal
Validate usability, performance at scale, and feature usefulness.

### Additions
#### Land Weather
- Daily + Hourly (72h)
- Day | Night lenses
- Static condition-based theming
- Improved stale-data handling

#### Nautical
- Marine lens polish
- Explainable derived rows (“why?”)
- Tides lens (if feasible)

#### Astro (Entry)
- Astro domain introduced
- Tonight lens
- Clearsky (simplified)
- Mars weather (Curiosity)
- Astro Quality Score v0 (explainable, conservative)

#### Extremes (Beta)
- Today lens only
- Conservative thresholds
- Calm, explanatory cards
- Clearly labeled “beta”

#### Ops
- Invite flow
- Feedback capture
- Crash/performance telemetry (lightweight)

---

## Milestone C — Public Release
**Target:** December 31, 2026

### Goal
Ship a polished, defensible v1 that is explainable and stable at scale.

### Focus Areas
- Radar/map polish and performance tuning
- Hyperlocal provider integration (optional, gated)
- Simple ↔ Nerdy mode
- Mature Extremes (7-day, better anomaly logic)
- Astro polish (aurora, clearsky refinement, Mars education)
- Onboarding, help, and trust messaging
- App Store readiness

---

## Definition of Done (All Milestones)
- Stable performance
- Clear data attribution and freshness
- Explainable derived insights
- Docs updated alongside code
