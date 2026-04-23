import type { AsteroidTier } from "@3body/shared";
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
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  Points,
  PointsNodeMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Scene,
} from "three/webgpu";
import { createShieldVisual } from "../shieldVisuals";
import { createAmbientBoundaryDebrisVisual } from "./ambientBoundaryDebris";
import {
  registerViewportDisposables,
  type ViewportDisposable,
} from "./disposables";

interface BoundaryAsteroidLayerVisual {
  activeCount: number;
  capacity: number;
  mesh: InstancedMesh;
}

interface SharedCombatDebrisVisual {
  boundaryAsteroidLayers: Record<AsteroidTier, BoundaryAsteroidLayerVisual>;
  colorAttribute: Float32BufferAttribute;
  geometry: BufferGeometry;
  opacityAttribute: Float32BufferAttribute;
  points: Points;
  positionAttribute: Float32BufferAttribute;
}

export interface SharedCombatGravityPulseVisual {
  coreMaterial: MeshBasicMaterial;
  coreMesh: Mesh;
  echoMaterial: MeshBasicMaterial;
  echoMesh: Mesh;
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
}

export interface SharedCombatImpactBurstVisual {
  coreMaterial: MeshBasicMaterial;
  coreMesh: Mesh;
  glowMaterial: MeshBasicMaterial;
  glowMesh: Mesh;
  ringMaterial: MeshBasicMaterial;
  ringMesh: Mesh;
}

interface SharedCombatPlanetExplosionVisual {
  chunkMaterials: readonly ViewportDisposable[];
  coreMaterial: ViewportDisposable;
  glowMaterial: ViewportDisposable;
  ringMaterial: ViewportDisposable;
  shockwaveMaterial: ViewportDisposable;
}

const BOUNDARY_ASTEROID_TIER_ORDER = [
  "micro",
  "small",
  "large",
] as const satisfies readonly AsteroidTier[];

const BOUNDARY_ASTEROID_COLOR_BY_TIER = {
  large: "#ffb87a",
  micro: "#d7f1ff",
  small: "#ffd98f",
} as const satisfies Record<AsteroidTier, string>;

const createHiddenInstanceMatrix = () =>
  new Matrix4().compose(
    new Vector3(1e8, 1e8, 1e8),
    new Quaternion(),
    new Vector3(0.001, 0.001, 0.001),
  );

const createBoundaryAsteroidGeometry = (
  radius: number,
  seed: number,
): BufferGeometry => {
  const baseGeometry = new IcosahedronGeometry(radius, 0);
  const geometry =
    baseGeometry.index === null ? baseGeometry : baseGeometry.toNonIndexed();
  const positionAttribute = geometry.getAttribute(
    "position",
  ) as Float32BufferAttribute;
  const positions = positionAttribute.array as Float32Array;

  for (let offset = 0; offset < positions.length; offset += 3) {
    const x = positions[offset]!;
    const y = positions[offset + 1]!;
    const z = positions[offset + 2]!;
    const length = Math.hypot(x, y, z) || 1;
    const nx = x / length;
    const ny = y / length;
    const nz = z / length;
    const hashSeed = nx * 12.9898 + ny * 78.233 + nz * 37.719 + seed * 0.0001;
    const jitter =
      0.8 + 0.34 * ((((Math.sin(hashSeed) * 43758.5453) % 1) + 1) % 1);
    const ridge = 0.92 + 0.16 * Math.abs(nx * 0.66 - ny * 0.28 + nz * 0.58);
    const stretchX = 0.9 + 0.2 * Math.abs(nx);
    const stretchY = 0.88 + 0.24 * Math.abs(ny);
    const stretchZ = 0.86 + 0.22 * Math.abs(nz);

    positions[offset] = nx * radius * jitter * ridge * stretchX;
    positions[offset + 1] = ny * radius * jitter * ridge * stretchY;
    positions[offset + 2] = nz * radius * jitter * ridge * stretchZ;
  }

  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
};

const createBoundaryAsteroidMaterial = (
  accentColor: string,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial();
  const accent = new Color(accentColor);
  accent.offsetHSL(0.01, -0.03, 0.18);

  {
    const lightDir = normalize(vec3(-0.38, 0.61, 0.7));
    const viewDir = vec3(0, 0, 1);
    const halfDir = normalize(lightDir.add(viewDir));
    const n = normalize(normalWorld);
    const nDotL = max(dot(n, lightDir), float(0));
    const lambert = pow(nDotL.mul(0.5).add(0.5), float(1.6));
    const shading = mix(float(0.24), float(1.04), lambert);
    const nDotH = max(dot(n, halfDir), float(0));
    const spec = pow(nDotH, float(20)).mul(0.12);
    const rim = pow(float(1).sub(max(dot(n, viewDir), float(0))), float(2.9));
    material.colorNode = color("#505860")
      .mul(shading)
      .add(color(`#${accent.getHexString()}`).mul(rim.mul(0.14)))
      .add(color("#edf5ff").mul(spec));
  }

  return material;
};

const createSharedCombatDebrisVisual = ({
  meshNamePrefix = "boundaryAsteroid",
  sampleLimit,
}: {
  meshNamePrefix?: string;
  sampleLimit: number;
}): {
  disposables: ViewportDisposable[];
  visual: SharedCombatDebrisVisual;
} => {
  const disposables: ViewportDisposable[] = [];
  const debrisGeometry = new BufferGeometry();
  const debrisPositions = new Float32Array(sampleLimit * 3);
  const debrisColors = new Float32Array(sampleLimit * 3);
  const debrisOpacity = new Float32Array(sampleLimit);
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
  debrisGeometry.setAttribute("color", debrisColorAttribute);
  debrisGeometry.setAttribute("debrisOpacity", debrisOpacityAttribute);
  debrisGeometry.setDrawRange(0, 0);

  const debrisMaterial = new PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: true,
  });
  debrisMaterial.colorNode = attribute("color", "vec3");
  debrisMaterial.opacityNode = attribute("debrisOpacity", "float");
  debrisMaterial.size = 10;
  debrisMaterial.alphaTest = 0.01;

  const debrisPoints = new Points(debrisGeometry, debrisMaterial);
  debrisPoints.frustumCulled = false;
  debrisPoints.renderOrder = 10;
  debrisPoints.position.z = 2;
  debrisPoints.visible = false;

  const boundaryAsteroidGeometry = createBoundaryAsteroidGeometry(1, 0x73a9d1);
  const createBoundaryAsteroidLayer = (tier: AsteroidTier) => {
    const material = createBoundaryAsteroidMaterial(
      BOUNDARY_ASTEROID_COLOR_BY_TIER[tier],
    );
    const mesh = new InstancedMesh(
      boundaryAsteroidGeometry,
      material,
      sampleLimit,
    );
    const hiddenMatrix = createHiddenInstanceMatrix();
    for (let index = 0; index < sampleLimit; index += 1) {
      mesh.setMatrixAt(index, hiddenMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = sampleLimit;
    mesh.frustumCulled = false;
    mesh.renderOrder = 11;
    mesh.position.z = 2.05;
    mesh.name = `${meshNamePrefix}:${tier}`;

    return {
      activeCount: 0,
      capacity: sampleLimit,
      mesh,
    } satisfies BoundaryAsteroidLayerVisual;
  };

  const boundaryAsteroidLayers: Record<
    AsteroidTier,
    BoundaryAsteroidLayerVisual
  > = {
    large: createBoundaryAsteroidLayer("large"),
    micro: createBoundaryAsteroidLayer("micro"),
    small: createBoundaryAsteroidLayer("small"),
  };

  registerViewportDisposables(
    disposables,
    debrisGeometry,
    debrisMaterial,
    boundaryAsteroidGeometry,
    BOUNDARY_ASTEROID_TIER_ORDER.map(
      (tier) =>
        boundaryAsteroidLayers[tier].mesh.material as MeshBasicNodeMaterial,
    ),
  );

  return {
    disposables,
    visual: {
      boundaryAsteroidLayers,
      colorAttribute: debrisColorAttribute,
      geometry: debrisGeometry,
      opacityAttribute: debrisOpacityAttribute,
      points: debrisPoints,
      positionAttribute: debrisPositionAttribute,
    },
  };
};

const createSharedCombatLockRingVisual = ({
  accentColor,
}: {
  accentColor: string;
}) => {
  const progressUniform = uniform(0);
  const lockedUniform = uniform(0);
  const timeUniform = uniform(0);
  const material = new MeshBasicNodeMaterial({
    depthWrite: false,
    transparent: true,
  });

  {
    const ringUv = uv();
    const softEdge = float(0.006);
    const maskFactor = float(1).sub(
      smoothstep(
        progressUniform.sub(softEdge),
        progressUniform.add(softEdge),
        ringUv.x,
      ),
    );
    const chargingColor = color("#ffb347");
    const lockedColor = color(accentColor);
    const pulse = sin(timeUniform.mul(float(11)))
      .mul(0.22)
      .add(1);
    const brightness = mix(float(0.85), pulse.mul(1.15), lockedUniform);
    const ringTint = mix(chargingColor, lockedColor, lockedUniform);
    material.colorNode = ringTint.mul(brightness);
    material.opacityNode = maskFactor.mul(
      mix(float(0.85), float(0.95), lockedUniform),
    );
  }

  const geometry = new RingGeometry(1, 1.12, 96, 1, -Math.PI / 2, Math.PI * 2);
  const mesh = new Mesh(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 13;
  mesh.position.z = 5.5;

  return {
    geometry,
    lockedUniform,
    material,
    mesh,
    progressUniform,
    timeUniform,
  };
};

export const createSharedCombatSceneResources = <
  TPlanetExplosionVisual extends SharedCombatPlanetExplosionVisual,
>({
  boundaryAsteroidMeshNamePrefix,
  createBlackHoleCoreMaterial,
  createBlackHoleLensMaterial,
  createBlackHoleRingMaterial,
  createPlanetExplosionVisual,
  debrisSampleLimit,
  getBlackHoleCoreRadius,
  getBlackHoleLensRadius,
  getBlackHoleRingRadius,
  gravityPulseColors,
  gravityPulseRenderOrders,
  impactBurstLimit,
  lockRingAccentColor,
  planetExplosionLimit,
  scene,
  shieldArcDeg,
  shieldColor,
  shieldGlowOuterScale,
  shieldInnerScale,
  shieldOuterScale,
  blackHoleDepthOffsets,
}: {
  blackHoleDepthOffsets?: {
    core?: number;
    lens?: number;
    ring?: number;
  };
  boundaryAsteroidMeshNamePrefix?: string;
  createBlackHoleCoreMaterial: () => MeshBasicNodeMaterial;
  createBlackHoleLensMaterial: () => MeshBasicNodeMaterial;
  createBlackHoleRingMaterial: () => MeshBasicNodeMaterial;
  createPlanetExplosionVisual: (
    scene: Scene,
    flashGeometry: CircleGeometry,
    ringGeometry: RingGeometry,
    fragmentGeometries: readonly BufferGeometry[],
  ) => TPlanetExplosionVisual;
  debrisSampleLimit: number;
  getBlackHoleCoreRadius: () => number;
  getBlackHoleLensRadius: () => number;
  getBlackHoleRingRadius: () => number;
  gravityPulseColors: {
    core: string;
    echo: string;
    ring: string;
  };
  gravityPulseRenderOrders: {
    core: number;
    echo: number;
    ring: number;
  };
  impactBurstLimit: number;
  lockRingAccentColor: string;
  planetExplosionLimit: number;
  scene: Scene;
  shieldArcDeg: number;
  shieldColor: string;
  shieldGlowOuterScale: number;
  shieldInnerScale: number;
  shieldOuterScale: number;
}) => {
  const disposables: ViewportDisposable[] = [];
  const { disposables: debrisDisposables, visual: debrisVisual } =
    createSharedCombatDebrisVisual({
      meshNamePrefix: boundaryAsteroidMeshNamePrefix,
      sampleLimit: debrisSampleLimit,
    });
  scene.add(
    debrisVisual.points,
    ...BOUNDARY_ASTEROID_TIER_ORDER.map(
      (tier) => debrisVisual.boundaryAsteroidLayers[tier].mesh,
    ),
  );
  registerViewportDisposables(disposables, debrisDisposables);

  const boundaryDebrisVisual = createAmbientBoundaryDebrisVisual({
    renderOrder: -11,
    z: -5,
  });
  boundaryDebrisVisual.fallingGroup.position.z = 2.08;
  for (const layer of boundaryDebrisVisual.fallingLayers) {
    layer.mesh.renderOrder = 11;
  }
  scene.add(
    boundaryDebrisVisual.bandGroup,
    boundaryDebrisVisual.fallingGroup,
    boundaryDebrisVisual.points,
  );
  registerViewportDisposables(
    disposables,
    boundaryDebrisVisual.bandGeometries,
    boundaryDebrisVisual.bandMaterials,
    boundaryDebrisVisual.geometry,
    boundaryDebrisVisual.points.material as ViewportDisposable,
  );

  const impactFlashGeometry = new CircleGeometry(1, 48);
  const impactRingGeometry = new RingGeometry(0.72, 1, 56);
  const impactBurstVisuals = Array.from({ length: impactBurstLimit }, () => {
    const glowMaterial = new MeshBasicMaterial({
      depthWrite: false,
      opacity: 0,
      transparent: true,
      blending: AdditiveBlending,
    });
    const coreMaterial = new MeshBasicMaterial({
      color: "#fff5dd",
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
    scene.add(glowMesh, ringMesh, coreMesh);
    registerViewportDisposables(
      disposables,
      glowMaterial,
      coreMaterial,
      ringMaterial,
    );

    return {
      coreMaterial,
      coreMesh,
      glowMaterial,
      glowMesh,
      ringMaterial,
      ringMesh,
    } satisfies SharedCombatImpactBurstVisual;
  });
  registerViewportDisposables(
    disposables,
    impactFlashGeometry,
    impactRingGeometry,
  );

  const gravityPulseCoreGeometry = new CircleGeometry(1, 56);
  const gravityPulseRingGeometry = new RingGeometry(0.9, 1, 72);
  const gravityPulseCoreMaterial = new MeshBasicMaterial({
    color: gravityPulseColors.core,
    depthWrite: false,
    opacity: 0,
    transparent: true,
    blending: AdditiveBlending,
  });
  const gravityPulseRingMaterial = new MeshBasicMaterial({
    color: gravityPulseColors.ring,
    depthWrite: false,
    opacity: 0,
    transparent: true,
    blending: AdditiveBlending,
  });
  const gravityPulseEchoMaterial = new MeshBasicMaterial({
    color: gravityPulseColors.echo,
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
  gravityPulseCoreMesh.renderOrder = gravityPulseRenderOrders.core;
  gravityPulseRingMesh.renderOrder = gravityPulseRenderOrders.ring;
  gravityPulseEchoMesh.renderOrder = gravityPulseRenderOrders.echo;
  scene.add(gravityPulseCoreMesh, gravityPulseRingMesh, gravityPulseEchoMesh);
  registerViewportDisposables(
    disposables,
    gravityPulseCoreGeometry,
    gravityPulseRingGeometry,
    gravityPulseCoreMaterial,
    gravityPulseRingMaterial,
    gravityPulseEchoMaterial,
  );
  const gravityPulseVisual = {
    coreMaterial: gravityPulseCoreMaterial,
    coreMesh: gravityPulseCoreMesh,
    echoMaterial: gravityPulseEchoMaterial,
    echoMesh: gravityPulseEchoMesh,
    ringMaterial: gravityPulseRingMaterial,
    ringMesh: gravityPulseRingMesh,
  } satisfies SharedCombatGravityPulseVisual;

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
  registerViewportDisposables(disposables, planetExplosionFragmentGeometries);
  registerViewportDisposables(
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
  const blackHoleLens = new Mesh(
    new CircleGeometry(1, 72),
    createBlackHoleLensMaterial(),
  );
  const blackHoleRing = new Mesh(
    new RingGeometry(0.42, 1, 96),
    createBlackHoleRingMaterial(),
  );
  const blackHoleCore = new Mesh(
    new CircleGeometry(1, 72),
    createBlackHoleCoreMaterial(),
  );
  blackHoleLens.scale.set(
    getBlackHoleLensRadius(),
    getBlackHoleLensRadius(),
    1,
  );
  blackHoleRing.scale.set(
    getBlackHoleRingRadius(),
    getBlackHoleRingRadius(),
    1,
  );
  blackHoleCore.scale.set(
    getBlackHoleCoreRadius(),
    getBlackHoleCoreRadius(),
    1,
  );
  blackHoleLens.position.z = blackHoleDepthOffsets?.lens ?? -2;
  blackHoleRing.position.z = blackHoleDepthOffsets?.ring ?? 0;
  blackHoleCore.position.z = blackHoleDepthOffsets?.core ?? 0;
  blackHoleLens.renderOrder = 4;
  blackHoleRing.renderOrder = 5;
  blackHoleCore.renderOrder = 6;
  blackHoleGroup.add(blackHoleLens, blackHoleRing, blackHoleCore);
  scene.add(blackHoleGroup);
  registerViewportDisposables(
    disposables,
    blackHoleLens.geometry,
    blackHoleLens.material as ViewportDisposable,
    blackHoleRing.geometry,
    blackHoleRing.material as ViewportDisposable,
    blackHoleCore.geometry,
    blackHoleCore.material as ViewportDisposable,
  );

  const lockRingVisual = createSharedCombatLockRingVisual({
    accentColor: lockRingAccentColor,
  });
  scene.add(lockRingVisual.mesh);
  registerViewportDisposables(
    disposables,
    lockRingVisual.geometry,
    lockRingVisual.material,
  );

  const shieldVisual = createShieldVisual({
    arcDeg: shieldArcDeg,
    glowOuterScale: shieldGlowOuterScale,
    innerScale: shieldInnerScale,
    outerScale: shieldOuterScale,
    shieldColor,
  });
  shieldVisual.shieldGroup.visible = false;
  scene.add(shieldVisual.shieldGroup);
  registerViewportDisposables(
    disposables,
    shieldVisual.shieldGlowMesh.geometry,
    shieldVisual.shieldGlowMaterial,
    shieldVisual.shieldArcMesh.geometry,
    shieldVisual.shieldArcMaterial,
    shieldVisual.shieldPanelMesh.geometry,
    shieldVisual.shieldPanelMaterial,
    shieldVisual.shieldCrestMesh.geometry,
    shieldVisual.shieldCrestMaterial,
  );

  return {
    blackHoleGroup,
    blackHoleRing,
    boundaryDebrisVisual,
    debrisVisual,
    disposables,
    gravityPulseVisual,
    impactBurstVisuals,
    inactivePlanetExplosionVisuals,
    lockRingLockedUniform: lockRingVisual.lockedUniform,
    lockRingMesh: lockRingVisual.mesh,
    lockRingProgressUniform: lockRingVisual.progressUniform,
    lockRingTimeUniform: lockRingVisual.timeUniform,
    shieldArcOpacityUniform: shieldVisual.shieldArcOpacityUniform,
    shieldCrestOpacityUniform: shieldVisual.shieldCrestOpacityUniform,
    shieldGlowOpacityUniform: shieldVisual.shieldGlowOpacityUniform,
    shieldGroup: shieldVisual.shieldGroup,
    shieldPanelOpacityUniform: shieldVisual.shieldPanelOpacityUniform,
  };
};
