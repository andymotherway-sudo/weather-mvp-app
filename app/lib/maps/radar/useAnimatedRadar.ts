// app/lib/maps/radar/useAnimatedRadar.ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { IEM_FRAMES, type IemFrame, iemFrameTemplate } from './providers/iem';

export type RadarFront = 'A' | 'B';

export type UseAnimatedRadarOptions = {
  enabled?: boolean; // default true (initial play state)
  intervalMs?: number; // default 1500 (initial speed)
  fadeMs?: number; // default 600
  opacity?: number; // default 0.75
  frames?: readonly IemFrame[]; // default IEM_FRAMES
};

export function useAnimatedRadar(opts: UseAnimatedRadarOptions = {}) {
  const {
    enabled = true,
    intervalMs = 1500,
    fadeMs = 600,
    opacity = 0.75,
    frames = IEM_FRAMES,
  } = opts;

  const [frameIndex, setFrameIndex] = useState(0);
  const [front, setFront] = useState<RadarFront>('A');

  // NEW: runtime controls
  const [isPlaying, setIsPlaying] = useState(enabled);
  const [speedMs, setSpeedMs] = useState(intervalMs);

  const [opacityA, setOpacityA] = useState(opacity);
  const [opacityB, setOpacityB] = useState(0);

  const [templateA, setTemplateA] = useState(iemFrameTemplate(frames[0] ?? 'latest'));
  const [templateB, setTemplateB] = useState(iemFrameTemplate(frames[1] ?? 'm05m'));

  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep opacities consistent if caller changes opacity
  useEffect(() => {
    if (front === 'A') {
      setOpacityA(opacity);
      setOpacityB(0);
    } else {
      setOpacityA(0);
      setOpacityB(opacity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opacity]);

  const nextFrame = useMemo(() => {
    const next = (frameIndex + 1) % frames.length;
    return frames[next] ?? 'latest';
  }, [frameIndex, frames]);

  function crossfade(direction: 'AtoB' | 'BtoA') {
    if (fadeTimer.current) clearInterval(fadeTimer.current);

    const steps = 10;
    const stepMs = Math.max(16, Math.floor(fadeMs / steps));

    let i = 0;

    fadeTimer.current = setInterval(() => {
      i += 1;
      const t = i / steps;

      if (direction === 'AtoB') {
        setOpacityA(opacity * (1 - t));
        setOpacityB(opacity * t);

        if (i >= steps) {
          setFront('B');
          clearInterval(fadeTimer.current!);
          fadeTimer.current = null;
        }
      } else {
        setOpacityB(opacity * (1 - t));
        setOpacityA(opacity * t);

        if (i >= steps) {
          setFront('A');
          clearInterval(fadeTimer.current!);
          fadeTimer.current = null;
        }
      }
    }, stepMs);
  }

  function jumpTo(targetIndex: number) {
  const len = frames.length;
  if (len === 0) return;

  const idx = ((targetIndex % len) + len) % len;
  const frame = frames[idx] ?? 'latest';
  const tpl = iemFrameTemplate(frame);

  // Load into the BACK layer, then crossfade
  if (front === 'A') {
    setTemplateB(tpl);
    crossfade('AtoB');
  } else {
    setTemplateA(tpl);
    crossfade('BtoA');
  }

  setFrameIndex(idx);
}
  // NEW: use isPlaying + speedMs so caller can pause/change speed live
  useEffect(() => {
    if (!isPlaying) return;
    if (frames.length < 2) return;

    const interval = setInterval(() => {
      const tpl = iemFrameTemplate(nextFrame);

      if (front === 'A') {
        setTemplateB(tpl);
        crossfade('AtoB');
      } else {
        setTemplateA(tpl);
        crossfade('BtoA');
      }

      setFrameIndex((i) => (i + 1) % frames.length);
    }, speedMs);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, front, nextFrame, speedMs, frames.length]);

  // Cleanup fade timer on unmount
  useEffect(() => {
    return () => {
      if (fadeTimer.current) clearInterval(fadeTimer.current);
    };
  }, []);

  return {
    templateA,
    templateB,
    opacityA,
    opacityB,
    front,

    frameIndex,
    frames,

    // NEW controls
    isPlaying,
    setIsPlaying,
    speedMs,
    setSpeedMs,

    // for future scrub controls
    setFrameIndex,
    setFront,
    jumpTo,
  };
}
