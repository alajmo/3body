import { SNAPSHOT_HZ } from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  getAuthoritativeInterpolationDelayMs,
  getAuthoritativeInterpolationMaxAlpha,
  getAuthoritativeLateSnapshotThresholdMs,
  isLoopbackHostname,
} from "./authoritativeLatency";

const snapshotWindowMs = 1000 / SNAPSHOT_HZ;

describe("authoritativeLatency", () => {
  it("detects loopback hostnames used in local dev", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("game.example.com")).toBe(false);
  });

  it("reduces interpolation delay on loopback hosts", () => {
    expect(
      getAuthoritativeInterpolationDelayMs({
        hostname: "localhost",
        snapshotWindowMs,
      }),
    ).toBeCloseTo(snapshotWindowMs * 0.38);
  });

  it("keeps the full snapshot window on non-loopback hosts", () => {
    expect(
      getAuthoritativeInterpolationDelayMs({
        hostname: "game.example.com",
        snapshotWindowMs,
      }),
    ).toBeCloseTo(snapshotWindowMs);
  });

  it("allows enough localhost extrapolation to bridge the shorter holdback", () => {
    expect(
      getAuthoritativeInterpolationMaxAlpha({
        hostname: "localhost",
        snapshotWindowMs,
      }),
    ).toBeCloseTo(1.77);
  });

  it("keeps remote extrapolation conservative when snapshots arrive late", () => {
    expect(
      getAuthoritativeInterpolationMaxAlpha({
        hostname: "game.example.com",
        snapshotWindowMs,
      }),
    ).toBeCloseTo(1.15);
  });

  it("treats snapshots as late only after the expected cadence plus grace", () => {
    expect(
      getAuthoritativeLateSnapshotThresholdMs({
        snapshotWindowMs,
      }),
    ).toBeCloseTo(snapshotWindowMs * 1.15);
  });
});
