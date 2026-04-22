import { FIXED_STEP_SEC, type Vec2 } from "@3body/shared";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import {
  createSandboxState as createOrbitSandboxState,
  getPlanetSoftBoundaryRadius,
  stepSandbox as stepOrbitSandbox,
} from "./orbitSandbox";

const MAX_FRAME_DELTA_SEC = 0.1;
const MAX_STEPS_PER_FRAME = 12;
const SUN_DISTANCE_HEADROOM = 1.2;

const SHOWCASE_ORBIT_OVERVIEW_DISPLAY_RADIUS = 520;
const SHOWCASE_ORBIT_OVERVIEW_RELEASE_DELAY_SEC = 8;

type ShowcaseOrbitOverviewSandboxState = ReturnType<
  typeof createOrbitSandboxState
>;

interface ShowcaseOrbitOverviewSimulationState {
  accumulatorSec: number;
  currentState: ShowcaseOrbitOverviewSandboxState;
  previousFrameTimeSec: number | null;
  releaseDelaySec: number;
  releasedFixedPattern: boolean;
}

const getMaxSunDistance = (state: ShowcaseOrbitOverviewSandboxState): number =>
  state.suns.reduce(
    (maxDistance, sun) =>
      Math.max(maxDistance, Math.hypot(sun.pos.x, sun.pos.y) + sun.radius),
    0,
  );

const maybeReleaseFixedPattern = (
  simulationState: ShowcaseOrbitOverviewSimulationState,
) => {
  if (
    simulationState.releasedFixedPattern ||
    simulationState.currentState.starMotion.mode !== "fixedPattern" ||
    simulationState.currentState.elapsedSec < simulationState.releaseDelaySec
  ) {
    return;
  }

  simulationState.currentState = {
    ...simulationState.currentState,
    starMotion: { mode: "physicsSeed" },
  };
  simulationState.releasedFixedPattern = true;
};

export const createShowcaseOrbitOverviewSimulation = ({
  releaseDelaySec = SHOWCASE_ORBIT_OVERVIEW_RELEASE_DELAY_SEC,
}: {
  releaseDelaySec?: number;
} = {}): ShowcaseOrbitOverviewSimulationState => ({
  accumulatorSec: 0,
  currentState: createOrbitSandboxState(DEFAULT_ORBIT_PRESET),
  previousFrameTimeSec: null,
  releaseDelaySec,
  releasedFixedPattern: false,
});

export const getShowcaseOrbitOverviewPositionScale = (
  state: ShowcaseOrbitOverviewSandboxState,
  targetRadius = SHOWCASE_ORBIT_OVERVIEW_DISPLAY_RADIUS,
): number =>
  targetRadius /
  Math.max(
    1,
    getPlanetSoftBoundaryRadius(),
    getMaxSunDistance(state) * SUN_DISTANCE_HEADROOM,
  );

export const getShowcaseOrbitOverviewPosition = ({
  offset,
  position,
  scale,
}: {
  offset: Vec2;
  position: Vec2;
  scale: number;
}): Vec2 => ({
  x: offset.x + position.x * scale,
  y: offset.y + position.y * scale,
});

export const stepShowcaseOrbitOverviewSimulation = ({
  nowSec,
  simulationState,
}: {
  nowSec: number;
  simulationState: ShowcaseOrbitOverviewSimulationState;
}) => {
  if (simulationState.previousFrameTimeSec === null) {
    simulationState.previousFrameTimeSec = nowSec;
    return;
  }

  const frameDeltaSec = Math.min(
    Math.max(nowSec - simulationState.previousFrameTimeSec, 0),
    MAX_FRAME_DELTA_SEC,
  );
  simulationState.previousFrameTimeSec = nowSec;
  simulationState.accumulatorSec += frameDeltaSec;

  let stepCount = 0;
  while (
    simulationState.accumulatorSec >= FIXED_STEP_SEC &&
    stepCount < MAX_STEPS_PER_FRAME
  ) {
    maybeReleaseFixedPattern(simulationState);
    simulationState.currentState = stepOrbitSandbox(
      simulationState.currentState,
    );
    simulationState.accumulatorSec -= FIXED_STEP_SEC;
    stepCount += 1;
  }

  maybeReleaseFixedPattern(simulationState);
};
