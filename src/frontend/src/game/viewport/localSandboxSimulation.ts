import type { Vec2, WildcardKind } from "@3body/shared";
import {
  FIXED_STEP_SEC,
  GRAVITY_PULSE_RADIUS,
  PLANET_HP,
  clamp,
  normalize as normalizeVec2,
  stepBody,
  stepSuns,
} from "@3body/shared";
import type {
  CombatSandboxSun,
  CombatPlanetDeathReason,
  CombatSandboxDrone,
  CombatSandboxPlanet,
  CombatSandboxState,
} from "../combatSandbox";
import {
  createInterpolatedSandboxState,
  createSandboxInterpolationCache,
  getActiveCombatSuns,
  getSandboxResetReason,
  SEEKER_LOCK_TICKS,
  stepSandbox,
  syncInterpolatedSandboxState,
} from "../combatSandbox";
import { FORESIGHT_STEP_SEC, FORESIGHT_WINDOW_SEC } from "./foresightShared";
import type { GameViewportInputRuntimeState } from "./localInput";
import { createViewportPerformanceProfiler } from "./performanceProfiler";
import { createRuntimeStatsTracker } from "./runtimeStats";

const MAX_FRAME_DELTA_SEC = 0.1;
const MAX_STEPS_PER_FRAME = 12;
const MAX_ACTIVE_BOOST_BURSTS = 4;
const HIT_FLASH_DURATION_SEC = 0.24;
const HP_PULSE_DURATION_SEC = 0.48;
const CAMERA_SHAKE_DURATION_SEC = 0.3;
export const LOCAL_SANDBOX_HUD_UPDATE_INTERVAL_SEC = 1 / 12;
export const LOCAL_SANDBOX_KILL_FEED_DURATION_SEC = 4;

interface LocalSandboxKillFeedEntry {
  accent: string;
  id: number;
  startedAtSec: number;
  text: string;
}

interface LocalSandboxBoostBurstState {
  direction: Vec2;
  origin: Vec2;
  planetArchetype: CombatSandboxPlanet["archetype"];
  planetId: number;
  radius: number;
  startedAtSec: number;
  tick: number;
}

export interface LocalSandboxGravityPulseState {
  effectRadius: number;
  origin: Vec2;
  planetRadius: number;
  startedAtSec: number;
}

const decayUnitValue = (
  value: number,
  deltaSec: number,
  durationSec: number,
): number =>
  Math.max(0, value - deltaSec / Math.max(durationSec, Number.EPSILON));

const describePlanetDeath = (
  planet: Pick<CombatSandboxPlanet, "deathReason" | "displayName" | "label">,
): string => {
  const displayName = planet.displayName || planet.label;

  switch (planet.deathReason) {
    case "boundary":
      return `${displayName} drifted beyond the arena`;
    case "blackHole":
      return `${displayName} fell into the Black Hole`;
    case "planetCollision":
      return `${displayName} broke apart on impact`;
    case "sunCollision":
      return `${displayName} was consumed by a sun`;
    default:
      return `${displayName} was destroyed`;
  }
};

const isPlanetExplosionDeath = (
  deathReason: CombatPlanetDeathReason | undefined,
): boolean =>
  deathReason === "rocket" ||
  deathReason === "planetCollision" ||
  deathReason === "sunCollision";

const syncLocalSandboxEntityLookups = (
  planetsById: Map<number, CombatSandboxPlanet>,
  dronesById: Map<number, CombatSandboxDrone>,
  state: {
    drones: readonly CombatSandboxDrone[];
    planets: readonly CombatSandboxPlanet[];
  },
) => {
  planetsById.clear();
  for (const planet of state.planets) {
    planetsById.set(planet.id, planet);
  }

  dronesById.clear();
  for (const drone of state.drones) {
    dronesById.set(drone.id, drone);
  }
};

type PredictedForesightBody = Pick<
  CombatSandboxPlanet,
  "id" | "pos" | "radius" | "vel"
>;

const computeForesightPathsByEntityId = (
  state: CombatSandboxState,
): ReadonlyMap<number, readonly Vec2[]> => {
  if (state.tick >= state.player.foresightActiveUntilTick) {
    return new Map();
  }

  const pathsByEntityId = new Map<number, Vec2[]>();
  let predictedSuns = getActiveCombatSuns(state.suns).map<CombatSandboxSun>(
    (sun) => ({
      ...sun,
      pos: { x: sun.pos.x, y: sun.pos.y },
      vel: { x: sun.vel.x, y: sun.vel.y },
    }),
  );
  let predictedPlanets = state.planets
    .filter((planet) => planet.alive)
    .map<PredictedForesightBody>((planet) => ({
      id: planet.id,
      pos: { x: planet.pos.x, y: planet.pos.y },
      radius: planet.radius,
      vel: { x: planet.vel.x, y: planet.vel.y },
    }));
  const stepCount = Math.ceil(FORESIGHT_WINDOW_SEC / FORESIGHT_STEP_SEC);

  for (const sun of predictedSuns) {
    pathsByEntityId.set(sun.id, [{ x: sun.pos.x, y: sun.pos.y }]);
  }
  for (const planet of predictedPlanets) {
    pathsByEntityId.set(planet.id, [{ x: planet.pos.x, y: planet.pos.y }]);
  }

  for (let step = 0; step < stepCount; step += 1) {
    predictedSuns = stepSuns(
      predictedSuns,
      FORESIGHT_STEP_SEC,
      state.blackHole ?? undefined,
    ).map((sun) => ({
      ...sun,
      swallowedAtSec: null,
    }));

    predictedPlanets = predictedPlanets.map((planet) =>
      stepBody(
        planet,
        predictedSuns,
        FORESIGHT_STEP_SEC,
        state.blackHole ?? undefined,
      ),
    );

    for (const sun of predictedSuns) {
      pathsByEntityId.get(sun.id)?.push({ x: sun.pos.x, y: sun.pos.y });
    }
    for (const planet of predictedPlanets) {
      pathsByEntityId
        .get(planet.id)
        ?.push({ x: planet.pos.x, y: planet.pos.y });
    }
  }

  return pathsByEntityId;
};

export const createLocalSandboxSimulationState = (
  initialState: CombatSandboxState,
) => {
  const state = {
    accumulatorSec: 0,
    activeBoostBursts: [] as LocalSandboxBoostBurstState[],
    activeGravityPulse: null as LocalSandboxGravityPulseState | null,
    cameraShake: 0,
    currentState: initialState,
    foresightPathsByEntityId: new Map<number, readonly Vec2[]>(),
    killFeedEntries: [] as LocalSandboxKillFeedEntry[],
    lastBoostVisualTick: initialState.player.lastBoostTick,
    nextHudUpdateSec: 0,
    nextKillFeedId: 1,
    performanceProfiler: createViewportPerformanceProfiler(),
    playerDamageFlash: 0,
    playerHpPulse: 0,
    previousFrameTimeSec: null as number | null,
    previousState: initialState,
    renderDronesById: new Map<number, CombatSandboxDrone>(),
    renderInterpolationCache: createSandboxInterpolationCache(),
    renderPlanetsById: new Map<number, CombatSandboxPlanet>(),
    renderState: createInterpolatedSandboxState(initialState),
    runtimeStats: {
      fps: 0,
      frameTimeMs: 0,
    },
    runtimeStatsTracker: createRuntimeStatsTracker(),
  };
  syncLocalSandboxEntityLookups(
    state.renderPlanetsById,
    state.renderDronesById,
    state.currentState,
  );
  return state;
};

export const resetLocalSandboxSimulationProfiling = (
  simulationState: ReturnType<typeof createLocalSandboxSimulationState>,
) => {
  simulationState.performanceProfiler.reset();
  simulationState.nextHudUpdateSec = 0;
};

export const resetLocalSandboxSimulationState = ({
  inputController,
  nextState,
  simulationState,
}: {
  inputController:
    | {
        resetForPlayer: (
          player: Pick<
            CombatSandboxState["player"],
            "aimWorld" | "selectedRocketKind"
          >,
        ) => void;
      }
    | null
    | undefined;
  nextState: CombatSandboxState;
  simulationState: ReturnType<typeof createLocalSandboxSimulationState>;
}) => {
  simulationState.previousState = nextState;
  simulationState.currentState = nextState;
  simulationState.renderState = createInterpolatedSandboxState(nextState);
  simulationState.accumulatorSec = 0;
  simulationState.previousFrameTimeSec = null;
  simulationState.foresightPathsByEntityId.clear();
  simulationState.lastBoostVisualTick = nextState.player.lastBoostTick;
  simulationState.activeBoostBursts.length = 0;
  simulationState.activeGravityPulse = null;
  simulationState.killFeedEntries.length = 0;
  simulationState.nextKillFeedId = 1;
  simulationState.cameraShake = 0;
  simulationState.playerDamageFlash = 0;
  simulationState.playerHpPulse = 0;
  inputController?.resetForPlayer(nextState.player);
  resetLocalSandboxSimulationProfiling(simulationState);
  syncLocalSandboxEntityLookups(
    simulationState.renderPlanetsById,
    simulationState.renderDronesById,
    nextState,
  );
};

export const decayLocalSandboxFrameEffects = ({
  frameDeltaSec,
  simulationState,
}: {
  frameDeltaSec: number;
  simulationState: ReturnType<typeof createLocalSandboxSimulationState>;
}) => {
  simulationState.playerDamageFlash = decayUnitValue(
    simulationState.playerDamageFlash,
    frameDeltaSec,
    HIT_FLASH_DURATION_SEC,
  );
  simulationState.playerHpPulse = decayUnitValue(
    simulationState.playerHpPulse,
    frameDeltaSec,
    HP_PULSE_DURATION_SEC,
  );
  simulationState.cameraShake = decayUnitValue(
    simulationState.cameraShake,
    frameDeltaSec,
    CAMERA_SHAKE_DURATION_SEC,
  );
};

export const shouldEmitLocalSandboxHudUpdate = ({
  nowSec,
  simulationState,
}: {
  nowSec: number;
  simulationState: ReturnType<typeof createLocalSandboxSimulationState>;
}): boolean => {
  if (nowSec < simulationState.nextHudUpdateSec) {
    return false;
  }

  simulationState.nextHudUpdateSec =
    nowSec + LOCAL_SANDBOX_HUD_UPDATE_INTERVAL_SEC;
  return true;
};

export const pruneLocalSandboxKillFeedEntries = ({
  nowSec,
  simulationState,
}: {
  nowSec: number;
  simulationState: ReturnType<typeof createLocalSandboxSimulationState>;
}) => {
  while (
    simulationState.killFeedEntries.length > 0 &&
    nowSec -
      simulationState.killFeedEntries[
        simulationState.killFeedEntries.length - 1
      ]!.startedAtSec >
      LOCAL_SANDBOX_KILL_FEED_DURATION_SEC
  ) {
    simulationState.killFeedEntries.pop();
  }
};

export const runLocalSandboxSimulationFrame = ({
  blackHoleSettings,
  inputController,
  inputRuntime,
  nowSec,
  onPlanetExplosionRequested,
  onSandboxResetRequested,
  onViewportFocusChanged,
  profilingEnabled,
  resetAccumulator,
  sandboxPaused,
  simulationState,
}: {
  blackHoleSettings: Parameters<typeof stepSandbox>[2];
  inputController:
    | {
        clearPendingGameplayRequests: () => void;
        clearStepScopedRequests: () => void;
        consumeShotRequest: () => boolean;
      }
    | null
    | undefined;
  inputRuntime: GameViewportInputRuntimeState;
  nowSec: number;
  onPlanetExplosionRequested?: (
    planet: CombatSandboxPlanet,
    startedAtSec: number,
  ) => void;
  onSandboxResetRequested?: () => void;
  onViewportFocusChanged?: (state: CombatSandboxState) => void;
  profilingEnabled: boolean;
  resetAccumulator: boolean;
  sandboxPaused: boolean;
  simulationState: ReturnType<typeof createLocalSandboxSimulationState>;
}) => {
  if (resetAccumulator) {
    simulationState.accumulatorSec = 0;
    simulationState.previousFrameTimeSec = nowSec;
  }

  if (simulationState.previousFrameTimeSec === null) {
    simulationState.previousFrameTimeSec = nowSec;
  }

  const frameDeltaSec = clamp(
    nowSec - simulationState.previousFrameTimeSec,
    0,
    MAX_FRAME_DELTA_SEC,
  );
  simulationState.previousFrameTimeSec = nowSec;
  const sampledRuntimeStats =
    simulationState.runtimeStatsTracker.sample(frameDeltaSec);
  simulationState.runtimeStats.fps = sampledRuntimeStats.fps;
  simulationState.runtimeStats.frameTimeMs = sampledRuntimeStats.frameTimeMs;

  if (sandboxPaused) {
    simulationState.accumulatorSec = 0;
    inputController?.clearPendingGameplayRequests();
  } else {
    simulationState.accumulatorSec += frameDeltaSec;
  }

  let stepCount = 0;
  const simulationProfilerStartMs = profilingEnabled ? performance.now() : 0;

  while (
    simulationState.accumulatorSec >= FIXED_STEP_SEC &&
    stepCount < MAX_STEPS_PER_FRAME
  ) {
    const previousControlMode = simulationState.currentState.player.controlMode;
    const previousActiveDroneId =
      simulationState.currentState.player.activeDroneId;
    const previousGravityPulseHeld =
      simulationState.currentState.player.gravityPulseHeld;
    const previousCloakHeld = simulationState.currentState.player.cloakHeld;
    const gravityPulseRequestedThisStep =
      inputRuntime.pendingAbilityRequests.gravityPulse;
    const cloakRequestedThisStep = inputRuntime.pendingAbilityRequests.cloak;
    const fireRequestedThisStep =
      inputController?.consumeShotRequest() ?? false;
    const nextState = stepSandbox(
      simulationState.currentState,
      {
        aimWorld: inputRuntime.inputState.aimWorld,
        boostRequested: inputRuntime.pendingAbilityRequests.boost,
        cloakRequested: inputRuntime.pendingAbilityRequests.cloak,
        droneLaunchRequested: inputRuntime.pendingDroneRequests.launch,
        droneTurnLeftHeld: inputRuntime.droneSteering.leftHeld,
        droneTurnRightHeld: inputRuntime.droneSteering.rightHeld,
        fireRequested: fireRequestedThisStep,
        foresightRequested: inputRuntime.pendingAbilityRequests.foresight,
        gravityPulseRequested: inputRuntime.pendingAbilityRequests.gravityPulse,
        selectedRocketKind: inputRuntime.inputState.selectedRocketKind,
        shieldRequested: inputRuntime.pendingAbilityRequests.shield,
      },
      blackHoleSettings,
    );
    inputController?.clearStepScopedRequests();
    const resetReason = getSandboxResetReason(nextState);
    simulationState.previousState = simulationState.currentState;
    simulationState.currentState = nextState;

    for (
      let index = 0;
      index < simulationState.currentState.planets.length;
      index += 1
    ) {
      const planet = simulationState.currentState.planets[index]!;
      const previousAtIndex = simulationState.previousState.planets[index];
      const previousPlanet =
        previousAtIndex && previousAtIndex.id === planet.id
          ? previousAtIndex
          : (simulationState.previousState.planets.find(
              (item) => item.id === planet.id,
            ) ?? null);
      if (previousPlanet?.alive && previousPlanet.hp > planet.hp) {
        const damageRatio = clamp(
          (previousPlanet.hp - planet.hp) / PLANET_HP,
          0.18,
          1,
        );
        if (planet.id === simulationState.currentState.player.planetId) {
          simulationState.playerDamageFlash = Math.max(
            simulationState.playerDamageFlash,
            0.26 + damageRatio * 0.74,
          );
          simulationState.playerHpPulse = Math.max(
            simulationState.playerHpPulse,
            0.34 + damageRatio * 0.66,
          );
          simulationState.cameraShake = Math.max(
            simulationState.cameraShake,
            0.24 + damageRatio * 0.76,
          );
        }
      }
      if (previousPlanet?.alive && !planet.alive) {
        simulationState.killFeedEntries.unshift({
          accent: planet.color,
          id: simulationState.nextKillFeedId,
          startedAtSec: nowSec,
          text: describePlanetDeath(planet),
        });
        if (isPlanetExplosionDeath(planet.deathReason)) {
          simulationState.cameraShake = Math.max(
            simulationState.cameraShake,
            planet.id === simulationState.currentState.player.planetId
              ? 1
              : 0.5,
          );
          onPlanetExplosionRequested?.(planet, nextState.elapsedSec);
        }
        simulationState.nextKillFeedId += 1;
      }
    }

    if (
      previousControlMode !== simulationState.currentState.player.controlMode ||
      previousActiveDroneId !==
        simulationState.currentState.player.activeDroneId
    ) {
      onViewportFocusChanged?.(simulationState.currentState);
    }

    if (
      simulationState.currentState.player.lastBoostTick !== null &&
      simulationState.currentState.player.lastBoostTick !==
        simulationState.lastBoostVisualTick
    ) {
      const boostedPlanet =
        simulationState.currentState.planets.find(
          (planet) =>
            planet.id === simulationState.currentState.player.planetId,
        ) ?? null;
      if (boostedPlanet?.alive) {
        simulationState.activeBoostBursts.push({
          direction: normalizeVec2(
            simulationState.currentState.player.lastBoostAimDir,
          ),
          origin: { x: boostedPlanet.pos.x, y: boostedPlanet.pos.y },
          planetArchetype: boostedPlanet.archetype,
          planetId: boostedPlanet.id,
          radius: boostedPlanet.radius,
          startedAtSec: nowSec,
          tick: simulationState.currentState.player.lastBoostTick,
        });
        while (
          simulationState.activeBoostBursts.length > MAX_ACTIVE_BOOST_BURSTS
        ) {
          simulationState.activeBoostBursts.shift();
        }
      }
      simulationState.lastBoostVisualTick =
        simulationState.currentState.player.lastBoostTick;
    }

    const consumedGravityPulse =
      gravityPulseRequestedThisStep &&
      previousGravityPulseHeld &&
      !simulationState.currentState.player.gravityPulseHeld;
    const consumedCloak =
      cloakRequestedThisStep &&
      previousCloakHeld &&
      !simulationState.currentState.player.cloakHeld;

    if (consumedGravityPulse) {
      const pulsingPlanet =
        simulationState.currentState.planets.find(
          (planet) =>
            planet.id === simulationState.currentState.player.planetId,
        ) ?? null;
      if (pulsingPlanet?.alive) {
        simulationState.activeGravityPulse = {
          effectRadius: GRAVITY_PULSE_RADIUS,
          origin: { x: pulsingPlanet.pos.x, y: pulsingPlanet.pos.y },
          planetRadius: pulsingPlanet.radius,
          startedAtSec: nowSec,
        };
        simulationState.cameraShake = Math.max(
          simulationState.cameraShake,
          0.36,
        );
      }
    }

    if (consumedCloak) {
      simulationState.cameraShake = Math.max(
        simulationState.cameraShake,
        0.12,
      );
    }

    simulationState.accumulatorSec -= FIXED_STEP_SEC;
    stepCount += 1;

    if (resetReason !== null) {
      onSandboxResetRequested?.();
      break;
    }
  }

  if (stepCount === MAX_STEPS_PER_FRAME) {
    simulationState.accumulatorSec = 0;
  }

  while (simulationState.killFeedEntries.length > 6) {
    simulationState.killFeedEntries.pop();
  }

  const simulationProfilerEndMs = profilingEnabled ? performance.now() : 0;
  const interpolationProfilerStartMs = profilingEnabled ? performance.now() : 0;
  syncInterpolatedSandboxState(
    simulationState.renderState,
    simulationState.renderInterpolationCache,
    simulationState.previousState,
    simulationState.currentState,
    clamp(simulationState.accumulatorSec / FIXED_STEP_SEC, 0, 1),
  );
  // Rebuild foresight from the interpolated render state so the preview
  // moves continuously with boosts and orbital motion instead of stepping.
  simulationState.foresightPathsByEntityId = new Map(
    computeForesightPathsByEntityId(simulationState.renderState),
  );
  syncLocalSandboxEntityLookups(
    simulationState.renderPlanetsById,
    simulationState.renderDronesById,
    simulationState.renderState,
  );
  const interpolationProfilerEndMs = profilingEnabled ? performance.now() : 0;

  return {
    activeDrone:
      simulationState.renderState.player.activeDroneId === null
        ? null
        : (simulationState.renderDronesById.get(
            simulationState.renderState.player.activeDroneId,
          ) ?? null),
    frameDeltaSec,
    interpolationMs: interpolationProfilerEndMs - interpolationProfilerStartMs,
    playerPlanet:
      simulationState.renderPlanetsById.get(
        simulationState.renderState.player.planetId,
      ) ?? null,
    simulationMs: simulationProfilerEndMs - simulationProfilerStartMs,
    stepCount,
  };
};

export const getLocalSandboxLockProgress = ({
  currentTick,
  lockAcquiredTick,
}: {
  currentTick: number;
  lockAcquiredTick: number | null;
}) =>
  lockAcquiredTick === null
    ? 0
    : Math.min(
        1,
        Math.max(0, currentTick - lockAcquiredTick) / SEEKER_LOCK_TICKS,
      );
