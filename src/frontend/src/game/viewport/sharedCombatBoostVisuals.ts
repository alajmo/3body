import {
  add,
  clamp,
  len,
  lerp,
  normalize as normalizeVec2,
  rot,
  scale as scaleVec2,
  type Vec2,
} from "@3body/shared";
import { attribute, color } from "three/tsl";
import {
  AdditiveBlending,
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsNodeMaterial,
  type Scene,
} from "three/webgpu";

const BOOST_WAKE_BEND_MIN = 0.22;
const BOOST_WAKE_BEND_MAX = 1.18;
const BOOST_WAKE_GEOMETRY_SEGMENTS = 12;

export const SHARED_COMBAT_BOOST_BURST_DURATION_SEC = 0.48;

export interface SharedCombatBoostBody {
  alive?: boolean;
  pos: Vec2;
  radius: number;
}

export interface SharedCombatBoostBurstState {
  direction: Vec2;
  origin: Vec2;
  planetId: number;
  radius: number;
  startedAtSec: number;
  tick: number;
}

export interface SharedCombatBoostDirectionOverride {
  direction: Vec2;
  planetId: number;
}

export interface SharedCombatBoostPresentationBody
  extends SharedCombatBoostBody {
  id: number;
}

export interface SharedCombatBoostWakeVisual {
  basePositions: Float32Array;
  geometry: PlaneGeometry;
  material: MeshBasicMaterial;
  mesh: Mesh;
  positionAttribute: Float32BufferAttribute;
}

export interface SharedCombatBoostBurstVisual {
  geometry: BufferGeometry;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  wakeVisuals: readonly SharedCombatBoostWakeVisual[];
}

export interface SharedCombatVisibleBoostWakeBurst {
  alpha: number;
  burst: SharedCombatBoostBurstState;
  direction: Vec2;
  origin: Vec2;
  progress: number;
  radius: number;
}

interface SharedCombatVisibleBoostWakeBurstAccumulator
  extends SharedCombatVisibleBoostWakeBurst {
  directionWeight: number;
  weightedDirection: Vec2;
}

export interface SharedCombatBoostWakeMaterialResult {
  material: MeshBasicMaterial;
  texture: { dispose: () => void } | null;
}

const getSharedCombatBoostBurstAnchor = ({
  burst,
  getBodyById,
}: {
  burst: SharedCombatBoostBurstState;
  getBodyById: (planetId: number) => SharedCombatBoostBody | null;
}): { origin: Vec2; radius: number } => {
  const boostedBody = getBodyById(burst.planetId);
  if (boostedBody !== null && boostedBody.alive !== false) {
    return {
      origin: boostedBody.pos,
      radius: boostedBody.radius,
    };
  }

  return {
    origin: burst.origin,
    radius: burst.radius,
  };
};

const getEffectiveSharedCombatBoostDirection = (
  burst: SharedCombatBoostBurstState,
  directionOverride: SharedCombatBoostDirectionOverride | null,
): Vec2 =>
  directionOverride !== null && directionOverride.planetId === burst.planetId
    ? directionOverride.direction
    : burst.direction;

const getSignedSharedCombatBoostTurnAngle = (
  baseDirection: Vec2,
  currentDirection: Vec2,
): number => {
  if (len(baseDirection) <= 0.001 || len(currentDirection) <= 0.001) {
    return 0;
  }

  const cross =
    baseDirection.x * currentDirection.y - baseDirection.y * currentDirection.x;
  const dot =
    baseDirection.x * currentDirection.x + baseDirection.y * currentDirection.y;

  return Math.atan2(cross, dot);
};

export const getSharedCombatBoostWakeBendAmount = ({
  baseDirection,
  currentDirection,
  progress,
}: {
  baseDirection: Vec2;
  currentDirection: Vec2;
  progress: number;
}): number => {
  const normalizedTurn = clamp(
    getSignedSharedCombatBoostTurnAngle(baseDirection, currentDirection) /
      (Math.PI * 0.5),
    -1,
    1,
  );

  return (
    -normalizedTurn *
    lerp(BOOST_WAKE_BEND_MIN, BOOST_WAKE_BEND_MAX, clamp(progress, 0, 1))
  );
};

const collectSharedCombatBoostWakeDirectionSamples = ({
  bursts,
  directionOverride,
  headDirection,
  nowSec,
  planetId,
}: {
  bursts: readonly SharedCombatBoostBurstState[];
  directionOverride: SharedCombatBoostDirectionOverride | null;
  headDirection: Vec2;
  nowSec: number;
  planetId: number;
}): Vec2[] => {
  const directionSamples = [headDirection];
  const visiblePlanetBursts = bursts
    .filter((burst) => {
      if (burst.planetId !== planetId) {
        return false;
      }

      const ageSec = nowSec - burst.startedAtSec;
      return ageSec >= 0 && ageSec <= SHARED_COMBAT_BOOST_BURST_DURATION_SEC;
    })
    .sort((left, right) => right.startedAtSec - left.startedAtSec);

  for (const burst of visiblePlanetBursts) {
    const direction =
      directionOverride !== null && directionOverride.planetId === planetId
        ? burst.direction
        : getEffectiveSharedCombatBoostDirection(burst, directionOverride);
    if (len(direction) <= 0.001) {
      continue;
    }

    const previousDirection =
      directionSamples[directionSamples.length - 1] ?? headDirection;
    if (
      Math.abs(
        getSignedSharedCombatBoostTurnAngle(previousDirection, direction),
      ) < 0.01
    ) {
      continue;
    }

    directionSamples.push(direction);
  }

  return directionSamples;
};

export const getSharedCombatBoostWakeCurveOffset = ({
  currentDirection,
  directionSamples,
  tailProgress,
  wakeProgress,
}: {
  currentDirection: Vec2;
  directionSamples: readonly Vec2[];
  tailProgress: number;
  wakeProgress: number;
}): number => {
  const clampedTailProgress = clamp(tailProgress, 0, 1);
  if (directionSamples.length <= 1 || clampedTailProgress <= 0) {
    return 0;
  }

  const scaledIndex = clampedTailProgress * (directionSamples.length - 1);
  const currentIndex = Math.floor(scaledIndex);
  const nextIndex = Math.min(directionSamples.length - 1, currentIndex + 1);
  const blend = scaledIndex - currentIndex;
  const startDirection = directionSamples[currentIndex]!;
  const endDirection = directionSamples[nextIndex]!;
  const sampledDirection = normalizeVec2(
    add(scaleVec2(startDirection, 1 - blend), scaleVec2(endDirection, blend)),
  );

  return (
    getSharedCombatBoostWakeBendAmount({
      baseDirection: sampledDirection,
      currentDirection,
      progress: wakeProgress,
    }) *
    clampedTailProgress *
    clampedTailProgress
  );
};

const updateSharedCombatBoostWakeGeometry = ({
  currentDirection,
  directionSamples,
  wakeProgress,
  wakeVisual,
}: {
  currentDirection: Vec2;
  directionSamples: readonly Vec2[];
  wakeProgress: number;
  wakeVisual: SharedCombatBoostWakeVisual;
}) => {
  const positionArray = wakeVisual.positionAttribute.array as Float32Array;

  for (let index = 0; index < positionArray.length; index += 3) {
    const baseX = wakeVisual.basePositions[index]!;
    const baseY = wakeVisual.basePositions[index + 1]!;
    const curveOffset = getSharedCombatBoostWakeCurveOffset({
      currentDirection,
      directionSamples,
      tailProgress: baseX,
      wakeProgress,
    });
    positionArray[index] = baseX;
    positionArray[index + 1] = baseY + curveOffset;
    positionArray[index + 2] = wakeVisual.basePositions[index + 2]!;
  }

  wakeVisual.positionAttribute.needsUpdate = true;
};

export const collectSharedCombatVisibleBoostWakeBursts = ({
  bursts,
  directionOverride = null,
  getBodyById = () => null,
  nowSec,
}: {
  bursts: readonly SharedCombatBoostBurstState[];
  directionOverride?: SharedCombatBoostDirectionOverride | null;
  getBodyById?: (planetId: number) => SharedCombatBoostBody | null;
  nowSec: number;
}): SharedCombatVisibleBoostWakeBurst[] => {
  const visibleWakeBurstsByPlanetId = new Map<
    number,
    SharedCombatVisibleBoostWakeBurstAccumulator
  >();

  for (const burst of bursts) {
    const ageSec = nowSec - burst.startedAtSec;
    if (ageSec < 0 || ageSec > SHARED_COMBAT_BOOST_BURST_DURATION_SEC) {
      continue;
    }

    const burstAlpha = clamp(
      1 - ageSec / SHARED_COMBAT_BOOST_BURST_DURATION_SEC,
      0,
      1,
    );
    const burstProgress = clamp(
      ageSec / SHARED_COMBAT_BOOST_BURST_DURATION_SEC,
      0,
      1,
    );
    const directionWeight = burstAlpha;
    const direction = getEffectiveSharedCombatBoostDirection(
      burst,
      directionOverride,
    );
    const weightedDirection = scaleVec2(direction, directionWeight);
    const { origin, radius } = getSharedCombatBoostBurstAnchor({
      burst,
      getBodyById,
    });
    const existingWakeBurst = visibleWakeBurstsByPlanetId.get(burst.planetId);

    if (existingWakeBurst === undefined) {
      visibleWakeBurstsByPlanetId.set(burst.planetId, {
        alpha: burstAlpha,
        burst,
        direction,
        directionWeight,
        origin,
        progress: burstProgress,
        radius,
        weightedDirection,
      });
      continue;
    }

    existingWakeBurst.alpha = Math.max(existingWakeBurst.alpha, burstAlpha);
    existingWakeBurst.directionWeight += directionWeight;
    existingWakeBurst.progress = Math.max(
      existingWakeBurst.progress,
      burstProgress,
    );
    existingWakeBurst.weightedDirection = add(
      existingWakeBurst.weightedDirection,
      weightedDirection,
    );

    if (burst.startedAtSec >= existingWakeBurst.burst.startedAtSec) {
      existingWakeBurst.burst = burst;
      existingWakeBurst.direction = direction;
      existingWakeBurst.origin = origin;
      existingWakeBurst.radius = radius;
      continue;
    }

    existingWakeBurst.radius = Math.max(existingWakeBurst.radius, radius);
  }

  return Array.from(
    visibleWakeBurstsByPlanetId.values(),
    ({ directionWeight, weightedDirection, ...wakeBurst }) => {
      const blendedDirection =
        directionWeight > Number.EPSILON && len(weightedDirection) > 0.001
          ? normalizeVec2(weightedDirection)
          : wakeBurst.direction;

      return {
        ...wakeBurst,
        direction: blendedDirection,
      };
    },
  ).sort((left, right) => right.alpha - left.alpha);
};

export const createSharedCombatBoostBurstVisual = ({
  boostColor,
  createBoostWakeMaterial,
  sampleLimit,
  scene,
  wakeCount,
}: {
  boostColor: string;
  createBoostWakeMaterial: () => SharedCombatBoostWakeMaterialResult;
  sampleLimit: number;
  scene: Scene;
  wakeCount: number;
}): {
  disposables: Array<{ dispose: () => void }>;
  visual: SharedCombatBoostBurstVisual;
} => {
  const disposables: Array<{ dispose: () => void }> = [];
  const boostBurstGeometry = new BufferGeometry();
  const boostBurstPositions = new Float32Array(sampleLimit * 3);
  const boostBurstOpacity = new Float32Array(sampleLimit);
  const boostBurstPositionAttribute = new Float32BufferAttribute(
    boostBurstPositions,
    3,
  );
  const boostBurstOpacityAttribute = new Float32BufferAttribute(
    boostBurstOpacity,
    1,
  );
  boostBurstPositionAttribute.setUsage(DynamicDrawUsage);
  boostBurstOpacityAttribute.setUsage(DynamicDrawUsage);
  boostBurstGeometry.setAttribute("position", boostBurstPositionAttribute);
  boostBurstGeometry.setAttribute(
    "boostBurstOpacity",
    boostBurstOpacityAttribute,
  );
  boostBurstGeometry.setDrawRange(0, 0);

  const boostBurstMaterial = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  boostBurstMaterial.colorNode = color(boostColor);
  boostBurstMaterial.opacityNode = attribute("boostBurstOpacity", "float");
  boostBurstMaterial.size = 14;
  boostBurstMaterial.alphaTest = 0.01;

  const boostBurstPoints = new Points(boostBurstGeometry, boostBurstMaterial);
  boostBurstPoints.frustumCulled = false;
  boostBurstPoints.renderOrder = 13;
  boostBurstPoints.position.z = 2.2;
  boostBurstPoints.visible = false;
  scene.add(boostBurstPoints);

  const boostWakeTemplate = createBoostWakeMaterial();
  const wakeVisuals = Array.from({ length: wakeCount }, (_, index) => {
    const geometry = new PlaneGeometry(1, 1, BOOST_WAKE_GEOMETRY_SEGMENTS, 1);
    geometry.translate(0.5, 0, 0);
    const material =
      index === 0
        ? boostWakeTemplate.material
        : boostWakeTemplate.material.clone();
    const positionAttribute = geometry.getAttribute(
      "position",
    ) as Float32BufferAttribute;
    positionAttribute.setUsage(DynamicDrawUsage);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 11.8;
    mesh.position.z = 2.26;
    mesh.visible = false;
    scene.add(mesh);

    return {
      basePositions: Float32Array.from(
        positionAttribute.array as ArrayLike<number>,
      ),
      geometry,
      material,
      mesh,
      positionAttribute,
    } satisfies SharedCombatBoostWakeVisual;
  });

  disposables.push(
    boostBurstGeometry,
    boostBurstMaterial,
    ...wakeVisuals.map((visual) => visual.geometry),
    ...wakeVisuals.map((visual) => visual.material),
    ...(boostWakeTemplate.texture === null ? [] : [boostWakeTemplate.texture]),
  );

  return {
    disposables,
    visual: {
      geometry: boostBurstGeometry,
      opacityAttribute: boostBurstOpacityAttribute,
      points: boostBurstPoints,
      positionAttribute: boostBurstPositionAttribute,
      wakeVisuals,
    },
  };
};

export const queueSharedCombatBoostBurst = ({
  activeBursts,
  burst,
  maxActiveBursts,
}: {
  activeBursts: SharedCombatBoostBurstState[];
  burst: SharedCombatBoostBurstState;
  maxActiveBursts: number;
}) => {
  activeBursts.push(burst);
  while (activeBursts.length > maxActiveBursts) {
    activeBursts.shift();
  }
};

export const pruneSharedCombatBoostBursts = ({
  activeBursts,
  nowSec,
}: {
  activeBursts: SharedCombatBoostBurstState[];
  nowSec: number;
}) => {
  while (
    activeBursts.length > 0 &&
    nowSec - activeBursts[0]!.startedAtSec >
      SHARED_COMBAT_BOOST_BURST_DURATION_SEC
  ) {
    activeBursts.shift();
  }
};

export const getSharedCombatHeldBoostDirectionOverride = ({
  aimTarget,
  body,
  heldBoosting,
}: {
  aimTarget: Vec2;
  body: SharedCombatBoostPresentationBody | null;
  heldBoosting: boolean;
}): SharedCombatBoostDirectionOverride | null => {
  if (!heldBoosting || body === null || body.alive === false) {
    return null;
  }

  const aimDelta = add(aimTarget, scaleVec2(body.pos, -1));
  if (len(aimDelta) <= 0.001) {
    return null;
  }

  return {
    direction: normalizeVec2(aimDelta),
    planetId: body.id,
  };
};

export const syncSharedCombatBoostPresentation = ({
  activeBursts,
  aimTarget,
  boostVisual,
  getBodyById = () => null,
  heldBoosting,
  maxParticlesPerBurst,
  nowSec,
  playerBody,
}: {
  activeBursts: SharedCombatBoostBurstState[];
  aimTarget: Vec2;
  boostVisual: SharedCombatBoostBurstVisual | null;
  getBodyById?: (planetId: number) => SharedCombatBoostBody | null;
  heldBoosting: boolean;
  maxParticlesPerBurst: number;
  nowSec: number;
  playerBody: SharedCombatBoostPresentationBody | null;
}): SharedCombatBoostDirectionOverride | null => {
  pruneSharedCombatBoostBursts({
    activeBursts,
    nowSec,
  });

  const directionOverride = getSharedCombatHeldBoostDirectionOverride({
    aimTarget,
    body: playerBody,
    heldBoosting,
  });

  if (boostVisual !== null) {
    syncSharedCombatBoostBurstVisual({
      boostVisual,
      bursts: activeBursts,
      directionOverride,
      getBodyById,
      maxParticlesPerBurst,
      nowSec,
    });
  }

  return directionOverride;
};

export const syncSharedCombatBoostBurstVisual = ({
  bursts,
  boostVisual,
  directionOverride = null,
  getBodyById = () => null,
  maxParticlesPerBurst,
  nowSec,
}: {
  bursts: readonly SharedCombatBoostBurstState[];
  boostVisual: SharedCombatBoostBurstVisual;
  directionOverride?: SharedCombatBoostDirectionOverride | null;
  getBodyById?: (planetId: number) => SharedCombatBoostBody | null;
  maxParticlesPerBurst: number;
  nowSec: number;
}) => {
  const positionArray = boostVisual.positionAttribute.array as Float32Array;
  const opacityArray = boostVisual.opacityAttribute.array as Float32Array;
  const directionSamplesByPlanetId = new Map<number, Vec2[]>();
  const particleLimit = Math.max(0, maxParticlesPerBurst);
  const maxDrawCount = Math.min(
    boostVisual.positionAttribute.count,
    particleLimit * Math.max(1, bursts.length),
  );
  let drawCount = 0;
  const visibleWakeBursts = collectSharedCombatVisibleBoostWakeBursts({
    bursts,
    directionOverride,
    getBodyById,
    nowSec,
  });

  for (const burst of bursts) {
    const ageSec = nowSec - burst.startedAtSec;
    if (ageSec < 0 || ageSec > SHARED_COMBAT_BOOST_BURST_DURATION_SEC) {
      continue;
    }

    const burstAlpha = clamp(
      1 - ageSec / SHARED_COMBAT_BOOST_BURST_DURATION_SEC,
      0,
      1,
    );
    const burstProgress = clamp(
      ageSec / SHARED_COMBAT_BOOST_BURST_DURATION_SEC,
      0,
      1,
    );
    const { origin, radius } = getSharedCombatBoostBurstAnchor({
      burst,
      getBodyById,
    });
    const direction = getEffectiveSharedCombatBoostDirection(
      burst,
      directionOverride,
    );
    const directionSamples =
      directionSamplesByPlanetId.get(burst.planetId) ??
      (() => {
        const nextDirectionSamples =
          collectSharedCombatBoostWakeDirectionSamples({
            bursts,
            directionOverride,
            headDirection: direction,
            nowSec,
            planetId: burst.planetId,
          });
        directionSamplesByPlanetId.set(burst.planetId, nextDirectionSamples);
        return nextDirectionSamples;
      })();

    const exhaustDir = scaleVec2(direction, -1);
    const exhaustTangent = { x: -exhaustDir.y, y: exhaustDir.x };
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
      const bendOffset = scaleVec2(
        exhaustTangent,
        radius *
          getSharedCombatBoostWakeCurveOffset({
            currentDirection: direction,
            directionSamples,
            tailProgress: progress,
            wakeProgress: burstProgress,
          }),
      );
      const particlePos = add(
        particleOrigin,
        add(
          add(
            scaleVec2(particleDir, travel),
            scaleVec2(direction, forwardDrift),
          ),
          bendOffset,
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

  for (let index = 0; index < boostVisual.wakeVisuals.length; index += 1) {
    const wakeVisual = boostVisual.wakeVisuals[index]!;
    const wakeBurst = visibleWakeBursts[index];
    if (wakeBurst === undefined) {
      wakeVisual.mesh.visible = false;
      wakeVisual.material.opacity = 0;
      continue;
    }

    const exhaustDir = scaleVec2(wakeBurst.direction, -1);
    const directionSamples =
      directionSamplesByPlanetId.get(wakeBurst.burst.planetId) ??
      (() => {
        const nextDirectionSamples =
          collectSharedCombatBoostWakeDirectionSamples({
            bursts,
            directionOverride,
            headDirection: wakeBurst.direction,
            nowSec,
            planetId: wakeBurst.burst.planetId,
          });
        directionSamplesByPlanetId.set(
          wakeBurst.burst.planetId,
          nextDirectionSamples,
        );
        return nextDirectionSamples;
      })();
    const wakeLength = wakeBurst.radius * lerp(2.3, 4.9, wakeBurst.progress);
    const wakeWidth = wakeBurst.radius * lerp(1.5, 0.82, wakeBurst.progress);
    const wakeOffset = wakeBurst.radius * lerp(0.46, 0.72, wakeBurst.progress);
    updateSharedCombatBoostWakeGeometry({
      currentDirection: wakeBurst.direction,
      directionSamples,
      wakeProgress: wakeBurst.progress,
      wakeVisual,
    });
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
