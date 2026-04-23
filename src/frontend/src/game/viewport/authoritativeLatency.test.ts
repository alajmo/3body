import { SIM_HZ, SNAPSHOT_HZ } from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  getAuthoritativeAdaptiveInterpolationDelayMs,
  getAuthoritativeBufferedInterpolationFrame,
  getAuthoritativeEstimatedClientTickFrame,
  getAuthoritativeInterpolationDelayMs,
  getAuthoritativeInterpolationFrame,
  getAuthoritativeInterpolationMaxAlpha,
  getAuthoritativeLateSnapshotThresholdMs,
  getAuthoritativeRenderClockFrame,
  getAuthoritativeSnapshotSpacingMs,
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

  it("uses a ten snapshot delay to absorb browser timer jitter", () => {
    expect(
      getAuthoritativeInterpolationDelayMs({
        hostname: "localhost",
        snapshotWindowMs,
      }),
    ).toBeCloseTo(snapshotWindowMs * 10);
  });

  it("keeps the same jitter buffer on non-loopback hosts", () => {
    expect(
      getAuthoritativeInterpolationDelayMs({
        hostname: "game.example.com",
        snapshotWindowMs,
      }),
    ).toBeCloseTo(snapshotWindowMs * 10);
  });

  it("does not extrapolate loopback snapshots by default", () => {
    expect(
      getAuthoritativeInterpolationMaxAlpha({
        hostname: "localhost",
        snapshotWindowMs,
      }),
    ).toBeCloseTo(1);
  });

  it("does not extrapolate remote snapshots by default", () => {
    expect(
      getAuthoritativeInterpolationMaxAlpha({
        hostname: "game.example.com",
        snapshotWindowMs,
      }),
    ).toBeCloseTo(1);
  });

  it("treats snapshots as late only after the expected cadence plus grace", () => {
    expect(
      getAuthoritativeLateSnapshotThresholdMs({
        snapshotWindowMs,
      }),
    ).toBeCloseTo(snapshotWindowMs * 1.15);
  });

  it("grows the interpolation delay immediately for large receive jitter", () => {
    const baseDelayMs = snapshotWindowMs * 10;

    expect(
      getAuthoritativeAdaptiveInterpolationDelayMs({
        baseDelayMs,
        currentDelayMs: baseDelayMs,
        frameDeltaSec: snapshotWindowMs / 1000,
        snapshotGapMaxMs: 226,
        snapshotGapP90Ms: 32,
        snapshotWindowMs,
      }),
    ).toBeCloseTo(226 + snapshotWindowMs);
  });

  it("recovers adaptive interpolation delay slowly after jitter clears", () => {
    const baseDelayMs = snapshotWindowMs * 10;

    expect(
      getAuthoritativeAdaptiveInterpolationDelayMs({
        baseDelayMs,
        currentDelayMs: snapshotWindowMs * 15,
        frameDeltaSec: 0.5,
        snapshotGapMaxMs: 32,
        snapshotGapP90Ms: 18,
        snapshotWindowMs,
      }),
    ).toBeCloseTo(snapshotWindowMs * 14);
  });

  it("uses actual receive spacing between snapshots for interpolation", () => {
    const stretchedSpacingMs = snapshotWindowMs * 1.5;

    expect(
      getAuthoritativeSnapshotSpacingMs({
        previousSnapshotReceivedAtMs: 100,
        snapshotReceivedAtMs: 100 + stretchedSpacingMs,
        snapshotWindowMs,
      }),
    ).toBeCloseTo(stretchedSpacingMs);
  });

  it("starts partway into a late snapshot pair instead of snapping back to the previous endpoint", () => {
    const previousSnapshotReceivedAtMs = 100;
    const snapshotReceivedAtMs = previousSnapshotReceivedAtMs + 24;

    const frame = getAuthoritativeInterpolationFrame({
      interpolationDelayMs: snapshotWindowMs,
      maxAlpha: 1,
      previousSnapshotReceivedAtMs,
      snapshotReceivedAtMs,
      snapshotWindowMs,
      timeMs: snapshotReceivedAtMs,
    });

    expect(frame.alpha).toBeGreaterThan(0);
    expect(frame.alpha).toBeLessThan(1);
    expect(frame.visuallyExtrapolating).toBe(false);
  });

  it("holds the latest snapshot instead of visually extrapolating when a packet is late", () => {
    const frame = getAuthoritativeInterpolationFrame({
      interpolationDelayMs: snapshotWindowMs,
      maxAlpha: 1,
      previousSnapshotReceivedAtMs: 100,
      snapshotReceivedAtMs: 100 + snapshotWindowMs,
      snapshotWindowMs,
      timeMs: 100 + snapshotWindowMs * 3,
    });

    expect(frame.alpha).toBe(1);
    expect(frame.rawAlpha).toBeGreaterThan(1);
    expect(frame.visuallyExtrapolating).toBe(false);
  });

  it("advances the render clock monotonically instead of resetting on a late packet", () => {
    const previousFrame = getAuthoritativeRenderClockFrame({
      frameDeltaSec: snapshotWindowMs / 1000,
      interpolationDelayMs: snapshotWindowMs * 2,
      latestSnapshotReceivedAtMs: 100,
      latestSnapshotTick: 100,
      previousRenderTick: 98,
      simHz: SIM_HZ,
      timeMs: 116,
    });
    const latePacketFrame = getAuthoritativeRenderClockFrame({
      frameDeltaSec: 0,
      interpolationDelayMs: snapshotWindowMs * 2,
      latestSnapshotReceivedAtMs: 124,
      latestSnapshotTick: 101,
      previousRenderTick: previousFrame.renderTick,
      simHz: SIM_HZ,
      timeMs: 124,
    });

    expect(latePacketFrame.desiredRenderTick).toBeLessThan(
      previousFrame.renderTick,
    );
    expect(latePacketFrame.renderTick).toBeCloseTo(previousFrame.renderTick);
  });

  it("keeps advancing through small backward desired-clock jitter", () => {
    const frame = getAuthoritativeRenderClockFrame({
      frameDeltaSec: snapshotWindowMs / 1000,
      interpolationDelayMs: snapshotWindowMs * 10,
      latestSnapshotReceivedAtMs: 200,
      latestSnapshotTick: 110,
      previousRenderTick: 100.7,
      simHz: SIM_HZ,
      timeMs: 200,
    });

    expect(frame.desiredRenderTick).toBeCloseTo(100);
    expect(frame.renderTick).toBeCloseTo(101.7);
  });

  it("holds the render clock when it has already consumed most of the jitter buffer", () => {
    const frame = getAuthoritativeRenderClockFrame({
      frameDeltaSec: snapshotWindowMs / 1000,
      interpolationDelayMs: snapshotWindowMs * 10,
      latestSnapshotReceivedAtMs: 200,
      latestSnapshotTick: 104,
      previousRenderTick: 102,
      simHz: SIM_HZ,
      timeMs: 200,
    });

    expect(frame.desiredRenderTick).toBeCloseTo(94);
    expect(frame.renderTick).toBeCloseTo(102);
  });

  it("starts the render clock between server ticks", () => {
    const frame = getAuthoritativeRenderClockFrame({
      frameDeltaSec: 0,
      interpolationDelayMs: snapshotWindowMs * 10,
      latestSnapshotReceivedAtMs: 100,
      latestSnapshotTick: 100,
      previousRenderTick: null,
      simHz: SIM_HZ,
      timeMs: 100,
    });

    expect(frame.renderTick).toBeCloseTo(90);
  });

  it("estimates client action ticks from the latest authoritative snapshot age", () => {
    const frame = getAuthoritativeEstimatedClientTickFrame({
      latestSnapshotReceivedAtMs: 1_000,
      latestSnapshotTick: 240,
      previousClientTick: 0,
      simHz: SIM_HZ,
      timeMs: 1_050,
    });

    expect(frame.clientTick).toBe(243);
  });

  it("keeps estimated client action ticks monotonic across packet jitter", () => {
    const frame = getAuthoritativeEstimatedClientTickFrame({
      latestSnapshotReceivedAtMs: 1_100,
      latestSnapshotTick: 240,
      previousClientTick: 245,
      simHz: SIM_HZ,
      timeMs: 1_100,
    });

    expect(frame.clientTick).toBe(245);
  });

  it("selects a buffered server-tick interpolation pair", () => {
    const frame = getAuthoritativeBufferedInterpolationFrame({
      maxAlpha: 1,
      renderTick: 99.5,
      snapshots: [
        { receivedAtMs: 100, tick: 98 },
        { receivedAtMs: 116, tick: 99 },
        { receivedAtMs: 132, tick: 100 },
      ],
    });

    expect(frame?.previous.tick).toBe(99);
    expect(frame?.current.tick).toBe(100);
    expect(frame?.alpha).toBeCloseTo(0.5);
    expect(frame?.visuallyExtrapolating).toBe(false);
  });

  it("clamps buffered interpolation to the newest snapshot instead of extrapolating", () => {
    const frame = getAuthoritativeBufferedInterpolationFrame({
      maxAlpha: 1,
      renderTick: 106,
      snapshots: [
        { receivedAtMs: 100, tick: 100 },
        { receivedAtMs: 116, tick: 102 },
      ],
    });

    expect(frame?.renderTick).toBe(102);
    expect(frame?.alpha).toBe(1);
    expect(frame?.visuallyExtrapolating).toBe(false);
  });
});
