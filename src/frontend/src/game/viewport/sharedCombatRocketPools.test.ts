import type { RocketKind } from "@3body/shared";
import { describe, expect, it } from "vitest";
import { ROCKET_MESH_SILHOUETTES } from "../rocketMeshSilhouette";
import {
  resetSharedCombatRocketPools,
  syncSharedCombatRocketPools,
  type SharedCombatRocketBody,
  type SharedCombatRocketPoolVisual,
  type SharedCombatRocketTrailState,
} from "./sharedCombatRocketPools";

const ROCKET_KINDS = [
  "heavy",
  "light",
  "seeker",
] as const satisfies readonly RocketKind[];

const createMockMatrixAttribute = () => ({
  needsUpdate: false,
});

const createMockInstancedMesh = () => ({
  count: 0,
  instanceMatrix: createMockMatrixAttribute(),
  matrices: [] as number[],
  setMatrixAt(index: number) {
    this.matrices.push(index);
  },
  visible: false,
});

const createMockRocketPool = (
  rocketKind: RocketKind,
): SharedCombatRocketPoolVisual => {
  const body = createMockInstancedMesh();
  const nose = createMockInstancedMesh();
  const engine = createMockInstancedMesh();
  const sensor = createMockInstancedMesh();
  const rearFinTop = createMockInstancedMesh();
  const rearFinBottom = createMockInstancedMesh();
  const canardTop = createMockInstancedMesh();
  const canardBottom = createMockInstancedMesh();
  const flameMesh = createMockInstancedMesh();
  const trailMesh = createMockInstancedMesh();
  const partMeshList = [
    rearFinTop,
    rearFinBottom,
    canardTop,
    canardBottom,
    engine,
    body,
    sensor,
    nose,
  ] as const;

  return {
    activeCount: 0,
    flameMesh: flameMesh as never,
    flameScale: { x: 7, y: 3 },
    partMeshList: partMeshList as never,
    parts: {
      body: body as never,
      canardBottom: canardBottom as never,
      canardTop: canardTop as never,
      engine: engine as never,
      nose: nose as never,
      rearFinBottom: rearFinBottom as never,
      rearFinTop: rearFinTop as never,
      sensor: sensor as never,
    },
    scale: { x: 14, y: 4 },
    silhouette: ROCKET_MESH_SILHOUETTES[rocketKind],
    trailActiveCount: 0,
    trailCapacity: 8,
    trailMesh: trailMesh as never,
    trailScale: { x: 10, y: 2.5 },
  };
};

const createRocketPools = (): Record<
  RocketKind,
  SharedCombatRocketPoolVisual
> => ({
  heavy: createMockRocketPool("heavy"),
  light: createMockRocketPool("light"),
  seeker: createMockRocketPool("seeker"),
});

const createRocketsByKind = (
  lightRockets: readonly SharedCombatRocketBody[],
): Record<RocketKind, readonly SharedCombatRocketBody[]> => ({
  heavy: [],
  light: lightRockets,
  seeker: [],
});

describe("syncSharedCombatRocketPools", () => {
  it("updates pooled rocket meshes and accumulates trail segments across frames", () => {
    const rocketPools = createRocketPools();
    const rocketTrailStates = new Map<number, SharedCombatRocketTrailState>();

    syncSharedCombatRocketPools({
      maxRocketTrailSamples: 4,
      nowSec: 1,
      rocketKinds: ROCKET_KINDS,
      rocketPools,
      rocketTrailBudget: 1,
      rocketTrailStates,
      rocketsByKind: createRocketsByKind([
        {
          id: 7,
          pos: { x: 0, y: 0 },
          rocketKind: "light",
          vel: { x: 60, y: 0 },
        },
      ]),
    });

    expect(rocketPools.light.activeCount).toBe(1);
    expect(rocketPools.light.flameMesh.count).toBe(1);
    expect(rocketPools.light.trailMesh.count).toBe(0);
    expect(rocketTrailStates.get(7)?.samples).toHaveLength(1);

    syncSharedCombatRocketPools({
      maxRocketTrailSamples: 4,
      nowSec: 1.05,
      rocketKinds: ROCKET_KINDS,
      rocketPools,
      rocketTrailBudget: 1,
      rocketTrailStates,
      rocketsByKind: createRocketsByKind([
        {
          id: 7,
          pos: { x: 28, y: 0 },
          rocketKind: "light",
          vel: { x: 60, y: 0 },
        },
      ]),
    });

    expect(rocketTrailStates.get(7)?.samples).toHaveLength(2);
    expect(rocketPools.light.trailMesh.count).toBeGreaterThan(0);
    expect(rocketPools.light.trailMesh.visible).toBe(true);
    expect(rocketPools.light.partMeshList[0]!.visible).toBe(true);
  });
});

describe("resetSharedCombatRocketPools", () => {
  it("clears pooled rocket visuals and trail state", () => {
    const rocketPools = createRocketPools();
    const rocketTrailStates = new Map<number, SharedCombatRocketTrailState>();

    syncSharedCombatRocketPools({
      maxRocketTrailSamples: 4,
      nowSec: 1,
      rocketKinds: ROCKET_KINDS,
      rocketPools,
      rocketTrailBudget: 1,
      rocketTrailStates,
      rocketsByKind: createRocketsByKind([
        {
          id: 11,
          pos: { x: 10, y: 6 },
          rocketKind: "light",
          vel: { x: 40, y: 8 },
        },
      ]),
    });

    resetSharedCombatRocketPools({
      rocketKinds: ROCKET_KINDS,
      rocketPools,
      rocketTrailStates,
    });

    expect(rocketTrailStates.size).toBe(0);
    expect(rocketPools.light.activeCount).toBe(0);
    expect(rocketPools.light.trailActiveCount).toBe(0);
    expect(rocketPools.light.flameMesh.visible).toBe(false);
    expect(rocketPools.light.trailMesh.visible).toBe(false);
    expect(
      rocketPools.light.partMeshList.every((mesh) => mesh.visible === false),
    ).toBe(true);
  });
});
