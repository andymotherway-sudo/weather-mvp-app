// app/lib/nautical/useOffshoreHighSeasZones.ts
import { useEffect, useState } from 'react';
import { OFFSHORE_HIGHSEAS_ZONES } from './highSeasStatic';
import type { NauticalZone } from './zones';

function centroidOfRing(ring: Array<[number, number]>) {
  // quick centroid approximation (average of vertices)
  let sumLon = 0;
  let sumLat = 0;
  let n = 0;
  for (const [lon, lat] of ring) {
    sumLon += lon;
    sumLat += lat;
    n += 1;
  }
  if (!n) return { longitude: 0, latitude: 0 };
  return { longitude: sumLon / n, latitude: sumLat / n };
}

export function useOffshoreHighSeasZones() {
  const [zones, setZones] = useState<NauticalZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Convert GeoJSON features -> your NauticalZone[] shape
        const out: NauticalZone[] = OFFSHORE_HIGHSEAS_ZONES.features.map((f) => {
          const ring = f.geometry.coordinates?.[0] ?? [];
          const c = centroidOfRing(ring);

          return {
            id: f.properties.id,
            name: f.properties.name,
            wfo: f.properties.wfo ?? 'OPC',
            // your NauticalZone polygon appears to be lat/lon objects
            polygon: ring.map(([lon, lat]) => ({ longitude: lon, latitude: lat })),
            centroid: { longitude: c.longitude, latitude: c.latitude },
            // keep geometry so we can render directly without rebuilding
            geometry: f.geometry as any,
          } as any;
        });

        if (alive) setZones(out);
      } catch (e: any) {
        if (alive) setError(String(e?.message ?? e ?? 'Failed to load offshore/highseas zones'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return { zones, loading, error };
}
