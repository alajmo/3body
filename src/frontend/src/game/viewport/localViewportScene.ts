import type { AsteroidTier, RocketKind, Vec2 } from "@3body/shared";
import {
  FIXED_STEP_SEC,
  add,
  clamp,
  getBoundaryAsteroidImpactRadius,
  getNeutronStarMassAlpha,
  getSunVisualProfile,
  len,
  lerp,
  normalize as normalizeVec2,
  rot,
  scale as scaleVec2,
  sub,
} from "@3body/shared";
import {
  Color,
  type Float32BufferAttribute,
  type Group,
  type InstancedMesh,
  type Line,
  type LineBasicMaterial,
  Matrix4,
  type Mesh,
  type MeshBasicMaterial,
  type MeshBasicNodeMaterial,
  type Points,
  type PointsNodeMaterial,
  Quaternion,
  Vector3,
} from "three/webgpu";
import type {
  CombatSandboxCache,
  CombatSandboxDebris,
  CombatSandboxImpactBurst,
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
import {
  getNeutronStarVisualShape,
  NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR,
} from "../neutronStarVisuals";
import { getCannonWorldLayout } from "../rocketVisibility";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import type {
  CacheIconKey,
  CacheSpriteAssets,
  CacheVisual,
} from "./cacheVisuals";
import { syncSharedCombatCacheVisuals } from "./cacheVisuals";
import {
  type AmbientBoundaryDebrisVisual,
  getAmbientBoundaryDebrisRadii,
  resetAmbientBoundaryDebrisVisual,
  updateAmbientBoundaryDebrisVisual,
} from "./ambientBoundaryDebris";
import type { LocalViewportCameraState } from "./localViewportCamera";
import { getLocalViewportControlledBody } from "./localViewportCamera";
import {
  clearBlackHoleSwallowEffects,
  queueBlackHoleSwallowEffect,
  updateBlackHoleSwallowEffects,
  type BlackHoleSwallowState,
  type BlackHoleSwallowVisual,
} from "./blackHoleVisuals";
import {
  queueSharedCombatRemovedCacheSwallowEffects,
  queueSharedCombatRemovedRocketSwallowEffects,
  syncSharedCombatTrackedCaches,
  syncSharedCombatTrackedRockets,
  type SharedCombatTrackedRocketBody,
} from "./sharedCombatBlackHoleSwallowTracking";
import {
  getLocalSandboxLockProgress,
  type LocalSandboxGravityPulseState,
} from "./localSandboxSimulation";
import type { ViewportRenderQualityProfile } from "./renderQuality";
import {
  type SharedCombatGravityPulseVisual as GravityPulseVisual,
  type SharedCombatImpactBurstVisual as ImpactBurstVisual,
} from "./sharedCombatSceneResources";
import { syncSharedCombatImpactBurstPool } from "./sharedCombatImpactBursts";
import {
  getSharedCombatShieldHitReact,
  hideSharedCombatLockRingVisual,
  syncSharedCombatCannonVisual,
  syncSharedCombatBlackHoleVisual,
  syncSharedCombatLockRingVisual,
  syncSharedCombatShieldVisual,
  updateSharedCombatGravityPulseVisual,
} from "./sharedCombatSupportVisuals";
import {
  type SharedCombatBoostBurstState,
  type SharedCombatBoostBurstVisual,
  type SharedCombatBoostDirectionOverride,
  pruneSharedCombatBoostBursts,
  syncSharedCombatBoostBurstVisual,
} from "./sharedCombatBoostVisuals";
import {
  type SharedCombatPlanetExplosionState,
  type SharedCombatPlanetExplosionVisual,
  updateSharedCombatPlanetExplosions,
} from "./sharedCombatPlanetExplosions";
import {
  resetSharedCombatLaunchBurstPools,
  syncSharedCombatLaunchBurstPools,
  type SharedCombatLaunchBurstPoolVisual,
} from "./sharedCombatLaunchBurstPools";
import {
  resetSharedCombatRocketPools,
  syncSharedCombatRocketPools,
  type SharedCombatRocketPoolVisual,
  type SharedCombatRocketTrailState,
} from "./sharedCombatRocketPools";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";

const GRAVITY_PULSE_VISUAL_DURATION_SEC = 0.95;
const CHROMATIC_ABERRATION_MAX = 0.0012;
const CHROMATIC_DISTANCE_FALLOFF = 720;
const FOLLOW_VIEW_WORLD_HEIGHT = 1000 * 0.92;
const IMPACT_CORE_BASE = new Color("#fff5dd");
const CACHED_COLORS = new Map<string, Color>();
const TINTED_COLORS = new Map<string, Color>();
const Z_AXIS = new Vector3(0, 0, 1);
const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const BLACK_HOLE_ROCKET_SWALLOW_COLOR = "#ffd7ac";
const BLACK_HOLE_CACHE_SWALLOW_COLOR = "#fff0bb";
const debrisMatrix = new Matrix4();
const debrisPosition = new Vector3();
const debrisRotation = new Quaternion();
const debrisRotationTilt = new Quaternion();
const debrisScale = new Vector3();
const hiddenDebrisPosition = new Vector3(1e8, 1e8, 1e8);
const hiddenDebrisRotation = new Quaternion();
const hiddenDebrisScale = new Vector3(0.001, 0.001, 0.001);
const BOUNDARY_ASTEROID_RENDER_ORDER = [
  "large",
  "small",
  "micro",
] as const satisfies readonly AsteroidTier[];
const EMPTY_BOUNDARY_ASTEROID_COUNTS = {
  large: 0,
  micro: 0,
  small: 0,
} as const satisfies Record<AsteroidTier, number>;
const SANDBOX_BOUNDARY_ASTEROID_FALLOUT_TIERS = [
  "large",
  "small",
] as const satisfies readonly AsteroidTier[];

interface TrailSample {
  pos: Vec2;
  timeSec: number;
}

interface TrailVisual {
  geometry: {
    setDrawRange: (start: number, count: number) => void;
  };
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  samples: TrailSample[];
}

interface SunVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  rotationSpeed: number;
  warpMesh: Mesh;
}

interface NeutronStarVisual {
  coreMesh: Mesh;
  group: Group;
  haloMesh: Mesh;
  jetMeshA: Mesh;
  jetMeshB: Mesh;
  lensMesh: Mesh;
  phase: number;
  spinSpeed: number;
}

interface PlanetVisual {
  glowContactStartNode: { value: unknown };
  glowFadeStartNode: { value: unknown };
  glowMesh: Mesh;
  glowOpacityUniform: { value: unknown };
  glowRiseEndNode: { value: unknown };
  glowRiseStartNode: { value: unknown };
  mesh: Mesh;
  rotationSpeed: number;
  surfaceOpacityUniform: { value: unknown };
  spinAxis: Vector3;
  spinPhase: number;
}

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
  previousPlanetAliveById: Map<number, boolean>;
  previousRocketsById: Map<number, SharedCombatTrackedRocketBody>;
  previousSunSwallowedAtById: Map<number, number | null>;
}

export const createLocalViewportBlackHoleSwallowTracker = (
  initialState: CombatSandboxState,
): LocalViewportBlackHoleSwallowTracker => ({
  previousCachesById: new Map(),
  previousPlanetAliveById: new Map(
    initialState.planets.map((planet) => [planet.id, planet.alive] as const),
  ),
  previousRocketsById: new Map(),
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

const wrapCentered = (value: number, span: number): number => {
  if (!(span > 0)) {
    return value;
  }

  return ((((value + span / 2) % span) + span) % span) - span / 2;
};

const getCachedColor = (value: string): Color => {
  let cached = CACHED_COLORS.get(value);
  if (cached === undefined) {
    cached = new Color(value);
    CACHED_COLORS.set(value, cached);
  }

  return cached;
};

const getTintedColor = (
  value: string,
  hueOffset: number,
  saturationOffset: number,
  lightnessOffset: number,
): Color => {
  const cacheKey = `${value}|${hueOffset}|${saturationOffset}|${lightnessOffset}`;
  let cached = TINTED_COLORS.get(cacheKey);
  if (cached === undefined) {
    cached = new Color(value);
    cached.offsetHSL(hueOffset, saturationOffset, lightnessOffset);
    TINTED_COLORS.set(cacheKey, cached);
  }

  return cached;
};

const getPlanetAuraRingStops = (
  auraScale: number,
  auraGap: number,
): {
  contactStart: number;
  fadeStart: number;
  riseEnd: number;
  riseStart: number;
} => {
  const auraTuning = getRuntimeTuningDocument().visuals.planets.aura;
  const safeAuraScale = Math.max(auraScale, 0.001);
  const bodyBoundary = clamp(
    1 / safeAuraScale,
    auraTuning.bodyBoundaryMin,
    auraTuning.bodyBoundaryMax,
  );
  const normalizedGap = Math.max(0, auraGap) / safeAuraScale;
  const innerEdge = clamp(
    bodyBoundary + normalizedGap,
    bodyBoundary,
    auraTuning.innerEdgeMax,
  );
  const innerFeather = clamp(
    auraTuning.innerFeatherBase / safeAuraScale,
    auraTuning.innerFeatherMin,
    auraTuning.innerFeatherMax,
  );
  const riseStart = clamp(
    innerEdge - innerFeather * auraTuning.riseStartFeatherScale,
    0.001,
    innerEdge - 0.001,
  );
  const contactStart = clamp(
    innerEdge - innerFeather * auraTuning.contactFeatherScale,
    0.001,
    riseStart - 0.001,
  );
  const remaining = Math.max(auraTuning.minRemaining, 1 - innerEdge);
  const riseEnd = innerEdge;
  const fadeStart = clamp(
    innerEdge + remaining * auraTuning.fadeStartRemainingScale,
    innerEdge + auraTuning.fadeStartMinOffset,
    auraTuning.fadeStartMax,
  );

  return {
    contactStart,
    fadeStart,
    riseEnd,
    riseStart,
  };
};

const updateGravityPulseVisual = (
  visual: GravityPulseVisual,
  pulse: LocalSandboxGravityPulseState | null,
  nowSec: number,
  visibleWorldHeight = FOLLOW_VIEW_WORLD_HEIGHT,
) =>
  updateSharedCombatGravityPulseVisual({
    durationSec: GRAVITY_PULSE_VISUAL_DURATION_SEC,
    nowSec,
    pulse,
    visibleWorldHeight,
    visual,
    z: {
      core: 2.2,
      echo: 2.3,
      ring: 2.35,
    },
  });

const updateImpactBurstVisuals = (
  visuals: readonly ImpactBurstVisual[],
  bursts: readonly CombatSandboxImpactBurst[],
  planetsById: ReadonlyMap<number, CombatSandboxPlanet>,
  elapsedSec: number,
  maxVisibleBursts: number,
) =>
  syncSharedCombatImpactBurstPool({
    bursts,
    maxVisibleBursts,
    nowSec: elapsedSec,
    resolveBurst: (burst) => {
      const planet = planetsById.get(burst.planetId) ?? null;
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
    styleBurstVisual: ({ burst, visual }) => {
      const impactColor = burst.absorbedByShield
        ? getRuntimeTuningDocument().visuals.abilities.shieldColor
        : burst.color;
      const glowTint = getTintedColor(
        impactColor,
        burst.absorbedByShield ? -0.04 : -0.02,
        burst.absorbedByShield ? 0.2 : 0.12,
        burst.absorbedByShield ? 0.24 : 0.14,
      );
      const ringTint = getTintedColor(
        impactColor,
        burst.absorbedByShield ? -0.03 : -0.01,
        burst.absorbedByShield ? 0.24 : 0.18,
        burst.absorbedByShield ? 0.34 : 0.28,
      );

      visual.glowMaterial.color.copy(glowTint);
      visual.coreMaterial.color
        .copy(IMPACT_CORE_BASE)
        .lerp(getCachedColor(impactColor), burst.absorbedByShield ? 0.4 : 0.28);
      visual.ringMaterial.color.copy(ringTint);
    },
    visuals,
    z: {
      core: 2.65,
      glow: 2.55,
      ring: 2.75,
    },
  });

const getBoundaryAsteroidFalloutLayer = (
  boundaryDebrisVisual: BoundaryDebrisVisual,
  kind: "primary" | "secondary",
) =>
  boundaryDebrisVisual.fallingLayers.find((layer) => layer.kind === kind) ??
  null;

const getBoundaryAsteroidVisualRadius = (
  tier: AsteroidTier,
  radius: number,
  emphasize = false,
): number => {
  const impactRadius = getBoundaryAsteroidImpactRadius(tier, radius);
  const debrisTuning = getRuntimeTuningDocument().visuals.orbits.boundaryDebris;

  if (tier === "large") {
    const tuningBoost = Math.max(0, debrisTuning.largeRockScale - 1) * 0.45;
    const emphasisBoost = emphasize ? 0.35 : 0;
    return impactRadius * Math.min(2.35, 1 + tuningBoost + emphasisBoost);
  }

  if (tier === "small") {
    const tuningBoost = Math.max(0, debrisTuning.smallRockScale - 1) * 0.28;
    const emphasisBoost = emphasize ? 0.12 : 0;
    return impactRadius * Math.min(1.7, 1 + tuningBoost + emphasisBoost);
  }

  return impactRadius;
};

const updateBoundaryAsteroidFalloutVisual = (
  boundaryDebrisVisual: BoundaryDebrisVisual,
  debris: readonly CombatSandboxDebris[],
  nowSec: number,
): Record<AsteroidTier, number> => {
  const highlightedCounts = {
    large: 0,
    micro: 0,
    small: 0,
  } satisfies Record<AsteroidTier, number>;
  const highlightedLayers = {
    large: getBoundaryAsteroidFalloutLayer(boundaryDebrisVisual, "primary"),
    small: getBoundaryAsteroidFalloutLayer(boundaryDebrisVisual, "secondary"),
  } as const;

  boundaryDebrisVisual.fallingGroup.visible = false;
  for (const layer of boundaryDebrisVisual.fallingLayers) {
    layer.spawnCountdownSec = Number.POSITIVE_INFINITY;
    layer.shards.length = 0;
  }

  for (const tier of SANDBOX_BOUNDARY_ASTEROID_FALLOUT_TIERS) {
    const layer = highlightedLayers[tier];
    if (layer === null) {
      continue;
    }

    let activeCount = 0;
    for (const piece of debris) {
      if (piece.asteroidTier !== tier || activeCount >= layer.capacity) {
        continue;
      }

      const spinPhase = nowSec * (0.7 + (piece.id % 7) * 0.11);
      const yaw = Math.atan2(piece.vel.y, piece.vel.x) + (piece.id % 5) * 0.3;
      const scaleRadius = getBoundaryAsteroidVisualRadius(
        tier,
        piece.radius,
        true,
      );
      debrisPosition.set(piece.pos.x, piece.pos.y, 0.08 + activeCount * 1e-4);
      debrisRotation.setFromAxisAngle(Z_AXIS, yaw);
      debrisRotationTilt.setFromAxisAngle(
        X_AXIS,
        Math.sin(spinPhase + piece.id * 0.17) * 0.36,
      );
      debrisRotation.multiply(debrisRotationTilt);
      debrisRotationTilt.setFromAxisAngle(
        Y_AXIS,
        Math.cos(spinPhase * 0.8 + piece.id * 0.13) * 0.28,
      );
      debrisRotation.multiply(debrisRotationTilt);
      debrisRotationTilt.setFromAxisAngle(Z_AXIS, spinPhase * 0.45);
      debrisRotation.multiply(debrisRotationTilt);
      debrisScale.set(
        scaleRadius,
        scaleRadius * (tier === "large" ? 0.92 : 0.86),
        Math.max(scaleRadius * (tier === "large" ? 0.84 : 0.76), 1),
      );
      debrisMatrix.compose(debrisPosition, debrisRotation, debrisScale);
      layer.mesh.setMatrixAt(activeCount, debrisMatrix);
      activeCount += 1;
    }

    const didHide = hideInstancedMeshRange(
      layer.mesh,
      activeCount,
      layer.mesh.count,
      debrisMatrix,
      hiddenDebrisPosition,
      hiddenDebrisRotation,
      hiddenDebrisScale,
    );
    highlightedCounts[tier] = activeCount;
    layer.mesh.count = activeCount;
    layer.mesh.visible = activeCount > 0;
    if (activeCount > 0 || didHide) {
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
    boundaryDebrisVisual.fallingGroup.visible =
      boundaryDebrisVisual.fallingGroup.visible || activeCount > 0;
  }

  return highlightedCounts;
};

const updateDebrisGeometry = (
  debrisVisual: DebrisVisual,
  debris: readonly CombatSandboxDebris[],
  highlightedBoundaryAsteroidCounts: Readonly<Record<AsteroidTier, number>>,
  maxSamples: number,
  nowSec: number,
) => {
  const positionArray = debrisVisual.positionAttribute.array as Float32Array;
  const colorArray = debrisVisual.colorAttribute.array as Float32Array;
  const opacityArray = debrisVisual.opacityAttribute.array as Float32Array;
  const sampleBudget = Math.max(0, maxSamples);
  let drawCount = 0;
  const boundaryAsteroidCounts = {
    large: 0,
    micro: 0,
    small: 0,
  } satisfies Record<AsteroidTier, number>;

  for (const tier of BOUNDARY_ASTEROID_RENDER_ORDER) {
    const layer = debrisVisual.boundaryAsteroidLayers[tier];
    let skippedHighlightedCount = 0;
    for (const piece of debris) {
      if (piece.asteroidTier !== tier) {
        continue;
      }

      if (skippedHighlightedCount < highlightedBoundaryAsteroidCounts[tier]) {
        skippedHighlightedCount += 1;
        continue;
      }

      const nextIndex = boundaryAsteroidCounts[tier];
      if (nextIndex < layer.capacity) {
        const spinPhase = nowSec * (0.7 + (piece.id % 7) * 0.11);
        const yaw = Math.atan2(piece.vel.y, piece.vel.x) + (piece.id % 5) * 0.3;
        const scaleRadius = getBoundaryAsteroidVisualRadius(tier, piece.radius);
        debrisPosition.set(piece.pos.x, piece.pos.y, 2.1 + nextIndex * 1e-4);
        debrisRotation.setFromAxisAngle(Z_AXIS, yaw);
        debrisRotationTilt.setFromAxisAngle(
          X_AXIS,
          Math.sin(spinPhase + piece.id * 0.17) * 0.36,
        );
        debrisRotation.multiply(debrisRotationTilt);
        debrisRotationTilt.setFromAxisAngle(
          Y_AXIS,
          Math.cos(spinPhase * 0.8 + piece.id * 0.13) * 0.28,
        );
        debrisRotation.multiply(debrisRotationTilt);
        debrisRotationTilt.setFromAxisAngle(Z_AXIS, spinPhase * 0.45);
        debrisRotation.multiply(debrisRotationTilt);
        debrisScale.set(
          scaleRadius,
          scaleRadius * 0.92,
          Math.max(scaleRadius * 0.84, 1),
        );
        debrisMatrix.compose(debrisPosition, debrisRotation, debrisScale);
        layer.mesh.setMatrixAt(nextIndex, debrisMatrix);
        boundaryAsteroidCounts[tier] += 1;
      } else {
        break;
      }
    }
  }

  for (const piece of debris) {
    if (piece.asteroidTier !== undefined || drawCount >= sampleBudget) {
      continue;
    }

    const offset = drawCount * 3;
    const tint = getCachedColor(piece.color);

    positionArray[offset] = piece.pos.x;
    positionArray[offset + 1] = piece.pos.y;
    positionArray[offset + 2] = 0;
    colorArray[offset] = tint.r;
    colorArray[offset + 1] = tint.g;
    colorArray[offset + 2] = tint.b;
    opacityArray[drawCount] = 0.9;
    drawCount += 1;
  }

  debrisVisual.geometry.setDrawRange(0, drawCount);
  debrisVisual.positionAttribute.needsUpdate = true;
  debrisVisual.colorAttribute.needsUpdate = true;
  debrisVisual.opacityAttribute.needsUpdate = true;
  debrisVisual.points.visible = drawCount > 0;

  for (const [tier, layer] of Object.entries(
    debrisVisual.boundaryAsteroidLayers,
  ) as [AsteroidTier, BoundaryAsteroidLayerVisual][]) {
    const activeCount = boundaryAsteroidCounts[tier];
    const didHide = hideInstancedMeshRange(
      layer.mesh,
      activeCount,
      layer.activeCount,
      debrisMatrix,
      hiddenDebrisPosition,
      hiddenDebrisRotation,
      hiddenDebrisScale,
    );
    layer.activeCount = activeCount;
    layer.mesh.count = activeCount;
    layer.mesh.visible = activeCount > 0;
    if (activeCount > 0 || didHide) {
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
  }
};

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
  trailVisuals: readonly TrailVisual[];
  weaponKinds: readonly RocketKind[];
}) => {
  blackHoleSwallowTracker.previousPlanetAliveById.clear();
  for (const planet of currentState.planets) {
    blackHoleSwallowTracker.previousPlanetAliveById.set(
      planet.id,
      planet.alive,
    );
  }
  blackHoleSwallowTracker.previousRocketsById.clear();
  blackHoleSwallowTracker.previousCachesById.clear();
  blackHoleSwallowTracker.previousSunSwallowedAtById.clear();
  for (const sun of currentState.suns) {
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
  for (const trail of trailVisuals) {
    trail.samples.length = 0;
    trail.geometry.setDrawRange(0, 0);
    trail.positionAttribute.needsUpdate = true;
    trail.opacityAttribute.needsUpdate = true;
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

  updateDebrisGeometry(
    debrisVisual,
    [],
    EMPTY_BOUNDARY_ASTEROID_COUNTS,
    0,
    currentState.elapsedSec,
  );
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
  syncSharedCombatBoostBurstVisual({
    boostVisual: boostBurstVisual,
    bursts: activeBoostBursts,
    getBodyById: (planetId) => renderPlanetsById.get(planetId) ?? null,
    maxParticlesPerBurst: 0,
    nowSec: currentState.elapsedSec,
  });
  updateGravityPulseVisual(
    gravityPulseVisual,
    activeGravityPulse,
    currentState.elapsedSec,
    FOLLOW_VIEW_WORLD_HEIGHT,
  );
  updateImpactBurstVisuals(
    impactBurstVisuals,
    [],
    renderPlanetsById,
    currentState.elapsedSec,
    0,
  );
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
  cannonAccentTint: { value: { set: (value: string) => unknown } };
  cannonBarrelBandMesh: Mesh;
  cannonBarrelMesh: Mesh;
  cannonBreechMesh: Mesh;
  cannonFireState: CannonFireState;
  cannonFlashMaterial: MeshBasicMaterial;
  cannonFlashMesh: Mesh;
  cannonGroup: Group;
  cannonMuzzleMesh: Mesh;
  cannonStemMesh: Mesh;
  chromaticAberrationNode: {
    amount: { value: unknown };
    angle: { value: unknown };
  };
  controlsEnabled: boolean;
  createCacheVisual: (
    cache: CombatSandboxCache,
    badgeMaterials: CacheSpriteAssets["badgeMaterials"],
  ) => CacheVisual;
  currentState: CombatSandboxState;
  debrisVisual: DebrisVisual;
  disposeCacheVisual: (visual: CacheVisual) => void;
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
  sunVisuals: readonly SunVisual[];
  neutronStarVisuals: readonly NeutronStarVisual[];
  planetVisuals: readonly PlanetVisual[];
  trailVisuals: readonly TrailVisual[];
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
  cannonAccentTint,
  cannonBarrelBandMesh,
  cannonBarrelMesh,
  cannonBreechMesh,
  cannonFireState,
  cannonFlashMaterial,
  cannonFlashMesh,
  cannonGroup,
  cannonMuzzleMesh,
  cannonStemMesh,
  chromaticAberrationNode,
  controlsEnabled,
  createCacheVisual,
  currentState,
  debrisVisual,
  disposeCacheVisual,
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
  for (const layer of backgroundLayers) {
    layer.group.position.x = wrapCentered(
      cameraState.renderCenterX * layer.parallax + nowSec * layer.driftX,
      layer.tileSize,
    );
    layer.group.position.y = wrapCentered(
      cameraState.renderCenterY * layer.parallax + nowSec * layer.driftY,
      layer.tileSize,
    );
  }

  const blackHole = renderState.blackHole;

  for (let index = 0; index < sunVisuals.length; index += 1) {
    const visual = sunVisuals[index]!;
    const sun = renderState.suns[index];

    if (sun === undefined) {
      visual.coreMesh.visible = false;
      visual.glowMesh.visible = false;
      visual.warpMesh.visible = false;
      continue;
    }

    const profile = getSunVisualProfile(getRuntimeVisuals().suns, index);
    const previousSwallowedAt =
      blackHoleSwallowTracker.previousSunSwallowedAtById.get(sun.id) ?? null;
    const swallowFade =
      sun.swallowedAtSec === null
        ? 1
        : clamp(1 - (renderState.elapsedSec - sun.swallowedAtSec) / 2.4, 0, 1);
    const swallowScale = lerp(0.58, 1, swallowFade);
    const visible = swallowFade > 0.01;
    const coreMaterial = visual.coreMesh.material as MeshBasicNodeMaterial;
    const glowMaterial = visual.glowMesh.material as MeshBasicNodeMaterial;
    const warpMaterial = visual.warpMesh.material as MeshBasicNodeMaterial;

    visual.coreMesh.visible = visible;
    visual.glowMesh.visible = visible;
    visual.warpMesh.visible = visible;
    if (!visible) {
      continue;
    }

    coreMaterial.opacity = swallowFade;
    glowMaterial.opacity = swallowFade * 0.92;
    warpMaterial.opacity = swallowFade * 0.78;
    visual.coreMesh.position.set(sun.pos.x, sun.pos.y, 0);
    visual.glowMesh.position.set(sun.pos.x, sun.pos.y, -2);
    visual.warpMesh.position.set(sun.pos.x, sun.pos.y, -4);
    const renderedRadius = sun.radius * swallowScale;
    visual.coreMesh.scale.set(renderedRadius, renderedRadius, renderedRadius);
    visual.glowMesh.scale.set(
      renderedRadius * profile.glowScale,
      renderedRadius * profile.glowScale,
      renderedRadius * profile.glowScale,
    );
    visual.warpMesh.scale.set(
      renderedRadius * profile.warpScale,
      renderedRadius * profile.warpScale,
      1,
    );
    visual.coreMesh.rotation.x = 0.38;
    visual.coreMesh.rotation.y = nowSec * visual.rotationSpeed;
    visual.glowMesh.rotation.z = nowSec * (0.05 + index * 0.02);

    if (
      blackHole !== null &&
      previousSwallowedAt === null &&
      sun.swallowedAtSec !== null
    ) {
      queueBlackHoleSwallowEffect({
        activeEffects: activeBlackHoleSwallowEffects,
        color: profile.glowColor,
        inactiveVisuals: inactiveBlackHoleSwallowVisuals,
        radius: sun.radius,
        startedAtSec: nowSec,
        startPos: sun.pos,
        targetPos: blackHole.pos,
      });
    }

    blackHoleSwallowTracker.previousSunSwallowedAtById.set(
      sun.id,
      sun.swallowedAtSec,
    );
  }

  const neutronStarTuning = getRuntimeTuningDocument().gameplay.neutronStars;
  const neutronStarVisualTuning =
    getRuntimeTuningDocument().visuals.neutronStars;
  for (let index = 0; index < neutronStarVisuals.length; index += 1) {
    const visual = neutronStarVisuals[index]!;
    const neutronStar = renderState.neutronStars[index];
    const visible = neutronStar !== undefined;

    visual.group.visible = visible;
    if (!visible) {
      continue;
    }

    const massAlpha = getNeutronStarMassAlpha(
      neutronStar.mass,
      neutronStarTuning,
    );
    const pulse = 1 + Math.sin(nowSec * 6.4 + visual.phase) * 0.04;
    const haloPulse = 1 + Math.sin(nowSec * 4.8 + visual.phase * 1.7) * 0.08;
    const { coreRadius, haloRadius, lensRadius, jetLength, jetWidth } =
      getNeutronStarVisualShape({
        haloPulse,
        massAlpha,
        pulse,
        radius: neutronStar.radius,
        tuning: neutronStarVisualTuning,
      });
    const coreMaterial = visual.coreMesh.material as MeshBasicNodeMaterial;
    const haloMaterial = visual.haloMesh.material as MeshBasicNodeMaterial;
    const lensMaterial = visual.lensMesh.material as MeshBasicNodeMaterial;
    const jetMaterialA = visual.jetMeshA.material as MeshBasicNodeMaterial;
    const jetMaterialB = visual.jetMeshB.material as MeshBasicNodeMaterial;

    visual.group.position.set(neutronStar.pos.x, neutronStar.pos.y, -1);
    visual.group.rotation.z = nowSec * 0.06 + visual.phase * 0.18;
    visual.coreMesh.scale.set(coreRadius, coreRadius, coreRadius);
    visual.haloMesh.scale.set(haloRadius, haloRadius, 1);
    visual.lensMesh.scale.set(lensRadius, lensRadius, 1);
    visual.jetMeshA.scale.set(jetWidth, jetLength, 1);
    visual.jetMeshB.scale.set(
      jetWidth * NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR,
      jetLength * NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR,
      1,
    );
    visual.jetMeshA.rotation.z =
      visual.phase + Math.sin(nowSec * 0.4 + visual.phase) * 0.08;
    visual.jetMeshB.rotation.z =
      visual.phase +
      Math.PI / 2 -
      Math.sin(nowSec * 0.36 + visual.phase) * 0.06;
    visual.haloMesh.rotation.z = nowSec * 0.18 + visual.phase * 0.4;
    visual.lensMesh.rotation.z = -nowSec * 0.12 - visual.phase * 0.3;
    visual.coreMesh.rotation.x = 0.44;
    visual.coreMesh.rotation.y = nowSec * visual.spinSpeed;
    coreMaterial.opacity = 1;
    haloMaterial.opacity = neutronStarVisualTuning.haloOpacity;
    lensMaterial.opacity = neutronStarVisualTuning.lensOpacity;
    jetMaterialA.opacity = neutronStarVisualTuning.jetOpacity;
    jetMaterialB.opacity =
      neutronStarVisualTuning.jetOpacity *
      NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR;
  }

  for (let index = 0; index < planetVisuals.length; index += 1) {
    const visual = planetVisuals[index]!;
    const trail = trailVisuals[index]!;
    const planet = renderState.planets[index]!;
    const wasAlive =
      blackHoleSwallowTracker.previousPlanetAliveById.get(planet.id) ?? true;
    const planetVisualTuning = getPlanetArchetypeVisuals(planet.archetype);
    const auraRingStops = getPlanetAuraRingStops(
      planetVisualTuning.auraScale,
      planetVisualTuning.auraGap,
    );

    visual.mesh.visible = planet.alive;
    visual.glowMesh.visible = planet.alive;
    visual.surfaceOpacityUniform.value = 1;
    visual.glowOpacityUniform.value = 1;
    trail.points.visible = false;

    if (planet.alive) {
      visual.glowContactStartNode.value = auraRingStops.contactStart;
      visual.glowRiseStartNode.value = auraRingStops.riseStart;
      visual.glowRiseEndNode.value = auraRingStops.riseEnd;
      visual.glowFadeStartNode.value = auraRingStops.fadeStart;
      visual.mesh.position.set(planet.pos.x, planet.pos.y, 0);
      visual.glowMesh.position.set(planet.pos.x, planet.pos.y, 0.16);
      const renderRadius = getRenderedPlanetRadius(planet);
      visual.mesh.scale.set(renderRadius, renderRadius, renderRadius);
      visual.glowMesh.scale.set(
        renderRadius * planetVisualTuning.auraScale,
        renderRadius * planetVisualTuning.auraScale,
        1,
      );
      visual.mesh.setRotationFromAxisAngle(
        visual.spinAxis,
        nowSec * visual.rotationSpeed + visual.spinPhase,
      );
    }

    if (
      blackHole !== null &&
      wasAlive &&
      !planet.alive &&
      planet.deathReason === "blackHole"
    ) {
      queueBlackHoleSwallowEffect({
        activeEffects: activeBlackHoleSwallowEffects,
        color: planet.color,
        inactiveVisuals: inactiveBlackHoleSwallowVisuals,
        radius: getRenderedPlanetRadius(planet),
        startedAtSec: nowSec,
        startPos: planet.pos,
        targetPos: blackHole.pos,
      });
    }

    blackHoleSwallowTracker.previousPlanetAliveById.set(
      planet.id,
      planet.alive,
    );
  }

  syncSharedCombatCacheVisuals({
    activeCacheIds,
    badgeBaseSize: getCacheBadgeBaseSize(),
    badgeMaterials: cacheSpriteAssets.badgeMaterials,
    badgeScale: cacheBadgeScale,
    cacheVisuals,
    caches: renderState.caches,
    createCacheVisual,
    disposeCacheVisual,
    getCacheIconKey,
    nowSec,
    renderedCacheKeysById,
    scene,
    updateCacheVisualBadge,
  });

  queueSharedCombatRemovedCacheSwallowEffects({
    activeCacheIds,
    blackHole,
    previousCachesById: blackHoleSwallowTracker.previousCachesById,
    queueEffect: (previousCache) => {
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
  });

  syncSharedCombatTrackedCaches({
    caches: renderState.caches,
    previousCachesById: blackHoleSwallowTracker.previousCachesById,
  });

  for (const rocketKind of weaponKinds) {
    rocketsByKind[rocketKind].length = 0;
    launchBurstsByKind[rocketKind].length = 0;
  }
  for (const rocket of renderState.rockets) {
    rocketsByKind[rocket.rocketKind].push(rocket);
  }
  queueSharedCombatRemovedRocketSwallowEffects({
    activeRocketIds: new Set(renderState.rockets.map((rocket) => rocket.id)),
    blackHole,
    getMargin: (rocket) => Math.max(64, rocket.radius * 9),
    previousRocketsById: blackHoleSwallowTracker.previousRocketsById,
    queueEffect: (previousRocket) => {
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
  });
  syncSharedCombatTrackedRockets({
    previousRocketsById: blackHoleSwallowTracker.previousRocketsById,
    rockets: renderState.rockets,
  });
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
  syncSharedCombatRocketPools({
    maxRocketTrailSamples,
    nowSec,
    rocketKinds: weaponKinds,
    rocketPools,
    rocketTrailBudget: renderQuality.rocketTrailBudget,
    rocketTrailStates,
    rocketsByKind,
  });
  syncSharedCombatLaunchBurstPools({
    burstsByKind: launchBurstsByKind,
    cannonLayout,
    currentPlayerId: renderState.player.playerId,
    launchBurstBudget: renderQuality.launchBurstBudget,
    launchBurstPools: rocketLaunchBurstPools,
    nowSec: renderElapsedSec,
    rocketKinds: weaponKinds,
    rocketPools,
    worldUnitsPerPixel,
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
  const highlightedBoundaryAsteroidCounts = updateBoundaryAsteroidFalloutVisual(
    boundaryDebrisVisual,
    renderState.debris,
    nowSec,
  );
  updateDebrisGeometry(
    debrisVisual,
    renderState.debris,
    highlightedBoundaryAsteroidCounts,
    maxDebrisSamples,
    nowSec,
  );
  pruneSharedCombatBoostBursts({
    activeBursts: activeBoostBursts,
    nowSec,
  });
  const playerBoostDirectionOverride: SharedCombatBoostDirectionOverride | null =
    playerBoostHeld && playerPlanet !== null && playerPlanet.alive
      ? (() => {
          const aimDelta = sub(inputState.aimWorld, playerPlanet.pos);
          return len(aimDelta) > 0.001
            ? {
                direction: normalizeVec2(aimDelta),
                planetId: playerPlanet.id,
              }
            : null;
        })()
      : null;
  syncSharedCombatBoostBurstVisual({
    boostVisual: boostBurstVisual,
    bursts: activeBoostBursts,
    directionOverride: playerBoostDirectionOverride,
    getBodyById: (planetId) => renderPlanetsById.get(planetId) ?? null,
    maxParticlesPerBurst: boostBurstParticlesPerBurst,
    nowSec,
  });
  updateGravityPulseVisual(
    gravityPulseVisual,
    activeGravityPulse,
    nowSec,
    cameraState.visibleWorldHeight,
  );
  updateImpactBurstVisuals(
    impactBurstVisuals,
    renderState.impactBursts,
    renderPlanetsById,
    renderState.elapsedSec,
    maxVisibleImpactBursts,
  );
  updateSharedCombatPlanetExplosions({
    activePlanetExplosions,
    elapsedSec: renderState.elapsedSec,
    inactivePlanetExplosionVisuals,
  });

  const shieldLoadRatio =
    currentState.player.shieldMaxLoad > 0
      ? clamp(
          currentState.player.shieldLoad / currentState.player.shieldMaxLoad,
          0,
          1,
        )
      : 0;
  const shieldActive =
    currentState.player.shieldActive &&
    currentState.player.shieldLoad > 0 &&
    playerPlanet?.alive === true;
  if (shieldActive && playerPlanet !== null) {
    const shieldAngle = Math.atan2(
      renderState.player.shieldAimDir.y,
      renderState.player.shieldAimDir.x,
    );
    const pulse = 1 + Math.sin(nowSec * 8.2) * 0.035;
    const shieldRadius = getRenderedPlanetRadius(playerPlanet);
    const shieldHitReact = getSharedCombatShieldHitReact({
      bursts: renderState.impactBursts,
      nowSec: renderState.elapsedSec,
      planetId: playerPlanet.id,
      shieldRadius,
    });
    syncSharedCombatShieldVisual({
      state: {
        arcOpacity: clamp(
          0.16 +
            shieldLoadRatio * 0.3 +
            Math.sin(nowSec * 7.6) * 0.05 +
            shieldHitReact.arcBoost,
          0,
          1,
        ),
        center: add(playerPlanet.pos, shieldHitReact.offset),
        crestOpacity: clamp(
          0.16 +
            shieldLoadRatio * 0.36 +
            Math.sin(nowSec * 10.8) * 0.06 +
            shieldHitReact.arcBoost * 0.88,
          0,
          1,
        ),
        glowOpacity: clamp(
          0.05 +
            shieldLoadRatio * 0.11 +
            Math.sin(nowSec * 9.4) * 0.03 +
            shieldHitReact.glowBoost,
          0,
          1,
        ),
        panelOpacity: clamp(
          0.18 +
            shieldLoadRatio * 0.42 +
            Math.sin(nowSec * 9.8) * 0.05 +
            shieldHitReact.arcBoost * 0.84,
          0,
          1,
        ),
        radius: shieldRadius * pulse * shieldHitReact.scale,
        rotation: shieldAngle + shieldHitReact.rotation,
        z: 0,
      },
      visual: {
        arcOpacityUniform: shieldArcOpacityUniform,
        crestOpacityUniform: shieldCrestOpacityUniform,
        glowOpacityUniform: shieldGlowOpacityUniform,
        group: shieldGroup,
        panelOpacityUniform: shieldPanelOpacityUniform,
      },
    });
  } else {
    syncSharedCombatShieldVisual({
      state: null,
      visual: {
        arcOpacityUniform: shieldArcOpacityUniform,
        crestOpacityUniform: shieldCrestOpacityUniform,
        glowOpacityUniform: shieldGlowOpacityUniform,
        group: shieldGroup,
        panelOpacityUniform: shieldPanelOpacityUniform,
      },
    });
  }

  const controlledBody = getLocalViewportControlledBody(renderState);
  if (
    controlledBody !== null &&
    controlsEnabled &&
    playerPlanet?.alive &&
    !shieldActive
  ) {
    const aimDelta = sub(inputState.aimWorld, controlledBody.pos);
    const aimAngle = Math.atan2(aimDelta.y, aimDelta.x);
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
    syncSharedCombatCannonVisual({
      state: {
        accent: weaponAccent,
        aimAngle,
        flashAccent: weaponAccent,
        flashAgeSec: nowSec - cannonFireState.flashStartSec,
        layout: cannonLayout,
        position: controlledBody.pos,
        surfaceOffset: aimSurfaceOffset,
        visible: true,
        z: 6,
      },
      visual: {
        barrelBandMesh: cannonBarrelBandMesh,
        barrelMesh: cannonBarrelMesh,
        breechMesh: cannonBreechMesh,
        flashMaterial: cannonFlashMaterial,
        flashMesh: cannonFlashMesh,
        group: cannonGroup,
        muzzleMesh: cannonMuzzleMesh,
        setAccentColor: (value) => {
          cannonAccentTint.value.set(value);
        },
        stemMesh: cannonStemMesh,
      },
    });

    const lockTarget =
      renderState.player.lockTargetId === null
        ? null
        : (renderPlanetsById.get(renderState.player.lockTargetId) ?? null);

    const lockRingVisible =
      inputState.selectedRocketKind === "seeker" &&
      lockTarget !== null &&
      lockTarget.alive;
    if (lockTarget !== null && lockRingVisible) {
      const lockProgress = getLocalSandboxLockProgress({
        currentTick: currentState.tick,
        lockAcquiredTick: currentState.player.seekerLockAcquiredAtTick,
      });
      syncSharedCombatLockRingVisual({
        state: {
          baseRadius: getRenderedPlanetRadius(lockTarget) + 22,
          locked: lockProgress >= 1,
          nowSec,
          position: lockTarget.pos,
          progress: lockProgress,
          z: 5.5,
        },
        visual: {
          lockedUniform: lockRingLockedUniform,
          mesh: lockRingMesh,
          progressUniform: lockRingProgressUniform,
          timeUniform: lockRingTimeUniform,
        },
      });
    } else {
      hideSharedCombatLockRingVisual({
        lockedUniform: lockRingLockedUniform,
        mesh: lockRingMesh,
        progressUniform: lockRingProgressUniform,
        timeUniform: lockRingTimeUniform,
      });
    }
  } else {
    syncSharedCombatCannonVisual({
      state: {
        accent: "#ffffff",
        aimAngle: 0,
        flashAccent: null,
        flashAgeSec: null,
        layout: cannonLayout,
        position: { x: 0, y: 0 },
        surfaceOffset: 0,
        visible: false,
        z: 6,
      },
      visual: {
        barrelBandMesh: cannonBarrelBandMesh,
        barrelMesh: cannonBarrelMesh,
        breechMesh: cannonBreechMesh,
        flashMaterial: cannonFlashMaterial,
        flashMesh: cannonFlashMesh,
        group: cannonGroup,
        muzzleMesh: cannonMuzzleMesh,
        setAccentColor: (value) => {
          cannonAccentTint.value.set(value);
        },
        stemMesh: cannonStemMesh,
      },
    });
    for (const rocketKind of weaponKinds) {
      cannonFireState.lastAmmo[rocketKind] =
        renderState.player.ammo[rocketKind];
    }
    hideSharedCombatLockRingVisual({
      lockedUniform: lockRingLockedUniform,
      mesh: lockRingMesh,
      progressUniform: lockRingProgressUniform,
      timeUniform: lockRingTimeUniform,
    });
  }

  syncSharedCombatBlackHoleVisual({
    blackHole:
      blackHole === null
        ? null
        : {
            killRadius: blackHole.killRadius,
            pos: blackHole.pos,
            z: 4,
          },
    nowSec,
    visual: {
      group: blackHoleGroup,
      ringMesh: blackHoleRing,
    },
  });
  updateBlackHoleSwallowEffects({
    activeEffects: activeBlackHoleSwallowEffects,
    inactiveVisuals: inactiveBlackHoleSwallowVisuals,
    nowSec,
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
