import type { RocketKind, Vec2 } from "@3body/shared";
import type { Group, Mesh } from "three/webgpu";
import type {
  CombatSandboxCache,
  CombatSandboxPlanet,
  CombatSandboxState,
} from "../combatSandbox";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import type {
  BlackHoleSwallowState,
  BlackHoleSwallowVisual,
} from "./blackHoleVisuals";
import {
  type CacheIconKey,
  type CacheSpriteAssets,
  type CacheSpriteMaterialMap,
  type CacheVisual,
  createCacheVisual as createSharedCacheVisual,
  getCacheIconKey as getSharedCacheIconKey,
  updateCacheVisualBadge as updateSharedCacheVisualBadge,
} from "./cacheVisuals";
import type { GameViewportInputRuntimeState } from "./localInput";
import type {
  createLocalSandboxSimulationState,
  LocalSandboxGravityPulseState,
  runLocalSandboxSimulationFrame,
} from "./localSandboxSimulation";
import type { LocalViewportCameraState } from "./localViewportCamera";
import { buildLocalViewportCelestialSync } from "./localViewportCelestialSync";
import {
  buildLocalViewportCombatFrameBundle,
  type LocalViewportCombatCannonFireState,
} from "./localViewportFrameBundle";
import {
  GRAVITY_PULSE_VISUAL_DURATION_SEC,
  resetLocalViewportSceneState,
  type SyncLocalViewportSceneEnvironmentParams,
  syncLocalViewportSceneEnvironment,
} from "./localViewportScene";
import {
  createLocalViewportSceneState,
  type LocalViewportSceneState,
  type LocalViewportSceneVisualMaps,
} from "./localViewportSceneState";
import {
  clearLocalViewportPlanetExplosionEvents,
  createLocalViewportTransientEvents,
  type LocalViewportTransientEvents,
  queueLocalViewportPlanetExplosionEvent,
} from "./localViewportTransientEvents";
import type { createLocalViewportVisualResources } from "./localViewportVisualResources";
import {
  getViewportBudgetedCount,
  type ViewportRenderQualityProfile,
} from "./renderQuality";
import type {
  SharedCombatBoostBurstState,
  SharedCombatBoostBurstVisual,
} from "./sharedCombatBoostVisuals";
import type { SharedCombatLaunchBurstPoolVisual } from "./sharedCombatLaunchBurstPools";
import type {
  SharedCombatPlanetExplosionSource,
  SharedCombatPlanetExplosionState,
  SharedCombatPlanetExplosionVisual,
} from "./sharedCombatPlanetExplosions";
import type { SharedCombatRocketPoolVisual } from "./sharedCombatRocketPools";
import type {
  SharedCombatGravityPulseVisual,
  SharedCombatImpactBurstVisual,
} from "./sharedCombatSceneResources";
import type { SharedCombatSceneBackgroundSync } from "./sharedCombatSceneSync";
import type {
  SharedCombatCannonVisual,
  SharedCombatLockRingVisual,
  SharedCombatShieldVisual,
} from "./sharedCombatSupportVisuals";
import { updateSharedCombatViewport } from "./sharedCombatViewport";

interface LocalViewportRuntimeAdapter {
  sceneResources: LocalViewportRuntimeSceneResources;
  sceneSync: LocalViewportRuntimeSceneSync;
  sceneState: LocalViewportSceneState;
  transientEvents: LocalViewportTransientEvents;
  transientVisualPools: {
    inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
    inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
  };
  weaponKinds: readonly RocketKind[];
}

export interface UpdateLocalViewportRuntimeSharedSceneParams {
  activeBlackHoleSwallowEffects: BlackHoleSwallowState[];
  activeBoostBursts: SharedCombatBoostBurstState[];
  activeGravityPulse: LocalSandboxGravityPulseState | null;
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
  background: SharedCombatSceneBackgroundSync;
  blackHoleGroup: Group;
  blackHoleRing: Mesh;
  boostBurstParticlesPerBurst: number;
  boostBurstVisual: SharedCombatBoostBurstVisual;
  cacheBadgeScale: number;
  cacheSpriteAssets: CacheSpriteAssets;
  cameraState: Pick<LocalViewportCameraState, "visibleWorldHeight">;
  cannonFireState: LocalViewportCombatCannonFireState;
  cannonVisual: SharedCombatCannonVisual;
  controlsEnabled: boolean;
  createCacheVisual: (
    cache: CombatSandboxCache,
    badgeMaterials: CacheSpriteAssets["badgeMaterials"],
  ) => CacheVisual;
  createNeutronStarVisual: Parameters<
    typeof buildLocalViewportCelestialSync
  >[0]["createNeutronStarVisual"];
  createPlanetVisual: Parameters<
    typeof buildLocalViewportCelestialSync
  >[0]["createPlanetVisual"];
  createSunVisual: Parameters<
    typeof buildLocalViewportCelestialSync
  >[0]["createSunVisual"];
  currentState: CombatSandboxState;
  disposeCacheVisual: (visual: CacheVisual) => void;
  disposeNeutronStarVisual: Parameters<
    typeof buildLocalViewportCelestialSync
  >[0]["disposeNeutronStarVisual"];
  disposePlanetVisual: Parameters<
    typeof buildLocalViewportCelestialSync
  >[0]["disposePlanetVisual"];
  disposeSunVisual: Parameters<
    typeof buildLocalViewportCelestialSync
  >[0]["disposeSunVisual"];
  getCacheIconKey: (contents: CombatSandboxCache["contents"]) => CacheIconKey;
  gravityPulseDurationSec: number;
  gravityPulseVisual: SharedCombatGravityPulseVisual;
  hostElement: HTMLDivElement;
  impactBurstVisuals: readonly SharedCombatImpactBurstVisual[];
  inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
  inputState: {
    aimWorld: Vec2;
    selectedRocketKind: RocketKind;
  };
  lockRingVisual: SharedCombatLockRingVisual;
  maxRocketTrailSamples: number;
  maxVisibleImpactBursts: number;
  playerBoostHeld: boolean;
  playerPlanet: CombatSandboxPlanet | null;
  renderPlanetsById: ReadonlyMap<number, CombatSandboxPlanet>;
  renderQuality: ViewportRenderQualityProfile;
  renderState: CombatSandboxState;
  rocketLaunchBurstPools: Record<RocketKind, SharedCombatLaunchBurstPoolVisual>;
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual>;
  scene: {
    add: (object: CacheVisual["group"]) => void;
    remove: (object: CacheVisual["group"]) => void;
  };
  sceneState: LocalViewportSceneState;
  shieldVisual: SharedCombatShieldVisual;
  tuning?: ReturnType<typeof getRuntimeTuningDocument>;
  updateCacheVisualBadge: (
    visual: CacheVisual,
    badgeMaterials: CacheSpriteAssets["badgeMaterials"],
    key: CacheIconKey,
  ) => void;
  weaponKinds: readonly RocketKind[];
}

type ResetLocalViewportRuntimeSceneStateParams = Omit<
  Parameters<typeof resetLocalViewportSceneState>[0],
  | "activeBlackHoleSwallowEffects"
  | "boostBurstVisual"
  | "boundaryDebrisVisual"
  | "debrisVisual"
  | "disposeCacheVisual"
  | "gravityPulseVisual"
  | "impactBurstVisuals"
  | "inactiveBlackHoleSwallowVisuals"
  | "rocketLaunchBurstPools"
  | "rocketPools"
  | "sceneState"
  | "shieldGroup"
  | "weaponKinds"
> & {
  adapter: LocalViewportRuntimeAdapter;
};

type UpdateLocalViewportSceneParams = SyncLocalViewportSceneEnvironmentParams &
  Omit<
    UpdateLocalViewportRuntimeSharedSceneParams,
    "background" | "cameraState" | "lockRingVisual" | "shieldVisual" | "tuning"
  > & {
    backgroundLayers: SharedCombatSceneBackgroundSync["backgroundLayers"];
    cameraState: LocalViewportCameraState;
    lockRingLockedUniform: SharedCombatLockRingVisual["lockedUniform"];
    lockRingMesh: SharedCombatLockRingVisual["mesh"];
    lockRingProgressUniform: SharedCombatLockRingVisual["progressUniform"];
    lockRingTimeUniform: SharedCombatLockRingVisual["timeUniform"];
    shieldArcOpacityUniform: SharedCombatShieldVisual["arcOpacityUniform"];
    shieldCrestOpacityUniform: SharedCombatShieldVisual["crestOpacityUniform"];
    shieldGlowOpacityUniform: SharedCombatShieldVisual["glowOpacityUniform"];
    shieldGroup: SharedCombatShieldVisual["group"];
    shieldPanelOpacityUniform: SharedCombatShieldVisual["panelOpacityUniform"];
  };

type LocalViewportRuntimeSceneSync = Pick<
  UpdateLocalViewportSceneParams,
  | "createNeutronStarVisual"
  | "createPlanetVisual"
  | "createSunVisual"
  | "disposeNeutronStarVisual"
  | "disposePlanetVisual"
  | "disposeSunVisual"
>;

interface LocalViewportRuntimeSceneResources {
  effects: {
    impactBurstVisuals: UpdateLocalViewportSceneParams["impactBurstVisuals"];
  };
  lockRing: {
    lockedUniform: UpdateLocalViewportSceneParams["lockRingLockedUniform"];
    mesh: UpdateLocalViewportSceneParams["lockRingMesh"];
    progressUniform: UpdateLocalViewportSceneParams["lockRingProgressUniform"];
    timeUniform: UpdateLocalViewportSceneParams["lockRingTimeUniform"];
  };
  shield: {
    arcOpacityUniform: UpdateLocalViewportSceneParams["shieldArcOpacityUniform"];
    crestOpacityUniform: UpdateLocalViewportSceneParams["shieldCrestOpacityUniform"];
    glowOpacityUniform: UpdateLocalViewportSceneParams["shieldGlowOpacityUniform"];
    group: UpdateLocalViewportSceneParams["shieldGroup"];
    panelOpacityUniform: UpdateLocalViewportSceneParams["shieldPanelOpacityUniform"];
  };
  visualBudgetCaps: {
    boostBurstParticlesPerBurst: number;
    maxDebrisSamples: number;
    maxRocketTrailSamples: number;
    maxVisibleImpactBursts: number;
  };
  visuals: Pick<
    UpdateLocalViewportSceneParams,
    | "blackHoleGroup"
    | "blackHoleRing"
    | "boostBurstVisual"
    | "boundaryDebrisVisual"
    | "cacheSpriteAssets"
    | "cannonFireState"
    | "cannonVisual"
    | "chromaticAberrationNode"
    | "debrisVisual"
    | "gravityPulseVisual"
    | "rocketLaunchBurstPools"
    | "rocketPools"
  >;
}

type LocalSandboxSimulationState = ReturnType<
  typeof createLocalSandboxSimulationState
>;

type LocalSandboxSimulationFrame = ReturnType<
  typeof runLocalSandboxSimulationFrame
>;

type LocalViewportRuntimeSceneFrame = Pick<
  UpdateLocalViewportSceneParams,
  | "activeBoostBursts"
  | "activeGravityPulse"
  | "backgroundLayers"
  | "blackHoleGroup"
  | "blackHoleRing"
  | "boostBurstVisual"
  | "boostBurstParticlesPerBurst"
  | "boundaryDebrisVisual"
  | "cameraState"
  | "cacheBadgeScale"
  | "cacheSpriteAssets"
  | "cannonFireState"
  | "cannonVisual"
  | "chromaticAberrationNode"
  | "controlsEnabled"
  | "currentState"
  | "debrisVisual"
  | "gravityPulseVisual"
  | "impactBurstVisuals"
  | "inputState"
  | "lockRingLockedUniform"
  | "lockRingMesh"
  | "lockRingProgressUniform"
  | "lockRingTimeUniform"
  | "maxDebrisSamples"
  | "maxRocketTrailSamples"
  | "maxVisibleImpactBursts"
  | "nowSec"
  | "playerBoostHeld"
  | "playerPlanet"
  | "renderPlanetsById"
  | "renderQuality"
  | "renderState"
  | "rocketLaunchBurstPools"
  | "rocketPools"
  | "shieldArcOpacityUniform"
  | "shieldCrestOpacityUniform"
  | "shieldGlowOpacityUniform"
  | "shieldGroup"
  | "shieldPanelOpacityUniform"
>;

type UpdateLocalViewportRuntimeSceneParams = Omit<
  UpdateLocalViewportSceneParams,
  | "activeBlackHoleSwallowEffects"
  | "activePlanetExplosions"
  | "createCacheVisual"
  | "disposeCacheVisual"
  | "getCacheIconKey"
  | "gravityPulseDurationSec"
  | "inactiveBlackHoleSwallowVisuals"
  | "inactivePlanetExplosionVisuals"
  | keyof LocalViewportRuntimeSceneSync
  | "sceneState"
  | "updateCacheVisualBadge"
  | "weaponKinds"
  | keyof LocalViewportRuntimeSceneFrame
> & {
  adapter: LocalViewportRuntimeAdapter;
  frame: LocalViewportRuntimeSceneFrame;
};

const createLocalRuntimeCacheVisual = (
  cache: CombatSandboxCache,
  badgeMaterials: CacheSpriteMaterialMap,
): CacheVisual => createSharedCacheVisual(cache, badgeMaterials) as CacheVisual;

const disposeLocalRuntimeCacheVisual = (_visual: CacheVisual) => {};

const updateLocalRuntimeCacheVisualBadge = (
  visual: CacheVisual,
  badgeMaterials: CacheSpriteMaterialMap,
  key: CacheIconKey,
) => updateSharedCacheVisualBadge(visual, badgeMaterials, key);

export const createLocalViewportRuntimeAdapter = ({
  cacheVisuals,
  initialState,
  maps,
  renderedCacheKeysById,
  sceneResources,
  sceneSync,
  transientVisualPools,
  weaponKinds,
}: {
  cacheVisuals: Map<number, CacheVisual>;
  initialState: CombatSandboxState;
  maps: LocalViewportSceneVisualMaps;
  renderedCacheKeysById: Map<number, CacheIconKey>;
  sceneResources: LocalViewportRuntimeSceneResources;
  sceneSync: LocalViewportRuntimeSceneSync;
  transientVisualPools: LocalViewportRuntimeAdapter["transientVisualPools"];
  weaponKinds: readonly RocketKind[];
}): LocalViewportRuntimeAdapter => {
  const transientEvents = createLocalViewportTransientEvents(initialState);

  return {
    sceneResources,
    sceneSync,
    sceneState: createLocalViewportSceneState({
      blackHoleSwallowTracker: transientEvents.blackHoleSwallowTracker,
      cacheVisuals,
      maps,
      renderedCacheKeysById,
      weaponKinds,
    }),
    transientEvents,
    transientVisualPools,
    weaponKinds,
  };
};

type LocalViewportVisualResources = ReturnType<
  typeof createLocalViewportVisualResources
>;

export const createLocalViewportRuntimeAdapterFromVisualResources = ({
  chromaticAberrationNode,
  initialState,
  visualBudgetCaps,
  visualResources,
  weaponKinds,
}: {
  chromaticAberrationNode: UpdateLocalViewportSceneParams["chromaticAberrationNode"];
  initialState: CombatSandboxState;
  visualBudgetCaps: LocalViewportRuntimeSceneResources["visualBudgetCaps"];
  visualResources: LocalViewportVisualResources;
  weaponKinds: readonly RocketKind[];
}): LocalViewportRuntimeAdapter =>
  createLocalViewportRuntimeAdapter({
    cacheVisuals: visualResources.cacheVisuals,
    initialState,
    maps: {
      neutronStarVisuals: visualResources.neutronStarVisuals,
      planetVisuals: visualResources.planetVisuals,
      sunVisuals: visualResources.sunVisuals,
    },
    renderedCacheKeysById: visualResources.renderedCacheKeysById,
    sceneResources: {
      effects: {
        impactBurstVisuals: visualResources.impactBurstVisuals,
      },
      lockRing: {
        lockedUniform: visualResources.lockRingLockedUniform,
        mesh: visualResources.lockRingMesh,
        progressUniform: visualResources.lockRingProgressUniform,
        timeUniform: visualResources.lockRingTimeUniform,
      },
      shield: {
        arcOpacityUniform: visualResources.shieldArcOpacityUniform,
        crestOpacityUniform: visualResources.shieldCrestOpacityUniform,
        glowOpacityUniform: visualResources.shieldGlowOpacityUniform,
        group: visualResources.shieldGroup,
        panelOpacityUniform: visualResources.shieldPanelOpacityUniform,
      },
      visualBudgetCaps,
      visuals: {
        blackHoleGroup: visualResources.blackHoleGroup,
        blackHoleRing: visualResources.blackHoleRing,
        boostBurstVisual: visualResources.boostBurstVisual,
        boundaryDebrisVisual: visualResources.boundaryDebrisVisual,
        cacheSpriteAssets: visualResources.cacheSpriteAssets,
        cannonFireState: visualResources.cannonFireState,
        cannonVisual: visualResources.cannonVisual,
        chromaticAberrationNode,
        debrisVisual: visualResources.debrisVisual,
        gravityPulseVisual: visualResources.gravityPulseVisual,
        rocketLaunchBurstPools: visualResources.rocketLaunchBurstPools,
        rocketPools: visualResources.rocketPools,
      },
    },
    sceneSync: {
      createNeutronStarVisual: visualResources.createNeutronStarVisual,
      createPlanetVisual: visualResources.createPlanetVisual,
      createSunVisual: visualResources.createSunVisual,
      disposeNeutronStarVisual: visualResources.disposeNeutronStarVisual,
      disposePlanetVisual: visualResources.disposePlanetVisual,
      disposeSunVisual: visualResources.disposeSunVisual,
    },
    transientVisualPools: {
      inactiveBlackHoleSwallowVisuals:
        visualResources.inactiveBlackHoleSwallowVisuals,
      inactivePlanetExplosionVisuals:
        visualResources.inactivePlanetExplosionVisuals,
    },
    weaponKinds,
  });

export const buildLocalViewportRuntimeSceneFrame = ({
  adapter,
  backgroundLayers,
  cameraState,
  cacheBadgeScale,
  controlsEnabled,
  inputRuntime,
  nowSec,
  renderQuality,
  simulationFrame,
  simulationState,
}: {
  adapter: LocalViewportRuntimeAdapter;
  backgroundLayers: UpdateLocalViewportSceneParams["backgroundLayers"];
  cameraState: UpdateLocalViewportSceneParams["cameraState"];
  cacheBadgeScale: UpdateLocalViewportSceneParams["cacheBadgeScale"];
  controlsEnabled: boolean;
  inputRuntime: GameViewportInputRuntimeState;
  nowSec: number;
  renderQuality: ViewportRenderQualityProfile;
  simulationFrame: Pick<LocalSandboxSimulationFrame, "playerPlanet">;
  simulationState: Pick<
    LocalSandboxSimulationState,
    | "activeBoostBursts"
    | "activeGravityPulse"
    | "currentState"
    | "renderPlanetsById"
    | "renderState"
  >;
}): LocalViewportRuntimeSceneFrame => {
  const { sceneResources } = adapter;

  return {
    activeBoostBursts: simulationState.activeBoostBursts,
    activeGravityPulse: simulationState.activeGravityPulse,
    backgroundLayers,
    blackHoleGroup: sceneResources.visuals.blackHoleGroup,
    blackHoleRing: sceneResources.visuals.blackHoleRing,
    boostBurstVisual: sceneResources.visuals.boostBurstVisual,
    boostBurstParticlesPerBurst: getViewportBudgetedCount(
      sceneResources.visualBudgetCaps.boostBurstParticlesPerBurst,
      renderQuality.boostBurstBudget,
    ),
    boundaryDebrisVisual: sceneResources.visuals.boundaryDebrisVisual,
    cameraState,
    cacheBadgeScale,
    cacheSpriteAssets: sceneResources.visuals.cacheSpriteAssets,
    cannonFireState: sceneResources.visuals.cannonFireState,
    cannonVisual: sceneResources.visuals.cannonVisual,
    chromaticAberrationNode: sceneResources.visuals.chromaticAberrationNode,
    controlsEnabled,
    currentState: simulationState.currentState,
    debrisVisual: sceneResources.visuals.debrisVisual,
    gravityPulseVisual: sceneResources.visuals.gravityPulseVisual,
    impactBurstVisuals: sceneResources.effects.impactBurstVisuals,
    inputState: inputRuntime.inputState,
    lockRingLockedUniform: sceneResources.lockRing.lockedUniform,
    lockRingMesh: sceneResources.lockRing.mesh,
    lockRingProgressUniform: sceneResources.lockRing.progressUniform,
    lockRingTimeUniform: sceneResources.lockRing.timeUniform,
    maxDebrisSamples: getViewportBudgetedCount(
      sceneResources.visualBudgetCaps.maxDebrisSamples,
      renderQuality.debrisBudget,
    ),
    maxRocketTrailSamples:
      sceneResources.visualBudgetCaps.maxRocketTrailSamples,
    maxVisibleImpactBursts: getViewportBudgetedCount(
      sceneResources.visualBudgetCaps.maxVisibleImpactBursts,
      renderQuality.impactBurstBudget,
    ),
    nowSec,
    playerBoostHeld: inputRuntime.pendingAbilityRequests.boost,
    playerPlanet: simulationFrame.playerPlanet,
    renderPlanetsById: simulationState.renderPlanetsById,
    renderQuality,
    renderState: simulationState.renderState,
    rocketLaunchBurstPools: sceneResources.visuals.rocketLaunchBurstPools,
    rocketPools: sceneResources.visuals.rocketPools,
    shieldArcOpacityUniform: sceneResources.shield.arcOpacityUniform,
    shieldCrestOpacityUniform: sceneResources.shield.crestOpacityUniform,
    shieldGlowOpacityUniform: sceneResources.shield.glowOpacityUniform,
    shieldGroup: sceneResources.shield.group,
    shieldPanelOpacityUniform: sceneResources.shield.panelOpacityUniform,
  };
};

export const clearLocalViewportRuntimePlanetExplosionEvents = ({
  adapter,
}: {
  adapter: LocalViewportRuntimeAdapter;
}) => {
  clearLocalViewportPlanetExplosionEvents({
    events: adapter.transientEvents,
    inactivePlanetExplosionVisuals:
      adapter.transientVisualPools.inactivePlanetExplosionVisuals,
  });
};

export const queueLocalViewportRuntimePlanetExplosionEvent = ({
  adapter,
  planet,
  startedAtSec,
}: {
  adapter: LocalViewportRuntimeAdapter;
  planet: SharedCombatPlanetExplosionSource;
  startedAtSec: number;
}) => {
  queueLocalViewportPlanetExplosionEvent({
    events: adapter.transientEvents,
    inactivePlanetExplosionVisuals:
      adapter.transientVisualPools.inactivePlanetExplosionVisuals,
    planet,
    startedAtSec,
  });
};

export const resetLocalViewportRuntimeSceneState = ({
  adapter,
  ...params
}: ResetLocalViewportRuntimeSceneStateParams) => {
  resetLocalViewportSceneState({
    ...params,
    activeBlackHoleSwallowEffects:
      adapter.transientEvents.activeBlackHoleSwallowEffects,
    boostBurstVisual: adapter.sceneResources.visuals.boostBurstVisual,
    boundaryDebrisVisual: adapter.sceneResources.visuals.boundaryDebrisVisual,
    debrisVisual: adapter.sceneResources.visuals.debrisVisual,
    disposeCacheVisual: disposeLocalRuntimeCacheVisual,
    gravityPulseVisual: adapter.sceneResources.visuals.gravityPulseVisual,
    impactBurstVisuals: adapter.sceneResources.effects.impactBurstVisuals,
    inactiveBlackHoleSwallowVisuals:
      adapter.transientVisualPools.inactiveBlackHoleSwallowVisuals,
    rocketLaunchBurstPools:
      adapter.sceneResources.visuals.rocketLaunchBurstPools,
    rocketPools: adapter.sceneResources.visuals.rocketPools,
    sceneState: adapter.sceneState,
    shieldGroup: adapter.sceneResources.shield.group,
    weaponKinds: adapter.weaponKinds,
  });
};

export const updateLocalViewportRuntimeSharedScene = ({
  activeBlackHoleSwallowEffects,
  activeBoostBursts,
  activeGravityPulse,
  activePlanetExplosions,
  background,
  blackHoleGroup,
  blackHoleRing,
  boostBurstParticlesPerBurst,
  boostBurstVisual,
  cacheBadgeScale,
  cacheSpriteAssets,
  cameraState,
  cannonFireState,
  cannonVisual,
  controlsEnabled,
  createCacheVisual,
  createNeutronStarVisual,
  createPlanetVisual,
  createSunVisual,
  currentState,
  disposeCacheVisual,
  disposeNeutronStarVisual,
  disposePlanetVisual,
  disposeSunVisual,
  getCacheIconKey,
  gravityPulseDurationSec,
  gravityPulseVisual,
  hostElement,
  impactBurstVisuals,
  inactiveBlackHoleSwallowVisuals,
  inactivePlanetExplosionVisuals,
  inputState,
  lockRingVisual,
  maxRocketTrailSamples,
  maxVisibleImpactBursts,
  playerBoostHeld,
  playerPlanet,
  renderPlanetsById,
  renderQuality,
  renderState,
  rocketLaunchBurstPools,
  rocketPools,
  scene,
  sceneState,
  shieldVisual,
  tuning,
  updateCacheVisualBadge,
  weaponKinds,
}: UpdateLocalViewportRuntimeSharedSceneParams) => {
  const nowSec = background.nowSec;
  const blackHole = renderState.blackHole;
  const runtimeTuning = tuning ?? getRuntimeTuningDocument();

  const viewportFrameBundle = buildLocalViewportCombatFrameBundle({
    activeBlackHoleSwallowEffects,
    activeBoostBursts,
    activeCacheIds: sceneState.activeCacheIds,
    activeGravityPulse,
    activePlanetExplosions,
    blackHoleGroup,
    blackHoleRing,
    blackHoleSwallowTracker: sceneState.blackHoleSwallowTracker,
    boostBurstParticlesPerBurst,
    boostBurstVisual,
    cacheBadgeScale,
    cacheSpriteAssets,
    cacheVisuals: sceneState.cacheVisuals,
    cameraState,
    cannonFireState,
    cannonVisual,
    controlsEnabled,
    createCacheVisual,
    currentState,
    disposeCacheVisual,
    getCacheIconKey,
    gravityPulseDurationSec,
    gravityPulseVisual,
    hostElement,
    impactBurstVisuals,
    inactiveBlackHoleSwallowVisuals,
    inactivePlanetExplosionVisuals,
    inputState,
    launchBurstsByKind: sceneState.launchBurstsByKind,
    lockRingVisual,
    maxRocketTrailSamples,
    maxVisibleImpactBursts,
    nowSec,
    playerBoostHeld,
    playerPlanet,
    renderPlanetsById,
    renderQuality,
    renderState,
    renderedCacheKeysById: sceneState.renderedCacheKeysById,
    rocketLaunchBurstPools,
    rocketPools,
    rocketTrailStates: sceneState.rocketTrailStates,
    rocketsByKind: sceneState.rocketsByKind,
    scene,
    shieldVisual,
    tuning: runtimeTuning,
    updateCacheVisualBadge,
    weaponKinds,
  });

  updateSharedCombatViewport({
    background,
    celestial: buildLocalViewportCelestialSync({
      activeBlackHoleSwallowEffects,
      blackHole,
      blackHoleSwallowTracker: sceneState.blackHoleSwallowTracker,
      createNeutronStarVisual,
      createPlanetVisual,
      createSunVisual,
      disposeNeutronStarVisual,
      disposePlanetVisual,
      disposeSunVisual,
      inactiveBlackHoleSwallowVisuals,
      neutronStarVisuals: sceneState.maps.neutronStarVisuals,
      nowSec,
      planetVisuals: sceneState.maps.planetVisuals,
      renderState,
      tuning: runtimeTuning,
      sunVisuals: sceneState.maps.sunVisuals,
    }),
    viewportFrameBundle,
  });
};

const updateLocalViewportRuntimeScene = ({
  adapter,
  frame,
  ...params
}: UpdateLocalViewportRuntimeSceneParams) => {
  syncLocalViewportSceneEnvironment({
    boundaryDebrisVisual: frame.boundaryDebrisVisual,
    chromaticAberrationNode: frame.chromaticAberrationNode,
    currentState: frame.currentState,
    debrisVisual: frame.debrisVisual,
    maxDebrisSamples: frame.maxDebrisSamples,
    nowSec: frame.nowSec,
    renderQuality: frame.renderQuality,
    renderState: frame.renderState,
    sceneState: adapter.sceneState,
    weaponKinds: adapter.weaponKinds,
  });

  updateLocalViewportRuntimeSharedScene({
    activeBlackHoleSwallowEffects:
      adapter.transientEvents.activeBlackHoleSwallowEffects,
    activePlanetExplosions: adapter.transientEvents.activePlanetExplosions,
    background: {
      backgroundLayers: frame.backgroundLayers,
      nowSec: frame.nowSec,
      renderCenterX: frame.cameraState.renderCenterX,
      renderCenterY: frame.cameraState.renderCenterY,
    },
    ...params,
    ...frame,
    ...adapter.sceneSync,
    createCacheVisual: createLocalRuntimeCacheVisual,
    disposeCacheVisual: disposeLocalRuntimeCacheVisual,
    gravityPulseDurationSec: GRAVITY_PULSE_VISUAL_DURATION_SEC,
    getCacheIconKey: getSharedCacheIconKey,
    inactiveBlackHoleSwallowVisuals:
      adapter.transientVisualPools.inactiveBlackHoleSwallowVisuals,
    inactivePlanetExplosionVisuals:
      adapter.transientVisualPools.inactivePlanetExplosionVisuals,
    lockRingVisual: {
      lockedUniform: frame.lockRingLockedUniform,
      mesh: frame.lockRingMesh,
      progressUniform: frame.lockRingProgressUniform,
      timeUniform: frame.lockRingTimeUniform,
    },
    sceneState: adapter.sceneState,
    shieldVisual: {
      arcOpacityUniform: frame.shieldArcOpacityUniform,
      crestOpacityUniform: frame.shieldCrestOpacityUniform,
      glowOpacityUniform: frame.shieldGlowOpacityUniform,
      group: frame.shieldGroup,
      panelOpacityUniform: frame.shieldPanelOpacityUniform,
    },
    tuning: getRuntimeTuningDocument(),
    updateCacheVisualBadge: updateLocalRuntimeCacheVisualBadge,
    weaponKinds: adapter.weaponKinds,
  });
};

type UpdateLocalViewportRuntimeFrameParams = Parameters<
  typeof buildLocalViewportRuntimeSceneFrame
>[0] &
  Omit<UpdateLocalViewportRuntimeSceneParams, "adapter" | "frame">;

export const updateLocalViewportRuntimeFrame = ({
  adapter,
  hostElement,
  scene,
  ...frameParams
}: UpdateLocalViewportRuntimeFrameParams) => {
  updateLocalViewportRuntimeScene({
    adapter,
    frame: buildLocalViewportRuntimeSceneFrame({
      adapter,
      ...frameParams,
    }),
    hostElement,
    scene,
  });
};
