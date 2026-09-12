# Radar Architecture

Last updated: September 12, 2026

This diagram shows how OMNIwx radar works today and where it is going. The key idea is that the mobile app should never depend directly on raw NOAA files, GitHub jobs, or R2 internals. The app talks to the OMNIwx Worker, and the Worker decides whether owned radar is healthy enough to serve or whether fallback data should remain active.

## Current Beta Architecture

```mermaid
flowchart TB
  subgraph Sources["Data Sources"]
    NOAA_MRMS["NOAA MRMS GRIB2\nUS national radar products"]
    NOAA_L3["NOAA / Unidata NEXRAD Level III\nstation products"]
    RainViewer["RainViewer\nfallback national/global mosaic"]
    IEM["IEM / RIDGE\nfallback local NEXRAD"]
  end

  subgraph GitHub["Zero-cost beta automation\nGitHub Actions"]
    MRMSJob["MRMS radar cycle\nrender sparse XYZ tiles"]
    L3Job["NEXRAD Level III cycle\nrender station/product XYZ tiles"]
    Watchdogs["MRMS + Level III watchdogs\nmanual recovery trigger when schedules run"]
    HealthWorkflow["Radar health report\nread-only freshness check"]
  end

  subgraph Storage["Cloudflare"]
    R2["R2 radar assets\nrolling retained tiles + manifests"]
    Worker["OMNIwx API Worker\nhealth, timelines, tile proxy,\ntransparent empty tiles"]
    D1["D1\nuser/app data later\nnot radar hot path"]
  end

  subgraph App["OMNIwx Mobile App"]
    Maps["Maps tab"]
    StormScope["Storm Scope"]
    Playback["Radar playback controls"]
  end

  NOAA_MRMS --> MRMSJob
  NOAA_L3 --> L3Job
  MRMSJob --> R2
  L3Job --> R2
  Watchdogs -. "dispatch if stale\nwhen GitHub schedule fires" .-> MRMSJob
  Watchdogs -. "dispatch if stale\nwhen GitHub schedule fires" .-> L3Job
  HealthWorkflow --> Worker
  R2 --> Worker
  Worker --> Maps
  Worker --> StormScope
  Worker --> Playback
  RainViewer --> Maps
  IEM --> StormScope
  D1 -. "future users/subscriptions,\nnot live radar tiles" .-> Worker

  classDef owned fill:#113a5c,stroke:#58b9ff,color:#fff;
  classDef fallback fill:#4b3420,stroke:#ffb45c,color:#fff;
  classDef risk fill:#5a1d28,stroke:#ff6f8d,color:#fff;
  classDef app fill:#183d2c,stroke:#66e0a3,color:#fff;

  class NOAA_MRMS,NOAA_L3,MRMSJob,L3Job,R2,Worker,HealthWorkflow owned;
  class RainViewer,IEM fallback;
  class Watchdogs risk;
  class Maps,StormScope,Playback app;
```

## Current Behavior

- MRMS is the owned US national radar backbone when fresh.
- Owned Level III is the local station-product beta path for selected stations/products.
- RainViewer and IEM remain fallbacks when owned data is stale, missing, warming, unsupported, or outside coverage.
- R2 stores rolling recent tiles and manifests only; it should not become an archive.
- D1 is intentionally not in the radar hot path.
- GitHub Actions can render and publish successfully, but scheduled execution can skip for hours, so it is not production-grade freshness infrastructure.

## Target Production Architecture

```mermaid
flowchart TB
  subgraph Sources["Data Sources"]
    NOAA_MRMS["NOAA MRMS"]
    NOAA_L3["NOAA / Unidata Level III"]
    FutureNOAA["Future NOAA products\nLevel II, satellite, fire, hydrology"]
    Fallbacks["Commercial/public fallbacks\nRainViewer, IEM, others"]
  end

  subgraph Runner["Dedicated Radar Runner"]
    Scheduler["Reliable scheduler\n5-10 minute cadence"]
    Queues["Product + station queues"]
    Locks["Per-product locks"]
    Renderer["Node + Python renderer\nMRMS + Level III decoders"]
    Uploader["S3-compatible R2 uploader\nretry/resume writes"]
    Cleanup["Retention cleanup\nrolling frames only"]
    CostGuard["Cost and storage guardrails\nfail closed before budget limits"]
    Health["Health publisher\nfreshness, frames, bytes,\nlast failure"]
  end

  subgraph Cloudflare["Cloudflare Edge"]
    R2["R2\nbounded tile prefixes + manifests"]
    Worker["OMNIwx API Worker\nsource selection, timelines,\ntile serving, fallback labels"]
    CDN["Edge cache / CDN path\nfuture hot tile optimization"]
  end

  subgraph App["OMNIwx Clients"]
    Mobile["Mobile app"]
    Website["Website / future web maps"]
    Admin["Read-only health checks\nand release validation"]
  end

  NOAA_MRMS --> Scheduler
  NOAA_L3 --> Scheduler
  FutureNOAA --> Scheduler
  Scheduler --> Queues --> Locks --> Renderer --> Uploader --> R2
  Renderer --> Health
  Uploader --> Cleanup --> R2
  CostGuard --> Scheduler
  CostGuard --> Uploader
  Health --> Worker
  R2 --> Worker
  Worker --> CDN
  CDN --> Mobile
  Worker --> Mobile
  Worker --> Website
  Worker --> Admin
  Fallbacks --> Worker
  Fallbacks --> Mobile

  classDef source fill:#24334d,stroke:#7aa6ff,color:#fff;
  classDef runner fill:#123f38,stroke:#5ee0c0,color:#fff;
  classDef cloud fill:#403414,stroke:#f4c95d,color:#fff;
  classDef client fill:#35224d,stroke:#c09cff,color:#fff;
  classDef fallback fill:#4b3420,stroke:#ffb45c,color:#fff;

  class NOAA_MRMS,NOAA_L3,FutureNOAA source;
  class Scheduler,Queues,Locks,Renderer,Uploader,Cleanup,CostGuard,Health runner;
  class R2,Worker,CDN cloud;
  class Mobile,Website,Admin client;
  class Fallbacks fallback;
```

## Production Definition Of Done

- The dedicated runner keeps MRMS and selected Level III products fresh without manual GitHub dispatches.
- MRMS has enough frames for smooth motion, not a slow flipbook.
- Owned Level III supports the pilot stations/products with useful retained history.
- Worker/app labels make source truth obvious: owned, fallback, stale, warming, unsupported.
- R2 storage remains bounded by retention and verified cleanup.
- Cost guardrails can stop or narrow publishing before a bill surprise.
- RainViewer/IEM can remain fallbacks, but they are no longer the core radar product.
