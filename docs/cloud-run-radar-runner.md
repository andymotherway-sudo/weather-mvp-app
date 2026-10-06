# Cloud Run Radar Runner

This runbook sets up a dedicated, bounded radar runner for OMNIwx. It is intended to replace GitHub Actions as the production radar clock once cost guardrails are in place.

## Goal

- Run owned MRMS and NOAA Level III refreshes on a predictable cadence.
- Keep Cloudflare R2 storage rolling, not archival.
- Preserve app fallback behavior while the runner proves boring freshness.
- Fail closed unless production writes are explicitly confirmed.

## Architecture

```text
Cloud Scheduler
  -> Cloud Run Job: omniwx-radar-mrms-runner
    -> NOAA MRMS
    -> render national tiles
    -> upload to Cloudflare R2 through S3-compatible credentials
    -> cleanup retained MRMS prefixes

Cloud Scheduler
  -> Cloud Run Job: omniwx-radar-level3-runner
    -> NOAA NEXRAD Level III
    -> render local station/product tiles
    -> upload to Cloudflare R2 through S3-compatible credentials
    -> cleanup retained Level III prefixes

Cloudflare Worker / app
  -> read R2 manifests and tiles through existing Worker routes
```

## Live Production Posture

As of September 24, 2026, all radar schedules are paused and Cloud Run radar writes are disabled. Production previously used split jobs rather than the original combined job:

- `omniwx-radar-mrms-runner`
  - Scheduler: `omniwx-radar-mrms-10min`
  - Cadence: every 10 minutes
  - Current conservative scope: `MergedReflectivityQCComposite`, z3-z8, 12 retained frames
  - Beta package scope when deliberately enabled: `MergedReflectivityQCComposite`, `ReflectivityAtLowestAltitude`, `EchoTop_18`, `PrecipRate`, z3-z8, rolling retention
- `omniwx-radar-level3-runner`
  - Scheduler: `omniwx-radar-level3-15min`
  - Cadence: `:02`, `:17`, `:32`, and `:47`
  - Current conservative scope: `IWA`, `MPX`, `DLH` x `N0B`, `N0S`, `EET`, z7-z10, 12 retained frames
  - Beta package scope when deliberately enabled: `IWA`, `MPX`, `DLH` x `N0B`, `N0S`, `EET`, `N0C`, `N0X`, `DVL`, `N0H`, z7-z10, rolling retention
- `omniwx-radar-level3-southwest-runner`
  - Scheduler: `omniwx-radar-level3-southwest-15min`
  - Cadence: `:07`, `:22`, `:37`, and `:52`
  - Scope: `FSX`, `YUX`, `EMX` x `N0B`, `N0S`, `EET`, `N0C`, `N0X`, `DVL`, `N0H`, z7-z10, rolling retention
- `omniwx-radar-level3-midwest-runner`
  - Scheduler: `omniwx-radar-level3-midwest-15min`
  - Cadence: `:12`, `:27`, `:42`, and `:57`
  - Scope: `FSD`, `DMX`, `ARX` x `N0B`, `N0S`, `EET`, `N0C`, `N0X`, `DVL`, `N0H`, z7-z10, rolling retention
- `omniwx-radar-runner-10min`
  - Original combined schedule
  - State: paused to avoid duplicate writes

The combined Cloud Run job may still exist for manual fallback, but it should not be scheduled while the split jobs are active.

Emergency stop state:

- Every radar Cloud Scheduler job should remain `PAUSED`.
- Every Cloud Run radar job should have `RADAR_RUNNER_APPLY=false`.
- Every Cloud Run radar job should have `RADAR_RUNNER_CONFIRM=disabled`.
- Do not re-enable scheduled radar until packed radar artifacts replace tile-per-object publishing.

Reason:

- September 24, 2026 billing showed R2 Class A operations, not storage, were the cost driver.
- Tile-per-object publishing created too many write/list/delete operations for scheduled multi-product radar.
- Storage stayed small enough that deleting existing objects would create unnecessary additional Class A operations.

## Level III Regional Expansion Plan

Do not keep adding stations to `omniwx-radar-level3-runner` indefinitely. The current Phase 1 bundle already publishes `IWA`, `MPX`, and `DLH` across seven products at z7-z10. Expanding that same job to 9+ stations can push runtime past the 15-minute cadence and create overlapping publishes.

Use separate regional jobs with staggered schedules:

- Keep `omniwx-radar-level3-runner` for Phase 1: `IWA,MPX,DLH`.
- Add `omniwx-radar-level3-southwest-runner` for Phase 1B Southwest: `FSX,YUX,EMX`.
- Add `omniwx-radar-level3-midwest-runner` for Phase 1B Midwest: `FSD,DMX,ARX`.
- Keep `GRB,LOT` as next Midwest/Great Lakes candidates after storage and runtime remain boring.
- Skip `TWC` for now; the September 23, 2026 inventory returned no current files for `N0B,N0S,EET,N0C,N0X,DVL,N0H`.

Use the same product package for Phase 1B unless a dry-run proves a product is noisy or empty at that station:

```text
N0B,N0S,EET,N0C,N0X,DVL,N0H
```

Measured expansion signal:

- `FSX N0B` dry-run at z7-z10 generated 152 non-empty tiles and about 0.99 MB for one frame without R2 writes.
- Current inventory confirmed the full tested product package exists for `FSX,YUX,EMX,FSD,DMX,ARX,GRB,LOT`.

Deployment status:

- `omniwx-radar-level3-southwest-runner` was deployed and manually executed successfully on September 24, 2026.
- `omniwx-radar-level3-midwest-runner` was deployed and manually executed successfully on September 24, 2026.
- Production Worker health checks confirmed fresh z10 timelines for all required Phase 1B products after the first applied runs.
- The regional Cloud Scheduler jobs were enabled briefly, then paused after Class A operation billing showed tile-per-object publishing was not operation-safe.

Packed-artifact replacement:

- `radar:build-tile-pack` can convert an existing rendered tile manifest into one `.owxpack` artifact plus a latest manifest.
- `radar:publish-tile-pack` dry-runs or publishes one `.owxpack` artifact plus one latest manifest, with a required Class A operation cap and `--confirm packed-radar-writes` for apply mode.
- Apply mode now refuses stale source frames, refuses production writes to the wrong bucket, refuses production-looking mistakes such as `example`/`proof` pack keys, preserves the previous latest manifest to a rollback key when possible, merges retained packed frames, and deletes old whole-pack objects rather than thousands of tile objects.
- Worker tile routes can serve packed-frame tiles through R2 range reads while keeping app URLs unchanged.
- A measured MRMS z3-z10 proof reduced one frame from 4,530 would-be R2 objects to 2 publish objects.
- A packed publisher and operation-budget preflight are required before any schedule is re-enabled.

Dry-run a packed publish plan without writing to R2:

```powershell
npm --prefix omniwx-api run radar:publish-tile-pack -- `
  --latest ..\tmp\mrms\tiles\MergedReflectivityQCComposite-z3z10\latest-packed.json `
  --latest-key radar/mrms/latest/MergedReflectivityQCComposite.json `
  --bucket omniwx-radar-assets-dev `
  --target-env dev `
  --max-class-a-ops 4
```

Do not run `--apply` against production until a fresh packed MRMS proof and a fresh packed Level III proof have passed. Production apply must use:

```text
RADAR_RUNNER_DELIVERY=packed
RADAR_RUNNER_APPLY=true
RADAR_RUNNER_CONFIRM=packed-radar-writes
RADAR_RUNNER_MAX_CLASS_A_OPS=4
```

The old tile-per-object scheduled path must remain paused.

Historical regional deployment snippets that enabled tile-per-object production writes have been intentionally removed from this runbook. That posture created the R2 Class A cost incident and should not be copied into new jobs.

When regional jobs are re-enabled, their environment must use packed delivery and the packed confirmation phrase:

```text
RADAR_RUNNER_DELIVERY=packed
RADAR_RUNNER_APPLY=true
RADAR_RUNNER_CONFIRM=packed-radar-writes
RADAR_RUNNER_MAX_CLASS_A_OPS=4
```

## Safety Defaults

The runner is intentionally conservative:

- `RADAR_RUNNER_APPLY=false` by default.
- Production writes require `RADAR_RUNNER_DELIVERY=packed` and `RADAR_RUNNER_CONFIRM=packed-radar-writes`.
- MRMS defaults to z3-z8, 12 retained frames, 1 backfill frame.
- MRMS multi-product publishing is opt-in through `MRMS_PRODUCTS`; the single-product fallback remains `MRMS_PRODUCT` or `MergedReflectivityQCComposite`.
- Level III defaults to `IWA,MPX,DLH` and `N0B,N0S,EET`.
- Level III empty optional products can skip without failing the whole run.
- Existing Worker fallback to RainViewer/IEM remains active.

## Required Google Cloud Setup

Replace placeholders before running commands.

```bash
export PROJECT_ID="omniwx-radar-runner"
export REGION="us-central1"
export ARTIFACT_REPO="omniwx"
export MRMS_JOB_NAME="omniwx-radar-mrms-runner"
export LEVEL3_JOB_NAME="omniwx-radar-level3-runner"
export MRMS_SCHEDULER_NAME="omniwx-radar-mrms-10min"
export LEVEL3_SCHEDULER_NAME="omniwx-radar-level3-15min"
export SERVICE_ACCOUNT="omniwx-radar-runner@${PROJECT_ID}.iam.gserviceaccount.com"
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/omniwx-radar-runner:latest"
```

Enable APIs:

```bash
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com --project "$PROJECT_ID"
```

Create the service account:

```bash
gcloud iam service-accounts create omniwx-radar-runner \
  --project "$PROJECT_ID" \
  --display-name "OMNIwx radar runner"
```

Grant only what Cloud Run/Scheduler need:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SERVICE_ACCOUNT}" \
  --role "roles/run.invoker"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SERVICE_ACCOUNT}" \
  --role "roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${SERVICE_ACCOUNT}" \
  --role "roles/run.developer"

gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --project "$PROJECT_ID" \
  --member "serviceAccount:service-PROJECT_NUMBER@gcp-sa-cloudscheduler.iam.gserviceaccount.com" \
  --role "roles/iam.serviceAccountTokenCreator"
```

## Store R2 Secrets

Use the same Cloudflare R2 S3 credentials already used by GitHub Actions.

```bash
printf "%s" "YOUR_R2_ACCOUNT_ID" | gcloud secrets create R2_ACCOUNT_ID --project "$PROJECT_ID" --data-file=-
printf "%s" "YOUR_R2_ACCESS_KEY_ID" | gcloud secrets create R2_ACCESS_KEY_ID --project "$PROJECT_ID" --data-file=-
printf "%s" "YOUR_R2_SECRET_ACCESS_KEY" | gcloud secrets create R2_SECRET_ACCESS_KEY --project "$PROJECT_ID" --data-file=-
printf "%s" "https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com" | gcloud secrets create R2_ENDPOINT --project "$PROJECT_ID" --data-file=-
```

## Build And Deploy The Job

From repo root:

```bash
gcloud artifacts repositories create "$ARTIFACT_REPO" \
  --project "$PROJECT_ID" \
  --repository-format docker \
  --location "$REGION" \
  --description "OMNIwx containers"

gcloud builds submit ./omniwx-api \
  --project "$PROJECT_ID" \
  --config ./omniwx-api/cloudbuild.radar-runner.yaml \
  --substitutions "_IMAGE=${IMAGE}"
```

Create or update the MRMS job in dry-run mode first:

```bash
gcloud run jobs deploy "$MRMS_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --service-account "$SERVICE_ACCOUNT" \
  --task-timeout "45m" \
  --max-retries "0" \
  --cpu "2" \
  --memory "4Gi" \
  --set-env-vars "RADAR_RUNNER_ENABLED=true,RADAR_RUNNER_TARGET_ENV=production,RADAR_RUNNER_APPLY=false,RADAR_RUNNER_MRMS_ENABLED=true,RADAR_RUNNER_LEVEL3_ENABLED=false,MRMS_MAX_ZOOM=8,MRMS_RETAIN_FRAMES=12,MRMS_BACKFILL_FRAMES=1" \
  --set-secrets "R2_ACCOUNT_ID=R2_ACCOUNT_ID:latest,R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest,R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest,R2_ENDPOINT=R2_ENDPOINT:latest"
```

Use this update when intentionally enabling the national MRMS beta package:

```bash
gcloud run jobs update "$MRMS_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "MRMS_PRODUCTS=MergedReflectivityQCComposite,ReflectivityAtLowestAltitude,EchoTop_18,PrecipRate,MRMS_MAX_ZOOM=8,MRMS_RETAIN_FRAMES=12,MRMS_BACKFILL_FRAMES=1"
```

Create or update the Level III job in dry-run mode first. Use an env-vars file so comma-separated site/product lists are passed safely.

```bash
cat > /tmp/omniwx-level3-runner-env.yaml <<'YAML'
RADAR_RUNNER_ENABLED: "true"
RADAR_RUNNER_TARGET_ENV: "production"
RADAR_RUNNER_APPLY: "false"
RADAR_RUNNER_MRMS_ENABLED: "false"
RADAR_RUNNER_LEVEL3_ENABLED: "true"
LEVEL3_SITES: "IWA,MPX,DLH"
LEVEL3_PRODUCTS: "N0B,N0S,EET"
LEVEL3_MAX_ZOOM: "10"
LEVEL3_RETAIN_FRAMES: "12"
YAML

gcloud run jobs deploy "$LEVEL3_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --service-account "$SERVICE_ACCOUNT" \
  --task-timeout "45m" \
  --max-retries "0" \
  --cpu "2" \
  --memory "4Gi" \
  --env-vars-file /tmp/omniwx-level3-runner-env.yaml \
  --set-secrets "R2_ACCOUNT_ID=R2_ACCOUNT_ID:latest,R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest,R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest,R2_ENDPOINT=R2_ENDPOINT:latest"
```

Use this update when intentionally enabling the Phase 1 local Level III beta package:

```bash
gcloud run jobs update "$LEVEL3_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "LEVEL3_SITES=IWA,MPX,DLH,LEVEL3_PRODUCTS=N0B,N0S,EET,N0C,N0X,DVL,N0H,LEVEL3_MAX_ZOOM=10,LEVEL3_RETAIN_FRAMES=12,LEVEL3_ALLOW_EMPTY_SKIP=true,LEVEL3_MAX_DELETES=5000"
```

Run one dry-run execution for each job:

```bash
gcloud run jobs execute "$MRMS_JOB_NAME" --project "$PROJECT_ID" --region "$REGION" --wait
gcloud run jobs execute "$LEVEL3_JOB_NAME" --project "$PROJECT_ID" --region "$REGION" --wait
```

Only after fresh packed MRMS and Level III manual production proofs pass, enable packed writes:

```bash
gcloud run jobs update "$MRMS_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "RADAR_RUNNER_DELIVERY=packed,RADAR_RUNNER_APPLY=true,RADAR_RUNNER_CONFIRM=packed-radar-writes,RADAR_RUNNER_MAX_CLASS_A_OPS=4"

gcloud run jobs update "$LEVEL3_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "RADAR_RUNNER_DELIVERY=packed,RADAR_RUNNER_APPLY=true,RADAR_RUNNER_CONFIRM=packed-radar-writes,RADAR_RUNNER_MAX_CLASS_A_OPS=4"
```

## Create The Scheduler

Cloud Scheduler calls the Cloud Run Jobs API on separate cadences so MRMS freshness is not dragged down by heavier Level III work. Do not create or resume schedules until the packed production proof path has passed and write caps are accepted.

```bash
gcloud scheduler jobs create http "$MRMS_SCHEDULER_NAME" \
  --project "$PROJECT_ID" \
  --location "$REGION" \
  --schedule "*/10 * * * *" \
  --time-zone "America/Phoenix" \
  --uri "https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${MRMS_JOB_NAME}:run" \
  --http-method POST \
  --oauth-service-account-email "$SERVICE_ACCOUNT" \
  --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform"

gcloud scheduler jobs create http "$LEVEL3_SCHEDULER_NAME" \
  --project "$PROJECT_ID" \
  --location "$REGION" \
  --schedule "2,17,32,47 * * * *" \
  --time-zone "America/Phoenix" \
  --uri "https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${LEVEL3_JOB_NAME}:run" \
  --http-method POST \
  --oauth-service-account-email "$SERVICE_ACCOUNT" \
  --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform"
```

Pause immediately if anything looks wrong:

```bash
gcloud scheduler jobs pause "$MRMS_SCHEDULER_NAME" --project "$PROJECT_ID" --location "$REGION"
gcloud scheduler jobs pause "$LEVEL3_SCHEDULER_NAME" --project "$PROJECT_ID" --location "$REGION"
```

Disable writes without deleting the job:

```bash
gcloud run jobs update "$MRMS_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "RADAR_RUNNER_APPLY=false,RADAR_RUNNER_CONFIRM=disabled"

gcloud run jobs update "$LEVEL3_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "RADAR_RUNNER_APPLY=false,RADAR_RUNNER_CONFIRM=disabled"
```

## Cost Guardrails Before Apply=true

Do these before enabling production writes:

- Create a Google Cloud budget alert for the project.
- Set alert thresholds low at first, for example 50%, 90%, and 100% of a small monthly budget.
- Keep Cloudflare R2 visible in the Cloudflare dashboard and verify object count/storage after the first runs.
- Keep `MRMS_MAX_ZOOM=8` until z10 runtime/storage are measured under Cloud Run.
- Keep `LEVEL3_PRODUCTS=N0B,N0S,EET` until freshness and storage are boring; then expand to `N0B,N0S,EET,N0C,N0X,DVL,N0H` for the `IWA,MPX,DLH` beta package and watch R2 storage after several cycles.
- Keep GitHub radar workflows available as manual fallback, not primary cadence.

## Validation

After each applied run:

```bash
curl "https://omniwx-api-production.omniwx.workers.dev/v1/radar/mrms/timeline?product=MergedReflectivityQCComposite"
curl "https://omniwx-api-production.omniwx.workers.dev/v1/radar/mrms/timeline?product=EchoTop_18"
curl "https://omniwx-api-production.omniwx.workers.dev/v1/radar/level3/timeline?site=IWA&product=N0B"
curl "https://omniwx-api-production.omniwx.workers.dev/v1/radar/level3/timeline?site=MPX&product=N0C"
```

Expected:

- Newest MRMS frame age stays near the 5-15 minute range.
- Level III required products stay fresh when source data exists.
- R2 storage remains bounded.
- App fallback still handles stale or missing products.
