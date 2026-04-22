import { describe, expect, it } from "vitest";
import { getSharedCombatLaunchBurstLayout } from "./sharedCombatLaunchBurstVisuals";

describe("getSharedCombatLaunchBurstLayout", () => {
  it("returns a positioned burst layout over time", () => {
    const layout = getSharedCombatLaunchBurstLayout({
      ageSec: 0.1,
      baseScale: { x: 20, y: 6 },
      direction: { x: 1, y: 0 },
      durationSec: 0.2,
      lengthMultiplierEnd: 0.94,
      lengthMultiplierStart: 1.1,
      origin: { x: 50, y: 10 },
      speed: 300,
      widthMultiplierEnd: 0.62,
      widthMultiplierStart: 0.96,
    });

    expect(layout).not.toBeNull();
    expect(layout!.angle).toBe(0);
    expect(layout!.length).toBeCloseTo(20.4);
    expect(layout!.width).toBeCloseTo(4.74);
    expect(layout!.center.x).toBeCloseTo(90.2);
    expect(layout!.center.y).toBe(10);
  });

  it("returns null when the burst has not started or has expired", () => {
    expect(
      getSharedCombatLaunchBurstLayout({
        ageSec: -0.01,
        baseScale: { x: 20, y: 6 },
        direction: { x: 0, y: 1 },
        durationSec: 0.2,
        lengthMultiplierEnd: 0.94,
        lengthMultiplierStart: 1.1,
        origin: { x: 0, y: 0 },
        speed: 300,
        widthMultiplierEnd: 0.62,
        widthMultiplierStart: 0.96,
      }),
    ).toBeNull();
    expect(
      getSharedCombatLaunchBurstLayout({
        ageSec: 0.25,
        baseScale: { x: 20, y: 6 },
        direction: { x: 0, y: 1 },
        durationSec: 0.2,
        lengthMultiplierEnd: 0.94,
        lengthMultiplierStart: 1.1,
        origin: { x: 0, y: 0 },
        speed: 300,
        widthMultiplierEnd: 0.62,
        widthMultiplierStart: 0.96,
      }),
    ).toBeNull();
  });
});
