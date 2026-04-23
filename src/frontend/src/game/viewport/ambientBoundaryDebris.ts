import {
  clamp,
  lerp,
  mulberry32,
  type OrbitBoundaryDebrisVisualTuning,
} from "@3body/shared";
import {
  attribute,
  color,
  dot,
  float,
  max,
  mix,
  mx_fractal_noise_float,
  normalize,
  normalWorld,
  positionLocal,
  pow,
  sin,
  vec3,
} from "three/tsl";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  Points,
  PointsNodeMaterial,
  Quaternion,
  Vector3,
} from "three/webgpu";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import { tintColor } from "../showcaseVisuals";

const TAU = Math.PI * 2;
const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const BASE_PRIMARY_SHARD_COUNT = 180;
const BASE_SECONDARY_SHARD_COUNT = 320;
const BASE_DUST_COUNT = 160;
const FALLING_LAYER_CAPACITY = {
  primary: 8,
  secondary: 14,
} as const;
const FALLING_PATH_TARGET_RADIUS_RATIO = {
  primary: {
    highDrift: 0.08,
    lowDrift: 0.88,
  },
  secondary: {
    highDrift: 0.03,
    lowDrift: 0.76,
  },
} as const;
const FALLING_SHARD_SCALE_MULTIPLIER = {
  primary: 2.9,
  secondary: 2.5,
} as const;
const FALLING_SHARD_SPEED = {
  primary: {
    max: 1500,
    min: 980,
  },
  secondary: {
    max: 2050,
    min: 1380,
  },
} as const;
const FALLING_EXIT_MARGIN = 160;
const FALLING_MAX_STEP_SEC = 0.2;
const FALLING_MAX_UPDATE_STEPS = 6;
const HIDDEN_EPSILON = 1;
const BASE_SHARD_SCALE = {
  primary: {
    maxX: 18,
    maxY: 14,
    maxZ: 12,
    minX: 8,
    minY: 6,
    minZ: 5,
  },
  secondary: {
    maxX: 9.2,
    maxY: 7.2,
    maxZ: 6.4,
    minX: 3.8,
    minY: 2.8,
    minZ: 2.2,
  },
} as const;

interface AmbientBoundaryDebrisShardSpec {
  angle: number;
  angularSpeed: number;
  pitch: number;
  radiusAlpha: number;
  radialJitterAlpha: number;
  radialPhase: number;
  radialSpeed: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  spinPhase: number;
  spinSpeed: number;
  yawOffset: number;
  zOffset: number;
}

interface AmbientBoundaryDebrisDustSpec {
  angle: number;
  angularSpeed: number;
  opacity: number;
  radiusAlpha: number;
  radialJitterAlpha: number;
  radialPhase: number;
  radialSpeed: number;
  twinklePhase: number;
  twinkleSpeed: number;
  zOffset: number;
}

interface AmbientBoundaryDebrisCollisionBody {
  alive?: boolean;
  pos: { x: number; y: number };
  radius: number;
}

interface AmbientBoundaryDebrisShardLayer {
  mesh: InstancedMesh;
  specs: AmbientBoundaryDebrisShardSpec[];
}

interface AmbientBoundaryDebrisFallingShard {
  enteredInterior: boolean;
  pitch: number;
  posX: number;
  posY: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  spinPhase: number;
  spinSpeed: number;
  velX: number;
  velY: number;
  yawOffset: number;
  zOffset: number;
}

interface AmbientBoundaryDebrisFallingLayer {
  capacity: number;
  kind: keyof typeof FALLING_LAYER_CAPACITY;
  mesh: InstancedMesh;
  shards: AmbientBoundaryDebrisFallingShard[];
  spawnCountdownSec: number;
}

export interface AmbientBoundaryDebrisVisual {
  bandGeometries: Array<{ dispose: () => void }>;
  bandGroup: Group;
  bandMaterials: Array<{ dispose: () => void }>;
  colorAttribute: Float32BufferAttribute;
  dustSpecs: AmbientBoundaryDebrisDustSpec[];
  fallingGroup: Group;
  fallingLayers: AmbientBoundaryDebrisFallingLayer[];
  geometry: BufferGeometry;
  lastUpdateSec: number | null;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  shardLayers: AmbientBoundaryDebrisShardLayer[];
  spawnRng: () => number;
}

interface CreateAmbientBoundaryDebrisVisualOptions {
  renderOrder?: number;
  z?: number;
}

interface UpdateAmbientBoundaryDebrisVisualOptions {
  blackHoleBody?: AmbientBoundaryDebrisCollisionBody | null;
  enableFallingDebris?: boolean;
  innerRadius: number;
  nowSec: number;
  neutronStarBodies?: readonly AmbientBoundaryDebrisCollisionBody[];
  outerRadius: number;
  planetBodies?: readonly AmbientBoundaryDebrisCollisionBody[];
  sunBodies?: readonly AmbientBoundaryDebrisCollisionBody[];
  visual: AmbientBoundaryDebrisVisual;
}

const tempMatrix = new Matrix4();
const tempPosition = new Vector3();
const tempQuaternion = new Quaternion();
const tempQuaternion2 = new Quaternion();
const tempScale = new Vector3();

const getAmbientBoundaryDebrisTuning = (): OrbitBoundaryDebrisVisualTuning =>
  getRuntimeTuningDocument().visuals.orbits.boundaryDebris;

const getAsteroidFieldTuning = () =>
  getRuntimeTuningDocument().gameplay.arena.asteroidField;

export const getAmbientBoundaryDebrisRadii = (arenaRadius: number) => {
  const tuning = getAmbientBoundaryDebrisTuning();
  const innerRadius = Math.max(0, arenaRadius);
  const outerRadius = Math.max(innerRadius, innerRadius + tuning.thickness);
  return {
    innerRadius,
    outerRadius,
  };
};

const scaleShardRange = <
  T extends {
    maxX: number;
    maxY: number;
    maxZ: number;
    minX: number;
    minY: number;
    minZ: number;
  },
>(
  range: T,
  multiplier: number,
) => ({
  maxX: range.maxX * multiplier,
  maxY: range.maxY * multiplier,
  maxZ: range.maxZ * multiplier,
  minX: range.minX * multiplier,
  minY: range.minY * multiplier,
  minZ: range.minZ * multiplier,
});

const sampleExponentialIntervalSec = (
  ratePerSec: number,
  rng: () => number,
) => {
  if (ratePerSec <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return -Math.log(Math.max(1e-6, 1 - rng())) / ratePerSec;
};

const getBandRadius = ({
  bandWidth,
  innerRadius,
  outerRadius,
  radialJitterAlpha,
  radialPhase,
  radialSpeed,
  radiusAlpha,
  speedMultiplier,
  nowSec,
}: {
  bandWidth: number;
  innerRadius: number;
  nowSec: number;
  outerRadius: number;
  radialJitterAlpha: number;
  radialPhase: number;
  radialSpeed: number;
  radiusAlpha: number;
  speedMultiplier: number;
}) =>
  clamp(
    innerRadius +
      bandWidth * radiusAlpha +
      Math.sin(radialPhase + nowSec * radialSpeed * speedMultiplier) *
        bandWidth *
        radialJitterAlpha,
    innerRadius,
    outerRadius,
  );

const createFallingLayer = ({
  capacity,
  geometry,
  kind,
  material,
  renderOrder,
}: {
  capacity: number;
  geometry: BufferGeometry;
  kind: keyof typeof FALLING_LAYER_CAPACITY;
  material: MeshBasicNodeMaterial;
  renderOrder: number;
}): AmbientBoundaryDebrisFallingLayer => {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.renderOrder = renderOrder + 2;
  mesh.visible = false;

  return {
    capacity,
    kind,
    mesh,
    shards: [],
    spawnCountdownSec: Number.POSITIVE_INFINITY,
  };
};

const createFallingShard = ({
  bandWidth,
  driftStrength,
  innerRadius,
  kind,
  rng,
  sizeMultiplier,
}: {
  bandWidth: number;
  driftStrength: number;
  innerRadius: number;
  kind: keyof typeof FALLING_LAYER_CAPACITY;
  rng: () => number;
  sizeMultiplier: number;
}): AmbientBoundaryDebrisFallingShard => {
  const driftAlpha = clamp(driftStrength, 0, 1);
  const spawnAngle = rng() * TAU;
  const spawnRadius = innerRadius + bandWidth * (0.18 + rng() * 0.64);
  const spawnX = Math.cos(spawnAngle) * spawnRadius;
  const spawnY = Math.sin(spawnAngle) * spawnRadius;
  const maxTargetRadiusRatio = lerp(
    FALLING_PATH_TARGET_RADIUS_RATIO[kind].lowDrift,
    FALLING_PATH_TARGET_RADIUS_RATIO[kind].highDrift,
    driftAlpha,
  );
  const targetRadius = innerRadius * rng() * maxTargetRadiusRatio;
  const targetAngle = spawnAngle + (rng() - 0.5) * 0.7;
  const targetX = Math.cos(targetAngle) * targetRadius;
  const targetY = Math.sin(targetAngle) * targetRadius;
  const dirX = targetX - spawnX;
  const dirY = targetY - spawnY;
  const dirLength = Math.hypot(dirX, dirY) || 1;
  const tangentNudge = (rng() - 0.5) * lerp(0.42, 0.18, driftAlpha);
  const tangentX = -dirY / dirLength;
  const tangentY = dirX / dirLength;
  const headedX = dirX / dirLength + tangentX * tangentNudge;
  const headedY = dirY / dirLength + tangentY * tangentNudge;
  const headedLength = Math.hypot(headedX, headedY) || 1;
  const speed =
    lerp(FALLING_SHARD_SPEED[kind].min, FALLING_SHARD_SPEED[kind].max, rng()) *
    lerp(0.82, 1.18, driftAlpha);
  const sizeAlpha = rng();
  const sizeRange =
    kind === "primary" ? BASE_SHARD_SCALE.primary : BASE_SHARD_SCALE.secondary;
  const scaleMultiplier = sizeMultiplier * FALLING_SHARD_SCALE_MULTIPLIER[kind];

  return {
    enteredInterior: false,
    pitch: -0.75 + rng() * 1.5,
    posX: spawnX,
    posY: spawnY,
    roll: -0.8 + rng() * 1.6,
    scaleX: lerp(sizeRange.minX, sizeRange.maxX, sizeAlpha) * scaleMultiplier,
    scaleY: lerp(sizeRange.minY, sizeRange.maxY, rng()) * scaleMultiplier,
    scaleZ: lerp(sizeRange.minZ, sizeRange.maxZ, rng()) * scaleMultiplier,
    spinPhase: rng() * TAU,
    spinSpeed: -0.9 + rng() * 1.8,
    velX: (headedX / headedLength) * speed,
    velY: (headedY / headedLength) * speed,
    yawOffset: rng() * TAU,
    zOffset: -0.9 + rng() * 1.8,
  };
};

const collidesWithBodies = ({
  blackHoleBody,
  neutronStarBodies,
  planetBodies,
  radius,
  sunBodies,
  x,
  y,
}: {
  blackHoleBody?: AmbientBoundaryDebrisCollisionBody | null;
  neutronStarBodies?: readonly AmbientBoundaryDebrisCollisionBody[];
  planetBodies?: readonly AmbientBoundaryDebrisCollisionBody[];
  radius: number;
  sunBodies?: readonly AmbientBoundaryDebrisCollisionBody[];
  x: number;
  y: number;
}) => {
  const collidesWithBody = (body: AmbientBoundaryDebrisCollisionBody) => {
    if (body.alive === false) {
      return false;
    }

    const dx = body.pos.x - x;
    const dy = body.pos.y - y;
    const limit = body.radius + radius;
    return dx * dx + dy * dy <= limit * limit;
  };

  if (blackHoleBody !== null && blackHoleBody !== undefined) {
    if (collidesWithBody(blackHoleBody)) {
      return true;
    }
  }

  for (const bodies of [planetBodies, sunBodies, neutronStarBodies]) {
    if (bodies === undefined) {
      continue;
    }

    for (const body of bodies) {
      if (collidesWithBody(body)) {
        return true;
      }
    }
  }

  return false;
};

const updateFallingLayer = ({
  bandWidth,
  blackHoleBody,
  driftStrength,
  dtSec,
  innerRadius,
  layer,
  neutronStarBodies,
  outerRadius,
  planetBodies,
  rng,
  spawnRatePerSec,
  sizeMultiplier,
  sunBodies,
}: {
  bandWidth: number;
  blackHoleBody?: AmbientBoundaryDebrisCollisionBody | null;
  driftStrength: number;
  dtSec: number;
  innerRadius: number;
  layer: AmbientBoundaryDebrisFallingLayer;
  neutronStarBodies?: readonly AmbientBoundaryDebrisCollisionBody[];
  outerRadius: number;
  planetBodies?: readonly AmbientBoundaryDebrisCollisionBody[];
  rng: () => number;
  spawnRatePerSec: number;
  sizeMultiplier: number;
  sunBodies?: readonly AmbientBoundaryDebrisCollisionBody[];
}) => {
  const effectiveSpawnRatePerSec =
    driftStrength <= 0 ? 0 : Math.max(0, spawnRatePerSec);
  if (effectiveSpawnRatePerSec <= 0) {
    layer.spawnCountdownSec = Number.POSITIVE_INFINITY;
  } else if (!Number.isFinite(layer.spawnCountdownSec)) {
    layer.spawnCountdownSec = sampleExponentialIntervalSec(
      effectiveSpawnRatePerSec,
      rng,
    );
  }

  let spawnBudgetSec = dtSec;
  while (spawnBudgetSec > 0 && effectiveSpawnRatePerSec > 0) {
    if (layer.spawnCountdownSec > spawnBudgetSec) {
      layer.spawnCountdownSec -= spawnBudgetSec;
      break;
    }

    spawnBudgetSec -= layer.spawnCountdownSec;
    if (layer.shards.length < layer.capacity) {
      layer.shards.push(
        createFallingShard({
          bandWidth,
          driftStrength,
          innerRadius,
          kind: layer.kind,
          rng,
          sizeMultiplier,
        }),
      );
    }
    layer.spawnCountdownSec = sampleExponentialIntervalSec(
      effectiveSpawnRatePerSec,
      rng,
    );
  }

  const nextShards: AmbientBoundaryDebrisFallingShard[] = [];
  for (const shard of layer.shards) {
    const nextX = shard.posX + shard.velX * dtSec;
    const nextY = shard.posY + shard.velY * dtSec;
    const nextRadius = Math.hypot(nextX, nextY);
    const enteredInterior = shard.enteredInterior || nextRadius < innerRadius;
    if (
      collidesWithBodies({
        blackHoleBody,
        neutronStarBodies,
        planetBodies,
        radius: Math.max(shard.scaleX, shard.scaleY) * 0.45,
        sunBodies,
        x: nextX,
        y: nextY,
      })
    ) {
      continue;
    }

    if (enteredInterior && nextRadius > outerRadius + FALLING_EXIT_MARGIN) {
      continue;
    }

    nextShards.push({
      ...shard,
      enteredInterior,
      posX: nextX,
      posY: nextY,
    });
  }
  layer.shards = nextShards;

  for (let index = 0; index < layer.shards.length; index += 1) {
    const shard = layer.shards[index]!;
    const angle = Math.atan2(shard.velY, shard.velX);
    const spin = shard.spinPhase + shard.spinSpeed;

    tempPosition.set(shard.posX, shard.posY, shard.zOffset);
    tempQuaternion.setFromAxisAngle(Z_AXIS, angle + shard.yawOffset);
    tempQuaternion2.setFromAxisAngle(
      X_AXIS,
      shard.pitch + Math.sin(spin) * 0.22,
    );
    tempQuaternion.multiply(tempQuaternion2);
    tempQuaternion2.setFromAxisAngle(
      Y_AXIS,
      shard.roll + Math.cos(spin) * 0.18,
    );
    tempQuaternion.multiply(tempQuaternion2);
    tempQuaternion2.setFromAxisAngle(Z_AXIS, spin * 0.4);
    tempQuaternion.multiply(tempQuaternion2);
    tempScale.set(shard.scaleX, shard.scaleY, shard.scaleZ);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    layer.mesh.setMatrixAt(index, tempMatrix);
  }

  layer.mesh.count = layer.shards.length;
  layer.mesh.visible = layer.shards.length > 0;
  layer.mesh.instanceMatrix.needsUpdate = true;
};

const createShardLayer = ({
  accentColor,
  count,
  geometry,
  renderOrder,
  seed,
  sizeRange,
  speedRange,
}: {
  accentColor: string;
  count: number;
  geometry: BufferGeometry;
  renderOrder: number;
  seed: number;
  sizeRange: {
    maxX: number;
    maxY: number;
    maxZ: number;
    minX: number;
    minY: number;
    minZ: number;
  };
  speedRange: {
    max: number;
    min: number;
  };
}): AmbientBoundaryDebrisShardLayer => {
  const rng = mulberry32(seed);
  const material = new MeshBasicNodeMaterial();
  {
    const lightDir = normalize(vec3(-0.42, 0.56, 0.72));
    const viewDir = vec3(0, 0, 1);
    const halfDir = normalize(lightDir.add(viewDir));
    const n = normalize(normalWorld);
    const nDotL = max(dot(n, lightDir), float(0));
    const lambert = pow(nDotL.mul(0.5).add(0.5), float(1.55));
    const shading = mix(float(0.26), float(1.02), lambert);
    const nDotH = max(dot(n, halfDir), float(0));
    const spec = pow(nDotH, float(22)).mul(0.16);
    const rim = pow(float(1).sub(max(dot(n, viewDir), float(0))), float(2.8));
    const surfaceNoise = mx_fractal_noise_float(
      positionLocal.mul(2.9).add(vec3(1.7, 0.9, 2.3)),
      4,
      2,
      0.58,
      1,
    )
      .mul(0.5)
      .add(0.5);
    const striations = sin(
      positionLocal.x
        .mul(6.4)
        .add(positionLocal.y.mul(4.6))
        .sub(positionLocal.z.mul(5.2))
        .add(surfaceNoise.mul(4.2)),
    )
      .mul(0.5)
      .add(0.5);
    const rockBase = mix(color("#454b53"), color("#7a838d"), surfaceNoise);
    const chipped = mix(rockBase, color("#909ba8"), striations.mul(0.22));
    material.colorNode = chipped
      .mul(shading)
      .add(color(accentColor).mul(rim.mul(0.08)))
      .add(color("#eef4fb").mul(spec));
  }
  const mesh = new InstancedMesh(geometry, material, count);
  const specs: AmbientBoundaryDebrisShardSpec[] = [];

  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);

  for (let index = 0; index < count; index += 1) {
    specs.push({
      angle: rng() * TAU,
      angularSpeed: lerp(speedRange.min, speedRange.max, rng()),
      pitch: -0.85 + rng() * 1.7,
      radiusAlpha: rng(),
      radialJitterAlpha: 0.04 + rng() * 0.14,
      radialPhase: rng() * TAU,
      radialSpeed: 0.24 + rng() * 0.8,
      roll: -0.9 + rng() * 1.8,
      scaleX: lerp(sizeRange.minX, sizeRange.maxX, rng()),
      scaleY: lerp(sizeRange.minY, sizeRange.maxY, rng()),
      scaleZ: lerp(sizeRange.minZ, sizeRange.maxZ, rng()),
      spinPhase: rng() * TAU,
      spinSpeed: -0.65 + rng() * 1.3,
      yawOffset: rng() * TAU,
      zOffset: -1.2 + rng() * 2.4,
    });
  }

  return { mesh, specs };
};

const createRockGeometry = (radius: number, seed: number): BufferGeometry => {
  const baseGeometry = new IcosahedronGeometry(radius, 0);
  const geometry =
    baseGeometry.index === null ? baseGeometry : baseGeometry.toNonIndexed();
  const positionAttribute = geometry.getAttribute(
    "position",
  ) as Float32BufferAttribute;
  const positions = positionAttribute.array as Float32Array;

  for (let offset = 0; offset < positions.length; offset += 3) {
    const x = positions[offset]!;
    const y = positions[offset + 1]!;
    const z = positions[offset + 2]!;
    const length = Math.hypot(x, y, z) || 1;
    const nx = x / length;
    const ny = y / length;
    const nz = z / length;
    const hashSeed = nx * 12.9898 + ny * 78.233 + nz * 37.719 + seed * 0.0001;
    const jitter =
      0.78 + 0.36 * ((((Math.sin(hashSeed) * 43758.5453) % 1) + 1) % 1);
    const ridge = 0.9 + 0.18 * Math.abs(nx * 0.7 - ny * 0.32 + nz * 0.64);
    const stretchX = 0.92 + 0.18 * Math.abs(nx);
    const stretchY = 0.9 + 0.22 * Math.abs(ny);
    const stretchZ = 0.88 + 0.2 * Math.abs(nz);

    positions[offset] = nx * radius * jitter * ridge * stretchX;
    positions[offset + 1] = ny * radius * jitter * ridge * stretchY;
    positions[offset + 2] = nz * radius * jitter * ridge * stretchZ;
  }

  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
};

export const createAmbientBoundaryDebrisVisual = ({
  renderOrder = -12,
  z = -5,
}: CreateAmbientBoundaryDebrisVisualOptions = {}): AmbientBoundaryDebrisVisual => {
  const tuning = getAmbientBoundaryDebrisTuning();
  const bandGroup = new Group();
  bandGroup.position.z = z;
  bandGroup.visible = false;

  const density = tuning.density;
  const primaryCount = Math.max(
    18,
    Math.round(BASE_PRIMARY_SHARD_COUNT * density),
  );
  const secondaryCount = Math.max(
    36,
    Math.round(BASE_SECONDARY_SHARD_COUNT * density),
  );
  const dustCount = Math.max(24, Math.round(BASE_DUST_COUNT * density));
  const coolTint = tintColor(tuning.coolColor, 0.01, -0.06, 0.22);
  const warmTint = tintColor(tuning.warmColor, -0.01, 0.03, 0.14);

  const primaryGeometry = createRockGeometry(1, 0x5baf1d);
  const secondaryGeometry = createRockGeometry(1, 0x91ce47);

  const primaryLayer = createShardLayer({
    accentColor: `#${coolTint.getHexString()}`,
    count: primaryCount,
    geometry: primaryGeometry,
    renderOrder,
    seed: 0x5baf1d,
    sizeRange: scaleShardRange(BASE_SHARD_SCALE.primary, tuning.largeRockScale),
    speedRange: { min: 0.026, max: 0.052 },
  });
  const secondaryLayer = createShardLayer({
    accentColor: `#${warmTint.getHexString()}`,
    count: secondaryCount,
    geometry: secondaryGeometry,
    renderOrder,
    seed: 0x91ce47,
    sizeRange: scaleShardRange(
      BASE_SHARD_SCALE.secondary,
      tuning.smallRockScale,
    ),
    speedRange: { min: 0.038, max: 0.082 },
  });

  bandGroup.add(primaryLayer.mesh, secondaryLayer.mesh);
  const fallingGroup = new Group();
  fallingGroup.position.z = z + 0.16;
  fallingGroup.visible = true;
  const fallingPrimaryLayer = createFallingLayer({
    capacity: FALLING_LAYER_CAPACITY.primary,
    geometry: primaryGeometry,
    kind: "primary",
    material: primaryLayer.mesh.material as MeshBasicNodeMaterial,
    renderOrder,
  });
  const fallingSecondaryLayer = createFallingLayer({
    capacity: FALLING_LAYER_CAPACITY.secondary,
    geometry: secondaryGeometry,
    kind: "secondary",
    material: secondaryLayer.mesh.material as MeshBasicNodeMaterial,
    renderOrder,
  });
  fallingGroup.add(fallingPrimaryLayer.mesh, fallingSecondaryLayer.mesh);

  const geometry = new BufferGeometry();
  const positions = new Float32Array(dustCount * 3);
  const colors = new Float32Array(dustCount * 3);
  const opacity = new Float32Array(dustCount);
  const positionAttribute = new Float32BufferAttribute(positions, 3);
  const colorAttribute = new Float32BufferAttribute(colors, 3);
  const opacityAttribute = new Float32BufferAttribute(opacity, 1);
  positionAttribute.setUsage(DynamicDrawUsage);
  colorAttribute.setUsage(DynamicDrawUsage);
  opacityAttribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("ambientBoundaryDebrisColor", colorAttribute);
  geometry.setAttribute("ambientBoundaryDebrisOpacity", opacityAttribute);
  geometry.setDrawRange(0, dustCount);

  const dustSpecs: AmbientBoundaryDebrisDustSpec[] = [];
  const dustRng = mulberry32(0xd41d89);
  const dustColor = new Color();

  for (let index = 0; index < dustCount; index += 1) {
    dustSpecs.push({
      angle: dustRng() * TAU,
      angularSpeed: 0.028 + dustRng() * 0.05,
      opacity: 0.04 + dustRng() * 0.12,
      radiusAlpha: dustRng(),
      radialJitterAlpha: 0.05 + dustRng() * 0.16,
      radialPhase: dustRng() * TAU,
      radialSpeed: 0.16 + dustRng() * 0.44,
      twinklePhase: dustRng() * TAU,
      twinkleSpeed: 0.35 + dustRng() * 1.4,
      zOffset: -1.4 + dustRng() * 2.8,
    });

    const offset = index * 3;
    dustColor
      .copy(coolTint)
      .lerp(warmTint, 0.12 + dustRng() * 0.48)
      .offsetHSL(0, 0.01, 0.02 + dustRng() * 0.12);
    colors[offset] = dustColor.r;
    colors[offset + 1] = dustColor.g;
    colors[offset + 2] = dustColor.b;
    opacity[index] = 0;
  }

  const material = new PointsNodeMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  material.alphaTest = 0.01;
  material.colorNode = attribute("ambientBoundaryDebrisColor", "vec3");
  material.opacityNode = attribute("ambientBoundaryDebrisOpacity", "float");
  material.size = tuning.dustSize;

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.position.z = z + 0.2;
  points.renderOrder = renderOrder + 1;
  points.visible = false;

  return {
    bandGeometries: [primaryGeometry, secondaryGeometry],
    bandGroup,
    bandMaterials: [
      primaryLayer.mesh.material as MeshBasicNodeMaterial,
      secondaryLayer.mesh.material as MeshBasicNodeMaterial,
    ],
    colorAttribute,
    dustSpecs,
    fallingGroup,
    fallingLayers: [fallingPrimaryLayer, fallingSecondaryLayer],
    geometry,
    lastUpdateSec: null,
    opacityAttribute,
    points,
    positionAttribute,
    shardLayers: [primaryLayer, secondaryLayer],
    spawnRng: mulberry32(0x7b5a4f1d),
  };
};

export const resetAmbientBoundaryDebrisVisual = (
  visual: AmbientBoundaryDebrisVisual,
) => {
  visual.lastUpdateSec = null;
  clearAmbientBoundaryDebrisFallingLayers(visual);
};

const clearAmbientBoundaryDebrisFallingLayers = (
  visual: AmbientBoundaryDebrisVisual,
) => {
  visual.fallingGroup.visible = false;
  for (const layer of visual.fallingLayers) {
    layer.spawnCountdownSec = Number.POSITIVE_INFINITY;
    layer.shards.length = 0;
    const hadActiveInstances = layer.mesh.count > 0 || layer.mesh.visible;
    layer.mesh.count = 0;
    layer.mesh.visible = false;
    if (hadActiveInstances) {
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
  }
};

const updateShardLayer = ({
  bandWidth,
  innerRadius,
  layer,
  nowSec,
  sizeMultiplier,
  speedMultiplier,
}: {
  bandWidth: number;
  innerRadius: number;
  layer: AmbientBoundaryDebrisShardLayer;
  nowSec: number;
  sizeMultiplier: number;
  speedMultiplier: number;
}) => {
  for (let index = 0; index < layer.specs.length; index += 1) {
    const spec = layer.specs[index]!;
    const baseRadius = getBandRadius({
      bandWidth,
      innerRadius,
      nowSec,
      outerRadius: innerRadius + bandWidth,
      radialJitterAlpha: spec.radialJitterAlpha,
      radialPhase: spec.radialPhase,
      radialSpeed: spec.radialSpeed,
      radiusAlpha: spec.radiusAlpha,
      speedMultiplier,
    });
    const angle = spec.angle + nowSec * spec.angularSpeed * speedMultiplier;
    const radius = baseRadius;
    const spin = spec.spinPhase + nowSec * spec.spinSpeed * speedMultiplier;

    tempPosition.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      spec.zOffset,
    );
    tempQuaternion.setFromAxisAngle(Z_AXIS, angle + spec.yawOffset);
    tempQuaternion2.setFromAxisAngle(
      X_AXIS,
      spec.pitch + Math.sin(spin) * 0.28,
    );
    tempQuaternion.multiply(tempQuaternion2);
    tempQuaternion2.setFromAxisAngle(Y_AXIS, spec.roll + Math.cos(spin) * 0.22);
    tempQuaternion.multiply(tempQuaternion2);
    tempQuaternion2.setFromAxisAngle(Z_AXIS, spin * 0.55);
    tempQuaternion.multiply(tempQuaternion2);
    tempScale.set(
      spec.scaleX * sizeMultiplier,
      spec.scaleY * sizeMultiplier,
      spec.scaleZ * sizeMultiplier,
    );
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    layer.mesh.setMatrixAt(index, tempMatrix);
  }

  layer.mesh.instanceMatrix.needsUpdate = true;
  layer.mesh.visible = true;
};

export const updateAmbientBoundaryDebrisVisual = ({
  blackHoleBody,
  enableFallingDebris = true,
  innerRadius,
  nowSec,
  neutronStarBodies,
  outerRadius,
  planetBodies,
  sunBodies,
  visual,
}: UpdateAmbientBoundaryDebrisVisualOptions) => {
  const tuning = getAmbientBoundaryDebrisTuning();
  const clampedInnerRadius = Math.max(0, innerRadius);
  const clampedOuterRadius = Math.max(clampedInnerRadius, outerRadius);
  const bandWidth = clampedOuterRadius - clampedInnerRadius;
  const previousUpdateSec = visual.lastUpdateSec;
  visual.lastUpdateSec = nowSec;

  if (bandWidth <= HIDDEN_EPSILON) {
    visual.bandGroup.visible = false;
    visual.points.visible = false;
    visual.geometry.setDrawRange(0, 0);
    resetAmbientBoundaryDebrisVisual(visual);
    return;
  }

  visual.bandGroup.visible = true;
  const asteroidFieldTuning = getAsteroidFieldTuning();
  for (const [index, layer] of visual.shardLayers.entries()) {
    updateShardLayer({
      bandWidth,
      innerRadius: clampedInnerRadius,
      layer,
      nowSec,
      sizeMultiplier:
        index === 0 ? tuning.largeRockScale : tuning.smallRockScale,
      speedMultiplier: tuning.speed,
    });
  }

  const positionArray = visual.positionAttribute.array as Float32Array;
  const opacityArray = visual.opacityAttribute.array as Float32Array;
  const dustCount = visual.dustSpecs.length;
  const dustMaterial = visual.points.material as PointsNodeMaterial;
  dustMaterial.size = tuning.dustSize;

  for (let index = 0; index < dustCount; index += 1) {
    const spec = visual.dustSpecs[index]!;
    const baseRadius = getBandRadius({
      bandWidth,
      innerRadius: clampedInnerRadius,
      nowSec,
      outerRadius: clampedOuterRadius,
      radialJitterAlpha: spec.radialJitterAlpha,
      radialPhase: spec.radialPhase,
      radialSpeed: spec.radialSpeed,
      radiusAlpha: spec.radiusAlpha,
      speedMultiplier: tuning.speed,
    });
    const angle = spec.angle + nowSec * spec.angularSpeed * tuning.speed;
    const radius = baseRadius;
    const offset = index * 3;
    const twinkle =
      0.72 +
      0.28 *
        Math.sin(spec.twinklePhase + nowSec * spec.twinkleSpeed * tuning.speed);

    positionArray[offset] = Math.cos(angle) * radius;
    positionArray[offset + 1] = Math.sin(angle) * radius;
    positionArray[offset + 2] = spec.zOffset;
    opacityArray[index] = spec.opacity * twinkle;
  }

  visual.geometry.setDrawRange(0, dustCount);
  visual.positionAttribute.needsUpdate = true;
  visual.opacityAttribute.needsUpdate = true;
  visual.points.visible = true;

  if (!enableFallingDebris) {
    clearAmbientBoundaryDebrisFallingLayers(visual);
    return;
  }

  if (previousUpdateSec === null) {
    resetAmbientBoundaryDebrisVisual(visual);
    visual.lastUpdateSec = nowSec;
    visual.fallingGroup.visible = true;
    return;
  }

  const totalDtSec = clamp(nowSec - previousUpdateSec, 0, 1.2);
  let remainingDtSec = totalDtSec;
  let steps = 0;
  while (remainingDtSec > 0 && steps < FALLING_MAX_UPDATE_STEPS) {
    const dtSec = Math.min(FALLING_MAX_STEP_SEC, remainingDtSec);
    for (const layer of visual.fallingLayers) {
      updateFallingLayer({
        bandWidth,
        blackHoleBody,
        driftStrength:
          layer.kind === "primary"
            ? asteroidFieldTuning.large.randomization
            : asteroidFieldTuning.small.randomization,
        dtSec,
        innerRadius: clampedInnerRadius,
        layer,
        neutronStarBodies,
        outerRadius: clampedOuterRadius,
        planetBodies,
        rng: visual.spawnRng,
        spawnRatePerSec:
          layer.kind === "primary"
            ? asteroidFieldTuning.large.spawnRatePerSec
            : asteroidFieldTuning.small.spawnRatePerSec,
        sizeMultiplier:
          layer.kind === "primary"
            ? tuning.largeRockScale
            : tuning.smallRockScale,
        sunBodies,
      });
    }
    remainingDtSec -= dtSec;
    steps += 1;
  }
};
