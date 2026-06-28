export type AirportIndexEntry = {
  icao: string;
  iata?: string;
  name: string;
  lat: number;
  lon: number;
  region: 'US' | 'Canada' | 'Mexico' | 'Caribbean' | 'Central America';
};

export const AVIATION_AIRPORT_INDEX: AirportIndexEntry[] = [
  { icao: 'KATL', iata: 'ATL', name: 'Atlanta Hartsfield-Jackson', lat: 33.6367, lon: -84.4281, region: 'US' },
  { icao: 'KBOS', iata: 'BOS', name: 'Boston Logan', lat: 42.3656, lon: -71.0096, region: 'US' },
  { icao: 'KDEN', iata: 'DEN', name: 'Denver International', lat: 39.8617, lon: -104.6731, region: 'US' },
  { icao: 'KDFW', iata: 'DFW', name: 'Dallas-Fort Worth', lat: 32.8998, lon: -97.0403, region: 'US' },
  { icao: 'KDVT', iata: 'DVT', name: 'Phoenix Deer Valley', lat: 33.6883, lon: -112.0825, region: 'US' },
  { icao: 'KFFZ', iata: 'MSC', name: 'Mesa Falcon Field', lat: 33.4659, lon: -111.7212, region: 'US' },
  { icao: 'KFLG', iata: 'FLG', name: 'Flagstaff Pulliam', lat: 35.1385, lon: -111.6712, region: 'US' },
  { icao: 'KIAH', iata: 'IAH', name: 'Houston Intercontinental', lat: 29.9844, lon: -95.3414, region: 'US' },
  { icao: 'KIWA', iata: 'AZA', name: 'Phoenix-Mesa Gateway', lat: 33.3078, lon: -111.6555, region: 'US' },
  { icao: 'KJFK', iata: 'JFK', name: 'New York JFK', lat: 40.6413, lon: -73.7781, region: 'US' },
  { icao: 'KLAS', iata: 'LAS', name: 'Las Vegas Harry Reid', lat: 36.0801, lon: -115.1522, region: 'US' },
  { icao: 'KLAX', iata: 'LAX', name: 'Los Angeles International', lat: 33.9425, lon: -118.4081, region: 'US' },
  { icao: 'KMIA', iata: 'MIA', name: 'Miami International', lat: 25.7959, lon: -80.287, region: 'US' },
  { icao: 'KMSP', iata: 'MSP', name: 'Minneapolis-St Paul', lat: 44.8848, lon: -93.2223, region: 'US' },
  { icao: 'KORD', iata: 'ORD', name: 'Chicago O Hare', lat: 41.9742, lon: -87.9073, region: 'US' },
  { icao: 'KPHX', iata: 'PHX', name: 'Phoenix Sky Harbor', lat: 33.4278, lon: -112.0037, region: 'US' },
  { icao: 'KSAN', iata: 'SAN', name: 'San Diego International', lat: 32.7338, lon: -117.1933, region: 'US' },
  { icao: 'KSDL', iata: 'SCF', name: 'Scottsdale', lat: 33.6229, lon: -111.9105, region: 'US' },
  { icao: 'KSEA', iata: 'SEA', name: 'Seattle-Tacoma', lat: 47.4502, lon: -122.3088, region: 'US' },
  { icao: 'KSFO', iata: 'SFO', name: 'San Francisco International', lat: 37.619, lon: -122.375, region: 'US' },
  { icao: 'KSLC', iata: 'SLC', name: 'Salt Lake City', lat: 40.7884, lon: -111.9778, region: 'US' },
  { icao: 'KTUS', iata: 'TUS', name: 'Tucson International', lat: 32.1315, lon: -110.9564, region: 'US' },

  { icao: 'CYEG', iata: 'YEG', name: 'Edmonton International', lat: 53.3097, lon: -113.5797, region: 'Canada' },
  { icao: 'CYFB', iata: 'YFB', name: 'Iqaluit', lat: 63.7564, lon: -68.5558, region: 'Canada' },
  { icao: 'CYFC', iata: 'YFC', name: 'Fredericton', lat: 45.8689, lon: -66.5372, region: 'Canada' },
  { icao: 'CYHZ', iata: 'YHZ', name: 'Halifax Stanfield', lat: 44.8808, lon: -63.5086, region: 'Canada' },
  { icao: 'CYLW', iata: 'YLW', name: 'Kelowna', lat: 49.9561, lon: -119.3778, region: 'Canada' },
  { icao: 'CYOW', iata: 'YOW', name: 'Ottawa Macdonald-Cartier', lat: 45.3225, lon: -75.6692, region: 'Canada' },
  { icao: 'CYQB', iata: 'YQB', name: 'Quebec City Jean Lesage', lat: 46.7911, lon: -71.3933, region: 'Canada' },
  { icao: 'CYQR', iata: 'YQR', name: 'Regina', lat: 50.4319, lon: -104.6658, region: 'Canada' },
  { icao: 'CYQT', iata: 'YQT', name: 'Thunder Bay', lat: 48.3719, lon: -89.3239, region: 'Canada' },
  { icao: 'CYUL', iata: 'YUL', name: 'Montreal Trudeau', lat: 45.4706, lon: -73.7408, region: 'Canada' },
  { icao: 'CYVR', iata: 'YVR', name: 'Vancouver International', lat: 49.1939, lon: -123.1844, region: 'Canada' },
  { icao: 'CYWG', iata: 'YWG', name: 'Winnipeg Richardson', lat: 49.91, lon: -97.2399, region: 'Canada' },
  { icao: 'CYXU', iata: 'YXU', name: 'London Ontario', lat: 43.0356, lon: -81.1539, region: 'Canada' },
  { icao: 'CYYC', iata: 'YYC', name: 'Calgary International', lat: 51.1139, lon: -114.0203, region: 'Canada' },
  { icao: 'CYYJ', iata: 'YYJ', name: 'Victoria International', lat: 48.6472, lon: -123.4258, region: 'Canada' },
  { icao: 'CYYT', iata: 'YYT', name: 'St Johns', lat: 47.6186, lon: -52.7519, region: 'Canada' },
  { icao: 'CYYZ', iata: 'YYZ', name: 'Toronto Pearson', lat: 43.6777, lon: -79.6248, region: 'Canada' },
  { icao: 'CYZF', iata: 'YZF', name: 'Yellowknife', lat: 62.4628, lon: -114.4403, region: 'Canada' },

  { icao: 'MMAS', iata: 'AGU', name: 'Aguascalientes', lat: 21.7056, lon: -102.3183, region: 'Mexico' },
  { icao: 'MMCL', iata: 'CUL', name: 'Culiacan', lat: 24.7645, lon: -107.4747, region: 'Mexico' },
  { icao: 'MMGL', iata: 'GDL', name: 'Guadalajara', lat: 20.5218, lon: -103.3112, region: 'Mexico' },
  { icao: 'MMHO', iata: 'HMO', name: 'Hermosillo', lat: 29.0959, lon: -111.0479, region: 'Mexico' },
  { icao: 'MMLO', iata: 'BJX', name: 'Leon Del Bajio', lat: 20.9935, lon: -101.4808, region: 'Mexico' },
  { icao: 'MMMD', iata: 'MID', name: 'Merida', lat: 20.937, lon: -89.6577, region: 'Mexico' },
  { icao: 'MMMX', iata: 'MEX', name: 'Mexico City Benito Juarez', lat: 19.4363, lon: -99.0721, region: 'Mexico' },
  { icao: 'MMMY', iata: 'MTY', name: 'Monterrey', lat: 25.7785, lon: -100.107, region: 'Mexico' },
  { icao: 'MMPR', iata: 'PVR', name: 'Puerto Vallarta', lat: 20.6801, lon: -105.2542, region: 'Mexico' },
  { icao: 'MMQT', iata: 'QRO', name: 'Queretaro', lat: 20.6173, lon: -100.1857, region: 'Mexico' },
  { icao: 'MMSD', iata: 'SJD', name: 'Los Cabos', lat: 23.1518, lon: -109.721, region: 'Mexico' },
  { icao: 'MMSP', iata: 'SLP', name: 'San Luis Potosi', lat: 22.2543, lon: -100.9308, region: 'Mexico' },
  { icao: 'MMTJ', iata: 'TIJ', name: 'Tijuana', lat: 32.5411, lon: -116.97, region: 'Mexico' },
  { icao: 'MMTO', iata: 'TLC', name: 'Toluca', lat: 19.3371, lon: -99.566, region: 'Mexico' },
  { icao: 'MMUN', iata: 'CUN', name: 'Cancun', lat: 21.0365, lon: -86.8771, region: 'Mexico' },
  { icao: 'MMVR', iata: 'VER', name: 'Veracruz', lat: 19.1459, lon: -96.1873, region: 'Mexico' },
  { icao: 'MMZH', iata: 'ZIH', name: 'Ixtapa-Zihuatanejo', lat: 17.6016, lon: -101.4605, region: 'Mexico' },

  { icao: 'MBPV', iata: 'PLS', name: 'Providenciales', lat: 21.7736, lon: -72.2659, region: 'Caribbean' },
  { icao: 'MDPC', iata: 'PUJ', name: 'Punta Cana', lat: 18.5674, lon: -68.3634, region: 'Caribbean' },
  { icao: 'MDSD', iata: 'SDQ', name: 'Santo Domingo Las Americas', lat: 18.4297, lon: -69.6689, region: 'Caribbean' },
  { icao: 'MKJP', iata: 'KIN', name: 'Kingston Norman Manley', lat: 17.9357, lon: -76.7875, region: 'Caribbean' },
  { icao: 'MKJS', iata: 'MBJ', name: 'Montego Bay Sangster', lat: 18.5037, lon: -77.9134, region: 'Caribbean' },
  { icao: 'MUCM', iata: 'CMW', name: 'Camaguey', lat: 21.4203, lon: -77.8475, region: 'Caribbean' },
  { icao: 'MUGM', iata: 'NBW', name: 'Guantanamo Bay', lat: 19.9065, lon: -75.2071, region: 'Caribbean' },
  { icao: 'MUHA', iata: 'HAV', name: 'Havana Jose Marti', lat: 22.9892, lon: -82.4091, region: 'Caribbean' },
  { icao: 'MUVR', iata: 'VRA', name: 'Varadero', lat: 23.0344, lon: -81.4353, region: 'Caribbean' },
  { icao: 'MWCR', iata: 'GCM', name: 'Grand Cayman Owen Roberts', lat: 19.2928, lon: -81.3577, region: 'Caribbean' },
  { icao: 'MYGF', iata: 'FPO', name: 'Freeport Grand Bahama', lat: 26.5587, lon: -78.6956, region: 'Caribbean' },
  { icao: 'MYNN', iata: 'NAS', name: 'Nassau Lynden Pindling', lat: 25.039, lon: -77.4662, region: 'Caribbean' },
  { icao: 'TBPB', iata: 'BGI', name: 'Barbados Grantley Adams', lat: 13.0746, lon: -59.4925, region: 'Caribbean' },
  { icao: 'TFFF', iata: 'FDF', name: 'Martinique Aime Cesaire', lat: 14.591, lon: -61.0032, region: 'Caribbean' },
  { icao: 'TFFR', iata: 'PTP', name: 'Guadeloupe Pointe-a-Pitre', lat: 16.2653, lon: -61.5318, region: 'Caribbean' },
  { icao: 'TGPY', iata: 'GND', name: 'Grenada Maurice Bishop', lat: 12.0042, lon: -61.7862, region: 'Caribbean' },
  { icao: 'TIST', iata: 'STT', name: 'St Thomas Cyril E King', lat: 18.3373, lon: -64.9734, region: 'Caribbean' },
  { icao: 'TISX', iata: 'STX', name: 'St Croix Henry E Rohlsen', lat: 17.7019, lon: -64.7986, region: 'Caribbean' },
  { icao: 'TJBQ', iata: 'BQN', name: 'Aguadilla Rafael Hernandez', lat: 18.4949, lon: -67.1294, region: 'Caribbean' },
  { icao: 'TJSJ', iata: 'SJU', name: 'San Juan Luis Munoz Marin', lat: 18.4394, lon: -66.0018, region: 'Caribbean' },
  { icao: 'TLPL', iata: 'UVF', name: 'Saint Lucia Hewanorra', lat: 13.7332, lon: -60.9526, region: 'Caribbean' },
  { icao: 'TNCA', iata: 'AUA', name: 'Aruba Queen Beatrix', lat: 12.5014, lon: -70.0152, region: 'Caribbean' },
  { icao: 'TNCC', iata: 'CUR', name: 'Curacao Hato', lat: 12.1889, lon: -68.9598, region: 'Caribbean' },
  { icao: 'TNCM', iata: 'SXM', name: 'St Maarten Princess Juliana', lat: 18.0409, lon: -63.1089, region: 'Caribbean' },
  { icao: 'TTPP', iata: 'POS', name: 'Port of Spain Piarco', lat: 10.5954, lon: -61.3372, region: 'Caribbean' },
  { icao: 'TVSA', iata: 'SVD', name: 'St Vincent Argyle', lat: 13.1567, lon: -61.1499, region: 'Caribbean' },

  { icao: 'MGGT', iata: 'GUA', name: 'Guatemala City La Aurora', lat: 14.5833, lon: -90.5275, region: 'Central America' },
  { icao: 'MHTG', iata: 'TGU', name: 'Tegucigalpa Toncontin', lat: 14.0609, lon: -87.2172, region: 'Central America' },
  { icao: 'MHLM', iata: 'SAP', name: 'San Pedro Sula Ramon Villeda Morales', lat: 15.4526, lon: -87.9236, region: 'Central America' },
  { icao: 'MPTO', iata: 'PTY', name: 'Panama City Tocumen', lat: 9.0714, lon: -79.3835, region: 'Central America' },
  { icao: 'MROC', iata: 'SJO', name: 'San Jose Juan Santamaria', lat: 9.9939, lon: -84.2088, region: 'Central America' },
  { icao: 'MSLP', iata: 'SAL', name: 'San Salvador', lat: 13.4409, lon: -89.0557, region: 'Central America' },
  { icao: 'MZBZ', iata: 'BZE', name: 'Belize City Philip Goldson', lat: 17.5391, lon: -88.3082, region: 'Central America' },
];

const byIcao = new Map(AVIATION_AIRPORT_INDEX.map((airport) => [airport.icao, airport]));
const byIata = new Map(
  AVIATION_AIRPORT_INDEX.flatMap((airport) => (airport.iata ? [[airport.iata, airport] as const] : []))
);

function milesBetween(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = 3958.7613;
  const toR = (v: number) => (v * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLon = toR(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function airportEntryForCode(code: string) {
  const raw = code.trim().toUpperCase();
  return byIcao.get(raw) ?? byIata.get(raw) ?? null;
}

export function airportCandidatesForToken(token: string) {
  const raw = token.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(raw)) return [];

  const candidates = new Set<string>();
  const indexed = airportEntryForCode(raw);
  if (indexed) candidates.add(indexed.icao);

  if (/^[A-Z]{3}$/.test(raw)) {
    candidates.add(raw);
    candidates.add(`K${raw}`);
    candidates.add(`C${raw}`);
  } else {
    candidates.add(raw);
  }

  return Array.from(candidates);
}

export function nearestAirportCandidates(lat: number, lon: number, limit = 8) {
  return AVIATION_AIRPORT_INDEX.map((airport) => ({
    ...airport,
    distanceMi: milesBetween(lat, lon, airport.lat, airport.lon),
  }))
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, limit);
}
