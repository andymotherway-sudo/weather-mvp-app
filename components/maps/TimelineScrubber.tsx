// components/maps/TimelineScrubber.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { MapRuntimeState } from '../../app/lib/maps/types';

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

/**
 * Fallback frames (used when real scan times are missing).
 * These let the UI scrub/play while you’re still wiring scan-times.
 */
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

function Btn(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
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

export function TimelineScrubber(props: {
  state: MapRuntimeState;
  frames?: FrameLike[]; // real frames (preferred)
  onSetFrame: (frameIndex: number) => void;
  onSetPlaying: (playing: boolean) => void;
}) {
  const { state, frames = [], onSetFrame, onSetPlaying } = props;

  const fallbackFrames = useMemo(() => buildFallbackFrames({ minutesBack: 120, stepMinutes: 5 }), []);
  const effectiveFrames = frames.length ? frames : fallbackFrames;

  const frameCount = effectiveFrames.length;
  const idx = clamp(state.radarTime.frameIndex, frameCount);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!state.radarTime.playing) return;

    if (frameCount < 2) {
      onSetPlaying(false);
      return;
    }

    timerRef.current = setInterval(() => {
      onSetFrame(nextFrameIndex(idx, frameCount));
    }, 350);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.radarTime.playing, idx, frameCount, onSetFrame, onSetPlaying]);

  const label = useMemo(() => {
    if (frameCount === 0) return 'Latest';
    const f = effectiveFrames[idx];
    if (!f?.iso) return `Frame ${idx}`;
    return formatRadarFrameLabel(f.iso);
  }, [effectiveFrames, idx, frameCount]);

  const playDisabled = frameCount < 2;
  const hasRealFrames = frames.length > 0;

  return (
    // NOTE: no padding / borders here — parent overlay (Glass) provides that
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Btn
        label={state.radarTime.playing ? 'Pause' : 'Play'}
        onPress={() => onSetPlaying(!state.radarTime.playing)}
        disabled={playDisabled}
        active={state.radarTime.playing}
      />

      <Btn
        label="◀"
        onPress={() => onSetFrame(prevFrameIndex(idx, frameCount))}
        disabled={frameCount < 1}
      />

      <Btn
        label="▶"
        onPress={() => onSetFrame(nextFrameIndex(idx, frameCount))}
        disabled={frameCount < 1}
      />

      <View style={{ marginLeft: 6 }}>
        <Text style={{ color: 'white', fontWeight: '900' }}>{label}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.70)', marginTop: 2, fontSize: 12 }}>
          {hasRealFrames ? `${frames.length} frames` : 'No scan-times yet (fallback)'}
        </Text>
      </View>
    </View>
  );
}
