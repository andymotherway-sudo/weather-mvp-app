import { describe, expect, it } from 'vitest';
import worker from '../src/index';

function geometryRings(geometry: any): any[][][] {
  if (geometry?.type === 'Polygon') return geometry.coordinates ?? [];
  if (geometry?.type === 'MultiPolygon') return (geometry.coordinates ?? []).flat();
  return [];
}

describe('worker module', () => {
  it('exports a fetch handler', () => {
    expect(typeof worker.fetch).toBe('function');
  });

  it('returns global capabilities contract', async () => {
    const res = await worker.fetch(
      new Request('https://omniwx.test/api/global/capabilities'),
      {} as any,
      { waitUntil: () => undefined, passThroughOnException: () => undefined } as any,
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

  it('returns marine source registry', async () => {
    const res = await worker.fetch(
      new Request('https://omniwx.test/api/marine/sources'),
      {} as any,
      { waitUntil: () => undefined, passThroughOnException: () => undefined } as any,
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.version).toBe('marine-sources-v1');
    expect(json.sources.map((source: any) => source.id)).toEqual(
      expect.arrayContaining(['official-nws', 'official-eccc', 'official-bom', 'open-meteo-marine', 'wmo-metarea']),
    );
    expect(json.sources.find((source: any) => source.id === 'wmo-metarea')?.status).toBe('context-only');
  });

  it('returns official marine zones by default', async () => {
    const res = await worker.fetch(
      new Request('https://omniwx.test/api/marine/areas?west=-136&south=48&east=-122&north=55&zoom=5'),
      {} as any,
      { waitUntil: () => undefined, passThroughOnException: () => undefined } as any,
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
    const res = await worker.fetch(
      new Request('https://omniwx.test/api/marine/areas?west=150&south=15&east=-130&north=65&zoom=3&includeContext=1'),
      {} as any,
      { waitUntil: () => undefined, passThroughOnException: () => undefined } as any,
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.areas.some((area: any) => area.id === 'metarea-xii' || area.id === 'metarea-xi')).toBe(true);
    const datelineArea = json.areas.find((area: any) => area.id === 'metarea-xii');
    expect(datelineArea?.geometry?.type).toBe('MultiPolygon');
  });

  it('returns official Australian marine zones by default', async () => {
    const res = await worker.fetch(
      new Request('https://omniwx.test/api/marine/areas?west=112&south=-44&east=154&north=-10&zoom=4'),
      {} as any,
      { waitUntil: () => undefined, passThroughOnException: () => undefined } as any,
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.areas.length).toBeGreaterThan(0);
    expect(json.areas.some((area: any) => String(area.id).startsWith('metarea-'))).toBe(false);
    expect(json.areas.some((area: any) => area.boundarySource === 'official-bom')).toBe(true);
  });
});
