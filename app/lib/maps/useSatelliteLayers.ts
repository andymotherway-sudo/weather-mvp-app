import { useEffect, useMemo, useRef, useState } from 'react';

import {
  SATELLITE_FRAME_STEP_MINUTES,
  SATELLITE_LOOP_MINUTES_BACK,
  SATELLITE_PLAY_INTERVAL_MS,
  buildGibsDailyFrames,
  buildGibsImergFrames,
  buildSatelliteFrames,
  fetchNesdisAbi13Frames,
  fetchNesdisGeoColorFrames,
  type SatelliteFrame,
  type SatelliteLoopHours,
} from './satelliteLayers';

function clampIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(i)));
}

type SatelliteLayerArgs = {
  radarEnabled: boolean;
  animatedSatelliteEnabled: boolean;
  goesTrueColorEnabled: boolean;
  goesEastIrEnabled: boolean;
  globalPrecipEnabled: boolean;
  globalTrueColorEnabled: boolean;
  globalCloudTopsEnabled: boolean;
  globalInfraredEnabled: boolean;
};

export function useSatelliteLayers(args: SatelliteLayerArgs) {
  const {
    radarEnabled,
    animatedSatelliteEnabled,
    goesTrueColorEnabled,
    goesEastIrEnabled,
    globalPrecipEnabled,
    globalTrueColorEnabled,
    globalCloudTopsEnabled,
    globalInfraredEnabled,
  } = args;

  const [satelliteLoopHours, setSatelliteLoopHours] = useState<SatelliteLoopHours>(2);
  const satelliteLoopMinutes = satelliteLoopHours * 60;
  const satelliteFrameStepMinutes = SATELLITE_FRAME_STEP_MINUTES;
  const satellitePlayIntervalMs = SATELLITE_PLAY_INTERVAL_MS;
  const [satelliteFrames, setSatelliteFrames] = useState<SatelliteFrame[]>(() =>
    buildSatelliteFrames({ minutesBack: SATELLITE_LOOP_MINUTES_BACK }),
  );
  const [trueColorFrames, setTrueColorFrames] = useState<SatelliteFrame[]>([]);
  const [trueColorFrameStatus, setTrueColorFrameStatus] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
  const [infraredFrames, setInfraredFrames] = useState<SatelliteFrame[]>([]);
  const [infraredFrameStatus, setInfraredFrameStatus] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
  const [satelliteFrameIndex, setSatelliteFrameIndex] = useState(() =>
    Math.max(0, buildSatelliteFrames({ minutesBack: SATELLITE_LOOP_MINUTES_BACK }).length - 1),
  );
  const [satellitePlaying, setSatellitePlaying] = useState(false);
  const [satelliteBlend, setSatelliteBlend] = useState<{ from: number; to: number; t: number }>({
    from: satelliteFrameIndex,
    to: satelliteFrameIndex,
    t: 1,
  });
  const satelliteWasActiveRef = useRef(false);
  const satelliteFrameIndexRef = useRef(satelliteFrameIndex);
  const gibsImergFrames = useMemo(
    () => buildGibsImergFrames({ minutesBack: satelliteLoopMinutes }),
    [satelliteLoopMinutes],
  );
  const gibsDailyFrames = useMemo(() => buildGibsDailyFrames(), []);
  const satellitePlaybackFrames =
    goesTrueColorEnabled && trueColorFrames.length > 1
      ? trueColorFrames
      : goesEastIrEnabled && infraredFrames.length > 1
        ? infraredFrames
        : globalPrecipEnabled
          ? gibsImergFrames
          : globalTrueColorEnabled || globalCloudTopsEnabled || globalInfraredEnabled
            ? gibsDailyFrames
            : satelliteFrames;
  const satellitePlaybackFrameCount = satellitePlaybackFrames.length;
  const trueColorUsingCatalog = goesTrueColorEnabled && trueColorFrames.length > 1;
  const infraredUsingCatalog = goesEastIrEnabled && infraredFrames.length > 1;

  useEffect(() => {
    if (!goesTrueColorEnabled) {
      setTrueColorFrames([]);
      setTrueColorFrameStatus('idle');
      return;
    }

    let cancelled = false;
    setTrueColorFrameStatus('loading');
    fetchNesdisGeoColorFrames(satelliteLoopMinutes)
      .then((frames) => {
        if (cancelled) return;
        if (frames.length > 1) {
          setTrueColorFrames(frames);
          setSatelliteFrameIndex(frames.length - 1);
          setTrueColorFrameStatus('ready');
        } else {
          setTrueColorFrames([]);
          setTrueColorFrameStatus('fallback');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setTrueColorFrames([]);
        setTrueColorFrameStatus('fallback');
      });

    return () => {
      cancelled = true;
    };
  }, [goesTrueColorEnabled, satelliteLoopMinutes]);

  useEffect(() => {
    if (!goesEastIrEnabled) {
      setInfraredFrames([]);
      setInfraredFrameStatus('idle');
      return;
    }

    let cancelled = false;
    setInfraredFrameStatus('loading');
    fetchNesdisAbi13Frames(satelliteLoopMinutes)
      .then((frames) => {
        if (cancelled) return;
        if (frames.length > 1) {
          setInfraredFrames(frames);
          setSatelliteFrameIndex(frames.length - 1);
          setInfraredFrameStatus('ready');
        } else {
          setInfraredFrames([]);
          setInfraredFrameStatus('fallback');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setInfraredFrames([]);
        setInfraredFrameStatus('fallback');
      });

    return () => {
      cancelled = true;
    };
  }, [goesEastIrEnabled, satelliteLoopMinutes]);

  useEffect(() => {
    if (!animatedSatelliteEnabled) {
      satelliteWasActiveRef.current = false;
      setSatellitePlaying(false);
      return;
    }

    if (!satelliteWasActiveRef.current) {
      satelliteWasActiveRef.current = true;
      setSatelliteFrames(buildSatelliteFrames({ minutesBack: satelliteLoopMinutes, stepMinutes: satelliteFrameStepMinutes }));
      setSatelliteFrameIndex((current) => {
        const frames = buildSatelliteFrames({ minutesBack: satelliteLoopMinutes, stepMinutes: satelliteFrameStepMinutes });
        return clampIndex(current > 0 ? current : frames.length - 1, frames.length);
      });
      setSatellitePlaying(true);
    }
  }, [animatedSatelliteEnabled, satelliteLoopMinutes, satelliteFrameStepMinutes]);

  useEffect(() => {
    if (!animatedSatelliteEnabled) return;

    const refresh = setInterval(() => {
      setSatelliteFrames((current) => {
        const next = buildSatelliteFrames({ minutesBack: satelliteLoopMinutes, stepMinutes: satelliteFrameStepMinutes });
        if (current.length && current[current.length - 1]?.iso === next[next.length - 1]?.iso) return current;
        setSatelliteFrameIndex((index) => clampIndex(index + (next.length - current.length), next.length));
        return next;
      });
    }, 5 * 60_000);

    return () => clearInterval(refresh);
  }, [animatedSatelliteEnabled, satelliteLoopMinutes, satelliteFrameStepMinutes]);

  useEffect(() => {
    if (!animatedSatelliteEnabled) return;

    const next = buildSatelliteFrames({ minutesBack: satelliteLoopMinutes, stepMinutes: satelliteFrameStepMinutes });
    setSatelliteFrames((currentFrames) => {
      setSatelliteFrameIndex((current) => clampIndex(current + (next.length - currentFrames.length), next.length));
      return next;
    });
  }, [animatedSatelliteEnabled, satelliteLoopMinutes, satelliteFrameStepMinutes]);

  useEffect(() => {
    if (radarEnabled || !animatedSatelliteEnabled || !satellitePlaying || satellitePlaybackFrameCount < 2) return;

    const timer = setInterval(() => {
      setSatelliteFrameIndex((current) => (clampIndex(current, satellitePlaybackFrameCount) + 1) % satellitePlaybackFrameCount);
    }, satellitePlayIntervalMs);

    return () => clearInterval(timer);
  }, [animatedSatelliteEnabled, radarEnabled, satellitePlaybackFrameCount, satellitePlaying, satellitePlayIntervalMs]);

  useEffect(() => {
    if (!animatedSatelliteEnabled || satellitePlaybackFrameCount < 2) {
      setSatelliteBlend({ from: satelliteFrameIndex, to: satelliteFrameIndex, t: 1 });
      satelliteFrameIndexRef.current = satelliteFrameIndex;
      return;
    }

    const previous = clampIndex(satelliteFrameIndexRef.current, satellitePlaybackFrameCount);
    const next = clampIndex(satelliteFrameIndex, satellitePlaybackFrameCount);
    if (previous === next) {
      setSatelliteBlend({ from: next, to: next, t: 1 });
      satelliteFrameIndexRef.current = next;
      return;
    }

    const startedAt = Date.now();
    const blendMs = 650;
    setSatelliteBlend({ from: previous, to: next, t: 0 });
    satelliteFrameIndexRef.current = next;

    const timer = setInterval(() => {
      const raw = (Date.now() - startedAt) / blendMs;
      const t = Math.max(0, Math.min(1, raw));
      setSatelliteBlend({ from: previous, to: next, t });
      if (t >= 1) clearInterval(timer);
    }, 40);

    return () => clearInterval(timer);
  }, [animatedSatelliteEnabled, satelliteFrameIndex, satellitePlaybackFrameCount]);

  return {
    satelliteLoopHours,
    setSatelliteLoopHours,
    satelliteLoopMinutes,
    satelliteFrameStepMinutes,
    satelliteFrameIndex,
    setSatelliteFrameIndex,
    satellitePlaying,
    setSatellitePlaying,
    satelliteBlend,
    satellitePlaybackFrames,
    satellitePlaybackFrameCount,
    trueColorFrameStatus,
    infraredFrameStatus,
    trueColorUsingCatalog,
    infraredUsingCatalog,
  };
}
