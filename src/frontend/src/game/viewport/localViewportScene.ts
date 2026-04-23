import type { AsteroidTier, RocketKind } from "@3body/shared";
import { clamp, getSunVisualProfile } from "@3body/shared";
import type {
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Points,
  Quaternion,
  Vector3,
} from "three/webgpu";
import type { CombatSandboxPlanet, CombatSandboxState } from "../combatSandbox";
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
} from "./blackHoleVisuals";
import type { CacheVisual } from "./cacheVisuals";
import type { LocalSandboxGravityPulseState } from "./localSandboxSimulation";
import type { LocalViewportCombatBlackHoleSwallowTracker } from "./localViewportCelestialSync";
import {
  type LocalViewportSceneState,
  resetLocalViewportSceneStateLookups,
  syncLocalViewportLaunchBurstsByKind,
} from "./localViewportSceneState";
import type { ViewportRenderQualityProfile } from "./renderQuality";
import {
  type SharedCombatBoostBurstState,
  type SharedCombatBoostBurstVisual,
  syncSharedCombatBoostPresentation,
} from "./sharedCombatBoostVisuals";
import { syncSharedCombatDebrisPresentation } from "./sharedCombatDebrisVisualSync";
import {
  resetSharedCombatLaunchBurstPools,
  type SharedCombatLaunchBurstPoolVisual,
} from "./sharedCombatLaunchBurstPools";
import {
  resetSharedCombatRocketPools,
  type SharedCombatRocketPoolVisual,
} from "./sharedCombatRocketPools";
import type {
  SharedCombatGravityPulseVisual as GravityPulseVisual,
  SharedCombatImpactBurstVisual as ImpactBurstVisual,
} from "./sharedCombatSceneResources";
import { syncSharedCombatGravityPulsePresentation } from "./sharedCombatSupportVisuals";
import { syncSharedCombatImpactBurstFrame } from "./sharedCombatTransientPresentation";

export const GRAVITY_PULSE_VISUAL_DURATION_SEC = 0.95;
const CHROMATIC_ABERRATION_MAX = 0.0012;
const CHROMATIC_DISTANCE_FALLOFF = 720;
const FOLLOW_VIEW_WORLD_HEIGHT = 1000 * 0.92;
const SANDBOX_BOUNDARY_ASTEROID_FALLOUT_TIERS = [
  "large",
  "small",
] as const satisfies readonly AsteroidTier[];

type RocketPoolVisual = SharedCombatRocketPoolVisual;
type RocketLaunchBurstPoolVisual = SharedCombatLaunchBurstPoolVisual;

export type LocalViewportBlackHoleSwallowTracker =
  LocalViewportCombatBlackHoleSwallowTracker;

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

const getRuntimeVisuals = () => getRuntimeTuningDocument().visuals;

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
  renderPlanetsById,
  rocketLaunchBurstPools,
  rocketPools,
  sceneState,
  shieldGroup,
  weaponKinds,
  currentState,
}: {
  activeBlackHoleSwallowEffects: BlackHoleSwallowState[];
  activeGravityPulse: LocalSandboxGravityPulseState | null;
  activeBoostBursts: SharedCombatBoostBurstState[];
  boostBurstVisual: SharedCombatBoostBurstVisual;
  boundaryDebrisVisual: BoundaryDebrisVisual;
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
  renderPlanetsById: ReadonlyMap<number, CombatSandboxPlanet>;
  rocketLaunchBurstPools: Record<RocketKind, RocketLaunchBurstPoolVisual>;
  rocketPools: Record<RocketKind, RocketPoolVisual>;
  sceneState: LocalViewportSceneState;
  shieldGroup: Group;
  weaponKinds: readonly RocketKind[];
}) => {
  const { blackHoleSwallowTracker } = sceneState;
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

  resetLocalViewportSceneStateLookups({ sceneState, weaponKinds });

  resetSharedCombatRocketPools({
    rocketKinds: weaponKinds,
    rocketPools,
    rocketTrailStates: sceneState.rocketTrailStates,
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
  for (const visual of sceneState.cacheVisuals.values()) {
    hostScene.remove(visual.group);
    disposeCacheVisual(visual);
  }
  sceneState.cacheVisuals.clear();
};

export interface SyncLocalViewportSceneEnvironmentParams {
  boundaryDebrisVisual: BoundaryDebrisVisual;
  chromaticAberrationNode: {
    amount: { value: unknown };
    angle: { value: unknown };
  };
  currentState: CombatSandboxState;
  debrisVisual: DebrisVisual;
  maxDebrisSamples: number;
  nowSec: number;
  renderQuality: ViewportRenderQualityProfile;
  renderState: CombatSandboxState;
  sceneState: LocalViewportSceneState;
  weaponKinds: readonly RocketKind[];
}

export const syncLocalViewportSceneEnvironment = ({
  boundaryDebrisVisual,
  chromaticAberrationNode,
  currentState,
  debrisVisual,
  maxDebrisSamples,
  nowSec,
  renderQuality,
  renderState,
  sceneState,
  weaponKinds,
}: SyncLocalViewportSceneEnvironmentParams) => {
  syncLocalViewportLaunchBurstsByKind({
    renderState,
    sceneState,
    weaponKinds,
  });
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
