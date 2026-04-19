import type { RocketKind, Vec2 } from "@3body/shared";
import {
  BLACK_HOLE_SPEC,
  FIXED_STEP_SEC,
  add,
  clamp,
  getNeutronStarMassAlpha,
  getSunVisualProfile,
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
  Vector3,
} from "three/webgpu";
import type {
  CombatSandboxCache,
  CombatSandboxDebris,
  CombatSandboxImpactBurst,
  CombatSandboxPlanet,
  CombatSandboxRocket,
  CombatSandboxRocketLaunchBurst,
  CombatSandboxState,
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
  CacheVisual,
} from "./cacheVisuals";
import { getCacheArenaBadgeSize } from "./cacheVisuals";
import {
  type AmbientBoundaryDebrisVisual,
  getAmbientBoundaryDebrisRadii,
  updateAmbientBoundaryDebrisVisual,
} from "./ambientBoundaryDebris";
import { clipForesightPathAtDistance } from "./foresightShared";
import { getRenderedShieldOuterRadius } from "../shieldPresentation";
import type { LocalViewportCameraState } from "./localViewportCamera";
import { getLocalViewportControlledBody } from "./localViewportCamera";
import {
  CLOAK_FADE_TAIL_SEC,
  getCloakPlanetOpacity,
  getCloakRemainingSec,
} from "./cloakVisual";
import {
  getLocalSandboxLockProgress,
  type LocalSandboxGravityPulseState,
} from "./localSandboxSimulation";
import type { ViewportRenderQualityProfile } from "./renderQuality";

const ROCKET_TRAIL_DURATION_SEC = 0.18;
const ROCKET_TRAIL_SAMPLE_DISTANCE = 18;
const BOOST_BURST_DURATION_SEC = 0.48;
const GRAVITY_PULSE_VISUAL_DURATION_SEC = 0.95;
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

interface BoundaryDebrisVisual extends AmbientBoundaryDebrisVisual {}

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
  wakeVisuals: readonly {
    material: MeshBasicMaterial;
    mesh: Mesh;
  }[];
}

interface GravityPulseVisual {
  coreMaterial: MeshBasicMaterial;
  coreMesh: Mesh;
  echoMaterial: MeshBasicMaterial;
  echoMesh: Mesh;
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
}

interface ImpactBurstVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  ringMesh: Mesh;
}

interface CloakVisual {
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
  veilMaterial: MeshBasicMaterial;
  veilMesh: Mesh;
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

interface CannonFireState {
  flashStartSec: number;
  lastAmmo: Record<RocketKind, number>;
}

const getRuntimeVisuals = () => getRuntimeTuningDocument().visuals;
const getForesightPathTuning = () => getRuntimeVisuals().abilities.foresight;
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
    radius: burst.radius,
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
  foresightVisual.pointOpacityUniform.value = 0;
  foresightVisual.pointMaterial.size = tuning.pointSize;

  const lineArray = foresightVisual.linePositionAttribute.array as Float32Array;
  const maxPoints = foresightVisual.linePositionAttribute.count;
  const pointCount = Math.min(pathPoints.length, maxPoints);

  for (let index = 0; index < pointCount; index += 1) {
    const point = pathPoints[index]!;
    const offset = index * 3;

    lineArray[offset] = point.x;
    lineArray[offset + 1] = point.y;
    lineArray[offset + 2] = 0;
  }

  foresightVisual.lineGeometry.setDrawRange(0, pointCount);
  foresightVisual.pointGeometry.setDrawRange(0, 0);
  foresightVisual.linePositionAttribute.needsUpdate = true;
  foresightVisual.line.visible = tuning.lineOpacity > 0.01 && pointCount > 1;
  foresightVisual.points.visible = false;
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
  const visibleWakeBursts: Array<{
    alpha: number;
    burst: BoostBurstState;
    origin: Vec2;
    progress: number;
    radius: number;
  }> = [];

  for (const burst of bursts) {
    const ageSec = nowSec - burst.startedAtSec;
    if (ageSec < 0 || ageSec > BOOST_BURST_DURATION_SEC) {
      continue;
    }

    const burstAlpha = clamp(1 - ageSec / BOOST_BURST_DURATION_SEC, 0, 1);
    const burstProgress = clamp(ageSec / BOOST_BURST_DURATION_SEC, 0, 1);
    const { origin, radius } = getBoostBurstAnchor(burst, planetsById);
    visibleWakeBursts.push({
      alpha: burstAlpha,
      burst,
      origin,
      progress: burstProgress,
      radius,
    });

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

  visibleWakeBursts.sort((left, right) => right.alpha - left.alpha);

  for (let index = 0; index < boostVisual.wakeVisuals.length; index += 1) {
    const wakeVisual = boostVisual.wakeVisuals[index]!;
    const wakeBurst = visibleWakeBursts[index];
    if (wakeBurst === undefined) {
      wakeVisual.mesh.visible = false;
      wakeVisual.material.opacity = 0;
      continue;
    }

    const exhaustDir = scaleVec2(wakeBurst.burst.direction, -1);
    const wakeLength = wakeBurst.radius * lerp(2.3, 4.9, wakeBurst.progress);
    const wakeWidth = wakeBurst.radius * lerp(1.5, 0.82, wakeBurst.progress);
    const wakeOffset = wakeBurst.radius * lerp(0.46, 0.72, wakeBurst.progress);
    wakeVisual.mesh.visible = true;
    wakeVisual.mesh.position.set(
      wakeBurst.origin.x + exhaustDir.x * wakeOffset,
      wakeBurst.origin.y + exhaustDir.y * wakeOffset,
      2.26,
    );
    wakeVisual.mesh.scale.set(wakeLength, wakeWidth, 1);
    wakeVisual.mesh.rotation.z = Math.atan2(exhaustDir.y, exhaustDir.x);
    wakeVisual.material.opacity =
      wakeBurst.alpha * lerp(1, 0.44, wakeBurst.progress);
  }
};

const hideGravityPulseVisual = (visual: GravityPulseVisual) => {
  visual.coreMesh.visible = false;
  visual.ringMesh.visible = false;
  visual.echoMesh.visible = false;
  visual.coreMaterial.opacity = 0;
  visual.ringMaterial.opacity = 0;
  visual.echoMaterial.opacity = 0;
};

const updateGravityPulseVisual = (
  visual: GravityPulseVisual,
  pulse: LocalSandboxGravityPulseState | null,
  nowSec: number,
  visibleWorldHeight = FOLLOW_VIEW_WORLD_HEIGHT,
) => {
  if (pulse === null) {
    hideGravityPulseVisual(visual);
    return;
  }

  const ageSec = nowSec - pulse.startedAtSec;
  if (ageSec < 0 || ageSec > GRAVITY_PULSE_VISUAL_DURATION_SEC) {
    hideGravityPulseVisual(visual);
    return;
  }

  const progress = clamp(ageSec / GRAVITY_PULSE_VISUAL_DURATION_SEC, 0, 1);
  const fade = (1 - progress) ** 1.6;
  const visiblePulseRadius = Math.min(
    pulse.effectRadius,
    Math.max(pulse.planetRadius * 6, visibleWorldHeight * 0.42),
  );
  const primaryRadius = lerp(
    pulse.planetRadius * 1.25,
    visiblePulseRadius,
    progress,
  );
  const echoRadius = lerp(
    pulse.planetRadius * 1.55,
    visiblePulseRadius * 0.88,
    progress,
  );
  const coreRadius = lerp(
    pulse.planetRadius * 1.2,
    pulse.planetRadius * 3.6,
    Math.min(1, progress * 1.6),
  );

  visual.coreMesh.visible = true;
  visual.ringMesh.visible = true;
  visual.echoMesh.visible = true;
  visual.coreMesh.position.set(pulse.origin.x, pulse.origin.y, 2.2);
  visual.ringMesh.position.set(pulse.origin.x, pulse.origin.y, 2.35);
  visual.echoMesh.position.set(pulse.origin.x, pulse.origin.y, 2.3);
  visual.coreMesh.scale.set(coreRadius, coreRadius, 1);
  visual.ringMesh.scale.set(primaryRadius, primaryRadius, 1);
  visual.echoMesh.scale.set(echoRadius, echoRadius, 1);
  visual.ringMesh.rotation.z = progress * 0.42;
  visual.echoMesh.rotation.z = -progress * 0.28;
  visual.coreMaterial.opacity = fade * (0.28 + (1 - progress) * 0.3);
  visual.ringMaterial.opacity = fade * 0.96;
  visual.echoMaterial.opacity = fade * 0.56;
};

const updateCloakVisuals = (
  visuals: readonly CloakVisual[],
  planets: readonly CombatSandboxPlanet[],
  currentTick: number,
  nowSec: number,
) => {
  for (let index = 0; index < visuals.length; index += 1) {
    const visual = visuals[index]!;
    const planet = planets[index];
    if (planet === undefined || !planet.alive) {
      visual.veilMesh.visible = false;
      visual.ringMesh.visible = false;
      visual.veilMaterial.opacity = 0;
      visual.ringMaterial.opacity = 0;
      continue;
    }

    const remainingSec = getCloakRemainingSec(
      planet.hideTrailUntilTick,
      currentTick,
    );
    if (planet.hideTrailUntilTick <= 0 || remainingSec <= 0) {
      visual.veilMesh.visible = false;
      visual.ringMesh.visible = false;
      visual.veilMaterial.opacity = 0;
      visual.ringMaterial.opacity = 0;
      continue;
    }

    const fadeTail = clamp(remainingSec / CLOAK_FADE_TAIL_SEC, 0, 1);
    const pulse = 0.5 + Math.sin(nowSec * 4.4 + planet.id * 0.71) * 0.5;
    const renderRadius = getRenderedPlanetRadius(planet);
    const veilOpacity = (0.12 + pulse * 0.08) * fadeTail;
    const ringOpacity = (0.18 + pulse * 0.12) * fadeTail;

    visual.veilMesh.visible = veilOpacity > 0.01;
    visual.ringMesh.visible = ringOpacity > 0.01;
    visual.veilMesh.position.set(planet.pos.x, planet.pos.y, 0.28);
    visual.ringMesh.position.set(planet.pos.x, planet.pos.y, 0.34);
    visual.veilMesh.scale.set(
      renderRadius * (1.26 + pulse * 0.08),
      renderRadius * (1.26 + pulse * 0.08),
      1,
    );
    visual.ringMesh.scale.set(
      renderRadius * (1.58 + pulse * 0.12),
      renderRadius * (1.58 + pulse * 0.12),
      1,
    );
    visual.ringMesh.rotation.z = nowSec * 0.55 + planet.id * 0.17;
    visual.veilMaterial.opacity = veilOpacity;
    visual.ringMaterial.opacity = ringOpacity;
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
      ? getRenderedShieldOuterRadius(planet.radius)
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
      : planet.deathReason === "sunCollision" ||
          planet.deathReason === "neutronStar"
        ? PLANET_EXPLOSION_DURATION_SEC + 0.12
        : PLANET_EXPLOSION_DURATION_SEC;
  const scatterScale =
    planet.deathReason === "planetCollision"
      ? 1.62
      : planet.deathReason === "sunCollision" ||
          planet.deathReason === "neutronStar"
        ? 1.48
        : 1.34;
  const shockwaveScale =
    planet.deathReason === "planetCollision"
      ? 6.8
      : planet.deathReason === "sunCollision" ||
          planet.deathReason === "neutronStar"
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
  activeGravityPulse,
  activeBoostBursts,
  boostBurstVisual,
  boundaryDebrisVisual,
  cacheVisuals,
  cloakVisuals,
  debrisVisual,
  disposeCacheVisual,
  foresightVisuals,
  gravityPulseVisual,
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
  activeGravityPulse: LocalSandboxGravityPulseState | null;
  activeBoostBursts: BoostBurstState[];
  boostBurstVisual: BoostBurstVisual;
  boundaryDebrisVisual: BoundaryDebrisVisual;
  cacheVisuals: Map<number, CacheVisual>;
  cloakVisuals: readonly CloakVisual[];
  currentState: CombatSandboxState;
  debrisVisual: DebrisVisual;
  disposeCacheVisual: (visual: CacheVisual) => void;
  foresightVisuals: ReadonlyMap<number, ForesightVisual>;
  gravityPulseVisual: GravityPulseVisual;
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
  boundaryDebrisVisual.bandGroup.visible = false;
  boundaryDebrisVisual.points.visible = false;
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
  updateCloakVisuals(
    cloakVisuals,
    currentState.planets,
    currentState.tick,
    currentState.elapsedSec,
  );
  shieldGroup.visible = false;
  for (const visual of cacheVisuals.values()) {
    hostScene.remove(visual.group);
    disposeCacheVisual(visual);
  }
  cacheVisuals.clear();
};

interface UpdateLocalViewportSceneParams {
  activeGravityPulse: LocalSandboxGravityPulseState | null;
  activeBoostBursts: BoostBurstState[];
  activeCacheIds: Set<number>;
  activePlanetExplosions: PlanetExplosionState[];
  activeRocketTrailIds: Set<number>;
  blackHoleGroup: Group;
  blackHoleRing: Mesh;
  boostBurstParticlesPerBurst: number;
  boostBurstVisual: BoostBurstVisual;
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
  cloakVisuals: readonly CloakVisual[];
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
  foresightPathsByEntityId: ReadonlyMap<number, readonly Vec2[]>;
  foresightVisuals: ReadonlyMap<number, ForesightVisual>;
  getCacheIconKey: (contents: CombatSandboxCache["contents"]) => CacheIconKey;
  gravityPulseVisual: GravityPulseVisual;
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
  activeGravityPulse,
  activeBoostBursts,
  activeCacheIds,
  activePlanetExplosions,
  activeRocketTrailIds,
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
  cloakVisuals,
  chromaticAberrationNode,
  controlsEnabled,
  createCacheVisual,
  currentState,
  debrisVisual,
  disposeCacheVisual,
  foresightPathsByEntityId,
  foresightVisuals,
  getCacheIconKey,
  gravityPulseVisual,
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

  for (let index = 0; index < sunVisuals.length; index += 1) {
    const visual = sunVisuals[index]!;
    const sun = renderState.suns[index]!;
    const profile = getSunVisualProfile(getRuntimeVisuals().suns, index);
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
    const planetVisualTuning = getPlanetArchetypeVisuals(planet.archetype);
    const planetOpacity = getCloakPlanetOpacity(
      planet.hideTrailUntilTick,
      renderState.tick,
    );
    const auraRingStops = getPlanetAuraRingStops(
      planetVisualTuning.auraScale,
      planetVisualTuning.auraGap,
    );

    visual.mesh.visible = planet.alive;
    visual.glowMesh.visible = planet.alive;
    visual.surfaceOpacityUniform.value = planetOpacity;
    visual.glowOpacityUniform.value = planetOpacity;
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
    const badgeSize =
      getCacheArenaBadgeSize(getCacheBadgeBaseSize(), cacheBadgeScale) * pulse;
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
      const seekerPulse =
        rocketKind === "seeker"
          ? 1 + Math.sin(nowSec * 10 + count * 0.7) * 0.18
          : 1;
      const flicker = 0.82 + Math.sin(nowSec * 38 + count * 1.37) * 0.16;
      rocketPosition.set(rocket.pos.x, rocket.pos.y, 0);
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
        burst.launchPlanetRadius,
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
  const arenaRadius = Math.max(
    0,
    getRuntimeTuningDocument().gameplay.arena.radius,
  );
  updateAmbientBoundaryDebrisVisual({
    ...getAmbientBoundaryDebrisRadii(arenaRadius),
    nowSec,
    visual: boundaryDebrisVisual,
  });
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
  updateCloakVisuals(
    cloakVisuals,
    renderState.planets,
    renderState.tick,
    nowSec,
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
    shieldGlowOpacityUniform.value = clamp(
      0.05 +
        shieldLoadRatio * 0.11 +
        Math.sin(nowSec * 9.4) * 0.03 +
        shieldHitReact.glowBoost,
      0,
      1,
    );
    shieldArcOpacityUniform.value = clamp(
      0.16 +
        shieldLoadRatio * 0.3 +
        Math.sin(nowSec * 7.6) * 0.05 +
        shieldHitReact.arcBoost,
      0,
      1,
    );
    shieldPanelOpacityUniform.value = clamp(
      0.18 +
        shieldLoadRatio * 0.42 +
        Math.sin(nowSec * 9.8) * 0.05 +
        shieldHitReact.arcBoost * 0.84,
      0,
      1,
    );
    shieldCrestOpacityUniform.value = clamp(
      0.16 +
        shieldLoadRatio * 0.36 +
        Math.sin(nowSec * 10.8) * 0.06 +
        shieldHitReact.arcBoost * 0.88,
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
    const weaponAccent = getWeaponColors()[inputState.selectedRocketKind].accent;
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
    const blackHoleScale =
      renderState.blackHole.killRadius /
      Math.max(1, BLACK_HOLE_SPEC.killRadius);
    blackHoleGroup.scale.set(blackHoleScale, blackHoleScale, 1);
    blackHoleRing.rotation.z = nowSec * 0.16;
  } else {
    blackHoleGroup.scale.set(1, 1, 1);
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
