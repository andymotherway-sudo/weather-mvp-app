import MapLibreGL from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, useWindowDimensions } from 'react-native';

type FrameLike = {
  id: string;
  iso: string;
};

export type AnimationBufferStatus = {
  ready: number;
  total: number;
  buffering: boolean;
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

function clampIndex(index: number, count: number) {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor(index)));
}

function shortHash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function AnimationCompositor(props: Props) {
  const { width, height } = useWindowDimensions();
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

  const imageWidth = Math.max(512, Math.min(2048, Math.round(width * 1.65)));
  const imageHeight = Math.max(512, Math.min(2048, Math.round(height * 1.65)));
  const buildUrlRef = useRef(buildUrl);

  useEffect(() => {
    buildUrlRef.current = buildUrl;
  }, [buildUrl]);

  const urls = useMemo(
    () =>
      frames.map((frame) => ({
        frame,
        url: buildUrlRef.current(frame, imageWidth, imageHeight),
      })),
    [frames, imageHeight, imageWidth],
  );

  const [ready, setReady] = useState<Set<string>>(() => new Set());
  const [currentIndex, setCurrentIndex] = useState(() => Math.max(0, frames.length - 1));
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [blend, setBlend] = useState(1);
  const readyRef = useRef(ready);
  const currentIndexRef = useRef(currentIndex);

  useEffect(() => {
    readyRef.current = ready;
    onBufferStatus?.({ ready: ready.size, total: urls.length, buffering: ready.size < urls.length });
  }, [onBufferStatus, ready, urls.length]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    setReady(new Set());
    setCurrentIndex(Math.max(0, urls.length - 1));
    setPreviousIndex(null);
    setBlend(1);

    let cancelled = false;
    urls.forEach(({ url }) => {
      Image.prefetch(url)
        .then(() => {
          if (cancelled) return;
          setReady((current) => {
            if (current.has(url)) return current;
            const next = new Set(current);
            next.add(url);
            return next;
          });
        })
        .catch(() => {
          if (cancelled) return;
          // Mark failed frames ready so playback can skip past transient source gaps.
          setReady((current) => {
            if (current.has(url)) return current;
            const next = new Set(current);
            next.add(url);
            return next;
          });
        });
    });

    return () => {
      cancelled = true;
    };
  }, [urls]);

  useEffect(() => {
    if (!playing || urls.length < 2) return;

    const timer = setInterval(() => {
      const count = urls.length;
      const current = clampIndex(currentIndexRef.current, count);
      const next = current >= count - 1 ? 0 : current + 1;
      const nextUrl = urls[next]?.url;
      if (!nextUrl || !readyRef.current.has(nextUrl)) return;

      setPreviousIndex(current);
      setCurrentIndex(next);
      setBlend(0);
      currentIndexRef.current = next;
    }, Math.max(250, intervalMs));

    return () => clearInterval(timer);
  }, [intervalMs, playing, urls]);

  useEffect(() => {
    if (previousIndex == null) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const t = Math.max(0, Math.min(1, (Date.now() - startedAt) / Math.max(1, blendMs)));
      setBlend(t);
      if (t >= 1) {
        setPreviousIndex(null);
        clearInterval(timer);
      }
    }, 32);
    return () => clearInterval(timer);
  }, [blendMs, previousIndex]);

  if (!urls.length) return null;

  const current = urls[clampIndex(currentIndex, urls.length)];
  const previous = previousIndex == null ? null : urls[clampIndex(previousIndex, urls.length)];
  const safeOpacity = Math.max(0, Math.min(1, opacity));

  return (
    <>
      {previous ? (
        <MapLibreGL.ImageSource
          id={`${id}-prev-src-${shortHash(previous.url)}`}
          key={`${id}-prev-${previous.frame.id}-${shortHash(previous.url)}`}
          url={previous.url}
          coordinates={coordinates}
        >
          <MapLibreGL.RasterLayer
            id={`${id}-prev-lyr-${shortHash(previous.url)}`}
            sourceID={`${id}-prev-src-${shortHash(previous.url)}`}
            style={{
              rasterOpacity: safeOpacity * (1 - blend),
              rasterFadeDuration: 0,
              rasterResampling: 'linear',
            } as any}
          />
        </MapLibreGL.ImageSource>
      ) : null}

      {current ? (
        <MapLibreGL.ImageSource
          id={`${id}-current-src-${shortHash(current.url)}`}
          key={`${id}-current-${current.frame.id}-${shortHash(current.url)}`}
          url={current.url}
          coordinates={coordinates}
        >
          <MapLibreGL.RasterLayer
            id={`${id}-current-lyr-${shortHash(current.url)}`}
            sourceID={`${id}-current-src-${shortHash(current.url)}`}
            style={{
              rasterOpacity: safeOpacity * (previous ? blend : 1),
              rasterFadeDuration: 0,
              rasterResampling: 'linear',
            } as any}
          />
        </MapLibreGL.ImageSource>
      ) : null}
    </>
  );
}
