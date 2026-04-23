import { resolve } from "node:path";
import { SIM_HZ, SNAPSHOT_HZ } from "@3body/shared";

const LOCAL_DEV_ALLOWED_ORIGINS = [
  "http://127.0.0.1:1337",
  "http://localhost:1337",
  "http://[::1]:1337",
  "http://127.0.0.1:8080",
  "http://localhost:8080",
  "http://[::1]:8080",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://[::1]:5173",
];

const DEFAULT_DATA_DIR = resolve(import.meta.dir, "../../..", ".data");

const parseIntegerEnv = (
  name: string,
  fallback: number,
  minimum = 1,
): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }

  return value;
};

const parseOriginsEnv = (
  name: string,
  fallback: readonly string[],
): string[] => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return [...fallback];
  }

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};

const tickHz = parseIntegerEnv("TICK_HZ", SIM_HZ);
if (tickHz % SNAPSHOT_HZ !== 0) {
  throw new Error(
    `TICK_HZ (${tickHz}) must be divisible by SNAPSHOT_HZ (${SNAPSHOT_HZ})`,
  );
}

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  tickHz: number;
  snapshotHz: number;
  snapshotIntervalTicks: number;
  snapshotHistoryTicks: number;
  snapshotTelemetryIntervalMs: number;
  maxRooms: number;
  roomIdleTimeoutMs: number;
  reclaimGraceMs: number;
  shutdownGraceMs: number;
  allowedOrigins: string[];
  wsMaxMsgBytes: number;
  maxSocketsPerIp: number;
  handshakesPerIpPerMin: number;
  createsPerIpPer10m: number;
  joinsPerIpPerMin: number;
  chatBurst: number;
  chatWindowMs: number;
  chatMaxChars: number;
  outboundQueueMaxBytes: number;
}

export const config: AppConfig = {
  port: parseIntegerEnv("PORT", 8080),
  host: process.env.HOST?.trim() || "127.0.0.1",
  dataDir: process.env.DATA_DIR?.trim() || DEFAULT_DATA_DIR,
  tickHz,
  snapshotHz: SNAPSHOT_HZ,
  snapshotIntervalTicks: tickHz / SNAPSHOT_HZ,
  snapshotHistoryTicks: tickHz * 5,
  snapshotTelemetryIntervalMs: parseIntegerEnv(
    "SNAPSHOT_TELEMETRY_INTERVAL_MS",
    0,
    0,
  ),
  maxRooms: parseIntegerEnv("MAX_ROOMS", 64),
  roomIdleTimeoutMs: parseIntegerEnv("ROOM_IDLE_TIMEOUT_MS", 60_000),
  reclaimGraceMs: parseIntegerEnv("RECLAIM_GRACE_MS", 30_000),
  shutdownGraceMs: parseIntegerEnv("SHUTDOWN_GRACE_MS", 10_000),
  allowedOrigins: parseOriginsEnv("ALLOWED_ORIGINS", LOCAL_DEV_ALLOWED_ORIGINS),
  wsMaxMsgBytes: parseIntegerEnv("WS_MAX_MSG_BYTES", 64 * 1024),
  maxSocketsPerIp: parseIntegerEnv("MAX_SOCKETS_PER_IP", 8),
  handshakesPerIpPerMin: parseIntegerEnv("HANDSHAKES_PER_IP_PER_MIN", 30),
  createsPerIpPer10m: parseIntegerEnv("CREATES_PER_IP_PER_10M", 12),
  joinsPerIpPerMin: parseIntegerEnv("JOINS_PER_IP_PER_MIN", 60),
  chatBurst: parseIntegerEnv("CHAT_BURST", 4),
  chatWindowMs: parseIntegerEnv("CHAT_WINDOW_MS", 5_000),
  chatMaxChars: parseIntegerEnv("CHAT_MAX_CHARS", 200),
  outboundQueueMaxBytes: parseIntegerEnv(
    "OUTBOUND_QUEUE_MAX_BYTES",
    1024 * 1024,
  ),
};
