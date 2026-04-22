import type { RocketKind, Vec2 } from "@3body/shared";
import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type MeshBasicNodeMaterial,
  type Scene,
} from "three/webgpu";
import {
  getCannonWorldLayout,
  getMinScreenAxisScale,
  ROCKET_MIN_SCREEN_WIDTH_PX,
} from "../rocketVisibility";
import type {
  SharedCombatRocketPoolVisual,
  SharedCombatRocketRenderProfile,
} from "./sharedCombatRocketPools";
import {
  getSharedCombatLaunchBurstDuration,
  getSharedCombatLaunchBurstLayout,
  type SharedCombatLaunchBurstState,
} from "./sharedCombatLaunchBurstVisuals";

const Z_AXIS = new Vector3(0, 0, 1);
const HIDDEN_POSITION = new Vector3(1e8, 1e8, 1e8);
const HIDDEN_ROTATION = new Quaternion();
const HIDDEN_SCALE = new Vector3(0.001, 0.001, 0.001);
const hiddenMatrix = new Matrix4();
const burstMatrix = new Matrix4();
const burstPosition = new Vector3();
const burstRotation = new Quaternion();
const burstScale = new Vector3();

export interface SharedCombatLaunchBurstPoolVisual {
  activeCount: number;
  capacity: number;
  mesh: InstancedMesh;
  scale: Vec2;
}

const getBudgetedCount = (maxCount: number, budget: number): number =>
  budget <= 0 ? 0 : Math.max(1, Math.round(maxCount * budget));

const createHiddenInstanceMatrix = () =>
  new Matrix4().compose(HIDDEN_POSITION, HIDDEN_ROTATION, HIDDEN_SCALE);

const hideInstancedMeshRange = (
  mesh: InstancedMesh,
  fromIndex: number,
  toIndex: number,
): boolean => {
  if (fromIndex >= toIndex) {
    return false;
  }

  hiddenMatrix.compose(HIDDEN_POSITION, HIDDEN_ROTATION, HIDDEN_SCALE);
  for (let index = fromIndex; index < toIndex; index += 1) {
    mesh.setMatrixAt(index, hiddenMatrix);
  }

  return true;
};

const getRenderedRocketBodyScale = ({
  rocketKind,
  rocketPools,
  worldUnitsPerPixel,
}: {
  rocketKind: RocketKind;
  rocketPools: Record<RocketKind, Pick<SharedCombatRocketPoolVisual, "scale">>;
  worldUnitsPerPixel: number;
}) =>
  getMinScreenAxisScale(
    rocketPools[rocketKind].scale,
    ROCKET_MIN_SCREEN_WIDTH_PX.body,
    worldUnitsPerPixel,
  );

export const createSharedCombatLaunchBurstPools = ({
  createRocketLaunchBurstMaterial,
  launchBurstInstanceLimits,
  rocketKinds,
  rocketRenderProfiles,
  scene,
}: {
  createRocketLaunchBurstMaterial: (
    coreColor: string,
    trailColor: string,
  ) => MeshBasicNodeMaterial;
  launchBurstInstanceLimits: Record<RocketKind, number>;
  rocketKinds: readonly RocketKind[];
  rocketRenderProfiles: Record<RocketKind, SharedCombatRocketRenderProfile>;
  scene: Scene;
}) => {
  const disposables: Array<{ dispose: () => void }> = [];
  const launchBurstPools = rocketKinds.reduce(
    (pools, rocketKind) => {
      const profile = rocketRenderProfiles[rocketKind];
      const capacity = launchBurstInstanceLimits[rocketKind];
      const geometry = new PlaneGeometry(1, 1);
      const material = createRocketLaunchBurstMaterial(
        profile.core,
        profile.trail,
      );
      const mesh = new InstancedMesh(geometry, material, capacity);

      geometry.name = "rocketLaunchBurst";
      material.name = `rocketLaunchBurst:${rocketKind}`;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      const hiddenInit = createHiddenInstanceMatrix();
      for (let index = 0; index < capacity; index += 1) {
        mesh.setMatrixAt(index, hiddenInit);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 21;
      mesh.name = `rocketLaunchBurstPool:${rocketKind}`;
      scene.add(mesh);
      disposables.push(geometry, material);

      pools[rocketKind] = {
        activeCount: 0,
        capacity,
        mesh,
        scale: profile.trailScale,
      };

      return pools;
    },
    {} as Record<RocketKind, SharedCombatLaunchBurstPoolVisual>,
  );

  return { disposables, launchBurstPools };
};

export const resetSharedCombatLaunchBurstPools = ({
  launchBurstPools,
  rocketKinds,
}: {
  launchBurstPools: Record<RocketKind, SharedCombatLaunchBurstPoolVisual>;
  rocketKinds: readonly RocketKind[];
}) => {
  for (const rocketKind of rocketKinds) {
    const pool = launchBurstPools[rocketKind];
    const didHide = hideInstancedMeshRange(pool.mesh, 0, pool.capacity);

    pool.mesh.count = 0;
    pool.mesh.visible = false;
    pool.activeCount = 0;
    if (didHide) {
      pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }
};

export const pruneSharedCombatLaunchBurstStates = ({
  burstsByKind,
  cannonLayout,
  nowSec,
  rocketKinds,
  rocketPools,
  worldUnitsPerPixel,
}: {
  burstsByKind: Record<RocketKind, SharedCombatLaunchBurstState[]>;
  cannonLayout: ReturnType<typeof getCannonWorldLayout>;
  nowSec: number;
  rocketKinds: readonly RocketKind[];
  rocketPools: Record<RocketKind, Pick<SharedCombatRocketPoolVisual, "scale">>;
  worldUnitsPerPixel: number;
}) => {
  for (const rocketKind of rocketKinds) {
    const renderBodyScale = getRenderedRocketBodyScale({
      rocketKind,
      rocketPools,
      worldUnitsPerPixel,
    });
    const bursts = burstsByKind[rocketKind];
    let writeIndex = 0;

    for (let index = 0; index < bursts.length; index += 1) {
      const burst = bursts[index]!;
      const durationSec = getSharedCombatLaunchBurstDuration({
        bodyScale: renderBodyScale,
        burst,
        cannonLayout,
      });
      const ageSec = nowSec - burst.startedAtSec;

      if (ageSec < 0 || ageSec > durationSec) {
        continue;
      }

      bursts[writeIndex] = burst;
      writeIndex += 1;
    }

    bursts.length = writeIndex;
  }
};

export const syncSharedCombatLaunchBurstPools = ({
  burstsByKind,
  cannonLayout,
  currentPlayerId,
  launchBurstBudget,
  launchBurstPools,
  nowSec,
  rocketKinds,
  rocketPools,
  worldUnitsPerPixel,
}: {
  burstsByKind: Record<RocketKind, readonly SharedCombatLaunchBurstState[]>;
  cannonLayout: ReturnType<typeof getCannonWorldLayout>;
  currentPlayerId: string | null;
  launchBurstBudget: number;
  launchBurstPools: Record<RocketKind, SharedCombatLaunchBurstPoolVisual>;
  nowSec: number;
  rocketKinds: readonly RocketKind[];
  rocketPools: Record<RocketKind, Pick<SharedCombatRocketPoolVisual, "scale">>;
  worldUnitsPerPixel: number;
}) => {
  for (const rocketKind of rocketKinds) {
    const renderBodyScale = getRenderedRocketBodyScale({
      rocketKind,
      rocketPools,
      worldUnitsPerPixel,
    });
    const pool = launchBurstPools[rocketKind];
    const renderLaunchScale = getMinScreenAxisScale(
      pool.scale,
      ROCKET_MIN_SCREEN_WIDTH_PX.launchBurst,
      worldUnitsPerPixel,
    );
    const previousCount = pool.activeCount;
    const visibleCapacity = getBudgetedCount(pool.capacity, launchBurstBudget);
    let nextCount = 0;

    for (const burst of burstsByKind[rocketKind]) {
      if (currentPlayerId !== null && burst.ownerId === currentPlayerId) {
        continue;
      }

      const durationSec = getSharedCombatLaunchBurstDuration({
        bodyScale: renderBodyScale,
        burst,
        cannonLayout,
      });
      const burstLayout = getSharedCombatLaunchBurstLayout({
        ageSec: nowSec - burst.startedAtSec,
        baseScale: renderLaunchScale,
        direction: burst.dir,
        durationSec,
        lengthMultiplierEnd: 0.94,
        lengthMultiplierStart: 1.1,
        origin: burst.origin,
        speed: burst.speed,
        widthMultiplierEnd: 0.62,
        widthMultiplierStart: 0.96,
      });
      if (burstLayout === null) {
        continue;
      }

      burstPosition.set(burstLayout.center.x, burstLayout.center.y, 6.25);
      burstRotation.setFromAxisAngle(Z_AXIS, burstLayout.angle);
      burstScale.set(burstLayout.length, burstLayout.width, 1);
      burstMatrix.compose(burstPosition, burstRotation, burstScale);
      pool.mesh.setMatrixAt(nextCount, burstMatrix);
      nextCount += 1;

      if (nextCount >= visibleCapacity) {
        break;
      }
    }

    const clearedTail = hideInstancedMeshRange(pool.mesh, nextCount, previousCount);
    pool.activeCount = nextCount;
    pool.mesh.count = nextCount;
    pool.mesh.visible = nextCount > 0;
    pool.mesh.instanceMatrix.needsUpdate = nextCount > 0 || clearedTail;
  }
};
