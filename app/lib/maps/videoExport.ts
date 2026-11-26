import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import type { WindParticleExportSegment } from '../../../components/maps/WindParticleOverlay';

export type AnimationVideoFrame = {
  label: string;
  urls: string[];
  urlOpacities?: number[];
  underlayUrls?: string[];
  underlayOpacities?: number[];
  tileTemplate?: string | null;
  basemapTemplate?: string | null;
  basemapBoundaryTemplate?: string | null;
  basemapBoundaryOpacity?: number | null;
  basemapOverlayTemplate?: string | null;
  basemapOverlayOpacity?: number | null;
  region?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null;
  zoom?: number | null;
  opacity?: number | null;
  windSegments?: WindParticleExportSegment[];
  windOpacity?: number | null;
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
  minimumDurationSeconds?: number;
  /** Used to pair native progress events with the export the user started. */
  jobId?: string;
};

export type AnimationVideoExportResult = {
  uri: string;
  filePath?: string;
  width: number;
  height: number;
  frameCount: number;
};

export type AnimationVideoExportProgress = {
  jobId: string;
  stage: 'preparing' | 'encoding' | 'saving' | 'complete' | 'failed';
  completed: number;
  total: number;
  message: string;
};

type NativeVideoExport = {
  exportAnimation(options: {
    frames: AnimationVideoFrame[];
    title: string;
    subtitle: string;
    productLabel: string;
    width: number;
    height: number;
    fps: number;
    secondsPerSourceFrame: number;
    transitionSeconds: number;
    minimumDurationSeconds: number;
    jobId: string;
  }): Promise<AnimationVideoExportResult>;
};

const nativeExporter = NativeModules.OmniwxVideoExport as NativeVideoExport | undefined;
const VIDEO_EXPORT_PROGRESS_EVENT = 'omniwxVideoExportProgress';

// Video export is native-only because React Native/MapLibre do not provide a
// reliable way to record the composed map surface into an MP4. Android builds
// expose OmniwxVideoExport through MainApplication.
export function canExportAnimationVideo() {
  return Platform.OS === 'android' && !!nativeExporter?.exportAnimation;
}

export async function exportAnimationVideo(
  options: AnimationVideoExportOptions,
  onProgress?: (progress: AnimationVideoExportProgress) => void,
) {
  if (!canExportAnimationVideo() || !nativeExporter) {
    throw new Error('Video export is available on Android builds only.');
  }

  const frames = options.frames
    .map((frame) => ({
      label: frame.label,
      urls: frame.urls.filter(Boolean),
      urlOpacities: frame.urlOpacities ?? [],
      underlayUrls: frame.underlayUrls?.filter(Boolean) ?? [],
      underlayOpacities: frame.underlayOpacities ?? [],
      tileTemplate: frame.tileTemplate ?? null,
      basemapTemplate: frame.basemapTemplate ?? null,
      basemapBoundaryTemplate: frame.basemapBoundaryTemplate ?? null,
      basemapBoundaryOpacity: frame.basemapBoundaryOpacity ?? null,
      basemapOverlayTemplate: frame.basemapOverlayTemplate ?? null,
      basemapOverlayOpacity: frame.basemapOverlayOpacity ?? null,
      region: frame.region ?? null,
      zoom: frame.zoom ?? null,
      opacity: frame.opacity ?? null,
      windSegments: frame.windSegments ?? [],
      windOpacity: frame.windOpacity ?? null,
    }))
    .filter(
      (frame) =>
        frame.urls.length > 0 ||
        frame.underlayUrls.length > 0 ||
        !!frame.tileTemplate ||
        frame.windSegments.length > 0,
    );

  // Native export expects every source frame to have at least one prepared
  // image layer or renderable tile template. Rejecting here gives the UI a
  // useful message before Kotlin starts allocating bitmaps/video encoders.
  if (frames.length < 2) {
    throw new Error('At least two prepared frames are required for video export.');
  }

  const jobId = options.jobId ?? `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const subscription = onProgress
    ? DeviceEventEmitter.addListener(VIDEO_EXPORT_PROGRESS_EVENT, (progress: AnimationVideoExportProgress) => {
        if (progress?.jobId === jobId) onProgress(progress);
      })
    : null;

  try {
    return await nativeExporter.exportAnimation({
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
      minimumDurationSeconds: options.minimumDurationSeconds ?? 12,
      jobId,
    });
  } finally {
    subscription?.remove();
  }
}
