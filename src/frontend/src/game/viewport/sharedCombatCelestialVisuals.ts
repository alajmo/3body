import type {
  NeutronStar,
  NeutronStarSpec,
  Sun,
  SunVisualProfile,
  NeutronStarVisualTuning,
} from "@3body/shared";
import { clamp, getNeutronStarMassAlpha, lerp } from "@3body/shared";
import {
  Group,
  Mesh,
  type MeshBasicNodeMaterial,
  type PlaneGeometry,
  type RingGeometry,
  type Scene,
  type SphereGeometry,
  type CircleGeometry,
} from "three/webgpu";
import {
  getNeutronStarVisualShape,
  NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR,
  NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR,
} from "../neutronStarVisuals";

const getSharedCombatSunRotationSpeed = (index: number) => 0.12 + index * 0.05;
const getSharedCombatNeutronStarPhase = (index: number, id: number) =>
  index * 0.91 + id * 0.0008;
const getSharedCombatNeutronStarSpinSpeed = (index: number) =>
  0.22 + index * 0.04;

type SunCoreMaterialFactory = (
  sunColor: string,
  glowColor: string,
  seed: number,
  brightness?: number,
) => MeshBasicNodeMaterial;

type SunGlowMaterialFactory = (
  glowColor: string,
  seed: number,
  brightness?: number,
) => MeshBasicNodeMaterial;

type WarpMaterialFactory = (
  glowColor: string,
  seed: number,
) => MeshBasicNodeMaterial;

type NeutronStarMaterialFactory = (seed: number) => MeshBasicNodeMaterial;

export interface SharedCombatSunVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  warpMesh: Mesh;
}

export interface SharedCombatNeutronStarVisual {
  coreMesh: Mesh;
  group: Group;
  haloMesh: Mesh;
  jetMeshA: Mesh;
  jetMeshB: Mesh;
  lensMesh: Mesh;
}

export const createSharedCombatSunVisual = ({
  createSunCoreMaterial,
  createSunGlowMaterial,
  createWarpMaterial,
  scene,
  sunGeometry,
  sunId,
  sunProfile,
  warpGeometry,
}: {
  createSunCoreMaterial: SunCoreMaterialFactory;
  createSunGlowMaterial: SunGlowMaterialFactory;
  createWarpMaterial: WarpMaterialFactory;
  scene: Scene;
  sunGeometry: SphereGeometry;
  sunId: number;
  sunProfile: SunVisualProfile;
  warpGeometry: RingGeometry;
}): SharedCombatSunVisual => {
  const coreMesh = new Mesh(
    sunGeometry,
    createSunCoreMaterial(
      sunProfile.color,
      sunProfile.glowColor,
      sunId,
      sunProfile.coreBrightness,
    ),
  );
  const glowMesh = new Mesh(
    sunGeometry,
    createSunGlowMaterial(
      sunProfile.glowColor,
      sunId,
      sunProfile.glowBrightness,
    ),
  );
  const warpMesh = new Mesh(
    warpGeometry,
    createWarpMaterial(sunProfile.glowColor, sunId),
  );

  coreMesh.renderOrder = -8;
  glowMesh.renderOrder = -10;
  warpMesh.renderOrder = -12;
  glowMesh.position.z = -2;
  warpMesh.position.z = -4;
  scene.add(warpMesh, glowMesh, coreMesh);

  return {
    coreMesh,
    glowMesh,
    warpMesh,
  };
};

export const syncSharedCombatSunVisual = ({
  index,
  nowSec,
  sun,
  sunProfile,
  swallowedAtSec = null,
  visual,
}: {
  index: number;
  nowSec: number;
  sun: Pick<Sun, "pos" | "radius">;
  sunProfile: SunVisualProfile;
  swallowedAtSec?: number | null;
  visual: SharedCombatSunVisual;
}) => {
  const swallowFade =
    swallowedAtSec === null
      ? 1
      : clamp(1 - (nowSec - swallowedAtSec) / 2.4, 0, 1);
  const swallowScale = lerp(0.58, 1, swallowFade);
  const visible = swallowFade > 0.01;
  const coreMaterial = visual.coreMesh.material as MeshBasicNodeMaterial;
  const glowMaterial = visual.glowMesh.material as MeshBasicNodeMaterial;
  const warpMaterial = visual.warpMesh.material as MeshBasicNodeMaterial;

  visual.coreMesh.visible = visible;
  visual.glowMesh.visible = visible;
  visual.warpMesh.visible = visible;
  if (!visible) {
    return;
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
    renderedRadius * sunProfile.glowScale,
    renderedRadius * sunProfile.glowScale,
    renderedRadius * sunProfile.glowScale,
  );
  visual.warpMesh.scale.set(
    renderedRadius * sunProfile.warpScale,
    renderedRadius * sunProfile.warpScale,
    1,
  );
  visual.coreMesh.rotation.x = 0.38;
  visual.coreMesh.rotation.y = nowSec * getSharedCombatSunRotationSpeed(index);
  visual.glowMesh.rotation.z = nowSec * (0.05 + index * 0.02);
};

export const disposeSharedCombatSunVisual = (visual: SharedCombatSunVisual) => {
  visual.coreMesh.parent?.remove(visual.coreMesh);
  visual.glowMesh.parent?.remove(visual.glowMesh);
  visual.warpMesh.parent?.remove(visual.warpMesh);
  (visual.coreMesh.material as { dispose: () => void }).dispose();
  (visual.glowMesh.material as { dispose: () => void }).dispose();
  (visual.warpMesh.material as { dispose: () => void }).dispose();
};

export const createSharedCombatNeutronStarVisual = ({
  createNeutronStarCoreMaterial,
  createNeutronStarHaloMaterial,
  createNeutronStarJetMaterial,
  createNeutronStarLensMaterial,
  glowGeometry,
  neutronStarId,
  ribbonGeometry,
  scene,
  sunGeometry,
}: {
  createNeutronStarCoreMaterial: NeutronStarMaterialFactory;
  createNeutronStarHaloMaterial: NeutronStarMaterialFactory;
  createNeutronStarJetMaterial: NeutronStarMaterialFactory;
  createNeutronStarLensMaterial: NeutronStarMaterialFactory;
  glowGeometry: CircleGeometry;
  neutronStarId: number;
  ribbonGeometry: PlaneGeometry;
  scene: Scene;
  sunGeometry: SphereGeometry;
}): SharedCombatNeutronStarVisual => {
  const group = new Group();
  const coreMesh = new Mesh(
    sunGeometry,
    createNeutronStarCoreMaterial(neutronStarId),
  );
  const haloMesh = new Mesh(
    glowGeometry,
    createNeutronStarHaloMaterial(neutronStarId),
  );
  const lensMesh = new Mesh(
    glowGeometry,
    createNeutronStarLensMaterial(neutronStarId),
  );
  const jetMeshA = new Mesh(
    ribbonGeometry,
    createNeutronStarJetMaterial(neutronStarId),
  );
  const jetMeshB = new Mesh(
    ribbonGeometry,
    createNeutronStarJetMaterial(neutronStarId + 0.37),
  );

  coreMesh.renderOrder = -6;
  haloMesh.renderOrder = -7;
  lensMesh.renderOrder = -8;
  jetMeshA.renderOrder = -7;
  jetMeshB.renderOrder = -7;
  haloMesh.position.z = -1.6;
  lensMesh.position.z = -2.4;
  jetMeshA.position.z = -1.2;
  jetMeshB.position.z = -1.2;
  group.add(lensMesh, haloMesh, jetMeshA, jetMeshB, coreMesh);
  scene.add(group);

  return {
    coreMesh,
    group,
    haloMesh,
    jetMeshA,
    jetMeshB,
    lensMesh,
  };
};

export const syncSharedCombatNeutronStarVisual = ({
  gameplayTuning,
  index,
  nowSec,
  neutronStar,
  visual,
  visualTuning,
}: {
  gameplayTuning: Pick<NeutronStarSpec, "minMassKg" | "maxMassKg">;
  index: number;
  nowSec: number;
  neutronStar: Pick<NeutronStar, "id" | "mass" | "pos" | "radius">;
  visual: SharedCombatNeutronStarVisual;
  visualTuning: NeutronStarVisualTuning;
}) => {
  const massAlpha = getNeutronStarMassAlpha(neutronStar.mass, gameplayTuning);
  const phase = getSharedCombatNeutronStarPhase(index, neutronStar.id);
  const pulse = 1 + Math.sin(nowSec * 6.4 + phase) * 0.04;
  const haloPulse = 1 + Math.sin(nowSec * 4.8 + phase * 1.7) * 0.08;
  const { coreRadius, haloRadius, lensRadius, jetLength, jetWidth } =
    getNeutronStarVisualShape({
      haloPulse,
      massAlpha,
      pulse,
      radius: neutronStar.radius,
      tuning: visualTuning,
    });
  const haloMaterial = visual.haloMesh.material as MeshBasicNodeMaterial;
  const lensMaterial = visual.lensMesh.material as MeshBasicNodeMaterial;
  const jetMaterialA = visual.jetMeshA.material as MeshBasicNodeMaterial;
  const jetMaterialB = visual.jetMeshB.material as MeshBasicNodeMaterial;

  visual.group.visible = true;
  visual.group.position.set(neutronStar.pos.x, neutronStar.pos.y, -1);
  visual.group.rotation.z = nowSec * 0.06 + phase * 0.18;
  visual.coreMesh.scale.set(coreRadius, coreRadius, coreRadius);
  visual.haloMesh.scale.set(haloRadius, haloRadius, 1);
  visual.lensMesh.scale.set(lensRadius, lensRadius, 1);
  visual.jetMeshA.scale.set(jetWidth, jetLength, 1);
  visual.jetMeshB.scale.set(
    jetWidth * NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR,
    jetLength * NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR,
    1,
  );
  visual.jetMeshA.rotation.z = phase + Math.sin(nowSec * 0.4 + phase) * 0.08;
  visual.jetMeshB.rotation.z =
    phase + Math.PI / 2 - Math.sin(nowSec * 0.36 + phase) * 0.06;
  visual.haloMesh.rotation.z = nowSec * 0.18 + phase * 0.4;
  visual.lensMesh.rotation.z = -nowSec * 0.12 - phase * 0.3;
  visual.coreMesh.rotation.x = 0.44;
  visual.coreMesh.rotation.y =
    nowSec * getSharedCombatNeutronStarSpinSpeed(index);
  haloMaterial.opacity = visualTuning.haloOpacity;
  lensMaterial.opacity = visualTuning.lensOpacity;
  jetMaterialA.opacity = visualTuning.jetOpacity;
  jetMaterialB.opacity =
    visualTuning.jetOpacity * NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR;
};

export const disposeSharedCombatNeutronStarVisual = (
  visual: SharedCombatNeutronStarVisual,
) => {
  visual.group.parent?.remove(visual.group);
  (visual.coreMesh.material as { dispose: () => void }).dispose();
  (visual.haloMesh.material as { dispose: () => void }).dispose();
  (visual.lensMesh.material as { dispose: () => void }).dispose();
  (visual.jetMeshA.material as { dispose: () => void }).dispose();
  (visual.jetMeshB.material as { dispose: () => void }).dispose();
};
