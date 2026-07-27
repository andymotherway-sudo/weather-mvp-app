# Radar Phase Done Checklist

This document defines what "done" means for the current OMNIwx radar phase.

The goal of this phase is not to become a full national radar data company. The goal is to ship a reliable, owned, production-usable radar foundation that feels strong to users and stays within current cost constraints.

## Success Statement

This radar phase is done when OMNIwx can deliver a stable owned radar experience for the supported products and views, with bounded storage, explicit fallback behavior, clean release practices, and no obvious fragility in normal user flows.

For phase 1, that owned local radar footprint must also include Minnesota coverage, not just the original starter markets.

## Must Be True Before Radar Is Done

### 1. Local Radar Reliability

- Phoenix-area local reflectivity renders reliably in production builds.
- Opening Storm Scope does not land users on a blank radar state during normal use.
- Radar remains visible when switching between supported local history ranges.
- Radar controls remain visible and usable during normal local radar interaction.
- If upstream history is weak or missing, the app falls back gracefully instead of looking broken.

### 2. Owned Radar Path

- The worker is the primary app-facing radar API.
- Owned radar publish/storage is active for the supported local reflectivity paths.
- The app is not accidentally depending on direct third-party client calls for the supported owned path.
- Fallback behavior is intentional, documented, and easy to explain.
- The owned local hot-site roster includes Minnesota through `MPX` and `DLH`.

### 3. History and Timeline

- Supported local history ranges work consistently for the owned path.
- Timeline/frame metadata stays coherent with the imagery users see.
- Radar playback does not routinely present blank or unusable frames.
- The newest usable frame is favored when history is thin or degraded.

### 4. Product Clarity

- Supported radar products are clearly defined and labeled correctly in the UI.
- Reflectivity defaults align with the owned radar path where owned coverage exists, with explicit fallback elsewhere.
- Unsupported products are either hidden, disabled, or clearly marked as unavailable.
- Legends and product descriptions match what the layer is actually showing.

### 5. Storage and Cost Control

- Radar storage is rolling and bounded.
- Retention is defined for the current owned radar scope.
- R2 growth does not increase without limit during normal ingest/publish operation.
- Current radar architecture remains effectively near-zero cost at today's scale.
- Expanding the owned hot-site roster, including Minnesota, does not break the current bounded-storage posture.

### 6. Production Safety

- Production Android builds point to the production worker/backend by build-time configuration.
- The release path for radar changes is documented and repeatable.
- We can verify backend status without guessing whether ingest/publish is healthy.
- Radar changes do not regress core map behavior or Astro map behavior.

### 7. User Experience Quality

- Local radar feels dependable enough to ship to testers without caveats like "it might be blank."
- National-to-local handoff feels intentional, not jarring or broken.
- Radar and related overlays are aligned well enough that motion does not feel obviously wrong.
- Error states are understandable and do not dump raw backend noise into the UI.

## Nice To Have But Not Required For This Phase

- Better smoothing or cleanup for noisy NEXRAD visuals.
- More local radar markets beyond the current bounded owned footprint.
- More refined product legends and education content.
- More graceful visual transitions between radar and satellite layers.
- Better diagnostics for internal testing and support.
- Additional local radar history depth if it stays bounded and cheap.

## Out Of Scope For This Phase

- Full nationwide owned hyperlocal radar for every station.
- Dual-polarization products such as `CC` and `ZDR`.
- `VIL` support.
- A giant radar archive.
- Redis or a more complex multi-layer cache stack unless scaling pressure truly requires it.
- Replacing every upstream weather data source across the whole app.
- Building a full commercial radar business operation before payments are even enabled.

## Exit Gates

Radar phase work should be treated as done only when all four gates below are satisfied.

### Gate 1. Local Reflectivity Is Stable

- Phoenix/Mesa local reflectivity works in the released app.
- No reproducible blank-open local radar failure remains in the core path.
- Saved preferences do not trap upgraded users in a broken local product state.

### Gate 2. Owned Publish And Retention Are Stable

- Owned local radar publish is working for the supported reflectivity products (`N0Q` and `N0B`).
- Rolling retention and bounded storage are confirmed.
- Fallback rules are understood and not accidental.
- Minnesota sites `MPX` and `DLH` are present in the live owned local roster.

### Gate 3. Supported Products Match Reality

- UI product choices match real backend/source capability.
- Reflectivity defaults, labels, and legends are honest and consistent.
- Broader fallback radar still works in markets that are outside the owned hot-site roster.
- Unsupported products are not presented as if they work.

### Gate 4. Release And Operations Are Clean

- The full release path has been exercised for the radar changes.
- Production builds are verified against the production backend.
- Basic backend-health visibility exists for ingest/publish/storage posture.
- The shipped tester experience feels production-usable.

## Working Rule

If a radar behavior only works when explained with caveats, hidden knowledge, or "sometimes the source is weird," it is not done yet.
