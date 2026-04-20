import type { Vec2 } from "@3body/shared";
import { attribute, color } from "three/tsl";
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsNodeMaterial,
} from "three/webgpu";

export interface PlanetTrailVisual {
  geometry: BufferGeometry;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  samples: Vec2[];
}

export const pushPlanetTrailSample = (
  trail: PlanetTrailVisual,
  position: Vec2,
  maxTrailSamples: number,
) => {
  trail.samples.push({ x: position.x, y: position.y });
  if (trail.samples.length > maxTrailSamples) {
    trail.samples.shift();
  }
};

export const updatePlanetTrailVisual = (
  trail: PlanetTrailVisual,
  maxTrailSamples: number,
) => {
  const positionArray = trail.positionAttribute.array as Float32Array;
  const opacityArray = trail.opacityAttribute.array as Float32Array;
  const sampleCount = Math.min(trail.samples.length, maxTrailSamples);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = trail.samples[index]!;
    const offset = index * 3;
    const progress = sampleCount <= 1 ? 1 : index / (sampleCount - 1);
    positionArray[offset] = sample.x;
    positionArray[offset + 1] = sample.y;
    positionArray[offset + 2] = 0;
    opacityArray[index] = progress * progress * 0.75;
  }

  trail.geometry.setDrawRange(0, sampleCount);
  trail.positionAttribute.needsUpdate = true;
  trail.opacityAttribute.needsUpdate = true;
  trail.points.visible = sampleCount > 1;
};

export const createPlanetTrailVisual = ({
  maxTrailSamples,
  trailColor,
  trailPointSize,
}: {
  maxTrailSamples: number;
  trailColor: string;
  trailPointSize: number;
}): PlanetTrailVisual => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(maxTrailSamples * 3);
  const opacity = new Float32Array(maxTrailSamples);
  const positionAttribute = new Float32BufferAttribute(positions, 3);
  const opacityAttribute = new Float32BufferAttribute(opacity, 1);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("trailOpacity", opacityAttribute);
  geometry.setDrawRange(0, 0);

  const material = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  material.colorNode = color(trailColor);
  material.opacityNode = attribute("trailOpacity", "float");
  material.size = trailPointSize;
  material.alphaTest = 0.01;

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.position.z = -2;
  points.renderOrder = -3;

  return {
    geometry,
    opacityAttribute,
    points,
    positionAttribute,
    samples: [],
  };
};
