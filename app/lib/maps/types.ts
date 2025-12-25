// app/lib/maps/types.ts

export type MapViewId = 'radar' | 'wildfire' | 'storm' | 'aviation';

export type LayerId =
  | 'radar.reflectivity'
  | 'wildfire.smoke'
  | 'wildfire.perimeters'
  | 'wildfire.hotspots'
  | 'alerts.polygons'
  | 'lightning.strikes';

export type LayerKind = 'tile' | 'geojson';

export type NerdyVisibility = 'simple' | 'nerdy' | 'both';

export type TimestampMode =
  | 'radar_timeline'     // scrubbable frames
  | 'latest_snapshot'    // “latest only”
  | 'daily_snapshot';    // “daily analysis” style

export type LatLon = { lat: number; lon: number };

export type MapViewport = {
  center: LatLon;
  zoom: number; // abstract zoom; map lib can translate
  bounds?: { north: number; south: number; east: number; west: number };
};

export type LayerDefinition = {
  id: LayerId;
  title: string;
  kind: LayerKind;
  visibility: NerdyVisibility;
  defaultOpacity: number; // 0..1
  timestampMode: TimestampMode;
  // Used for ordering overlays
  zIndex: number;
};

export type MapViewDefinition = {
  id: MapViewId;
  title: string;
  // Layers that should be enabled when user selects this view
  presetEnabledLayers: LayerId[];
  // Optional: per-view opacity tweaks
  presetLayerOpacity?: Partial<Record<LayerId, number>>;
  // Which layer controls the timeline for this view (Radar does)
  timelineDriverLayer?: LayerId;
};

export type LayerRuntimeState = {
  enabled: boolean;
  opacity: number; // 0..1
};

export type MapRuntimeState = {
  viewId: MapViewId;
  nerdy: boolean;
  viewport: MapViewport;

  // Layer states (enabled/opacity). Starts from view preset, can be overridden.
  layers: Record<LayerId, LayerRuntimeState>;

  // Timeline state (radar)
  radarTime: {
    // index into frames array
    frameIndex: number;
    playing: boolean;
  };

  // Wildfire snapshots typically “latest”; keep optional timestamp if you add historical later
  wildfireTime?: {
    asOfIso: string; // metadata label
  };
};
