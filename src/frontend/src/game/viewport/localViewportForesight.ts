import type { Vec2 } from "@3body/shared";
import {
  Color,
  type Group,
  type Line,
  type LineBasicMaterial,
  type Points,
  type PointsNodeMaterial,
} from "three/webgpu";
import type { Float32BufferAttribute } from "three/webgpu";
import type { CombatSandboxPlanet, CombatSandboxSun } from "../combatSandbox";
import { getRenderedPlanetRadius } from "../planetVisualTuning";
import { getRuntimeTuningDocument } from "../runtimeTuning";

export interface ForesightVisual {
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

export const getLocalViewportForesightPathTuning = () =>
  getRuntimeTuningDocument().visuals.abilities.foresight;

export const getForesightBodySurface = (
  entityId: number,
  renderPlanetsById: ReadonlyMap<number, CombatSandboxPlanet>,
  renderSunsById: ReadonlyMap<number, CombatSandboxSun>,
): { hiddenRadius: number; origin: Vec2 } | null => {
  const planet = renderPlanetsById.get(entityId) ?? null;
  if (planet?.alive) {
    return {
      hiddenRadius: getRenderedPlanetRadius(planet) + 2,
      origin: planet.pos,
    };
  }

  const sun = renderSunsById.get(entityId) ?? null;
  if (sun !== null && sun.swallowedAtSec === null) {
    return {
      hiddenRadius: sun.radius + 2,
      origin: sun.pos,
    };
  }

  return null;
};

export const updateForesightVisual = (
  foresightVisual: ForesightVisual,
  pathPoints: readonly Vec2[],
  tuning: ReturnType<typeof getLocalViewportForesightPathTuning>,
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
