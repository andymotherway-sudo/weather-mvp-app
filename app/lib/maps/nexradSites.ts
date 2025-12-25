import sites from "./nexradSites.json";

export type NexradSite = {
  id: string;
  name: string;
  state: string;
  county: string;
  lat: number;
  lon: number;
  elevFt: number | null;
  utcOffsetHours: number | null;
  country: string | null;
  ownerType: string | null;
  ncdcId?: string;
  wban?: string;
};

export const NEXRAD_SITES = sites as NexradSite[];
