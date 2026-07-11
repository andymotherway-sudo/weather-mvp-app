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

function formatRelativeFrameAge(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMin = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (diffMin <= 0) return 'Now';
  if (diffMin < 60) return `-${diffMin}m`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return mins ? `-${hours}h ${mins}m` : `-${hours}h`;
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
  modeLabel?: string;
  onCopyDiagnostics?: () => void;
  diagnosticsCopied?: boolean;
  onRecord?: () => void;
  recordDisabled?: boolean;
  recordBusy?: boolean;
  onSetFrame: (frameIndex: number) => void;
  onSetPlaying: (playing: boolean) => void;
};

function TimelineScrubberInner(props: TimelineScrubberProps) {
  const {
    frameIndex,
    playing,
    frames = [],
    modeLabel,
    onCopyDiagnostics,
    diagnosticsCopied,
    onRecord,
    recordDisabled,
    recordBusy,
    onSetFrame,
    onSetPlaying,
  } = props;

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
            label={playing ? 'II' : '>'}
            onPress={() => onSetPlaying(!playing)}
            disabled={playDisabled}
            active={playing}
          />
          <ControlButton
            label="<<"
            onPress={() => {
              if (playing) onSetPlaying(false);
              commitFrame(prevFrameIndex(idx, frameCount));
            }}
            disabled={frameCount < 1}
          />
          <ControlButton
            label=">>"
            onPress={() => {
              if (playing) onSetPlaying(false);
              commitFrame(nextFrameIndex(idx, frameCount));
            }}
            disabled={frameCount < 1}
          />
          {onRecord ? (
            <Pressable
              accessibilityLabel={recordBusy ? 'Saving animation' : 'Record animation'}
              onPress={onRecord}
              disabled={!!recordDisabled}
              style={[styles.recordButton, recordBusy ? styles.recordButtonBusy : null, recordDisabled ? styles.disabled : null]}
            >
              <View style={styles.recordDot} />
            </Pressable>
          ) : null}
          {onCopyDiagnostics ? (
            <Pressable
              accessibilityLabel="Copy radar diagnostics"
              onPress={onCopyDiagnostics}
              style={styles.diagnosticsButton}
            >
              <Text style={styles.diagnosticsButtonText}>{diagnosticsCopied ? 'Copied' : 'Diag'}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.labelCard}>
          <View style={styles.labelCardTop}>
            <Text style={styles.primaryLabel}>{label}</Text>
            <View style={[styles.modeBadge, playing ? styles.modeBadgeLive : scrubbing ? styles.modeBadgeScrub : null]}>
              <Text style={styles.modeBadgeText}>
                {scrubbing ? 'Scrubbing' : playing ? (modeLabel ?? 'Live loop') : 'Paused'}
              </Text>
            </View>
          </View>
          <Text style={styles.secondaryLabel}>
            {frameCount > 0 ? `${idxForUI + 1} of ${frameCount}` : 'No frames'}
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
          <Text style={styles.footerLabel}>{`${oldestLabel}  ${formatRelativeFrameAge(effectiveFrames[0]?.iso ?? '')}`.trim()}</Text>
          <Text style={styles.footerLabel}>{`${latestLabel}  ${formatRelativeFrameAge(effectiveFrames[frameCount - 1]?.iso ?? '')}`.trim()}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  controlButton: {
    minWidth: 44,
    height: 32,
    paddingHorizontal: 10,
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
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  recordButton: {
    width: 36,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.58)',
    backgroundColor: 'rgba(127,29,29,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonBusy: {
    backgroundColor: 'rgba(127,29,29,0.46)',
  },
  recordDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  diagnosticsButton: {
    minWidth: 44,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.28)',
    backgroundColor: 'rgba(14,116,144,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagnosticsButtonText: {
    color: 'rgba(224,242,254,0.96)',
    fontSize: 10,
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
  labelCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  primaryLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  secondaryLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  modeBadge: {
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  modeBadgeLive: {
    borderColor: 'rgba(125,211,252,0.25)',
    backgroundColor: 'rgba(96,165,250,0.18)',
  },
  modeBadgeScrub: {
    borderColor: 'rgba(196,181,253,0.25)',
    backgroundColor: 'rgba(139,92,246,0.16)',
  },
  modeBadgeText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 9,
    fontWeight: '900',
  },
  trackWrap: {
    gap: 6,
  },
  track: {
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  trackTick: {
    position: 'absolute',
    top: 6,
    bottom: 6,
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
    top: -5,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(125,211,252,0.18)',
  },
  knob: {
    position: 'absolute',
    top: 2,
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.34)',
    backgroundColor: '#dbeafe',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  footerLabel: {
    color: 'rgba(255,255,255,0.54)',
    fontSize: 10,
    fontWeight: '700',
  },
});

export const TimelineScrubber = React.memo(TimelineScrubberInner);
