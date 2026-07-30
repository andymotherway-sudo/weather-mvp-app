import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

function geometryRings(geometry: any): any[][][] {
  if (geometry?.type === 'Polygon') return geometry.coordinates ?? [];
  if (geometry?.type === 'MultiPolygon') return (geometry.coordinates ?? []).flat();
  return [];
}

describe('worker module', () => {
  it('responds through the Cloudflare Worker runtime', async () => {
    const res = await SELF.fetch(new Request('https://omniwx.test/health'));

    expect(res.status).toBe(200);
  });

  it('returns health with request safety headers', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/v1/health', {
        headers: { 'x-request-id': 'paid-users-foundation-test' },
      }),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBe('paid-users-foundation-test');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(json.success).toBe(true);
    expect(json.requestId).toBe('paid-users-foundation-test');
  });

  it('reserves future account routes behind the auth placeholder', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/v1/user/me', {
        headers: { 'x-request-id': 'account-placeholder-test' },
      }),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(501);
    expect(res.headers.get('x-request-id')).toBe('account-placeholder-test');
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_IMPLEMENTED');
    expect(json.error.requestId).toBe('account-placeholder-test');
  });

  it('returns global capabilities contract', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/api/global/capabilities'),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.version).toBe('global-capabilities-v2');
    expect(Array.isArray(json.products)).toBe(true);
    expect(json.products.length).toBeGreaterThan(5);
    expect(json.products.map((product: any) => product.id)).toEqual(
      expect.arrayContaining(['land-forecast', 'nautical', 'aviation', 'maps-radar', 'maps-satellite', 'water-stations']),
    );
    for (const product of json.products) {
      expect(typeof product.endpoint).toBe('string');
      expect(product.endpoint.startsWith('/')).toBe(true);
      expect(product.ttlSeconds).toBeGreaterThan(0);
      expect(product.staleSeconds).toBeGreaterThanOrEqual(product.ttlSeconds);
    }
  });

  it('returns radar info with backend readiness metadata', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/v1/radar/info'),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.backend?.mode).toBe('external-fallback');
    expect(json.backend?.selfHostedReady).toBe(false);
    expect(json.ownedStorage?.d1?.retentionCount).toBe(12);
    expect(json.ownedStorage?.r2?.timelinePublishEnabled).toBe(true);
    expect(Array.isArray(json.sources)).toBe(true);
    expect(json.sources.map((source: any) => source.id)).toEqual(
      expect.arrayContaining(['rainviewer', 'iem-mosaic', 'iem-ridge', 'iem-wms']),
    );
  });

  it('returns owned radar backend status', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/v1/radar/backend/status'),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.ownedPipeline?.d1?.bound).toBe('boolean');
    expect(typeof json.ownedPipeline?.r2?.bound).toBe('boolean');
    expect(json.currentSource?.images).toBe('external-fallback');
    expect(Array.isArray(json.ownedPipeline?.r2?.localSiteIds)).toBe(true);
    expect(json.ownedPipeline?.r2?.localSiteIds).toContain('IWA');
    expect(json.ownedPipeline?.r2?.localStorageEstimate?.siteCount).toBeGreaterThan(0);
    expect(json.ownedPipeline?.r2?.localStorageEstimate?.estimatedObjects).toBeGreaterThan(0);
    expect(Array.isArray(json.ownedPipeline?.r2?.recentLocalSiteActivity)).toBe(true);
    expect(json.ownedPipeline?.r2).toHaveProperty('lastOwnedLocalPublish');
  });

  it('returns self-hosted radar backend manifest contract', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/v1/radar/backend/manifest'),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.backend?.name).toBe('omniwx-radar-backend');
    expect(json.capabilities).toEqual({
      timeline: true,
      mosaicTiles: true,
      ridgeTiles: true,
      wms: true,
    });
    expect(json.routes?.timeline).toBe('/v1/radar/backend/timeline');
    expect(json.routes?.mosaicTiles).toBe('/v1/radar/backend/tiles/mosaic/{z}/{x}/{y}.png');
    expect(json.routes?.ridgeTiles).toBe('/v1/radar/backend/tiles/ridge/{z}/{x}/{y}.png');
    expect(json.routes?.wms).toBe('/v1/radar/backend/wms');
  });

  it('returns marine source registry', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/api/marine/sources'),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.version).toBe('marine-sources-v1');
    expect(json.sources.map((source: any) => source.id)).toEqual(
      expect.arrayContaining(['official-nws', 'official-eccc', 'official-bom', 'official-metoffice', 'open-meteo-marine', 'wmo-metarea']),
    );
    expect(json.sources.find((source: any) => source.id === 'wmo-metarea')?.status).toBe('context-only');
    expect(json.sources.find((source: any) => source.id === 'official-metoffice')?.status).toBe('active');
  });

  it('returns official marine zones by default', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/api/marine/areas?west=-136&south=48&east=-122&north=55&zoom=5'),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.source).toBe('curated-worker-manifest');
    expect(json.areas.length).toBeGreaterThan(0);
    expect(json.areas.length).toBeLessThanOrEqual(json.meta.limit);
    expect(json.areas.some((area: any) => String(area.id).startsWith('metarea-'))).toBe(false);
    expect(json.areas.some((area: any) => area.boundarySource === 'official-eccc')).toBe(true);
    for (const area of json.areas) {
      expect(['Polygon', 'MultiPolygon']).toContain(area.geometry?.type);
      for (const ring of geometryRings(area.geometry)) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        for (const coord of ring) {
          expect(coord[0]).toBeGreaterThanOrEqual(-180);
          expect(coord[0]).toBeLessThanOrEqual(180);
          expect(coord[1]).toBeGreaterThanOrEqual(-90);
          expect(coord[1]).toBeLessThanOrEqual(90);
        }
      }
    }
  }, 15000);

  it('handles marine area viewports that cross the dateline', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/api/marine/areas?west=150&south=15&east=-130&north=65&zoom=3&includeContext=1'),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.areas.some((area: any) => area.id === 'metarea-xii' || area.id === 'metarea-xi')).toBe(true);
    const datelineArea = json.areas.find((area: any) => area.id === 'metarea-xii');
    expect(datelineArea?.geometry?.type).toBe('MultiPolygon');
  });

  it('returns official Australian marine zones by default', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/api/marine/areas?west=112&south=-44&east=154&north=-10&zoom=4'),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.areas.length).toBeGreaterThan(0);
    expect(json.areas.some((area: any) => String(area.id).startsWith('metarea-'))).toBe(false);
    expect(json.areas.some((area: any) => area.boundarySource === 'official-bom')).toBe(true);
  });

  it('returns official-derived UK shipping forecast zones by default', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/api/marine/areas?west=-16&south=47&east=8&north=62&zoom=4'),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.areas.length).toBeGreaterThan(0);
    expect(json.areas.some((area: any) => String(area.id).startsWith('metarea-'))).toBe(false);
    expect(json.areas.some((area: any) => area.boundarySource === 'official-metoffice')).toBe(true);
  });

  it('returns a focused Met Office shipping forecast for UK sea areas', async () => {
    const res = await SELF.fetch(
      new Request('https://omniwx.test/api/marine/official-forecast?id=metoffice-shipping-irish-sea'),
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.id).toBe('metoffice-shipping-irish-sea');
    expect(json.name).toBe('Irish Sea');
    expect(json.sourceLabel).toBe('Met Office Shipping Forecast');
    expect(json.status).toBe('ok');
    expect(json.headline).toBe('Irish Sea Shipping Forecast');
    expect(json.text).toContain('Irish Sea');
    expect(json.text).not.toContain('Wight\nWind');
    expect(json.sections.map((section: any) => section.title)).toEqual(
      expect.arrayContaining(['Wind', 'Sea state', 'Weather', 'Visibility']),
    );
  }, 15000);
});
