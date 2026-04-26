import {
  BLACK_HOLE_SPEC,
  FIXED_STEP_SEC,
  PLANET_HP,
  ROCKET_SPECS,
  SIM_HZ,
} from "@3body/shared";
import { describe, expect, it } from "vitest";
import { createSandboxState } from "../combatSandbox";
import type { GameViewportInputRuntimeState } from "./localInput";
import {
  createLocalSandboxSimulationState,
  runLocalSandboxSimulationFrame,
} from "./localSandboxSimulation";

const createInputRuntime = (): GameViewportInputRuntimeState => ({
  fullViewEnabled: false,
  inputState: {
    aimWorld: { x: 0, y: 0 },
    selectedRocketKind: "light",
  },
  keyboardAimActive: false,
  pendingAbilityRequests: {
    boost: false,
    shield: false,
    gravityPulse: false,
  },
  pendingShots: 0,
  pointerState: {
    clientX: 0,
    clientY: 0,
    hasPointer: false,
  },
});

describe("local sandbox held ability visuals", () => {
  it("emits boost bursts for bot-controlled planets as well as the focused player", () => {
    const initialState = createSandboxState(undefined, {
      botDifficulty: "hard",
      participantCount: 7,
      playerBehavior: "bot",
    });
    const simulationState = createLocalSandboxSimulationState(initialState);
    let sawBotBoostBurst = false;

    for (let step = 0; step < 6 * SIM_HZ; step += 1) {
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

  it("shakes the camera when the player's shield absorbs a rocket hit", () => {
    const initialState = createSandboxState();
    const playerPlanetId = initialState.player.planetId;

    initialState.suns = [];
    initialState.caches = [];
    initialState.cacheRespawnAtTicks = [];
    initialState.debris = [];
    initialState.impactBursts = [];
    initialState.bots = [];
    initialState.planets = initialState.planets.map((planet) =>
      planet.id === playerPlanetId
        ? {
            ...planet,
            alive: true,
            deathReason: undefined,
            debuffs: {},
            hp: PLANET_HP,
            pos: { x: 0, y: 0 },
            radius: 20,
            vel: { x: 0, y: 0 },
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
    initialState.rockets = [
      {
        id: 90_001,
        kind: "rocket",
        ownerId: "enemy",
        rocketKind: "light",
        targetId: playerPlanetId,
        ttlUntilTick: initialState.tick + 5,
        pos: { x: 40, y: 0 },
        vel: { x: 0, y: 0 },
        radius: ROCKET_SPECS.light.radius,
        damage: ROCKET_SPECS.light.damage,
        color: "#ffffff",
        trailColor: "#b7e6ff",
        dragOnHit: false,
        launchPlanetArchetype: "terra",
        turnRateMultiplier: 1,
        launchPlanetPos: { x: 80, y: 0 },
        launchPlanetRadius: 20,
      },
    ];

    const simulationState = createLocalSandboxSimulationState(initialState);
    const inputRuntime = createInputRuntime();
    inputRuntime.pendingAbilityRequests.shield = true;
    inputRuntime.inputState.aimWorld = { x: 100, y: 0 };

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

    expect(
      simulationState.currentState.planets.find(
        (planet) => planet.id === playerPlanetId,
      )?.hp,
    ).toBe(PLANET_HP);
    expect(simulationState.playerDamageFlash).toBeGreaterThan(0.3);
    expect(simulationState.playerHudFlicker).toBeGreaterThan(0.4);
    expect(simulationState.cameraShake).toBeGreaterThan(0.3);
  });

  it("queues planet explosion visuals on the render clock", () => {
    const initialState = createSandboxState();
    const playerPlanetId = initialState.player.planetId;
    const targetPlanetId =
      initialState.planets.find((planet) => planet.id !== playerPlanetId)?.id ??
      null;
    if (targetPlanetId === null) {
      throw new Error("missing target planet");
    }

    initialState.suns = [];
    initialState.neutronStars = [];
    initialState.caches = [];
    initialState.cacheRespawnAtTicks = [];
    initialState.debris = [];
    initialState.impactBursts = [];
    initialState.bots = [];
    initialState.planets = initialState.planets.map((planet) => {
      if (planet.id === playerPlanetId) {
        return {
          ...planet,
          alive: true,
          deathReason: undefined,
          debuffs: {},
          hp: PLANET_HP,
          pos: { x: 2_000, y: 0 },
          vel: { x: 0, y: 0 },
        };
      }

      if (planet.id === targetPlanetId) {
        return {
          ...planet,
          alive: true,
          deathReason: undefined,
          debuffs: {},
          hp: 1,
          pos: { x: 0, y: 0 },
          radius: 20,
          vel: { x: 0, y: 0 },
        };
      }

      return {
        ...planet,
        alive: false,
        deathReason: "rocket",
        debuffs: {},
        hp: 0,
        pos: { x: 5_000 + planet.id, y: 0 },
        vel: { x: 0, y: 0 },
      };
    });
    initialState.rockets = [
      {
        color: "#ffffff",
        damage: ROCKET_SPECS.heavy.damage,
        dragOnHit: false,
        id: 90_002,
        kind: "rocket",
        launchPlanetArchetype: "terra",
        launchPlanetPos: { x: 2_000, y: 0 },
        launchPlanetRadius: 20,
        ownerId: initialState.player.playerId,
        pos: { x: 0, y: 0 },
        radius: ROCKET_SPECS.heavy.radius,
        rocketKind: "heavy",
        targetId: targetPlanetId,
        trailColor: "#ffd9aa",
        ttlUntilTick: initialState.tick + 5,
        turnRateMultiplier: 1,
        vel: { x: 0, y: 0 },
      },
    ];

    const simulationState = createLocalSandboxSimulationState(initialState);
    const explosionStartTimes: number[] = [];
    const firstFrameSec = 10;
    const hitFrameSec = firstFrameSec + FIXED_STEP_SEC * 1.5;
    const runFrame = (nowSec: number) =>
      runLocalSandboxSimulationFrame({
        blackHoleSettings: BLACK_HOLE_SPEC,
        inputController: null,
        inputRuntime: createInputRuntime(),
        nowSec,
        onPlanetExplosionRequested: (_source, startedAtSec) => {
          explosionStartTimes.push(startedAtSec);
        },
        profilingEnabled: false,
        resetAccumulator: false,
        sandboxPaused: false,
        simulationState,
      });

    runFrame(firstFrameSec);
    runFrame(hitFrameSec);

    expect(explosionStartTimes).toHaveLength(1);
    expect(explosionStartTimes[0]).toBeCloseTo(hitFrameSec);
    expect(simulationState.currentState.elapsedSec).toBeLessThan(1);
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
        updateKeyboardAim: () => {},
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
        updateKeyboardAim: () => {},
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

  it("keeps the sandbox running after the player falls into a black hole", () => {
    const initialState = createSandboxState();
    const activeBlackHoleSettings = {
      ...BLACK_HOLE_SPEC,
      spawnSec: 0,
      mass: 0,
      killRadius: 160,
      rampSec: 0,
    };
    const playerPlanetId = initialState.player.planetId;
    const playerPlanetIndex = initialState.planets.findIndex(
      (planet) => planet.id === playerPlanetId,
    );

    initialState.suns = [];
    initialState.neutronStars = [];
    initialState.caches = [];
    initialState.cacheRespawnAtTicks = [];
    initialState.debris = [];
    initialState.impactBursts = [];
    initialState.rockets = [];
    initialState.planets = initialState.planets.map((planet, index) =>
      index === playerPlanetIndex
        ? {
            ...planet,
            alive: true,
            deathReason: undefined,
            hp: PLANET_HP,
            pos: { x: 0, y: 0 },
            vel: { x: 0, y: 0 },
          }
        : {
            ...planet,
            alive: index === 0,
            deathReason: index === 0 ? undefined : "rocket",
            hp: index === 0 ? PLANET_HP : 0,
            pos: { x: 2_000 + planet.id, y: 0 },
            vel: { x: 0, y: 0 },
          },
    );
    const simulationState = createLocalSandboxSimulationState(initialState);

    for (let step = 0; step < 70; step += 1) {
      runLocalSandboxSimulationFrame({
        blackHoleSettings: activeBlackHoleSettings,
        inputController: null,
        inputRuntime: createInputRuntime(),
        nowSec: step * 0.1,
        profilingEnabled: false,
        resetAccumulator: step === 0,
        sandboxPaused: false,
        simulationState,
      });
    }

    const playerPlanet = simulationState.currentState.planets.find(
      (planet) => planet.id === playerPlanetId,
    );
    const survivingPlanetCount = simulationState.currentState.planets.filter(
      (planet) => planet.alive,
    ).length;

    expect(simulationState.currentState.tick).toBeGreaterThan(
      6 / FIXED_STEP_SEC,
    );
    expect(playerPlanet?.alive).toBe(false);
    expect(playerPlanet?.deathReason).toBe("blackHole");
    expect(survivingPlanetCount).toBeGreaterThan(0);
  });
});
