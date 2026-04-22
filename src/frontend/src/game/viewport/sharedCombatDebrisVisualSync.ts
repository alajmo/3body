import type { AsteroidTier } from "@3body/shared";
import { getBoundaryAsteroidImpactRadius } from "@3body/shared";
import {
  Color,
  Matrix4,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from "three/webgpu";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import type { AmbientBoundaryDebrisVisual } from "./ambientBoundaryDebris";

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

export interface SharedCombatBoundaryAsteroidLayerVisualHost {
  activeCount: number;
  capacity: number;
  mesh: InstancedMesh;
}

export interface SharedCombatDebrisVisualHost {
  boundaryAsteroidLayers: Record<
    AsteroidTier,
    SharedCombatBoundaryAsteroidLayerVisualHost
  >;
  colorAttribute: {
    array: ArrayLike<number>;
    needsUpdate: boolean;
  };
  geometry: {
    setDrawRange: (start: number, count: number) => void;
  };
  opacityAttribute: {
    array: ArrayLike<number>;
    needsUpdate: boolean;
  };
  points: {
    visible: boolean;
  };
  positionAttribute: {
    array: ArrayLike<number>;
    needsUpdate: boolean;
  };
}

const getCachedColor = (value: string): Color => {
  const cached = cachedColors.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const resolved = new Color(value);
  cachedColors.set(value, resolved);
  return resolved;
};

const getBoundaryAsteroidFalloutLayer = (
  boundaryDebrisVisual: AmbientBoundaryDebrisVisual,
  kind: "primary" | "secondary",
) =>
  boundaryDebrisVisual.fallingLayers.find((layer) => layer.kind === kind) ??
  null;

const getSharedCombatBoundaryAsteroidVisualRadius = (
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

export const syncSharedCombatDebrisPresentation = <
  DebrisBody extends {
    asteroidTier?: AsteroidTier;
    id: number;
    pos: { x: number; y: number };
    radius: number;
    vel: { x: number; y: number };
  },
>({
  boundaryDebrisVisual,
  debris,
  falloutTiers,
  maxSamples,
  nowSec,
  resolvePointColor,
  visual,
}: {
  boundaryDebrisVisual: AmbientBoundaryDebrisVisual;
  debris: readonly DebrisBody[];
  falloutTiers: readonly AsteroidTier[];
  maxSamples: number;
  nowSec: number;
  resolvePointColor: (piece: DebrisBody) => string;
  visual: SharedCombatDebrisVisualHost;
}) => {
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

  for (const tier of falloutTiers) {
    const layer =
      tier === "large"
        ? highlightedLayers.large
        : tier === "small"
          ? highlightedLayers.small
          : null;
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
      const scaleRadius = getSharedCombatBoundaryAsteroidVisualRadius(
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

  const positionArray = visual.positionAttribute.array as Float32Array;
  const colorArray = visual.colorAttribute.array as Float32Array;
  const opacityArray = visual.opacityAttribute.array as Float32Array;
  const sampleBudget = Math.max(0, maxSamples);
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

      if (skippedHighlightedCount < highlightedCounts[tier]) {
        skippedHighlightedCount += 1;
        continue;
      }

      const nextIndex = boundaryAsteroidCounts[tier];
      if (nextIndex >= layer.capacity) {
        break;
      }

      const spinPhase = nowSec * (0.7 + (piece.id % 7) * 0.11);
      const yaw = Math.atan2(piece.vel.y, piece.vel.x) + (piece.id % 5) * 0.3;
      const scaleRadius = getSharedCombatBoundaryAsteroidVisualRadius(
        tier,
        piece.radius,
      );
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
    const tint = getCachedColor(resolvePointColor(piece));
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
