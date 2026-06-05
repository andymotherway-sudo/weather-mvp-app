import { NativeModules, Platform } from 'react-native';

export type AnimationVideoFrame = {
  label: string;
  urls: string[];
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
    }))
    .filter((frame) => frame.urls.length > 0);

  if (frames.length < 2) {
    throw new Error('At least two prepared frames are required for video export.');
  }

  return nativeExporter.exportAnimation({
    frames,
    title: options.title,
    subtitle: options.subtitle,
    productLabel: options.productLabel,
    width: options.width ?? 1280,
    height: options.height ?? 720,
    fps: options.fps ?? 30,
    secondsPerSourceFrame: options.secondsPerSourceFrame ?? 0.52,
    transitionSeconds: options.transitionSeconds ?? 0.22,
  });
}
