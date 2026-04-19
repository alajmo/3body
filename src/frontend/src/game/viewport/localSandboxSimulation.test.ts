import { BLACK_HOLE_SPEC, FIXED_STEP_SEC, PLANET_HP } from "@3body/shared";
import { describe, expect, it } from "vitest";
import { createSandboxState } from "../combatSandbox";
import {
  createLocalSandboxSimulationState,
  runLocalSandboxSimulationFrame,
} from "./localSandboxSimulation";
import type { GameViewportInputRuntimeState } from "./localInput";
import {
  FORESIGHT_DISPLAY_SAMPLE_COUNT,
  FORESIGHT_TARGET_DISTANCE,
  getForesightPathDistance,
} from "./foresightShared";

const createInputRuntime = (): GameViewportInputRuntimeState => ({
  droneSteering: {
    leftHeld: false,
    rightHeld: false,
  },
  fullViewEnabled: false,
  inputState: {
    aimWorld: { x: 0, y: 0 },
    selectedRocketKind: "light",
  },
  pendingAbilityRequests: {
    boost: false,
    foresight: false,
    shield: false,
    gravityPulse: false,
    cloak: false,
  },
  pendingDroneRequests: {
    launch: false,
  },
  pendingShots: 0,
  pointerState: {
    clientX: 0,
    clientY: 0,
    hasPointer: false,
  },
});

const getPlayerForesightPath = ({
  speed,
  withGravity = false,
}: {
  speed: number;
  withGravity?: boolean;
}) => {
  const initialState = createSandboxState();
  initialState.suns = withGravity
    ? [
        {
          id: 90_001,
          kind: "sun",
          mass: 800_000,
          pos: { x: 0, y: 600 },
          radius: 120,
          vel: { x: 0, y: 0 },
          swallowedAtSec: null,
        },
      ]
    : [];
  initialState.neutronStars = [];
  initialState.player.foresightActiveUntilTick = 10_000;
  initialState.planets = initialState.planets.map((planet) =>
    planet.id === initialState.player.planetId
      ? {
          ...planet,
          alive: true,
          deathReason: undefined,
          debuffs: {},
          hp: PLANET_HP,
          pos: { x: 0, y: 0 },
          vel: { x: speed, y: 0 },
        }
      : {
          ...planet,
          alive: false,
          deathReason: "rocket",
          debuffs: {},
          hp: 0,
          pos: { x: 5_000 + planet.id, y: 0 },
          vel: { x: 0, y: 0 },
        },
  );
  const simulationState = createLocalSandboxSimulationState(initialState);

  runLocalSandboxSimulationFrame({
    blackHoleSettings: BLACK_HOLE_SPEC,
    inputController: null,
    inputRuntime: createInputRuntime(),
    nowSec: 0,
    profilingEnabled: false,
    resetAccumulator: true,
    sandboxPaused: false,
    simulationState,
  });

  return (
    simulationState.foresightPathsByEntityId.get(
      initialState.player.planetId,
    ) ?? []
  );
};

describe("local sandbox held ability visuals", () => {
  it("emits boost bursts for bot-controlled planets as well as the focused player", () => {
    const initialState = createSandboxState(undefined, {
      botDifficulty: "hard",
      participantCount: 7,
      playerBehavior: "bot",
    });
    const simulationState = createLocalSandboxSimulationState(initialState);
    let sawBotBoostBurst = false;

    for (let step = 0; step < 6 * 120; step += 1) {
      runLocalSandboxSimulationFrame({
        blackHoleSettings: BLACK_HOLE_SPEC,
        inputController: null,
        inputRuntime: createInputRuntime(),
        nowSec: step * FIXED_STEP_SEC,
        profilingEnabled: false,
        resetAccumulator: step === 0,
        sandboxPaused: false,
        simulationState,
      });

      if (
        simulationState.activeBoostBursts.some(
          (burst) =>
            burst.planetId !== simulationState.currentState.player.planetId,
        )
      ) {
        sawBotBoostBurst = true;
        break;
      }
    }

    expect(sawBotBoostBurst).toBe(true);
  });

  it("emits a gravity pulse burst when the sandbox player uses gravity pulse", () => {
    const initialState = createSandboxState();
    initialState.player.gravityPulseHeld = true;
    const simulationState = createLocalSandboxSimulationState(initialState);
    const inputRuntime = createInputRuntime();
    inputRuntime.pendingAbilityRequests.gravityPulse = true;

    runLocalSandboxSimulationFrame({
      blackHoleSettings: BLACK_HOLE_SPEC,
      inputController: null,
      inputRuntime,
      nowSec: 0,
      profilingEnabled: false,
      resetAccumulator: false,
      sandboxPaused: false,
      simulationState,
    });
    runLocalSandboxSimulationFrame({
      blackHoleSettings: BLACK_HOLE_SPEC,
      inputController: null,
      inputRuntime,
      nowSec: FIXED_STEP_SEC * 1.5,
      profilingEnabled: false,
      resetAccumulator: false,
      sandboxPaused: false,
      simulationState,
    });

    expect(simulationState.currentState.player.gravityPulseHeld).toBe(false);
    expect(simulationState.activeGravityPulse).not.toBeNull();
    expect(simulationState.cameraShake).toBeGreaterThan(0.3);
  });

  it("still emits the pulse when step-scoped requests are cleared by the input controller", () => {
    const initialState = createSandboxState();
    initialState.player.gravityPulseHeld = true;
    const simulationState = createLocalSandboxSimulationState(initialState);
    const inputRuntime = createInputRuntime();
    inputRuntime.pendingAbilityRequests.gravityPulse = true;

    runLocalSandboxSimulationFrame({
      blackHoleSettings: BLACK_HOLE_SPEC,
      inputController: {
        clearPendingGameplayRequests: () => {},
        clearStepScopedRequests: () => {
          inputRuntime.pendingAbilityRequests.gravityPulse = false;
        },
        consumeShotRequest: () => false,
      },
      inputRuntime,
      nowSec: 0,
      profilingEnabled: false,
      resetAccumulator: false,
      sandboxPaused: false,
      simulationState,
    });
    runLocalSandboxSimulationFrame({
      blackHoleSettings: BLACK_HOLE_SPEC,
      inputController: {
        clearPendingGameplayRequests: () => {},
        clearStepScopedRequests: () => {
          inputRuntime.pendingAbilityRequests.gravityPulse = false;
        },
        consumeShotRequest: () => false,
      },
      inputRuntime,
      nowSec: FIXED_STEP_SEC * 1.5,
      profilingEnabled: false,
      resetAccumulator: false,
      sandboxPaused: false,
      simulationState,
    });

    expect(simulationState.currentState.player.gravityPulseHeld).toBe(false);
    expect(simulationState.activeGravityPulse).not.toBeNull();
  });

  it("keeps the foresight path length stable across player speed changes", () => {
    const slowerPath = getPlayerForesightPath({
      speed: 250,
      withGravity: true,
    });
    const fasterPath = getPlayerForesightPath({
      speed: 500,
      withGravity: true,
    });
    const slowerDistance = getForesightPathDistance(slowerPath);
    const fasterDistance = getForesightPathDistance(fasterPath);

    expect(slowerDistance).toBeCloseTo(FORESIGHT_TARGET_DISTANCE, 0);
    expect(fasterDistance).toBeCloseTo(FORESIGHT_TARGET_DISTANCE, 0);
    expect(fasterDistance).toBeCloseTo(slowerDistance, 0);
    expect(slowerPath).toHaveLength(FORESIGHT_DISPLAY_SAMPLE_COUNT);
    expect(fasterPath).toHaveLength(FORESIGHT_DISPLAY_SAMPLE_COUNT);
    expect(Math.max(...slowerPath.map((point) => point.y))).toBeGreaterThan(40);
    expect(Math.max(...fasterPath.map((point) => point.y))).toBeGreaterThan(10);
  });
});
