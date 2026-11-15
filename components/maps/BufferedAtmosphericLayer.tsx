import MapLibreGL from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PixelRatio, useWindowDimensions } from 'react-native';

import { cacheAtmosphericFrame } from '../../app/lib/maps/animationFrameCache';

export type AnimationBufferStatus = {
  ready: number;
  total: number;
  buffering: boolean;
  failed?: number;
};

type FrameLike = {
  id: string;
  iso: string;
  rasterId?: number;
  sourceId?: string;
};

type ImageCorners = [[number, number], [number, number], [number, number], [number, number]];

type Slot = {
  frameId: string;
  requestId: string;
  localUri: string;
  coordinates: ImageCorners;
};

type Props = {
  id: string;
  enabled: boolean;
  frames: FrameLike[];
  frameIndex: number;
  coordinates: ImageCorners;
  opacity: number;
  blendMs: number;
  transitionMode?: 'crossfade' | 'cut';
  pixelRatioCap?: number;
  maxImageWidth?: number;
  maxImageHeight?: number;
  previewMaxImageWidth?: number;
  previewMaxImageHeight?: number;
  buildUrl: (frame: FrameLike, width: number, height: number) => string;
  onBufferStatus?: (status: AnimationBufferStatus) => void;
  onDisplayReady?: (ready: boolean) => void;
};

function clampIndex(index: number, count: number) {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor(index)));
}

function coordinateKey(coordinates: ImageCorners) {
  return coordinates.flat().map((value) => Number(value).toFixed(4)).join(',');
}

function shortHash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function BufferedAtmosphericLayer(props: Props) {
  const {
    id,
    enabled,
    frames,
    frameIndex,
    coordinates,
    opacity,
    blendMs,
    transitionMode = 'crossfade',
    pixelRatioCap = 1,
    maxImageWidth = 1152,
    maxImageHeight = 1408,
    previewMaxImageWidth,
    previewMaxImageHeight,
    buildUrl,
    onBufferStatus,
    onDisplayReady,
  } = props;
  const window = useWindowDimensions();
  const frameScale = frames.length >= 18 ? 1.02 : frames.length >= 12 ? 1.12 : 1.28;
  const deviceScale = Math.min(Math.max(1, PixelRatio.get()), Math.max(1, pixelRatioCap));
  const requestedWidth = Math.max(576, Math.round(window.width * frameScale * deviceScale));
  const requestedHeight = Math.max(640, Math.round(window.height * frameScale * deviceScale));
  // Clamp the long edge without changing the viewport aspect ratio. Independent
  // caps stretch a viewport image when MapLibre projects it onto the map.
  const imageScale = Math.min(1, maxImageWidth / requestedWidth, maxImageHeight / requestedHeight);
  const imageWidth = Math.max(128, Math.round(requestedWidth * imageScale));
  const imageHeight = Math.max(128, Math.round(requestedHeight * imageScale));
  const previewScale =
    previewMaxImageWidth && previewMaxImageHeight
      ? Math.min(1, previewMaxImageWidth / imageWidth, previewMaxImageHeight / imageHeight)
      : 1;
  const previewWidth = Math.max(128, Math.round(imageWidth * previewScale));
  const previewHeight = Math.max(128, Math.round(imageHeight * previewScale));
  const buildUrlRef = useRef(buildUrl);
  const onBufferStatusRef = useRef(onBufferStatus);
  const onDisplayReadyRef = useRef(onDisplayReady);
  const frameIndexRef = useRef(frameIndex);
  const opacityRef = useRef(opacity);

  useEffect(() => {
    buildUrlRef.current = buildUrl;
  }, [buildUrl]);
  useEffect(() => {
    onBufferStatusRef.current = onBufferStatus;
  }, [onBufferStatus]);
  useEffect(() => {
    onDisplayReadyRef.current = onDisplayReady;
  }, [onDisplayReady]);
  useEffect(() => {
    frameIndexRef.current = frameIndex;
  }, [frameIndex]);
  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  const viewportKey = coordinateKey(coordinates);
  const framesKey = useMemo(
    () => frames.map((frame) => `${frame.id}:${frame.iso}:${frame.rasterId ?? ''}:${frame.sourceId ?? ''}`).join('|'),
    [frames],
  );
  const requests = useMemo(
    () => {
      // The URL builder closes over the viewport. Reading the key here makes
      // that relationship explicit without retaining the full region object.
      void viewportKey;
      return frames.map((frame) => {
        const remoteUrl = buildUrlRef.current(frame, imageWidth, imageHeight);
        return {
          frame,
          remoteUrl,
          requestId: `${frame.id}:${shortHash(remoteUrl)}`,
        };
      });
    },
    [framesKey, imageHeight, imageWidth, viewportKey],
  );

  const [cachedUris, setCachedUris] = useState<Map<string, string>>(() => new Map());
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [previewSlot, setPreviewSlot] = useState<{
    sourceRequestId: string;
    requestId: string;
    localUri: string;
  } | null>(null);
  const [slots, setSlots] = useState<[Slot | null, Slot | null]>([null, null]);
  const frontSlotRef = useRef<0 | 1>(0);
  const displayedRequestIdRef = useRef<string | null>(null);
  const transitioningRequestIdRef = useRef<string | null>(null);
  const transitionTokenRef = useRef(0);
  const slotOpacityRefs = useRef<[Animated.Value, Animated.Value]>([
    new Animated.Value(0),
    new Animated.Value(0),
  ]);
  const activeFadeRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    transitionTokenRef.current += 1;
    setCachedUris(new Map());
    setFailedIds(new Set());
    setPreviewSlot(null);
    setSlots([null, null]);
    activeFadeRef.current?.stop();
    activeFadeRef.current = null;
    slotOpacityRefs.current[0].setValue(0);
    slotOpacityRefs.current[1].setValue(0);
    displayedRequestIdRef.current = null;
    transitioningRequestIdRef.current = null;
    onDisplayReadyRef.current?.(false);
  }, [id]);

  useEffect(() => {
    if (!enabled || !requests.length) {
      setCachedUris(new Map());
      setFailedIds(new Set());
      setPreviewSlot(null);
      setSlots([null, null]);
      activeFadeRef.current?.stop();
      activeFadeRef.current = null;
      slotOpacityRefs.current[0].setValue(0);
      slotOpacityRefs.current[1].setValue(0);
      displayedRequestIdRef.current = null;
      transitioningRequestIdRef.current = null;
      onDisplayReadyRef.current?.(false);
      return;
    }

    let cancelled = false;
    transitionTokenRef.current += 1;
    transitioningRequestIdRef.current = null;
    activeFadeRef.current?.stop();
    activeFadeRef.current = null;
    const heldFront = frontSlotRef.current;
    slotOpacityRefs.current[heldFront].setValue(Math.max(0, Math.min(1, opacityRef.current)));
    slotOpacityRefs.current[heldFront === 0 ? 1 : 0].setValue(0);

    const activeRequestIds = new Set(requests.map((request) => request.requestId));
    setCachedUris((current) => {
      const next = new Map<string, string>();
      current.forEach((localUri, requestId) => {
        if (activeRequestIds.has(requestId)) next.set(requestId, localUri);
      });
      return next;
    });
    setFailedIds((current) => {
      const next = new Set<string>();
      current.forEach((requestId) => {
        if (activeRequestIds.has(requestId)) next.add(requestId);
      });
      return next;
    });
    onBufferStatusRef.current?.({
      ready: 0,
      total: requests.length,
      buffering: true,
      failed: 0,
    });

    const desired = clampIndex(frameIndexRef.current, requests.length);
    const order = requests
      .map((_, index) => index)
      .sort((a, b) => {
        const distanceA = (a - desired + requests.length) % requests.length;
        const distanceB = (b - desired + requests.length) % requests.length;
        return distanceA - distanceB;
      });

    const worker = async (queue: number[]) => {
      while (queue.length && !cancelled) {
        const index = queue.shift();
        if (index == null) return;
        const request = requests[index];
        try {
          const localUri = await cacheAtmosphericFrame(request.remoteUrl);
          if (cancelled) return;
          setCachedUris((current) => {
            const next = new Map(current);
            next.set(request.requestId, localUri);
            return next;
          });
        } catch {
          if (cancelled) return;
          setFailedIds((current) => {
            const next = new Set(current);
            next.add(request.requestId);
            return next;
          });
        }
      }
    };

    const queue = [...order];
    const warmPreviewThenBuffer = async () => {
      const previewEnabled = previewScale < 1;
      const firstRequest = requests[desired];

      if (previewEnabled && firstRequest) {
        const previewRemoteUrl = buildUrlRef.current(firstRequest.frame, previewWidth, previewHeight);
        const previewRequestId = `${firstRequest.frame.id}:preview:${shortHash(previewRemoteUrl)}`;
        try {
          // Give the lightweight current frame the first download/render slot.
          // Once it is visible, the existing bounded workers fetch the sharp
          // frame and remaining loop without raising renderer concurrency.
          const localUri = await cacheAtmosphericFrame(previewRemoteUrl);
          if (cancelled) return;
          setPreviewSlot({
            sourceRequestId: firstRequest.requestId,
            requestId: previewRequestId,
            localUri,
          });
        } catch {
          // Preview is an optimization only; full-resolution buffering remains
          // the source of truth and can recover independently.
        }
      }

      if (!cancelled) await Promise.all([worker(queue), worker(queue)]);
    };

    setPreviewSlot(null);
    void warmPreviewThenBuffer();
    return () => {
      cancelled = true;
    };
  }, [enabled, previewHeight, previewScale, previewWidth, requests]);

  useEffect(() => {
    const requestIds = new Set(requests.map((request) => request.requestId));
    let ready = 0;
    cachedUris.forEach((_, requestId) => {
      if (requestIds.has(requestId)) ready += 1;
    });
    let failed = 0;
    failedIds.forEach((requestId) => {
      if (requestIds.has(requestId)) failed += 1;
    });
    const total = requests.length;
    onBufferStatusRef.current?.({
      ready,
      total,
      buffering: enabled && ready + failed < total,
      failed,
    });
  }, [cachedUris, enabled, failedIds, requests]);

  const desiredIndex = clampIndex(frameIndex, requests.length);
  const desiredRequest = requests[desiredIndex] ?? null;
  const fullResolutionUri = desiredRequest ? cachedUris.get(desiredRequest.requestId) ?? null : null;
  const desiredPreview =
    desiredRequest && previewSlot?.sourceRequestId === desiredRequest.requestId ? previewSlot : null;
  const desiredLocalUri = fullResolutionUri ?? desiredPreview?.localUri ?? null;
  const desiredDisplayRequestId = fullResolutionUri
    ? desiredRequest?.requestId ?? null
    : desiredPreview?.requestId ?? null;

  useEffect(() => {
    if (!enabled || !desiredRequest || !desiredLocalUri || !desiredDisplayRequestId) return;
    const desiredFrame = desiredRequest.frame;
    if (
      displayedRequestIdRef.current === desiredDisplayRequestId ||
      transitioningRequestIdRef.current === desiredDisplayRequestId
    ) return;

    const token = transitionTokenRef.current + 1;
    transitionTokenRef.current = token;
    transitioningRequestIdRef.current = desiredDisplayRequestId;
    const slotOpacities = slotOpacityRefs.current;
    const currentFront = frontSlotRef.current;
    const nextFront: 0 | 1 = currentFront === 0 ? 1 : 0;
    const nextSlot: Slot = {
      frameId: desiredFrame.id,
      requestId: desiredDisplayRequestId,
      localUri: desiredLocalUri,
      coordinates,
    };

    setSlots((current) => {
      const next: [Slot | null, Slot | null] = [...current] as [Slot | null, Slot | null];
      next[nextFront] = nextSlot;
      return next;
    });

    const firstFrame = displayedRequestIdRef.current == null;
    const completeCut = () => {
      if (transitionTokenRef.current !== token) return;
      const safeOpacity = Math.max(0, Math.min(1, opacity));
      displayedRequestIdRef.current = desiredDisplayRequestId;
      transitioningRequestIdRef.current = null;
      frontSlotRef.current = nextFront;
      slotOpacities[currentFront].setValue(0);
      slotOpacities[nextFront].setValue(safeOpacity);
      if (firstFrame) onDisplayReadyRef.current?.(true);
    };

    if (transitionMode === 'cut') {
      // A cached file is not necessarily attached to MapLibre yet. Keep the
      // current source fully visible while the inactive source mounts, then
      // swap only after later render commits and a decode window. This is
      // deliberately not a fade: the outgoing frame remains fully visible.
      // Android needs more than a single render beat for high-density GeoColor
      // rasters; changing opacity earlier causes a black or flashing frame.
      let secondFrame: number | null = null;
      let decodeTimer: ReturnType<typeof setTimeout> | null = null;
      const firstFrameHandle = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          decodeTimer = setTimeout(completeCut, Math.max(180, Math.min(360, blendMs)));
        });
      });

      return () => {
        cancelAnimationFrame(firstFrameHandle);
        if (secondFrame != null) cancelAnimationFrame(secondFrame);
        if (decodeTimer != null) clearTimeout(decodeTimer);
        if (transitionTokenRef.current === token) {
          transitioningRequestIdRef.current = null;
          const heldFront = frontSlotRef.current;
          const safeOpacity = Math.max(0, Math.min(1, opacity));
          slotOpacities[heldFront].setValue(safeOpacity);
          slotOpacities[heldFront === 0 ? 1 : 0].setValue(0);
        }
      };
    }

    // The file is already downloaded. Give the native image source one render
    // beat to bind the local URI before changing opacity.
    const warmTimer = setTimeout(() => {
      if (transitionTokenRef.current !== token) return;
      const safeOpacity = Math.max(0, Math.min(1, opacity));
      activeFadeRef.current?.stop();
      slotOpacities[currentFront].setValue(safeOpacity);
      slotOpacities[nextFront].setValue(0);
      const fade = Animated.parallel([
        Animated.timing(slotOpacities[currentFront], {
          toValue: 0,
          duration: Math.max(1, blendMs),
          useNativeDriver: false,
        }),
        Animated.timing(slotOpacities[nextFront], {
          toValue: safeOpacity,
          duration: Math.max(1, blendMs),
          useNativeDriver: false,
        }),
      ]);
      activeFadeRef.current = fade;
      fade.start(({ finished }) => {
        if (!finished || transitionTokenRef.current !== token) return;
        activeFadeRef.current = null;
        displayedRequestIdRef.current = desiredDisplayRequestId;
        transitioningRequestIdRef.current = null;
        frontSlotRef.current = nextFront;
        slotOpacities[currentFront].setValue(0);
        slotOpacities[nextFront].setValue(safeOpacity);
      });
    }, 48);

    return () => {
      clearTimeout(warmTimer);
      if (transitionTokenRef.current === token) {
        activeFadeRef.current?.stop();
        activeFadeRef.current = null;
        transitioningRequestIdRef.current = null;
        const heldFront = frontSlotRef.current;
        const safeOpacity = Math.max(0, Math.min(1, opacity));
        slotOpacities[heldFront].setValue(safeOpacity);
        slotOpacities[heldFront === 0 ? 1 : 0].setValue(0);
      }
    };
  }, [blendMs, coordinates, desiredDisplayRequestId, desiredLocalUri, desiredRequest, enabled, opacity, transitionMode]);

  useEffect(() => {
    if (!enabled) return;
    const safeOpacity = Math.max(0, Math.min(1, opacity));
    slotOpacityRefs.current[frontSlotRef.current].setValue(safeOpacity);
  }, [enabled, opacity]);

  useEffect(() => {
    return () => {
      activeFadeRef.current?.stop();
      activeFadeRef.current = null;
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      {([0, 1] as const).map((slotIndex) => {
        const slot = slots[slotIndex];
        if (!slot) return null;
        return (
          <MapLibreGL.ImageSource
            // Keep the two native sources mounted for the lifetime of the
            // layer. Recreating them per frame makes Android hitch between
            // otherwise already-buffered GeoColor images.
            id={`${id}-slot-${slotIndex}-source`}
            key={`${id}-slot-${slotIndex}-source`}
            url={slot.localUri}
            coordinates={slot.coordinates}
          >
            <MapLibreGL.Animated.RasterLayer
              id={`${id}-slot-${slotIndex}-layer`}
              sourceID={`${id}-slot-${slotIndex}-source`}
              style={{
                rasterOpacity: slotOpacityRefs.current[slotIndex],
                rasterFadeDuration: 0,
                rasterResampling: 'linear',
              } as any}
            />
          </MapLibreGL.ImageSource>
        );
      })}
    </>
  );
}
