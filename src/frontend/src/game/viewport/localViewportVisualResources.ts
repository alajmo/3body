import type {
  ArchetypeId,
  PlanetArchetypeVisualSpec,
  RocketKind,
  Vec2,
} from "@3body/shared";
import { getSunVisualProfile, ROOM_CAPACITY, SHIELD_SPEC } from "@3body/shared";
import {
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
  type BufferGeometry,
  CircleGeometry,
  Color,
  type Group,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  RingGeometry,
  type Scene,
  SphereGeometry,
  type Vector3,
} from "three/webgpu";
import type { CombatSandboxState } from "../combatSandbox";
import { getRuntimeTuningDocument } from "../runtimeTuning";
import type { CacheVisual } from "./cacheVisuals";
import type { SharedCombatBoostWakeMaterialResult } from "./sharedCombatBoostVisuals";
import {
  createSharedCombatNeutronStarVisual,
  createSharedCombatSunVisual,
  disposeSharedCombatNeutronStarVisual,
  disposeSharedCombatSunVisual,
  type SharedCombatNeutronStarVisual as NeutronStarVisual,
  type SharedCombatSunVisual as SunVisual,
} from "./sharedCombatCelestialVisuals";
import {
  createSharedCombatPlanetVisual,
  disposeSharedCombatPlanetVisual,
  type SharedCombatPlanetVisual as PlanetVisual,
} from "./sharedCombatPlanetVisuals";
import type { SharedCombatRocketRenderProfile as RocketRenderProfile } from "./sharedCombatRocketPools";
import { createSharedCombatViewportVisualResources } from "./sharedCombatViewportResources";

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
  blackHoleSwallowCapacity,
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
  planetExplosionLimit,
  planetGeometrySegments,
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
  blackHoleSwallowCapacity: number;
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
  planetExplosionLimit: number;
  planetGeometrySegments: number;
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
  const createSunVisual = ({
    index,
    sun,
    sunProfile = getSunVisualProfile(sunTuning, index),
  }: {
    index: number;
    sun: { id: number };
    sunProfile?: ReturnType<typeof getSunVisualProfile>;
  }) =>
    createSharedCombatSunVisual({
      createSunCoreMaterial,
      createSunGlowMaterial,
      createWarpMaterial,
      scene,
      sunGeometry,
      sunId: sun.id,
      sunProfile,
      warpGeometry,
    });
  const sunVisuals = new Map<number, SunVisual>(
    initialState.suns.map((sun, index) => [
      sun.id,
      createSunVisual({
        index,
        sun,
      }),
    ]),
  );

  const createNeutronStarVisual = ({
    neutronStar,
  }: {
    neutronStar: { id: number };
  }) =>
    createSharedCombatNeutronStarVisual({
      createNeutronStarCoreMaterial,
      createNeutronStarHaloMaterial,
      createNeutronStarJetMaterial,
      createNeutronStarLensMaterial,
      glowGeometry,
      neutronStarId: neutronStar.id,
      ribbonGeometry: neutronStarJetGeometry,
      scene,
      sunGeometry,
    });
  const neutronStarVisuals = new Map<number, NeutronStarVisual>(
    initialState.neutronStars.map((neutronStar) => [
      neutronStar.id,
      createNeutronStarVisual({
        neutronStar,
      }),
    ]),
  );

  const createPlanetVisual = ({
    index,
    planet,
  }: {
    index: number;
    planet: { archetype: ArchetypeId; id: number };
  }) => {
    const archetypeVisuals =
      getRuntimeTuningDocument().visuals.planets.archetypes[planet.archetype];
    return createSharedCombatPlanetVisual({
      archetypeVisuals,
      createPlanetGlowMaterial,
      createPlanetMaterial,
      createPlanetSpinAxis,
      getPlanetForestProfile,
      glowGeometry,
      planet,
      planetGeometry,
      planetIndex: index,
      scene,
    });
  };
  const planetVisuals = new Map<number, PlanetVisual>(
    initialState.planets.map((planet, index) => [
      planet.id,
      createPlanetVisual({
        index,
        planet,
      }),
    ]),
  );

  disposables.push({
    dispose: () => {
      for (const visual of sunVisuals.values()) {
        disposeSharedCombatSunVisual(visual);
      }
      sunVisuals.clear();

      for (const visual of neutronStarVisuals.values()) {
        disposeSharedCombatNeutronStarVisual(visual);
      }
      neutronStarVisuals.clear();

      for (const visual of planetVisuals.values()) {
        disposeSharedCombatPlanetVisual(visual);
      }
      planetVisuals.clear();

      sunGeometry.dispose();
      glowGeometry.dispose();
      warpGeometry.dispose();
      neutronStarJetGeometry.dispose();
      planetGeometry.dispose();
    },
  });
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

  const {
    blackHoleGroup,
    blackHoleRing,
    boostBurstVisual,
    boundaryDebrisVisual,
    cacheSpriteAssets,
    cacheVisuals,
    cannonVisual,
    debrisVisual,
    gravityPulseVisual,
    impactBurstVisuals,
    inactiveBlackHoleSwallowVisuals,
    inactivePlanetExplosionVisuals,
    lockRingLockedUniform,
    lockRingMesh,
    lockRingProgressUniform,
    lockRingTimeUniform,
    renderedCacheKeysById,
    rocketLaunchBurstPools,
    rocketPools,
    shieldArcOpacityUniform,
    shieldPanelOpacityUniform,
    shieldCrestOpacityUniform,
    shieldGlowOpacityUniform,
    shieldGroup,
  } = createSharedCombatViewportVisualResources({
    blackHoleSwallowCapacity,
    boostBurstSampleLimit,
    boostColor,
    boundaryAsteroidMeshNamePrefix: "boundaryAsteroid",
    cannon: {
      accentMaterial: cannonAccentMaterial,
      flashMaterial: cannonFlashMaterial,
      metalMaterial: cannonMetalMaterial,
      setAccentColor: (value: string) => {
        cannonAccentTint.value.set(value);
      },
    },
    createBlackHoleCoreMaterial,
    createBlackHoleLensMaterial,
    createBlackHoleRingMaterial,
    createBoostWakeMaterial,
    createPlanetExplosionVisual,
    createRocketFlameMaterial,
    createRocketLaunchBurstMaterial,
    createRocketMaterial,
    createRocketTrailMaterial,
    debrisSampleLimit,
    disposeCacheVisual,
    disposables,
    document: hostElement.ownerDocument,
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
    launchBurstInstanceLimits,
    lockRingAccentColor: weaponColors.seeker.accent,
    planetExplosionLimit,
    rocketKinds: rocketWeaponKinds,
    rocketRenderProfiles,
    rocketTrailInstanceLimits,
    scene,
    shieldArcDeg: SHIELD_SPEC.arcDeg,
    shieldColor,
    shieldGlowOuterScale,
    shieldInnerScale,
    shieldOuterScale,
    wakeCount: ROOM_CAPACITY,
  });
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

  registerDisposables(
    disposables,
    reticleRingMesh.geometry,
    reticleRingMaterial,
    reticleDotMesh.geometry,
    reticleDotMaterial,
  );

  return {
    blackHoleGroup,
    blackHoleRing,
    boostBurstVisual,
    cacheSpriteAssets,
    cacheVisuals,
    cannonFireState,
    cannonVisual,
    boundaryDebrisVisual,
    debrisVisual,
    gravityPulseVisual,
    impactBurstVisuals,
    inactivePlanetExplosionVisuals,
    inactiveBlackHoleSwallowVisuals,
    lockRingLockedUniform,
    lockRingMesh,
    lockRingProgressUniform,
    lockRingTimeUniform,
    createNeutronStarVisual,
    createPlanetVisual,
    createSunVisual,
    disposeNeutronStarVisual: disposeSharedCombatNeutronStarVisual,
    disposePlanetVisual: disposeSharedCombatPlanetVisual,
    disposeSunVisual: disposeSharedCombatSunVisual,
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
  };
};
