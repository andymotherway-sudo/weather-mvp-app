export type EarthDiskImage = {
  imageUrl: string;
  caption: string;
  date: string;
  source: string;
  view: EarthDiskView;
  centroid?: {
    lat: number;
    lon: number;
  };
};

export type EarthDiskView = 'goes-east' | 'goes-west';

const GOES_GEOCOLOR_IMAGES: Record<'east' | 'west', { imageUrl: string; source: string }> = {
  east: {
    imageUrl: 'https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/1808x1808.jpg',
    source: 'NOAA GOES-East GeoColor',
  },
  west: {
    imageUrl: 'https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/1808x1808.jpg',
    source: 'NOAA GOES-West GeoColor',
  },
};

export async function fetchLatestTerminatorEarthDisk(hemisphere: 'east' | 'west'): Promise<EarthDiskImage> {
  const config = GOES_GEOCOLOR_IMAGES[hemisphere];
  const cacheBust = Date.now();

  return {
    imageUrl: `${config.imageUrl}?v=${cacheBust}`,
    caption:
      'GOES GeoColor full-disk view: true color during daylight and multispectral infrared at night, showing the day-night terminator.',
    date: new Date().toISOString(),
    source: config.source,
    view: hemisphere === 'east' ? 'goes-east' : 'goes-west',
  };
}
