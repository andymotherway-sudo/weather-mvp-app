# Radar Cost Safety Runbook

Last updated: September 11, 2026

This runbook is the practical safety layer for owned radar. It is designed for the current zero/near-zero-cost beta posture: keep radar rolling, bounded, and recoverable without building an archive or accidentally creating a large storage/write bill.

## Normal Posture

- MRMS scheduled publisher: enabled unless `MRMS_SCHEDULE_ENABLED=false`.
- Level III scheduled publisher: enabled only when `LEVEL3_SCHEDULE_ENABLED=true`.
- MRMS scheduled zoom ceiling: z8.
- Level III pilot zoom ceiling: z10 for the small Phase 1 site/product bundle.
- R2 retention: rolling recent frames only.
- D1: not in the radar hot path.
- RainViewer/IEM: remain fallback while owned radar is beta.

## Emergency Stop

Use this if R2 storage, object writes, GitHub workflow noise, or unexpected radar behavior starts climbing.

1. In GitHub repository variables, set `MRMS_SCHEDULE_ENABLED=false`.
2. In GitHub repository variables, set `LEVEL3_SCHEDULE_ENABLED=false`.
3. Leave the app fallbacks enabled so users continue to get RainViewer/IEM where available.
4. Run GitHub Actions -> `Radar health report` with `fail_on_required_stale=false` to confirm the live timelines are stale/paused rather than still publishing.
5. Run storage maintenance only if needed; do not start new publish cycles until object counts and retained prefixes are understood.

Manual publisher workflows still exist after the stop. That is intentional: we can recover with a deliberate manual run without re-enabling scheduled writes.

## Before Re-Enabling

- Run `Radar health report` to capture the current live state.
- Check Cloudflare R2 bucket size and object counts.
- Confirm no publisher runs are queued or in progress.
- Confirm the intended scheduled scope:
  - MRMS: z3-z8, 12 retained frames, composite reflectivity only.
  - Level III: approved sites/products only, 12 retained frames, required products strict.
- Re-enable one scheduler at a time.

## Kill Switches And Scope Controls

- `MRMS_SCHEDULE_ENABLED=false`: stops scheduled MRMS publishing while keeping manual MRMS runs available.
- `LEVEL3_SCHEDULE_ENABLED=false`: stops scheduled Level III publishing while keeping manual Level III runs available.
- `LEVEL3_SCHEDULE_SITES`: limits scheduled Level III station scope.
- `LEVEL3_SCHEDULE_PRODUCTS`: limits scheduled Level III product scope.
- `LEVEL3_REQUIRED_PRODUCTS`: controls which Level III products must be fresh for watchdog recovery.
- `LEVEL3_MAX_DELETES`: caps per-product cleanup deletes.

## What Not To Do

- Do not delete R2 prefixes manually unless the prefix and retention impact are clear.
- Do not raise z10, retention, station count, or product count in the same change.
- Do not disable RainViewer/IEM fallback during owned-radar instability.
- Do not put radar object manifests or tile inventories into D1.

## Recovery Order

1. Read-only health check.
2. Storage status/maintenance check.
3. Single manual MRMS or Level III publish with narrow scope.
4. Confirm app fallback/source labels.
5. Re-enable schedule only after the manual path is boring.
