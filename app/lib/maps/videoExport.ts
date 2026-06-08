import { NativeModules, Platform } from 'react-native';

export type AnimationVideoFrame = {
  label: string;
  urls: string[];
  underlayUrls?: string[];
  tileTemplate?: string | null;
  basemapTemplate?: string | null;
  basemapOverlayTemplate?: string | null;
  region?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null;
  zoom?: number | null;
  opacity?: number | null;
};

export type AnimationVideoExportOptions = {
  frames: AnimationVideoFrame[];
  title: string;
  subtitle: string;
  productLabel: string;
  width?: number;
  height?: number;
  fps?: number;
  secondsPerSourceFrame?: number;
  transitionSeconds?: number;
};

export type AnimationVideoExportResult = {
  uri: string;
  filePath?: string;
  width: number;
  height: number;
  frameCount: number;
};

type NativeVideoExport = {
  exportAnimation(options: Required<AnimationVideoExportOptions>): Promise<AnimationVideoExportResult>;
};

const nativeExporter = NativeModules.OmniwxVideoExport as NativeVideoExport | undefined;

// Video export is native-only because React Native/MapLibre do not provide a
// reliable way to record the composed map surface into an MP4. Android builds
// expose OmniwxVideoExport through MainApplication.
export function canExportAnimationVideo() {
  return Platform.OS === 'android' && !!nativeExporter?.exportAnimation;
}

export async function exportAnimationVideo(options: AnimationVideoExportOptions) {
  if (!canExportAnimationVideo() || !nativeExporter) {
    throw new Error('Video export is available on Android builds only.');
  }

  const frames = options.frames
    .map((frame) => ({
      label: frame.label,
      urls: frame.urls.filter(Boolean),
      underlayUrls: frame.underlayUrls?.filter(Boolean) ?? [],
      tileTemplate: frame.tileTemplate ?? null,
      basemapTemplate: frame.basemapTemplate ?? null,
      basemapOverlayTemplate: frame.basemapOverlayTemplate ?? null,
      region: frame.region ?? null,
      zoom: frame.zoom ?? null,
      opacity: frame.opacity ?? null,
    }))
    .filter((frame) => frame.urls.length > 0 || frame.underlayUrls.length > 0 || !!frame.tileTemplate);

  // Native export expects every source frame to have at least one prepared
  // image layer or renderable tile template. Rejecting here gives the UI a
  // useful message before Kotlin starts allocating bitmaps/video encoders.
  if (frames.length < 2) {
    throw new Error('At least two prepared frames are required for video export.');
  }

  return nativeExporter.exportAnimation({
    frames,
    title: options.title,
    subtitle: options.subtitle,
    productLabel: options.productLabel,
    // Defaults are landscape-friendly; callers can override dimensions for
    // portrait exports so infrared/true-color recordings keep the phone shape.
    width: options.width ?? 1280,
    height: options.height ?? 720,
    fps: options.fps ?? 30,
    secondsPerSourceFrame: options.secondsPerSourceFrame ?? 0.52,
    transitionSeconds: options.transitionSeconds ?? 0.22,
  });
}
