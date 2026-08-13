# Self-Hosted Radar Backend Contract

This file is retained as legacy architecture reference only.

The current radar direction is no longer a generic separate "self-hosted radar backend" first. The active path is:

- NOAA MRMS render/publish pipeline for owned US national reflectivity.
- Cloudflare R2 for bounded rendered tile storage.
- Cloudflare Worker for timeline, tile fallback, transparent empty-tile responses, and app-facing control.
- RainViewer fallback while MRMS is warming, stale, missing, or outside the US beta footprint.
- IEM/RIDGE remains the current Storm Scope/local NEXRAD fallback until a real local station renderer exists.

Use these current docs instead:

- `docs/radar-implementation-plan.md`
- `docs/mrms-owned-radar-plan.md`
- `docs/cloudflare-radar-storage-rollout.md`
- `docs/radar-phase-done-checklist.md`

Do not add new implementation work here unless we intentionally revive a separate radar service. The old endpoint sketches and RainViewer-backed D1 ingest notes were useful scaffolding, but they are not the current source of truth.
