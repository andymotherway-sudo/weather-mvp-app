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

As of September 20, 2026, production uses split jobs rather than the original combined job:

- `omniwx-radar-mrms-runner`
  - Scheduler: `omniwx-radar-mrms-10min`
  - Cadence: every 10 minutes
  - Scope: `MergedReflectivityQCComposite`, z3-z8, 12 retained frames
- `omniwx-radar-level3-runner`
  - Scheduler: `omniwx-radar-level3-15min`
  - Cadence: `:02`, `:17`, `:32`, and `:47`
  - Scope: `IWA`, `MPX`, `DLH` x `N0B`, `N0S`, `EET`, z7-z10, 12 retained frames
- `omniwx-radar-runner-10min`
  - Original combined schedule
  - State: paused to avoid duplicate writes

The combined Cloud Run job may still exist for manual fallback, but it should not be scheduled while the split jobs are active.

## Safety Defaults

The runner is intentionally conservative:

- `RADAR_RUNNER_APPLY=false` by default.
- Production writes require `RADAR_RUNNER_CONFIRM=production-radar-writes`.
- MRMS defaults to z3-z8, 12 retained frames, 1 backfill frame.
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

Run one dry-run execution for each job:

```bash
gcloud run jobs execute "$MRMS_JOB_NAME" --project "$PROJECT_ID" --region "$REGION" --wait
gcloud run jobs execute "$LEVEL3_JOB_NAME" --project "$PROJECT_ID" --region "$REGION" --wait
```

Only after dry-run logs are clean, enable writes:

```bash
gcloud run jobs update "$MRMS_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "RADAR_RUNNER_APPLY=true,RADAR_RUNNER_CONFIRM=production-radar-writes"

gcloud run jobs update "$LEVEL3_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "RADAR_RUNNER_APPLY=true,RADAR_RUNNER_CONFIRM=production-radar-writes"
```

## Create The Scheduler

Cloud Scheduler calls the Cloud Run Jobs API on separate cadences so MRMS freshness is not dragged down by heavier Level III work.

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
- Keep `LEVEL3_PRODUCTS=N0B,N0S,EET` until freshness and storage are boring.
- Keep GitHub radar workflows available as manual fallback, not primary cadence.

## Validation

After each applied run:

```bash
curl "https://omniwx-api-production.omniwx.workers.dev/v1/radar/mrms/timeline?product=MergedReflectivityQCComposite"
curl "https://omniwx-api-production.omniwx.workers.dev/v1/radar/level3/timeline?site=IWA&product=N0B"
```

Expected:

- Newest MRMS frame age stays near the 5-15 minute range.
- Level III required products stay fresh when source data exists.
- R2 storage remains bounded.
- App fallback still handles stale or missing products.
