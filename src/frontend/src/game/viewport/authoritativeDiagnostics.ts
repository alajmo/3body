import { SIM_HZ, SNAPSHOT_HZ } from "@3body/shared";

export interface AuthoritativeNetworkTypeRate {
  bytesPerSec: number;
  messagesPerSec: number;
  type: string;
}

export interface AuthoritativeNetworkDiagnosticsSnapshot {
  inboundBytesPerSec: number;
  inboundByType: readonly AuthoritativeNetworkTypeRate[];
  inboundMessagesPerSec: number;
  outboundBytesPerSec: number;
  outboundByType: readonly AuthoritativeNetworkTypeRate[];
  outboundMessagesPerSec: number;
  serverSnapshotGapAverageMs: number;
  serverSnapshotGapMaxMs: number;
  serverSnapshotGapP90Ms: number;
  serverSnapshotLateCount: number;
  snapshotGapAverageMs: number;
  snapshotGapOver100Count: number;
  snapshotGapOver50Count: number;
  snapshotGapMaxMs: number;
  snapshotGapP90Ms: number;
  snapshotLastGapOver100AgeMs: number | null;
  snapshotLastGapOver50AgeMs: number | null;
  snapshotLateCount: number;
  snapshotMessagesPerSec: number;
  snapshotTickGapMax: number;
  windowSec: number;
}

export interface AuthoritativeRenderDiagnostics {
  bufferDepth: number;
  desiredRenderTick: number | null;
  interpolationAlpha: number;
  latestSnapshotAgeMs: number | null;
  renderTick: number | null;
  tickBehindLatest: number | null;
  visuallyExtrapolating: boolean;
}

interface WireSample {
  atMs: number;
  byteLength: number;
  type: string;
}

interface SnapshotGapSample {
  atMs: number;
  gapMs: number;
  late: boolean;
  tickGap: number;
}

const DEFAULT_NETWORK_DIAGNOSTICS_WINDOW_MS = 2000;
const MAX_TYPE_ROWS = 4;
const EXPECTED_SNAPSHOT_GAP_MS = 1000 / SNAPSHOT_HZ;
const EXPECTED_SNAPSHOT_TICK_GAP = Math.max(
  1,
  Math.round(SIM_HZ / SNAPSHOT_HZ),
);
const LATE_SNAPSHOT_GAP_MS = EXPECTED_SNAPSHOT_GAP_MS * 1.5;
const textEncoder =
  typeof TextEncoder === "undefined" ? null : new TextEncoder();

const createEmptyNetworkDiagnosticsSnapshot = (
  windowSec: number,
): AuthoritativeNetworkDiagnosticsSnapshot => ({
  inboundBytesPerSec: 0,
  inboundByType: [],
  inboundMessagesPerSec: 0,
  outboundBytesPerSec: 0,
  outboundByType: [],
  outboundMessagesPerSec: 0,
  snapshotGapAverageMs: 0,
  snapshotGapOver100Count: 0,
  snapshotGapOver50Count: 0,
  snapshotGapMaxMs: 0,
  snapshotGapP90Ms: 0,
  snapshotLastGapOver100AgeMs: null,
  snapshotLastGapOver50AgeMs: null,
  serverSnapshotGapAverageMs: 0,
  serverSnapshotGapMaxMs: 0,
  serverSnapshotGapP90Ms: 0,
  serverSnapshotLateCount: 0,
  snapshotLateCount: 0,
  snapshotMessagesPerSec: 0,
  snapshotTickGapMax: 0,
  windowSec,
});

const pruneWireSamples = (
  samples: WireSample[],
  oldestAllowedAtMs: number,
): void => {
  while (samples.length > 0 && samples[0]!.atMs < oldestAllowedAtMs) {
    samples.shift();
  }
};

const pruneSnapshotGapSamples = (
  samples: SnapshotGapSample[],
  oldestAllowedAtMs: number,
): void => {
  while (samples.length > 0 && samples[0]!.atMs < oldestAllowedAtMs) {
    samples.shift();
  }
};

const getRateWindowSec = (
  startedAtMs: number | null,
  nowMs: number,
  windowMs: number,
): number => {
  if (startedAtMs === null) {
    return 0;
  }

  return Math.min(windowMs / 1000, Math.max(1, (nowMs - startedAtMs) / 1000));
};

const summarizeTypeRates = (
  samples: readonly WireSample[],
  windowSec: number,
): AuthoritativeNetworkTypeRate[] => {
  if (windowSec <= 0 || samples.length === 0) {
    return [];
  }

  const byType = new Map<string, { bytes: number; messages: number }>();
  for (const sample of samples) {
    const current = byType.get(sample.type) ?? { bytes: 0, messages: 0 };
    current.bytes += sample.byteLength;
    current.messages += 1;
    byType.set(sample.type, current);
  }

  return [...byType.entries()]
    .map(([type, totals]) => ({
      bytesPerSec: totals.bytes / windowSec,
      messagesPerSec: totals.messages / windowSec,
      type,
    }))
    .sort((left, right) => right.bytesPerSec - left.bytesPerSec)
    .slice(0, MAX_TYPE_ROWS);
};

const isSnapshotMessageType = (type: string): boolean =>
  type === "deltaSnapshot" || type === "fullSnapshot" || type === "snapshotV2";

const getPercentile = (
  values: readonly number[],
  percentile: number,
): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentile) - 1),
  );
  return sorted[index]!;
};

const sumBytes = (samples: readonly WireSample[]): number =>
  samples.reduce((total, sample) => total + sample.byteLength, 0);

const countSnapshotGapsOver = (
  samples: readonly SnapshotGapSample[],
  thresholdMs: number,
): number => samples.filter((sample) => sample.gapMs > thresholdMs).length;

const getLastSnapshotGapAgeOver = (
  samples: readonly SnapshotGapSample[],
  thresholdMs: number,
  nowMs: number,
): number | null => {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index]!;
    if (sample.gapMs > thresholdMs) {
      return Math.max(0, nowMs - sample.atMs);
    }
  }

  return null;
};

export const getSocketPayloadByteLength = (value: unknown): number => {
  if (typeof value === "string") {
    return textEncoder?.encode(value).byteLength ?? value.length;
  }

  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }

  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return value.size;
  }

  return 0;
};

export const createAuthoritativeNetworkDiagnostics = (
  windowMs = DEFAULT_NETWORK_DIAGNOSTICS_WINDOW_MS,
): {
  getSnapshot: (nowMs: number) => AuthoritativeNetworkDiagnosticsSnapshot;
  recordInbound: (type: string, byteLength: number, nowMs: number) => void;
  recordOutbound: (type: string, byteLength: number, nowMs: number) => void;
  recordSnapshot: (
    type: string,
    tick: number,
    nowMs: number,
    serverSentAtMs?: number,
  ) => void;
  reset: (nowMs: number) => void;
} => {
  let startedAtMs: number | null = null;
  let lastSnapshotAtMs: number | null = null;
  let lastServerSnapshotAtMs: number | null = null;
  let lastSnapshotTick: number | null = null;
  const inboundSamples: WireSample[] = [];
  const outboundSamples: WireSample[] = [];
  const snapshotGapSamples: SnapshotGapSample[] = [];
  const serverSnapshotGapSamples: SnapshotGapSample[] = [];

  const ensureStarted = (nowMs: number) => {
    startedAtMs ??= nowMs;
  };

  const prune = (nowMs: number) => {
    const oldestAllowedAtMs = nowMs - windowMs;
    pruneWireSamples(inboundSamples, oldestAllowedAtMs);
    pruneWireSamples(outboundSamples, oldestAllowedAtMs);
    pruneSnapshotGapSamples(snapshotGapSamples, oldestAllowedAtMs);
    pruneSnapshotGapSamples(serverSnapshotGapSamples, oldestAllowedAtMs);
  };

  return {
    getSnapshot(nowMs) {
      ensureStarted(nowMs);
      prune(nowMs);
      const windowSec = getRateWindowSec(startedAtMs, nowMs, windowMs);
      if (windowSec <= 0) {
        return createEmptyNetworkDiagnosticsSnapshot(0);
      }

      const snapshotSamples = inboundSamples.filter((sample) =>
        isSnapshotMessageType(sample.type),
      );
      const snapshotGaps = snapshotGapSamples.map((sample) => sample.gapMs);
      const serverSnapshotGaps = serverSnapshotGapSamples.map(
        (sample) => sample.gapMs,
      );
      const snapshotTickGapMax = snapshotGapSamples.reduce(
        (maxGap, sample) => Math.max(maxGap, sample.tickGap),
        0,
      );

      return {
        inboundBytesPerSec: sumBytes(inboundSamples) / windowSec,
        inboundByType: summarizeTypeRates(inboundSamples, windowSec),
        inboundMessagesPerSec: inboundSamples.length / windowSec,
        outboundBytesPerSec: sumBytes(outboundSamples) / windowSec,
        outboundByType: summarizeTypeRates(outboundSamples, windowSec),
        outboundMessagesPerSec: outboundSamples.length / windowSec,
        serverSnapshotGapAverageMs:
          serverSnapshotGaps.length === 0
            ? 0
            : serverSnapshotGaps.reduce((total, gapMs) => total + gapMs, 0) /
              serverSnapshotGaps.length,
        serverSnapshotGapMaxMs:
          serverSnapshotGaps.length === 0 ? 0 : Math.max(...serverSnapshotGaps),
        serverSnapshotGapP90Ms: getPercentile(serverSnapshotGaps, 0.9),
        serverSnapshotLateCount: serverSnapshotGapSamples.filter(
          (sample) => sample.late,
        ).length,
        snapshotGapAverageMs:
          snapshotGaps.length === 0
            ? 0
            : snapshotGaps.reduce((total, gapMs) => total + gapMs, 0) /
              snapshotGaps.length,
        snapshotGapOver100Count: countSnapshotGapsOver(snapshotGapSamples, 100),
        snapshotGapOver50Count: countSnapshotGapsOver(snapshotGapSamples, 50),
        snapshotGapMaxMs:
          snapshotGaps.length === 0 ? 0 : Math.max(...snapshotGaps),
        snapshotGapP90Ms: getPercentile(snapshotGaps, 0.9),
        snapshotLastGapOver100AgeMs: getLastSnapshotGapAgeOver(
          snapshotGapSamples,
          100,
          nowMs,
        ),
        snapshotLastGapOver50AgeMs: getLastSnapshotGapAgeOver(
          snapshotGapSamples,
          50,
          nowMs,
        ),
        snapshotLateCount: snapshotGapSamples.filter((sample) => sample.late)
          .length,
        snapshotMessagesPerSec: snapshotSamples.length / windowSec,
        snapshotTickGapMax,
        windowSec,
      };
    },
    recordInbound(type, byteLength, nowMs) {
      ensureStarted(nowMs);
      inboundSamples.push({ atMs: nowMs, byteLength, type });
      prune(nowMs);
    },
    recordOutbound(type, byteLength, nowMs) {
      ensureStarted(nowMs);
      outboundSamples.push({ atMs: nowMs, byteLength, type });
      prune(nowMs);
    },
    recordSnapshot(type, tick, nowMs, serverSentAtMs) {
      ensureStarted(nowMs);
      if (
        type !== "fullSnapshot" &&
        lastSnapshotAtMs !== null &&
        lastSnapshotTick !== null
      ) {
        const gapMs = Math.max(0, nowMs - lastSnapshotAtMs);
        const tickGap = Math.max(0, tick - lastSnapshotTick);
        snapshotGapSamples.push({
          atMs: nowMs,
          gapMs,
          late:
            gapMs > LATE_SNAPSHOT_GAP_MS ||
            tickGap > EXPECTED_SNAPSHOT_TICK_GAP,
          tickGap,
        });
      }
      if (
        type !== "fullSnapshot" &&
        serverSentAtMs !== undefined &&
        Number.isFinite(serverSentAtMs) &&
        lastServerSnapshotAtMs !== null
      ) {
        const gapMs = Math.max(0, serverSentAtMs - lastServerSnapshotAtMs);
        const tickGap = Math.max(0, tick - (lastSnapshotTick ?? tick));
        serverSnapshotGapSamples.push({
          atMs: nowMs,
          gapMs,
          late:
            gapMs > LATE_SNAPSHOT_GAP_MS ||
            tickGap > EXPECTED_SNAPSHOT_TICK_GAP,
          tickGap,
        });
      }
      lastSnapshotAtMs = nowMs;
      if (serverSentAtMs !== undefined && Number.isFinite(serverSentAtMs)) {
        lastServerSnapshotAtMs = serverSentAtMs;
      }
      lastSnapshotTick = tick;
      prune(nowMs);
    },
    reset(nowMs) {
      startedAtMs = nowMs;
      lastSnapshotAtMs = null;
      lastServerSnapshotAtMs = null;
      lastSnapshotTick = null;
      inboundSamples.length = 0;
      outboundSamples.length = 0;
      snapshotGapSamples.length = 0;
      serverSnapshotGapSamples.length = 0;
    },
  };
};
