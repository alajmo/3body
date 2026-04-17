import type { RocketKind, Vec2 } from "@3body/shared";
import {
  FIXED_STEP_SEC,
  add,
  clamp,
  len,
  lerp,
  mulberry32,
  rot,
  scale as scaleVec2,
  sub,
} from "@3body/shared";
import {
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  type LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  Points,
  type PointsNodeMaterial,
  Quaternion,
  Sprite,
  Vector3,
} from "three/webgpu";
import type {
  CombatSandboxCache,
  CombatSandboxDebris,
  CombatSandboxDrone,
  CombatSandboxImpactBurst,
  CombatSandboxPlanet,
  CombatSandboxRocket,
  CombatSandboxRocketLaunchBurst,
  CombatSandboxState,
} from "../combatSandbox";
import { getSandboxDebugSnapshot } from "../combatSandbox";
import {
  getPlanetArchetypeVisuals,
  getPlanetBodyScaleForArchetype,
  getRenderedPlanetRadius,
} from "../planetVisualTuning";
import {
  getCannonMuzzleDistanceFromLayout,
  getCannonMuzzleOrigin,
  getCannonWorldLayout,
  getLaunchBurstHandoffDuration,
  getLaunchBurstTravelDistance,
  getMinScreenAxisScale,
  getRocketVisibleDistanceThreshold,
  ROCKET_MIN_SCREEN_WIDTH_PX,
  ROCKET_RENDER_INSTANCE_LIMITS,
} from "../rocketVisibility";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import type { RocketMeshSilhouette } from "../rocketMeshSilhouette";
import type {
  CacheIconKey,
  CacheSpriteAssets,
  CacheSpriteMaterialMap,
  CacheVisual,
} from "./cacheVisuals";
import {
  clipForesightPathAtDistance,
  getForesightPointOpacity,
} from "./foresightShared";
import { getRenderedShieldOuterRadius } from "../shieldPresentation";
import type { LocalViewportCameraState } from "./localViewportCamera";
import { getLocalViewportControlledBody } from "./localViewportCamera";
import { getLocalSandboxLockProgress } from "./localSandboxSimulation";
import type { ViewportRenderQualityProfile } from "./renderQuality";

const ROCKET_TRAIL_DURATION_SEC = 0.18;
const ROCKET_TRAIL_SAMPLE_DISTANCE = 18;
const BOOST_BURST_DURATION_SEC = 0.48;
const PLANET_EXPLOSION_DURATION_SEC = 1.55;
const PLANET_EXPLOSION_FLASH_DURATION_SEC = 0.34;
const PLANET_EXPLOSION_RING_DURATION_SEC = 0.78;
const SHIELD_HIT_REACT_DURATION_SEC = 0.26;
const CHROMATIC_ABERRATION_MAX = 0.0012;
const CHROMATIC_DISTANCE_FALLOFF = 720;
const CANNON_BAND_POSITION = 0.32;
const FOLLOW_VIEW_WORLD_HEIGHT = 1000 * 0.92;
const IMPACT_CORE_BASE = new Color("#fff5dd");
const CACHED_COLORS = new Map<string, Color>();
const TINTED_COLORS = new Map<string, Color>();
const Z_AXIS = new Vector3(0, 0, 1);

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

interface PlanetVisual {
  glowContactStartNode: { value: unknown };
  glowFadeStartNode: { value: unknown };
  glowMesh: Mesh;
  glowRiseEndNode: { value: unknown };
  glowRiseStartNode: { value: unknown };
  mesh: Mesh;
  rotationSpeed: number;
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

interface RocketPartMeshes {
  body: InstancedMesh;
  canardBottom: InstancedMesh;
  canardTop: InstancedMesh;
  engine: InstancedMesh;
  nose: InstancedMesh;
  rearFinBottom: InstancedMesh;
  rearFinTop: InstancedMesh;
  sensor: InstancedMesh;
}

interface RocketPoolVisual {
  activeCount: number;
  flameMesh: InstancedMesh;
  flameScale: Vec2;
  partMeshList: readonly InstancedMesh[];
  parts: RocketPartMeshes;
  scale: Vec2;
  silhouette: RocketMeshSilhouette;
  trailActiveCount: number;
  trailCapacity: number;
  trailMesh: InstancedMesh;
  trailScale: Vec2;
}

interface RocketLaunchBurstPoolVisual {
  activeCount: number;
  mesh: InstancedMesh;
  scale: Vec2;
}

interface RocketTrailState {
  lastSeenSec: number;
  rocketKind: RocketKind;
  samples: TrailSample[];
}

interface DebrisVisual {
  colorAttribute: Float32BufferAttribute;
  geometry: {
    setDrawRange: (start: number, count: number) => void;
  };
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
}

interface ForesightVisual {
  line: Line;
  lineGeometry: {
    setDrawRange: (start: number, count: number) => void;
  };
  lineMaterial: LineBasicMaterial;
  linePositionAttribute: Float32BufferAttribute;
  pointColorUniform: {
    value: Color;
  };
  pointGeometry: {
    setDrawRange: (start: number, count: number) => void;
  };
  pointOpacityAttribute: Float32BufferAttribute;
  pointOpacityUniform: {
    value: number;
  };
  pointMaterial: PointsNodeMaterial;
  pointPositionAttribute: Float32BufferAttribute;
  points: Points;
}

interface BoostBurstState {
  direction: Vec2;
  origin: Vec2;
  planetArchetype: CombatSandboxPlanet["archetype"];
  planetId: number;
  radius: number;
  startedAtSec: number;
  tick: number;
}

interface BoostBurstVisual {
  geometry: {
    setDrawRange: (start: number, count: number) => void;
  };
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  wakeMaterial: MeshBasicMaterial;
  wakeMesh: Mesh;
}

interface ImpactBurstVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  ringMesh: Mesh;
}

interface PlanetExplosionChunkVisual {
  baseScale: Vector3;
  direction: Vec2;
  driftDistance: number;
  lateralAmplitude: number;
  lift: number;
  mesh: Mesh;
  radialOffset: number;
  rotationPhase: Vector3;
  rotationSpeed: Vector3;
  tangent: Vec2;
}

interface PlanetExplosionVisual {
  chunkMaterials: readonly [MeshBasicMaterial, MeshBasicMaterial];
  chunks: readonly PlanetExplosionChunkVisual[];
  coreMaterial: MeshBasicMaterial;
  coreMesh: Mesh;
  glowMaterial: MeshBasicMaterial;
  glowMesh: Mesh;
  group: Group;
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
  shockwaveMaterial: MeshBasicMaterial;
  shockwaveMesh: Mesh;
}

interface PlanetExplosionState {
  durationSec: number;
  origin: Vec2;
  radius: number;
  scatterScale: number;
  shockwaveScale: number;
  startedAtSec: number;
  velocity: Vec2;
  visual: PlanetExplosionVisual;
}

interface DroneVisual {
  glowMesh: Mesh;
  group: Group;
  hullMesh: Mesh;
  noseMesh: Mesh;
  wingMesh: Mesh;
}

interface CannonFireState {
  flashStartSec: number;
  lastAmmo: Record<RocketKind, number>;
}

const getRuntimeVisuals = () => getRuntimeTuningDocument().visuals;
const getSunGlowScale = () => getRuntimeVisuals().suns.glowScale;
const getSunWarpScale = () => getRuntimeVisuals().suns.warpScale;
const getForesightPathTuning = () => getRuntimeVisuals().abilities.foresight;
const getCacheBadgeBaseSize = () => getRuntimeVisuals().caches.badgeBaseSize;
const getDroneColor = () => getRuntimeVisuals().drone.activeColor;
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

const getShieldHitReact = ({
  bursts,
  elapsedSec,
  planetId,
  shieldRadius,
}: {
  bursts: readonly CombatSandboxImpactBurst[];
  elapsedSec: number;
  planetId: number;
  shieldRadius: number;
}) => {
  let strongestBurst: CombatSandboxImpactBurst | null = null;
  let strongestEnvelope = 0;

  for (const burst of bursts) {
    if (!burst.absorbedByShield || burst.planetId !== planetId) {
      continue;
    }

    const ageSec = elapsedSec - burst.startedAtSec;
    if (ageSec < 0 || ageSec > SHIELD_HIT_REACT_DURATION_SEC) {
      continue;
    }

    const envelope = 1 - ageSec / SHIELD_HIT_REACT_DURATION_SEC;
    if (envelope > strongestEnvelope) {
      strongestEnvelope = envelope;
      strongestBurst = burst;
    }
  }

  if (strongestBurst === null) {
    return {
      arcBoost: 0,
      glowBoost: 0,
      offset: { x: 0, y: 0 },
      rotation: 0,
      scale: 1,
    };
  }

  const ageSec = elapsedSec - strongestBurst.startedAtSec;
  const normal =
    len(strongestBurst.normal) > 0.001
      ? strongestBurst.normal
      : ({ x: 1, y: 0 } satisfies Vec2);
  const tangent = { x: -normal.y, y: normal.x } satisfies Vec2;
  const shake = Math.sin(ageSec * 72) * strongestEnvelope;
  const rebound = Math.sin(ageSec * 24) * strongestEnvelope;

  return {
    arcBoost: strongestEnvelope * 0.3,
    glowBoost: strongestEnvelope * 0.22,
    offset: add(
      scaleVec2(normal, shieldRadius * 0.02 * strongestEnvelope),
      scaleVec2(tangent, shieldRadius * 0.045 * shake),
    ),
    rotation: shake * 0.1,
    scale: 1 + strongestEnvelope * 0.08 + Math.abs(rebound) * 0.04,
  };
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

const getBoostBurstAnchor = (
  burst: BoostBurstState,
  planetsById: ReadonlyMap<number, CombatSandboxPlanet>,
): { origin: Vec2; radius: number } => {
  const boostedPlanet = planetsById.get(burst.planetId) ?? null;
  if (boostedPlanet?.alive) {
    return {
      origin: boostedPlanet.pos,
      radius: getRenderedPlanetRadius(boostedPlanet),
    };
  }

  return {
    origin: burst.origin,
    radius: burst.radius * getPlanetBodyScaleForArchetype(burst.planetArchetype),
  };
};

const getForesightBodySurface = (
  entityId: number,
  renderState: CombatSandboxState,
): { hiddenRadius: number; origin: Vec2 } | null => {
  const planet =
    renderState.planets.find((candidate) => candidate.id === entityId) ?? null;
  if (planet?.alive) {
    return {
      hiddenRadius: getRenderedPlanetRadius(planet) + 2,
      origin: planet.pos,
    };
  }

  const sun =
    renderState.suns.find((candidate) => candidate.id === entityId) ?? null;
  if (sun !== null && sun.swallowedAtSec === null) {
    return {
      hiddenRadius: sun.radius + 2,
      origin: sun.pos,
    };
  }

  return null;
};

const updateForesightVisual = (
  foresightVisual: ForesightVisual,
  pathPoints: readonly Vec2[],
  tuning: ReturnType<typeof getForesightPathTuning>,
) => {
  foresightVisual.lineMaterial.color.set(tuning.lineColor);
  foresightVisual.lineMaterial.opacity = tuning.lineOpacity;
  foresightVisual.pointColorUniform.value.set(tuning.dotColor);
  foresightVisual.pointOpacityUniform.value = tuning.dotOpacity;
  foresightVisual.pointMaterial.size = tuning.pointSize;

  const lineArray = foresightVisual.linePositionAttribute.array as Float32Array;
  const pointArray = foresightVisual.pointPositionAttribute
    .array as Float32Array;
  const opacityArray = foresightVisual.pointOpacityAttribute
    .array as Float32Array;
  const maxPoints = Math.min(
    foresightVisual.pointPositionAttribute.count,
    foresightVisual.linePositionAttribute.count,
  );
  const pointCount = Math.min(pathPoints.length, maxPoints);
  let visiblePointCount = 0;

  for (let index = 0; index < pointCount; index += 1) {
    const point = pathPoints[index]!;
    const offset = index * 3;

    lineArray[offset] = point.x;
    lineArray[offset + 1] = point.y;
    lineArray[offset + 2] = 0;
    pointArray[offset] = point.x;
    pointArray[offset + 1] = point.y;
    pointArray[offset + 2] = 0;
    const opacity = getForesightPointOpacity({
      index,
      pointCount,
      tuning,
    });
    opacityArray[index] = opacity;

    if (opacity > 0.01) {
      visiblePointCount += 1;
    }
  }

  foresightVisual.lineGeometry.setDrawRange(
    0,
    tuning.showLine ? pointCount : 0,
  );
  foresightVisual.pointGeometry.setDrawRange(0, pointCount);
  foresightVisual.linePositionAttribute.needsUpdate = true;
  foresightVisual.pointPositionAttribute.needsUpdate = true;
  foresightVisual.pointOpacityAttribute.needsUpdate = true;
  foresightVisual.line.visible =
    tuning.showLine && tuning.lineOpacity > 0.01 && pointCount > 1;
  foresightVisual.points.visible =
    tuning.showDots &&
    tuning.dotOpacity > 0.01 &&
    pointCount > 0 &&
    visiblePointCount > 0;
};

const updateBoostBurstVisual = (
  boostVisual: BoostBurstVisual,
  bursts: readonly BoostBurstState[],
  planetsById: ReadonlyMap<number, CombatSandboxPlanet>,
  maxParticlesPerBurst: number,
  nowSec: number,
) => {
  const positionArray = boostVisual.positionAttribute.array as Float32Array;
  const opacityArray = boostVisual.opacityAttribute.array as Float32Array;
  const particleLimit = Math.max(0, maxParticlesPerBurst);
  const maxDrawCount = Math.min(
    boostVisual.positionAttribute.count,
    particleLimit * Math.max(1, bursts.length),
  );
  let drawCount = 0;
  let brightestBurst: BoostBurstState | null = null;
  let brightestAlpha = 0;
  let brightestOrigin: Vec2 | null = null;
  let brightestProgress = 0;
  let brightestRadius = 0;

  for (const burst of bursts) {
    const ageSec = nowSec - burst.startedAtSec;
    if (ageSec < 0 || ageSec > BOOST_BURST_DURATION_SEC) {
      continue;
    }

    const burstAlpha = clamp(1 - ageSec / BOOST_BURST_DURATION_SEC, 0, 1);
    const burstProgress = clamp(ageSec / BOOST_BURST_DURATION_SEC, 0, 1);
    const { origin, radius } = getBoostBurstAnchor(burst, planetsById);
    if (burstAlpha > brightestAlpha) {
      brightestAlpha = burstAlpha;
      brightestBurst = burst;
      brightestOrigin = origin;
      brightestProgress = burstProgress;
      brightestRadius = radius;
    }

    const exhaustDir = scaleVec2(burst.direction, -1);
    const particleOrigin = add(origin, scaleVec2(exhaustDir, radius * 0.38));

    for (
      let index = 0;
      index < particleLimit && drawCount < maxDrawCount;
      index += 1
    ) {
      const progress = index / Math.max(1, particleLimit - 1);
      const spreadAngle =
        ((index % 7) - 3) * 0.11 +
        Math.sin(burst.tick * 0.29 + index * 1.13) * 0.08;
      const particleDir = rot(exhaustDir, spreadAngle);
      const travel =
        radius * (0.68 + progress * 1.1) + ageSec * (210 + (index % 5) * 44);
      const forwardDrift = ageSec * 30 * (1 - progress * 0.6);
      const particlePos = add(
        particleOrigin,
        add(
          scaleVec2(particleDir, travel),
          scaleVec2(burst.direction, forwardDrift),
        ),
      );
      const offset = drawCount * 3;

      positionArray[offset] = particlePos.x;
      positionArray[offset + 1] = particlePos.y;
      positionArray[offset + 2] = 0;
      opacityArray[drawCount] = burstAlpha * (1.02 - progress * 0.46);
      drawCount += 1;
    }
  }

  boostVisual.geometry.setDrawRange(0, drawCount);
  boostVisual.positionAttribute.needsUpdate = true;
  boostVisual.opacityAttribute.needsUpdate = true;
  boostVisual.points.visible = drawCount > 0;

  const hasBurst = brightestBurst !== null && brightestOrigin !== null;
  boostVisual.wakeMesh.visible = hasBurst;

  if (hasBurst && brightestBurst !== null && brightestOrigin !== null) {
    const exhaustDir = scaleVec2(brightestBurst.direction, -1);
    const wakeLength = brightestRadius * lerp(2.3, 4.9, brightestProgress);
    const wakeWidth = brightestRadius * lerp(1.5, 0.82, brightestProgress);
    const wakeOffset = brightestRadius * lerp(0.46, 0.72, brightestProgress);
    boostVisual.wakeMesh.position.set(
      brightestOrigin.x + exhaustDir.x * wakeOffset,
      brightestOrigin.y + exhaustDir.y * wakeOffset,
      2.26,
    );
    boostVisual.wakeMesh.scale.set(wakeLength, wakeWidth, 1);
    boostVisual.wakeMesh.rotation.z = Math.atan2(exhaustDir.y, exhaustDir.x);
    boostVisual.wakeMaterial.opacity =
      brightestAlpha * lerp(1, 0.44, brightestProgress);
  } else {
    boostVisual.wakeMaterial.opacity = 0;
  }
};

const hideImpactBurstVisual = (visual: ImpactBurstVisual) => {
  visual.coreMesh.visible = false;
  visual.glowMesh.visible = false;
  visual.ringMesh.visible = false;
};

const updateImpactBurstVisuals = (
  visuals: readonly ImpactBurstVisual[],
  bursts: readonly CombatSandboxImpactBurst[],
  planetsById: ReadonlyMap<number, CombatSandboxPlanet>,
  elapsedSec: number,
  maxVisibleBursts: number,
) => {
  const visibleLimit = Math.min(visuals.length, Math.max(0, maxVisibleBursts));
  let visibleCount = 0;
  const firstBurstIndex = Math.max(0, bursts.length - visibleLimit);

  for (
    let burstIndex = firstBurstIndex;
    burstIndex < bursts.length && visibleCount < visibleLimit;
    burstIndex += 1
  ) {
    const burst = bursts[burstIndex]!;
    const planet = planetsById.get(burst.planetId) ?? null;
    if (planet === null) {
      continue;
    }

    const durationSec = Math.max(
      FIXED_STEP_SEC,
      (burst.ttlUntilTick - burst.startedAtTick) * FIXED_STEP_SEC,
    );
    const ageSec = elapsedSec - burst.startedAtSec;
    if (ageSec < 0 || ageSec > durationSec) {
      continue;
    }

    const visual = visuals[visibleCount]!;
    const progress = clamp(ageSec / durationSec, 0, 1);
    const fade = (1 - progress) ** 1.6;
    const flashAlpha =
      fade *
      (burst.absorbedByShield
        ? 0.58 + (1 - progress) * 0.26
        : 0.72 + (1 - progress) * 0.18);
    const glowAlpha =
      fade *
      (burst.absorbedByShield
        ? 0.34 + (1 - progress) * 0.24
        : 0.28 + (1 - progress) * 0.16);
    const ringAlpha = fade * (burst.absorbedByShield ? 0.56 : 0.44);
    const renderRadius = getRenderedPlanetRadius(planet);
    const impactSurfaceRadius = burst.absorbedByShield
      ? getRenderedShieldOuterRadius(
          planet.radius,
          getPlanetBodyScaleForArchetype(planet.archetype),
        )
      : renderRadius;
    const normal = len(burst.normal) > 0.001 ? burst.normal : { x: 1, y: 0 };
    const radialDrift =
      impactSurfaceRadius *
      (burst.absorbedByShield
        ? 0.98 + progress * 0.05
        : 0.94 + progress * 0.08);
    const impactPos = add(planet.pos, scaleVec2(normal, radialDrift));
    const glowMaterial = visual.glowMesh.material as MeshBasicMaterial;
    const coreMaterial = visual.coreMesh.material as MeshBasicMaterial;
    const ringMaterial = visual.ringMesh.material as MeshBasicMaterial;
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

    visual.glowMesh.visible = glowAlpha > 0.01;
    visual.coreMesh.visible = flashAlpha > 0.01;
    visual.ringMesh.visible = ringAlpha > 0.01;

    visual.glowMesh.position.set(impactPos.x, impactPos.y, 2.55);
    visual.coreMesh.position.set(impactPos.x, impactPos.y, 2.65);
    visual.ringMesh.position.set(impactPos.x, impactPos.y, 2.75);

    const glowScale =
      impactSurfaceRadius *
      (burst.absorbedByShield ? 0.22 + progress * 0.24 : 0.3 + progress * 0.34);
    const coreScale =
      impactSurfaceRadius *
      (burst.absorbedByShield
        ? 0.09 + (1 - progress) * 0.11
        : 0.12 + (1 - progress) * 0.12);
    const ringScale =
      impactSurfaceRadius *
      (burst.absorbedByShield
        ? 0.14 + progress * 0.34
        : 0.16 + progress * 0.42);
    visual.glowMesh.scale.set(glowScale, glowScale, 1);
    visual.coreMesh.scale.set(coreScale, coreScale, 1);
    visual.ringMesh.scale.set(ringScale, ringScale, 1);

    glowMaterial.color.copy(glowTint);
    glowMaterial.opacity = glowAlpha;
    coreMaterial.color
      .copy(IMPACT_CORE_BASE)
      .lerp(getCachedColor(impactColor), burst.absorbedByShield ? 0.4 : 0.28);
    coreMaterial.opacity = flashAlpha;
    ringMaterial.color.copy(ringTint);
    ringMaterial.opacity = ringAlpha;

    visibleCount += 1;
  }

  for (let index = visibleCount; index < visuals.length; index += 1) {
    hideImpactBurstVisual(visuals[index]!);
  }
};

const pruneRocketTrailState = (
  trail: RocketTrailState,
  nowSec: number,
  maxSamples: number,
) => {
  while (
    trail.samples.length > 0 &&
    nowSec - trail.samples[0]!.timeSec > ROCKET_TRAIL_DURATION_SEC
  ) {
    trail.samples.shift();
  }

  while (trail.samples.length > maxSamples) {
    trail.samples.shift();
  }
};

const appendRocketTrailSample = (
  trail: RocketTrailState,
  pos: Vec2,
  timeSec: number,
  maxSamples: number,
) => {
  trail.lastSeenSec = timeSec;
  const lastSample = trail.samples[trail.samples.length - 1];

  if (
    lastSample !== undefined &&
    len(sub(pos, lastSample.pos)) < ROCKET_TRAIL_SAMPLE_DISTANCE
  ) {
    lastSample.pos.x = pos.x;
    lastSample.pos.y = pos.y;
    lastSample.timeSec = timeSec;
    pruneRocketTrailState(trail, timeSec, maxSamples);
    return;
  }

  trail.samples.push({
    pos: { x: pos.x, y: pos.y },
    timeSec,
  });
  pruneRocketTrailState(trail, timeSec, maxSamples);
};

const appendRocketTrailInstances = (
  mesh: InstancedMesh,
  trail: RocketTrailState,
  trailScale: Vec2,
  startIndex: number,
  maxInstances: number,
  matrix: Matrix4,
  position: Vector3,
  rotation: Quaternion,
  scale: Vector3,
): number => {
  const segmentCount = trail.samples.length - 1;

  if (segmentCount <= 0 || startIndex >= maxInstances) {
    return startIndex;
  }

  for (
    let sampleIndex = 1;
    sampleIndex < trail.samples.length && startIndex < maxInstances;
    sampleIndex += 1
  ) {
    const previousSample = trail.samples[sampleIndex - 1]!;
    const nextSample = trail.samples[sampleIndex]!;
    const delta = sub(nextSample.pos, previousSample.pos);
    const segmentLength = len(delta);

    if (segmentLength < 0.001) {
      continue;
    }

    const headAlpha = sampleIndex / segmentCount;
    position.set(
      (previousSample.pos.x + nextSample.pos.x) * 0.5,
      (previousSample.pos.y + nextSample.pos.y) * 0.5,
      2.75,
    );
    rotation.setFromAxisAngle(Z_AXIS, Math.atan2(delta.y, delta.x));
    scale.set(
      Math.max(
        segmentLength + trailScale.y * 1.2,
        trailScale.x * lerp(0.26, 0.54, headAlpha),
      ),
      trailScale.y * lerp(0.24, 0.92, headAlpha),
      1,
    );
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(startIndex, matrix);
    startIndex += 1;
  }

  return startIndex;
};

const pruneRocketTrailStates = (
  trailsById: Map<number, RocketTrailState>,
  nowSec: number,
  maxSamples: number,
) => {
  for (const [rocketId, trail] of trailsById) {
    pruneRocketTrailState(trail, nowSec, maxSamples);

    if (
      trail.samples.length < 2 &&
      nowSec - trail.lastSeenSec > ROCKET_TRAIL_DURATION_SEC
    ) {
      trailsById.delete(rocketId);
    }
  }
};

const updateDebrisGeometry = (
  debrisVisual: DebrisVisual,
  debris: readonly CombatSandboxDebris[],
  maxSamples: number,
) => {
  const positionArray = debrisVisual.positionAttribute.array as Float32Array;
  const colorArray = debrisVisual.colorAttribute.array as Float32Array;
  const opacityArray = debrisVisual.opacityAttribute.array as Float32Array;
  const drawCount = Math.min(debris.length, Math.max(0, maxSamples));

  for (let index = 0; index < drawCount; index += 1) {
    const piece = debris[index]!;
    const offset = index * 3;
    const tint = getCachedColor(piece.color);

    positionArray[offset] = piece.pos.x;
    positionArray[offset + 1] = piece.pos.y;
    positionArray[offset + 2] = 0;
    colorArray[offset] = tint.r;
    colorArray[offset + 1] = tint.g;
    colorArray[offset + 2] = tint.b;
    opacityArray[index] = 0.9;
  }

  debrisVisual.geometry.setDrawRange(0, drawCount);
  debrisVisual.positionAttribute.needsUpdate = true;
  debrisVisual.colorAttribute.needsUpdate = true;
  debrisVisual.opacityAttribute.needsUpdate = true;
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

const hideRocketPartMeshRange = (
  meshes: readonly InstancedMesh[],
  fromIndex: number,
  toIndex: number,
  matrix: Matrix4,
  position: Vector3,
  rotation: Quaternion,
  scale: Vector3,
): boolean => {
  let didHide = false;
  for (const mesh of meshes) {
    didHide =
      hideInstancedMeshRange(
        mesh,
        fromIndex,
        toIndex,
        matrix,
        position,
        rotation,
        scale,
      ) || didHide;
  }
  return didHide;
};

const setRocketPartMatrix = ({
  dirX,
  dirY,
  forwardOffset = 0,
  index,
  lateralOffset = 0,
  matrix,
  mesh,
  originX,
  originY,
  position,
  rotation,
  rotationOffset = 0,
  scale,
  scaleX,
  scaleY,
  scaleZ,
  worldAngle,
  z,
}: {
  dirX: number;
  dirY: number;
  forwardOffset?: number;
  index: number;
  lateralOffset?: number;
  matrix: Matrix4;
  mesh: InstancedMesh;
  originX: number;
  originY: number;
  position: Vector3;
  rotation: Quaternion;
  rotationOffset?: number;
  scale: Vector3;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  worldAngle: number;
  z: number;
}) => {
  position.set(
    originX + dirX * forwardOffset - dirY * lateralOffset,
    originY + dirY * forwardOffset + dirX * lateralOffset,
    z,
  );
  rotation.setFromAxisAngle(Z_AXIS, worldAngle + rotationOffset);
  scale.set(scaleX, scaleY, scaleZ);
  matrix.compose(position, rotation, scale);
  mesh.setMatrixAt(index, matrix);
};

const updateDroneVisual = (
  visual: DroneVisual,
  drone: CombatSandboxDrone | null,
  nowSec: number,
  _spriteMaterials: CacheSpriteMaterialMap,
) => {
  visual.group.visible = drone !== null;
  if (drone === null) {
    return;
  }

  const accent = getDroneColor();
  const hullMaterial = visual.hullMesh.material as MeshBasicMaterial;
  const wingMaterial = visual.wingMesh.material as MeshBasicMaterial;
  const glowMaterial = visual.glowMesh.material as MeshBasicMaterial;
  const noseMaterial = visual.noseMesh.material as MeshBasicMaterial;
  const angle =
    len(drone.vel) > 18 ? Math.atan2(drone.vel.y, drone.vel.x) : nowSec * 0.4;

  hullMaterial.color.set(accent);
  wingMaterial.color.set(accent);
  glowMaterial.color.set(accent);
  glowMaterial.opacity = 0.24;
  noseMaterial.color.set("#f4fbff");

  visual.group.position.set(drone.pos.x, drone.pos.y, 4.4);
  visual.group.rotation.z = angle - Math.PI / 2;
  visual.group.scale.set(1, 1, 1);
  visual.glowMesh.scale.set(36, 24, 1);
  visual.hullMesh.scale.set(10, 28, 1);
  visual.wingMesh.position.set(0, -5.5, 0.2);
  visual.wingMesh.scale.set(18, 7, 1);
  visual.noseMesh.position.set(0, 15, 0.34);
  visual.noseMesh.scale.set(4.5, 7.5, 1);
};

const hidePlanetExplosionVisual = (visual: PlanetExplosionVisual) => {
  visual.group.visible = false;
  visual.glowMesh.visible = false;
  visual.coreMesh.visible = false;
  visual.ringMesh.visible = false;
  visual.shockwaveMesh.visible = false;
  visual.glowMaterial.opacity = 0;
  visual.coreMaterial.opacity = 0;
  visual.ringMaterial.opacity = 0;
  visual.shockwaveMaterial.opacity = 0;
  for (const material of visual.chunkMaterials) {
    material.opacity = 0;
  }
  for (const chunk of visual.chunks) {
    chunk.mesh.visible = false;
  }
};

const armPlanetExplosion = ({
  planet,
  startedAtSec,
  visual,
}: {
  planet: Pick<
    CombatSandboxPlanet,
    "archetype" | "color" | "deathReason" | "id" | "pos" | "radius" | "vel"
  >;
  startedAtSec: number;
  visual: PlanetExplosionVisual;
}): PlanetExplosionState => {
  const rng = mulberry32(
    (Math.imul(planet.id + 1, 0x9e3779b1) ^ Math.round(startedAtSec * 1000)) >>>
      0,
  );
  const renderRadius = getRenderedPlanetRadius(planet);
  const durationSec =
    planet.deathReason === "planetCollision"
      ? PLANET_EXPLOSION_DURATION_SEC + 0.22
      : planet.deathReason === "sunCollision"
        ? PLANET_EXPLOSION_DURATION_SEC + 0.12
        : PLANET_EXPLOSION_DURATION_SEC;
  const scatterScale =
    planet.deathReason === "planetCollision"
      ? 1.62
      : planet.deathReason === "sunCollision"
        ? 1.48
        : 1.34;
  const shockwaveScale =
    planet.deathReason === "planetCollision"
      ? 6.8
      : planet.deathReason === "sunCollision"
        ? 6.2
        : 5.6;
  visual.glowMaterial.color.copy(
    getTintedColor(planet.color, -0.04, 0.12, 0.22),
  );
  visual.ringMaterial.color.copy(
    getTintedColor(planet.color, 0.02, 0.16, 0.28),
  );
  visual.shockwaveMaterial.color.copy(
    getTintedColor(planet.color, -0.08, 0.06, 0.38),
  );
  visual.coreMaterial.color.copy(
    new Color("#fff7de").lerp(new Color(planet.color), 0.24),
  );
  visual.chunkMaterials[0].color.copy(
    getTintedColor(planet.color, -0.02, -0.26, -0.14),
  );
  visual.chunkMaterials[1].color.copy(
    getTintedColor(planet.color, 0.01, -0.08, 0.02),
  );
  visual.group.position.set(planet.pos.x, planet.pos.y, 0);
  visual.group.visible = true;
  for (const material of visual.chunkMaterials) {
    material.opacity = 0;
  }
  for (const chunk of visual.chunks) {
    const angle = rng() * Math.PI * 2;
    chunk.direction.x = Math.cos(angle);
    chunk.direction.y = Math.sin(angle);
    chunk.tangent.x = -chunk.direction.y;
    chunk.tangent.y = chunk.direction.x;
    chunk.driftDistance = 0.78 + rng() * 1.18;
    chunk.lateralAmplitude = 0.08 + rng() * 0.22;
    chunk.lift = 0.18 + rng() * 0.82;
    chunk.radialOffset = 0.18 + rng() * 0.24;
    chunk.baseScale.set(
      renderRadius * (0.13 + rng() * 0.12),
      renderRadius * (0.11 + rng() * 0.16),
      renderRadius * (0.1 + rng() * 0.18),
    );
    chunk.rotationPhase.set(
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
    );
    chunk.rotationSpeed.set(
      (rng() - 0.5) * 9,
      (rng() - 0.5) * 9,
      (rng() - 0.5) * 9,
    );
    chunk.mesh.position.set(
      chunk.direction.x * renderRadius * 0.28,
      chunk.direction.y * renderRadius * 0.28,
      0.14,
    );
    chunk.mesh.visible = false;
    chunk.mesh.scale.copy(chunk.baseScale);
    chunk.mesh.rotation.set(
      chunk.rotationPhase.x,
      chunk.rotationPhase.y,
      chunk.rotationPhase.z,
    );
  }

  return {
    durationSec,
    origin: { x: planet.pos.x, y: planet.pos.y },
    radius: renderRadius,
    scatterScale,
    shockwaveScale,
    startedAtSec,
    velocity: { x: planet.vel.x, y: planet.vel.y },
    visual,
  };
};

const updatePlanetExplosion = (
  explosion: PlanetExplosionState,
  elapsedSec: number,
): boolean => {
  const ageSec = elapsedSec - explosion.startedAtSec;
  if (ageSec < 0) {
    explosion.visual.group.visible = false;
    return true;
  }

  if (ageSec > explosion.durationSec) {
    return false;
  }

  const progress = clamp(ageSec / explosion.durationSec, 0, 1);
  const flashProgress = clamp(
    ageSec / PLANET_EXPLOSION_FLASH_DURATION_SEC,
    0,
    1,
  );
  const ringProgress = clamp(ageSec / PLANET_EXPLOSION_RING_DURATION_SEC, 0, 1);
  const fade = (1 - progress) ** 1.28;
  const burst = progress ** 0.74;
  const driftX = explosion.velocity.x * ageSec * 0.42;
  const driftY = explosion.velocity.y * ageSec * 0.42;
  const radius = explosion.radius;
  const glowAlpha = fade * (0.34 + (1 - progress) * 0.42);
  const coreAlpha = (1 - flashProgress) ** 2.45 * 0.98;
  const ringAlpha = (1 - ringProgress) ** 1.72 * 0.44;
  const shockwaveAlpha = (1 - ringProgress) ** 2.1 * 0.3;

  explosion.visual.group.visible = true;
  explosion.visual.group.position.set(
    explosion.origin.x + driftX,
    explosion.origin.y + driftY,
    0,
  );

  explosion.visual.glowMesh.visible = glowAlpha > 0.01;
  explosion.visual.coreMesh.visible = coreAlpha > 0.01;
  explosion.visual.ringMesh.visible = ringAlpha > 0.01;
  explosion.visual.shockwaveMesh.visible = shockwaveAlpha > 0.01;

  explosion.visual.glowMesh.scale.set(
    radius * (1.08 + progress * 3.2),
    radius * (1.08 + progress * 3.2),
    1,
  );
  explosion.visual.coreMesh.scale.set(
    radius * (0.74 + flashProgress * 2.15),
    radius * (0.74 + flashProgress * 2.15),
    1,
  );
  explosion.visual.ringMesh.scale.set(
    radius * (0.92 + ringProgress * 4.3),
    radius * (0.92 + ringProgress * 4.3),
    1,
  );
  explosion.visual.shockwaveMesh.scale.set(
    radius * (1.14 + ringProgress * explosion.shockwaveScale),
    radius * (1.14 + ringProgress * explosion.shockwaveScale),
    1,
  );

  explosion.visual.glowMaterial.opacity = glowAlpha;
  explosion.visual.coreMaterial.opacity = coreAlpha;
  explosion.visual.ringMaterial.opacity = ringAlpha;
  explosion.visual.shockwaveMaterial.opacity = shockwaveAlpha;

  const chunkOpacity = clamp(fade * 1.18, 0, 1);
  for (const material of explosion.visual.chunkMaterials) {
    material.opacity = chunkOpacity;
  }
  for (const chunk of explosion.visual.chunks) {
    const radialDistance =
      radius *
      (chunk.radialOffset +
        chunk.driftDistance * explosion.scatterScale * burst);
    const lateralDistance =
      radius *
      chunk.lateralAmplitude *
      Math.sin(
        progress * Math.PI * (1.1 + chunk.lift * 0.24) + chunk.rotationPhase.z,
      ) *
      (0.22 + fade * 0.78);

    chunk.mesh.visible = chunkOpacity > 0.02;
    chunk.mesh.position.set(
      chunk.direction.x * radialDistance + chunk.tangent.x * lateralDistance,
      chunk.direction.y * radialDistance + chunk.tangent.y * lateralDistance,
      0.16 + chunk.lift * radius * burst * 0.045,
    );
    chunk.mesh.rotation.set(
      chunk.rotationPhase.x + progress * chunk.rotationSpeed.x,
      chunk.rotationPhase.y + progress * chunk.rotationSpeed.y,
      chunk.rotationPhase.z + progress * chunk.rotationSpeed.z,
    );
    chunk.mesh.scale.set(
      chunk.baseScale.x * (0.92 + fade * 0.12),
      chunk.baseScale.y * (0.92 + fade * 0.12),
      chunk.baseScale.z * (0.92 + fade * 0.12),
    );
  }

  return true;
};

const releasePlanetExplosion = (
  availableVisuals: PlanetExplosionVisual[],
  explosion: PlanetExplosionState,
) => {
  hidePlanetExplosionVisual(explosion.visual);
  availableVisuals.push(explosion.visual);
};

export const clearLocalViewportPlanetExplosions = ({
  activePlanetExplosions,
  inactivePlanetExplosionVisuals,
}: {
  activePlanetExplosions: PlanetExplosionState[];
  inactivePlanetExplosionVisuals: PlanetExplosionVisual[];
}) => {
  while (activePlanetExplosions.length > 0) {
    releasePlanetExplosion(
      inactivePlanetExplosionVisuals,
      activePlanetExplosions.pop()!,
    );
  }
};

export const queueLocalViewportPlanetExplosion = ({
  activePlanetExplosions,
  inactivePlanetExplosionVisuals,
  planet,
  startedAtSec,
}: {
  activePlanetExplosions: PlanetExplosionState[];
  inactivePlanetExplosionVisuals: PlanetExplosionVisual[];
  planet: Pick<
    CombatSandboxPlanet,
    "archetype" | "color" | "deathReason" | "id" | "pos" | "radius" | "vel"
  >;
  startedAtSec: number;
}) => {
  if (
    inactivePlanetExplosionVisuals.length === 0 &&
    activePlanetExplosions.length > 0
  ) {
    releasePlanetExplosion(
      inactivePlanetExplosionVisuals,
      activePlanetExplosions.shift()!,
    );
  }

  const explosionVisual = inactivePlanetExplosionVisuals.pop() ?? null;
  if (explosionVisual === null) {
    return;
  }

  activePlanetExplosions.push(
    armPlanetExplosion({
      planet,
      startedAtSec,
      visual: explosionVisual,
    }),
  );
};

export const resetLocalViewportSceneState = ({
  activeBoostBursts,
  boostBurstVisual,
  cacheVisuals,
  debrisVisual,
  disposeCacheVisual,
  droneVisual,
  foresightVisuals,
  hiddenRocketMatrix,
  hiddenRocketPosition,
  hiddenRocketRotation,
  hiddenRocketScale,
  hiddenTrailUntilByPlanetId,
  hostScene,
  impactBurstVisuals,
  maxLaunchBurstInstances,
  renderPlanetsById,
  rocketLaunchBurstPools,
  rocketPools,
  rocketTrailStates,
  shieldGroup,
  trailVisuals,
  weaponKinds,
  currentState,
}: {
  activeBoostBursts: BoostBurstState[];
  boostBurstVisual: BoostBurstVisual;
  cacheVisuals: Map<number, CacheVisual>;
  currentState: CombatSandboxState;
  debrisVisual: DebrisVisual;
  disposeCacheVisual: (visual: CacheVisual) => void;
  droneVisual: DroneVisual;
  foresightVisuals: ReadonlyMap<number, ForesightVisual>;
  hiddenRocketMatrix: Matrix4;
  hiddenRocketPosition: Vector3;
  hiddenRocketRotation: Quaternion;
  hiddenRocketScale: Vector3;
  hiddenTrailUntilByPlanetId: Map<number, number>;
  hostScene: { remove: (object: Group) => void };
  impactBurstVisuals: readonly ImpactBurstVisual[];
  maxLaunchBurstInstances: Record<RocketKind, number>;
  renderPlanetsById: ReadonlyMap<number, CombatSandboxPlanet>;
  rocketLaunchBurstPools: Record<RocketKind, RocketLaunchBurstPoolVisual>;
  rocketPools: Record<RocketKind, RocketPoolVisual>;
  rocketTrailStates: Map<number, RocketTrailState>;
  shieldGroup: Group;
  trailVisuals: readonly TrailVisual[];
  weaponKinds: readonly RocketKind[];
}) => {
  hiddenTrailUntilByPlanetId.clear();
  for (const planet of currentState.planets) {
    hiddenTrailUntilByPlanetId.set(planet.id, planet.hideTrailUntilTick);
  }

  rocketTrailStates.clear();
  for (const trail of trailVisuals) {
    trail.samples.length = 0;
    trail.geometry.setDrawRange(0, 0);
    trail.positionAttribute.needsUpdate = true;
    trail.opacityAttribute.needsUpdate = true;
  }

  const flushRocketPool = (
    pool: RocketPoolVisual,
    capacity: number,
    fromIndex = 0,
  ) => {
    const didHide = hideRocketPartMeshRange(
      pool.partMeshList,
      fromIndex,
      capacity,
      hiddenRocketMatrix,
      hiddenRocketPosition,
      hiddenRocketRotation,
      hiddenRocketScale,
    );
    const didHideTrail = hideInstancedMeshRange(
      pool.trailMesh,
      fromIndex,
      pool.trailCapacity,
      hiddenRocketMatrix,
      hiddenRocketPosition,
      hiddenRocketRotation,
      hiddenRocketScale,
    );
    const didHideFlame = hideInstancedMeshRange(
      pool.flameMesh,
      fromIndex,
      capacity,
      hiddenRocketMatrix,
      hiddenRocketPosition,
      hiddenRocketRotation,
      hiddenRocketScale,
    );
    pool.trailMesh.count = 0;
    pool.trailMesh.visible = false;
    pool.flameMesh.count = 0;
    pool.flameMesh.visible = false;
    pool.activeCount = 0;
    pool.trailActiveCount = 0;
    if (didHide) {
      for (const mesh of pool.partMeshList) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (didHideTrail) {
      pool.trailMesh.instanceMatrix.needsUpdate = true;
    }
    if (didHideFlame) {
      pool.flameMesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of pool.partMeshList) {
      mesh.count = 0;
      mesh.visible = false;
    }
  };

  const flushRocketLaunchBurstPool = (
    pool: RocketLaunchBurstPoolVisual,
    capacity: number,
    fromIndex = 0,
  ) => {
    const didHide = hideInstancedMeshRange(
      pool.mesh,
      fromIndex,
      capacity,
      hiddenRocketMatrix,
      hiddenRocketPosition,
      hiddenRocketRotation,
      hiddenRocketScale,
    );
    pool.mesh.count = 0;
    pool.mesh.visible = false;
    pool.activeCount = 0;
    if (didHide) {
      pool.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  for (const rocketKind of weaponKinds) {
    flushRocketPool(
      rocketPools[rocketKind],
      ROCKET_RENDER_INSTANCE_LIMITS[rocketKind],
    );
    flushRocketLaunchBurstPool(
      rocketLaunchBurstPools[rocketKind],
      maxLaunchBurstInstances[rocketKind],
    );
  }

  updateDebrisGeometry(debrisVisual, [], 0);
  debrisVisual.points.visible = false;
  const foresightPathTuning = getForesightPathTuning();
  for (const visual of foresightVisuals.values()) {
    updateForesightVisual(visual, [], foresightPathTuning);
  }
  activeBoostBursts.length = 0;
  updateBoostBurstVisual(
    boostBurstVisual,
    activeBoostBursts,
    renderPlanetsById,
    0,
    currentState.elapsedSec,
  );
  updateImpactBurstVisuals(
    impactBurstVisuals,
    [],
    renderPlanetsById,
    currentState.elapsedSec,
    0,
  );
  shieldGroup.visible = false;
  droneVisual.group.visible = false;
  for (const visual of cacheVisuals.values()) {
    hostScene.remove(visual.group);
    disposeCacheVisual(visual);
  }
  cacheVisuals.clear();
};

interface UpdateLocalViewportSceneParams {
  activeBoostBursts: BoostBurstState[];
  activeCacheIds: Set<number>;
  activeDrone: CombatSandboxDrone | null;
  activePlanetExplosions: PlanetExplosionState[];
  activeRocketTrailIds: Set<number>;
  blackHoleGroup: Group;
  blackHoleRing: Mesh;
  boostBurstParticlesPerBurst: number;
  boostBurstVisual: BoostBurstVisual;
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
  droneVisual: DroneVisual;
  foresightPathsByEntityId: ReadonlyMap<number, readonly Vec2[]>;
  foresightVisuals: ReadonlyMap<number, ForesightVisual>;
  getCacheIconKey: (contents: CombatSandboxCache["contents"]) => CacheIconKey;
  hiddenRocketMatrix: Matrix4;
  hiddenRocketPosition: Vector3;
  hiddenRocketRotation: Quaternion;
  hiddenRocketScale: Vector3;
  hostElement: HTMLDivElement;
  impactBurstVisuals: readonly ImpactBurstVisual[];
  inactivePlanetExplosionVisuals: PlanetExplosionVisual[];
  inputState: {
    aimWorld: Vec2;
    selectedRocketKind: RocketKind;
  };
  launchBurstsByKind: Record<RocketKind, CombatSandboxRocketLaunchBurst[]>;
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
  shieldArcMaterial: MeshBasicMaterial;
  shieldGlowMaterial: MeshBasicMaterial;
  shieldGroup: Group;
  backgroundLayers: readonly StarfieldLayerVisual[];
  sunVisuals: readonly SunVisual[];
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
  activeBoostBursts,
  activeCacheIds,
  activeDrone,
  activePlanetExplosions,
  activeRocketTrailIds,
  blackHoleGroup,
  blackHoleRing,
  boostBurstParticlesPerBurst,
  boostBurstVisual,
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
  droneVisual,
  foresightPathsByEntityId,
  foresightVisuals,
  getCacheIconKey,
  hiddenRocketMatrix,
  hiddenRocketPosition,
  hiddenRocketRotation,
  hiddenRocketScale,
  hostElement,
  impactBurstVisuals,
  inactivePlanetExplosionVisuals,
  inputState,
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
  shieldArcMaterial,
  shieldGlowMaterial,
  shieldGroup,
  backgroundLayers,
  sunVisuals,
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

  for (let index = 0; index < sunVisuals.length; index += 1) {
    const visual = sunVisuals[index]!;
    const sun = renderState.suns[index]!;
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
    visual.coreMesh.scale.set(
      sun.radius * swallowScale,
      sun.radius * swallowScale,
      sun.radius * swallowScale,
    );
    visual.glowMesh.scale.set(
      sun.radius * getSunGlowScale() * swallowScale,
      sun.radius * getSunGlowScale() * swallowScale,
      sun.radius * getSunGlowScale() * swallowScale,
    );
    visual.warpMesh.scale.set(
      sun.radius * getSunWarpScale() * swallowScale,
      sun.radius * getSunWarpScale() * swallowScale,
      1,
    );
    visual.coreMesh.rotation.x = 0.38;
    visual.coreMesh.rotation.y = nowSec * visual.rotationSpeed;
    visual.glowMesh.rotation.z = nowSec * (0.05 + index * 0.02);
  }

  for (let index = 0; index < planetVisuals.length; index += 1) {
    const visual = planetVisuals[index]!;
    const trail = trailVisuals[index]!;
    const planet = renderState.planets[index]!;
    const planetVisualTuning = getPlanetArchetypeVisuals(planet.archetype);
    const auraRingStops = getPlanetAuraRingStops(
      planetVisualTuning.auraScale,
      planetVisualTuning.auraGap,
    );

    visual.mesh.visible = planet.alive;
    visual.glowMesh.visible = planet.alive;
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
  }

  activeCacheIds.clear();
  for (const cache of renderState.caches) {
    activeCacheIds.add(cache.id);
    let visual = cacheVisuals.get(cache.id);
    if (visual === undefined) {
      visual = createCacheVisual(cache, cacheSpriteAssets.badgeMaterials);
      cacheVisuals.set(cache.id, visual);
      scene.add(visual.group);
    }

    const key = getCacheIconKey(cache.contents);
    renderedCacheKeysById.set(cache.id, key);
    updateCacheVisualBadge(visual, cacheSpriteAssets.badgeMaterials, key);
    visual.group.position.set(
      cache.pos.x,
      cache.pos.y + Math.sin(nowSec * 1.8 + visual.bobPhase) * 6,
      3.5,
    );
    visual.group.rotation.z =
      Math.sin(nowSec * visual.wobbleRate + visual.bobPhase) * 0.08;
    const pulse =
      1 + Math.sin(nowSec * visual.pulseRate + visual.bobPhase) * 0.04;
    const badgeSize = getCacheBadgeBaseSize() * cacheBadgeScale * pulse;
    visual.badgeSprite.scale.set(badgeSize, badgeSize, 1);
  }

  for (const [cacheId, visual] of cacheVisuals) {
    if (!activeCacheIds.has(cacheId)) {
      scene.remove(visual.group);
      disposeCacheVisual(visual);
      cacheVisuals.delete(cacheId);
      renderedCacheKeysById.delete(cacheId);
    }
  }

  updateDroneVisual(
    droneVisual,
    activeDrone,
    nowSec,
    cacheSpriteAssets.iconMaterials,
  );

  for (const rocketKind of weaponKinds) {
    rocketsByKind[rocketKind].length = 0;
    launchBurstsByKind[rocketKind].length = 0;
  }
  if (renderQuality.rocketTrailBudget > 0) {
    pruneRocketTrailStates(rocketTrailStates, nowSec, maxRocketTrailSamples);
  } else if (rocketTrailStates.size > 0) {
    rocketTrailStates.clear();
  }
  for (const rocket of renderState.rockets) {
    rocketsByKind[rocket.rocketKind].push(rocket);
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

  for (const rocketKind of weaponKinds) {
    const pool = rocketPools[rocketKind];
    const launchBurstPool = rocketLaunchBurstPools[rocketKind];
    const rockets = rocketsByKind[rocketKind];
    const launchBursts = launchBurstsByKind[rocketKind];
    const silhouette = pool.silhouette;
    const renderBodyScale = getMinScreenAxisScale(
      pool.scale,
      ROCKET_MIN_SCREEN_WIDTH_PX.body,
      worldUnitsPerPixel,
    );
    const renderFlameScale = getMinScreenAxisScale(
      pool.flameScale,
      ROCKET_MIN_SCREEN_WIDTH_PX.flame,
      worldUnitsPerPixel,
    );
    const renderTrailScale = getMinScreenAxisScale(
      pool.trailScale,
      ROCKET_MIN_SCREEN_WIDTH_PX.trail,
      worldUnitsPerPixel,
    );
    const renderLaunchScale = getMinScreenAxisScale(
      launchBurstPool.scale,
      ROCKET_MIN_SCREEN_WIDTH_PX.launchBurst,
      worldUnitsPerPixel,
    );
    const previousCount = pool.activeCount;
    const previousTrailCount = pool.trailActiveCount;
    const previousLaunchBurstCount = launchBurstPool.activeCount;
    const trailCapacity = getBudgetedCount(
      pool.trailCapacity,
      renderQuality.rocketTrailBudget,
    );
    const launchBurstCapacity = getBudgetedCount(
      maxLaunchBurstInstances[rocketKind],
      renderQuality.launchBurstBudget,
    );
    let count = 0;
    activeRocketTrailIds.clear();

    for (const rocket of rockets) {
      if (count >= ROCKET_RENDER_INSTANCE_LIMITS[rocketKind]) {
        break;
      }

      const angle = Math.atan2(rocket.vel.y, rocket.vel.x);
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const ownerIsLocalPlayer = rocket.ownerId === renderState.player.playerId;
      const seekerPulse =
        rocketKind === "seeker"
          ? 1 + Math.sin(nowSec * 10 + count * 0.7) * 0.18
          : 1;
      const flicker = 0.82 + Math.sin(nowSec * 38 + count * 1.37) * 0.16;
      const rocketMuzzleDistance = getCannonMuzzleDistanceFromLayout(
        rocket.launchPlanetRadius *
          getPlanetBodyScaleForArchetype(rocket.launchPlanetArchetype),
        cannonLayout,
      );
      const rocketVisibleDistance = getRocketVisibleDistanceThreshold(
        rocketMuzzleDistance,
        renderBodyScale.x,
      );
      const rocketTravelDistance = Math.hypot(
        rocket.pos.x - rocket.launchPlanetPos.x,
        rocket.pos.y - rocket.launchPlanetPos.y,
      );
      if (ownerIsLocalPlayer && rocketTravelDistance < rocketVisibleDistance) {
        const rocketSpawnDistance =
          rocket.launchPlanetRadius + rocket.radius + 10;
        const hiddenTravelProgress = clamp(
          (rocketTravelDistance - rocketSpawnDistance) /
            Math.max(rocketVisibleDistance - rocketSpawnDistance, 0.001),
          0,
          1,
        );
        const muzzleOrigin = getCannonMuzzleOrigin(
          rocket.launchPlanetPos,
          { x: dirX, y: dirY },
          rocketMuzzleDistance,
        );
        const visibleTravel =
          hiddenTravelProgress *
          Math.max(0, rocketVisibleDistance - rocketMuzzleDistance);
        rocketPosition.set(
          muzzleOrigin.x + dirX * visibleTravel,
          muzzleOrigin.y + dirY * visibleTravel,
          0,
        );
      } else {
        rocketPosition.set(rocket.pos.x, rocket.pos.y, 0);
      }
      const renderRocketX = rocketPosition.x;
      const renderRocketY = rocketPosition.y;

      const bodyWidth = renderBodyScale.y * seekerPulse;
      const bodyDepth = renderBodyScale.y;
      const trailOffset = renderBodyScale.x * silhouette.trailOffset;
      const flameOffset = renderBodyScale.x * silhouette.flameOffset;

      if (trailCapacity > 0) {
        const trailAnchor = {
          x: renderRocketX - dirX * trailOffset,
          y: renderRocketY - dirY * trailOffset,
        } satisfies Vec2;
        let trailState = rocketTrailStates.get(rocket.id);
        if (trailState === undefined) {
          trailState = {
            lastSeenSec: nowSec,
            rocketKind,
            samples: [],
          };
          rocketTrailStates.set(rocket.id, trailState);
        }
        appendRocketTrailSample(
          trailState,
          trailAnchor,
          nowSec,
          maxRocketTrailSamples,
        );
        activeRocketTrailIds.add(rocket.id);
      }

      const finYOffset = bodyWidth * 0.72;
      const canardYOffset = bodyWidth * 0.52;
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: -renderBodyScale.x * 0.02,
        index: count,
        matrix: rocketMatrix,
        mesh: pool.parts.body,
        originX: renderRocketX,
        originY: renderRocketY,
        position: rocketPosition,
        rotation: rocketRotation,
        scale: rocketScale,
        scaleX: renderBodyScale.x * silhouette.bodyLength,
        scaleY: bodyWidth * silhouette.bodyRadius,
        scaleZ: bodyDepth * silhouette.bodyRadius,
        worldAngle: angle,
        z: 3,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: renderBodyScale.x * 0.42,
        index: count,
        matrix: rocketMatrix,
        mesh: pool.parts.nose,
        originX: renderRocketX,
        originY: renderRocketY,
        position: rocketPosition,
        rotation: rocketRotation,
        scale: rocketScale,
        scaleX: renderBodyScale.x * silhouette.noseLength,
        scaleY: bodyWidth * silhouette.noseRadius,
        scaleZ: bodyDepth * silhouette.noseRadius,
        worldAngle: angle,
        z: 3.08,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: -renderBodyScale.x * 0.43,
        index: count,
        matrix: rocketMatrix,
        mesh: pool.parts.engine,
        originX: renderRocketX,
        originY: renderRocketY,
        position: rocketPosition,
        rotation: rocketRotation,
        scale: rocketScale,
        scaleX: renderBodyScale.x * 0.1,
        scaleY: bodyWidth * 0.72,
        scaleZ: bodyDepth * 0.72,
        worldAngle: angle,
        z: 2.96,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: renderBodyScale.x * silhouette.sensorX,
        index: count,
        matrix: rocketMatrix,
        mesh: pool.parts.sensor,
        originX: renderRocketX,
        originY: renderRocketY,
        position: rocketPosition,
        rotation: rocketRotation,
        scale: rocketScale,
        scaleX: bodyWidth * silhouette.sensorScale,
        scaleY: bodyWidth * silhouette.sensorScale,
        scaleZ: bodyDepth * silhouette.sensorScale,
        worldAngle: angle,
        z: 3.04,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: -renderBodyScale.x * silhouette.finX,
        index: count,
        lateralOffset: finYOffset,
        matrix: rocketMatrix,
        mesh: pool.parts.rearFinTop,
        originX: renderRocketX,
        originY: renderRocketY,
        position: rocketPosition,
        rotation: rocketRotation,
        rotationOffset: -silhouette.finAngle,
        scale: rocketScale,
        scaleX: renderBodyScale.x * silhouette.finLength,
        scaleY: bodyWidth * silhouette.finHeight,
        scaleZ: bodyDepth * 0.24,
        worldAngle: angle,
        z: 2.92,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: -renderBodyScale.x * silhouette.finX,
        index: count,
        lateralOffset: -finYOffset,
        matrix: rocketMatrix,
        mesh: pool.parts.rearFinBottom,
        originX: renderRocketX,
        originY: renderRocketY,
        position: rocketPosition,
        rotation: rocketRotation,
        rotationOffset: silhouette.finAngle,
        scale: rocketScale,
        scaleX: renderBodyScale.x * silhouette.finLength,
        scaleY: bodyWidth * silhouette.finHeight,
        scaleZ: bodyDepth * 0.24,
        worldAngle: angle,
        z: 2.92,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: renderBodyScale.x * silhouette.canardX,
        index: count,
        lateralOffset: canardYOffset,
        matrix: rocketMatrix,
        mesh: pool.parts.canardTop,
        originX: renderRocketX,
        originY: renderRocketY,
        position: rocketPosition,
        rotation: rocketRotation,
        rotationOffset: -silhouette.canardAngle,
        scale: rocketScale,
        scaleX: renderBodyScale.x * silhouette.canardLength,
        scaleY: bodyWidth * silhouette.canardHeight,
        scaleZ: bodyDepth * 0.18,
        worldAngle: angle,
        z: 2.94,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: renderBodyScale.x * silhouette.canardX,
        index: count,
        lateralOffset: -canardYOffset,
        matrix: rocketMatrix,
        mesh: pool.parts.canardBottom,
        originX: renderRocketX,
        originY: renderRocketY,
        position: rocketPosition,
        rotation: rocketRotation,
        rotationOffset: silhouette.canardAngle,
        scale: rocketScale,
        scaleX: renderBodyScale.x * silhouette.canardLength,
        scaleY: bodyWidth * silhouette.canardHeight,
        scaleZ: bodyDepth * 0.18,
        worldAngle: angle,
        z: 2.94,
      });

      rocketPosition.set(
        renderRocketX - dirX * flameOffset,
        renderRocketY - dirY * flameOffset,
        2.9,
      );
      rocketRotation.setFromAxisAngle(Z_AXIS, angle);
      rocketScale.set(
        renderFlameScale.x * flicker,
        renderFlameScale.y * flicker * 0.9,
        1,
      );
      rocketMatrix.compose(rocketPosition, rocketRotation, rocketScale);
      pool.flameMesh.setMatrixAt(count, rocketMatrix);
      count += 1;
    }

    let trailCount = 0;
    if (trailCapacity > 0) {
      for (const rocket of rockets) {
        const trailState = rocketTrailStates.get(rocket.id);
        if (trailState === undefined) {
          continue;
        }

        trailCount = appendRocketTrailInstances(
          pool.trailMesh,
          trailState,
          renderTrailScale,
          trailCount,
          trailCapacity,
          rocketMatrix,
          rocketPosition,
          rocketRotation,
          rocketScale,
        );

        if (trailCount >= trailCapacity) {
          break;
        }
      }

      if (trailCount < trailCapacity) {
        for (const [rocketId, trailState] of rocketTrailStates) {
          if (
            trailState.rocketKind !== rocketKind ||
            activeRocketTrailIds.has(rocketId)
          ) {
            continue;
          }

          trailCount = appendRocketTrailInstances(
            pool.trailMesh,
            trailState,
            renderTrailScale,
            trailCount,
            trailCapacity,
            rocketMatrix,
            rocketPosition,
            rocketRotation,
            rocketScale,
          );

          if (trailCount >= trailCapacity) {
            break;
          }
        }
      }
    }

    const clearedTail = hideRocketPartMeshRange(
      pool.partMeshList,
      count,
      previousCount,
      hiddenRocketMatrix,
      hiddenRocketPosition,
      hiddenRocketRotation,
      hiddenRocketScale,
    );
    const clearedTrailTail = hideInstancedMeshRange(
      pool.trailMesh,
      trailCount,
      previousTrailCount,
      hiddenRocketMatrix,
      hiddenRocketPosition,
      hiddenRocketRotation,
      hiddenRocketScale,
    );
    const clearedFlameTail = hideInstancedMeshRange(
      pool.flameMesh,
      count,
      previousCount,
      hiddenRocketMatrix,
      hiddenRocketPosition,
      hiddenRocketRotation,
      hiddenRocketScale,
    );
    pool.activeCount = count;
    pool.trailActiveCount = trailCount;
    pool.trailMesh.count = trailCount;
    pool.trailMesh.visible = trailCount > 0;
    pool.flameMesh.count = count;
    pool.flameMesh.visible = count > 0;
    for (const mesh of pool.partMeshList) {
      mesh.count = count;
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = count > 0 || clearedTail;
    }
    pool.trailMesh.instanceMatrix.needsUpdate =
      trailCount > 0 || clearedTrailTail;
    pool.flameMesh.instanceMatrix.needsUpdate = count > 0 || clearedFlameTail;

    let launchBurstCount = 0;
    for (const burst of launchBursts) {
      if (burst.ownerId === renderState.player.playerId) {
        continue;
      }

      const burstMuzzleDistance = getCannonMuzzleDistanceFromLayout(
        burst.launchPlanetRadius *
          getPlanetBodyScaleForArchetype(burst.launchPlanetArchetype),
        cannonLayout,
      );
      const burstVisibleDistance = getRocketVisibleDistanceThreshold(
        burstMuzzleDistance,
        renderBodyScale.x,
      );
      const spawnDistance = Math.hypot(
        burst.origin.x - burst.launchPlanetPos.x,
        burst.origin.y - burst.launchPlanetPos.y,
      );
      const durationSec = Math.max(
        FIXED_STEP_SEC,
        getLaunchBurstHandoffDuration(
          spawnDistance,
          burstVisibleDistance,
          burst.speed,
        ),
      );
      const ageSec = renderElapsedSec - burst.startedAtSec;
      if (ageSec < 0 || ageSec > durationSec) {
        continue;
      }

      const progress = clamp(ageSec / durationSec, 0, 1);
      const length = renderLaunchScale.x * (1.1 - progress * 0.16);
      const width = renderLaunchScale.y * (0.96 - progress * 0.34);
      const travel = getLaunchBurstTravelDistance(ageSec, burst.speed);
      const angle = Math.atan2(burst.dir.y, burst.dir.x);
      const origin =
        burst.ownerId === renderState.player.playerId
          ? getCannonMuzzleOrigin(
              burst.launchPlanetPos,
              burst.dir,
              burstMuzzleDistance,
            )
          : burst.origin;
      rocketPosition.set(
        origin.x + burst.dir.x * (travel + length * 0.5),
        origin.y + burst.dir.y * (travel + length * 0.5),
        6.25,
      );
      rocketRotation.setFromAxisAngle(Z_AXIS, angle);
      rocketScale.set(length, width, 1);
      rocketMatrix.compose(rocketPosition, rocketRotation, rocketScale);
      launchBurstPool.mesh.setMatrixAt(launchBurstCount, rocketMatrix);
      launchBurstCount += 1;

      if (launchBurstCount >= launchBurstCapacity) {
        break;
      }
    }

    const clearedLaunchBurstTail = hideInstancedMeshRange(
      launchBurstPool.mesh,
      launchBurstCount,
      previousLaunchBurstCount,
      hiddenRocketMatrix,
      hiddenRocketPosition,
      hiddenRocketRotation,
      hiddenRocketScale,
    );
    launchBurstPool.activeCount = launchBurstCount;
    launchBurstPool.mesh.count = launchBurstCount;
    launchBurstPool.mesh.visible = launchBurstCount > 0;
    launchBurstPool.mesh.instanceMatrix.needsUpdate =
      launchBurstCount > 0 || clearedLaunchBurstTail;
  }

  updateDebrisGeometry(debrisVisual, renderState.debris, maxDebrisSamples);
  debrisVisual.points.visible =
    maxDebrisSamples > 0 && renderState.debris.length > 0;
  while (
    activeBoostBursts.length > 0 &&
    nowSec - activeBoostBursts[0]!.startedAtSec > BOOST_BURST_DURATION_SEC
  ) {
    activeBoostBursts.shift();
  }
  const foresightPathTuning = getForesightPathTuning();
  for (const [entityId, visual] of foresightVisuals) {
    const bodySurface = getForesightBodySurface(entityId, renderState);
    const visiblePath =
      bodySurface === null
        ? (foresightPathsByEntityId.get(entityId) ?? [])
        : clipForesightPathAtDistance(
            foresightPathsByEntityId.get(entityId) ?? [],
            bodySurface.hiddenRadius + foresightPathTuning.leadGap,
          );
    updateForesightVisual(visual, visiblePath, foresightPathTuning);
  }
  updateBoostBurstVisual(
    boostBurstVisual,
    activeBoostBursts,
    renderPlanetsById,
    boostBurstParticlesPerBurst,
    nowSec,
  );
  updateImpactBurstVisuals(
    impactBurstVisuals,
    renderState.impactBursts,
    renderPlanetsById,
    renderState.elapsedSec,
    maxVisibleImpactBursts,
  );
  for (let index = activePlanetExplosions.length - 1; index >= 0; index -= 1) {
    const explosion = activePlanetExplosions[index]!;
    if (!updatePlanetExplosion(explosion, renderState.elapsedSec)) {
      releasePlanetExplosion(inactivePlanetExplosionVisuals, explosion);
      activePlanetExplosions.splice(index, 1);
    }
  }

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
    playerPlanet !== null &&
    playerPlanet.alive;
  shieldGroup.visible = shieldActive;
  if (shieldActive && playerPlanet !== null) {
    const shieldAngle = Math.atan2(
      renderState.player.shieldAimDir.y,
      renderState.player.shieldAimDir.x,
    );
    const pulse = 1 + Math.sin(nowSec * 8.2) * 0.035;
    const shieldRadius = getRenderedPlanetRadius(playerPlanet);
    const shieldHitReact = getShieldHitReact({
      bursts: renderState.impactBursts,
      elapsedSec: renderState.elapsedSec,
      planetId: playerPlanet.id,
      shieldRadius,
    });
    shieldGroup.position.set(
      playerPlanet.pos.x + shieldHitReact.offset.x,
      playerPlanet.pos.y + shieldHitReact.offset.y,
      0,
    );
    shieldGroup.scale.set(
      shieldRadius * pulse * shieldHitReact.scale,
      shieldRadius * pulse * shieldHitReact.scale,
      1,
    );
    shieldGroup.rotation.z = shieldAngle + shieldHitReact.rotation;
    shieldGlowMaterial.opacity = clamp(
      0.08 +
        shieldLoadRatio * 0.16 +
        Math.sin(nowSec * 9.4) * 0.04 +
        shieldHitReact.glowBoost,
      0,
      1,
    );
    shieldArcMaterial.opacity = clamp(
      0.18 +
        shieldLoadRatio * 0.36 +
        Math.sin(nowSec * 7.6) * 0.05 +
        shieldHitReact.arcBoost,
      0,
      1,
    );
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
      renderState.player.controlMode === "drone"
        ? getDroneColor()
        : getWeaponColors()[inputState.selectedRocketKind].accent;
    const aimSurfaceOffset =
      controlledBody.kind === "planet"
        ? getRenderedPlanetRadius(controlledBody)
        : controlledBody.radius;

    const stemStart = aimSurfaceOffset;
    const breechStart = stemStart + cannonLayout.stemLenWorld;
    const barrelStart = breechStart + cannonLayout.breechLenWorld;
    const barrelEnd = barrelStart + cannonLayout.barrelLenWorld;

    cannonGroup.visible = true;
    cannonGroup.position.set(controlledBody.pos.x, controlledBody.pos.y, 6);
    cannonGroup.rotation.z = aimAngle;
    cannonAccentTint.value.set(weaponAccent);
    cannonStemMesh.position.set(
      stemStart + cannonLayout.stemLenWorld * 0.5,
      0,
      0,
    );
    cannonStemMesh.scale.set(
      cannonLayout.stemLenWorld,
      cannonLayout.stemRadiusWorld,
      cannonLayout.stemRadiusWorld,
    );
    cannonBreechMesh.position.set(
      breechStart + cannonLayout.breechLenWorld * 0.5,
      0,
      0,
    );
    cannonBreechMesh.scale.set(
      cannonLayout.breechLenWorld,
      cannonLayout.breechWidthWorld,
      cannonLayout.breechDepthWorld,
    );
    cannonBarrelMesh.position.set(
      barrelStart + cannonLayout.barrelLenWorld * 0.5,
      0,
      0,
    );
    cannonBarrelMesh.scale.set(
      cannonLayout.barrelLenWorld,
      cannonLayout.barrelRadiusWorld,
      cannonLayout.barrelRadiusWorld,
    );
    cannonBarrelBandMesh.position.set(
      barrelStart + cannonLayout.barrelLenWorld * CANNON_BAND_POSITION,
      0,
      0,
    );
    cannonBarrelBandMesh.scale.set(
      cannonLayout.bandLenWorld,
      cannonLayout.bandRadiusWorld,
      cannonLayout.bandRadiusWorld,
    );
    cannonMuzzleMesh.position.set(
      barrelEnd - cannonLayout.muzzleLenWorld * 0.5,
      0,
      0,
    );
    cannonMuzzleMesh.scale.set(
      cannonLayout.muzzleLenWorld,
      cannonLayout.muzzleRadiusWorld,
      cannonLayout.muzzleRadiusWorld,
    );

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
    const flashElapsed = nowSec - cannonFireState.flashStartSec;
    if (flashElapsed >= 0 && flashElapsed <= cannonLayout.flashDurationSec) {
      const flashProgress = flashElapsed / cannonLayout.flashDurationSec;
      const flashOpacity = (1 - flashProgress) ** 2.1;
      const flashLength =
        cannonLayout.flashRadiusWorld * (1.15 + (1 - flashProgress) * 1.35);
      const flashWidth =
        cannonLayout.flashRadiusWorld * (0.3 + (1 - flashProgress) * 0.42);
      cannonFlashMesh.visible = true;
      cannonFlashMaterial.opacity = flashOpacity;
      cannonFlashMaterial.color.set(weaponAccent);
      cannonFlashMesh.position.set(barrelEnd + flashLength * 0.26, 0, 0);
      cannonFlashMesh.scale.set(flashLength, flashWidth, flashWidth);
    } else {
      cannonFlashMesh.visible = false;
      cannonFlashMaterial.opacity = 0;
    }

    const lockTarget =
      renderState.player.controlMode === "drone" ||
      renderState.player.lockTargetId === null
        ? null
        : (renderPlanetsById.get(renderState.player.lockTargetId) ?? null);

    lockRingMesh.visible =
      inputState.selectedRocketKind === "seeker" &&
      lockTarget !== null &&
      lockTarget.alive;
    if (lockTarget !== null && lockRingMesh.visible) {
      const lockProgress = getLocalSandboxLockProgress({
        currentTick: currentState.tick,
        lockAcquiredTick: currentState.player.seekerLockAcquiredAtTick,
      });
      const isLocked = lockProgress >= 1;
      lockRingProgressUniform.value = lockProgress;
      lockRingLockedUniform.value = isLocked ? 1 : 0;
      lockRingTimeUniform.value = nowSec;
      lockRingMesh.position.set(lockTarget.pos.x, lockTarget.pos.y, 5.5);
      const baseRadius = getRenderedPlanetRadius(lockTarget) + 22;
      const chargePulse = 1 + Math.sin(nowSec * 3.6) * 0.015;
      const lockedPulse = 1 + Math.sin(nowSec * 6.5) * 0.06;
      const lockScale = baseRadius * (isLocked ? lockedPulse : chargePulse);
      lockRingMesh.scale.set(lockScale, lockScale, 1);
    }
  } else {
    cannonGroup.visible = false;
    cannonFlashMesh.visible = false;
    cannonFlashMaterial.opacity = 0;
    for (const rocketKind of weaponKinds) {
      cannonFireState.lastAmmo[rocketKind] =
        renderState.player.ammo[rocketKind];
    }
    lockRingMesh.visible = false;
  }

  blackHoleGroup.visible = renderState.blackHole !== null;
  if (renderState.blackHole !== null) {
    blackHoleGroup.position.set(
      renderState.blackHole.pos.x,
      renderState.blackHole.pos.y,
      4,
    );
    blackHoleRing.rotation.z = nowSec * 0.16;
  }

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
