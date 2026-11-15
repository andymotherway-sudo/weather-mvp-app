# OMNIwx Documentation

This directory is organized by decision, not by when a note was written. Start
here instead of treating every planning document as current.

## Source Of Truth

| Need | Canonical document | Use it for |
| --- | --- | --- |
| What is true today | [current-status.md](current-status.md) | Dated operational facts, active blockers, and the next decision. |
| What to do next | [production-readiness-plan.md](production-readiness-plan.md) | The gate-based path from internal testing to a trustworthy beta. |
| How to ship | [full-release-path.md](full-release-path.md) | The required app and backend release procedure. Do not substitute a build for a release. |
| What to test in Play | [google-play-closed-testing-release-notes.md](google-play-closed-testing-release-notes.md) | Tester-facing notes and acceptance observations. |
| How radar is designed | [radar-architecture.md](radar-architecture.md) | Product boundaries, sources, fallbacks, and target architecture. |
| How radar changes are delivered | [radar-implementation-plan.md](radar-implementation-plan.md) | Bounded engineering phases and migration work. |
| How to stop or safely restart radar writes | [radar-cost-safety-runbook.md](radar-cost-safety-runbook.md) | Incident containment and re-enablement evidence. |
| How growth is controlled | [scaling-and-cost-controls.md](scaling-and-cost-controls.md) | Request serving, GeoColor, Cloud Run, R2, alerts, and capacity changes. |
| How accounts and paid access will work | [paid-user-architecture.md](paid-user-architecture.md) | Proposed freemium catalog, profiles, provider responsibilities, billing lifecycle, and launch gates. |
| Whether the product can launch commercially | [commercial-readiness.md](commercial-readiness.md) | Evidence-based commercial, provider, cost, reliability, identity, and billing audit. |
| Which features belong in Free or Plus | [freemium-feature-matrix.md](freemium-feature-matrix.md) | Provisional feature, provider, cost, rights, and release-gate matrix. |
| Where OMNIwx can differentiate | [competitive-differentiation-audit.md](competitive-differentiation-audit.md) | Screen-level implementation audit, competitor boundaries, five decision-product opportunities, acceptance criteria, shared foundations, and 90-day roadmap. |
| How commercial work is sequenced | [launch-roadmap.md](launch-roadmap.md) | Safe phases from the free beta through a bounded paid beta. |
| How the app is built | [app-architecture.md](app-architecture.md) | Feature ownership, data flow, and runtime boundaries. |
| How the files relate | [file-relationship-architecture.md](file-relationship-architecture.md) | Onboarding and dependency navigation. |

## Supporting References

- [cloud-run-radar-runner.md](cloud-run-radar-runner.md): Cloud Run runner setup and job-specific procedures.
- [cloudflare-radar-storage-rollout.md](cloudflare-radar-storage-rollout.md): R2 storage and delivery cutover details.
- [mrms-owned-radar-plan.md](mrms-owned-radar-plan.md): MRMS experiments and historical implementation evidence.
- [radar-phase-done-checklist.md](radar-phase-done-checklist.md): Radar acceptance gates.
- [self-hosted-radar-backend-contract.md](self-hosted-radar-backend-contract.md): Legacy reference only; not an implementation plan.
- [omniwx-feature-guide.md](omniwx-feature-guide.md): Product feature reference.
- [how-omniwx-works.md](how-omniwx-works.md) and [omniwx-training-guide.md](omniwx-training-guide.md): Builder/onboarding guides.
- [brand-style-guide.md](brand-style-guide.md): Brand and UI-system direction.
- [paid-user-architecture.md](paid-user-architecture.md) and [privacy-policy.md](privacy-policy.md): Commercial and policy foundations.
- [freemium-architecture.md](freemium-architecture.md): Centralized client and server entitlement design.
- [analytics-event-catalog.md](analytics-event-catalog.md): Privacy-safe event naming and allowed properties.
- [launch-blockers.md](launch-blockers.md): Evidence still required before public, account, and paid launches.
- [subscription-support-runbook.md](subscription-support-runbook.md): Customer-support preparation for future purchases and account deletion.
- [marketing/](marketing/): Unpublished strategy, first-tester plan, content calendar, and landing-page source.

## Document Rules

1. A status statement needs a verification date and evidence source. If it is
   not verified, label it as a plan or assumption.
2. A procedure belongs in a runbook; a decision and its sequence belong in a
   plan; a current fact belongs in `current-status.md`.
3. Release instructions belong only in `full-release-path.md`. Link to it
   instead of copying steps into feature plans.
4. When a plan is replaced, make the old file a short redirect rather than
   leaving two competing sources of truth.
5. Keep operational secrets, access tokens, screenshots with credentials, and
   personal scratch notes out of tracked documentation.

## Maintenance Cadence

- Update `current-status.md` after a production change, incident, or release
  acceptance decision.
- Update the production plan only when a gate, dependency, or priority changes.
- Update the release path when the build, signing, deployment, or Play process
  changes, then exercise the changed step before relying on it.
