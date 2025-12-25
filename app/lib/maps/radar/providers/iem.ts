// app/lib/maps/radar/providers/iem.ts
export type IemFrame = 'latest' | 'm05m' | 'm10m' | 'm15m' | 'm20m' | 'm25m' | 'm30m';

export const IEM_FRAMES: readonly IemFrame[] = [
  'latest',
  'm05m',
  'm10m',
  'm15m',
  'm20m',
  'm25m',
  'm30m',
] as const;

export function iemFrameTemplate(frame: IemFrame): string {
  if (frame === 'latest') {
    return 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png';
  }
  return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913-${frame}/{z}/{x}/{y}.png`;
}
