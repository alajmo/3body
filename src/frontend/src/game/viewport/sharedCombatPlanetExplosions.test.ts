import { Color, Vector3 } from "three/webgpu";
import { describe, expect, it } from "vitest";
import type {
  SharedCombatPlanetExplosionState,
  SharedCombatPlanetExplosionVisual,
} from "./sharedCombatPlanetExplosions";
import {
  clearSharedCombatPlanetExplosions,
  queueSharedCombatPlanetExplosion,
  updateSharedCombatPlanetExplosions,
} from "./sharedCombatPlanetExplosions";

const createMockRotation = () => ({
  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  },
  x: 0,
  y: 0,
  z: 0,
});

const createMockMaterial = () => ({
  color: new Color("#000000"),
  opacity: 0,
});

const createMockMesh = () => ({
  position: new Vector3(),
  rotation: createMockRotation(),
  scale: new Vector3(),
  visible: false,
});

const createMockVisual = (): SharedCombatPlanetExplosionVisual => {
  const chunkMaterials = [createMockMaterial(), createMockMaterial()];
  const chunks = [
    {
      baseScale: new Vector3(),
      direction: { x: 0, y: 0 },
      driftDistance: 0,
      lateralAmplitude: 0,
      lift: 0,
      mesh: createMockMesh(),
      radialOffset: 0,
      rotationPhase: new Vector3(),
      rotationSpeed: new Vector3(),
      tangent: { x: 0, y: 0 },
    },
    {
      baseScale: new Vector3(),
      direction: { x: 0, y: 0 },
      driftDistance: 0,
      lateralAmplitude: 0,
      lift: 0,
      mesh: createMockMesh(),
      radialOffset: 0,
      rotationPhase: new Vector3(),
      rotationSpeed: new Vector3(),
      tangent: { x: 0, y: 0 },
    },
  ];

  return {
    chunkMaterials: chunkMaterials as never,
    chunks: chunks as never,
    coreMaterial: createMockMaterial() as never,
    coreMesh: createMockMesh() as never,
    glowMaterial: createMockMaterial() as never,
    glowMesh: createMockMesh() as never,
    group: {
      position: new Vector3(),
      visible: false,
    } as never,
    ringMaterial: createMockMaterial() as never,
    ringMesh: createMockMesh() as never,
    shockwaveMaterial: createMockMaterial() as never,
    shockwaveMesh: createMockMesh() as never,
  };
};

describe("shared planet explosions", () => {
  it("queues a pooled explosion visual with the expected presentation state", () => {
    const activePlanetExplosions: SharedCombatPlanetExplosionState[] = [];
    const inactivePlanetExplosionVisuals = [createMockVisual()];

    queueSharedCombatPlanetExplosion({
      activePlanetExplosions,
      inactivePlanetExplosionVisuals,
      planet: {
        color: "#ff9a61",
        deathReason: "planetCollision",
        id: 7,
        pos: { x: 18, y: -12 },
        radius: 14,
        vel: { x: 3, y: -2 },
      },
      startedAtSec: 1,
    });

    expect(activePlanetExplosions).toHaveLength(1);
    expect(inactivePlanetExplosionVisuals).toHaveLength(0);
    expect(activePlanetExplosions[0]!.durationSec).toBeGreaterThan(1.55);
    expect(activePlanetExplosions[0]!.visual.group.visible).toBe(true);
    expect(activePlanetExplosions[0]!.visual.group.position.x).toBe(18);
    expect(activePlanetExplosions[0]!.visual.group.position.y).toBe(-12);
  });

  it("returns expired explosions to the inactive pool and hides their visuals", () => {
    const activePlanetExplosions: SharedCombatPlanetExplosionState[] = [];
    const inactivePlanetExplosionVisuals = [createMockVisual()];

    queueSharedCombatPlanetExplosion({
      activePlanetExplosions,
      inactivePlanetExplosionVisuals,
      planet: {
        color: "#7dc8ff",
        id: 11,
        pos: { x: 0, y: 0 },
        radius: 10,
        vel: { x: 0, y: 0 },
      },
      startedAtSec: 0,
    });

    updateSharedCombatPlanetExplosions({
      activePlanetExplosions,
      elapsedSec: 10,
      inactivePlanetExplosionVisuals,
    });

    expect(activePlanetExplosions).toHaveLength(0);
    expect(inactivePlanetExplosionVisuals).toHaveLength(1);
    expect(inactivePlanetExplosionVisuals[0]!.group.visible).toBe(false);
    expect(inactivePlanetExplosionVisuals[0]!.coreMaterial.opacity).toBe(0);
    expect(inactivePlanetExplosionVisuals[0]!.shockwaveMaterial.opacity).toBe(
      0,
    );
  });

  it("clears any active explosions back into the shared inactive pool", () => {
    const activePlanetExplosions: SharedCombatPlanetExplosionState[] = [];
    const inactivePlanetExplosionVisuals = [
      createMockVisual(),
      createMockVisual(),
    ];

    queueSharedCombatPlanetExplosion({
      activePlanetExplosions,
      inactivePlanetExplosionVisuals,
      planet: {
        color: "#d5ff84",
        deathReason: "sunCollision",
        id: 3,
        pos: { x: 5, y: 7 },
        radius: 9,
        vel: { x: 1, y: 1 },
      },
      startedAtSec: 2,
    });

    clearSharedCombatPlanetExplosions({
      activePlanetExplosions,
      inactivePlanetExplosionVisuals,
    });

    expect(activePlanetExplosions).toHaveLength(0);
    expect(inactivePlanetExplosionVisuals).toHaveLength(2);
    expect(inactivePlanetExplosionVisuals[1]!.group.visible).toBe(false);
  });
});
