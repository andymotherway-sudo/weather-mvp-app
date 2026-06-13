export type EarthDiskImage = {
  imageUrl: string;
  caption: string;
  date: string;
  source: string;
  centroid?: {
    lat: number;
    lon: number;
  };
};

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
    centroid:
      typeof lat === 'number' && typeof lon === 'number'
        ? {
            lat,
            lon,
          }
        : undefined,
  };
}
