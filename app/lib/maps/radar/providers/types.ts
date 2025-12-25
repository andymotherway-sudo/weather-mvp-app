export type RadarFrame = {
  // RainViewer uses UNIX timestamps (seconds) for frames
  t: number;
  // derived for UI labels
  iso: string;
};

export type RadarTileParams = {
  frame: RadarFrame;
  z: number;
  x: number;
  y: number;
};

export type RadarProvider = {
  id: 'rainviewer' | 'iem' | string;
  maxZoom: number;               // provider constraint (RainViewer free may cap)
  getFrames: () => Promise<RadarFrame[]>;
  getTileUrlTemplate: (frame: RadarFrame) => string; // returns .../{z}/{x}/{y}.png
};
