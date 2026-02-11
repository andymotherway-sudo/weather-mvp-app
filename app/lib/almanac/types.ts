// app/lib/almanac/types.ts

export type RecordTopItem = {
  year: number;
  valueF?: number;   // temperatures
  valueIn?: number;  // precip/snow
};

export type AlmanacDailyRecord = {
  mmdd: string; // "MM-DD"

  // ---- Classic records (TMAX/TMIN/PRCP) ----
  recordHighF: number | null;        // highest daily max temp
  recordHighYears?: number[];        // ties (all years that match recordHighF)

  recordLowF: number | null;         // lowest daily min temp
  recordLowYears?: number[];

  recordPrecipIn?: number | null;    // max daily precip
  recordPrecipYears?: number[];

  // ---- “Almanac quality” extras ----
  recordHighMinF?: number | null;    // warmest overnight low (highest TMIN)
  recordHighMinYears?: number[];

  recordLowMaxF?: number | null;     // coldest daytime high (lowest TMAX)
  recordLowMaxYears?: number[];

  // ---- Snow (depends on station reporting) ----
  recordSnowIn?: number | null;      // max daily snowfall
  recordSnowYears?: number[];

  // ---- Optional “Top 10 for this MM-DD” ----
  topHighsF?: RecordTopItem[];       // hottest TMAX for this MM-DD (desc)
  topLowsF?: RecordTopItem[];        // coldest TMIN for this MM-DD (asc)
  topPrecipIn?: RecordTopItem[];     // wettest PRCP for this MM-DD (desc)
  topSnowIn?: RecordTopItem[];       // snowiest SNOW for this MM-DD (desc)
};