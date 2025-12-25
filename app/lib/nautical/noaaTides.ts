// app/lib/nautical/noaaTides.ts

import { useEffect, useState } from 'react';

export type TideHiLoType = 'H' | 'L';

export interface TidePrediction {
  time: string;          // ISO-like timestamp
  height: number;        // feet
  type: TideHiLoType;    // 'H' or 'L'
}

interface NoaaTidePredictionRaw {
  t: string;             // "2024-12-08 01:23"
  v: string;             // "3.45"
  type: TideHiLoType;
}

interface NoaaTideResponse {
  predictions: NoaaTidePredictionRaw[];
}

function formatDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}${m}${day}`;
}

// Fetch today's high/low tide predictions for a NOAA tide station
async function fetchTodayTides(
  stationId: string,
): Promise<{ predictions: TidePrediction[]; generatedAt: string }> {
  const today = new Date();
  const begin = formatDateYYYYMMDD(today);
  const end = begin; // just today

  const params = new URLSearchParams({
    product: 'predictions',
    application: 'OMNIWX',
    begin_date: begin,
    end_date: end,
    datum: 'MLLW',
    station: stationId,
    time_zone: 'lst_ldt',
    units: 'english',
    interval: 'hilo',
    format: 'json',
  });

  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NOAA tides failed: ${res.status}`);
  }

  const json = (await res.json()) as NoaaTideResponse;

  const predictions: TidePrediction[] =
    json.predictions?.map((p) => ({
      time: p.t,                 // already local time string
      height: Number(p.v),       // feet
      type: p.type,
    })) ?? [];

  return {
    predictions,
    generatedAt: new Date().toISOString(),
  };
}

// React hook used by Nautical tab
export function useNoaaTides(stationId: string | undefined) {
  const [predictions, setPredictions] = useState<TidePrediction[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stationId) {
      setPredictions(null);
      setGeneratedAt(null);
      setLoading(false);
      return;
    }

    // ✅ New local const with narrowed type
    const id = stationId; // type: string

    async function load() {
      try {
        setError(null);
        setLoading(true);
        const result = await fetchTodayTides(id); // ✅ id is string here
        setPredictions(result.predictions);
        setGeneratedAt(result.generatedAt);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load tide predictions');
        setPredictions(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [stationId]);

  return {
    predictions,
    generatedAt,
    loading,
    error,
  };
}
