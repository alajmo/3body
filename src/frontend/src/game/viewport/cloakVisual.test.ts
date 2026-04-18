import { FIXED_STEP_SEC } from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  CLOAK_DURATION_SEC,
  CLOAK_FADE_TAIL_SEC,
  CLOAK_PLANET_FADE_IN_SEC,
  CLOAK_PLANET_TARGET_OPACITY,
  getCloakPlanetOpacity,
} from "./cloakVisual";

const secToTicks = (sec: number) => Math.round(sec / FIXED_STEP_SEC);
const secToSettledTicks = (sec: number) => Math.ceil(sec / FIXED_STEP_SEC);

describe("getCloakPlanetOpacity", () => {
  it("returns full opacity when cloak is inactive", () => {
    expect(getCloakPlanetOpacity(0, 120)).toBe(1);
    expect(getCloakPlanetOpacity(240, 240)).toBe(1);
  });

  it("eases planet opacity down to the cloak target when cloak starts", () => {
    const startTick = 240;
    const hideTrailUntilTick = startTick + secToTicks(CLOAK_DURATION_SEC);

    expect(getCloakPlanetOpacity(hideTrailUntilTick, startTick)).toBe(1);
    expect(
      getCloakPlanetOpacity(
        hideTrailUntilTick,
        startTick + secToTicks(CLOAK_PLANET_FADE_IN_SEC * 0.5),
      ),
    ).toBeCloseTo(0.75, 2);
    expect(
      getCloakPlanetOpacity(
        hideTrailUntilTick,
        startTick + secToSettledTicks(CLOAK_PLANET_FADE_IN_SEC),
      ),
    ).toBeCloseTo(CLOAK_PLANET_TARGET_OPACITY, 2);
  });

  it("holds the target opacity through the middle of the cloak", () => {
    const startTick = 240;
    const hideTrailUntilTick = startTick + secToTicks(CLOAK_DURATION_SEC);

    expect(
      getCloakPlanetOpacity(
        hideTrailUntilTick,
        startTick + secToTicks(CLOAK_DURATION_SEC * 0.5),
      ),
    ).toBeCloseTo(CLOAK_PLANET_TARGET_OPACITY, 2);
  });

  it("eases back to full opacity as cloak expires", () => {
    const startTick = 240;
    const hideTrailUntilTick = startTick + secToTicks(CLOAK_DURATION_SEC);

    expect(
      getCloakPlanetOpacity(
        hideTrailUntilTick,
        hideTrailUntilTick - secToTicks(CLOAK_FADE_TAIL_SEC * 0.5),
      ),
    ).toBeCloseTo(0.75, 2);
    expect(getCloakPlanetOpacity(hideTrailUntilTick, hideTrailUntilTick)).toBe(
      1,
    );
  });
});
