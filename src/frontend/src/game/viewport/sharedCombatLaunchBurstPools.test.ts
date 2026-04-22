import type { RocketKind } from "@3body/shared";
import { describe, expect, it } from "vitest";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import { getCannonWorldLayout } from "../rocketVisibility";
import {
  pruneSharedCombatLaunchBurstStates,
  resetSharedCombatLaunchBurstPools,
  syncSharedCombatLaunchBurstPools,
  type SharedCombatLaunchBurstPoolVisual,
} from "./sharedCombatLaunchBurstPools";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";

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

const createMockLaunchBurstPool = (): SharedCombatLaunchBurstPoolVisual => ({
  activeCount: 0,
  capacity: 4,
  mesh: createMockInstancedMesh() as never,
  scale: { x: 18, y: 5 },
});

const createLaunchBurstPools = (): Record<
  RocketKind,
  SharedCombatLaunchBurstPoolVisual
> => ({
  heavy: createMockLaunchBurstPool(),
  light: createMockLaunchBurstPool(),
  seeker: createMockLaunchBurstPool(),
});

const createRocketPools = (): Record<RocketKind, { scale: { x: number; y: number } }> => ({
  heavy: { scale: { x: 20, y: 6 } },
  light: { scale: { x: 20, y: 6 } },
  seeker: { scale: { x: 20, y: 6 } },
});

const createBurstsByKind = (
  lightBursts: readonly SharedCombatLaunchBurstState[],
): Record<RocketKind, SharedCombatLaunchBurstState[]> => ({
  heavy: [],
  light: [...lightBursts],
  seeker: [],
});

const cannonLayout = getCannonWorldLayout(
  getRuntimeTuningDocument().visuals.cannon,
  1,
);

describe("syncSharedCombatLaunchBurstPools", () => {
  it("renders non-owner launch bursts through the shared instanced pool", () => {
    const launchBurstPools = createLaunchBurstPools();

    syncSharedCombatLaunchBurstPools({
      burstsByKind: createBurstsByKind([
        {
          dir: { x: 1, y: 0 },
          launchPlanetPos: { x: 0, y: 0 },
          launchPlanetRadius: 22,
          origin: { x: 34, y: 0 },
          ownerId: "enemy",
          rocketKind: "light",
          speed: 280,
          startedAtSec: 1,
        },
      ]),
      cannonLayout,
      currentPlayerId: "self",
      launchBurstBudget: 1,
      launchBurstPools,
      nowSec: 1.04,
      rocketKinds: ROCKET_KINDS,
      rocketPools: createRocketPools(),
      worldUnitsPerPixel: 1,
    });

    expect(launchBurstPools.light.activeCount).toBe(1);
    expect(launchBurstPools.light.mesh.count).toBe(1);
    expect(launchBurstPools.light.mesh.visible).toBe(true);
    expect(launchBurstPools.light.mesh.instanceMatrix.needsUpdate).toBe(true);
  });

  it("skips owner-local launch bursts in the shared pool path", () => {
    const launchBurstPools = createLaunchBurstPools();

    syncSharedCombatLaunchBurstPools({
      burstsByKind: createBurstsByKind([
        {
          dir: { x: 1, y: 0 },
          launchPlanetPos: { x: 0, y: 0 },
          launchPlanetRadius: 22,
          origin: { x: 34, y: 0 },
          ownerId: "self",
          rocketKind: "light",
          speed: 280,
          startedAtSec: 1,
        },
      ]),
      cannonLayout,
      currentPlayerId: "self",
      launchBurstBudget: 1,
      launchBurstPools,
      nowSec: 1.04,
      rocketKinds: ROCKET_KINDS,
      rocketPools: createRocketPools(),
      worldUnitsPerPixel: 1,
    });

    expect(launchBurstPools.light.activeCount).toBe(0);
    expect(launchBurstPools.light.mesh.visible).toBe(false);
  });
});

describe("pruneSharedCombatLaunchBurstStates", () => {
  it("drops expired bursts using the same shared duration logic as rendering", () => {
    const burstsByKind = createBurstsByKind([
      {
        dir: { x: 1, y: 0 },
        launchPlanetPos: { x: 0, y: 0 },
        launchPlanetRadius: 22,
        origin: { x: 34, y: 0 },
        ownerId: "enemy",
        rocketKind: "light",
        speed: 280,
        startedAtSec: 1,
      },
    ]);

    pruneSharedCombatLaunchBurstStates({
      burstsByKind,
      cannonLayout,
      nowSec: 2,
      rocketKinds: ROCKET_KINDS,
      rocketPools: createRocketPools(),
      worldUnitsPerPixel: 1,
    });

    expect(burstsByKind.light).toHaveLength(0);
  });
});

describe("resetSharedCombatLaunchBurstPools", () => {
  it("clears launch burst pool visibility and counts", () => {
    const launchBurstPools = createLaunchBurstPools();

    syncSharedCombatLaunchBurstPools({
      burstsByKind: createBurstsByKind([
        {
          dir: { x: 1, y: 0 },
          launchPlanetPos: { x: 0, y: 0 },
          launchPlanetRadius: 22,
          origin: { x: 34, y: 0 },
          ownerId: "enemy",
          rocketKind: "light",
          speed: 280,
          startedAtSec: 1,
        },
      ]),
      cannonLayout,
      currentPlayerId: null,
      launchBurstBudget: 1,
      launchBurstPools,
      nowSec: 1.04,
      rocketKinds: ROCKET_KINDS,
      rocketPools: createRocketPools(),
      worldUnitsPerPixel: 1,
    });

    resetSharedCombatLaunchBurstPools({
      launchBurstPools,
      rocketKinds: ROCKET_KINDS,
    });

    expect(launchBurstPools.light.activeCount).toBe(0);
    expect(launchBurstPools.light.mesh.count).toBe(0);
    expect(launchBurstPools.light.mesh.visible).toBe(false);
    expect(launchBurstPools.light.mesh.instanceMatrix.needsUpdate).toBe(true);
  });
});
