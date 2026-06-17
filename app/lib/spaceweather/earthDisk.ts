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

export type EarthDiskView = 'epic' | 'goes-east' | 'goes-west';

type EpicNaturalImage = {
  image?: string;
  date?: string;
  caption?: string;
  centroid_coordinates?: {
    lat?: number;
    lon?: number;
  };
};

const EPIC_NATURAL_URL = 'https://epic.gsfc.nasa.gov/api/natural';
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

function imageUrlForEpicItem(item: EpicNaturalImage) {
  const datePart = String(item.date ?? '').split(' ')[0];
  const [year, month, day] = datePart.split('-');
  if (!item.image || !year || !month || !day) return null;
  return `https://epic.gsfc.nasa.gov/archive/natural/${year}/${month}/${day}/png/${item.image}.png`;
}

export async function fetchLatestEarthDisk(): Promise<EarthDiskImage> {
  const response = await fetch(`${EPIC_NATURAL_URL}?_=${Date.now()}`, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
  if (!response.ok) {
    throw new Error(`NASA EPIC returned ${response.status}`);
  }

  const payload = (await response.json()) as EpicNaturalImage[];
  const latest = payload
    .filter((item) => item.image && item.date && imageUrlForEpicItem(item))
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())[0];

  if (!latest) {
    throw new Error('NASA EPIC did not return a usable Earth disk image.');
  }

  const baseImageUrl = imageUrlForEpicItem(latest);
  const imageVersion = encodeURIComponent(String(latest.date ?? latest.image ?? Date.now()));
  const imageUrl = baseImageUrl ? `${baseImageUrl}?v=${imageVersion}` : null;
  if (!imageUrl) {
    throw new Error('NASA EPIC image metadata was incomplete.');
  }

  const lat = latest.centroid_coordinates?.lat;
  const lon = latest.centroid_coordinates?.lon;

  return {
    imageUrl,
    caption: latest.caption ?? 'Earth Polychromatic Imaging Camera natural-color full disk.',
    date: latest.date ?? new Date().toISOString(),
    source: 'NASA EPIC / DSCOVR',
    view: 'epic',
    centroid:
      typeof lat === 'number' && typeof lon === 'number'
        ? {
            lat,
            lon,
          }
        : undefined,
  };
}

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
