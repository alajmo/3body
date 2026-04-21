import {
  cloneGameTuningDocument,
  CURRENT_GAME_TUNING,
  FIXED_STEP_SEC,
} from "@3body/shared";
import { afterEach, describe, expect, it } from "vitest";
import { applyRuntimeTuningDocument } from "./runtimeTuning";
import {
  createShowcaseOrbitOverviewSimulation,
  getShowcaseOrbitOverviewPositionScale,
  stepShowcaseOrbitOverviewSimulation,
} from "./showcaseOrbitOverview";

const resetRuntimeTuning = () => {
  applyRuntimeTuningDocument(cloneGameTuningDocument(CURRENT_GAME_TUNING));
};

afterEach(() => {
  resetRuntimeTuning();
});

describe("showcaseOrbitOverview", () => {
  it("returns a stable positive position scale", () => {
    const simulationState = createShowcaseOrbitOverviewSimulation();

    expect(
      getShowcaseOrbitOverviewPositionScale(simulationState.currentState),
    ).toBeGreaterThan(0);
  });

  it("releases fixed-pattern suns into gravity after the delay", () => {
    const fixedPatternDocument = cloneGameTuningDocument(CURRENT_GAME_TUNING);
    fixedPatternDocument.gameplay.orbits.starMotion = {
      ...fixedPatternDocument.gameplay.orbits.starMotion,
      mode: "fixedPattern",
    };
    applyRuntimeTuningDocument(fixedPatternDocument);

    const simulationState = createShowcaseOrbitOverviewSimulation({
      releaseDelaySec: FIXED_STEP_SEC * 2,
    });

    expect(simulationState.currentState.starMotion.mode).toBe("fixedPattern");

    stepShowcaseOrbitOverviewSimulation({
      nowSec: 0,
      simulationState,
    });
    stepShowcaseOrbitOverviewSimulation({
      nowSec: FIXED_STEP_SEC,
      simulationState,
    });
    stepShowcaseOrbitOverviewSimulation({
      nowSec: FIXED_STEP_SEC * 2,
      simulationState,
    });
    stepShowcaseOrbitOverviewSimulation({
      nowSec: FIXED_STEP_SEC * 3,
      simulationState,
    });

    expect(simulationState.releasedFixedPattern).toBe(true);
    expect(simulationState.currentState.starMotion.mode).toBe("physicsSeed");
  });
});
