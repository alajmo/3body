import type { RocketKind, World } from "@3body/shared";
import type { Object3D, Scene } from "three/webgpu";
import type { AuthoritativeMatchRuntimeState } from "../authoritativeMatchRuntime";
import { getScaledRocketVisuals } from "../rocketVisualTuning";
import type { getRuntimeTuningDocument } from "../runtimeTuning";
import {
  getAmbientBoundaryDebrisRadii,
  updateAmbientBoundaryDebrisVisual,
} from "./ambientBoundaryDebris";
import {
  type ImmediateCannonFlashState,
  type ImmediateGravityPulseFeedbackState,
  type QueueAuthoritativeBlackHoleSwallowEffectArgs,
  queueAuthoritativeImmediateAbilityFeedback,
  syncAuthoritativeLaunchBurstFeedback,
  syncAuthoritativeRecentEventFeedback,
} from "./authoritativeCosmeticFeedback";
import { updateAuthoritativeDebrisVisual } from "./authoritativeDebrisVisual";
import {
  type AuthoritativeViewportCelestialGeometry,
  type AuthoritativeViewportCelestialPreviousState,
  buildAuthoritativeViewportCelestialSync,
} from "./authoritativeViewportCelestialSync";
import {
  AUTHORITATIVE_VIEWPORT_IMPACT_BURST_DURATION_SEC,
  type AuthoritativeViewportFrameCameraState,
  type AuthoritativeViewportFrameCombatState,
  type AuthoritativeViewportFrameEffects,
  type AuthoritativeViewportFramePreviousState,
  type AuthoritativeViewportFrameVisuals,
  buildAuthoritativeViewportCombatFrameBundle,
} from "./authoritativeViewportFrameBundle";
import {
  type AuthoritativeViewportImmediateFireFeedbackState,
  createAuthoritativeViewportImmediateFireFeedbackState,
  createAuthoritativeViewportImmediateFireFeedbackVisuals,
  queueAuthoritativeViewportImmediateFireFeedback,
  resetAuthoritativeViewportImmediateFireFeedback,
  syncAuthoritativeViewportImmediateFireFeedback,
} from "./authoritativeViewportImmediateFire";
import {
  type AuthoritativeViewportSceneState,
  createAuthoritativeViewportSceneState,
  disposeAuthoritativeViewportSceneStateVisuals,
  resetAuthoritativeViewportSceneState,
  syncAuthoritativeViewportPlanetsById,
} from "./authoritativeViewportSceneState";
import {
  type AuthoritativeViewportTransientEvents,
  createAuthoritativeViewportTransientEvents,
  queueAuthoritativeViewportBlackHoleSwallowEvent,
  resetAuthoritativeViewportTransientEvents,
} from "./authoritativeViewportTransientEvents";
import type { BlackHoleSwallowVisual } from "./blackHoleVisuals";
import type { CacheVisual } from "./cacheVisuals";
import type { GameViewportInputRuntimeState } from "./localInput";
import {
  getViewportBudgetedCount,
  type ViewportRenderQualityProfile,
} from "./renderQuality";
import { pruneSharedCombatImpactBursts } from "./sharedCombatImpactBursts";
import type { SharedCombatLaunchBurstPoolVisual } from "./sharedCombatLaunchBurstPools";
import {
  queueSharedCombatPlanetExplosion,
  type SharedCombatPlanetExplosionVisual,
} from "./sharedCombatPlanetExplosions";
import type { SharedCombatRocketPoolVisual } from "./sharedCombatRocketPools";
import type { SharedCombatSceneBackgroundSync } from "./sharedCombatSceneSync";
import type {
  SharedCombatImmediateShieldFeedbackState,
  SharedCombatLockRingVisual,
  SharedCombatShieldVisual,
} from "./sharedCombatSupportVisuals";
import { updateSharedCombatViewport } from "./sharedCombatViewport";

export interface AuthoritativeViewportRuntimeAdapter {
  immediateFireFeedback: AuthoritativeViewportImmediateFireFeedbackState;
  rocketKinds: readonly RocketKind[];
  sceneResources: AuthoritativeViewportRuntimeSceneResources | null;
  sceneState: AuthoritativeViewportSceneState;
  transientEvents: AuthoritativeViewportTransientEvents;
  transientVisualPools: {
    inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
    inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
  };
}

type AuthoritativeViewportSceneCameraState =
  AuthoritativeViewportFrameCameraState;

type AuthoritativeViewportSceneGeometry =
  AuthoritativeViewportCelestialGeometry;

type AuthoritativeViewportScenePreviousState =
  AuthoritativeViewportCelestialPreviousState &
    AuthoritativeViewportFramePreviousState;

type AuthoritativeViewportSceneEffects = Omit<
  AuthoritativeViewportFrameEffects,
  "activeCacheIds"
>;

type AuthoritativeViewportSceneVisuals = Omit<
  AuthoritativeViewportFrameVisuals,
  "cacheVisuals"
>;

type AuthoritativeViewportSceneCombatState =
  AuthoritativeViewportFrameCombatState;

export interface UpdateAuthoritativeViewportSceneParams {
  background: SharedCombatSceneBackgroundSync;
  cameraState: AuthoritativeViewportSceneCameraState;
  combat: AuthoritativeViewportSceneCombatState;
  effects: AuthoritativeViewportSceneEffects;
  geometries: AuthoritativeViewportSceneGeometry;
  hostElement: HTMLDivElement;
  renderQuality: ViewportRenderQualityProfile;
  rocketKinds: readonly RocketKind[];
  rocketLaunchBurstPools: Record<
    RocketKind,
    SharedCombatLaunchBurstPoolVisual
  > | null;
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual> | null;
  scene: Scene;
  sceneState: AuthoritativeViewportSceneState;
  tuning: ReturnType<typeof getRuntimeTuningDocument>;
  visuals: AuthoritativeViewportSceneVisuals;
  world: World | null;
}

interface UpdateAuthoritativeViewportSceneResult {
  gravityPulse: ImmediateGravityPulseFeedbackState | null;
  immediateCannonFlashState: ImmediateCannonFlashState | null;
  shieldImmediateFeedback: SharedCombatImmediateShieldFeedbackState | null;
}

type AuthoritativeViewportRuntimeSceneEffects = Omit<
  UpdateAuthoritativeViewportSceneParams["effects"],
  | "activeBlackHoleSwallowEffects"
  | "activeBoostBursts"
  | "activeImpactBursts"
  | "activeLaunchBurstsByKind"
  | "activePlanetExplosions"
  | "inactiveBlackHoleSwallowVisuals"
  | "inactivePlanetExplosionVisuals"
>;

type AuthoritativeViewportRuntimeSceneVisuals = Pick<
  UpdateAuthoritativeViewportSceneParams["visuals"],
  "lockRingVisual" | "shieldVisual"
>;

type BuildAuthoritativeViewportRuntimeSceneVisuals = Omit<
  UpdateAuthoritativeViewportSceneParams["visuals"],
  keyof AuthoritativeViewportRuntimeSceneVisuals
>;

export interface AuthoritativeViewportRuntimeSceneResources {
  debris: {
    boundaryDebrisVisual: Parameters<
      typeof updateAuthoritativeDebrisVisual
    >[0]["boundaryDebrisVisual"];
    debrisVisual: Parameters<
      typeof updateAuthoritativeDebrisVisual
    >[0]["visual"];
    maxDebrisSamples: number;
  };
  effects: AuthoritativeViewportRuntimeSceneEffects;
  geometries: UpdateAuthoritativeViewportSceneParams["geometries"];
  lockRing: {
    lockedUniform: SharedCombatLockRingVisual["lockedUniform"] | null;
    mesh: SharedCombatLockRingVisual["mesh"] | null;
    progressUniform: SharedCombatLockRingVisual["progressUniform"] | null;
    timeUniform: SharedCombatLockRingVisual["timeUniform"] | null;
  };
  rocketLaunchBurstPools: UpdateAuthoritativeViewportSceneParams["rocketLaunchBurstPools"];
  rocketPools: UpdateAuthoritativeViewportSceneParams["rocketPools"];
  shield: {
    arcOpacityUniform: SharedCombatShieldVisual["arcOpacityUniform"] | null;
    crestOpacityUniform: SharedCombatShieldVisual["crestOpacityUniform"] | null;
    glowOpacityUniform: SharedCombatShieldVisual["glowOpacityUniform"] | null;
    group: SharedCombatShieldVisual["group"] | null;
    panelOpacityUniform: SharedCombatShieldVisual["panelOpacityUniform"] | null;
  };
  visuals: BuildAuthoritativeViewportRuntimeSceneVisuals;
}

type AuthoritativeViewportRuntimeSceneFrame = Pick<
  UpdateAuthoritativeViewportSceneParams,
  | "background"
  | "cameraState"
  | "combat"
  | "geometries"
  | "renderQuality"
  | "rocketLaunchBurstPools"
  | "rocketPools"
  | "tuning"
  | "world"
> & {
  effects: AuthoritativeViewportRuntimeSceneEffects;
  visuals: UpdateAuthoritativeViewportSceneParams["visuals"];
};

type UpdateAuthoritativeViewportRuntimeSceneParams = Omit<
  UpdateAuthoritativeViewportSceneParams,
  | "background"
  | "cameraState"
  | "combat"
  | "effects"
  | "geometries"
  | "renderQuality"
  | "rocketLaunchBurstPools"
  | "rocketPools"
  | "rocketKinds"
  | "sceneState"
  | "tuning"
  | "visuals"
  | "world"
> & {
  adapter: AuthoritativeViewportRuntimeAdapter;
  frame: AuthoritativeViewportRuntimeSceneFrame;
};

export const createAuthoritativeViewportRuntimeAdapter = (
  rocketKinds: readonly RocketKind[],
): AuthoritativeViewportRuntimeAdapter => ({
  immediateFireFeedback:
    createAuthoritativeViewportImmediateFireFeedbackState(),
  rocketKinds,
  sceneResources: null,
  sceneState: createAuthoritativeViewportSceneState(rocketKinds),
  transientEvents: createAuthoritativeViewportTransientEvents(rocketKinds),
  transientVisualPools: {
    inactiveBlackHoleSwallowVisuals: [],
    inactivePlanetExplosionVisuals: [],
  },
});

const getAuthoritativeViewportRuntimeSceneResources = (
  adapter: AuthoritativeViewportRuntimeAdapter,
): AuthoritativeViewportRuntimeSceneResources => {
  if (adapter.sceneResources === null) {
    throw new Error(
      "Authoritative viewport scene resources are not initialized",
    );
  }

  return adapter.sceneResources;
};

export const setAuthoritativeViewportRuntimeSceneResources = ({
  adapter,
  resources,
}: {
  adapter: AuthoritativeViewportRuntimeAdapter;
  resources: AuthoritativeViewportRuntimeSceneResources;
}) => {
  adapter.sceneResources = resources;
};

export const buildAuthoritativeViewportRuntimeSceneFrame = ({
  adapter,
  background,
  cameraState,
  combat,
  inputRuntime,
  renderQuality,
  runtime,
  tuning,
  world,
}: {
  adapter: AuthoritativeViewportRuntimeAdapter;
  background: UpdateAuthoritativeViewportSceneParams["background"];
  cameraState: UpdateAuthoritativeViewportSceneParams["cameraState"];
  combat: Omit<
    UpdateAuthoritativeViewportSceneParams["combat"],
    "boostHeld" | "controlsEnabled" | "viewportAimWorld"
  >;
  inputRuntime: GameViewportInputRuntimeState;
  renderQuality: UpdateAuthoritativeViewportSceneParams["renderQuality"];
  runtime: Pick<
    AuthoritativeMatchRuntimeState,
    "connectionState" | "phase" | "snapshot"
  >;
  tuning: UpdateAuthoritativeViewportSceneParams["tuning"];
  world: UpdateAuthoritativeViewportSceneParams["world"];
}): AuthoritativeViewportRuntimeSceneFrame => {
  const resources = getAuthoritativeViewportRuntimeSceneResources(adapter);
  const controlsEnabled =
    runtime.phase === "combat" && runtime.connectionState === "connected";
  const shieldVisual =
    resources.shield.group !== null &&
    resources.shield.arcOpacityUniform !== null &&
    resources.shield.panelOpacityUniform !== null &&
    resources.shield.crestOpacityUniform !== null &&
    resources.shield.glowOpacityUniform !== null
      ? {
          arcOpacityUniform: resources.shield.arcOpacityUniform,
          crestOpacityUniform: resources.shield.crestOpacityUniform,
          glowOpacityUniform: resources.shield.glowOpacityUniform,
          group: resources.shield.group,
          panelOpacityUniform: resources.shield.panelOpacityUniform,
        }
      : null;
  const lockRingVisual =
    resources.lockRing.mesh !== null &&
    resources.lockRing.progressUniform !== null &&
    resources.lockRing.lockedUniform !== null &&
    resources.lockRing.timeUniform !== null
      ? {
          lockedUniform: resources.lockRing.lockedUniform,
          mesh: resources.lockRing.mesh,
          progressUniform: resources.lockRing.progressUniform,
          timeUniform: resources.lockRing.timeUniform,
        }
      : null;

  return {
    background,
    cameraState,
    combat: {
      ...combat,
      boostHeld:
        combat.playerPlanet !== null &&
        controlsEnabled &&
        (runtime.snapshot?.self?.boostCharges ?? 0) > 0 &&
        inputRuntime.pendingAbilityRequests.boost,
      controlsEnabled,
      viewportAimWorld: inputRuntime.inputState.aimWorld,
    },
    effects: resources.effects,
    geometries: resources.geometries,
    renderQuality,
    rocketLaunchBurstPools: resources.rocketLaunchBurstPools,
    rocketPools: resources.rocketPools,
    tuning,
    visuals: {
      ...resources.visuals,
      lockRingVisual,
      shieldVisual,
    },
    world,
  };
};

export const disposeAuthoritativeViewportRuntimeSceneStateVisuals = ({
  adapter,
  sceneRemoveSafe,
}: {
  adapter: AuthoritativeViewportRuntimeAdapter;
  sceneRemoveSafe: (...objects: Object3D[]) => void;
}) => {
  disposeAuthoritativeViewportSceneStateVisuals({
    sceneRemoveSafe,
    state: adapter.sceneState,
  });
};

export const disposeAuthoritativeViewportRuntimeSceneResources = ({
  adapter,
  sceneRemoveSafe,
}: {
  adapter: AuthoritativeViewportRuntimeAdapter;
  sceneRemoveSafe: (...objects: Object3D[]) => void;
}) => {
  const resources = adapter.sceneResources;
  if (resources === null) {
    return;
  }

  if (resources.shield.group !== null) {
    sceneRemoveSafe(resources.shield.group);
  }
  if (resources.lockRing.mesh !== null) {
    sceneRemoveSafe(resources.lockRing.mesh);
  }
  if (resources.visuals.cannonVisual !== null) {
    sceneRemoveSafe(resources.visuals.cannonVisual.group);
  }
  if (resources.visuals.boostBurstVisual !== null) {
    sceneRemoveSafe(
      resources.visuals.boostBurstVisual.points,
      ...resources.visuals.boostBurstVisual.wakeVisuals.map(
        (visual) => visual.mesh,
      ),
    );
  }
  if (resources.visuals.gravityPulseVisual !== null) {
    sceneRemoveSafe(
      resources.visuals.gravityPulseVisual.coreMesh,
      resources.visuals.gravityPulseVisual.ringMesh,
      resources.visuals.gravityPulseVisual.echoMesh,
    );
  }
  for (const visual of resources.effects.impactBurstVisuals) {
    sceneRemoveSafe(visual.glowMesh, visual.ringMesh, visual.coreMesh);
  }

  adapter.sceneResources = null;
};

export const resetAuthoritativeViewportRuntimeAdapter = ({
  adapter,
  sceneRemoveSafe,
}: {
  adapter: AuthoritativeViewportRuntimeAdapter;
  sceneRemoveSafe: (...objects: Object3D[]) => void;
}) => {
  resetAuthoritativeViewportImmediateFireFeedback({
    feedback: adapter.immediateFireFeedback,
    sceneRemoveSafe,
  });
  resetAuthoritativeViewportTransientEvents({
    events: adapter.transientEvents,
    inactivePlanetExplosionVisuals:
      adapter.transientVisualPools.inactivePlanetExplosionVisuals,
    rocketKinds: adapter.rocketKinds,
  });
  resetAuthoritativeViewportSceneState({
    rocketKinds: adapter.rocketKinds,
    state: adapter.sceneState,
  });
  adapter.sceneResources = null;
};

export const createAuthoritativeViewportRuntimeImmediateFireFeedbackVisuals = ({
  adapter,
  ...params
}: Omit<
  Parameters<typeof createAuthoritativeViewportImmediateFireFeedbackVisuals>[0],
  "feedback" | "rocketKinds"
> & {
  adapter: AuthoritativeViewportRuntimeAdapter;
}) => {
  createAuthoritativeViewportImmediateFireFeedbackVisuals({
    ...params,
    feedback: adapter.immediateFireFeedback,
    rocketKinds: adapter.rocketKinds,
  });
};

export const getAuthoritativeViewportRuntimeCacheVisuals = (
  adapter: AuthoritativeViewportRuntimeAdapter,
): Map<number, CacheVisual> => adapter.sceneState.cacheVisuals;

export const setAuthoritativeViewportRuntimeTransientVisualPools = ({
  adapter,
  inactiveBlackHoleSwallowVisuals,
  inactivePlanetExplosionVisuals,
}: {
  adapter: AuthoritativeViewportRuntimeAdapter;
  inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
}) => {
  adapter.transientVisualPools.inactiveBlackHoleSwallowVisuals =
    inactiveBlackHoleSwallowVisuals;
  adapter.transientVisualPools.inactivePlanetExplosionVisuals =
    inactivePlanetExplosionVisuals;
};

export const syncAuthoritativeViewportRuntimePlanetsById = ({
  adapter,
  world,
}: {
  adapter: AuthoritativeViewportRuntimeAdapter;
  world: World | null;
}) =>
  syncAuthoritativeViewportPlanetsById({
    state: adapter.sceneState,
    world,
  });

const queueAuthoritativeViewportRuntimeBlackHoleSwallowEvent = ({
  adapter,
  nowSec,
  swallow,
}: {
  adapter: AuthoritativeViewportRuntimeAdapter;
  nowSec: number;
  swallow: QueueAuthoritativeBlackHoleSwallowEffectArgs;
}) => {
  queueAuthoritativeViewportBlackHoleSwallowEvent({
    events: adapter.transientEvents,
    inactiveBlackHoleSwallowVisuals:
      adapter.transientVisualPools.inactiveBlackHoleSwallowVisuals,
    nowSec,
    swallow,
  });
};

export const queueAuthoritativeViewportRuntimeImmediateFireFeedback = ({
  adapter,
  ...params
}: Omit<
  Parameters<typeof queueAuthoritativeViewportImmediateFireFeedback>[0],
  "feedback"
> & {
  adapter: AuthoritativeViewportRuntimeAdapter;
}) =>
  queueAuthoritativeViewportImmediateFireFeedback({
    ...params,
    feedback: adapter.immediateFireFeedback,
  });

export const queueAuthoritativeViewportRuntimeImmediateAbilityFeedback = ({
  adapter,
  ...params
}: Omit<
  Parameters<typeof queueAuthoritativeImmediateAbilityFeedback>[0],
  "activeBoostBursts"
> & {
  adapter: AuthoritativeViewportRuntimeAdapter;
}) =>
  queueAuthoritativeImmediateAbilityFeedback({
    ...params,
    activeBoostBursts: adapter.transientEvents.activeBoostBursts,
  });

const syncAuthoritativeViewportRuntimeLaunchBurstFeedback = ({
  adapter,
  ...params
}: Omit<
  Parameters<typeof syncAuthoritativeLaunchBurstFeedback>[0],
  "activeLaunchBurstsByKind" | "rocketKinds"
> & {
  adapter: AuthoritativeViewportRuntimeAdapter;
}) =>
  syncAuthoritativeLaunchBurstFeedback({
    ...params,
    activeLaunchBurstsByKind: adapter.transientEvents.activeLaunchBurstsByKind,
    rocketKinds: adapter.rocketKinds,
  });

const syncAuthoritativeViewportRuntimeRecentEventFeedback = ({
  adapter,
  ...params
}: Omit<
  Parameters<typeof syncAuthoritativeRecentEventFeedback>[0],
  "activeBoostBursts" | "activeImpactBursts"
> & {
  adapter: AuthoritativeViewportRuntimeAdapter;
}) =>
  syncAuthoritativeRecentEventFeedback({
    ...params,
    activeBoostBursts: adapter.transientEvents.activeBoostBursts,
    activeImpactBursts: adapter.transientEvents.activeImpactBursts,
  });

type SyncAuthoritativeViewportRuntimeFeedbackParams = Omit<
  Parameters<typeof syncAuthoritativeLaunchBurstFeedback>[0],
  "activeLaunchBurstsByKind" | "lastProcessedSnapshotTick" | "rocketKinds"
> &
  Omit<
    Parameters<typeof syncAuthoritativeRecentEventFeedback>[0],
    "activeBoostBursts" | "activeImpactBursts" | "queueBlackHoleSwallowEffect"
  > & {
    adapter: AuthoritativeViewportRuntimeAdapter;
    lastProcessedLaunchBurstSnapshotTick: number | null;
  };

export const syncAuthoritativeViewportRuntimeFeedback = ({
  adapter,
  blackHoleSource,
  currentPlayerId,
  currentSnapshot,
  lastProcessedEventId,
  lastProcessedLaunchBurstSnapshotTick,
  localAimWorld,
  localPlayerPlanet,
  maxActiveBoostBursts,
  maxActiveImpactBursts,
  nowSec,
  previousSnapshotWorld,
  runtime,
  screenEffects,
}: SyncAuthoritativeViewportRuntimeFeedbackParams) => {
  const nextLastProcessedLaunchBurstSnapshotTick =
    syncAuthoritativeViewportRuntimeLaunchBurstFeedback({
      adapter,
      currentPlayerId,
      currentSnapshot,
      lastProcessedSnapshotTick: lastProcessedLaunchBurstSnapshotTick,
      previousSnapshotWorld,
    });
  const recentEventFeedback =
    syncAuthoritativeViewportRuntimeRecentEventFeedback({
      adapter,
      blackHoleSource,
      lastProcessedEventId,
      localAimWorld,
      localPlayerPlanet,
      maxActiveBoostBursts,
      maxActiveImpactBursts,
      nowSec,
      queueBlackHoleSwallowEffect: ({ color, radius, startPos, targetPos }) => {
        queueAuthoritativeViewportRuntimeBlackHoleSwallowEvent({
          adapter,
          nowSec,
          swallow: {
            color,
            radius,
            startPos,
            targetPos,
          },
        });
      },
      queuePlanetExplosionEffect: (planet) => {
        queueSharedCombatPlanetExplosion({
          activePlanetExplosions:
            adapter.transientEvents.activePlanetExplosions,
          inactivePlanetExplosionVisuals:
            adapter.transientVisualPools.inactivePlanetExplosionVisuals,
          planet,
          startedAtSec: nowSec,
        });
      },
      runtime,
      screenEffects,
    });

  return {
    ...recentEventFeedback,
    lastProcessedLaunchBurstSnapshotTick:
      nextLastProcessedLaunchBurstSnapshotTick,
  };
};

export const updateAuthoritativeViewportRuntimeSharedScene = ({
  background,
  cameraState,
  combat,
  effects,
  geometries,
  hostElement,
  renderQuality,
  rocketKinds,
  rocketLaunchBurstPools,
  rocketPools,
  scene,
  sceneState,
  tuning,
  visuals,
  world,
}: UpdateAuthoritativeViewportSceneParams): UpdateAuthoritativeViewportSceneResult => {
  const nowSec = background.nowSec;
  const frameEffects: AuthoritativeViewportFrameEffects = {
    ...effects,
    activeCacheIds: sceneState.activeCacheIds,
  };
  const frameVisuals: AuthoritativeViewportFrameVisuals = {
    ...visuals,
    cacheVisuals: sceneState.cacheVisuals,
  };
  const previousState: AuthoritativeViewportScenePreviousState =
    sceneState.previousState;

  pruneSharedCombatImpactBursts({
    activeBursts: effects.activeImpactBursts,
    durationSec: AUTHORITATIVE_VIEWPORT_IMPACT_BURST_DURATION_SEC,
    nowSec,
  });

  const { immediateCannonFlashState, viewportFrameBundle } =
    buildAuthoritativeViewportCombatFrameBundle({
      authoritativePlanetsById: sceneState.authoritativePlanetsById,
      cameraState,
      combat,
      effects: frameEffects,
      hostElement,
      nowSec,
      previousState,
      renderQuality,
      rocketKinds,
      rocketLaunchBurstPools,
      rocketPools,
      rocketTrailStates: sceneState.rocketTrailStates,
      rocketsByKind: sceneState.rocketsByKind,
      scene,
      tuning,
      visuals: frameVisuals,
      world,
    });

  const presentationState = updateSharedCombatViewport({
    background,
    celestial: buildAuthoritativeViewportCelestialSync({
      effects: {
        activeBlackHoleSwallowEffects: effects.activeBlackHoleSwallowEffects,
        activePlanetExplosions: effects.activePlanetExplosions,
        inactiveBlackHoleSwallowVisuals:
          effects.inactiveBlackHoleSwallowVisuals,
        inactivePlanetExplosionVisuals: effects.inactivePlanetExplosionVisuals,
      },
      geometries,
      maps: sceneState.maps,
      nowSec,
      previousState,
      scene,
      tuning,
      world,
    }),
    viewportFrameBundle,
  });

  return {
    gravityPulse: presentationState.gravityPulse,
    immediateCannonFlashState,
    shieldImmediateFeedback: presentationState.shieldImmediateFeedback,
  };
};

const updateAuthoritativeViewportRuntimeScene = ({
  adapter,
  frame,
  ...params
}: UpdateAuthoritativeViewportRuntimeSceneParams) => {
  const resources = getAuthoritativeViewportRuntimeSceneResources(adapter);
  const nowSec = frame.background.nowSec;
  const world = frame.world;
  const arenaRadius = world?.arenaRadius ?? frame.tuning.gameplay.arena.radius;

  updateAmbientBoundaryDebrisVisual({
    blackHoleBody:
      world?.blackHole === undefined
        ? null
        : {
            pos: world.blackHole.pos,
            radius: world.blackHole.killRadius,
          },
    enableFallingDebris: false,
    nowSec,
    neutronStarBodies: world?.neutronStars,
    planetBodies: world?.planets,
    sunBodies: world?.suns,
    visual: resources.debris.boundaryDebrisVisual,
    ...getAmbientBoundaryDebrisRadii(arenaRadius),
  });
  updateAuthoritativeDebrisVisual({
    boundaryDebrisVisual: resources.debris.boundaryDebrisVisual,
    debris: world?.debris ?? [],
    maxSamples: getViewportBudgetedCount(
      resources.debris.maxDebrisSamples,
      frame.renderQuality.debrisBudget,
    ),
    nowSec,
    planets: world?.planets ?? [],
    visual: resources.debris.debrisVisual,
  });

  syncAuthoritativeViewportPlanetsById({
    state: adapter.sceneState,
    world,
  });

  const rocketAppearances = getScaledRocketVisuals(
    frame.tuning.visuals.rockets,
  );
  syncAuthoritativeViewportImmediateFireFeedback({
    feedback: adapter.immediateFireFeedback,
    nowSec,
    playerId: frame.combat.playerId,
    rocketAppearances,
    world,
  });

  const presentationState = updateAuthoritativeViewportRuntimeSharedScene({
    ...params,
    background: frame.background,
    cameraState: frame.cameraState,
    combat: frame.combat,
    effects: {
      ...frame.effects,
      activeBlackHoleSwallowEffects:
        adapter.transientEvents.activeBlackHoleSwallowEffects,
      activeBoostBursts: adapter.transientEvents.activeBoostBursts,
      activeImpactBursts: adapter.transientEvents.activeImpactBursts,
      activeLaunchBurstsByKind:
        adapter.transientEvents.activeLaunchBurstsByKind,
      activePlanetExplosions: adapter.transientEvents.activePlanetExplosions,
      inactiveBlackHoleSwallowVisuals:
        adapter.transientVisualPools.inactiveBlackHoleSwallowVisuals,
      inactivePlanetExplosionVisuals:
        adapter.transientVisualPools.inactivePlanetExplosionVisuals,
    },
    geometries: frame.geometries,
    renderQuality: frame.renderQuality,
    rocketKinds: adapter.rocketKinds,
    rocketLaunchBurstPools: frame.rocketLaunchBurstPools,
    rocketPools: frame.rocketPools,
    sceneState: adapter.sceneState,
    tuning: frame.tuning,
    visuals: frame.visuals,
    world,
  });

  return presentationState;
};

type UpdateAuthoritativeViewportRuntimeFrameParams = Parameters<
  typeof buildAuthoritativeViewportRuntimeSceneFrame
>[0] &
  Omit<UpdateAuthoritativeViewportRuntimeSceneParams, "adapter" | "frame">;

export const updateAuthoritativeViewportRuntimeFrame = ({
  adapter,
  hostElement,
  scene,
  ...frameParams
}: UpdateAuthoritativeViewportRuntimeFrameParams) =>
  updateAuthoritativeViewportRuntimeScene({
    adapter,
    frame: buildAuthoritativeViewportRuntimeSceneFrame({
      adapter,
      ...frameParams,
    }),
    hostElement,
    scene,
  });
