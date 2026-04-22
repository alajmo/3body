import type { RocketKind, Vec2 } from "@3body/shared";
import { len, lerp, sub } from "@3body/shared";
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Scene,
} from "three/webgpu";
import {
  ROCKET_MESH_SILHOUETTES,
  type RocketMeshSilhouette,
} from "../rocketMeshSilhouette";
import { ROCKET_RENDER_INSTANCE_LIMITS } from "../rocketVisibility";

const ROCKET_TRAIL_DURATION_SEC = 0.18;
const ROCKET_TRAIL_SAMPLE_DISTANCE = 18;
const Z_AXIS = new Vector3(0, 0, 1);
const HIDDEN_ROCKET_POSITION = new Vector3(1e8, 1e8, 1e8);
const HIDDEN_ROCKET_ROTATION = new Quaternion();
const HIDDEN_ROCKET_SCALE = new Vector3(0.001, 0.001, 0.001);
const hiddenRocketMatrix = new Matrix4();
const rocketMatrix = new Matrix4();
const rocketPosition = new Vector3();
const rocketRotation = new Quaternion();
const rocketScale = new Vector3();
const activeRocketTrailIds = new Set<number>();

interface SharedCombatRocketTrailSample {
  pos: Vec2;
  timeSec: number;
}

interface SharedCombatRocketPartMeshes {
  body: InstancedMesh;
  canardBottom: InstancedMesh;
  canardTop: InstancedMesh;
  engine: InstancedMesh;
  nose: InstancedMesh;
  rearFinBottom: InstancedMesh;
  rearFinTop: InstancedMesh;
  sensor: InstancedMesh;
}

export interface SharedCombatRocketBody {
  id: number;
  pos: Vec2;
  rocketKind: RocketKind;
  vel: Vec2;
}

export interface SharedCombatRocketPoolVisual {
  activeCount: number;
  flameMesh: InstancedMesh;
  flameScale: Vec2;
  partMeshList: readonly InstancedMesh[];
  parts: SharedCombatRocketPartMeshes;
  scale: Vec2;
  silhouette: RocketMeshSilhouette;
  trailActiveCount: number;
  trailCapacity: number;
  trailMesh: InstancedMesh;
  trailScale: Vec2;
}

export interface SharedCombatRocketRenderProfile {
  bodyScale: Vec2;
  core: string;
  flameScale: Vec2;
  trail: string;
  trailScale: Vec2;
}

export interface SharedCombatRocketTrailState {
  lastSeenSec: number;
  rocketKind: RocketKind;
  samples: SharedCombatRocketTrailSample[];
}

const getBudgetedCount = (maxCount: number, budget: number): number =>
  budget <= 0 ? 0 : Math.max(1, Math.round(maxCount * budget));

const createHiddenInstanceMatrix = () =>
  new Matrix4().compose(
    HIDDEN_ROCKET_POSITION,
    HIDDEN_ROCKET_ROTATION,
    HIDDEN_ROCKET_SCALE,
  );

const tintColor = (
  value: string,
  hueOffset: number,
  saturationOffset: number,
  lightnessOffset: number,
): Color => {
  const result = new Color(value);
  result.offsetHSL(hueOffset, saturationOffset, lightnessOffset);
  return result;
};

const hideInstancedMeshRange = (
  mesh: InstancedMesh,
  fromIndex: number,
  toIndex: number,
): boolean => {
  if (fromIndex >= toIndex) {
    return false;
  }

  hiddenRocketMatrix.compose(
    HIDDEN_ROCKET_POSITION,
    HIDDEN_ROCKET_ROTATION,
    HIDDEN_ROCKET_SCALE,
  );
  for (let index = fromIndex; index < toIndex; index += 1) {
    mesh.setMatrixAt(index, hiddenRocketMatrix);
  }

  return true;
};

const hideRocketPartMeshRange = (
  meshes: readonly InstancedMesh[],
  fromIndex: number,
  toIndex: number,
): boolean => {
  let didHide = false;
  for (const mesh of meshes) {
    didHide = hideInstancedMeshRange(mesh, fromIndex, toIndex) || didHide;
  }
  return didHide;
};

const setRocketPartMatrix = ({
  dirX,
  dirY,
  forwardOffset = 0,
  index,
  lateralOffset = 0,
  mesh,
  originX,
  originY,
  rotationOffset = 0,
  scaleX,
  scaleY,
  scaleZ,
  worldAngle,
  z,
}: {
  dirX: number;
  dirY: number;
  forwardOffset?: number;
  index: number;
  lateralOffset?: number;
  mesh: InstancedMesh;
  originX: number;
  originY: number;
  rotationOffset?: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  worldAngle: number;
  z: number;
}) => {
  rocketPosition.set(
    originX + dirX * forwardOffset - dirY * lateralOffset,
    originY + dirY * forwardOffset + dirX * lateralOffset,
    z,
  );
  rocketRotation.setFromAxisAngle(Z_AXIS, worldAngle + rotationOffset);
  rocketScale.set(scaleX, scaleY, scaleZ);
  rocketMatrix.compose(rocketPosition, rocketRotation, rocketScale);
  mesh.setMatrixAt(index, rocketMatrix);
};

const pruneRocketTrailState = (
  trail: SharedCombatRocketTrailState,
  nowSec: number,
  maxSamples: number,
) => {
  while (
    trail.samples.length > 0 &&
    nowSec - trail.samples[0]!.timeSec > ROCKET_TRAIL_DURATION_SEC
  ) {
    trail.samples.shift();
  }

  while (trail.samples.length > maxSamples) {
    trail.samples.shift();
  }
};

const appendRocketTrailSample = (
  trail: SharedCombatRocketTrailState,
  pos: Vec2,
  timeSec: number,
  maxSamples: number,
) => {
  trail.lastSeenSec = timeSec;
  const lastSample = trail.samples[trail.samples.length - 1];

  if (
    lastSample !== undefined &&
    len(sub(pos, lastSample.pos)) < ROCKET_TRAIL_SAMPLE_DISTANCE
  ) {
    lastSample.pos.x = pos.x;
    lastSample.pos.y = pos.y;
    lastSample.timeSec = timeSec;
    pruneRocketTrailState(trail, timeSec, maxSamples);
    return;
  }

  trail.samples.push({
    pos: { x: pos.x, y: pos.y },
    timeSec,
  });
  pruneRocketTrailState(trail, timeSec, maxSamples);
};

const appendRocketTrailInstances = ({
  maxInstances,
  mesh,
  startIndex,
  trail,
  trailScale,
}: {
  maxInstances: number;
  mesh: InstancedMesh;
  startIndex: number;
  trail: SharedCombatRocketTrailState;
  trailScale: Vec2;
}): number => {
  const segmentCount = trail.samples.length - 1;

  if (segmentCount <= 0 || startIndex >= maxInstances) {
    return startIndex;
  }

  for (
    let sampleIndex = 1;
    sampleIndex < trail.samples.length && startIndex < maxInstances;
    sampleIndex += 1
  ) {
    const previousSample = trail.samples[sampleIndex - 1]!;
    const nextSample = trail.samples[sampleIndex]!;
    const delta = sub(nextSample.pos, previousSample.pos);
    const segmentLength = len(delta);

    if (segmentLength < 0.001) {
      continue;
    }

    const headAlpha = sampleIndex / segmentCount;
    rocketPosition.set(
      (previousSample.pos.x + nextSample.pos.x) * 0.5,
      (previousSample.pos.y + nextSample.pos.y) * 0.5,
      2.75,
    );
    rocketRotation.setFromAxisAngle(Z_AXIS, Math.atan2(delta.y, delta.x));
    rocketScale.set(
      Math.max(
        segmentLength + trailScale.y * 1.2,
        trailScale.x * lerp(0.26, 0.54, headAlpha),
      ),
      trailScale.y * lerp(0.24, 0.92, headAlpha),
      1,
    );
    rocketMatrix.compose(rocketPosition, rocketRotation, rocketScale);
    mesh.setMatrixAt(startIndex, rocketMatrix);
    startIndex += 1;
  }

  return startIndex;
};

export const getSharedCombatRocketTrailInstanceLimits = (
  maxTrailSamples: number,
): Record<RocketKind, number> => {
  const maxTrailSegments = Math.max(0, maxTrailSamples - 1);

  return {
    heavy: ROCKET_RENDER_INSTANCE_LIMITS.heavy * maxTrailSegments,
    light: ROCKET_RENDER_INSTANCE_LIMITS.light * maxTrailSegments,
    seeker: ROCKET_RENDER_INSTANCE_LIMITS.seeker * maxTrailSegments,
  };
};

export const pruneSharedCombatRocketTrailStates = ({
  maxSamples,
  nowSec,
  trailsById,
}: {
  maxSamples: number;
  nowSec: number;
  trailsById: Map<number, SharedCombatRocketTrailState>;
}) => {
  for (const [rocketId, trail] of trailsById) {
    pruneRocketTrailState(trail, nowSec, maxSamples);

    if (
      trail.samples.length < 2 &&
      nowSec - trail.lastSeenSec > ROCKET_TRAIL_DURATION_SEC
    ) {
      trailsById.delete(rocketId);
    }
  }
};

export const createSharedCombatRocketPools = ({
  createRocketFlameMaterial,
  createRocketMaterial,
  createRocketTrailMaterial,
  rocketKinds,
  rocketRenderProfiles,
  rocketTrailInstanceLimits,
  scene,
}: {
  createRocketFlameMaterial: (
    coreColor: string,
    trailColor: string,
  ) => MeshBasicNodeMaterial;
  createRocketMaterial: (
    coreColor: string,
    trailColor: string,
  ) => MeshBasicNodeMaterial;
  createRocketTrailMaterial: (
    coreColor: string,
    trailColor: string,
  ) => MeshBasicNodeMaterial;
  rocketKinds: readonly RocketKind[];
  rocketRenderProfiles: Record<RocketKind, SharedCombatRocketRenderProfile>;
  rocketTrailInstanceLimits: Record<RocketKind, number>;
  scene: Scene;
}): {
  disposables: Array<{ dispose: () => void }>;
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual>;
} => {
  const disposables: Array<{ dispose: () => void }> = [];

  const rocketPools = rocketKinds.reduce(
    (pools, rocketKind) => {
      const profile = rocketRenderProfiles[rocketKind];
      const silhouette = ROCKET_MESH_SILHOUETTES[rocketKind];
      const rocketBodyGeometry = new CylinderGeometry(0.56, 0.92, 1, 18, 1);
      rocketBodyGeometry.name = "rocketBody";
      rocketBodyGeometry.rotateZ(-Math.PI / 2);
      const rocketNoseGeometry = new ConeGeometry(1, 1, 18);
      rocketNoseGeometry.name = "rocketNose";
      rocketNoseGeometry.rotateZ(-Math.PI / 2);
      const rocketEngineGeometry = new CylinderGeometry(0.78, 0.9, 1, 18, 1);
      rocketEngineGeometry.name = "rocketEngine";
      rocketEngineGeometry.rotateZ(-Math.PI / 2);
      const rocketFinGeometry = new BoxGeometry(1, 1, 0.18);
      rocketFinGeometry.name = "rocketFin";
      const rocketCanardGeometry = new BoxGeometry(1, 1, 0.14);
      rocketCanardGeometry.name = "rocketCanard";
      const rocketSensorGeometry = new SphereGeometry(1, 20, 14);
      rocketSensorGeometry.name = "rocketSensor";
      const rocketTrailGeometry = new PlaneGeometry(1, 1);
      rocketTrailGeometry.name = "rocketTrail";
      const rocketFlameGeometry = new PlaneGeometry(1, 1);
      rocketFlameGeometry.name = "rocketFlame";
      const material = createRocketMaterial(profile.core, profile.trail);
      const trailMaterial = createRocketTrailMaterial(
        profile.core,
        profile.trail,
      );
      const flameMaterial = createRocketFlameMaterial(
        profile.core,
        profile.trail,
      );
      const finMaterial = new MeshBasicMaterial({
        color: tintColor(profile.core, 0, -0.16, -0.24),
      });
      const canardMaterial = new MeshBasicMaterial({
        color: tintColor(profile.trail, -0.01, 0.02, 0.18),
      });
      const engineMaterial = new MeshBasicMaterial({
        color: tintColor(profile.core, 0, -0.24, -0.34),
      });
      const sensorMaterial = new MeshBasicMaterial({
        blending: AdditiveBlending,
        color: tintColor(profile.trail, -0.02, -0.04, 0.34),
        opacity: 0.86,
        transparent: true,
      });
      material.name = `rocketBody:${rocketKind}`;
      finMaterial.name = `rocketFin:${rocketKind}`;
      canardMaterial.name = `rocketCanard:${rocketKind}`;
      engineMaterial.name = `rocketEngine:${rocketKind}`;
      sensorMaterial.name = `rocketSensor:${rocketKind}`;
      trailMaterial.name = `rocketTrail:${rocketKind}`;
      flameMaterial.name = `rocketFlame:${rocketKind}`;
      const hiddenInit = createHiddenInstanceMatrix();
      const rocketInstanceCapacity = ROCKET_RENDER_INSTANCE_LIMITS[rocketKind];
      const initializeRocketMesh = (
        geometry: BufferGeometry,
        materialValue: MeshBasicMaterial | MeshBasicNodeMaterial,
        instanceCount: number,
        name: string,
        renderOrder: number,
      ) => {
        const mesh = new InstancedMesh(geometry, materialValue, instanceCount);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        for (let index = 0; index < instanceCount; index += 1) {
          mesh.setMatrixAt(index, hiddenInit);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.count = 0;
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = renderOrder;
        mesh.name = name;
        return mesh;
      };
      const parts = {
        body: initializeRocketMesh(
          rocketBodyGeometry,
          material,
          rocketInstanceCapacity,
          `rocketBodyPool:${rocketKind}`,
          10,
        ),
        canardBottom: initializeRocketMesh(
          rocketCanardGeometry,
          canardMaterial,
          rocketInstanceCapacity,
          `rocketCanardBottomPool:${rocketKind}`,
          8,
        ),
        canardTop: initializeRocketMesh(
          rocketCanardGeometry,
          canardMaterial,
          rocketInstanceCapacity,
          `rocketCanardTopPool:${rocketKind}`,
          8,
        ),
        engine: initializeRocketMesh(
          rocketEngineGeometry,
          engineMaterial,
          rocketInstanceCapacity,
          `rocketEnginePool:${rocketKind}`,
          9,
        ),
        nose: initializeRocketMesh(
          rocketNoseGeometry,
          material,
          rocketInstanceCapacity,
          `rocketNosePool:${rocketKind}`,
          12,
        ),
        rearFinBottom: initializeRocketMesh(
          rocketFinGeometry,
          finMaterial,
          rocketInstanceCapacity,
          `rocketRearFinBottomPool:${rocketKind}`,
          7,
        ),
        rearFinTop: initializeRocketMesh(
          rocketFinGeometry,
          finMaterial,
          rocketInstanceCapacity,
          `rocketRearFinTopPool:${rocketKind}`,
          7,
        ),
        sensor: initializeRocketMesh(
          rocketSensorGeometry,
          sensorMaterial,
          rocketInstanceCapacity,
          `rocketSensorPool:${rocketKind}`,
          11,
        ),
      } satisfies SharedCombatRocketPartMeshes;
      const partMeshList = [
        parts.rearFinTop,
        parts.rearFinBottom,
        parts.canardTop,
        parts.canardBottom,
        parts.engine,
        parts.body,
        parts.sensor,
        parts.nose,
      ] as const;
      const trailMesh = initializeRocketMesh(
        rocketTrailGeometry,
        trailMaterial,
        rocketTrailInstanceLimits[rocketKind],
        `rocketTrailPool:${rocketKind}`,
        6,
      );
      const flameMesh = initializeRocketMesh(
        rocketFlameGeometry,
        flameMaterial,
        rocketInstanceCapacity,
        `rocketFlamePool:${rocketKind}`,
        5,
      );
      scene.add(trailMesh, flameMesh, ...partMeshList);
      disposables.push(
        rocketBodyGeometry,
        rocketNoseGeometry,
        rocketEngineGeometry,
        rocketFinGeometry,
        rocketCanardGeometry,
        rocketSensorGeometry,
        rocketTrailGeometry,
        rocketFlameGeometry,
        material,
        finMaterial,
        canardMaterial,
        engineMaterial,
        sensorMaterial,
        trailMaterial,
        flameMaterial,
      );

      pools[rocketKind] = {
        activeCount: 0,
        flameMesh,
        flameScale: profile.flameScale,
        partMeshList,
        parts,
        scale: profile.bodyScale,
        silhouette,
        trailActiveCount: 0,
        trailCapacity: rocketTrailInstanceLimits[rocketKind],
        trailMesh,
        trailScale: profile.trailScale,
      };

      return pools;
    },
    {} as Record<RocketKind, SharedCombatRocketPoolVisual>,
  );

  return {
    disposables,
    rocketPools,
  };
};

export const resetSharedCombatRocketPools = ({
  rocketKinds,
  rocketPools,
  rocketTrailStates,
}: {
  rocketKinds: readonly RocketKind[];
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual>;
  rocketTrailStates: Map<number, SharedCombatRocketTrailState>;
}) => {
  rocketTrailStates.clear();

  for (const rocketKind of rocketKinds) {
    const pool = rocketPools[rocketKind];
    const didHide = hideRocketPartMeshRange(
      pool.partMeshList,
      0,
      ROCKET_RENDER_INSTANCE_LIMITS[rocketKind],
    );
    const didHideTrail = hideInstancedMeshRange(
      pool.trailMesh,
      0,
      pool.trailCapacity,
    );
    const didHideFlame = hideInstancedMeshRange(
      pool.flameMesh,
      0,
      ROCKET_RENDER_INSTANCE_LIMITS[rocketKind],
    );
    pool.trailMesh.count = 0;
    pool.trailMesh.visible = false;
    pool.flameMesh.count = 0;
    pool.flameMesh.visible = false;
    pool.activeCount = 0;
    pool.trailActiveCount = 0;
    if (didHide) {
      for (const mesh of pool.partMeshList) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (didHideTrail) {
      pool.trailMesh.instanceMatrix.needsUpdate = true;
    }
    if (didHideFlame) {
      pool.flameMesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of pool.partMeshList) {
      mesh.count = 0;
      mesh.visible = false;
    }
  }
};

export const syncSharedCombatRocketPools = <
  Rocket extends SharedCombatRocketBody,
>({
  maxRocketTrailSamples,
  nowSec,
  rocketKinds,
  rocketPools,
  rocketTrailBudget,
  rocketTrailStates,
  rocketsByKind,
}: {
  maxRocketTrailSamples: number;
  nowSec: number;
  rocketKinds: readonly RocketKind[];
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual>;
  rocketTrailBudget: number;
  rocketTrailStates: Map<number, SharedCombatRocketTrailState>;
  rocketsByKind: Record<RocketKind, readonly Rocket[]>;
}) => {
  if (rocketTrailBudget > 0) {
    pruneSharedCombatRocketTrailStates({
      maxSamples: maxRocketTrailSamples,
      nowSec,
      trailsById: rocketTrailStates,
    });
  } else if (rocketTrailStates.size > 0) {
    rocketTrailStates.clear();
  }

  for (const rocketKind of rocketKinds) {
    const pool = rocketPools[rocketKind];
    const rockets = rocketsByKind[rocketKind];
    const silhouette = pool.silhouette;
    const renderBodyScale = pool.scale;
    const renderTrailScale = pool.trailScale;
    const renderFlameScale = pool.flameScale;
    const previousCount = pool.activeCount;
    const previousTrailCount = pool.trailActiveCount;
    const trailCapacity = getBudgetedCount(
      pool.trailCapacity,
      rocketTrailBudget,
    );
    let count = 0;
    activeRocketTrailIds.clear();

    for (const rocket of rockets) {
      if (count >= ROCKET_RENDER_INSTANCE_LIMITS[rocketKind]) {
        break;
      }

      const angle = Math.atan2(rocket.vel.y, rocket.vel.x);
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const seekerPulse =
        rocketKind === "seeker"
          ? 1 + Math.sin(nowSec * 10 + count * 0.7) * 0.18
          : 1;
      const flicker = 0.82 + Math.sin(nowSec * 38 + count * 1.37) * 0.16;
      const renderRocketX = rocket.pos.x;
      const renderRocketY = rocket.pos.y;
      const bodyWidth = renderBodyScale.y * seekerPulse;
      const bodyDepth = renderBodyScale.y;
      const trailOffset = renderBodyScale.x * silhouette.trailOffset;
      const flameOffset = renderBodyScale.x * silhouette.flameOffset;

      if (trailCapacity > 0) {
        const trailAnchor = {
          x: renderRocketX - dirX * trailOffset,
          y: renderRocketY - dirY * trailOffset,
        } satisfies Vec2;
        let trailState = rocketTrailStates.get(rocket.id);
        if (trailState === undefined) {
          trailState = {
            lastSeenSec: nowSec,
            rocketKind,
            samples: [],
          };
          rocketTrailStates.set(rocket.id, trailState);
        }
        appendRocketTrailSample(
          trailState,
          trailAnchor,
          nowSec,
          maxRocketTrailSamples,
        );
        activeRocketTrailIds.add(rocket.id);
      }

      const finYOffset = bodyWidth * 0.72;
      const canardYOffset = bodyWidth * 0.52;
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: -renderBodyScale.x * 0.02,
        index: count,
        mesh: pool.parts.body,
        originX: renderRocketX,
        originY: renderRocketY,
        scaleX: renderBodyScale.x * silhouette.bodyLength,
        scaleY: bodyWidth * silhouette.bodyRadius,
        scaleZ: bodyDepth * silhouette.bodyRadius,
        worldAngle: angle,
        z: 3,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: renderBodyScale.x * 0.42,
        index: count,
        mesh: pool.parts.nose,
        originX: renderRocketX,
        originY: renderRocketY,
        scaleX: renderBodyScale.x * silhouette.noseLength,
        scaleY: bodyWidth * silhouette.noseRadius,
        scaleZ: bodyDepth * silhouette.noseRadius,
        worldAngle: angle,
        z: 3.08,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: -renderBodyScale.x * 0.43,
        index: count,
        mesh: pool.parts.engine,
        originX: renderRocketX,
        originY: renderRocketY,
        scaleX: renderBodyScale.x * 0.1,
        scaleY: bodyWidth * 0.72,
        scaleZ: bodyDepth * 0.72,
        worldAngle: angle,
        z: 2.96,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: renderBodyScale.x * silhouette.sensorX,
        index: count,
        mesh: pool.parts.sensor,
        originX: renderRocketX,
        originY: renderRocketY,
        scaleX: bodyWidth * silhouette.sensorScale,
        scaleY: bodyWidth * silhouette.sensorScale,
        scaleZ: bodyDepth * silhouette.sensorScale,
        worldAngle: angle,
        z: 3.04,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: -renderBodyScale.x * silhouette.finX,
        index: count,
        lateralOffset: finYOffset,
        mesh: pool.parts.rearFinTop,
        originX: renderRocketX,
        originY: renderRocketY,
        rotationOffset: -silhouette.finAngle,
        scaleX: renderBodyScale.x * silhouette.finLength,
        scaleY: bodyWidth * silhouette.finHeight,
        scaleZ: bodyDepth * 0.24,
        worldAngle: angle,
        z: 2.92,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: -renderBodyScale.x * silhouette.finX,
        index: count,
        lateralOffset: -finYOffset,
        mesh: pool.parts.rearFinBottom,
        originX: renderRocketX,
        originY: renderRocketY,
        rotationOffset: silhouette.finAngle,
        scaleX: renderBodyScale.x * silhouette.finLength,
        scaleY: bodyWidth * silhouette.finHeight,
        scaleZ: bodyDepth * 0.24,
        worldAngle: angle,
        z: 2.92,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: renderBodyScale.x * silhouette.canardX,
        index: count,
        lateralOffset: canardYOffset,
        mesh: pool.parts.canardTop,
        originX: renderRocketX,
        originY: renderRocketY,
        rotationOffset: -silhouette.canardAngle,
        scaleX: renderBodyScale.x * silhouette.canardLength,
        scaleY: bodyWidth * silhouette.canardHeight,
        scaleZ: bodyDepth * 0.18,
        worldAngle: angle,
        z: 2.94,
      });
      setRocketPartMatrix({
        dirX,
        dirY,
        forwardOffset: renderBodyScale.x * silhouette.canardX,
        index: count,
        lateralOffset: -canardYOffset,
        mesh: pool.parts.canardBottom,
        originX: renderRocketX,
        originY: renderRocketY,
        rotationOffset: silhouette.canardAngle,
        scaleX: renderBodyScale.x * silhouette.canardLength,
        scaleY: bodyWidth * silhouette.canardHeight,
        scaleZ: bodyDepth * 0.18,
        worldAngle: angle,
        z: 2.94,
      });

      rocketPosition.set(
        renderRocketX - dirX * flameOffset,
        renderRocketY - dirY * flameOffset,
        2.9,
      );
      rocketRotation.setFromAxisAngle(Z_AXIS, angle);
      rocketScale.set(
        renderFlameScale.x * flicker,
        renderFlameScale.y * flicker * 0.9,
        1,
      );
      rocketMatrix.compose(rocketPosition, rocketRotation, rocketScale);
      pool.flameMesh.setMatrixAt(count, rocketMatrix);
      count += 1;
    }

    let trailCount = 0;
    if (trailCapacity > 0) {
      for (const rocket of rockets) {
        const trailState = rocketTrailStates.get(rocket.id);
        if (trailState === undefined) {
          continue;
        }

        trailCount = appendRocketTrailInstances({
          maxInstances: trailCapacity,
          mesh: pool.trailMesh,
          startIndex: trailCount,
          trail: trailState,
          trailScale: renderTrailScale,
        });

        if (trailCount >= trailCapacity) {
          break;
        }
      }

      if (trailCount < trailCapacity) {
        for (const [rocketId, trailState] of rocketTrailStates) {
          if (
            trailState.rocketKind !== rocketKind ||
            activeRocketTrailIds.has(rocketId)
          ) {
            continue;
          }

          trailCount = appendRocketTrailInstances({
            maxInstances: trailCapacity,
            mesh: pool.trailMesh,
            startIndex: trailCount,
            trail: trailState,
            trailScale: renderTrailScale,
          });

          if (trailCount >= trailCapacity) {
            break;
          }
        }
      }
    }

    const clearedTail = hideRocketPartMeshRange(
      pool.partMeshList,
      count,
      previousCount,
    );
    const clearedTrailTail = hideInstancedMeshRange(
      pool.trailMesh,
      trailCount,
      previousTrailCount,
    );
    const clearedFlameTail = hideInstancedMeshRange(
      pool.flameMesh,
      count,
      previousCount,
    );
    pool.activeCount = count;
    pool.trailActiveCount = trailCount;
    pool.trailMesh.count = trailCount;
    pool.trailMesh.visible = trailCount > 0;
    pool.flameMesh.count = count;
    pool.flameMesh.visible = count > 0;
    for (const mesh of pool.partMeshList) {
      mesh.count = count;
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = count > 0 || clearedTail;
    }
    pool.trailMesh.instanceMatrix.needsUpdate =
      trailCount > 0 || clearedTrailTail;
    pool.flameMesh.instanceMatrix.needsUpdate = count > 0 || clearedFlameTail;
  }
};
