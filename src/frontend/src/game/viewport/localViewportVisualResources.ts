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
  uniform,
  vec3,
} from "three/tsl";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  Points,
  PointsNodeMaterial,
  RingGeometry,
  type Scene,
  SphereGeometry,
  Vector3,
} from "three/webgpu";
import type { CombatSandboxState } from "../combatSandbox";
import {
  createCacheSpriteAssets,
  disposeCacheSpriteAssets,
  type CacheIconKey,
  type CacheVisual,
} from "./cacheVisuals";
import {
  createSharedCombatLaunchBurstPools,
  type SharedCombatLaunchBurstPoolVisual as RocketLaunchBurstPoolVisual,
} from "./sharedCombatLaunchBurstPools";
import {
  createSharedCombatRocketPools,
  type SharedCombatRocketPoolVisual as RocketPoolVisual,
  type SharedCombatRocketRenderProfile as RocketRenderProfile,
} from "./sharedCombatRocketPools";
import { createSharedCombatSceneResources } from "./sharedCombatSceneResources";
import {
  createSharedCombatBoostBurstVisual,
  type SharedCombatBoostWakeMaterialResult,
} from "./sharedCombatBoostVisuals";

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
  createBoostWakeMaterial: () => SharedCombatBoostWakeMaterialResult;
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

  const { disposables: sharedRocketPoolDisposables, rocketPools } =
    createSharedCombatRocketPools({
      createRocketFlameMaterial,
      createRocketMaterial,
      createRocketTrailMaterial,
      rocketKinds: rocketWeaponKinds,
      rocketRenderProfiles,
      rocketTrailInstanceLimits,
      scene,
    });
  disposables.push(...sharedRocketPoolDisposables);
  const {
    disposables: sharedLaunchBurstDisposables,
    launchBurstPools: rocketLaunchBurstPools,
  } = createSharedCombatLaunchBurstPools({
    createRocketLaunchBurstMaterial,
    launchBurstInstanceLimits,
    rocketKinds: rocketWeaponKinds,
    rocketRenderProfiles,
    scene,
  });
  disposables.push(...sharedLaunchBurstDisposables);

  const {
    blackHoleGroup,
    blackHoleRing,
    boundaryDebrisVisual,
    debrisVisual,
    disposables: sharedSceneDisposables,
    gravityPulseVisual,
    impactBurstVisuals,
    inactivePlanetExplosionVisuals,
    lockRingLockedUniform,
    lockRingMesh,
    lockRingProgressUniform,
    lockRingTimeUniform,
    shieldArcOpacityUniform,
    shieldPanelOpacityUniform,
    shieldCrestOpacityUniform,
    shieldGlowOpacityUniform,
    shieldGroup,
  } = createSharedCombatSceneResources({
    boundaryAsteroidMeshNamePrefix: "boundaryAsteroid",
    createBlackHoleCoreMaterial,
    createBlackHoleLensMaterial,
    createBlackHoleRingMaterial,
    createPlanetExplosionVisual,
    debrisSampleLimit,
    getBlackHoleCoreRadius,
    getBlackHoleLensRadius,
    getBlackHoleRingRadius,
    gravityPulseColors: {
      core: `#${tintColor(wildcardColor, 0.02, 0.08, 0.18).getHexString()}`,
      echo: `#${tintColor(wildcardColor, -0.05, 0.06, 0.1).getHexString()}`,
      ring: `#${tintColor(wildcardColor, -0.02, 0.18, 0.16).getHexString()}`,
    },
    gravityPulseRenderOrders: {
      core: 12.4,
      echo: 12.7,
      ring: 12.9,
    },
    impactBurstLimit,
    lockRingAccentColor: weaponColors.seeker.accent,
    planetExplosionLimit,
    scene,
    shieldArcDeg: SHIELD_SPEC.arcDeg,
    shieldColor,
    shieldGlowOuterScale,
    shieldInnerScale,
    shieldOuterScale,
  });
  registerDisposables(disposables, sharedSceneDisposables);

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

  const { disposables: boostBurstDisposables, visual: boostBurstVisual } =
    createSharedCombatBoostBurstVisual({
      boostColor,
      createBoostWakeMaterial,
      sampleLimit: boostBurstSampleLimit,
      scene,
      wakeCount: ROOM_CAPACITY,
    });

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
    boostBurstDisposables,
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
  };
};
