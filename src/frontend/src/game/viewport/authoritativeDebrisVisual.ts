import type { AsteroidTier, Debris, PlanetPublic } from "@3body/shared";
import { getBoundaryAsteroidImpactRadius } from "@3body/shared";
import {
  attribute,
  color,
  dot,
  float,
  max,
  mix,
  normalize,
  normalWorld,
  pow,
  vec3,
} from "three/tsl";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  Points,
  PointsNodeMaterial,
  Quaternion,
  Vector3,
} from "three/webgpu";
import { getPlanetArchetypeVisuals } from "../planetVisualTuning";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import type { AmbientBoundaryDebrisVisual } from "./ambientBoundaryDebris";

interface BoundaryAsteroidLayerVisual {
  activeCount: number;
  capacity: number;
  mesh: InstancedMesh;
}

interface AuthoritativeDebrisVisual {
  boundaryAsteroidLayers: Record<AsteroidTier, BoundaryAsteroidLayerVisual>;
  colorAttribute: Float32BufferAttribute;
  disposables?: Array<{ dispose: () => void }>;
  geometry: BufferGeometry;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
}

const DEFAULT_DEBRIS_COLOR = "#d7f1ff";
const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const HIDDEN_DEBRIS_POSITION = new Vector3(1e8, 1e8, 1e8);
const HIDDEN_DEBRIS_ROTATION = new Quaternion();
const HIDDEN_DEBRIS_SCALE = new Vector3(0.001, 0.001, 0.001);
const BOUNDARY_ASTEROID_RENDER_ORDER = [
  "large",
  "small",
  "micro",
] as const satisfies readonly AsteroidTier[];
const BOUNDARY_ASTEROID_FALLOUT_TIERS = [
  "large",
  "small",
] as const satisfies readonly AsteroidTier[];
const BOUNDARY_ASTEROID_COLOR_BY_TIER = {
  large: "#ffb87a",
  micro: "#d7f1ff",
  small: "#ffd98f",
} as const satisfies Record<AsteroidTier, string>;
const EMPTY_BOUNDARY_ASTEROID_COUNTS = {
  large: 0,
  micro: 0,
  small: 0,
} as const satisfies Record<AsteroidTier, number>;
const cachedColors = new Map<string, Color>();
const tempMatrix = new Matrix4();
const tempPosition = new Vector3();
const tempRotation = new Quaternion();
const tempRotationTilt = new Quaternion();
const tempScale = new Vector3();

const createHiddenInstanceMatrix = () =>
  new Matrix4().compose(
    HIDDEN_DEBRIS_POSITION,
    HIDDEN_DEBRIS_ROTATION,
    HIDDEN_DEBRIS_SCALE,
  );

const getCachedColor = (value: string): Color => {
  const cached = cachedColors.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const resolved = new Color(value);
  cachedColors.set(value, resolved);
  return resolved;
};

const tintColor = (
  value: string,
  hueOffset: number,
  saturationOffset: number,
  lightnessOffset: number,
): Color => {
  const result = new Color(value);
  result.offsetHSL(hueOffset, saturationOffset, lightnessOffset);
  return result;
};

const createBoundaryAsteroidGeometry = (
  radius: number,
  seed: number,
): BufferGeometry => {
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
      0.8 + 0.34 * ((((Math.sin(hashSeed) * 43758.5453) % 1) + 1) % 1);
    const ridge = 0.92 + 0.16 * Math.abs(nx * 0.66 - ny * 0.28 + nz * 0.58);
    const stretchX = 0.9 + 0.2 * Math.abs(nx);
    const stretchY = 0.88 + 0.24 * Math.abs(ny);
    const stretchZ = 0.86 + 0.22 * Math.abs(nz);

    positions[offset] = nx * radius * jitter * ridge * stretchX;
    positions[offset + 1] = ny * radius * jitter * ridge * stretchY;
    positions[offset + 2] = nz * radius * jitter * ridge * stretchZ;
  }

  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
};

const createBoundaryAsteroidMaterial = (
  accentColor: string,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial();
  const accent = tintColor(accentColor, 0.01, -0.03, 0.18);

  {
    const lightDir = normalize(vec3(-0.38, 0.61, 0.7));
    const viewDir = vec3(0, 0, 1);
    const halfDir = normalize(lightDir.add(viewDir));
    const n = normalize(normalWorld);
    const nDotL = max(dot(n, lightDir), float(0));
    const lambert = pow(nDotL.mul(0.5).add(0.5), float(1.6));
    const shading = mix(float(0.24), float(1.04), lambert);
    const nDotH = max(dot(n, halfDir), float(0));
    const spec = pow(nDotH, float(20)).mul(0.12);
    const rim = pow(float(1).sub(max(dot(n, viewDir), float(0))), float(2.9));
    material.colorNode = color("#505860")
      .mul(shading)
      .add(color(`#${accent.getHexString()}`).mul(rim.mul(0.14)))
      .add(color("#edf5ff").mul(spec));
  }

  return material;
};

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

const hideInstancedMeshRange = (
  mesh: InstancedMesh,
  fromIndex: number,
  toIndex: number,
): boolean => {
  if (fromIndex >= toIndex) {
    return false;
  }

  tempMatrix.compose(
    HIDDEN_DEBRIS_POSITION,
    HIDDEN_DEBRIS_ROTATION,
    HIDDEN_DEBRIS_SCALE,
  );
  for (let index = fromIndex; index < toIndex; index += 1) {
    mesh.setMatrixAt(index, tempMatrix);
  }

  return true;
};

const getBoundaryAsteroidFalloutLayer = (
  boundaryDebrisVisual: AmbientBoundaryDebrisVisual,
  kind: "primary" | "secondary",
) =>
  boundaryDebrisVisual.fallingLayers.find((layer) => layer.kind === kind) ??
  null;

const updateBoundaryAsteroidFalloutVisual = ({
  boundaryDebrisVisual,
  debris,
  nowSec,
}: {
  boundaryDebrisVisual: AmbientBoundaryDebrisVisual;
  debris: readonly Debris[];
  nowSec: number;
}): Record<AsteroidTier, number> => {
  const highlightedCounts: Record<AsteroidTier, number> = {
    ...EMPTY_BOUNDARY_ASTEROID_COUNTS,
  };
  const highlightedLayers = {
    large: getBoundaryAsteroidFalloutLayer(boundaryDebrisVisual, "primary"),
    small: getBoundaryAsteroidFalloutLayer(boundaryDebrisVisual, "secondary"),
  } as const;

  boundaryDebrisVisual.fallingGroup.visible = false;
  for (const layer of boundaryDebrisVisual.fallingLayers) {
    layer.spawnCountdownSec = Number.POSITIVE_INFINITY;
    layer.shards.length = 0;
  }

  for (const tier of BOUNDARY_ASTEROID_FALLOUT_TIERS) {
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
      tempPosition.set(piece.pos.x, piece.pos.y, 0.08 + activeCount * 1e-4);
      tempRotation.setFromAxisAngle(Z_AXIS, yaw);
      tempRotationTilt.setFromAxisAngle(
        X_AXIS,
        Math.sin(spinPhase + piece.id * 0.17) * 0.36,
      );
      tempRotation.multiply(tempRotationTilt);
      tempRotationTilt.setFromAxisAngle(
        Y_AXIS,
        Math.cos(spinPhase * 0.8 + piece.id * 0.13) * 0.28,
      );
      tempRotation.multiply(tempRotationTilt);
      tempRotationTilt.setFromAxisAngle(Z_AXIS, spinPhase * 0.45);
      tempRotation.multiply(tempRotationTilt);
      tempScale.set(
        scaleRadius,
        scaleRadius * (tier === "large" ? 0.92 : 0.86),
        Math.max(scaleRadius * (tier === "large" ? 0.84 : 0.76), 1),
      );
      tempMatrix.compose(tempPosition, tempRotation, tempScale);
      layer.mesh.setMatrixAt(activeCount, tempMatrix);
      activeCount += 1;
    }

    const didHide = hideInstancedMeshRange(
      layer.mesh,
      activeCount,
      layer.mesh.count,
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

const createAuthoritativeDebrisVisual = ({
  sampleLimit,
}: {
  sampleLimit: number;
}): AuthoritativeDebrisVisual => {
  const safeSampleLimit = Math.max(0, sampleLimit);
  const instanceLimit = Math.max(1, safeSampleLimit);
  const debrisGeometry = new BufferGeometry();
  const debrisPositions = new Float32Array(instanceLimit * 3);
  const debrisColors = new Float32Array(instanceLimit * 3);
  const debrisOpacity = new Float32Array(instanceLimit);
  const debrisPositionAttribute = new Float32BufferAttribute(
    debrisPositions,
    3,
  );
  const debrisColorAttribute = new Float32BufferAttribute(debrisColors, 3);
  const debrisOpacityAttribute = new Float32BufferAttribute(debrisOpacity, 1);
  debrisPositionAttribute.setUsage(DynamicDrawUsage);
  debrisColorAttribute.setUsage(DynamicDrawUsage);
  debrisOpacityAttribute.setUsage(DynamicDrawUsage);
  debrisGeometry.setAttribute("position", debrisPositionAttribute);
  debrisGeometry.setAttribute("debrisColor", debrisColorAttribute);
  debrisGeometry.setAttribute("debrisOpacity", debrisOpacityAttribute);
  debrisGeometry.setDrawRange(0, 0);

  const debrisMaterial = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  debrisMaterial.colorNode = attribute("debrisColor", "vec3");
  debrisMaterial.opacityNode = attribute("debrisOpacity", "float");
  debrisMaterial.size = 10;
  debrisMaterial.alphaTest = 0.01;
  const debrisPoints = new Points(debrisGeometry, debrisMaterial);
  debrisPoints.renderOrder = 10;
  debrisPoints.position.z = 2;
  debrisPoints.frustumCulled = false;

  const boundaryAsteroidGeometry = createBoundaryAsteroidGeometry(1, 0x73a9d1);
  const hiddenInit = createHiddenInstanceMatrix();
  const createBoundaryAsteroidLayer = (
    tier: AsteroidTier,
  ): BoundaryAsteroidLayerVisual => {
    const material = createBoundaryAsteroidMaterial(
      BOUNDARY_ASTEROID_COLOR_BY_TIER[tier],
    );
    const mesh = new InstancedMesh(
      boundaryAsteroidGeometry,
      material,
      instanceLimit,
    );
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let index = 0; index < instanceLimit; index += 1) {
      mesh.setMatrixAt(index, hiddenInit);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 11;
    mesh.position.z = 2.05;
    mesh.name = `authoritativeBoundaryAsteroid:${tier}`;

    return {
      activeCount: 0,
      capacity: safeSampleLimit,
      mesh,
    };
  };

  const boundaryAsteroidLayers: Record<
    AsteroidTier,
    BoundaryAsteroidLayerVisual
  > = {
    large: createBoundaryAsteroidLayer("large"),
    micro: createBoundaryAsteroidLayer("micro"),
    small: createBoundaryAsteroidLayer("small"),
  };

  return {
    boundaryAsteroidLayers,
    colorAttribute: debrisColorAttribute,
    disposables: [
      debrisGeometry,
      debrisMaterial,
      boundaryAsteroidGeometry,
      ...Object.values(boundaryAsteroidLayers).map(
        (layer) => layer.mesh.material as MeshBasicNodeMaterial,
      ),
    ],
    geometry: debrisGeometry,
    opacityAttribute: debrisOpacityAttribute,
    points: debrisPoints,
    positionAttribute: debrisPositionAttribute,
  };
};

export const updateAuthoritativeDebrisVisual = ({
  boundaryDebrisVisual,
  debris,
  maxSamples,
  nowSec,
  planets,
  visual,
}: {
  boundaryDebrisVisual: AmbientBoundaryDebrisVisual;
  debris: readonly Debris[];
  maxSamples: number;
  nowSec: number;
  planets: readonly PlanetPublic[];
  visual: AuthoritativeDebrisVisual;
}) => {
  const highlightedBoundaryAsteroidCounts = updateBoundaryAsteroidFalloutVisual(
    {
      boundaryDebrisVisual,
      debris,
      nowSec,
    },
  );
  const positionArray = visual.positionAttribute.array as Float32Array;
  const colorArray = visual.colorAttribute.array as Float32Array;
  const opacityArray = visual.opacityAttribute.array as Float32Array;
  const sampleBudget = Math.max(0, maxSamples);
  const ownerColorByPlayerId = new Map(
    planets.map((planet) => [
      planet.playerId,
      getPlanetArchetypeVisuals(planet.archetype).color,
    ]),
  );
  let drawCount = 0;
  const boundaryAsteroidCounts: Record<AsteroidTier, number> = {
    ...EMPTY_BOUNDARY_ASTEROID_COUNTS,
  };

  for (const tier of BOUNDARY_ASTEROID_RENDER_ORDER) {
    const layer = visual.boundaryAsteroidLayers[tier];
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
      if (nextIndex >= layer.capacity) {
        break;
      }

      const spinPhase = nowSec * (0.7 + (piece.id % 7) * 0.11);
      const yaw = Math.atan2(piece.vel.y, piece.vel.x) + (piece.id % 5) * 0.3;
      const scaleRadius = getBoundaryAsteroidVisualRadius(tier, piece.radius);
      tempPosition.set(piece.pos.x, piece.pos.y, 2.1 + nextIndex * 1e-4);
      tempRotation.setFromAxisAngle(Z_AXIS, yaw);
      tempRotationTilt.setFromAxisAngle(
        X_AXIS,
        Math.sin(spinPhase + piece.id * 0.17) * 0.36,
      );
      tempRotation.multiply(tempRotationTilt);
      tempRotationTilt.setFromAxisAngle(
        Y_AXIS,
        Math.cos(spinPhase * 0.8 + piece.id * 0.13) * 0.28,
      );
      tempRotation.multiply(tempRotationTilt);
      tempRotationTilt.setFromAxisAngle(Z_AXIS, spinPhase * 0.45);
      tempRotation.multiply(tempRotationTilt);
      tempScale.set(
        scaleRadius,
        scaleRadius * 0.92,
        Math.max(scaleRadius * 0.84, 1),
      );
      tempMatrix.compose(tempPosition, tempRotation, tempScale);
      layer.mesh.setMatrixAt(nextIndex, tempMatrix);
      boundaryAsteroidCounts[tier] += 1;
    }
  }

  for (const piece of debris) {
    if (piece.asteroidTier !== undefined || drawCount >= sampleBudget) {
      continue;
    }

    const offset = drawCount * 3;
    const tint = getCachedColor(
      piece.ownerPlayerId === undefined
        ? DEFAULT_DEBRIS_COLOR
        : (ownerColorByPlayerId.get(piece.ownerPlayerId) ??
            DEFAULT_DEBRIS_COLOR),
    );
    positionArray[offset] = piece.pos.x;
    positionArray[offset + 1] = piece.pos.y;
    positionArray[offset + 2] = 0;
    colorArray[offset] = tint.r;
    colorArray[offset + 1] = tint.g;
    colorArray[offset + 2] = tint.b;
    opacityArray[drawCount] = 0.9;
    drawCount += 1;
  }

  visual.geometry.setDrawRange(0, drawCount);
  visual.positionAttribute.needsUpdate = true;
  visual.colorAttribute.needsUpdate = true;
  visual.opacityAttribute.needsUpdate = true;
  visual.points.visible = drawCount > 0;

  for (const tier of BOUNDARY_ASTEROID_RENDER_ORDER) {
    const layer = visual.boundaryAsteroidLayers[tier];
    const activeCount = boundaryAsteroidCounts[tier];
    const didHide = hideInstancedMeshRange(
      layer.mesh,
      activeCount,
      layer.activeCount,
    );
    layer.activeCount = activeCount;
    layer.mesh.count = activeCount;
    layer.mesh.visible = activeCount > 0;
    if (activeCount > 0 || didHide) {
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
  }
};
