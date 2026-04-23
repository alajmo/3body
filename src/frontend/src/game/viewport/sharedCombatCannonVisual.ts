import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  type MeshBasicMaterial,
  type MeshBasicNodeMaterial,
  SphereGeometry,
} from "three/webgpu";
import type { SharedCombatCannonVisual } from "./sharedCombatSupportVisuals";

type SharedCombatCannonSurfaceMaterial =
  | MeshBasicMaterial
  | MeshBasicNodeMaterial;

export const createSharedCombatCannonVisual = ({
  accentMaterial,
  flashMaterial,
  metalMaterial,
  scene,
  setAccentColor,
}: {
  accentMaterial: SharedCombatCannonSurfaceMaterial;
  flashMaterial: MeshBasicMaterial;
  metalMaterial: SharedCombatCannonSurfaceMaterial;
  scene: { add: (object: Group) => void };
  setAccentColor: (value: string) => void;
}) => {
  const stemGeometry = new CylinderGeometry(1, 1, 1, 16).rotateZ(-Math.PI / 2);
  const breechGeometry = new BoxGeometry(1, 1, 1);
  const barrelGeometry = new CylinderGeometry(1, 1, 1, 20).rotateZ(
    -Math.PI / 2,
  );
  const barrelBandGeometry = new CylinderGeometry(1, 1, 1, 20).rotateZ(
    -Math.PI / 2,
  );
  const muzzleGeometry = new CylinderGeometry(1, 1, 1, 22).rotateZ(
    -Math.PI / 2,
  );
  const flashGeometry = new SphereGeometry(1, 18, 12);

  const stemMesh = new Mesh(stemGeometry, metalMaterial);
  stemMesh.renderOrder = 14;
  const breechMesh = new Mesh(breechGeometry, metalMaterial);
  breechMesh.renderOrder = 15;
  const barrelMesh = new Mesh(barrelGeometry, metalMaterial);
  barrelMesh.renderOrder = 16;
  const barrelBandMesh = new Mesh(barrelBandGeometry, accentMaterial);
  barrelBandMesh.renderOrder = 17;
  const muzzleMesh = new Mesh(muzzleGeometry, accentMaterial);
  muzzleMesh.renderOrder = 18;
  const flashMesh = new Mesh(flashGeometry, flashMaterial);
  flashMesh.renderOrder = 20;
  flashMesh.visible = false;

  const group = new Group();
  group.visible = false;
  group.position.z = 6;
  group.add(
    stemMesh,
    breechMesh,
    barrelMesh,
    barrelBandMesh,
    muzzleMesh,
    flashMesh,
  );
  scene.add(group);

  const visual: SharedCombatCannonVisual = {
    barrelBandMesh,
    barrelMesh,
    breechMesh,
    flashMaterial,
    flashMesh,
    group,
    muzzleMesh,
    setAccentColor,
    stemMesh,
  };

  return {
    disposables: [
      stemGeometry,
      breechGeometry,
      barrelGeometry,
      barrelBandGeometry,
      muzzleGeometry,
      flashGeometry,
    ],
    visual,
  };
};
