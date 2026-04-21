import { describe, expect, it } from "vitest";
import {
  getAuthoritativeInterpolationDelayMs,
  isLoopbackHostname,
} from "./authoritativeLatency";

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
        snapshotWindowMs: 1000 / 30,
      }),
    ).toBeCloseTo((1000 / 30) * 0.38);
  });

  it("keeps the full snapshot window on non-loopback hosts", () => {
    expect(
      getAuthoritativeInterpolationDelayMs({
        hostname: "game.example.com",
        snapshotWindowMs: 1000 / 30,
      }),
    ).toBeCloseTo(1000 / 30);
  });
});
