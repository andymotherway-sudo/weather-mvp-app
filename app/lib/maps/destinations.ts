// app/lib/maps/destinations.ts
export type MapDestinationId = 'weather' | 'astro' | 'nautical';

export type MapDestination = {
  id: MapDestinationId;
  title: string;
  subtitle: string;
  route: '/maps' | '/astro-map' | '/nautical-map';
  available?: boolean;
};

export const MAP_DESTINATIONS: ReadonlyArray<MapDestination> = [
  {
    id: 'weather',
    title: 'Weather Map',
    subtitle: 'Radar, clouds, wildfire, alerts',
    route: '/maps',
    available: true,
  },
  {
    id: 'astro',
    title: 'Astro Map',
    subtitle: 'Sky score, aurora, observing conditions',
    route: '/astro-map',
    available: true,
  },
  {
    id: 'nautical',
    title: 'Nautical Map',
    subtitle: 'Buoys, marine zones, offshore conditions',
    route: '/nautical-map',
    available: true,
  },
] as const;
