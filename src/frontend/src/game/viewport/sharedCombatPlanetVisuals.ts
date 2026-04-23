import type {
  ArchetypeId,
  PlanetArchetypeVisualSpec,
  Vec2,
} from "@3body/shared";
import { clamp, mulberry32 } from "@3body/shared";
import {
  type CircleGeometry,
  Mesh,
  type MeshBasicNodeMaterial,
  type Scene,
  type SphereGeometry,
  type Vector3,
} from "three/webgpu";
import { getRuntimeTuningDocument } from "../runtimeTuning";

const getSharedCombatPlanetRotationSpeed = (index: number) =>
  0.28 + index * 0.045;

const getSharedCombatPlanetSpinPhase = (planetId: number) =>
  mulberry32(Math.imul(planetId + 1, 0x85ebca6b) >>> 0)() * Math.PI * 2;

const getSharedCombatPlanetAuraRingStops = (
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

interface PlanetGlowMaterialResult {
  contactStartNode: { value: unknown };
  fadeStartNode: { value: unknown };
  material: MeshBasicNodeMaterial;
  opacityUniform: { value: unknown };
  riseEndNode: { value: unknown };
  riseStartNode: { value: unknown };
}

interface PlanetSurfaceMaterial extends MeshBasicNodeMaterial {
  opacityUniform: { value: unknown };
}

type PlanetMaterialFactory = (
  planetVisuals: PlanetArchetypeVisualSpec,
  seed: number,
  forestProfile?: {
    color: string;
    coverage: number;
  },
) => PlanetSurfaceMaterial;

type PlanetGlowMaterialFactory = (
  planetColor: string,
  seed: number,
  auraScale: number,
  auraGap: number,
) => PlanetGlowMaterialResult;

type PlanetSpinAxisFactory = (seed: number) => Vector3;

export interface SharedCombatPlanetVisual {
  glowContactStartNode: { value: unknown };
  glowFadeStartNode: { value: unknown };
  glowMesh: Mesh;
  glowOpacityUniform: { value: unknown };
  glowRiseEndNode: { value: unknown };
  glowRiseStartNode: { value: unknown };
  material: PlanetSurfaceMaterial;
  mesh: Mesh;
  rotationSpeed: number;
  spinAxis: Vector3;
  spinPhase: number;
  surfaceOpacityUniform: { value: unknown };
}

export const createSharedCombatPlanetVisual = ({
  archetypeVisuals,
  createPlanetGlowMaterial,
  createPlanetMaterial,
  createPlanetSpinAxis,
  getPlanetForestProfile,
  glowGeometry,
  planet,
  planetGeometry,
  planetIndex,
  scene,
}: {
  archetypeVisuals: PlanetArchetypeVisualSpec;
  createPlanetGlowMaterial: PlanetGlowMaterialFactory;
  createPlanetMaterial: PlanetMaterialFactory;
  createPlanetSpinAxis: PlanetSpinAxisFactory;
  getPlanetForestProfile: (
    archetype: ArchetypeId,
    planetId: number,
  ) => {
    color: string;
    coverage: number;
  };
  glowGeometry: CircleGeometry;
  planet: {
    archetype: ArchetypeId;
    id: number;
  };
  planetGeometry: SphereGeometry;
  planetIndex: number;
  scene: Scene;
}): SharedCombatPlanetVisual => {
  const seed = planet.id * 0.173;
  const forestProfile = getPlanetForestProfile(planet.archetype, planet.id);
  const material = createPlanetMaterial(archetypeVisuals, seed, forestProfile);
  material.transparent = true;
  const glowMaterial = createPlanetGlowMaterial(
    archetypeVisuals.color,
    seed,
    archetypeVisuals.auraScale,
    archetypeVisuals.auraGap,
  );
  const mesh = new Mesh(planetGeometry, material);
  const glowMesh = new Mesh(glowGeometry, glowMaterial.material);
  const spinAxis = createPlanetSpinAxis(planet.id);
  const spinPhase = getSharedCombatPlanetSpinPhase(planet.id);

  mesh.setRotationFromAxisAngle(spinAxis, spinPhase);
  mesh.renderOrder = -2;
  glowMesh.position.z = 0.16;
  glowMesh.renderOrder = -1;
  scene.add(mesh, glowMesh);

  return {
    glowContactStartNode: glowMaterial.contactStartNode,
    glowFadeStartNode: glowMaterial.fadeStartNode,
    glowMesh,
    glowOpacityUniform: glowMaterial.opacityUniform,
    glowRiseEndNode: glowMaterial.riseEndNode,
    glowRiseStartNode: glowMaterial.riseStartNode,
    material,
    mesh,
    rotationSpeed: getSharedCombatPlanetRotationSpeed(planetIndex),
    spinAxis,
    spinPhase,
    surfaceOpacityUniform: material.opacityUniform,
  };
};

export const syncSharedCombatPlanetVisual = ({
  archetypeVisuals,
  nowSec,
  planetPosition,
  renderRadius,
  visual,
  visible = true,
}: {
  archetypeVisuals: Pick<PlanetArchetypeVisualSpec, "auraGap" | "auraScale">;
  nowSec: number;
  planetPosition: Vec2;
  renderRadius: number;
  visual: SharedCombatPlanetVisual;
  visible?: boolean;
}) => {
  visual.mesh.visible = visible;
  visual.glowMesh.visible = visible;
  visual.surfaceOpacityUniform.value = 1;
  visual.glowOpacityUniform.value = 1;

  if (!visible) {
    return;
  }

  const auraRingStops = getSharedCombatPlanetAuraRingStops(
    archetypeVisuals.auraScale,
    archetypeVisuals.auraGap,
  );
  visual.glowContactStartNode.value = auraRingStops.contactStart;
  visual.glowRiseStartNode.value = auraRingStops.riseStart;
  visual.glowRiseEndNode.value = auraRingStops.riseEnd;
  visual.glowFadeStartNode.value = auraRingStops.fadeStart;
  visual.mesh.position.set(planetPosition.x, planetPosition.y, 0);
  visual.glowMesh.position.set(planetPosition.x, planetPosition.y, 0.16);
  visual.mesh.scale.set(renderRadius, renderRadius, renderRadius);
  visual.glowMesh.scale.set(
    renderRadius * archetypeVisuals.auraScale,
    renderRadius * archetypeVisuals.auraScale,
    1,
  );
  visual.mesh.setRotationFromAxisAngle(
    visual.spinAxis,
    nowSec * visual.rotationSpeed + visual.spinPhase,
  );
};

export const disposeSharedCombatPlanetVisual = (
  visual: SharedCombatPlanetVisual,
) => {
  visual.mesh.parent?.remove(visual.mesh);
  visual.glowMesh.parent?.remove(visual.glowMesh);
  visual.material.dispose();
  (visual.glowMesh.material as { dispose: () => void }).dispose();
};
