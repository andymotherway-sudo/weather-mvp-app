# OMNIwx Project Gantt

Last updated: September 11, 2026

This is the planning view for where OMNIwx is now and where it is going. It is not a promise of exact ship dates; it is the working execution map for getting from internal testing to a credible paid-customer beta without taking on runaway cost or half-finished infrastructure.

## Timeline

```mermaid
gantt
    title OMNIwx Paid-Customer Readiness Roadmap
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Radar Stability
    Owned MRMS beta cadence hardening         :active, mrms-cadence, 2026-09-05, 2026-09-22
    Owned Level III Phase 1 hardening         :active, level3-phase1, 2026-09-05, 2026-09-24
    z10 production safety decision            :crit, z10-gate, 2026-09-15, 2026-09-28
    MRMS product expansion                    :mrms-products, 2026-09-18, 2026-10-12
    Local Level III product expansion         :level3-products, 2026-09-18, 2026-10-18

    section Cost And Operations
    Cost safety and billing blast-radius gate :crit, cost-gate, 2026-09-11, 2026-09-27
    Budget alerts and emergency kill switches :crit, kill-switches, 2026-09-11, 2026-09-24
    Radar storage and request trend checks    :active, radar-measure, 2026-09-11, 2026-10-06
    Dedicated runner design                   :runner-design, 2026-10-01, 2026-10-18
    Dedicated runner pilot                    :runner-pilot, 2026-10-19, 2026-11-09

    section App Experience
    Storm Scope compact HUD and bottom sheet  :storm-ui, 2026-09-14, 2026-10-06
    Radar playback smoothness pass            :playback, 2026-09-14, 2026-10-04
    Storm reports readable drill-in           :reports, 2026-09-12, 2026-09-22
    Brand guide and shared UI primitives      :brand, 2026-09-12, 2026-10-20
    Space page refresh                        :space, 2026-10-01, 2026-10-24

    section Trust Foundation
    Security foundation and secrets audit     :crit, security, 2026-09-11, 2026-10-06
    D1 account schema readiness               :d1, 2026-09-25, 2026-10-20
    Error boundaries and reset paths          :errors, 2026-09-18, 2026-10-06
    Professional readiness deep-clean plan    :cleanup-plan, 2026-09-11, 2026-09-20
    Deep cleanup execution                    :cleanup, 2026-09-21, 2026-10-24

    section Paid Beta Prep
    Account provider integration             :accounts, 2026-10-21, 2026-11-12
    Cross-device sync                         :sync, 2026-11-05, 2026-11-24
    Paid entitlement design                   :entitlements, 2026-11-01, 2026-11-16
    RevenueCat and store sandbox              :payments, 2026-11-17, 2026-12-08
    Closed beta paid-readiness validation     :paid-beta, 2026-12-01, 2026-12-20
    Paid launch go/no-go                      :milestone, launch-gate, 2026-12-20, 0d
```

## Current Position

- We are in the radar stability, cost safety, and trust-foundation window.
- MRMS and owned Level III are real now, but still beta infrastructure until freshness, fallback, storage, and playback stay boring without manual rescue.
- RainViewer and IEM should remain fallbacks until owned MRMS plus owned Level III are visibly better for the beta footprint.
- D1 exists for future user/account data, but it should not become a radar hot path.
- Paid subscriptions should wait until security, account identity, D1 ownership rules, and cost controls are in place.

## Gates

- Cost gate: budget alerts, emergency disable switches, bounded radar scope, measured storage/request trends, and a rollback path exist before a dedicated runner or paid customer promise.
- Radar gate: MRMS and Level III stay fresh for several days, fallback is honest, storage remains rolling, and z10 cost is proven before z10 becomes routine production.
- Security gate: secrets audit, safe Worker errors, request IDs, validation, and future-auth placeholders are in place before accounts or payments.
- Paid gate: accounts and cross-device sync work before RevenueCat is treated as production capability.

## Near-Term Focus

1. Finish the cost-safety gate and document the emergency rollback steps.
2. Keep hardening MRMS and Level III cadence while measuring storage and requests.
3. Improve Storm Scope so radar feels like instrumentation over the map, not a dashboard covering it.
4. Add readable storm-report drill-in because that is user-facing value now.
5. Start the security and professional-readiness cleanup in small, testable slices.
