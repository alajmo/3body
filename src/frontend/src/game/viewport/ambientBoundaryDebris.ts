import {
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

interface AmbientBoundaryDebrisShardLayer {
  mesh: InstancedMesh;
  specs: AmbientBoundaryDebrisShardSpec[];
}

export interface AmbientBoundaryDebrisVisual {
  bandGeometries: Array<{ dispose: () => void }>;
  bandGroup: Group;
  bandMaterials: Array<{ dispose: () => void }>;
  colorAttribute: Float32BufferAttribute;
  dustSpecs: AmbientBoundaryDebrisDustSpec[];
  geometry: BufferGeometry;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  shardLayers: AmbientBoundaryDebrisShardLayer[];
}

interface CreateAmbientBoundaryDebrisVisualOptions {
  renderOrder?: number;
  z?: number;
}

interface UpdateAmbientBoundaryDebrisVisualOptions {
  innerRadius: number;
  nowSec: number;
  outerRadius: number;
  visual: AmbientBoundaryDebrisVisual;
}

const tempMatrix = new Matrix4();
const tempPosition = new Vector3();
const tempQuaternion = new Quaternion();
const tempQuaternion2 = new Quaternion();
const tempScale = new Vector3();

const getAmbientBoundaryDebrisTuning = (): OrbitBoundaryDebrisVisualTuning =>
  getRuntimeTuningDocument().visuals.orbits.boundaryDebris;

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
  const geometry = new IcosahedronGeometry(radius, 0).toNonIndexed();
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
}: CreateAmbientBoundaryDebrisVisualOptions): AmbientBoundaryDebrisVisual => {
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
    geometry,
    opacityAttribute,
    points,
    positionAttribute,
    shardLayers: [primaryLayer, secondaryLayer],
  };
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
    const angle = spec.angle + nowSec * spec.angularSpeed * speedMultiplier;
    const radius =
      innerRadius +
      bandWidth * spec.radiusAlpha +
      Math.sin(spec.radialPhase + nowSec * spec.radialSpeed * speedMultiplier) *
        bandWidth *
        spec.radialJitterAlpha;
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
  innerRadius,
  nowSec,
  outerRadius,
  visual,
}: UpdateAmbientBoundaryDebrisVisualOptions) => {
  const tuning = getAmbientBoundaryDebrisTuning();
  const clampedInnerRadius = Math.max(0, innerRadius);
  const clampedOuterRadius = Math.max(clampedInnerRadius, outerRadius);
  const bandWidth = clampedOuterRadius - clampedInnerRadius;

  if (bandWidth <= HIDDEN_EPSILON) {
    visual.bandGroup.visible = false;
    visual.points.visible = false;
    visual.geometry.setDrawRange(0, 0);
    return;
  }

  visual.bandGroup.visible = true;
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
    const angle = spec.angle + nowSec * spec.angularSpeed * tuning.speed;
    const radius =
      clampedInnerRadius +
      bandWidth * spec.radiusAlpha +
      Math.sin(spec.radialPhase + nowSec * spec.radialSpeed * tuning.speed) *
        bandWidth *
        spec.radialJitterAlpha;
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
};
