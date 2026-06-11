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

  it('returns viewport-scoped global marine areas', async () => {
    const res = await worker.fetch(
      new Request('https://omniwx.test/api/marine/areas?west=30&south=-45&east=120&north=25&zoom=4'),
      {} as any,
      { waitUntil: () => undefined, passThroughOnException: () => undefined } as any,
    );
    const json = await res.json() as any;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.source).toBe('curated-worker-manifest');
    expect(json.areas.length).toBeGreaterThan(0);
    expect(json.areas.length).toBeLessThanOrEqual(json.meta.limit);
    expect(json.areas.some((area: any) => String(area.id).startsWith('metarea-'))).toBe(true);
    expect(json.areas.some((area: any) => area.sourceLabel.includes('Official WMO/IMO'))).toBe(true);
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
  });

  it('handles marine area viewports that cross the dateline', async () => {
    const res = await worker.fetch(
      new Request('https://omniwx.test/api/marine/areas?west=150&south=15&east=-130&north=65&zoom=3'),
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
});
