import type { AsteroidTier, RocketKind, Vec2 } from "@3body/shared";
import {
  add,
  clamp,
  getSunVisualProfile,
  len,
  normalize as normalizeVec2,
  rot,
  scale as scaleVec2,
  sub,
} from "@3body/shared";
import {
  type Float32BufferAttribute,
  type Group,
  type InstancedMesh,
  type Line,
  type LineBasicMaterial,
  type Matrix4,
  type Mesh,
  type Points,
  Quaternion,
  Vector3,
} from "three/webgpu";
import type {
  CombatSandboxCache,
  CombatSandboxDebris,
  CombatSandboxPlanet,
  CombatSandboxRocket,
  CombatSandboxState,
} from "../combatSandbox";
import { getSandboxDebugSnapshot } from "../combatSandbox";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import {
  type AmbientBoundaryDebrisVisual,
  getAmbientBoundaryDebrisRadii,
  resetAmbientBoundaryDebrisVisual,
  updateAmbientBoundaryDebrisVisual,
} from "./ambientBoundaryDebris";
import {
  type BlackHoleSwallowState,
  type BlackHoleSwallowVisual,
  clearBlackHoleSwallowEffects,
  queueBlackHoleSwallowEffect,
} from "./blackHoleVisuals";
import type {
  CacheIconKey,
  CacheSpriteAssets,
  CacheVisual,
} from "./cacheVisuals";
import { type LocalSandboxGravityPulseState } from "./localSandboxSimulation";
import type { LocalViewportCameraState } from "./localViewportCamera";
import { updateLocalViewportCombatScene } from "./localViewportCombatScene";
import type { ViewportRenderQualityProfile } from "./renderQuality";
import type { SharedCombatTrackedRocketBody } from "./sharedCombatBlackHoleSwallowTracking";
import {
  type SharedCombatBoostBurstState,
  type SharedCombatBoostBurstVisual,
  syncSharedCombatBoostPresentation,
} from "./sharedCombatBoostVisuals";
import {
  type SharedCombatNeutronStarVisual as NeutronStarVisual,
  type SharedCombatSunVisual as SunVisual,
} from "./sharedCombatCelestialVisuals";
import { syncSharedCombatDebrisPresentation } from "./sharedCombatDebrisVisualSync";
import {
  type SharedCombatTrackedNeutronStarBody,
  type SharedCombatTrackedSunBody,
} from "./sharedCombatDynamicCelestialSync";
import {
  resetSharedCombatLaunchBurstPools,
  type SharedCombatLaunchBurstPoolVisual,
} from "./sharedCombatLaunchBurstPools";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";
import type {
  SharedCombatPlanetExplosionState,
  SharedCombatPlanetExplosionVisual,
} from "./sharedCombatPlanetExplosions";
import {
  resetSharedCombatPlanetTrailVisual,
  type SharedCombatPlanetTrailVisual as TrailVisual,
} from "./sharedCombatPlanetTrails";
import { type SharedCombatPlanetVisual as PlanetVisual } from "./sharedCombatPlanetVisuals";
import {
  resetSharedCombatRocketPools,
  type SharedCombatRocketPoolVisual,
  type SharedCombatRocketTrailState,
} from "./sharedCombatRocketPools";
import type {
  SharedCombatGravityPulseVisual as GravityPulseVisual,
  SharedCombatImpactBurstVisual as ImpactBurstVisual,
} from "./sharedCombatSceneResources";
import {
  type SharedCombatCannonVisual,
  syncSharedCombatGravityPulsePresentation,
} from "./sharedCombatSupportVisuals";
import { syncSharedCombatImpactBurstFrame } from "./sharedCombatTransientPresentation";

const GRAVITY_PULSE_VISUAL_DURATION_SEC = 0.95;
const CHROMATIC_ABERRATION_MAX = 0.0012;
const CHROMATIC_DISTANCE_FALLOFF = 720;
const FOLLOW_VIEW_WORLD_HEIGHT = 1000 * 0.92;
const Z_AXIS = new Vector3(0, 0, 1);
const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const hiddenDebrisPosition = new Vector3(1e8, 1e8, 1e8);
const hiddenDebrisRotation = new Quaternion();
const hiddenDebrisScale = new Vector3(0.001, 0.001, 0.001);
const SANDBOX_BOUNDARY_ASTEROID_FALLOUT_TIERS = [
  "large",
  "small",
] as const satisfies readonly AsteroidTier[];

interface StarfieldLayerVisual {
  driftX: number;
  driftY: number;
  group: Group;
  parallax: number;
  tileSize: number;
}

type RocketPoolVisual = SharedCombatRocketPoolVisual;
type RocketLaunchBurstPoolVisual = SharedCombatLaunchBurstPoolVisual;

type RocketTrailState = SharedCombatRocketTrailState;

export interface LocalViewportBlackHoleSwallowTracker {
  previousCachesById: Map<number, Pick<CombatSandboxCache, "pos" | "radius">>;
  previousNeutronStarsById: Map<number, SharedCombatTrackedNeutronStarBody>;
  previousPlanetAliveById: Map<number, boolean>;
  previousRocketsById: Map<number, SharedCombatTrackedRocketBody>;
  previousSunsById: Map<number, SharedCombatTrackedSunBody>;
  previousSunSwallowedAtById: Map<number, number | null>;
}

export const createLocalViewportBlackHoleSwallowTracker = (
  initialState: CombatSandboxState,
): LocalViewportBlackHoleSwallowTracker => ({
  previousCachesById: new Map(),
  previousNeutronStarsById: new Map(
    initialState.neutronStars.map((neutronStar) => [
      neutronStar.id,
      {
        mass: neutronStar.mass,
        pos: { ...neutronStar.pos },
        radius: neutronStar.radius,
      },
    ]),
  ),
  previousPlanetAliveById: new Map(
    initialState.planets.map((planet) => [planet.id, planet.alive] as const),
  ),
  previousRocketsById: new Map(),
  previousSunsById: new Map(
    initialState.suns.map((sun, index) => {
      const profile = getSunVisualProfile(getRuntimeVisuals().suns, index);
      return [
        sun.id,
        {
          color: profile.glowColor,
          pos: { ...sun.pos },
          radius: sun.radius,
          vel: { ...sun.vel },
        },
      ] as const;
    }),
  ),
  previousSunSwallowedAtById: new Map(
    initialState.suns.map((sun) => [sun.id, sun.swallowedAtSec] as const),
  ),
});

interface DebrisVisual {
  boundaryAsteroidLayers: Record<AsteroidTier, BoundaryAsteroidLayerVisual>;
  colorAttribute: Float32BufferAttribute;
  geometry: {
    setDrawRange: (start: number, count: number) => void;
  };
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
}

interface BoundaryAsteroidLayerVisual {
  activeCount: number;
  capacity: number;
  mesh: InstancedMesh;
}

interface BoundaryDebrisVisual extends AmbientBoundaryDebrisVisual {}

interface CannonFireState {
  flashStartSec: number;
  lastAmmo: Record<RocketKind, number>;
}

const getRuntimeVisuals = () => getRuntimeTuningDocument().visuals;

const getBudgetedCount = (maxCount: number, budget: number): number =>
  budget <= 0 ? 0 : Math.max(1, Math.round(maxCount * budget));

const hideInstancedMeshRange = (
  mesh: InstancedMesh,
  fromIndex: number,
  toIndex: number,
  matrix: Matrix4,
  position: Vector3,
  rotation: Quaternion,
  scale: Vector3,
): boolean => {
  if (fromIndex >= toIndex) {
    return false;
  }

  matrix.compose(position, rotation, scale);
  for (let index = fromIndex; index < toIndex; index += 1) {
    mesh.setMatrixAt(index, matrix);
  }

  return true;
};

export const resetLocalViewportSceneState = ({
  activeBlackHoleSwallowEffects,
  activeGravityPulse,
  activeBoostBursts,
  boostBurstVisual,
  boundaryDebrisVisual,
  cacheVisuals,
  debrisVisual,
  disposeCacheVisual,
  gravityPulseVisual,
  hiddenRocketMatrix,
  hiddenRocketPosition,
  hiddenRocketRotation,
  hiddenRocketScale,
  hostScene,
  impactBurstVisuals,
  inactiveBlackHoleSwallowVisuals,
  maxLaunchBurstInstances,
  blackHoleSwallowTracker,
  renderPlanetsById,
  rocketLaunchBurstPools,
  rocketPools,
  rocketTrailStates,
  shieldGroup,
  trailVisuals,
  weaponKinds,
  currentState,
}: {
  activeBlackHoleSwallowEffects: BlackHoleSwallowState[];
  activeGravityPulse: LocalSandboxGravityPulseState | null;
  activeBoostBursts: SharedCombatBoostBurstState[];
  boostBurstVisual: SharedCombatBoostBurstVisual;
  boundaryDebrisVisual: BoundaryDebrisVisual;
  blackHoleSwallowTracker: LocalViewportBlackHoleSwallowTracker;
  cacheVisuals: Map<number, CacheVisual>;
  currentState: CombatSandboxState;
  debrisVisual: DebrisVisual;
  disposeCacheVisual: (visual: CacheVisual) => void;
  gravityPulseVisual: GravityPulseVisual;
  hiddenRocketMatrix: Matrix4;
  hiddenRocketPosition: Vector3;
  hiddenRocketRotation: Quaternion;
  hiddenRocketScale: Vector3;
  hostScene: { remove: (object: Group) => void };
  impactBurstVisuals: readonly ImpactBurstVisual[];
  inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
  maxLaunchBurstInstances: Record<RocketKind, number>;
  renderPlanetsById: ReadonlyMap<number, CombatSandboxPlanet>;
  rocketLaunchBurstPools: Record<RocketKind, RocketLaunchBurstPoolVisual>;
  rocketPools: Record<RocketKind, RocketPoolVisual>;
  rocketTrailStates: Map<number, RocketTrailState>;
  shieldGroup: Group;
  trailVisuals: ReadonlyMap<number, TrailVisual>;
  weaponKinds: readonly RocketKind[];
}) => {
  blackHoleSwallowTracker.previousNeutronStarsById.clear();
  for (const neutronStar of currentState.neutronStars) {
    blackHoleSwallowTracker.previousNeutronStarsById.set(neutronStar.id, {
      mass: neutronStar.mass,
      pos: { ...neutronStar.pos },
      radius: neutronStar.radius,
    });
  }
  blackHoleSwallowTracker.previousPlanetAliveById.clear();
  for (const planet of currentState.planets) {
    blackHoleSwallowTracker.previousPlanetAliveById.set(
      planet.id,
      planet.alive,
    );
  }
  blackHoleSwallowTracker.previousRocketsById.clear();
  blackHoleSwallowTracker.previousCachesById.clear();
  blackHoleSwallowTracker.previousSunsById.clear();
  blackHoleSwallowTracker.previousSunSwallowedAtById.clear();
  for (const [index, sun] of currentState.suns.entries()) {
    const profile = getSunVisualProfile(getRuntimeVisuals().suns, index);
    blackHoleSwallowTracker.previousSunsById.set(sun.id, {
      color: profile.glowColor,
      pos: { ...sun.pos },
      radius: sun.radius,
      vel: { ...sun.vel },
    });
    blackHoleSwallowTracker.previousSunSwallowedAtById.set(
      sun.id,
      sun.swallowedAtSec,
    );
  }
  clearBlackHoleSwallowEffects({
    activeEffects: activeBlackHoleSwallowEffects,
    inactiveVisuals: inactiveBlackHoleSwallowVisuals,
  });

  rocketTrailStates.clear();
  for (const trail of trailVisuals.values()) {
    resetSharedCombatPlanetTrailVisual(trail);
  }

  resetSharedCombatRocketPools({
    rocketKinds: weaponKinds,
    rocketPools,
    rocketTrailStates,
  });
  resetSharedCombatLaunchBurstPools({
    launchBurstPools: rocketLaunchBurstPools,
    rocketKinds: weaponKinds,
  });

  syncSharedCombatDebrisPresentation({
    boundaryDebrisVisual,
    debris: [],
    falloutTiers: SANDBOX_BOUNDARY_ASTEROID_FALLOUT_TIERS,
    maxSamples: 0,
    nowSec: currentState.elapsedSec,
    resolvePointColor: () => "#ffffff",
    visual: debrisVisual,
  });
  debrisVisual.points.visible = false;
  for (const layer of Object.values(debrisVisual.boundaryAsteroidLayers)) {
    const didHide = hideInstancedMeshRange(
      layer.mesh,
      0,
      layer.activeCount,
      hiddenRocketMatrix,
      hiddenRocketPosition,
      hiddenRocketRotation,
      hiddenRocketScale,
    );
    layer.mesh.count = 0;
    layer.mesh.visible = false;
    layer.activeCount = 0;
    if (didHide) {
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  boundaryDebrisVisual.bandGroup.visible = false;
  resetAmbientBoundaryDebrisVisual(boundaryDebrisVisual);
  boundaryDebrisVisual.points.visible = false;
  activeBoostBursts.length = 0;
  syncSharedCombatBoostPresentation({
    activeBursts: activeBoostBursts,
    aimTarget: { x: 0, y: 0 },
    boostVisual: boostBurstVisual,
    getBodyById: (planetId) => renderPlanetsById.get(planetId) ?? null,
    heldBoosting: false,
    maxParticlesPerBurst: 0,
    nowSec: currentState.elapsedSec,
    playerBody: null,
  });
  syncSharedCombatGravityPulsePresentation({
    durationSec: GRAVITY_PULSE_VISUAL_DURATION_SEC,
    nowSec: currentState.elapsedSec,
    pulse: activeGravityPulse,
    visibleWorldHeight: FOLLOW_VIEW_WORLD_HEIGHT,
    visual: gravityPulseVisual,
    z: {
      core: 2.2,
      echo: 2.3,
      ring: 2.35,
    },
  });
  syncSharedCombatImpactBurstFrame({
    bursts: [],
    maxVisibleBursts: 0,
    nowSec: currentState.elapsedSec,
    resolveBurst: () => null,
    visuals: impactBurstVisuals,
    z: {
      core: 2.65,
      glow: 2.55,
      ring: 2.75,
    },
  });
  shieldGroup.visible = false;
  for (const visual of cacheVisuals.values()) {
    hostScene.remove(visual.group);
    disposeCacheVisual(visual);
  }
  cacheVisuals.clear();
};

interface UpdateLocalViewportSceneParams {
  activeBlackHoleSwallowEffects: BlackHoleSwallowState[];
  activeGravityPulse: LocalSandboxGravityPulseState | null;
  activeBoostBursts: SharedCombatBoostBurstState[];
  activeCacheIds: Set<number>;
  activePlanetExplosions: SharedCombatPlanetExplosionState[];
  blackHoleSwallowTracker: LocalViewportBlackHoleSwallowTracker;
  blackHoleGroup: Group;
  blackHoleRing: Mesh;
  boostBurstParticlesPerBurst: number;
  boostBurstVisual: SharedCombatBoostBurstVisual;
  boundaryDebrisVisual: BoundaryDebrisVisual;
  cacheBadgeScale: number;
  cacheSpriteAssets: CacheSpriteAssets;
  cacheVisuals: Map<number, CacheVisual>;
  cameraState: LocalViewportCameraState;
  cannonVisual: SharedCombatCannonVisual;
  cannonFireState: CannonFireState;
  chromaticAberrationNode: {
    amount: { value: unknown };
    angle: { value: unknown };
  };
  controlsEnabled: boolean;
  createCacheVisual: (
    cache: CombatSandboxCache,
    badgeMaterials: CacheSpriteAssets["badgeMaterials"],
  ) => CacheVisual;
  createNeutronStarVisual: (args: {
    neutronStar: CombatSandboxState["neutronStars"][number];
  }) => NeutronStarVisual;
  createPlanetVisual: (args: {
    index: number;
    planet: CombatSandboxPlanet;
  }) => PlanetVisual;
  createSunVisual: (args: {
    index: number;
    sun: CombatSandboxState["suns"][number];
    sunProfile?: ReturnType<typeof getSunVisualProfile>;
  }) => SunVisual;
  createTrailVisual: (args: { planet: CombatSandboxPlanet }) => TrailVisual;
  currentState: CombatSandboxState;
  debrisVisual: DebrisVisual;
  disposeCacheVisual: (visual: CacheVisual) => void;
  disposeNeutronStarVisual: (visual: NeutronStarVisual) => void;
  disposePlanetVisual: (visual: PlanetVisual) => void;
  disposeSunVisual: (visual: SunVisual) => void;
  disposeTrailVisual: (trail: TrailVisual) => void;
  getCacheIconKey: (contents: CombatSandboxCache["contents"]) => CacheIconKey;
  gravityPulseVisual: GravityPulseVisual;
  hiddenRocketMatrix: Matrix4;
  hiddenRocketPosition: Vector3;
  hiddenRocketRotation: Quaternion;
  hiddenRocketScale: Vector3;
  hostElement: HTMLDivElement;
  impactBurstVisuals: readonly ImpactBurstVisual[];
  inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
  inactivePlanetExplosionVisuals: SharedCombatPlanetExplosionVisual[];
  inputState: {
    aimWorld: Vec2;
    selectedRocketKind: RocketKind;
  };
  playerBoostHeld: boolean;
  launchBurstsByKind: Record<RocketKind, SharedCombatLaunchBurstState[]>;
  lockRingLockedUniform: { value: unknown };
  lockRingMesh: Mesh;
  lockRingProgressUniform: { value: unknown };
  lockRingTimeUniform: { value: unknown };
  maxDebrisSamples: number;
  maxLaunchBurstInstances: Record<RocketKind, number>;
  maxRocketTrailSamples: number;
  maxVisibleImpactBursts: number;
  nowSec: number;
  playerPlanet: CombatSandboxPlanet | null;
  renderPlanetsById: ReadonlyMap<number, CombatSandboxPlanet>;
  renderQuality: ViewportRenderQualityProfile;
  renderState: CombatSandboxState;
  renderedCacheKeysById: Map<number, CacheIconKey>;
  rocketLaunchBurstPools: Record<RocketKind, RocketLaunchBurstPoolVisual>;
  rocketMatrix: Matrix4;
  rocketPools: Record<RocketKind, RocketPoolVisual>;
  rocketPosition: Vector3;
  rocketRotation: Quaternion;
  rocketsByKind: Record<RocketKind, CombatSandboxRocket[]>;
  rocketScale: Vector3;
  rocketTrailStates: Map<number, RocketTrailState>;
  scene:
    | Group
    | { add: (object: Group) => void; remove: (object: Group) => void };
  shieldArcOpacityUniform: {
    value: unknown;
  };
  shieldPanelOpacityUniform: {
    value: unknown;
  };
  shieldCrestOpacityUniform: {
    value: unknown;
  };
  shieldGlowOpacityUniform: {
    value: unknown;
  };
  shieldGroup: Group;
  backgroundLayers: readonly StarfieldLayerVisual[];
  sunVisuals: Map<number, SunVisual>;
  neutronStarVisuals: Map<number, NeutronStarVisual>;
  planetVisuals: Map<number, PlanetVisual>;
  trailVisuals: Map<number, TrailVisual>;
  updateCacheVisualBadge: (
    visual: CacheVisual,
    badgeMaterials: CacheSpriteAssets["badgeMaterials"],
    key: CacheIconKey,
  ) => void;
  weaponKinds: readonly RocketKind[];
}

export const updateLocalViewportScene = ({
  activeBlackHoleSwallowEffects,
  activeGravityPulse,
  activeBoostBursts,
  activeCacheIds,
  activePlanetExplosions,
  blackHoleSwallowTracker,
  blackHoleGroup,
  blackHoleRing,
  boostBurstParticlesPerBurst,
  boostBurstVisual,
  boundaryDebrisVisual,
  cacheBadgeScale,
  cacheSpriteAssets,
  cacheVisuals,
  cameraState,
  cannonVisual,
  cannonFireState,
  chromaticAberrationNode,
  controlsEnabled,
  createCacheVisual,
  createNeutronStarVisual,
  createPlanetVisual,
  createSunVisual,
  createTrailVisual,
  currentState,
  debrisVisual,
  disposeCacheVisual,
  disposeNeutronStarVisual,
  disposePlanetVisual,
  disposeSunVisual,
  disposeTrailVisual,
  getCacheIconKey,
  gravityPulseVisual,
  hiddenRocketMatrix,
  hiddenRocketPosition,
  hiddenRocketRotation,
  hiddenRocketScale,
  hostElement,
  impactBurstVisuals,
  inactiveBlackHoleSwallowVisuals,
  inactivePlanetExplosionVisuals,
  inputState,
  playerBoostHeld,
  launchBurstsByKind,
  lockRingLockedUniform,
  lockRingMesh,
  lockRingProgressUniform,
  lockRingTimeUniform,
  maxDebrisSamples,
  maxLaunchBurstInstances,
  maxRocketTrailSamples,
  maxVisibleImpactBursts,
  nowSec,
  playerPlanet,
  renderPlanetsById,
  renderQuality,
  renderState,
  renderedCacheKeysById,
  rocketLaunchBurstPools,
  rocketMatrix,
  rocketPools,
  rocketPosition,
  rocketRotation,
  rocketsByKind,
  rocketScale,
  rocketTrailStates,
  scene,
  shieldArcOpacityUniform,
  shieldPanelOpacityUniform,
  shieldCrestOpacityUniform,
  shieldGlowOpacityUniform,
  shieldGroup,
  backgroundLayers,
  sunVisuals,
  neutronStarVisuals,
  planetVisuals,
  trailVisuals,
  updateCacheVisualBadge,
  weaponKinds,
}: UpdateLocalViewportSceneParams) => {
  for (const rocketKind of weaponKinds) {
    launchBurstsByKind[rocketKind].length = 0;
  }
  for (const burst of renderState.launchBursts) {
    launchBurstsByKind[burst.rocketKind].push(burst);
  }
  const arenaRadius = Math.max(
    0,
    getRuntimeTuningDocument().gameplay.arena.radius,
  );
  updateAmbientBoundaryDebrisVisual({
    blackHoleBody:
      renderState.blackHole === null
        ? null
        : {
            pos: renderState.blackHole.pos,
            radius: renderState.blackHole.killRadius,
          },
    ...getAmbientBoundaryDebrisRadii(arenaRadius),
    enableFallingDebris: false,
    nowSec,
    neutronStarBodies: renderState.neutronStars,
    visual: boundaryDebrisVisual,
    planetBodies: renderState.planets,
    sunBodies: renderState.suns,
  });
  syncSharedCombatDebrisPresentation({
    boundaryDebrisVisual,
    debris: renderState.debris,
    falloutTiers: SANDBOX_BOUNDARY_ASTEROID_FALLOUT_TIERS,
    maxSamples: maxDebrisSamples,
    nowSec,
    resolvePointColor: (piece) => piece.color,
    visual: debrisVisual,
  });
  const shieldVisual = {
    arcOpacityUniform: shieldArcOpacityUniform,
    crestOpacityUniform: shieldCrestOpacityUniform,
    glowOpacityUniform: shieldGlowOpacityUniform,
    group: shieldGroup,
    panelOpacityUniform: shieldPanelOpacityUniform,
  };
  const lockRingVisual = {
    lockedUniform: lockRingLockedUniform,
    mesh: lockRingMesh,
    progressUniform: lockRingProgressUniform,
    timeUniform: lockRingTimeUniform,
  };
  updateLocalViewportCombatScene({
    activeBlackHoleSwallowEffects,
    activeBoostBursts,
    activeCacheIds,
    activeGravityPulse,
    activePlanetExplosions,
    background: {
      backgroundLayers,
      nowSec,
      renderCenterX: cameraState.renderCenterX,
      renderCenterY: cameraState.renderCenterY,
    },
    blackHoleGroup,
    blackHoleRing,
    blackHoleSwallowTracker,
    boostBurstParticlesPerBurst,
    boostBurstVisual,
    cacheBadgeScale,
    cacheSpriteAssets,
    cacheVisuals,
    cameraState,
    cannonFireState,
    cannonVisual,
    controlsEnabled,
    createCacheVisual,
    createNeutronStarVisual,
    createPlanetVisual,
    createSunVisual,
    createTrailVisual,
    currentState,
    disposeCacheVisual,
    disposeNeutronStarVisual,
    disposePlanetVisual,
    disposeSunVisual,
    disposeTrailVisual,
    getCacheIconKey,
    gravityPulseDurationSec: GRAVITY_PULSE_VISUAL_DURATION_SEC,
    gravityPulseVisual,
    hostElement,
    impactBurstVisuals,
    inactiveBlackHoleSwallowVisuals,
    inactivePlanetExplosionVisuals,
    inputState,
    launchBurstsByKind,
    lockRingVisual,
    maxRocketTrailSamples,
    maxVisibleImpactBursts,
    playerBoostHeld,
    playerPlanet,
    renderPlanetsById,
    renderQuality,
    renderState,
    renderedCacheKeysById,
    rocketLaunchBurstPools,
    rocketPools,
    rocketTrailStates,
    rocketsByKind,
    scene,
    shieldVisual,
    sunVisuals,
    neutronStarVisuals,
    planetVisuals,
    trailVisuals,
    updateCacheVisualBadge,
    weaponKinds,
  });

  const debug = getSandboxDebugSnapshot(currentState);
  const chromaticPressure =
    1 - clamp(debug.minCurrentPlanetSunGap / CHROMATIC_DISTANCE_FALLOFF, 0, 1);
  const chromaticAberrationPressure = clamp(
    (chromaticPressure - 0.72) / 0.28,
    0,
    1,
  );
  chromaticAberrationNode.amount.value =
    chromaticAberrationPressure *
    CHROMATIC_ABERRATION_MAX *
    renderQuality.chromaticAberrationScale;
  chromaticAberrationNode.angle.value = nowSec * 0.22;
};
