export const isLoopbackHostname = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("127.")
  );
};

const AUTHORITATIVE_LATE_SNAPSHOT_GRACE_RATIO = 0.15;
const AUTHORITATIVE_INTERPOLATION_DELAY_WINDOWS = 10;
const AUTHORITATIVE_ADAPTIVE_INTERPOLATION_MARGIN_WINDOWS = 1;
const AUTHORITATIVE_ADAPTIVE_INTERPOLATION_MAX_WINDOWS = 18;
const AUTHORITATIVE_ADAPTIVE_INTERPOLATION_RECOVERY_WINDOWS_PER_SEC = 2;
const AUTHORITATIVE_RENDER_CLOCK_BACKWARD_HOLD_TICKS = 2;
const AUTHORITATIVE_RENDER_CLOCK_CATCHUP_RATE = 1.08;
const AUTHORITATIVE_RENDER_CLOCK_DRIFT_TICKS = 0.5;
const AUTHORITATIVE_SNAPSHOT_SPACING_MIN_RATIO = 0.5;
const AUTHORITATIVE_SNAPSHOT_SPACING_MAX_RATIO = 3;

const getSafeSnapshotWindowMs = (snapshotWindowMs: number): number =>
  Math.max(0, snapshotWindowMs);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const getAuthoritativeInterpolationDelayMs = ({
  hostname,
  snapshotWindowMs,
}: {
  hostname: string;
  snapshotWindowMs: number;
}): number => {
  void hostname;
  return (
    getSafeSnapshotWindowMs(snapshotWindowMs) *
    AUTHORITATIVE_INTERPOLATION_DELAY_WINDOWS
  );
};

export const getAuthoritativeInterpolationMaxAlpha = ({
  hostname,
  snapshotWindowMs,
}: {
  hostname: string;
  snapshotWindowMs: number;
}): number => {
  // Holding the latest server state is less jarring than extrapolating and
  // snapping backward when LAN/browser timer jitter delays the next snapshot.
  void hostname;
  void snapshotWindowMs;

  return 1;
};

export const getAuthoritativeLateSnapshotThresholdMs = ({
  snapshotWindowMs,
}: {
  snapshotWindowMs: number;
}): number =>
  getSafeSnapshotWindowMs(snapshotWindowMs) *
  (1 + AUTHORITATIVE_LATE_SNAPSHOT_GRACE_RATIO);

export const getAuthoritativeAdaptiveInterpolationDelayMs = ({
  baseDelayMs,
  currentDelayMs,
  frameDeltaSec,
  snapshotGapMaxMs,
  snapshotGapP90Ms,
  snapshotWindowMs,
}: {
  baseDelayMs: number;
  currentDelayMs: number;
  frameDeltaSec: number;
  snapshotGapMaxMs: number;
  snapshotGapP90Ms: number;
  snapshotWindowMs: number;
}): number => {
  const safeSnapshotWindowMs = getSafeSnapshotWindowMs(snapshotWindowMs);
  const minDelayMs = Math.max(0, baseDelayMs);
  if (safeSnapshotWindowMs <= 0) {
    return minDelayMs;
  }

  const maxDelayMs =
    safeSnapshotWindowMs * AUTHORITATIVE_ADAPTIVE_INTERPOLATION_MAX_WINDOWS;
  const observedGapMs = Math.max(0, snapshotGapMaxMs, snapshotGapP90Ms);
  const targetDelayMs = clamp(
    Math.max(
      minDelayMs,
      observedGapMs +
        safeSnapshotWindowMs *
          AUTHORITATIVE_ADAPTIVE_INTERPOLATION_MARGIN_WINDOWS,
    ),
    minDelayMs,
    maxDelayMs,
  );
  const safeCurrentDelayMs = Number.isFinite(currentDelayMs)
    ? currentDelayMs
    : minDelayMs;

  if (targetDelayMs >= safeCurrentDelayMs) {
    return targetDelayMs;
  }

  const recoveryMs =
    safeSnapshotWindowMs *
    AUTHORITATIVE_ADAPTIVE_INTERPOLATION_RECOVERY_WINDOWS_PER_SEC *
    Math.max(0, frameDeltaSec);
  return Math.max(targetDelayMs, safeCurrentDelayMs - recoveryMs);
};

interface AuthoritativeInterpolationFrame {
  alpha: number;
  rawAlpha: number;
  snapshotAgeMs: number;
  snapshotSpacingMs: number;
  visuallyExtrapolating: boolean;
}

interface AuthoritativeRenderClockFrame {
  desiredRenderTick: number;
  renderTick: number;
}

interface AuthoritativeEstimatedClientTickFrame {
  clientTick: number;
}

interface AuthoritativeBufferedSnapshot {
  receivedAtMs: number;
  tick: number;
}

interface AuthoritativeBufferedInterpolationFrame<
  TSnapshot extends AuthoritativeBufferedSnapshot,
> {
  alpha: number;
  bufferDepth: number;
  current: TSnapshot;
  previous: TSnapshot;
  rawAlpha: number;
  renderTick: number;
  visuallyExtrapolating: boolean;
}

export const getAuthoritativeRenderClockFrame = ({
  frameDeltaSec,
  interpolationDelayMs,
  latestSnapshotReceivedAtMs,
  latestSnapshotTick,
  previousRenderTick,
  simHz,
  timeMs,
}: {
  frameDeltaSec: number;
  interpolationDelayMs: number;
  latestSnapshotReceivedAtMs: number;
  latestSnapshotTick: number;
  previousRenderTick: number | null;
  simHz: number;
  timeMs: number;
}): AuthoritativeRenderClockFrame => {
  const safeSimHz = Math.max(0, simHz);
  const elapsedTicks = Math.max(
    0,
    ((timeMs - latestSnapshotReceivedAtMs) * safeSimHz) / 1000,
  );
  const delayTicks = Math.max(0, (interpolationDelayMs * safeSimHz) / 1000);
  const desiredRenderTick = latestSnapshotTick + elapsedTicks - delayTicks;

  if (
    previousRenderTick === null ||
    !Number.isFinite(previousRenderTick) ||
    previousRenderTick > latestSnapshotTick
  ) {
    return {
      desiredRenderTick,
      renderTick: Math.min(latestSnapshotTick, desiredRenderTick),
    };
  }

  const driftTicks = desiredRenderTick - previousRenderTick;
  if (driftTicks < -AUTHORITATIVE_RENDER_CLOCK_BACKWARD_HOLD_TICKS) {
    return {
      desiredRenderTick,
      renderTick: Math.min(latestSnapshotTick, previousRenderTick),
    };
  }

  const clockRate =
    driftTicks > AUTHORITATIVE_RENDER_CLOCK_DRIFT_TICKS
      ? AUTHORITATIVE_RENDER_CLOCK_CATCHUP_RATE
      : 1;
  const renderTick =
    previousRenderTick + Math.max(0, frameDeltaSec) * safeSimHz * clockRate;

  return {
    desiredRenderTick,
    renderTick: Math.min(latestSnapshotTick, renderTick),
  };
};

export const getAuthoritativeEstimatedClientTickFrame = ({
  latestSnapshotReceivedAtMs,
  latestSnapshotTick,
  previousClientTick,
  simHz,
  timeMs,
}: {
  latestSnapshotReceivedAtMs: number;
  latestSnapshotTick: number;
  previousClientTick: number;
  simHz: number;
  timeMs: number;
}): AuthoritativeEstimatedClientTickFrame => {
  const safePreviousClientTick = Number.isFinite(previousClientTick)
    ? Math.max(0, Math.trunc(previousClientTick))
    : 0;
  const safeSimHz = Number.isFinite(simHz) ? Math.max(0, simHz) : 0;
  const safeLatestSnapshotTick = Number.isFinite(latestSnapshotTick)
    ? Math.max(0, Math.trunc(latestSnapshotTick))
    : safePreviousClientTick;
  const elapsedMs =
    Number.isFinite(timeMs) && Number.isFinite(latestSnapshotReceivedAtMs)
      ? Math.max(0, timeMs - latestSnapshotReceivedAtMs)
      : 0;
  const estimatedTick = Math.trunc(
    safeLatestSnapshotTick + (elapsedMs * safeSimHz) / 1000,
  );

  return {
    clientTick: Math.max(safePreviousClientTick, estimatedTick),
  };
};

export const getAuthoritativeSnapshotSpacingMs = ({
  previousSnapshotReceivedAtMs,
  snapshotReceivedAtMs,
  snapshotWindowMs,
}: {
  previousSnapshotReceivedAtMs: number | null;
  snapshotReceivedAtMs: number;
  snapshotWindowMs: number;
}): number => {
  const safeSnapshotWindowMs = getSafeSnapshotWindowMs(snapshotWindowMs);
  if (safeSnapshotWindowMs <= 0) {
    return 0;
  }

  const rawSpacingMs =
    previousSnapshotReceivedAtMs === null
      ? safeSnapshotWindowMs
      : snapshotReceivedAtMs - previousSnapshotReceivedAtMs;
  if (!Number.isFinite(rawSpacingMs) || rawSpacingMs <= 0) {
    return safeSnapshotWindowMs;
  }

  return clamp(
    rawSpacingMs,
    safeSnapshotWindowMs * AUTHORITATIVE_SNAPSHOT_SPACING_MIN_RATIO,
    safeSnapshotWindowMs * AUTHORITATIVE_SNAPSHOT_SPACING_MAX_RATIO,
  );
};

export const getAuthoritativeInterpolationFrame = ({
  interpolationDelayMs,
  maxAlpha,
  previousSnapshotReceivedAtMs,
  snapshotReceivedAtMs,
  snapshotWindowMs,
  timeMs,
}: {
  interpolationDelayMs: number;
  maxAlpha: number;
  previousSnapshotReceivedAtMs: number | null;
  snapshotReceivedAtMs: number;
  snapshotWindowMs: number;
  timeMs: number;
}): AuthoritativeInterpolationFrame => {
  const snapshotSpacingMs = getAuthoritativeSnapshotSpacingMs({
    previousSnapshotReceivedAtMs,
    snapshotReceivedAtMs,
    snapshotWindowMs,
  });
  const effectivePreviousSnapshotReceivedAtMs =
    previousSnapshotReceivedAtMs ?? snapshotReceivedAtMs - snapshotSpacingMs;
  const rawAlpha =
    snapshotSpacingMs <= 0
      ? 1
      : (timeMs -
          interpolationDelayMs -
          effectivePreviousSnapshotReceivedAtMs) /
        snapshotSpacingMs;
  const alpha = clamp(rawAlpha, 0, Math.max(1, maxAlpha));

  return {
    alpha,
    rawAlpha,
    snapshotAgeMs: Math.max(0, timeMs - snapshotReceivedAtMs),
    snapshotSpacingMs,
    visuallyExtrapolating: alpha > 1,
  };
};

export const getAuthoritativeBufferedInterpolationFrame = <
  TSnapshot extends AuthoritativeBufferedSnapshot,
>({
  maxAlpha,
  renderTick,
  snapshots,
}: {
  maxAlpha: number;
  renderTick: number;
  snapshots: readonly TSnapshot[];
}): AuthoritativeBufferedInterpolationFrame<TSnapshot> | null => {
  if (snapshots.length === 0) {
    return null;
  }

  if (snapshots.length === 1) {
    const snapshot = snapshots[0]!;
    return {
      alpha: 1,
      bufferDepth: 1,
      current: snapshot,
      previous: snapshot,
      rawAlpha: 1,
      renderTick: snapshot.tick,
      visuallyExtrapolating: false,
    };
  }

  const firstSnapshot = snapshots[0]!;
  const lastSnapshot = snapshots[snapshots.length - 1]!;
  const clampedRenderTick = clamp(
    renderTick,
    firstSnapshot.tick,
    lastSnapshot.tick,
  );
  let currentIndex = snapshots.findIndex(
    (snapshot) => snapshot.tick >= clampedRenderTick,
  );
  if (currentIndex < 0) {
    currentIndex = snapshots.length - 1;
  }

  if (currentIndex === 0) {
    return {
      alpha: 1,
      bufferDepth: snapshots.length,
      current: firstSnapshot,
      previous: firstSnapshot,
      rawAlpha: 1,
      renderTick: firstSnapshot.tick,
      visuallyExtrapolating: false,
    };
  }

  const previous = snapshots[currentIndex - 1]!;
  const current = snapshots[currentIndex]!;
  const tickSpan = current.tick - previous.tick;
  const rawAlpha =
    tickSpan <= 0 ? 1 : (clampedRenderTick - previous.tick) / tickSpan;
  const alpha = clamp(rawAlpha, 0, Math.max(1, maxAlpha));

  return {
    alpha,
    bufferDepth: snapshots.length,
    current,
    previous,
    rawAlpha,
    renderTick: clampedRenderTick,
    visuallyExtrapolating: alpha > 1,
  };
};
