import type {
  ArchetypeId,
  PlanetArchetypeVisualSpec,
  RocketKind,
  Vec2,
} from "@3body/shared";
import {
  ROOM_CAPACITY,
  SHIELD_SPEC,
  getSunVisualProfile,
  mulberry32,
} from "@3body/shared";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import {
  attribute,
  color,
  dot,
  float,
  max,
  mix,
  normalize,
  normalWorld,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
  vec3,
} from "three/tsl";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  Points,
  PointsNodeMaterial,
  Quaternion,
  RingGeometry,
  type Scene,
  SphereGeometry,
  Vector3,
} from "three/webgpu";
import {
  ROCKET_MESH_SILHOUETTES,
  type RocketMeshSilhouette,
} from "../rocketMeshSilhouette";
import type { CombatSandboxState } from "../combatSandbox";
import { ROCKET_RENDER_INSTANCE_LIMITS } from "../rocketVisibility";
import { createShieldVisual } from "../shieldVisuals";
import {
  createAmbientBoundaryDebrisVisual,
} from "./ambientBoundaryDebris";
import {
  createCacheSpriteAssets,
  disposeCacheSpriteAssets,
  type CacheIconKey,
  type CacheVisual,
} from "./cacheVisuals";

interface TrailSample {
  pos: Vec2;
  timeSec: number;
}

interface TrailVisual {
  geometry: BufferGeometry;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  samples: TrailSample[];
}

interface SunVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  rotationSpeed: number;
  warpMesh: Mesh;
}

interface NeutronStarVisual {
  coreMesh: Mesh;
  group: Group;
  haloMesh: Mesh;
  jetMeshA: Mesh;
  jetMeshB: Mesh;
  lensMesh: Mesh;
  phase: number;
  spinSpeed: number;
}

interface PlanetVisual {
  glowContactStartNode: ReturnType<typeof uniform>;
  glowFadeStartNode: ReturnType<typeof uniform>;
  glowMesh: Mesh;
  glowOpacityUniform: ReturnType<typeof uniform>;
  glowRiseEndNode: ReturnType<typeof uniform>;
  glowRiseStartNode: ReturnType<typeof uniform>;
  mesh: Mesh;
  rotationSpeed: number;
  surfaceOpacityUniform: ReturnType<typeof uniform>;
  spinAxis: Vector3;
  spinPhase: number;
}

interface RocketPartMeshes {
  body: InstancedMesh;
  canardBottom: InstancedMesh;
  canardTop: InstancedMesh;
  engine: InstancedMesh;
  nose: InstancedMesh;
  rearFinBottom: InstancedMesh;
  rearFinTop: InstancedMesh;
  sensor: InstancedMesh;
}

interface RocketPoolVisual {
  activeCount: number;
  flameMesh: InstancedMesh;
  flameScale: Vec2;
  partMeshList: readonly InstancedMesh[];
  parts: RocketPartMeshes;
  scale: Vec2;
  silhouette: RocketMeshSilhouette;
  trailActiveCount: number;
  trailCapacity: number;
  trailMesh: InstancedMesh;
  trailScale: Vec2;
}

interface RocketLaunchBurstPoolVisual {
  activeCount: number;
  mesh: InstancedMesh;
  scale: Vec2;
}

interface DebrisVisual {
  colorAttribute: Float32BufferAttribute;
  geometry: BufferGeometry;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
}

interface BoostBurstVisual {
  geometry: BufferGeometry;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
  wakeVisuals: readonly {
    material: MeshBasicMaterial;
    mesh: Mesh;
  }[];
}

interface GravityPulseVisual {
  coreMaterial: MeshBasicMaterial;
  coreMesh: Mesh;
  echoMaterial: MeshBasicMaterial;
  echoMesh: Mesh;
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
}

interface ImpactBurstVisual {
  coreMesh: Mesh;
  glowMesh: Mesh;
  ringMesh: Mesh;
}

interface CloakVisual {
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
  veilMaterial: MeshBasicMaterial;
  veilMesh: Mesh;
}

interface PlanetExplosionChunkVisual {
  baseScale: Vector3;
  direction: Vec2;
  driftDistance: number;
  lateralAmplitude: number;
  lift: number;
  mesh: Mesh;
  radialOffset: number;
  rotationPhase: Vector3;
  rotationSpeed: Vector3;
  tangent: Vec2;
}

interface PlanetExplosionVisual {
  chunkMaterials: readonly [MeshBasicMaterial, MeshBasicMaterial];
  chunks: readonly PlanetExplosionChunkVisual[];
  coreMaterial: MeshBasicMaterial;
  coreMesh: Mesh;
  glowMaterial: MeshBasicMaterial;
  glowMesh: Mesh;
  group: Group;
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
  shockwaveMaterial: MeshBasicMaterial;
  shockwaveMesh: Mesh;
}

interface CannonFireState {
  flashStartSec: number;
  lastAmmo: Record<RocketKind, number>;
}

interface PlanetGlowMaterialResult {
  contactStartNode: ReturnType<typeof uniform>;
  fadeStartNode: ReturnType<typeof uniform>;
  material: MeshBasicNodeMaterial;
  opacityUniform: ReturnType<typeof uniform>;
  riseEndNode: ReturnType<typeof uniform>;
  riseStartNode: ReturnType<typeof uniform>;
}

interface BoostWakeResult {
  material: MeshBasicMaterial;
  texture: { dispose: () => void } | null;
}

interface RocketRenderProfile {
  bodyScale: Vec2;
  core: string;
  flameScale: Vec2;
  trail: string;
  trailScale: Vec2;
}

const registerDisposables = (
  disposables: Array<{ dispose: () => void }>,
  ...items: Array<{ dispose: () => void } | Array<{ dispose: () => void }>>
) => {
  for (const item of items) {
    if (Array.isArray(item)) {
      disposables.push(...item);
      continue;
    }

    disposables.push(item);
  }
};

const createHiddenInstanceMatrix = () =>
  new Matrix4().compose(
    new Vector3(1e8, 1e8, 1e8),
    new Quaternion(),
    new Vector3(0.001, 0.001, 0.001),
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

export const createLocalViewportVisualResources = ({
  boostColor,
  createBlackHoleCoreMaterial,
  createBlackHoleLensMaterial,
  createBlackHoleRingMaterial,
  createBoostWakeMaterial,
  createNeutronStarCoreMaterial,
  createNeutronStarHaloMaterial,
  createNeutronStarJetMaterial,
  createNeutronStarLensMaterial,
  createPlanetExplosionVisual,
  createPlanetGlowMaterial,
  createPlanetMaterial,
  getPlanetForestProfile,
  createPlanetSpinAxis,
  createRocketFlameMaterial,
  createRocketLaunchBurstMaterial,
  createRocketMaterial,
  createRocketTrailMaterial,
  createSunCoreMaterial,
  createSunGlowMaterial,
  createWarpMaterial,
  boostBurstSampleLimit,
  debrisSampleLimit,
  disposeCacheVisual,
  disposables,
  getBlackHoleCoreRadius,
  getBlackHoleLensRadius,
  getBlackHoleRingRadius,
  hostElement,
  impactBurstLimit,
  initialState,
  launchBurstInstanceLimits,
  maxTrailSamples,
  planetExplosionLimit,
  planetGeometrySegments,
  planetTrailPointSize,
  rocketTrailInstanceLimits,
  rocketWeaponKinds,
  rocketRenderProfiles,
  scene,
  shieldColor,
  shieldGlowOuterScale,
  shieldInnerScale,
  shieldOuterScale,
  sunGeometrySegments,
  glowGeometrySegments,
  warpGeometrySegments,
  wildcardColor,
  reticleBaseColor,
  weaponColors,
}: {
  boostColor: string;
  createBlackHoleCoreMaterial: () => MeshBasicNodeMaterial;
  createBlackHoleLensMaterial: () => MeshBasicNodeMaterial;
  createBlackHoleRingMaterial: () => MeshBasicNodeMaterial;
  createBoostWakeMaterial: () => BoostWakeResult;
  createNeutronStarCoreMaterial: (seed: number) => MeshBasicNodeMaterial;
  createNeutronStarHaloMaterial: (seed: number) => MeshBasicNodeMaterial;
  createNeutronStarJetMaterial: (seed: number) => MeshBasicNodeMaterial;
  createNeutronStarLensMaterial: (seed: number) => MeshBasicNodeMaterial;
  createPlanetExplosionVisual: (
    scene: Scene,
    flashGeometry: CircleGeometry,
    ringGeometry: RingGeometry,
    fragmentGeometries: readonly BufferGeometry[],
  ) => PlanetExplosionVisual;
  createPlanetGlowMaterial: (
    planetColor: string,
    seed: number,
    auraScale: number,
    auraGap: number,
  ) => PlanetGlowMaterialResult;
  createPlanetMaterial: (
    planetVisuals: PlanetArchetypeVisualSpec,
    seed: number,
    forestProfile?: {
      color: string;
      coverage: number;
    },
  ) => MeshBasicNodeMaterial & {
    opacityUniform: ReturnType<typeof uniform>;
  };
  getPlanetForestProfile: (
    archetype: ArchetypeId,
    planetId: number,
  ) => { color: string; coverage: number };
  createPlanetSpinAxis: (seed: number) => Vector3;
  createRocketFlameMaterial: (
    coreColor: string,
    trailColor: string,
  ) => MeshBasicNodeMaterial;
  createRocketLaunchBurstMaterial: (
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
  createSunCoreMaterial: (
    sunColor: string,
    glowColor: string,
    seed: number,
    brightness?: number,
  ) => MeshBasicNodeMaterial;
  createSunGlowMaterial: (
    glowColor: string,
    seed: number,
    brightness?: number,
  ) => MeshBasicNodeMaterial;
  createWarpMaterial: (
    glowColor: string,
    seed: number,
  ) => MeshBasicNodeMaterial;
  boostBurstSampleLimit: number;
  debrisSampleLimit: number;
  disposeCacheVisual: (visual: CacheVisual) => void;
  disposables: Array<{ dispose: () => void }>;
  getBlackHoleCoreRadius: () => number;
  getBlackHoleLensRadius: () => number;
  getBlackHoleRingRadius: () => number;
  hostElement: HTMLDivElement;
  impactBurstLimit: number;
  initialState: CombatSandboxState;
  launchBurstInstanceLimits: Record<RocketKind, number>;
  maxTrailSamples: number;
  planetExplosionLimit: number;
  planetGeometrySegments: number;
  planetTrailPointSize: number;
  rocketTrailInstanceLimits: Record<RocketKind, number>;
  rocketWeaponKinds: readonly RocketKind[];
  rocketRenderProfiles: Record<RocketKind, RocketRenderProfile>;
  scene: Scene;
  shieldColor: string;
  shieldGlowOuterScale: number;
  shieldInnerScale: number;
  shieldOuterScale: number;
  sunGeometrySegments: number;
  glowGeometrySegments: number;
  warpGeometrySegments: number;
  wildcardColor: string;
  reticleBaseColor: string;
  weaponColors: Record<RocketKind, { accent: string }>;
}) => {
  const sunGeometry = new SphereGeometry(
    1,
    sunGeometrySegments,
    sunGeometrySegments,
  );
  const glowGeometry = new CircleGeometry(1, glowGeometrySegments);
  const warpGeometry = new RingGeometry(0.55, 1, warpGeometrySegments);
  const neutronStarJetGeometry = new PlaneGeometry(1, 1);
  const planetGeometry = new SphereGeometry(
    1,
    planetGeometrySegments,
    planetGeometrySegments,
  );
  const sunTuning = getRuntimeTuningDocument().visuals.suns;
  const sunVisuals = initialState.suns.map((sun, index) => {
    const profile = getSunVisualProfile(sunTuning, index);
    const coreMaterial = createSunCoreMaterial(
      profile.color,
      profile.glowColor,
      sun.id,
      profile.coreBrightness,
    );
    const glowMaterial = createSunGlowMaterial(
      profile.glowColor,
      sun.id,
      profile.glowBrightness,
    );
    const warpMaterial = createWarpMaterial(profile.glowColor, sun.id);
    const coreMesh = new Mesh(sunGeometry, coreMaterial);
    const glowMesh = new Mesh(sunGeometry, glowMaterial);
    const warpMesh = new Mesh(warpGeometry, warpMaterial);

    coreMesh.renderOrder = -8;
    glowMesh.renderOrder = -10;
    warpMesh.renderOrder = -12;
    glowMesh.position.z = -2;
    warpMesh.position.z = -4;
    scene.add(warpMesh, glowMesh, coreMesh);
    disposables.push(coreMaterial, glowMaterial, warpMaterial);

    return {
      coreMesh,
      glowMesh,
      rotationSpeed: 0.12 + index * 0.05,
      warpMesh,
    } satisfies SunVisual;
  });

  const neutronStarVisuals = initialState.neutronStars.map((star, index) => {
    const group = new Group();
    const coreMesh = new Mesh(
      sunGeometry,
      createNeutronStarCoreMaterial(star.id),
    );
    const haloMesh = new Mesh(
      glowGeometry,
      createNeutronStarHaloMaterial(star.id),
    );
    const lensMesh = new Mesh(
      glowGeometry,
      createNeutronStarLensMaterial(star.id),
    );
    const jetMeshA = new Mesh(
      neutronStarJetGeometry,
      createNeutronStarJetMaterial(star.id),
    );
    const jetMeshB = new Mesh(
      neutronStarJetGeometry,
      createNeutronStarJetMaterial(star.id + 0.37),
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
    disposables.push(
      coreMesh.material as { dispose: () => void },
      haloMesh.material as { dispose: () => void },
      lensMesh.material as { dispose: () => void },
      jetMeshA.material as { dispose: () => void },
      jetMeshB.material as { dispose: () => void },
    );

    return {
      coreMesh,
      group,
      haloMesh,
      jetMeshA,
      jetMeshB,
      lensMesh,
      phase: index * 0.91 + star.id * 0.0008,
      spinSpeed: 0.22 + index * 0.04,
    } satisfies NeutronStarVisual;
  });

  const planetVisuals = initialState.planets.map((planet, index) => {
    const archetypeVisuals =
      getRuntimeTuningDocument().visuals.planets.archetypes[planet.archetype];
    const forestProfile = getPlanetForestProfile(planet.archetype, planet.id);
    const material = createPlanetMaterial(
      archetypeVisuals,
      planet.id * 0.173,
      forestProfile,
    );
    material.transparent = true;
    const glowMaterial = createPlanetGlowMaterial(
      archetypeVisuals.color,
      planet.id * 0.173,
      archetypeVisuals.auraScale,
      archetypeVisuals.auraGap,
    );
    const mesh = new Mesh(planetGeometry, material);
    const glowMesh = new Mesh(glowGeometry, glowMaterial.material);
    const spinAxis = createPlanetSpinAxis(planet.id);
    const spinPhase =
      mulberry32(Math.imul(planet.id + 1, 0x85ebca6b) >>> 0)() * Math.PI * 2;

    mesh.setRotationFromAxisAngle(spinAxis, spinPhase);
    mesh.renderOrder = -2;
    glowMesh.position.z = 0.16;
    glowMesh.renderOrder = -1;
    scene.add(mesh, glowMesh);
    disposables.push(material, glowMaterial.material);

    return {
      glowContactStartNode: glowMaterial.contactStartNode,
      glowFadeStartNode: glowMaterial.fadeStartNode,
      glowMesh,
      glowOpacityUniform: glowMaterial.opacityUniform,
      glowRiseEndNode: glowMaterial.riseEndNode,
      glowRiseStartNode: glowMaterial.riseStartNode,
      mesh,
      rotationSpeed: 0.28 + index * 0.045,
      surfaceOpacityUniform: material.opacityUniform,
      spinAxis,
      spinPhase,
    } satisfies PlanetVisual;
  });

  const trailVisuals = initialState.planets.map((planet) => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(maxTrailSamples * 3);
    const opacities = new Float32Array(maxTrailSamples);
    const positionAttribute = new Float32BufferAttribute(positions, 3);
    const opacityAttribute = new Float32BufferAttribute(opacities, 1);
    positionAttribute.setUsage(DynamicDrawUsage);
    opacityAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("trailOpacity", opacityAttribute);
    geometry.setDrawRange(0, 0);

    const material = new PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const archetypeVisuals =
      getRuntimeTuningDocument().visuals.planets.archetypes[planet.archetype];
    material.colorNode = color(archetypeVisuals.trailColor);
    material.opacityNode = attribute("trailOpacity", "float");
    material.size = planetTrailPointSize;
    material.alphaTest = 0.01;

    const points = new Points(geometry, material);
    points.frustumCulled = false;
    points.position.z = -1;
    points.renderOrder = -3;

    disposables.push(geometry, material);

    return {
      geometry,
      opacityAttribute,
      points,
      positionAttribute,
      samples: [],
    } satisfies TrailVisual;
  });
  const hiddenTrailUntilByPlanetId = new Map(
    initialState.planets.map((planet) => [
      planet.id,
      planet.hideTrailUntilTick,
    ]),
  );

  const cacheSpriteAssets = createCacheSpriteAssets(hostElement.ownerDocument);
  const cacheVisuals = new Map<number, CacheVisual>();
  const renderedCacheKeysById = new Map<number, CacheIconKey>();
  disposables.push({
    dispose: () => {
      for (const visual of cacheVisuals.values()) {
        scene.remove(visual.group);
        disposeCacheVisual(visual);
      }
      cacheVisuals.clear();
      renderedCacheKeysById.clear();
      disposeCacheSpriteAssets(cacheSpriteAssets);
    },
  });

  const rocketPools = rocketWeaponKinds.reduce(
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
      } satisfies RocketPartMeshes;
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
      trailMesh.name = `rocketTrailPool:${rocketKind}`;
      flameMesh.name = `rocketFlamePool:${rocketKind}`;
      scene.add(trailMesh, flameMesh, ...partMeshList);
      registerDisposables(
        disposables,
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
    {} as Record<RocketKind, RocketPoolVisual>,
  );
  const rocketLaunchBurstPools = rocketWeaponKinds.reduce(
    (pools, rocketKind) => {
      const profile = rocketRenderProfiles[rocketKind];

      const rocketLaunchBurstGeometry = new PlaneGeometry(1, 1);
      rocketLaunchBurstGeometry.name = "rocketLaunchBurst";
      const material = createRocketLaunchBurstMaterial(
        profile.core,
        profile.trail,
      );
      material.name = `rocketLaunchBurst:${rocketKind}`;
      const mesh = new InstancedMesh(
        rocketLaunchBurstGeometry,
        material,
        launchBurstInstanceLimits[rocketKind],
      );
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      const hiddenInit = createHiddenInstanceMatrix();
      for (
        let index = 0;
        index < launchBurstInstanceLimits[rocketKind];
        index += 1
      ) {
        mesh.setMatrixAt(index, hiddenInit);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 21;
      mesh.name = `rocketLaunchBurstPool:${rocketKind}`;
      scene.add(mesh);
      registerDisposables(disposables, rocketLaunchBurstGeometry, material);

      pools[rocketKind] = {
        activeCount: 0,
        mesh,
        scale: profile.trailScale,
      };

      return pools;
    },
    {} as Record<RocketKind, RocketLaunchBurstPoolVisual>,
  );

  const debrisGeometry = new BufferGeometry();
  const debrisPositions = new Float32Array(debrisSampleLimit * 3);
  const debrisColors = new Float32Array(debrisSampleLimit * 3);
  const debrisOpacity = new Float32Array(debrisSampleLimit);
  const debrisPositionAttribute = new Float32BufferAttribute(
    debrisPositions,
    3,
  );
  const debrisColorAttribute = new Float32BufferAttribute(debrisColors, 3);
  const debrisOpacityAttribute = new Float32BufferAttribute(debrisOpacity, 1);
  debrisPositionAttribute.setUsage(DynamicDrawUsage);
  debrisColorAttribute.setUsage(DynamicDrawUsage);
  debrisOpacityAttribute.setUsage(DynamicDrawUsage);
  debrisGeometry.setAttribute("position", debrisPositionAttribute);
  debrisGeometry.setAttribute("debrisColor", debrisColorAttribute);
  debrisGeometry.setAttribute("debrisOpacity", debrisOpacityAttribute);
  debrisGeometry.setDrawRange(0, 0);

  const debrisMaterial = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  debrisMaterial.colorNode = attribute("debrisColor", "vec3");
  debrisMaterial.opacityNode = attribute("debrisOpacity", "float");
  debrisMaterial.size = 10;
  debrisMaterial.alphaTest = 0.01;
  const debrisPoints = new Points(debrisGeometry, debrisMaterial);
  debrisPoints.renderOrder = 10;
  debrisPoints.position.z = 2;
  debrisPoints.frustumCulled = false;
  scene.add(debrisPoints);
  const debrisVisual = {
    colorAttribute: debrisColorAttribute,
    geometry: debrisGeometry,
    opacityAttribute: debrisOpacityAttribute,
    points: debrisPoints,
    positionAttribute: debrisPositionAttribute,
  } satisfies DebrisVisual;
  registerDisposables(disposables, debrisGeometry, debrisMaterial);

  const boundaryDebrisVisual = createAmbientBoundaryDebrisVisual({
    renderOrder: -11,
    z: -5,
  });
  scene.add(boundaryDebrisVisual.bandGroup, boundaryDebrisVisual.points);
  registerDisposables(
    disposables,
    boundaryDebrisVisual.bandGeometries,
    boundaryDebrisVisual.bandMaterials,
    boundaryDebrisVisual.geometry,
    boundaryDebrisVisual.points.material as { dispose: () => void },
  );

  const cannonMetalMaterial = new MeshBasicNodeMaterial();
  {
    const lightDir = normalize(vec3(-0.35, 0.82, 0.45));
    const viewDir = vec3(0, 0, 1);
    const halfDir = normalize(lightDir.add(viewDir));
    const n = normalize(normalWorld);
    const nDotL = dot(n, lightDir);
    const wrap = nDotL.mul(0.5).add(0.5);
    const lambert = pow(wrap, float(2.2));
    const shading = mix(float(0.05), float(1.08), lambert);
    const nDotH = max(dot(n, halfDir), float(0));
    const spec = pow(nDotH, float(32)).mul(0.7);
    cannonMetalMaterial.colorNode = color("#7a8aa2")
      .mul(shading)
      .add(color("#e5edff").mul(spec));
  }
  const cannonAccentMaterial = new MeshBasicNodeMaterial();
  const cannonAccentTint = uniform(new Color(reticleBaseColor));
  {
    const lightDir = normalize(vec3(-0.4, 0.75, 0.55));
    const viewDir = vec3(0, 0, 1);
    const halfDir = normalize(lightDir.add(viewDir));
    const n = normalize(normalWorld);
    const nDotL = max(dot(n, lightDir), float(0));
    const halfLambert = nDotL.mul(0.5).add(0.5);
    const lambert = pow(halfLambert, float(1.4));
    const shading = mix(float(0.1), float(0.78), lambert);
    const nDotH = max(dot(n, halfDir), float(0));
    const spec = pow(nDotH, float(18)).mul(0.22);
    cannonAccentMaterial.colorNode = cannonAccentTint
      .mul(shading)
      .add(color("#ffffff").mul(spec));
  }
  const cannonFlashMaterial = new MeshBasicMaterial({
    color: "#fff1c2",
    depthWrite: false,
    opacity: 0,
    transparent: true,
    blending: AdditiveBlending,
  });

  const cannonStemGeometry = new CylinderGeometry(1, 1, 1, 16).rotateZ(
    -Math.PI / 2,
  );
  const cannonBreechGeometry = new BoxGeometry(1, 1, 1);
  const cannonBarrelGeometry = new CylinderGeometry(1, 1, 1, 20).rotateZ(
    -Math.PI / 2,
  );
  const cannonBarrelBandGeometry = new CylinderGeometry(1, 1, 1, 20).rotateZ(
    -Math.PI / 2,
  );
  const cannonMuzzleGeometry = new CylinderGeometry(1, 1, 1, 22).rotateZ(
    -Math.PI / 2,
  );
  const cannonFlashGeometry = new SphereGeometry(1, 18, 12);

  const cannonStemMesh = new Mesh(cannonStemGeometry, cannonMetalMaterial);
  cannonStemMesh.renderOrder = 14;
  const cannonBreechMesh = new Mesh(cannonBreechGeometry, cannonMetalMaterial);
  cannonBreechMesh.renderOrder = 15;
  const cannonBarrelMesh = new Mesh(cannonBarrelGeometry, cannonMetalMaterial);
  cannonBarrelMesh.renderOrder = 16;
  const cannonBarrelBandMesh = new Mesh(
    cannonBarrelBandGeometry,
    cannonAccentMaterial,
  );
  cannonBarrelBandMesh.renderOrder = 17;
  const cannonMuzzleMesh = new Mesh(cannonMuzzleGeometry, cannonAccentMaterial);
  cannonMuzzleMesh.renderOrder = 18;
  const cannonFlashMesh = new Mesh(cannonFlashGeometry, cannonFlashMaterial);
  cannonFlashMesh.renderOrder = 20;
  cannonFlashMesh.visible = false;
  const cannonGroup = new Group();
  cannonGroup.visible = false;
  cannonGroup.position.z = 6;
  cannonGroup.add(
    cannonStemMesh,
    cannonBreechMesh,
    cannonBarrelMesh,
    cannonBarrelBandMesh,
    cannonMuzzleMesh,
    cannonFlashMesh,
  );
  scene.add(cannonGroup);
  const cannonFireState = {
    flashStartSec: -Infinity,
    lastAmmo: {
      heavy: initialState.player.ammo.heavy,
      light: initialState.player.ammo.light,
      seeker: initialState.player.ammo.seeker,
    } as Record<RocketKind, number>,
  } satisfies CannonFireState;

  const reticleRingMaterial = new MeshBasicMaterial({
    color: reticleBaseColor,
    depthWrite: false,
    opacity: 0.92,
    transparent: true,
  });
  const reticleRingMesh = new Mesh(
    new RingGeometry(15, 22, 48),
    reticleRingMaterial,
  );
  reticleRingMesh.renderOrder = 15;
  reticleRingMesh.position.z = 7;
  scene.add(reticleRingMesh);

  const reticleDotMaterial = new MeshBasicMaterial({
    color: reticleBaseColor,
    depthWrite: false,
    opacity: 0.95,
    transparent: true,
  });
  const reticleDotMesh = new Mesh(
    new CircleGeometry(4.5, 28),
    reticleDotMaterial,
  );
  reticleDotMesh.renderOrder = 16;
  reticleDotMesh.position.z = 7.5;
  scene.add(reticleDotMesh);

  const lockRingProgressUniform = uniform(0);
  const lockRingLockedUniform = uniform(0);
  const lockRingTimeUniform = uniform(0);
  const lockRingMaterial = new MeshBasicNodeMaterial({
    depthWrite: false,
    transparent: true,
  });
  {
    const ringUv = uv();
    const softEdge = float(0.006);
    const maskFactor = float(1).sub(
      smoothstep(
        lockRingProgressUniform.sub(softEdge),
        lockRingProgressUniform.add(softEdge),
        ringUv.x,
      ),
    );
    const chargingColor = color("#ffb347");
    const lockedColor = color(weaponColors.seeker.accent);
    const pulse = sin(lockRingTimeUniform.mul(float(11)))
      .mul(0.22)
      .add(1);
    const chargingBrightness = float(0.85);
    const lockedBrightness = pulse.mul(1.15);
    const brightness = mix(
      chargingBrightness,
      lockedBrightness,
      lockRingLockedUniform,
    );
    const ringTint = mix(chargingColor, lockedColor, lockRingLockedUniform);
    lockRingMaterial.colorNode = ringTint.mul(brightness);
    lockRingMaterial.opacityNode = maskFactor.mul(
      mix(float(0.85), float(0.95), lockRingLockedUniform),
    );
  }
  const lockRingMesh = new Mesh(
    new RingGeometry(1, 1.12, 96, 1, -Math.PI / 2, Math.PI * 2),
    lockRingMaterial,
  );
  lockRingMesh.visible = false;
  lockRingMesh.renderOrder = 13;
  lockRingMesh.position.z = 5.5;
  scene.add(lockRingMesh);

  const {
    shieldArcMaterial,
    shieldArcMesh,
    shieldArcOpacityUniform,
    shieldPanelMaterial,
    shieldPanelMesh,
    shieldPanelOpacityUniform,
    shieldCrestMaterial,
    shieldCrestMesh,
    shieldCrestOpacityUniform,
    shieldGlowMaterial,
    shieldGlowMesh,
    shieldGlowOpacityUniform,
    shieldGroup,
  } = createShieldVisual({
    arcDeg: SHIELD_SPEC.arcDeg,
    glowOuterScale: shieldGlowOuterScale,
    innerScale: shieldInnerScale,
    outerScale: shieldOuterScale,
    shieldColor,
  });
  shieldGroup.visible = false;
  scene.add(shieldGroup);

  const boostBurstGeometry = new BufferGeometry();
  const boostBurstPositions = new Float32Array(boostBurstSampleLimit * 3);
  const boostBurstOpacity = new Float32Array(boostBurstSampleLimit);
  const boostBurstPositionAttribute = new Float32BufferAttribute(
    boostBurstPositions,
    3,
  );
  const boostBurstOpacityAttribute = new Float32BufferAttribute(
    boostBurstOpacity,
    1,
  );
  boostBurstPositionAttribute.setUsage(DynamicDrawUsage);
  boostBurstOpacityAttribute.setUsage(DynamicDrawUsage);
  boostBurstGeometry.setAttribute("position", boostBurstPositionAttribute);
  boostBurstGeometry.setAttribute(
    "boostBurstOpacity",
    boostBurstOpacityAttribute,
  );
  boostBurstGeometry.setDrawRange(0, 0);

  const boostBurstMaterial = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  boostBurstMaterial.colorNode = color(boostColor);
  boostBurstMaterial.opacityNode = attribute("boostBurstOpacity", "float");
  boostBurstMaterial.size = 14;
  boostBurstMaterial.alphaTest = 0.01;

  const boostBurstPoints = new Points(boostBurstGeometry, boostBurstMaterial);
  boostBurstPoints.frustumCulled = false;
  boostBurstPoints.renderOrder = 13;
  boostBurstPoints.position.z = 2.2;
  boostBurstPoints.visible = false;
  scene.add(boostBurstPoints);

  const boostWakeGeometry = new PlaneGeometry(1, 1);
  boostWakeGeometry.translate(0.5, 0, 0);
  const boostWakeTemplate = createBoostWakeMaterial();
  const boostWakeVisuals = Array.from({ length: ROOM_CAPACITY }, (_, index) => {
    const material =
      index === 0
        ? boostWakeTemplate.material
        : boostWakeTemplate.material.clone();
    const mesh = new Mesh(boostWakeGeometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 11.8;
    mesh.position.z = 2.26;
    mesh.visible = false;
    scene.add(mesh);
    return {
      material,
      mesh,
    };
  });
  const boostBurstVisual = {
    geometry: boostBurstGeometry,
    opacityAttribute: boostBurstOpacityAttribute,
    points: boostBurstPoints,
    positionAttribute: boostBurstPositionAttribute,
    wakeVisuals: boostWakeVisuals,
  } satisfies BoostBurstVisual;

  const impactFlashGeometry = new CircleGeometry(1, 48);
  const impactRingGeometry = new RingGeometry(0.72, 1, 56);
  const gravityPulseCoreGeometry = new CircleGeometry(1, 56);
  const gravityPulseRingGeometry = new RingGeometry(0.9, 1, 72);
  const impactBurstVisuals = Array.from({ length: impactBurstLimit }, () => {
    const glowMaterial = new MeshBasicMaterial({
      depthWrite: false,
      opacity: 0,
      transparent: true,
      blending: AdditiveBlending,
    });
    const coreMaterial = new MeshBasicMaterial({
      depthWrite: false,
      opacity: 0,
      transparent: true,
      blending: AdditiveBlending,
    });
    const ringMaterial = new MeshBasicMaterial({
      depthWrite: false,
      opacity: 0,
      transparent: true,
      blending: AdditiveBlending,
    });
    const glowMesh = new Mesh(impactFlashGeometry, glowMaterial);
    const coreMesh = new Mesh(impactFlashGeometry, coreMaterial);
    const ringMesh = new Mesh(impactRingGeometry, ringMaterial);
    glowMesh.visible = false;
    coreMesh.visible = false;
    ringMesh.visible = false;
    glowMesh.renderOrder = 12.5;
    ringMesh.renderOrder = 13.2;
    coreMesh.renderOrder = 13.4;
    glowMesh.position.z = 2.55;
    ringMesh.position.z = 2.75;
    coreMesh.position.z = 2.65;
    scene.add(glowMesh, ringMesh, coreMesh);
    disposables.push(glowMaterial, coreMaterial, ringMaterial);

    return {
      coreMesh,
      glowMesh,
      ringMesh,
    } satisfies ImpactBurstVisual;
  });
  registerDisposables(disposables, impactFlashGeometry, impactRingGeometry);

  const gravityPulseCoreMaterial = new MeshBasicMaterial({
    color: tintColor(wildcardColor, 0.02, 0.08, 0.18),
    depthWrite: false,
    opacity: 0,
    transparent: true,
    blending: AdditiveBlending,
  });
  const gravityPulseRingMaterial = new MeshBasicMaterial({
    color: tintColor(wildcardColor, -0.02, 0.18, 0.16),
    depthWrite: false,
    opacity: 0,
    transparent: true,
    blending: AdditiveBlending,
  });
  const gravityPulseEchoMaterial = new MeshBasicMaterial({
    color: tintColor(wildcardColor, -0.05, 0.06, 0.1),
    depthWrite: false,
    opacity: 0,
    transparent: true,
    blending: AdditiveBlending,
  });
  const gravityPulseCoreMesh = new Mesh(
    gravityPulseCoreGeometry,
    gravityPulseCoreMaterial,
  );
  const gravityPulseRingMesh = new Mesh(
    gravityPulseRingGeometry,
    gravityPulseRingMaterial,
  );
  const gravityPulseEchoMesh = new Mesh(
    gravityPulseRingGeometry,
    gravityPulseEchoMaterial,
  );
  gravityPulseCoreMesh.visible = false;
  gravityPulseRingMesh.visible = false;
  gravityPulseEchoMesh.visible = false;
  gravityPulseCoreMesh.renderOrder = 12.4;
  gravityPulseRingMesh.renderOrder = 12.9;
  gravityPulseEchoMesh.renderOrder = 12.7;
  gravityPulseCoreMesh.position.z = 2.2;
  gravityPulseRingMesh.position.z = 2.35;
  gravityPulseEchoMesh.position.z = 2.3;
  scene.add(gravityPulseCoreMesh, gravityPulseRingMesh, gravityPulseEchoMesh);
  const gravityPulseVisual = {
    coreMaterial: gravityPulseCoreMaterial,
    coreMesh: gravityPulseCoreMesh,
    echoMaterial: gravityPulseEchoMaterial,
    echoMesh: gravityPulseEchoMesh,
    ringMaterial: gravityPulseRingMaterial,
    ringMesh: gravityPulseRingMesh,
  } satisfies GravityPulseVisual;
  registerDisposables(
    disposables,
    gravityPulseCoreGeometry,
    gravityPulseRingGeometry,
    gravityPulseCoreMaterial,
    gravityPulseRingMaterial,
    gravityPulseEchoMaterial,
  );

  const cloakVeilGeometry = new CircleGeometry(1, 48);
  const cloakRingGeometry = new RingGeometry(0.88, 1, 64);
  const cloakVisuals = initialState.planets.map(() => {
    const veilMaterial = new MeshBasicMaterial({
      color: tintColor(wildcardColor, -0.12, 0.04, 0.1),
      depthWrite: false,
      opacity: 0,
      transparent: true,
      blending: AdditiveBlending,
    });
    const ringMaterial = new MeshBasicMaterial({
      color: tintColor(wildcardColor, 0.08, 0.18, 0.22),
      depthWrite: false,
      opacity: 0,
      transparent: true,
      blending: AdditiveBlending,
    });
    const veilMesh = new Mesh(cloakVeilGeometry, veilMaterial);
    const ringMesh = new Mesh(cloakRingGeometry, ringMaterial);
    veilMesh.visible = false;
    ringMesh.visible = false;
    veilMesh.renderOrder = 1.2;
    ringMesh.renderOrder = 1.6;
    veilMesh.position.z = 0.28;
    ringMesh.position.z = 0.34;
    scene.add(veilMesh, ringMesh);

    return {
      ringMaterial,
      ringMesh,
      veilMaterial,
      veilMesh,
    } satisfies CloakVisual;
  });
  registerDisposables(
    disposables,
    cloakVeilGeometry,
    cloakRingGeometry,
    cloakVisuals.flatMap((visual) => [
      visual.veilMaterial,
      visual.ringMaterial,
    ]),
  );

  const planetExplosionFragmentGeometries = [
    new BoxGeometry(1, 1, 1, 3, 3, 3),
    new BoxGeometry(1, 1, 1, 2, 3, 2),
    new SphereGeometry(1, 10, 10),
  ] satisfies readonly BufferGeometry[];
  const planetExplosionVisuals = Array.from(
    { length: planetExplosionLimit },
    () =>
      createPlanetExplosionVisual(
        scene,
        impactFlashGeometry,
        impactRingGeometry,
        planetExplosionFragmentGeometries,
      ),
  );
  const inactivePlanetExplosionVisuals = [...planetExplosionVisuals];
  registerDisposables(disposables, planetExplosionFragmentGeometries);
  registerDisposables(
    disposables,
    planetExplosionVisuals.flatMap((visual) => [
      visual.coreMaterial,
      visual.glowMaterial,
      visual.ringMaterial,
      visual.shockwaveMaterial,
      ...visual.chunkMaterials,
    ]),
  );

  const blackHoleGroup = new Group();
  blackHoleGroup.visible = false;
  blackHoleGroup.position.set(0, 0, 4);

  const blackHoleLens = new Mesh(
    new CircleGeometry(1, 72),
    createBlackHoleLensMaterial(),
  );
  blackHoleLens.scale.set(
    getBlackHoleLensRadius(),
    getBlackHoleLensRadius(),
    1,
  );
  blackHoleLens.position.z = -2;
  blackHoleLens.renderOrder = 4;

  const blackHoleRing = new Mesh(
    new RingGeometry(0.42, 1, 96),
    createBlackHoleRingMaterial(),
  );
  blackHoleRing.scale.set(
    getBlackHoleRingRadius(),
    getBlackHoleRingRadius(),
    1,
  );
  blackHoleRing.renderOrder = 5;

  const blackHoleCore = new Mesh(
    new CircleGeometry(1, 72),
    createBlackHoleCoreMaterial(),
  );
  blackHoleCore.scale.set(
    getBlackHoleCoreRadius(),
    getBlackHoleCoreRadius(),
    1,
  );
  blackHoleCore.renderOrder = 6;

  blackHoleGroup.add(blackHoleLens, blackHoleRing, blackHoleCore);
  scene.add(blackHoleGroup);

  registerDisposables(
    disposables,
    sunGeometry,
    glowGeometry,
    warpGeometry,
    neutronStarJetGeometry,
    planetGeometry,
    cannonStemGeometry,
    cannonBreechGeometry,
    cannonBarrelGeometry,
    cannonBarrelBandGeometry,
    cannonMuzzleGeometry,
    cannonFlashGeometry,
    cannonMetalMaterial,
    cannonAccentMaterial,
    cannonFlashMaterial,
    reticleRingMesh.geometry,
    reticleRingMaterial,
    reticleDotMesh.geometry,
    reticleDotMaterial,
    lockRingMesh.geometry,
    lockRingMaterial,
    shieldGlowMesh.geometry,
    shieldGlowMaterial,
    shieldArcMesh.geometry,
    shieldArcMaterial,
    shieldPanelMesh.geometry,
    shieldPanelMaterial,
    shieldCrestMesh.geometry,
    shieldCrestMaterial,
    boostBurstGeometry,
    boostBurstMaterial,
    boostWakeGeometry,
    ...boostWakeVisuals.map((visual) => visual.material),
    ...(boostWakeTemplate.texture === null ? [] : [boostWakeTemplate.texture]),
    blackHoleLens.geometry,
    blackHoleLens.material,
    blackHoleRing.geometry,
    blackHoleRing.material,
    blackHoleCore.geometry,
    blackHoleCore.material,
  );

  return {
    blackHoleGroup,
    blackHoleRing,
    boostBurstVisual,
    cacheSpriteAssets,
    cacheVisuals,
    cannonAccentTint,
    cannonBarrelBandMesh,
    cannonBarrelMesh,
    cannonBreechMesh,
    cannonFireState,
    cannonFlashMaterial,
    cannonFlashMesh,
    cannonGroup,
    cannonMuzzleMesh,
    cannonStemMesh,
    boundaryDebrisVisual,
    debrisVisual,
    gravityPulseVisual,
    hiddenTrailUntilByPlanetId,
    impactBurstVisuals,
    inactivePlanetExplosionVisuals,
    lockRingLockedUniform,
    lockRingMesh,
    lockRingProgressUniform,
    lockRingTimeUniform,
    planetVisuals,
    renderedCacheKeysById,
    reticleDotMesh,
    reticleRingMesh,
    rocketLaunchBurstPools,
    rocketPools,
    shieldArcOpacityUniform,
    shieldPanelOpacityUniform,
    shieldCrestOpacityUniform,
    shieldGlowOpacityUniform,
    shieldGroup,
    sunVisuals,
    neutronStarVisuals,
    trailVisuals,
    cloakVisuals,
  };
};
