# Scaling And Cost Controls

This document separates request-serving traffic from write-producing automation.
It is the operating checklist for growth without reintroducing unbounded compute
or R2 Class A operations.

## Active Code Controls

- The production GeoColor Worker binding `GEOCOLOR_RENDER_LIMITER` permits 60
  renderer cache misses per minute per Cloudflare edge location and client IP.
  Cached images are served without consuming this allowance.
- GeoColor output is capped at 2048 by 2048 pixels. Render cache keys clamp
  dimensions and bucket bounds to 250-meter cache cells.
- Cloud Run `omniwx-goes-renderer` is capped at two instances with concurrency
  four. Its image decoder admits two distinct full-disk source frames at once.
- The mobile frame cache keeps at most 36 images and allows three downloads at
  once. Map camera events are already debounced by the renderer.
- Worker cron triggers are empty. Radar publishing must not be started by the
  request-serving Worker.

## Required Console Controls

Set these before increasing the Cloud Run maximum-instance cap.

1. In Google Cloud Billing, create a monthly budget for `omniwx-radar-runner`.
   Notify the billing administrators at 50%, 75%, 90%, and 100%. A budget is an
   alert, not a hard spend stop; retain the Cloud Run maximum-instance cap.
2. In Cloud Run metrics, alert on request count, 429s, 5xx responses, instance
   count, CPU utilization, and request latency for `omniwx-goes-renderer`.
3. In Cloudflare Workers Analytics, alert on Worker errors and monitor the
   GeoColor route's request volume and cache-hit ratio. In R2, monitor Class A
   and Class B operations separately from storage size.
4. Restrict the MapTiler key to the approved OMNIwx app/domain configuration and
   set a provider-side usage alert. Map tile requests do not pass through the
   OMNIwx Worker.

## Radar Write Posture

- Keep `MRMS_SCHEDULE_ENABLED=false` and `LEVEL3_SCHEDULE_ENABLED=false` unless
  a reviewed packed-artifact schedule is intentionally re-enabled.
- Keep every Google Cloud Scheduler radar job paused until one packed publisher
  has a measured operation budget, rollback proof, and owner approval.
- A manual GitHub Action or Cloud Run job must use `apply=true` plus the packed
  delivery confirmation before it can write production radar assets. Inspect
  GitHub runs and Cloud Run executions after every manual publish.

## Shared GOES Source Cache: Deliberate Next Step

The renderer currently has a process-local cache of three decoded NOAA frames.
That is safe but does not survive a new Cloud Run instance. Do not add R2
credentials to source control or the mobile app.

Before enabling a shared source-frame cache:

1. Create a dedicated R2 bucket or prefix for immutable GOES source JPEGs with
   short lifecycle retention (for example, 6 hours).
2. Create a least-privileged R2 S3 credential limited to that bucket/prefix.
3. Store it in Google Secret Manager and inject it only into the Cloud Run
   renderer service account.
4. Cache by NOAA frame ID, use conditional writes, and retain no more than the
   live animation window. One source object per frame is acceptable; never
   publish satellite tiles as individual R2 objects.
5. Load-test cache misses before increasing Cloud Run beyond two instances.

## Capacity Changes

Increase capacity only after a seven-day observation period with the alerts
above enabled. Raise Cloud Run one instance at a time, monitor cost and renderer
429/5xx rates, and retain a lower maximum than the absolute budget limit to
allow for short revision-overlap periods during deployment.
