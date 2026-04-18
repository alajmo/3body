import { BLACK_HOLE_SPEC, FIXED_STEP_SEC } from "@3body/shared";
import { describe, expect, it } from "vitest";
import { createSandboxState } from "../combatSandbox";
import {
  createLocalSandboxSimulationState,
  runLocalSandboxSimulationFrame,
} from "./localSandboxSimulation";
import type { GameViewportInputRuntimeState } from "./localInput";

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
  readModeHeld: false,
});

describe("local sandbox held ability visuals", () => {
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
});
