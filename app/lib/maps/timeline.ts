// app/lib/maps/timeline.ts
// Radar timeline helpers. For MVP, we generate synthetic frames at fixed intervals.
// Later: replace with real timestamps returned by your radar provider.

export type RadarFrame = {
  index: number;
  // ISO timestamp for display (synthetic for now)
  iso: string;
};

export function buildRadarFrames(opts?: {
  minutesBack?: number;      // how far back in time
  stepMinutes?: number;      // frame interval
  now?: Date;                // injection for tests
}): RadarFrame[] {
  const minutesBack = opts?.minutesBack ?? 240;  // 4 hours
  const stepMinutes = opts?.stepMinutes ?? 10;   // 10 min
  const now = opts?.now ?? new Date();

  if (minutesBack <= 0 || stepMinutes <= 0) return [];

  const frameCount = Math.floor(minutesBack / stepMinutes) + 1;
  const frames: RadarFrame[] = [];

  for (let i = 0; i < frameCount; i++) {
    const minutesAgo = (frameCount - 1 - i) * stepMinutes;
    const d = new Date(now.getTime() - minutesAgo * 60_000);
    frames.push({ index: i, iso: d.toISOString() });
  }

  return frames;
}

export function clampFrameIndex(index: number, frameCount: number): number {
  if (!Number.isFinite(index) || frameCount <= 0) return 0;
  return Math.max(0, Math.min(frameCount - 1, Math.floor(index)));
}

export function nextFrameIndex(current: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  const c = clampFrameIndex(current, frameCount);
  return (c + 1) % frameCount;
}

export function prevFrameIndex(current: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  const c = clampFrameIndex(current, frameCount);
  return (c - 1 + frameCount) % frameCount;
}

export function formatRadarFrameLabel(iso: string): string {
  // MVP: "HH:MM" local time
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}
