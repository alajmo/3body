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

export const getAuthoritativeInterpolationDelayMs = ({
  hostname,
  snapshotWindowMs,
}: {
  hostname: string;
  snapshotWindowMs: number;
}): number => {
  const safeSnapshotWindowMs = Math.max(0, snapshotWindowMs);
  if (!isLoopbackHostname(hostname)) {
    return safeSnapshotWindowMs;
  }

  return safeSnapshotWindowMs * 0.38;
};
