import { useEffect, useState } from 'react';

import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

export type NwsDeskProduct = {
  id: string | null;
  type: string;
  title: string | null;
  issuedAt: string | null;
  url: string | null;
  text: string | null;
};

export type NwsDesk = {
  ok: boolean;
  version: string;
  source: string;
  generatedAt: string;
  updatedAt: string | null;
  office: {
    id: string | null;
    forecastOffice: string | null;
    radarStation: string | null;
  };
  headline: string;
  summary: string;
  hazards: string[];
  timing: string | null;
  confidence: 'Low' | 'Moderate' | 'High' | null;
  products: {
    afd: NwsDeskProduct | null;
    hwo: NwsDeskProduct | null;
  };
  errors: string[];
};

type NwsDeskState = {
  data: NwsDesk | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useNwsDesk({
  lat,
  lon,
  enabled = true,
}: {
  lat: number;
  lon: number;
  enabled?: boolean;
}): NwsDeskState {
  const [data, setData] = useState<NwsDesk | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!enabled || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
    });

    fetchWithTimeout(apiUrl(`/api/nws/desk?${params.toString()}`), 15000, { signal: ac.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        if (!ac.signal.aborted) setData(json as NwsDesk);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setError(String(err?.message ?? err ?? 'NWS Desk unavailable'));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [enabled, lat, lon, refreshToken]);

  return {
    data,
    loading,
    error,
    refresh: () => setRefreshToken((value) => value + 1),
  };
}

export type NwsStormReport = {
  id: string | null;
  issuedAt: string | null;
  event: string;
  location: string | null;
  countyState: string | null;
  magnitude: string | null;
  source: string | null;
  remarks: string | null;
  lat: number | null;
  lon: number | null;
  distanceMiles: number | null;
};

export type NwsStormReports = {
  ok: boolean;
  version: string;
  source: string;
  generatedAt: string;
  updatedAt: string | null;
  office: {
    id: string | null;
    forecastOffice: string | null;
  };
  hours: number;
  summary: {
    count: number;
    closest: NwsStormReport | null;
    strongestWind: NwsStormReport | null;
    largestHail: NwsStormReport | null;
    latest: NwsStormReport | null;
  };
  reports: NwsStormReport[];
  errors: string[];
};

export function useNwsStormReports({
  lat,
  lon,
  hours = 24,
  enabled = true,
}: {
  lat: number;
  lon: number;
  hours?: number;
  enabled?: boolean;
}) {
  const [data, setData] = useState<NwsStormReports | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!enabled || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
      hours: String(hours),
    });

    fetchWithTimeout(apiUrl(`/api/nws/storm-reports?${params.toString()}`), 15000, { signal: ac.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        if (!ac.signal.aborted) setData(json as NwsStormReports);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setError(String(err?.message ?? err ?? 'NWS storm reports unavailable'));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [enabled, hours, lat, lon, refreshToken]);

  return {
    data,
    loading,
    error,
    refresh: () => setRefreshToken((value) => value + 1),
  };
}
