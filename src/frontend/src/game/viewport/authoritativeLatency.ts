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

const getSafeSnapshotWindowMs = (snapshotWindowMs: number): number =>
  Math.max(0, snapshotWindowMs);

export const getAuthoritativeInterpolationDelayMs = ({
  hostname,
  snapshotWindowMs,
}: {
  hostname: string;
  snapshotWindowMs: number;
}): number => {
  const safeSnapshotWindowMs = getSafeSnapshotWindowMs(snapshotWindowMs);
  if (!isLoopbackHostname(hostname)) {
    return safeSnapshotWindowMs;
  }

  return safeSnapshotWindowMs * 0.38;
};

export const getAuthoritativeInterpolationMaxAlpha = ({
  hostname,
  snapshotWindowMs,
}: {
  hostname: string;
  snapshotWindowMs: number;
}): number => {
  const safeSnapshotWindowMs = getSafeSnapshotWindowMs(snapshotWindowMs);
  if (safeSnapshotWindowMs <= 0) {
    return 1;
  }

  const interpolationDelayMs = getAuthoritativeInterpolationDelayMs({
    hostname,
    snapshotWindowMs: safeSnapshotWindowMs,
  });
  const interpolationLeadMs = Math.max(
    0,
    safeSnapshotWindowMs - interpolationDelayMs,
  );

  return (
    1 +
    interpolationLeadMs / safeSnapshotWindowMs +
    AUTHORITATIVE_LATE_SNAPSHOT_GRACE_RATIO
  );
};

export const getAuthoritativeLateSnapshotThresholdMs = ({
  snapshotWindowMs,
}: {
  snapshotWindowMs: number;
}): number =>
  getSafeSnapshotWindowMs(snapshotWindowMs) *
  (1 + AUTHORITATIVE_LATE_SNAPSHOT_GRACE_RATIO);
