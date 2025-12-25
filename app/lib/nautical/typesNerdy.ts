// app/lib/nautical/typesNerdy.ts

export type ConfidenceLevel = "Low" | "Moderate" | "High";
export type Trend = "Building" | "Steady" | "Subsiding" | "Unknown";

export interface NerdySourceRef {
  kind:
    | "NDBC_BUOY"
    | "NWS_MARINE_ZONE_TEXT"
    | "NWS_API"
    | "MODEL_WAVE"
    | "MODEL_WIND"
    | "OTHER";
  id?: string;              // e.g. "46050" or "PZZ370"
  name?: string;            // e.g. "NOAA NDBC"
  url?: string;             // optional
  updatedAt?: string;       // ISO
  latencyMinutes?: number;  // derived
  notes?: string;
}

/** A wave component (spectral-ish) if available */
export interface WaveComponent {
  label: "Primary swell" | "Secondary swell" | "Wind sea" | "Other";
  periodS?: number;
  directionDeg?: number;
  directionText?: string;   // e.g. "WNW"
  energyPct?: number;       // 0-100, optional
}

/** Core observation snapshot for sea state */
export interface SeaStateObs {
  significantWaveHeightM?: number;
  dominantPeriodS?: number;
  dominantDirectionDeg?: number;

  windSpeedKts?: number;
  windGustKts?: number;
  windDirectionDeg?: number;

  seaSurfaceTempC?: number;
  airTempC?: number;
  pressureHpa?: number;
  visibilityNm?: number;

  observedAt?: string; // ISO
}

/** Derived mechanics (math) */
export interface WaveMechanics {
  wavelengthM?: number;     // derived from dominant period
  steepnessRatio?: number;  // H/L (e.g. 0.09)
  steepnessLabel?: "Low" | "Moderate" | "Steep";
  breakingRisk?: "Low" | "Moderate" | "Elevated" | "High";
}

/** Wind-wave relationship */
export interface WindWaveInteraction {
  angleOffsetDeg?: number;  // abs difference wind dir vs dominant swell dir
  regime?: "Aligned" | "Opposing" | "Cross sea" | "Unknown";
  comfortNote?: string;     // one-liner
  trend?: Trend;
}

/** Coastal/tide interaction (optional; only when applicable) */
export interface CoastalInteraction {
  tidePhase?: "Flood" | "Ebb" | "Slack" | "Unknown";
  tidalCurrentKts?: number;
  shoalingRisk?: "Low" | "Moderate" | "High" | "Unknown";
  barInletRiskNote?: string;
}

/** Model comparison (optional) */
export interface ModelComparison {
  waveHeightModelM?: number;
  waveHeightObsM?: number;
  deltaWaveHeightM?: number; // obs - model
  windSpeedModelKts?: number;
  windSpeedObsKts?: number;
  deltaWindSpeedKts?: number;
  modelName?: string;        // "WW3", "HRRR", etc.
}

/** Your single payload for the Nerdy card */
export interface NerdyData {
  // identifiers/context
  zoneId?: string;           // "PZZ370"
  zoneName?: string;
  wfo?: string;

  buoyId?: string;           // "46050"
  buoyName?: string;

  // core data
  obs: SeaStateObs;

  // optional richer blocks
  components?: WaveComponent[];
  mechanics?: WaveMechanics;
  windWave?: WindWaveInteraction;
  coastal?: CoastalInteraction;
  model?: ModelComparison;

  // risk + confidence
  riskLevel?: "Low" | "Moderate" | "High" | "Extreme";
  riskText?: string;

  confidence?: {
    level: ConfidenceLevel;
    score01?: number;        // 0..1
    drivers?: string[];      // short bullet reasons
  };

  // provenance
  sources: NerdySourceRef[];
}
