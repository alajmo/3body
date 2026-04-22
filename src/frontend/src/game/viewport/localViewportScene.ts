import type { AsteroidTier, RocketKind, Vec2 } from "@3body/shared";
import {
  add,
  clamp,
  FIXED_STEP_SEC,
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
  CombatSandboxSun,
} from "../combatSandbox";
import { getSandboxDebugSnapshot } from "../combatSandbox";
import {
  getPlanetArchetypeVisuals,
  getRenderedPlanetRadius,
} from "../planetVisualTuning";
import { getCannonWorldLayout } from "../rocketVisibility";
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
import {
  getLocalSandboxLockProgress,
  type LocalSandboxGravityPulseState,
} from "./localSandboxSimulation";
import type { LocalViewportCameraState } from "./localViewportCamera";
import { getLocalViewportControlledBody } from "./localViewportCamera";
import type { ViewportRenderQualityProfile } from "./renderQuality";
import { syncSharedCombatBackgroundParallax } from "./sharedCombatBackgroundParallax";
import type { SharedCombatTrackedRocketBody } from "./sharedCombatBlackHoleSwallowTracking";
import {
  type SharedCombatBoostBurstState,
  type SharedCombatBoostBurstVisual,
  syncSharedCombatBoostPresentation,
} from "./sharedCombatBoostVisuals";
import {
  type SharedCombatNeutronStarVisual as NeutronStarVisual,
  type SharedCombatSunVisual as SunVisual,
  syncSharedCombatNeutronStarVisual,
  syncSharedCombatSunVisual,
} from "./sharedCombatCelestialVisuals";
import { syncSharedCombatDebrisPresentation } from "./sharedCombatDebrisVisualSync";
import {
  type SharedCombatTrackedNeutronStarBody,
  type SharedCombatTrackedSunBody,
  syncSharedCombatDynamicNeutronStarPresentation,
  syncSharedCombatDynamicPlanetPresentation,
  syncSharedCombatDynamicSunPresentation,
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
import {
  type SharedCombatPlanetVisual as PlanetVisual,
  syncSharedCombatPlanetVisual,
} from "./sharedCombatPlanetVisuals";
import type { SharedCombatPresentationFrameState } from "./sharedCombatPresentationFrame";
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
import { syncSharedCombatViewportFrame } from "./sharedCombatViewportFrame";

const GRAVITY_PULSE_VISUAL_DURATION_SEC = 0.95;
const CHROMATIC_ABERRATION_MAX = 0.0012;
const CHROMATIC_DISTANCE_FALLOFF = 720;
const FOLLOW_VIEW_WORLD_HEIGHT = 1000 * 0.92;
const Z_AXIS = new Vector3(0, 0, 1);
const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const BLACK_HOLE_ROCKET_SWALLOW_COLOR = "#ffd7ac";
const BLACK_HOLE_CACHE_SWALLOW_COLOR = "#fff0bb";
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
const getCacheBadgeBaseSize = () => getRuntimeVisuals().caches.badgeBaseSize;
const getWeaponColors = (): Record<RocketKind, { accent: string }> => ({
  heavy: {
    accent: getRuntimeVisuals().rockets.heavy.hudAccent,
  },
  light: {
    accent: getRuntimeVisuals().rockets.light.hudAccent,
  },
  seeker: {
    accent: getRuntimeVisuals().rockets.seeker.hudAccent,
  },
});

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
  renderSunsById: ReadonlyMap<number, CombatSandboxSun>;
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
  renderSunsById,
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
  syncSharedCombatBackgroundParallax({
    backgroundLayers,
    nowSec,
    renderCenterX: cameraState.renderCenterX,
    renderCenterY: cameraState.renderCenterY,
  });

  const blackHole = renderState.blackHole;
  const neutronStarTuning = getRuntimeTuningDocument().gameplay.neutronStars;
  const neutronStarVisualTuning =
    getRuntimeTuningDocument().visuals.neutronStars;
  syncSharedCombatDynamicSunPresentation({
    blackHole,
    createVisual: ({ index, sun, sunProfile }) =>
      createSunVisual({
        index,
        sun,
        sunProfile,
      }),
    currentNeutronStars: renderState.neutronStars,
    disposeVisual: disposeSunVisual,
    nowSec,
    onSunAbsorbedByNeutronStar: () => {},
    onSunStartedBlackHoleSwallow: ({ sun, sunProfile }) => {
      if (blackHole === null) {
        return;
      }

      queueBlackHoleSwallowEffect({
        activeEffects: activeBlackHoleSwallowEffects,
        color: sunProfile.glowColor,
        inactiveVisuals: inactiveBlackHoleSwallowVisuals,
        radius: sun.radius,
        startedAtSec: nowSec,
        startPos: sun.pos,
        targetPos: blackHole.pos,
      });
    },
    onSunSwallowedByBlackHole: () => {},
    previousNeutronStarsById: blackHoleSwallowTracker.previousNeutronStarsById,
    previousSunSwallowedAtById:
      blackHoleSwallowTracker.previousSunSwallowedAtById,
    previousSunsById: blackHoleSwallowTracker.previousSunsById,
    resolveSunProfile: ({ index }) =>
      getSunVisualProfile(getRuntimeVisuals().suns, index),
    resolveSwallowedAtSec: ({ sun }) => sun.swallowedAtSec,
    sunVisuals,
    suns: renderState.suns,
    syncVisual: ({ index, sun, sunProfile, swallowedAtSec, visual }) => {
      syncSharedCombatSunVisual({
        index,
        nowSec,
        sun,
        sunProfile,
        swallowedAtSec,
        visual,
      });
    },
  });

  syncSharedCombatDynamicNeutronStarPresentation({
    createVisual: ({ neutronStar }) =>
      createNeutronStarVisual({
        neutronStar,
      }),
    disposeVisual: disposeNeutronStarVisual,
    neutronStarVisuals,
    neutronStars: renderState.neutronStars,
    nowSec,
    previousNeutronStarsById: blackHoleSwallowTracker.previousNeutronStarsById,
    syncVisual: ({ index, neutronStar, visual }) => {
      syncSharedCombatNeutronStarVisual({
        gameplayTuning: neutronStarTuning,
        index,
        nowSec,
        neutronStar,
        visual,
        visualTuning: neutronStarVisualTuning,
      });
    },
  });

  syncSharedCombatDynamicPlanetPresentation({
    createTrail: ({ planet }) =>
      createTrailVisual({
        planet,
      }),
    createVisual: ({ index, planet }) =>
      createPlanetVisual({
        index,
        planet,
      }),
    disposeTrail: disposeTrailVisual,
    disposeVisual: disposePlanetVisual,
    onPlanetStartedBlackHoleSwallow: ({ planet }) => {
      if (blackHole === null) {
        return;
      }

      queueBlackHoleSwallowEffect({
        activeEffects: activeBlackHoleSwallowEffects,
        color: planet.color,
        inactiveVisuals: inactiveBlackHoleSwallowVisuals,
        radius: getRenderedPlanetRadius(planet),
        startedAtSec: nowSec,
        startPos: planet.pos,
        targetPos: blackHole.pos,
      });
    },
    planetTrails: trailVisuals,
    planetVisuals,
    planets: renderState.planets,
    previousPlanetAliveById: blackHoleSwallowTracker.previousPlanetAliveById,
    resolveAlive: ({ planet }) => planet.alive,
    shouldTriggerBlackHoleSwallow: ({ planet }) =>
      planet.deathReason === "blackHole",
    syncTrail: ({ trail }) => {
      trail.points.visible = false;
    },
    syncVisual: ({ alive, planet, visual }) => {
      const planetVisualTuning = getPlanetArchetypeVisuals(planet.archetype);
      syncSharedCombatPlanetVisual({
        archetypeVisuals: planetVisualTuning,
        nowSec,
        planetPosition: planet.pos,
        renderRadius: getRenderedPlanetRadius(planet),
        visual,
        visible: alive,
      });
    },
  });

  for (const rocketKind of weaponKinds) {
    launchBurstsByKind[rocketKind].length = 0;
  }
  for (const burst of renderState.launchBursts) {
    launchBurstsByKind[burst.rocketKind].push(burst);
  }

  const worldUnitsPerPixel =
    cameraState.visibleWorldHeight / Math.max(1, hostElement.clientHeight);
  const cannonLayout = getCannonWorldLayout(
    getRuntimeTuningDocument().visuals.cannon,
    worldUnitsPerPixel,
  );
  const renderElapsedSec = renderState.elapsedSec;
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
  const shieldActive =
    currentState.player.shieldActive &&
    currentState.player.shieldLoad > 0 &&
    playerPlanet?.alive === true;
  const shieldVisual = {
    arcOpacityUniform: shieldArcOpacityUniform,
    crestOpacityUniform: shieldCrestOpacityUniform,
    glowOpacityUniform: shieldGlowOpacityUniform,
    group: shieldGroup,
    panelOpacityUniform: shieldPanelOpacityUniform,
  };
  const controlledBody = getLocalViewportControlledBody(renderState);
  const lockRingVisual = {
    lockedUniform: lockRingLockedUniform,
    mesh: lockRingMesh,
    progressUniform: lockRingProgressUniform,
    timeUniform: lockRingTimeUniform,
  };
  const canPresentWeapons =
    controlledBody !== null &&
    controlsEnabled &&
    playerPlanet?.alive &&
    !shieldActive;
  let weaponFrame: SharedCombatPresentationFrameState["weapon"] = {
    cannon: null,
    lockRing: null,
  };
  if (canPresentWeapons) {
    const weaponAccent =
      getWeaponColors()[inputState.selectedRocketKind].accent;
    const aimSurfaceOffset =
      controlledBody.kind === "planet"
        ? getRenderedPlanetRadius(controlledBody)
        : controlledBody.radius;

    let firedThisFrame = false;
    for (const rocketKind of weaponKinds) {
      const currentAmmo = renderState.player.ammo[rocketKind];
      const previousAmmo = cannonFireState.lastAmmo[rocketKind];
      if (currentAmmo < previousAmmo) {
        firedThisFrame = true;
      }
      cannonFireState.lastAmmo[rocketKind] = currentAmmo;
    }
    if (firedThisFrame) {
      cannonFireState.flashStartSec = nowSec;
    }

    const lockTarget =
      renderState.player.lockTargetId === null
        ? null
        : (renderPlanetsById.get(renderState.player.lockTargetId) ?? null);

    const lockRingVisible =
      inputState.selectedRocketKind === "seeker" &&
      lockTarget !== null &&
      lockTarget.alive;
    const lockRingState =
      lockTarget !== null && lockRingVisible
        ? (() => {
            const lockProgress = getLocalSandboxLockProgress({
              currentTick: currentState.tick,
              lockAcquiredTick: currentState.player.seekerLockAcquiredAtTick,
            });
            return {
              baseRadius: getRenderedPlanetRadius(lockTarget) + 22,
              locked: lockProgress >= 1,
              nowSec,
              position: lockTarget.pos,
              progress: lockProgress,
              z: 5.5,
            };
          })()
        : null;
    weaponFrame = {
      cannon: {
        accent: weaponAccent,
        aimTarget: inputState.aimWorld,
        flashAccent: weaponAccent,
        flashAgeSec: nowSec - cannonFireState.flashStartSec,
        layout: cannonLayout,
        position: controlledBody.pos,
        surfaceOffset: aimSurfaceOffset,
        visible: true,
        z: 6,
      },
      lockRing: lockRingState,
    };
  } else {
    for (const rocketKind of weaponKinds) {
      cannonFireState.lastAmmo[rocketKind] =
        renderState.player.ammo[rocketKind];
    }
  }

  syncSharedCombatViewportFrame({
    frame: {
      entity: {
        caches: {
          activeCacheIds,
          badgeBaseSize: getCacheBadgeBaseSize(),
          badgeMaterials: cacheSpriteAssets.badgeMaterials,
          badgeScale: cacheBadgeScale,
          blackHole,
          cacheVisuals,
          caches: renderState.caches,
          createCacheVisual,
          disposeCacheVisual,
          getCacheIconKey,
          nowSec,
          previousCachesById: blackHoleSwallowTracker.previousCachesById,
          queueSwallowEffect: (previousCache) => {
            queueBlackHoleSwallowEffect({
              activeEffects: activeBlackHoleSwallowEffects,
              color: BLACK_HOLE_CACHE_SWALLOW_COLOR,
              inactiveVisuals: inactiveBlackHoleSwallowVisuals,
              radius: previousCache.radius * 1.25,
              startedAtSec: nowSec,
              startPos: previousCache.pos,
              targetPos: blackHole!.pos,
            });
          },
          renderedCacheKeysById,
          scene,
          updateCacheVisualBadge,
        },
        launchBursts: {
          burstsByKind: launchBurstsByKind,
          cannonLayout,
          currentPlayerId: renderState.player.playerId,
          launchBurstBudget: renderQuality.launchBurstBudget,
          launchBurstPools: rocketLaunchBurstPools,
          nowSec: renderElapsedSec,
          rocketKinds: weaponKinds,
          rocketPools,
          worldUnitsPerPixel,
        },
        rockets: {
          blackHole,
          getSwallowMargin: (rocket) => Math.max(64, rocket.radius * 9),
          maxRocketTrailSamples,
          nowSec,
          previousRocketsById: blackHoleSwallowTracker.previousRocketsById,
          queueSwallowEffect: (previousRocket) => {
            queueBlackHoleSwallowEffect({
              activeEffects: activeBlackHoleSwallowEffects,
              color: BLACK_HOLE_ROCKET_SWALLOW_COLOR,
              inactiveVisuals: inactiveBlackHoleSwallowVisuals,
              radius: Math.max(previousRocket.radius * 2.6, 12),
              startedAtSec: nowSec,
              startPos: previousRocket.pos,
              targetPos: blackHole!.pos,
            });
          },
          rocketKinds: weaponKinds,
          rocketPools,
          rocketTrailBudget: renderQuality.rocketTrailBudget,
          rocketTrailStates,
          rockets: renderState.rockets,
          rocketsByKind,
        },
      },
      presentation: {
        blackHole:
          blackHole === null
            ? null
            : {
                killRadius: blackHole.killRadius,
                pos: blackHole.pos,
                z: 4,
              },
        boost: {
          activeBursts: activeBoostBursts,
          aimTarget: inputState.aimWorld,
          getBodyById: (planetId) => renderPlanetsById.get(planetId) ?? null,
          heldBoosting: playerBoostHeld,
          maxParticlesPerBurst: boostBurstParticlesPerBurst,
          playerBody: playerPlanet,
        },
        gravityPulse: {
          durationSec: GRAVITY_PULSE_VISUAL_DURATION_SEC,
          pulse: activeGravityPulse,
          visibleWorldHeight: cameraState.visibleWorldHeight,
          z: {
            core: 2.2,
            echo: 2.3,
            ring: 2.35,
          },
        },
        shield: {
          active: shieldActive,
          activeAimDir: renderState.player.shieldAimDir,
          bursts: renderState.impactBursts,
          planet: playerPlanet,
          shieldRadius:
            playerPlanet === null ? 0 : getRenderedPlanetRadius(playerPlanet),
        },
        weapon: weaponFrame,
      },
      transient: {
        blackHoleSwallows: {
          activeEffects: activeBlackHoleSwallowEffects,
          inactiveVisuals: inactiveBlackHoleSwallowVisuals,
        },
        impactBursts: {
          bursts: renderState.impactBursts,
          maxVisibleBursts: maxVisibleImpactBursts,
          nowSec: renderState.elapsedSec,
          resolveBurst: (burst) => {
            const planet = renderPlanetsById.get(burst.planetId) ?? null;
            if (planet === null) {
              return null;
            }

            return {
              absorbedByShield: burst.absorbedByShield,
              durationSec: Math.max(
                FIXED_STEP_SEC,
                (burst.ttlUntilTick - burst.startedAtTick) * FIXED_STEP_SEC,
              ),
              normal: burst.normal,
              startedAtSec: burst.startedAtSec,
              targetPos: planet.pos,
              targetRadius: planet.radius,
              targetRenderedRadius: getRenderedPlanetRadius(planet),
            };
          },
          visuals: impactBurstVisuals,
          z: {
            core: 2.65,
            glow: 2.55,
            ring: 2.75,
          },
        },
        nowSec,
        planetExplosions: {
          activePlanetExplosions,
          inactivePlanetExplosionVisuals,
        },
      },
    },
    nowSec,
    visuals: {
      blackHole: {
        group: blackHoleGroup,
        ringMesh: blackHoleRing,
      },
      boost: boostBurstVisual,
      cannon: cannonVisual,
      gravityPulse: gravityPulseVisual,
      lockRing: lockRingVisual,
      shield: shieldVisual,
    },
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
