// app/lib/nautical/areas.ts

export type MarineAreaKind = 'coastal' | 'offshore' | 'high-seas' | 'lake';

export interface LatLonBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface MarineArea {
  /** Internal id – can match an official marine zone if you want */
  id: string;
  /** Human-friendly label */
  name: string;
  /** Region label for grouping (optional) */
  region: string;
  /** Ocean / basin: Pacific, Atlantic, etc. */
  ocean: string;
  /** ISO-ish country code for who “owns” the zone */
  country: string;
  /** Coastal vs offshore vs high-seas etc. */
  kind: MarineAreaKind;
  /** Simple bounding box used for:
   *  - drawing polygons on the Buoy Map
   *  - filtering buoys that fall in this area
   */
  bounds: LatLonBounds;
  /** Tide station used to drive the tides card */
  tideStationId?: string;
  /** Primary buoy to use for “Sea State source” on Nautical Wx */
  primaryBuoyId?: string;
  /** Forecast zone id for text marine forecast API */
  forecastZoneId?: string;
  /**
   * Whether we should show a tide card for this area.
   * Defaults to true when omitted; set false for open waters / lakes.
   */
  supportsTides?: boolean;
}

/** Helper: simple lookup */
export function getMarineAreaById(id?: string | null): MarineArea | undefined {
  if (!id) return undefined;
  return MARINE_AREAS.find((a) => a.id === id);
}

/** Helper: rough center point */
export function getMarineAreaCenter(area: MarineArea): {
  latitude: number;
  longitude: number;
} {
  const { minLat, maxLat, minLon, maxLon } = area.bounds;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
  };
}

/** 🌍 Starter global dataset – you can keep adding to this over time */
export const MARINE_AREAS: MarineArea[] = [
  // --- U.S. PACIFIC COASTAL (split into nearshore + offshore bands) ---

{
  id: 'PZ5_OR_WA_NEAR',
  name: 'Pacific NW Nearshore Waters',
  region: 'Pacific Northwest',
  ocean: 'Pacific',
  country: 'US',
  kind: 'coastal',
  supportsTides: true,
  // ~0–40 nm off WA/OR
  bounds: {
    minLat: 42.0,
    maxLat: 49.5,
    minLon: -126.0,  // just offshore
    maxLon: -123.0,  // hugging coast
  },
  tideStationId: '9432780',    // Astoria, OR (example)
  primaryBuoyId: '46050',      // Yaquina Offshore
  forecastZoneId: 'PZZ250',
},
{
  id: 'PZ5_OR_WA_OFF',
  name: 'Pacific NW Offshore Waters',
  region: 'Pacific Northwest',
  ocean: 'Pacific',
  country: 'US',
  kind: 'offshore',
  supportsTides: false,
  // ~40–120 nm off WA/OR
  bounds: {
    minLat: 42.0,
    maxLat: 49.5,
    minLon: -130.0,
    maxLon: -126.0,
  },
  tideStationId: undefined,
  primaryBuoyId: '46050',
  forecastZoneId: 'PZZ270',    // or reuse PZZ250 if you prefer
},

{
  id: 'PZ6_CA_NORTH_NEAR',
  name: 'Northern California Nearshore Waters',
  region: 'California',
  ocean: 'Pacific',
  country: 'US',
  kind: 'coastal',
  supportsTides: true,
  bounds: {
    minLat: 38.0,
    maxLat: 42.5,
    minLon: -125.5,
    maxLon: -123.0,
  },
  tideStationId: '9418767',    // North Spit / Eureka
  primaryBuoyId: '46022',      // Eel River
  forecastZoneId: 'PZZ470',
},
{
  id: 'PZ6_CA_NORTH_OFF',
  name: 'Northern California Offshore Waters',
  region: 'California',
  ocean: 'Pacific',
  country: 'US',
  kind: 'offshore',
  supportsTides: false,
  bounds: {
    minLat: 38.0,
    maxLat: 42.5,
    minLon: -129.5,
    maxLon: -125.5,
  },
  tideStationId: undefined,
  primaryBuoyId: '46022',
  forecastZoneId: 'PZZ470',    // or offshore-specific zone
},

{
  id: 'PZ7_CA_CENTRAL_NEAR',
  name: 'Central California Nearshore Waters',
  region: 'California',
  ocean: 'Pacific',
  country: 'US',
  kind: 'coastal',
  supportsTides: true,
  bounds: {
    minLat: 34.0,   // Pt Conception region
    maxLat: 38.5,   // North of SF
    minLon: -124.5,
    maxLon: -121.5,
  },
  tideStationId: '9413450',    // San Francisco
  primaryBuoyId: '46026',      // Golden Gate
  forecastZoneId: 'PZZ560',
},
{
  id: 'PZ7_CA_CENTRAL_OFF',
  name: 'Central California Offshore Waters',
  region: 'California',
  ocean: 'Pacific',
  country: 'US',
  kind: 'offshore',
  supportsTides: false,
  bounds: {
    minLat: 34.0,
    maxLat: 38.5,
    minLon: -128.0,
    maxLon: -124.5,
  },
  tideStationId: undefined,
  primaryBuoyId: '46026',
  forecastZoneId: 'PZZ570',    // or reuse 560 if you want
},

{
  id: 'PZ8_CA_SOUTH_NEAR',
  name: 'Southern California Nearshore Waters',
  region: 'California',
  ocean: 'Pacific',
  country: 'US',
  kind: 'coastal',
  supportsTides: true,
  bounds: {
    minLat: 31.0,
    maxLat: 34.5,
    minLon: -120.5,
    maxLon: -116.5,
  },
  tideStationId: '9410170',    // San Diego
  primaryBuoyId: '46232',      // San Clemente Basin
  forecastZoneId: 'PZZ750',
},
{
  id: 'PZ8_CA_SOUTH_OFF',
  name: 'Southern California Offshore Waters',
  region: 'California',
  ocean: 'Pacific',
  country: 'US',
  kind: 'offshore',
  supportsTides: false,
  bounds: {
    minLat: 31.0,
    maxLat: 34.5,
    minLon: -124.0,
    maxLon: -120.5,
  },
  tideStationId: undefined,
  primaryBuoyId: '46232',
  forecastZoneId: 'PZZ775',    // or reuse 750
},

// --- U.S. ATLANTIC COASTAL (nearshore + offshore bands) ---

{
  id: 'AT1_NE_COAST_NEAR',
  name: 'New England Nearshore Waters',
  region: 'New England',
  ocean: 'Atlantic',
  country: 'US',
  kind: 'coastal',
  supportsTides: true,
  bounds: {
    minLat: 40.5,
    maxLat: 45.5,
    minLon: -71.5,  // hugging coast
    maxLon: -67.0,
  },
  tideStationId: '8410140',     // Portland, ME
  primaryBuoyId: '44007',
  forecastZoneId: 'ANZ200',     // nearshore zone
},
{
  id: 'AT1_NE_COAST_OFF',
  name: 'New England Offshore Waters',
  region: 'New England',
  ocean: 'Atlantic',
  country: 'US',
  kind: 'offshore',
  supportsTides: false,
  bounds: {
    minLat: 40.5,
    maxLat: 45.5,
    minLon: -67.0,
    maxLon: -60.0,
  },
  tideStationId: undefined,
  primaryBuoyId: '44007',
  forecastZoneId: 'ANZ800',
},

{
  id: 'AT2_MID_ATL_NEAR',
  name: 'Mid-Atlantic Nearshore Waters',
  region: 'Mid-Atlantic',
  ocean: 'Atlantic',
  country: 'US',
  kind: 'coastal',
  supportsTides: true,
  bounds: {
    minLat: 35.0,
    maxLat: 41.0,
    minLon: -75.5,
    maxLon: -72.0,
  },
  tideStationId: '8518750',     // The Battery, NY
  primaryBuoyId: '44025',
  forecastZoneId: 'ANZ400',
},
{
  id: 'AT2_MID_ATL_OFF',
  name: 'Mid-Atlantic Offshore Waters',
  region: 'Mid-Atlantic',
  ocean: 'Atlantic',
  country: 'US',
  kind: 'offshore',
  supportsTides: false,
  bounds: {
    minLat: 35.0,
    maxLat: 41.0,
    minLon: -72.0,
    maxLon: -69.0,
  },
  tideStationId: undefined,
  primaryBuoyId: '44025',
  forecastZoneId: 'ANZ500',
},

{
  id: 'AT3_SE_US_NEAR',
  name: 'Southeast U.S. Nearshore Waters',
  region: 'Southeast US',
  ocean: 'Atlantic',
  country: 'US',
  kind: 'coastal',
  supportsTides: true,
  bounds: {
    minLat: 26.0,
    maxLat: 35.0,
    minLon: -81.5,   // hugging coast
    maxLon: -78.0,
  },
  tideStationId: '8720218',     // Mayport / Jacksonville
  primaryBuoyId: '41008',       // Georgia Bight
  forecastZoneId: 'AMZ300',
},
{
  id: 'AT3_SE_US_OFF',
  name: 'Southeast U.S. Offshore Waters',
  region: 'Southeast US',
  ocean: 'Atlantic',
  country: 'US',
  kind: 'offshore',
  supportsTides: false,
  bounds: {
    minLat: 26.0,
    maxLat: 35.0,
    minLon: -78.0,
    maxLon: -75.0,
  },
  tideStationId: undefined,
  primaryBuoyId: '41008',
  forecastZoneId: 'AMZ350',
},

// --- GULF OF MEXICO (split into coastal / offshore bands) ---

{
  id: 'GM1_TX_GULF_NEAR',
  name: 'Texas Gulf Nearshore Waters',
  region: 'Gulf of Mexico',
  ocean: 'Gulf',
  country: 'US',
  kind: 'coastal',
  supportsTides: true,
  bounds: {
    minLat: 25.8,
    maxLat: 30.5,
    minLon: -97.9,
    maxLon: -93.2,
  },
  tideStationId: '8775237',
  primaryBuoyId: '42020',
  forecastZoneId: 'GMZ231',
},
{
  id: 'GM1_TX_GULF_OFF',
  name: 'Texas Gulf Offshore Waters',
  region: 'Gulf of Mexico',
  ocean: 'Gulf',
  country: 'US',
  kind: 'offshore',
  supportsTides: false,
  bounds: {
    minLat: 24.2,
    maxLat: 29.8,
    minLon: -97.9,
    maxLon: -92.0,
  },
  tideStationId: undefined,
  primaryBuoyId: '42020',
  forecastZoneId: 'GMZ250',
},
{
  id: 'GM2_CENTRAL_GULF_NEAR',
  name: 'Central Gulf Nearshore Waters',
  region: 'Gulf of Mexico',
  ocean: 'Gulf',
  country: 'US',
  kind: 'coastal',
  supportsTides: true,
  bounds: {
    minLat: 28.0,
    maxLat: 31.5,
    minLon: -93.2,
    maxLon: -86.7,
  },
  tideStationId: '8761927',
  primaryBuoyId: '42040',
  forecastZoneId: 'GMZ532',
},
{
  id: 'GM2_CENTRAL_GULF_OFF',
  name: 'Central Gulf Offshore Waters',
  region: 'Gulf of Mexico',
  ocean: 'Gulf',
  country: 'US',
  kind: 'offshore',
  supportsTides: false,
  bounds: {
    minLat: 26.0,
    maxLat: 30.8,
    minLon: -93.2,
    maxLon: -85.0,
  },
  tideStationId: undefined,
  primaryBuoyId: '42040',
  forecastZoneId: 'GMZ570',
},
{
  id: 'GM3_FL_GULF_NEAR',
  name: 'Florida Gulf Nearshore Waters',
  region: 'Gulf of Mexico',
  ocean: 'Gulf',
  country: 'US',
  kind: 'coastal',
  supportsTides: true,
  bounds: {
    minLat: 24.0,
    maxLat: 30.8,
    minLon: -86.7,
    maxLon: -81.2,
  },
  tideStationId: '8726520',
  primaryBuoyId: '42036',
  forecastZoneId: 'GMZ853',
},
{
  id: 'GM3_FL_GULF_OFF',
  name: 'Florida Gulf Offshore Waters',
  region: 'Gulf of Mexico',
  ocean: 'Gulf',
  country: 'US',
  kind: 'offshore',
  supportsTides: false,
  bounds: {
    minLat: 23.8,
    maxLat: 29.8,
    minLon: -87.2,
    maxLon: -82.0,
  },
  tideStationId: undefined,
  primaryBuoyId: '42036',
  forecastZoneId: 'GMZ873',
},

// --- HAWAII (nearshore + offshore wraparound band) ---

{
  id: 'HI_ISLANDS_NEAR',
  name: 'Hawaiian Nearshore Waters',
  region: 'Hawaii',
  ocean: 'Pacific',
  country: 'US',
  kind: 'coastal',
  supportsTides: true,
  bounds: {
    minLat: 18.0,
    maxLat: 23.0,
    minLon: -161.0,
    maxLon: -154.0,
  },
  tideStationId: '1612340',     // Honolulu
  primaryBuoyId: '51002',
  forecastZoneId: 'PHZ100',
},
{
  id: 'HI_ISLANDS_OFF',
  name: 'Hawaiian Offshore Waters',
  region: 'Hawaii',
  ocean: 'Pacific',
  country: 'US',
  kind: 'offshore',
  supportsTides: false,
  bounds: {
    minLat: 18.0,
    maxLat: 23.0,
    minLon: -164.0,
    maxLon: -161.0,
  },
  tideStationId: undefined,
  primaryBuoyId: '51002',
  forecastZoneId: 'PHZ180',
},

  // --- GREAT LAKES (simplified single area) ---

  {
    id: 'GL_LAKES',
    name: 'Great Lakes',
    region: 'Great Lakes',
    ocean: 'lake',
    country: 'US',
    kind: 'lake',
    bounds: {
      minLat: 40.0,
      maxLat: 49.5,
      minLon: -93.0,
      maxLon: -74.0,
    },
    tideStationId: undefined,
    primaryBuoyId: '45005',       // example
    forecastZoneId: 'GLZ001',
    supportsTides: false,         // no traditional tides here
  },

  // --- GLOBAL HIGH-SEAS “BIG BOXES” (for now) ---

  {
    id: 'NPAC_NORTH_WEST',
    name: 'Northwest Pacific Open Waters',
    region: 'North Pacific',
    ocean: 'Pacific',
    country: 'INTL',
    kind: 'high-seas',
    bounds: {
      minLat: 25.0,
      maxLat: 55.0,
      minLon: 150.0,
      maxLon: 180.0,
    },
    supportsTides: false,
  },
  {
    id: 'NPAC_NORTH_EAST',
    name: 'Northeast Pacific Open Waters',
    region: 'North Pacific',
    ocean: 'Pacific',
    country: 'INTL',
    kind: 'high-seas',
    bounds: {
      minLat: 25.0,
      maxLat: 55.0,
      minLon: -180.0,
      maxLon: -120.0,
    },
    supportsTides: false,
  },
  {
    id: 'NATL_NORTH',
    name: 'North Atlantic Open Waters',
    region: 'North Atlantic',
    ocean: 'Atlantic',
    country: 'INTL',
    kind: 'high-seas',
    bounds: {
      minLat: 25.0,
      maxLat: 60.0,
      minLon: -60.0,
      maxLon: 10.0,
    },
    supportsTides: false,
  },
  {
    id: 'SPAC_SOUTH_WEST',
    name: 'Southwest Pacific Open Waters',
    region: 'South Pacific',
    ocean: 'Pacific',
    country: 'INTL',
    kind: 'high-seas',
    bounds: {
      minLat: -55.0,
      maxLat: -5.0,
      minLon: 150.0,
      maxLon: 180.0,
    },
    supportsTides: false,
  },
  {
    id: 'SPAC_SOUTH_EAST',
    name: 'Southeast Pacific Open Waters',
    region: 'South Pacific',
    ocean: 'Pacific',
    country: 'INTL',
    kind: 'high-seas',
    bounds: {
      minLat: -55.0,
      maxLat: -5.0,
      minLon: -180.0,
      maxLon: -70.0,
    },
    supportsTides: false,
  },
  {
    id: 'SATL_SOUTH',
    name: 'South Atlantic Open Waters',
    region: 'South Atlantic',
    ocean: 'Atlantic',
    country: 'INTL',
    kind: 'high-seas',
    bounds: {
      minLat: -55.0,
      maxLat: 20.0,
      minLon: -70.0,
      maxLon: 20.0,
    },
    supportsTides: false,
  },
  {
    id: 'INDIAN_OCEAN',
    name: 'Indian Ocean Open Waters',
    region: 'Indian Ocean',
    ocean: 'Indian',
    country: 'INTL',
    kind: 'high-seas',
    bounds: {
      minLat: -45.0,
      maxLat: 25.0,
      minLon: 20.0,
      maxLon: 115.0,
    },
    supportsTides: false,
  },
  {
    id: 'SOUTHERN_OCEAN',
    name: 'Southern Ocean Open Waters',
    region: 'Southern Ocean',
    ocean: 'Southern',
    country: 'INTL',
    kind: 'high-seas',
    bounds: {
      minLat: -70.0,
      maxLat: -55.0,
      minLon: -180.0,
      maxLon: 180.0,
    },
    supportsTides: false,
  },
  {
    id: 'MEDITERRANEAN',
    name: 'Mediterranean Sea',
    region: 'Mediterranean',
    ocean: 'Mediterranean',
    country: 'INTL',
    kind: 'offshore',
    bounds: {
      minLat: 30.0,
      maxLat: 46.0,
      minLon: -6.5,
      maxLon: 36.5,
    },
    supportsTides: false,
  },
  {
    id: 'NORTH_SEA',
    name: 'North Sea',
    region: 'Northern Europe',
    ocean: 'Atlantic',
    country: 'INTL',
    kind: 'offshore',
    bounds: {
      minLat: 51.0,
      maxLat: 62.5,
      minLon: -4.5,
      maxLon: 9.5,
    },
    supportsTides: false,
  },
  {
    id: 'BALTIC_SEA',
    name: 'Baltic Sea',
    region: 'Northern Europe',
    ocean: 'Baltic',
    country: 'INTL',
    kind: 'offshore',
    bounds: {
      minLat: 53.0,
      maxLat: 66.0,
      minLon: 9.0,
      maxLon: 31.0,
    },
    supportsTides: false,
  },
  {
    id: 'CARIBBEAN_SEA',
    name: 'Caribbean Sea',
    region: 'Caribbean',
    ocean: 'Atlantic',
    country: 'INTL',
    kind: 'offshore',
    bounds: {
      minLat: 9.0,
      maxLat: 23.5,
      minLon: -89.0,
      maxLon: -58.0,
    },
    supportsTides: false,
  },
  {
    id: 'ARABIAN_SEA',
    name: 'Arabian Sea',
    region: 'Indian Ocean',
    ocean: 'Indian',
    country: 'INTL',
    kind: 'offshore',
    bounds: {
      minLat: 5.0,
      maxLat: 26.5,
      minLon: 50.0,
      maxLon: 78.0,
    },
    supportsTides: false,
  },
  {
    id: 'BAY_OF_BENGAL',
    name: 'Bay of Bengal',
    region: 'Indian Ocean',
    ocean: 'Indian',
    country: 'INTL',
    kind: 'offshore',
    bounds: {
      minLat: 4.0,
      maxLat: 23.5,
      minLon: 78.0,
      maxLon: 100.0,
    },
    supportsTides: false,
  },
  {
    id: 'CORAL_TASMAN_SEAS',
    name: 'Coral and Tasman Seas',
    region: 'Australia / New Zealand',
    ocean: 'Pacific',
    country: 'INTL',
    kind: 'offshore',
    bounds: {
      minLat: -48.0,
      maxLat: -10.0,
      minLon: 145.0,
      maxLon: 180.0,
    },
    supportsTides: false,
  },
];

export const DEFAULT_MARINE_AREA: MarineArea = MARINE_AREAS[0];
