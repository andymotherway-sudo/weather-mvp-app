# OMNIwx Freemium Feature And Provider Matrix

Last reviewed: November 14, 2026

This matrix is a launch hypothesis, not an active paywall. "Manual review" means
commercial redistribution, attribution, caching, export and derived-work rights
must be recorded from current provider terms before that feature can support Plus.

| Product capability | Proposed tier | Primary data/source | Cost exposure | Commercial/launch status |
| --- | --- | --- | --- | --- |
| Current, hourly and daily weather | Free | Open-Meteo models through Worker | High with growth | **Blocked:** free endpoint is non-commercial; buy commercial plan or replace. CC BY attribution required. |
| Official US alerts | Free | NOAA/NWS API | Low/medium, rate limited | Generally public domain; preserve source, timestamps, no endorsement and official text integrity. |
| Standard national radar | Free | RainViewer fallback; planned MRMS | Medium tiles/R2 | **Blocked:** RainViewer commercial terms required; owned MRMS needs fresh pilot. |
| Basic astronomy | Free | Calculations, NOAA/NASA public feeds | Low | Manual asset/feed attribution and caching review; calculations need consistency tests. |
| Essential marine | Free | NOAA/NWS/NDBC/CO-OPS | Medium | Record each product's source and freshness; third-party station observations need separate review. |
| Basic saved locations | Free account optional; proposed limit 3 | D1 after auth, local today | Low | Account/privacy/deletion gates; local browsing remains account-free. |
| Advanced Storm Scope | Plus | MRMS/Level III, NWS/SPC, IEM fallback | High publishing/storage/support | **Blocked:** owned publishers paused/stale; IEM terms and attribution require manual approval. |
| Advanced radar products | Plus | NEXRAD Level III / R2 | High | Blocked until packed publisher freshness, rollback and seven-day cost proof. |
| GeoColor playback | Provisional Plus preview | NOAA GOES + Cloud Run/Worker | High render/egress | Public data basis; renderer/device acceptance and scale costs unresolved. |
| Detailed astronomy and sky score | Plus | Forecast models, NOAA/NASA, derived calculations | Medium | Blocked by forecast commercial plan; document scoring methodology and limitations. |
| Advanced marine analysis | Plus | NOAA/NWS/NDBC/CO-OPS plus derived analysis | Medium | Manual provider/product review and life-safety wording required. |
| Extended climatology and records | Plus | NOAA/NCEI, Open-Meteo archive | Medium/API tokens | Verify NCEI token/limits and Open-Meteo commercial archive rights before gating. |
| Extremes dashboard | Plus | NOAA/NDBC buoys, Worker land-extremes, saved-location comparisons | Medium/API fan-out | Validate commercial rights, freshness labels, and bounded batch behavior before enforcement. |
| Enhanced saved locations | Plus, proposed limit 25 | D1 | Low | Requires sync conflict, downgrade and deletion behavior. |
| High-resolution video export / recording | Plus | Map/imagery providers + native encoder | High render/third-party tiles | **Manual approval:** exported redistribution rights for every included layer/basemap. Do not enforce or advertise as purchasable until this review and device reliability acceptance pass. |
| Advanced personalization | Plus | D1 profile/preferences | Low | Avoid sensitive profiling; account remains private and data-minimized. |
| Aviation data | Free core; Plus analysis undecided | AviationWeather.gov / NOAA | Medium | Product and redistribution review; not for operational flight decisions. |
| Wildfire/air quality layers | Undecided | NASA FIRMS, USFS/BLM/ArcGIS, AirNow | Medium | Manual terms, key, attribution and cache review per source. |
| Basemaps/boundaries | Both | MapTiler and CARTO | Potentially high tile use | **Manual contract review:** plan limits, attribution and static/video export rights. |

## Provider Decisions Required

1. Open-Meteo commercial plan versus an approved alternative/self-host strategy.
2. RainViewer written commercial arrangement versus relying on proven owned MRMS.
3. MapTiler/CARTO mobile, cache and export entitlements at projected usage.
4. IEM, MET Norway, AirNow, NASA FIRMS, ArcGIS-hosted datasets and any embedded
   third-party layer terms, one source at a time.
5. Attribution design that remains visible in-app and in exported media where
   required, without implying government/provider endorsement.

## Grandfathering Plan

Early testers may receive a permanent OMNIwx Plus grant once accounts are live.
This is not a coupon and does not require a payment method. After an eligible
tester signs in, a reviewed server-side operation will create one D1
`subscription_entitlements` record with provider `omniwx_grandfather`, status
`grandfathered`, and no expiration. The entitlement resolver accepts that exact
combination only; an ordinary subscription record without a verified expiration
still fails closed.

Create this operational flow only after identity is configured and the initial
eligible-user list, support process, and audit record are approved. RevenueCat
and Google Play subscriptions come later for paying users; neither service should
be used as a makeshift coupon system before account ownership is established.

Official sources checked for the two confirmed blockers:

- [Open-Meteo terms](https://open-meteo.com/en/terms)
- [Open-Meteo license and attribution](https://open-meteo.com/en/license)
- [RainViewer API terms](https://www.rainviewer.com/api.html)
- [NWS API overview](https://www.weather.gov/documentation/services-web-api)
- [NWS disclaimer](https://www.weather.gov/disclaimer)
