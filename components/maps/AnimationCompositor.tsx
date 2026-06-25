import React, { useEffect, useState } from 'react';

import {
  BufferedAtmosphericLayer,
  type AnimationBufferStatus,
} from './BufferedAtmosphericLayer';

type FrameLike = {
  id: string;
  iso: string;
  rasterId?: number;
};

type Props = {
  id: string;
  frames: FrameLike[];
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  opacity?: number;
  playing: boolean;
  intervalMs: number;
  blendMs: number;
  buildUrl: (frame: FrameLike, width: number, height: number) => string;
  onBufferStatus?: (status: AnimationBufferStatus) => void;
};

export type { AnimationBufferStatus } from './BufferedAtmosphericLayer';

// Record-mode previews use the same disk-backed, readiness-gated compositor
// as normal map playback. This keeps the visual preview and exported frame
// selection aligned instead of maintaining a second raster animation system.
export function AnimationCompositor(props: Props) {
  const {
    id,
    frames,
    coordinates,
    opacity = 1,
    playing,
    intervalMs,
    blendMs,
    buildUrl,
    onBufferStatus,
  } = props;
  const [frameIndex, setFrameIndex] = useState(() => Math.max(0, frames.length - 1));
  const [bufferStatus, setBufferStatus] = useState<AnimationBufferStatus | null>(null);

  useEffect(() => {
    setFrameIndex(Math.max(0, frames.length - 1));
    setBufferStatus(null);
  }, [frames]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const ready = bufferStatus?.ready ?? 0;
    const total = bufferStatus?.total ?? frames.length;
    const hasLead =
      ready >= Math.min(3, total) ||
      (bufferStatus?.buffering === false && ready >= Math.min(2, total));
    if (!hasLead) return;

    const timer = setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, Math.max(300, intervalMs));
    return () => clearInterval(timer);
  }, [bufferStatus, frames.length, intervalMs, playing]);

  const handleBufferStatus = (status: AnimationBufferStatus) => {
    setBufferStatus(status);
    onBufferStatus?.(status);
  };

  return (
    <BufferedAtmosphericLayer
      id={id}
      enabled={frames.length > 0}
      frames={frames}
      frameIndex={frameIndex}
      coordinates={coordinates}
      opacity={opacity}
      blendMs={blendMs}
      buildUrl={buildUrl}
      onBufferStatus={handleBufferStatus}
    />
  );
}
