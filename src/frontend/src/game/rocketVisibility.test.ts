import { describe, expect, it } from "vitest";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import {
  getCannonMuzzleDistance,
  getCannonMuzzleOrigin,
  getLaunchBurstHandoffDuration,
  getLaunchBurstTravelDistance,
  getMaxConcurrentRocketsForControllers,
  getMinScreenAxisScale,
  getRocketVisibleDistanceThreshold,
  isRocketPastVisibleMuzzle,
  ROCKET_RENDER_INSTANCE_LIMITS,
} from "./rocketVisibility";

describe("rocketVisibility", () => {
  it("keeps local sandbox rocket caps above the theoretical concurrent fire limit", () => {
    const controllerCount = DEFAULT_ORBIT_PRESET.planets.length;

    for (const rocketKind of ["light", "heavy", "seeker"] as const) {
      expect(
        getMaxConcurrentRocketsForControllers(controllerCount, rocketKind),
      ).toBeLessThanOrEqual(ROCKET_RENDER_INSTANCE_LIMITS[rocketKind]);
    }
  });

  it("clamps the rendered rocket width to a minimum screen-space size", () => {
    expect(
      getMinScreenAxisScale(
        { x: 24, y: 0.8 },
        1.8,
        2,
      ),
    ).toEqual({
      x: 24,
      y: 3.6,
    });
    expect(
      getMinScreenAxisScale(
        { x: 24, y: 4.2 },
        1.8,
        2,
      ),
    ).toEqual({
      x: 24,
      y: 4.2,
    });
  });

  it("computes the cannon muzzle tip from the rendered cannon layout", () => {
    const muzzleDistance = getCannonMuzzleDistance(44, 4, 11, 26);

    expect(muzzleDistance).toBe(85);
    expect(
      getCannonMuzzleOrigin(
        { x: 100, y: 50 },
        { x: 1, y: 0 },
        muzzleDistance,
      ),
    ).toEqual({
      x: 185,
      y: 50,
    });
  });

  it("hides the rocket body until it fully clears the rendered muzzle", () => {
    expect(getRocketVisibleDistanceThreshold(85, 24)).toBe(73);
    expect(isRocketPastVisibleMuzzle(42, 85, 24)).toBe(false);
    expect(isRocketPastVisibleMuzzle(73, 85, 24)).toBe(true);
  });

  it("moves the launch burst by rocket speed over real elapsed time", () => {
    expect(getLaunchBurstTravelDistance(0.125, 560)).toBe(70);
    expect(getLaunchBurstTravelDistance(-1, 560)).toBe(0);
  });

  it("extends the launch burst until the hidden rocket can take over", () => {
    expect(getLaunchBurstHandoffDuration(64, 73, 560)).toBeCloseTo(9 / 560);
    expect(getLaunchBurstHandoffDuration(80, 73, 560)).toBe(0);
  });
});
