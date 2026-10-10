# OMNIwx Remediation Plan

Last reviewed: October 10, 2026

## Purpose

This is the maintained remediation register for the October 10 project review. It distinguishes source-proven issues from infrastructure and device checks that require separate evidence. A checkbox means the source change is complete; it does not mean production deployment or device acceptance is complete.

## Status Terms

- `Planned`: scoped but not yet changed.
- `Implemented`: source changed and local checks passed; deployment or device evidence may still be needed.
- `Blocked`: requires credentials, cloud configuration, a provider decision, or a physical device/head unit.
- `Deferred`: intentionally outside the current beta/release scope.

## Phase 0 - Immediate Security And Release Controls

| ID | Status | Work | Acceptance evidence |
| --- | --- | --- | --- |
| F01 | Implemented | Keep environment files, signing material, credentials, and private documentation out of EAS archives and Git. | Inspect a generated EAS archive before any cloud build; rotate credentials if prior archive exposure is established. |
| F02 | Implemented | Require a Worker secret in `Authorization: Bearer` for every destructive radar-maintenance route, in addition to its feature flag and confirmation phrase. | With a maintenance flag enabled, unauthenticated requests return `401`; authorized dry runs work only after `RADAR_MAINTENANCE_TOKEN` is set as a Worker secret. |
| F03 | Implemented | Restrict release Android Auto hosts to Android's maintained signed-host allowlist; preserve open hosts only for debuggable builds. | Release build accepts Android Auto/Automotive OS and rejects an untrusted host. |
| F04 | Planned | Add distributed, per-route rate limits and explicit cache policy for public provider proxies. | Cloudflare rate-limit/WAF rule or bound service is active; bounded-load test shows 429 behavior and cache reuse. |
| F05 | Planned | Triage and update dependency advisories without forcing an incompatible Expo downgrade. | Fresh app and Worker audits, dependency reachability notes, lint/types/tests/native build. |
| F07 | Implemented | Select the production Worker for release widgets and Android Auto; retain development host only in debuggable builds. | Inspect release traffic on a device and confirm native surfaces use the production host. |
| F08 | Planned | Gate notification settings on verified backend delivery capability. | Registration and delivery are tested end-to-end, or settings explicitly say delivery is unavailable. |

## Phase 1 - Radar Integrity Before Automation Resumes

All radar publishing schedules remain disabled until this phase is accepted.

| ID | Status | Work | Acceptance evidence |
| --- | --- | --- | --- |
| F06 | Planned | Put packed-delivery, explicit-apply, budget, and environment checks in the shared writer used by every legacy and new entry point. | Manual, GitHub, Cloud Run, and local invocations all reject legacy production writes. |
| F09 | Planned | Differentiate intentional sparse tiles from missing packs/indexes and upstream failure. | Missing pack returns unavailable, not a cacheable transparent tile; sparse tile remains valid. |
| F10 | Planned | Preserve usable mixed legacy/packed history or reset the timeline deliberately during migration. | Every advertised frame resolves during legacy-to-packed fixture migration. |
| F11 | Planned | Ensure cleanup retains every object referenced by current and rollback manifests. | Rollback fixture restores all referenced frames after cleanup. |
| F12 | Planned | Make outage recovery resume beyond the current packed-publisher cap. | Expired-history restart recovers in bounded batches. |
| F13 | Planned | Define rollback-manifest retention and orphan cleanup. | Measured R2 object, storage, Class A, and Class B bounds are within the approved budget. |
| F14-F15 | Planned | Cache manifests/packs and normalize request keys; coordinate stale refreshes. | Load test confirms lower R2 reads and no duplicate refresh work. |

## Phase 2 - Correctness And Product Honesty

| ID | Status | Work | Acceptance evidence |
| --- | --- | --- |
| F16 | Planned | Fix pressure trend instant/time-zone comparison and add rising/falling/DST fixtures. | Unit fixtures show correct trend across forecast time zones. |
| F17 | Planned | Normalize Android Auto location source and carry timestamp/accuracy. | Moving-device Android Auto test refreshes stale GPS rather than using old mirrored coordinates. |
| F18 | Planned | Recover from AsyncStorage failures during boot without trapping the splash screen. | Fault-injection test reaches a retryable screen. |
| F19 | Planned | Validate required coordinates/ranges and make unknown routes return 404/405. | Route contract tests cover missing parameters, invalid ranges, unknown paths, and methods. |
| F20 | Planned | Choose a reproducible native-project strategy: fully tracked Android project or deterministic generation. | Clean disposable checkout completes the documented Android build. |
| F21 | Planned | Add required CI checks and environment-correct deployment smoke tests. | PR gate covers lint/types/Worker tests; smoke verifies the deployed revision and data response. |

## Phase 3 - Documentation, Operations, And Launch Readiness

| ID | Status | Work | Acceptance evidence |
| --- | --- | --- |
| F22 | In progress | Reconcile current-state documents with `1.1.262` / `10279`, scheduler containment, deployed-versus-device evidence, and rate-limit reality. | One dated status source links to the release record and operational evidence; historical statements are dated. |
| Architecture | Planned | Extract Worker/map/land seams gradually with provider fixtures and normalized weather/freshness contracts. | Small behavior-preserving modules with tests; no wholesale rewrite. |
| Supply chain | Planned | Pin container/action inputs and produce dependency/license inventory. | Reproducible runner image and release inventory. |
| Providers | Blocked | Maintain provider quota/rights/attribution register and approve commercial use before monetization. | Reviewed contracts and production plan recorded. |
| Device quality | Blocked | Run the release matrix for font/display scaling, TalkBack, offline, location movement, widgets, and Android Auto. | Dated device matrix with pass/fail evidence. |
| Paid launch | Deferred | Keep accounts and entitlements closed until ownership, deletion, recovery, subscriptions, privacy, and support are implemented. | End-to-end acceptance evidence. |

## Current Implementation Notes

- The Worker secret name for radar maintenance is `RADAR_MAINTENANCE_TOKEN`. It must be stored with `wrangler secret put`, never in `wrangler.jsonc`, `.env`, a URL, or source code.
- Radar maintenance remains disabled by existing feature flags. A token does not enable it.
- Rate limiting is intentionally still marked planned because process-local counters are not a safe substitute for distributed Cloudflare enforcement.
- Native-host validation and production-host routing require a release-device/Android Auto acceptance test before their rows can be considered fully closed.

## Evidence Policy

For every row, record the date, commit, environment, command or run ID, and whether the evidence is source, build, deployment, or physical-device validation. Do not mark a feature complete solely because a configuration file exists or a build succeeds.
