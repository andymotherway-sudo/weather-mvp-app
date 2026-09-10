import { API_BASE } from '../../../net/apiBase';
import type { RadarProductId } from '../../radarIem';

export type Level3HealthProduct = {
  product: RadarProductId;
  ok: boolean;
  reason?: string | null;
  validTime?: string | null;
  ageMinutes?: number | null;
  frameCount?: number | null;
  tileCount?: number | null;
  totalBytes?: number | null;
  maxZoom?: number | null;
};

export type RadarBackendStatus = {
  level3?: {
    site?: string | null;
    ok?: boolean;
    reason?: string | null;
    checkedAt?: string | null;
    products?: Level3HealthProduct[];
  } | null;
};

let cachedStatus: RadarBackendStatus | null = null;
let cachedExpiresAt = 0;

export async function fetchRadarBackendStatus(args?: { ttlMs?: number }): Promise<RadarBackendStatus> {
  const ttlMs = Math.max(10_000, args?.ttlMs ?? 60_000);
  const now = Date.now();
  if (cachedStatus && now < cachedExpiresAt) return cachedStatus;

  const res = await fetch(`${API_BASE.replace(/\/+$/, '')}/v1/radar/backend/status`);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Radar backend status failed: ${res.status}${text ? ` ${text.slice(0, 160)}` : ''}`);
  }

  const json = JSON.parse(text);
  const status: RadarBackendStatus = {
    level3: json?.ownedPipeline?.level3?.health ?? null,
  };
  cachedStatus = status;
  cachedExpiresAt = now + ttlMs;
  return status;
}
