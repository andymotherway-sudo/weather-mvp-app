import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  Text,
  View,
} from 'react-native';

type FrameLike = { iso: string };

function clamp(i: number, n: number) {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(i)));
}

function nextFrameIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return (i + 1) % n;
}

function prevFrameIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return (i - 1 + n) % n;
}

function formatRadarFrameLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildFallbackFrames(opts?: { minutesBack?: number; stepMinutes?: number }): FrameLike[] {
  const minutesBack = opts?.minutesBack ?? 120;
  const stepMinutes = opts?.stepMinutes ?? 5;

  const now = Date.now();
  const out: FrameLike[] = [];

  for (let m = minutesBack; m >= 0; m -= stepMinutes) {
    const t = now - m * 60_000;
    out.push({ iso: new Date(t).toISOString() });
  }
  return out;
}

function Btn(props: { label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  const disabled = !!props.disabled;
  const active = !!props.active;

  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      style={{
        height: 36,
        minWidth: 44,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ color: 'white', fontWeight: '800' }}>{props.label}</Text>
    </Pressable>
  );
}

type TimelineScrubberProps = {
  frameIndex: number;
  playing: boolean;
  frames?: FrameLike[];
  onSetFrame: (frameIndex: number) => void;
  onSetPlaying: (playing: boolean) => void;
};

function TimelineScrubberInner(props: TimelineScrubberProps) {
  const { frameIndex, playing, frames = [], onSetFrame, onSetPlaying } = props;

  const fallbackFrames = useMemo(() => buildFallbackFrames({ minutesBack: 120, stepMinutes: 5 }), []);
  const effectiveFrames = frames.length ? frames : fallbackFrames;

  const frameCount = effectiveFrames.length;
  const idx = clamp(frameIndex, frameCount);

  const hasRealFrames = frames.length > 0;
  const playDisabled = frameCount < 2;

  const [trackW, setTrackW] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number>(idx);

  useEffect(() => {
    if (!scrubbing) setPreviewIdx(idx);
  }, [idx, scrubbing]);

  const idxForUI = scrubbing ? previewIdx : idx;

  const label = useMemo(() => {
    if (frameCount === 0) return 'Latest';
    const f = effectiveFrames[idxForUI];
    if (!f?.iso) return `Frame ${idxForUI}`;
    return formatRadarFrameLabel(f.iso);
  }, [effectiveFrames, idxForUI, frameCount]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackW(Math.max(0, Math.floor(e.nativeEvent.layout.width)));
  };

  const xToIndex = (x: number) => {
    if (frameCount <= 1 || trackW <= 1) return 0;
    const t = Math.max(0, Math.min(1, x / trackW));
    const i = Math.round(t * (frameCount - 1));
    return clamp(i, frameCount);
  };

  const commitFrame = (i: number) => {
    onSetFrame(clamp(i, frameCount));
  };

  const pausedOnceRef = useRef(false);

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => frameCount > 1,
      onMoveShouldSetPanResponder: () => frameCount > 1,
      onPanResponderGrant: (evt) => {
        if (frameCount <= 1) return;

        setScrubbing(true);
        pausedOnceRef.current = false;

        if (playing && !pausedOnceRef.current) {
          pausedOnceRef.current = true;
          onSetPlaying(false);
        }

        const x = evt.nativeEvent.locationX ?? 0;
        setPreviewIdx(xToIndex(x));
      },
      onPanResponderMove: (evt) => {
        if (frameCount <= 1) return;
        const x = evt.nativeEvent.locationX ?? 0;
        setPreviewIdx(xToIndex(x));
      },
      onPanResponderRelease: () => {
        setScrubbing(false);
        commitFrame(previewIdx);
      },
      onPanResponderTerminate: () => {
        setScrubbing(false);
        commitFrame(previewIdx);
      },
    });
  }, [frameCount, trackW, previewIdx, playing, onSetPlaying, onSetFrame]);

  const knobLeft = useMemo(() => {
    if (frameCount <= 1 || trackW <= 1) return 0;
    const t = idxForUI / (frameCount - 1);
    return Math.max(0, Math.min(trackW, Math.round(t * trackW)));
  }, [idxForUI, frameCount, trackW]);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Btn
          label={playing ? 'Pause' : 'Play'}
          onPress={() => onSetPlaying(!playing)}
          disabled={playDisabled}
          active={playing}
        />

        <Btn
          label="◀"
          onPress={() => {
            if (playing) onSetPlaying(false);
            commitFrame(prevFrameIndex(idx, frameCount));
          }}
          disabled={frameCount < 1}
        />

        <Btn
          label="▶"
          onPress={() => {
            if (playing) onSetPlaying(false);
            commitFrame(nextFrameIndex(idx, frameCount));
          }}
          disabled={frameCount < 1}
        />

        <View style={{ marginLeft: 6, flex: 1 }}>
          <Text style={{ color: 'white', fontWeight: '900' }}>{label}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.70)', marginTop: 2, fontSize: 12 }}>
            {hasRealFrames ? `${frames.length} frames` : 'No scan-times yet (fallback)'}
            {scrubbing ? ' · scrubbing' : ''}
          </Text>
        </View>
      </View>

      <View
        onLayout={onTrackLayout}
        {...panResponder.panHandlers}
        style={{
          height: 18,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.10)',
          backgroundColor: 'rgba(255,255,255,0.04)',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: knobLeft,
            backgroundColor: 'rgba(255,255,255,0.10)',
          }}
        />

        <View
          style={{
            position: 'absolute',
            left: Math.max(0, knobLeft - 9),
            width: 18,
            height: 18,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.18)',
            backgroundColor: 'rgba(255,255,255,0.14)',
          }}
        />
      </View>
    </View>
  );
}

export const TimelineScrubber = React.memo(TimelineScrubberInner);