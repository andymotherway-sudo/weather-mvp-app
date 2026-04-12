import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

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

function ControlButton(props: { label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  const disabled = !!props.disabled;
  const active = !!props.active;

  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      style={[styles.controlButton, active ? styles.controlButtonActive : null, disabled ? styles.disabled : null]}
    >
      <Text style={styles.controlButtonText}>{props.label}</Text>
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
    const frame = effectiveFrames[idxForUI];
    if (!frame?.iso) return `Frame ${idxForUI + 1}`;
    return formatRadarFrameLabel(frame.iso);
  }, [effectiveFrames, idxForUI, frameCount]);

  const oldestLabel = useMemo(() => {
    if (frameCount === 0) return 'Past';
    return formatRadarFrameLabel(effectiveFrames[0]?.iso ?? '');
  }, [effectiveFrames, frameCount]);

  const latestLabel = useMemo(() => {
    if (frameCount === 0) return 'Now';
    return formatRadarFrameLabel(effectiveFrames[frameCount - 1]?.iso ?? '');
  }, [effectiveFrames, frameCount]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackW(Math.max(0, Math.floor(e.nativeEvent.layout.width)));
  };

  const xToIndex = useCallback((x: number) => {
    if (frameCount <= 1 || trackW <= 1) return 0;
    const t = Math.max(0, Math.min(1, x / trackW));
    const i = Math.round(t * (frameCount - 1));
    return clamp(i, frameCount);
  }, [frameCount, trackW]);

  const commitFrame = useCallback((i: number) => {
    onSetFrame(clamp(i, frameCount));
  }, [frameCount, onSetFrame]);

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
  }, [commitFrame, frameCount, playing, previewIdx, xToIndex, onSetPlaying]);

  const knobLeft = useMemo(() => {
    if (frameCount <= 1 || trackW <= 1) return 0;
    const t = idxForUI / (frameCount - 1);
    return Math.max(0, Math.min(trackW, Math.round(t * trackW)));
  }, [idxForUI, frameCount, trackW]);

  const progressWidth = useMemo(() => Math.max(16, knobLeft), [knobLeft]);

  const tickPositions = useMemo(() => {
    const ticks = Math.min(7, Math.max(2, frameCount));
    if (ticks <= 1) return [] as number[];

    return Array.from({ length: ticks }, (_, tickIndex) => {
      if (trackW <= 0) return 0;
      const t = tickIndex / (ticks - 1);
      return Math.round(t * trackW);
    });
  }, [frameCount, trackW]);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.controlsRow}>
          <ControlButton
            label={playing ? 'Pause' : 'Play'}
            onPress={() => onSetPlaying(!playing)}
            disabled={playDisabled}
            active={playing}
          />
          <ControlButton
            label="Prev"
            onPress={() => {
              if (playing) onSetPlaying(false);
              commitFrame(prevFrameIndex(idx, frameCount));
            }}
            disabled={frameCount < 1}
          />
          <ControlButton
            label="Next"
            onPress={() => {
              if (playing) onSetPlaying(false);
              commitFrame(nextFrameIndex(idx, frameCount));
            }}
            disabled={frameCount < 1}
          />
        </View>

        <View style={styles.labelCard}>
          <Text style={styles.primaryLabel}>{label}</Text>
          <Text style={styles.secondaryLabel}>
            {frameCount > 0 ? `${idxForUI + 1} of ${frameCount}` : 'No frames'}
            {scrubbing ? '  /  Scrubbing' : playing ? '  /  Live loop' : '  /  Holding'}
          </Text>
        </View>
      </View>

      <View style={styles.trackWrap}>
        <View onLayout={onTrackLayout} {...panResponder.panHandlers} style={styles.track}>
          {tickPositions.map((left, index) => (
            <View
              key={`${left}-${index}`}
              pointerEvents="none"
              style={[styles.trackTick, { left: Math.max(0, Math.min(trackW - 2, left - 1)) }]}
            />
          ))}

          <View pointerEvents="none" style={[styles.trackProgress, { width: progressWidth }]} />
          <View pointerEvents="none" style={[styles.knobHalo, { left: Math.max(0, knobLeft - 18) }]} />
          <View pointerEvents="none" style={[styles.knob, { left: Math.max(0, knobLeft - 11) }]} />
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerLabel}>{oldestLabel}</Text>
          <Text style={styles.footerLabel}>{latestLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    minWidth: 54,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(96,165,250,0.20)',
    borderColor: 'rgba(125,211,252,0.28)',
  },
  controlButtonText: {
    color: 'rgba(255,255,255,0.94)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  disabled: {
    opacity: 0.45,
  },
  labelCard: {
    flex: 1,
    paddingVertical: 2,
  },
  primaryLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  secondaryLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  trackWrap: {
    gap: 8,
  },
  track: {
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  trackTick: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    width: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  trackProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(96,165,250,0.20)',
  },
  knobHalo: {
    position: 'absolute',
    top: -4,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(125,211,252,0.18)',
  },
  knob: {
    position: 'absolute',
    top: 3,
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.34)',
    backgroundColor: '#dbeafe',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerLabel: {
    color: 'rgba(255,255,255,0.54)',
    fontSize: 11,
    fontWeight: '700',
  },
});

export const TimelineScrubber = React.memo(TimelineScrubberInner);
