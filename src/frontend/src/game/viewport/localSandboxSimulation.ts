import type { Vec2 } from "@3body/shared";
import {
  clamp,
  FIXED_STEP_SEC,
  GRAVITY_PULSE_RADIUS,
  getSeekerLockTicks,
  getSunVisualProfile,
  normalize as normalizeVec2,
  PLANET_HP,
  ROOM_CAPACITY,
} from "@3body/shared";
import type {
  CombatPlanetDeathReason,
  CombatSandboxPlanet,
  CombatSandboxState,
  CombatSandboxSun,
} from "../combatSandbox";
import {
  createInterpolatedSandboxState,
  createSandboxInterpolationCache,
  stepSandbox,
  syncInterpolatedSandboxState,
} from "../combatSandbox";
import {
  findAbsorbingNeutronStar,
  getNeutronStarAbsorptionExplosionRadius,
} from "../neutronStarAbsorption";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import {
  CAMERA_SHAKE_DURATION_SEC,
  getBoundaryAsteroidImpactCameraShake,
  getBoundaryAsteroidImpactHudFlicker,
  getBoundaryAsteroidImpactScreenFlash,
  getRocketImpactCameraShake,
  getRocketImpactHudFlicker,
  getRocketImpactScreenFlash,
  ROCKET_IMPACT_HUD_FLICKER_DURATION_SEC,
} from "./cameraShake";
import type { GameViewportInputRuntimeState } from "./localInput";
import { createViewportPerformanceProfiler } from "./performanceProfiler";
import { createRuntimeStatsTracker } from "./runtimeStats";
import type { SharedCombatBoostBurstState } from "./sharedCombatBoostVisuals";

const MAX_FRAME_DELTA_SEC = 0.1;
const MAX_STEPS_PER_FRAME = 12;
const MAX_ACTIVE_BOOST_BURSTS = ROOM_CAPACITY * 2;
const HIT_FLASH_DURATION_SEC = 0.24;
const HP_PULSE_DURATION_SEC = 0.48;
const LOCAL_SANDBOX_HUD_UPDATE_INTERVAL_SEC = 1 / 12;
const LOCAL_SANDBOX_KILL_FEED_DURATION_SEC = 4;

interface LocalSandboxKillFeedEntry {
  accent: string;
  id: number;
  startedAtSec: number;
  text: string;
}

export interface LocalSandboxGravityPulseState {
  effectRadius: number;
  origin: Vec2;
  planetRadius: number;
  startedAtSec: number;
}

type BoostVisualControllerState = Pick<
  CombatSandboxState["player"],
  "lastBoostAimDir" | "lastBoostTick" | "planetId" | "playerId"
>;

const getBoostVisualControllers = (
  state: Pick<CombatSandboxState, "player" | "bots">,
): readonly BoostVisualControllerState[] => [state.player, ...state.bots];

const createBoostVisualTickMap = (
  state: Pick<CombatSandboxState, "player" | "bots">,
): Map<string, number | null> =>
  new Map(
    getBoostVisualControllers(state).map((controller) => [
      controller.playerId,
      controller.lastBoostTick,
    ]),
  );

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
    case "boundaryAsteroid":
      return `${displayName} was shattered by boundary debris`;
    case "boundary":
      return `${displayName} drifted beyond the arena`;
    case "blackHole":
      return `${displayName} fell into the Black Hole`;
    case "neutronStar":
      return `${displayName} was crushed by a neutron star`;
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
  deathReason === "boundaryAsteroid" ||
  deathReason === "planetCollision" ||
  deathReason === "sunCollision" ||
  deathReason === "neutronStar";

const syncLocalSandboxEntityLookups = (
  planetsById: Map<number, CombatSandboxPlanet>,
  sunsById: Map<number, CombatSandboxSun>,
  state: {
    planets: readonly CombatSandboxPlanet[];
    suns: readonly CombatSandboxSun[];
  },
) => {
  planetsById.clear();
  for (const planet of state.planets) {
    planetsById.set(planet.id, planet);
  }

  sunsById.clear();
  for (const sun of state.suns) {
    sunsById.set(sun.id, sun);
  }
};

export const createLocalSandboxSimulationState = (
  initialState: CombatSandboxState,
) => {
  const state = {
    accumulatorSec: 0,
    activeBoostBursts: [] as SharedCombatBoostBurstState[],
    activeGravityPulse: null as LocalSandboxGravityPulseState | null,
    cameraShake: 0,
    currentState: initialState,
    killFeedEntries: [] as LocalSandboxKillFeedEntry[],
    lastBoostVisualTickByPlayerId: createBoostVisualTickMap(initialState),
    nextHudUpdateSec: 0,
    nextKillFeedId: 1,
    performanceProfiler: createViewportPerformanceProfiler(),
    playerDamageFlash: 0,
    playerHudFlicker: 0,
    playerHpPulse: 0,
    previousFrameTimeSec: null as number | null,
    previousState: initialState,
    renderInterpolationCache: createSandboxInterpolationCache(),
    renderPlanetsById: new Map<number, CombatSandboxPlanet>(),
    renderSunsById: new Map<number, CombatSandboxSun>(),
    renderState: createInterpolatedSandboxState(initialState),
    runtimeStats: {
      fps: 0,
      frameTimeMs: 0,
    },
    runtimeStatsTracker: createRuntimeStatsTracker(),
  };
  syncLocalSandboxEntityLookups(
    state.renderPlanetsById,
    state.renderSunsById,
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
  simulationState.lastBoostVisualTickByPlayerId =
    createBoostVisualTickMap(nextState);
  simulationState.activeBoostBursts.length = 0;
  simulationState.activeGravityPulse = null;
  simulationState.killFeedEntries.length = 0;
  simulationState.nextKillFeedId = 1;
  simulationState.cameraShake = 0;
  simulationState.playerDamageFlash = 0;
  simulationState.playerHudFlicker = 0;
  simulationState.playerHpPulse = 0;
  inputController?.resetForPlayer(nextState.player);
  resetLocalSandboxSimulationProfiling(simulationState);
  syncLocalSandboxEntityLookups(
    simulationState.renderPlanetsById,
    simulationState.renderSunsById,
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
  simulationState.playerHudFlicker = decayUnitValue(
    simulationState.playerHudFlicker,
    frameDeltaSec,
    ROCKET_IMPACT_HUD_FLICKER_DURATION_SEC,
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
  onViewportFocusChanged: _onViewportFocusChanged,
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
        updateKeyboardAim: (playerPos: Vec2, deltaSec: number) => void;
      }
    | null
    | undefined;
  inputRuntime: GameViewportInputRuntimeState;
  nowSec: number;
  onPlanetExplosionRequested?: (
    source: {
      color: string;
      deathReason?:
        | "boundaryAsteroid"
        | "boundary"
        | "blackHole"
        | "neutronStar"
        | "planetCollision"
        | "rocket"
        | "sunCollision";
      id: number;
      pos: Vec2;
      radius: number;
      vel: Vec2;
    },
    startedAtSec: number,
  ) => void;
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

  const rawFrameDeltaSec = Math.max(
    0,
    nowSec - simulationState.previousFrameTimeSec,
  );
  const frameDeltaSec = clamp(rawFrameDeltaSec, 0, MAX_FRAME_DELTA_SEC);
  simulationState.previousFrameTimeSec = nowSec;
  const sampledRuntimeStats =
    simulationState.runtimeStatsTracker.sample(frameDeltaSec);
  simulationState.runtimeStats.fps = sampledRuntimeStats.fps;
  simulationState.runtimeStats.frameTimeMs = sampledRuntimeStats.frameTimeMs;
  const playerPlanet =
    simulationState.currentState.planets.find(
      (planet) => planet.id === simulationState.currentState.player.planetId,
    ) ?? null;
  if (playerPlanet !== null) {
    inputController?.updateKeyboardAim(playerPlanet.pos, frameDeltaSec);
  }

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
    const previousGravityPulseHeld =
      simulationState.currentState.player.gravityPulseHeld;
    const gravityPulseRequestedThisStep =
      inputRuntime.pendingAbilityRequests.gravityPulse;
    const fireRequestedThisStep =
      inputController?.consumeShotRequest() ?? false;
    const nextState = stepSandbox(
      simulationState.currentState,
      {
        aimWorld: inputRuntime.inputState.aimWorld,
        boostRequested: inputRuntime.pendingAbilityRequests.boost,
        fireRequested: fireRequestedThisStep,
        gravityPulseRequested: inputRuntime.pendingAbilityRequests.gravityPulse,
        selectedRocketKind: inputRuntime.inputState.selectedRocketKind,
        shieldRequested: inputRuntime.pendingAbilityRequests.shield,
      },
      blackHoleSettings,
    );
    inputController?.clearStepScopedRequests();
    simulationState.previousState = simulationState.currentState;
    simulationState.currentState = nextState;
    const currentSunIds = new Set(
      simulationState.currentState.suns.map((sun) => sun.id),
    );
    const previousNeutronStarsById = new Map(
      simulationState.previousState.neutronStars.map((neutronStar) => [
        neutronStar.id,
        neutronStar,
      ]),
    );

    for (
      let index = 0;
      index < simulationState.previousState.suns.length;
      index += 1
    ) {
      const previousSun = simulationState.previousState.suns[index]!;
      if (currentSunIds.has(previousSun.id)) {
        continue;
      }

      const absorbingNeutronStar = findAbsorbingNeutronStar({
        currentNeutronStars: simulationState.currentState.neutronStars,
        previousNeutronStarsById,
        sun: previousSun,
      });
      if (absorbingNeutronStar === null) {
        continue;
      }

      const sunProfile = getSunVisualProfile(
        getRuntimeTuningDocument().visuals.suns,
        index,
      );
      simulationState.cameraShake = Math.max(simulationState.cameraShake, 0.58);
      onPlanetExplosionRequested?.(
        {
          color: sunProfile.glowColor,
          deathReason: "sunCollision",
          id: previousSun.id,
          pos: { x: previousSun.pos.x, y: previousSun.pos.y },
          radius: getNeutronStarAbsorptionExplosionRadius({
            neutronStarRadius: absorbingNeutronStar.radius,
            sunRadius: previousSun.radius,
          }),
          vel: { x: previousSun.vel.x, y: previousSun.vel.y },
        },
        nowSec,
      );
    }

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
          onPlanetExplosionRequested?.(planet, nowSec);
        }
        simulationState.nextKillFeedId += 1;
      }
    }

    for (const burst of simulationState.currentState.impactBursts) {
      if (
        burst.startedAtTick !== simulationState.currentState.tick ||
        burst.planetId !== simulationState.currentState.player.planetId
      ) {
        continue;
      }

      if (burst.sourceKind === "rocket") {
        simulationState.cameraShake = Math.max(
          simulationState.cameraShake,
          getRocketImpactCameraShake({
            absorbedByShield: burst.absorbedByShield,
            rocketKind: burst.rocketKind,
          }),
        );
        simulationState.playerDamageFlash = Math.max(
          simulationState.playerDamageFlash,
          getRocketImpactScreenFlash({
            absorbedByShield: burst.absorbedByShield,
            rocketKind: burst.rocketKind,
          }),
        );
        simulationState.playerHudFlicker = Math.max(
          simulationState.playerHudFlicker,
          getRocketImpactHudFlicker({
            absorbedByShield: burst.absorbedByShield,
            rocketKind: burst.rocketKind,
          }),
        );
        continue;
      }

      simulationState.cameraShake = Math.max(
        simulationState.cameraShake,
        getBoundaryAsteroidImpactCameraShake({
          absorbedByShield: burst.absorbedByShield,
        }),
      );
      simulationState.playerDamageFlash = Math.max(
        simulationState.playerDamageFlash,
        getBoundaryAsteroidImpactScreenFlash({
          absorbedByShield: burst.absorbedByShield,
        }),
      );
      simulationState.playerHudFlicker = Math.max(
        simulationState.playerHudFlicker,
        getBoundaryAsteroidImpactHudFlicker({
          absorbedByShield: burst.absorbedByShield,
        }),
      );
    }

    for (const controller of getBoostVisualControllers(
      simulationState.currentState,
    )) {
      const lastSeenTick =
        simulationState.lastBoostVisualTickByPlayerId.get(
          controller.playerId,
        ) ?? null;
      if (
        controller.lastBoostTick !== null &&
        controller.lastBoostTick !== lastSeenTick
      ) {
        const boostedPlanet =
          simulationState.currentState.planets.find(
            (planet) => planet.id === controller.planetId,
          ) ?? null;
        if (boostedPlanet?.alive) {
          simulationState.activeBoostBursts.push({
            direction: normalizeVec2(controller.lastBoostAimDir),
            origin: { x: boostedPlanet.pos.x, y: boostedPlanet.pos.y },
            planetId: boostedPlanet.id,
            radius: boostedPlanet.radius,
            startedAtSec: nowSec,
            tick: controller.lastBoostTick,
          });
        }
        while (
          simulationState.activeBoostBursts.length > MAX_ACTIVE_BOOST_BURSTS
        ) {
          simulationState.activeBoostBursts.shift();
        }
      }
      simulationState.lastBoostVisualTickByPlayerId.set(
        controller.playerId,
        controller.lastBoostTick,
      );
    }

    const consumedGravityPulse =
      gravityPulseRequestedThisStep &&
      previousGravityPulseHeld &&
      !simulationState.currentState.player.gravityPulseHeld;

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

    simulationState.accumulatorSec -= FIXED_STEP_SEC;
    stepCount += 1;
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
  syncLocalSandboxEntityLookups(
    simulationState.renderPlanetsById,
    simulationState.renderSunsById,
    simulationState.renderState,
  );
  const interpolationProfilerEndMs = profilingEnabled ? performance.now() : 0;

  return {
    frameDeltaSec,
    frameGapSec: rawFrameDeltaSec,
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
}) => {
  if (lockAcquiredTick === null) {
    return 0;
  }

  const seekerLockTicks = getSeekerLockTicks();
  if (seekerLockTicks <= 0) {
    return 1;
  }

  return Math.min(
    1,
    Math.max(0, currentTick - lockAcquiredTick) / seekerLockTicks,
  );
};
