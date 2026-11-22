# Radar Cost Safety Runbook

Last updated: November 22, 2026

Keep radar operations, compute, retention, and recovery bounded. Small R2 storage usage is not evidence of a safe operation rate. This document describes procedures; it does not assert that they have already been executed.

## Verified Gap

The October 9 audit found active GitHub MRMS and Level III publishing, despite older docs saying all automation was paused. `LEVEL3_SCHEDULE_ENABLED` was `true`; the repository had no `MRMS_SCHEDULE_ENABLED` override and the workflow defaults to enabled. The Level III watchdog currently bypasses the Level III schedule switch by dispatching an applied manual publisher run. Cloud Run/Scheduler state was not verified in that audit.

## November 22 Packed MRMS Pilot Evidence

A single manual MRMS composite pilot used the packed delivery path while every
Cloud Scheduler job stayed paused. It rendered fresh NOAA
`MergedReflectivityQCComposite` data for `20261122T180800` into 667 non-empty
tiles at zooms 3-8, then wrote one approximately 1.81 MB `.owxpack` artifact,
the latest manifest, and a rollback manifest. The publish was bounded to three
Class A writes under an explicit cap of four.

The production Worker then returned `200 image/png` from a real MRMS tile
request with `x-omni-radar-source: r2-mrms-pack`. This validates one compact
artifact and the Worker read path only. It does not validate a production
cadence, backfill, or Level III delivery.

The Cloud Run execution was marked failed after that successful publish because
the runner invoked a legacy cleanup script that expects tile-per-object frame
prefixes. Packed retention is already handled atomically by
`publish-radar-tile-pack.mjs`, so the runner now skips the incompatible legacy
cleanup for packed delivery. The corrected image must be deployed with writes
disabled and dry-run successfully before any second applied publish. Keep all
schedulers paused until the full re-enablement evidence below is complete.

## Emergency Stop

1. Set GitHub repository variables `MRMS_SCHEDULE_ENABLED=false` and `LEVEL3_SCHEDULE_ENABLED=false`.
2. Disable BOTH publisher workflows and BOTH recovery watchdog workflows in GitHub Actions. Disabling only the Level III schedule variable does not stop its watchdog. Disable any other workflow with an automatic write trigger found during inventory.
3. Inspect queued and running GitHub runs; cancel affected publisher/recovery/maintenance runs. Schedule changes do not cancel already-running work. Review manual proof/maintenance workflows separately before allowing any writes.
4. List Cloud Scheduler jobs in project `omniwx-radar-runner`, region `us-central1`; pause every radar schedule, including the old combined schedule and both regional schedules. Use the exact names returned by the inventory, not inferred job names.
5. For every Cloud Run radar job, set `RADAR_RUNNER_APPLY=false` and `RADAR_RUNNER_CONFIRM=disabled`. List and cancel active radar executions separately: changing the job template does not change executions already running.
6. Stop any local publisher processes. If an unidentified writer continues after containment, revoke its R2 write credential after identifying dependent services; serving fallback imagery should remain available.
7. Verify no new applied executions or write events across all providers. Compare time-stamped logs and Cloudflare operation metrics over more than one former schedule interval. Billing totals can be delayed; stale timeline data or one flat dashboard reading is not proof of shutdown.

Useful read-only inventories:

```powershell
gh workflow list --all
gh variable list
gh run list --status in_progress
gh run list --status queued
gcloud scheduler jobs list --project omniwx-radar-runner --location us-central1
gcloud run jobs list --project omniwx-radar-runner --region us-central1
gcloud run jobs executions list --project omniwx-radar-runner --region us-central1
```

Avoid printing secret values from job configs. Preserve app RainViewer/IEM fallback during containment. Do not delete R2 data as a substitute for stopping writers.

## Before Re-Enabling

1. Make every scheduled and recovery writer default to disabled unless explicitly enabled. Close the Level III watchdog bypass and block legacy production tile-per-object writes, including manually dispatched recovery.
2. Check the deployed container digest and permitted job environment. Production writes require `RADAR_RUNNER_DELIVERY=packed`, `RADAR_RUNNER_APPLY=true`, and `RADAR_RUNNER_CONFIRM=packed-radar-writes`; the operation cap must be explicit.
3. Estimate total operations and compute for all product/station combinations, cadence, backfills, retries, and overlap. `RADAR_RUNNER_MAX_CLASS_A_OPS` is passed to each packed publish; it is not a whole-job, daily, or account-wide cap. The publisher's conservative estimate currently also counts stale-pack deletions, so its label is not an exact billing measure.
4. Capture read-only timeline health and bounded storage evidence. The storage-health script lists R2 objects and can itself consume Class A operations; do not poll it frequently.
5. Prove one MRMS composite and one IWA N0B packed publish manually, with fresh source data, expected pack headers on real tiles, rollback, and bounded retention.
6. Require `--expected-delivery worker-r2-pack` in the health check. A generic green result or an old manual pack proof does not establish current delivery mode. Define product-specific freshness targets separately from the existing 360-minute beta failure tolerance.
7. Enable one schedule, observe real operation and runtime measurements, and verify no second writer replaces its manifest with `worker-r2`. Add scope only after a week of stable observations and an approved aggregate budget.

## Cost Interpretation

- Track Class A requests separately from storage bytes, Class B reads, Worker requests, and Cloud Run runtime. Budget notifications are not enforced spending caps.
- Writes and listings are Class A operations. `DeleteObject` is free under the current R2 pricing schedule; cleanup can still incur billable listings and carries data-loss risk. Do not describe all deletes as Class A charges. See [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/), checked October 9, 2026.
- Packed artifacts reduce per-tile writes, but do not eliminate read/compute costs, backfill multiplication, or unsafe parallel publishers.
- Keep rolling retention; increase only one of cadence, zoom, products, stations, or history at a time.

## Exit Evidence

Record timestamps, workflow/run IDs, deployed image digest, actual schedule states, frame ages, `tileDelivery`, real tile response headers, operation counts, runtime, and rollback outcome. Use [current-status.md](current-status.md) for the latest observed state and [cloud-run-radar-runner.md](cloud-run-radar-runner.md) for runner configuration.
