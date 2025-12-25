// app/lib/nautical/stations.ts

export type NauticalStation = {
  /** NOAA Tides & Currents station id (string of digits) */
  id: string;

  /** Display name */
  name: string;

  /**
   * Optional NOAA NDBC buoy id to use for “sea state” live observations.
   * If omitted, the app will fall back to model data.
   */
  buoyId?: string;

  /**
   * Optional coordinates (nice for future features like map centering).
   * Not required for tides/forecast.
   */
  latitude?: number;
  longitude?: number;
};

export const DEFAULT_NAUTICAL_STATION: NauticalStation = {
  id: '9435380',
  name: 'South Beach, OR — Newport/Yaquina',
  buoyId: '46050',
  latitude: 44.625,
  longitude: -124.045,
};

export const NAUTICAL_STATIONS: NauticalStation[] = [
  // Keep your original 3 at top if you want; just ensure they follow the same type.

  // WEST COAST
  { id: '9447130', name: 'Seattle, WA — Elliott Bay', latitude: 47.602, longitude: -122.339 },
  { id: '9444090', name: 'Port Angeles, WA — Strait of Juan de Fuca', latitude: 48.125, longitude: -123.440 },
  { id: '9444900', name: 'Port Townsend, WA — Admiralty Inlet', latitude: 48.111, longitude: -122.759 },
  { id: '9439040', name: 'Astoria, OR — Columbia River Bar', latitude: 46.207, longitude: -123.768 },
  { id: '9435380', name: 'South Beach, OR — Newport/Yaquina', buoyId: '46050', latitude: 44.625, longitude: -124.045 },
  { id: '9414290', name: 'San Francisco, CA — Golden Gate', latitude: 37.806, longitude: -122.465 },
  { id: '9411340', name: 'Santa Barbara, CA — Santa Barbara Channel', latitude: 34.405, longitude: -119.692 },
  { id: '9410660', name: 'Los Angeles, CA — LA Harbor', latitude: 33.719, longitude: -118.272 },
  { id: '9410230', name: 'La Jolla, CA — San Diego Coast', latitude: 32.866, longitude: -117.257 },
  { id: '1612340', name: 'Honolulu, HI — Honolulu Harbor', latitude: 21.306, longitude: -157.867 },

  // NORTHEAST / MID-ATLANTIC
  { id: '8443970', name: 'Boston, MA — Boston Harbor', latitude: 42.354, longitude: -71.050 },
  { id: '8418150', name: 'Portland, ME — Casco Bay', latitude: 43.657, longitude: -70.247 },
  { id: '8518750', name: 'New York, NY — The Battery / NY Harbor', latitude: 40.701, longitude: -74.014 },
  { id: '8575512', name: 'Annapolis, MD — Chesapeake Bay', latitude: 38.983, longitude: -76.480 },
  { id: '8638610', name: 'Norfolk, VA — Hampton Roads', latitude: 36.947, longitude: -76.330 },

  // SOUTHEAST
  { id: '8665530', name: 'Charleston, SC — Charleston Harbor', latitude: 32.781, longitude: -79.925 },
  { id: '8670870', name: 'Savannah, GA — Fort Pulaski', latitude: 32.036, longitude: -80.902 },
  { id: '8720218', name: 'Jacksonville, FL — Mayport', latitude: 30.398, longitude: -81.430 },
  { id: '8723214', name: 'Miami, FL — Virginia Key', latitude: 25.732, longitude: -80.162 },
  { id: '8724580', name: 'Key West, FL — Key West Harbor', latitude: 24.556, longitude: -81.807 },
  { id: '8726520', name: 'Tampa Bay, FL — St. Petersburg', latitude: 27.760, longitude: -82.627 },

  // GULF
  { id: '8771450', name: 'Galveston, TX — Galveston Pier 21', latitude: 29.310, longitude: -94.794 },
  { id: '8761927', name: 'New Orleans, LA — Mississippi River', latitude: 29.950, longitude: -90.068 },

  // TERRITORIES / ALASKA
  { id: '9755371', name: 'San Juan, PR — San Juan Harbor', latitude: 18.465, longitude: -66.117 },
  { id: '9455500', name: 'Seward, AK — Resurrection Bay', latitude: 60.104, longitude: -149.442 },
];
