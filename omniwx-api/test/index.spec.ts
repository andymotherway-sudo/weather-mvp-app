import { describe, expect, it } from 'vitest';
import worker from '../src/index';

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
    expect(json.areas.some((area: any) => area.id === 'indian-ocean')).toBe(true);
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
    expect(json.areas.some((area: any) => area.id === 'nw-pacific' || area.id === 'ne-pacific')).toBe(true);
  });
});
