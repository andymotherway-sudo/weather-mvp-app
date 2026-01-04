OMNI wx — Product & Architecture Decisions

Status: Locked
Purpose: Prevent decision drift and re-litigation
Change control: Update only via PR with rationale

D-001 Radar leads the experience

Radar is the primary trust anchor and discovery surface for OMNI wx.
Users should be able to access radar immediately and intuitively.

D-002 Domains + lenses are the core navigation pattern

OMNI wx uses:

a small number of primary domains (tabs), and

segmented lenses (tabs-within-tabs) for depth.

Lenses:

do not own data

do not reroute navigation by default

answer a specific question about the same underlying data

Max 3–4 lenses per domain.

D-003 Single canonical map canvas

OMNI wx uses one canonical map implementation:

one MapRenderer

one interaction model

one camera state

Different map “views” are implemented as lenses and overlays, not separate map engines or screens.

D-004 Marine lens unifies nautical zones and buoys

The Map → Marine lens is the canonical nautical map view.

Nautical polygons (zones) and buoy explorer pins coexist on the same map.

There are no competing full-screen nautical maps.

Nautical screens deep-link to Map → Marine lens when needed.

D-005 NOAA-first data philosophy

NOAA (NWS, NDBC, etc.) is the baseline data source for trust.

Non-NOAA providers may enhance data, not silently replace it.

All enhancements must be clearly attributed.

Data freshness (“as of”) is part of the trust contract.

D-006 Do not compete with RadarScope-class storm chaser tools

OMNI wx explicitly does not attempt to replicate professional storm-chaser radar tooling (e.g., RadarScope).

OMNI wx differentiates on:

calm, cinematic UX

integrated Land / Sea / Sky / Extremes domains

explainable insights

accessibility to non-experts

D-007 Explainability is a product feature

Derived metrics (scores, risks, insights) must be:

tappable

explainable in-app

based on documented logic

“Why?” is as important as “What?”

D-008 MVP means sequencing, not exclusion

“MVP” is used to sequence delivery, not to permanently cut scope.

All major domains (Land, Nautical, Astro, Extremes, Widgets, In-Car) remain part of the final product vision, even if phased.

D-009 Mars weather is part of Astro

Mars weather ships under:
Astro → Planets → Mars

Live sources preferred when available

Archived/intermittent sources allowed if clearly labeled

Source, timestamp, and limitations must be disclosed

D-010 Widgets are a product pillar

Home-screen widgets are not an afterthought.

iOS and Android widgets are required

Widgets prioritize glanceable decision data

Widgets deep-link back into the app

D-011 In-car experience is phased and policy-aware

OMNI wx supports Apple CarPlay and Android Auto where platform policy allows.

In-car UX is minimal, safe, and glanceable

If full apps are restricted, OMNI wx falls back to approved surfaces:

widgets

voice

notifications

deep links to the phone

D-012 Calm over alarmist

Especially for Extremes:

Messaging must be calm and explanatory

Avoid fear-driven UX

Context and confidence matter

D-013 Engineering discipline is non-negotiable

All feature work goes through PRs

CI (lint, typecheck, tests) must pass

Screens remain thin; domain libs own logic

Docs are updated alongside behavior changes

D-014 Realistic delivery over aspirational timelines

Delivery is measured by testable user cohorts, not feature checklists.

Locked milestones:

Private Alpha (3–5 users): end of March

Closed Beta (~100 users): end of June

Public Release: December 31, 2026

D-015 Branding and UI consistency matter

OMNI wx maintains:

a documented visual system

reusable UI primitives

a calm, cinematic, polished aesthetic

Branding is treated as a first-class system, not late polish.

End of Decisions Log