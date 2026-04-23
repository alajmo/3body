import type { RocketKind } from "@3body/shared";
import type {
  BufferGeometry,
  CircleGeometry,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  RingGeometry,
  Scene,
} from "three/webgpu";
import {
  createBlackHoleSwallowVisualPool,
  type BlackHoleSwallowVisual,
} from "./blackHoleVisuals";
import {
  type CacheIconKey,
  type CacheSpriteAssets,
  type CacheVisual,
  createCacheSpriteAssets,
  disposeCacheSpriteAssets,
} from "./cacheVisuals";
import {
  createSharedCombatBoostBurstVisual,
  type SharedCombatBoostBurstVisual,
  type SharedCombatBoostWakeMaterialResult,
} from "./sharedCombatBoostVisuals";
import { createSharedCombatCannonVisual } from "./sharedCombatCannonVisual";
import {
  createSharedCombatLaunchBurstPools,
  type SharedCombatLaunchBurstPoolVisual,
} from "./sharedCombatLaunchBurstPools";
import type { SharedCombatPlanetExplosionVisual } from "./sharedCombatPlanetExplosions";
import {
  createSharedCombatRocketPools,
  type SharedCombatRocketPoolVisual,
  type SharedCombatRocketRenderProfile,
} from "./sharedCombatRocketPools";
import {
  createSharedCombatSceneResources,
  type SharedCombatGravityPulseVisual,
  type SharedCombatImpactBurstVisual,
} from "./sharedCombatSceneResources";
import type {
  SharedCombatCannonVisual,
  SharedCombatLockRingVisual,
  SharedCombatShieldVisual,
} from "./sharedCombatSupportVisuals";

type ViewportDisposable = { dispose: () => void };
type SharedCombatCannonSurfaceMaterial =
  | MeshBasicMaterial
  | MeshBasicNodeMaterial;

const registerDisposables = (
  disposables: ViewportDisposable[],
  ...items: Array<ViewportDisposable | ViewportDisposable[]>
) => {
  for (const item of items) {
    if (Array.isArray(item)) {
      disposables.push(...item);
      continue;
    }

    disposables.push(item);
  }
};

interface SharedCombatViewportVisualResources<
  TPlanetExplosionVisual extends SharedCombatPlanetExplosionVisual,
> {
  blackHoleGroup: ReturnType<
    typeof createSharedCombatSceneResources<TPlanetExplosionVisual>
  >["blackHoleGroup"];
  blackHoleRing: ReturnType<
    typeof createSharedCombatSceneResources<TPlanetExplosionVisual>
  >["blackHoleRing"];
  boostBurstVisual: SharedCombatBoostBurstVisual;
  boundaryDebrisVisual: ReturnType<
    typeof createSharedCombatSceneResources<TPlanetExplosionVisual>
  >["boundaryDebrisVisual"];
  cacheSpriteAssets: CacheSpriteAssets;
  cacheVisuals: Map<number, CacheVisual>;
  cannonVisual: SharedCombatCannonVisual;
  debrisVisual: ReturnType<
    typeof createSharedCombatSceneResources<TPlanetExplosionVisual>
  >["debrisVisual"];
  gravityPulseVisual: SharedCombatGravityPulseVisual;
  impactBurstVisuals: readonly SharedCombatImpactBurstVisual[];
  inactiveBlackHoleSwallowVisuals: BlackHoleSwallowVisual[];
  inactivePlanetExplosionVisuals: TPlanetExplosionVisual[];
  lockRingLockedUniform: SharedCombatLockRingVisual["lockedUniform"];
  lockRingMesh: SharedCombatLockRingVisual["mesh"];
  lockRingProgressUniform: SharedCombatLockRingVisual["progressUniform"];
  lockRingTimeUniform: SharedCombatLockRingVisual["timeUniform"];
  lockRingVisual: SharedCombatLockRingVisual;
  renderedCacheKeysById: Map<number, CacheIconKey>;
  rocketLaunchBurstPools: Record<RocketKind, SharedCombatLaunchBurstPoolVisual>;
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual>;
  shieldArcOpacityUniform: SharedCombatShieldVisual["arcOpacityUniform"];
  shieldCrestOpacityUniform: SharedCombatShieldVisual["crestOpacityUniform"];
  shieldGlowOpacityUniform: SharedCombatShieldVisual["glowOpacityUniform"];
  shieldGroup: SharedCombatShieldVisual["group"];
  shieldPanelOpacityUniform: SharedCombatShieldVisual["panelOpacityUniform"];
  shieldVisual: SharedCombatShieldVisual;
}

export const createSharedCombatViewportVisualResources = <
  TPlanetExplosionVisual extends SharedCombatPlanetExplosionVisual,
>({
  blackHoleDepthOffsets,
  blackHoleSwallowCapacity,
  boostBurstSampleLimit,
  boostColor,
  boundaryAsteroidMeshNamePrefix,
  cannon,
  cacheVisuals: providedCacheVisuals,
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
  document,
  getBlackHoleCoreRadius,
  getBlackHoleLensRadius,
  getBlackHoleRingRadius,
  gravityPulseColors,
  gravityPulseRenderOrders,
  impactBurstLimit,
  launchBurstInstanceLimits,
  lockRingAccentColor,
  planetExplosionLimit,
  renderedCacheKeysById: providedRenderedCacheKeysById,
  rocketKinds,
  rocketRenderProfiles,
  rocketTrailInstanceLimits,
  scene,
  shieldArcDeg,
  shieldColor,
  shieldGlowOuterScale,
  shieldInnerScale,
  shieldOuterScale,
  wakeCount,
}: {
  blackHoleDepthOffsets?: {
    core?: number;
    lens?: number;
    ring?: number;
  };
  blackHoleSwallowCapacity: number;
  boostBurstSampleLimit: number;
  boostColor: string;
  boundaryAsteroidMeshNamePrefix?: string;
  cannon: {
    accentMaterial: SharedCombatCannonSurfaceMaterial;
    flashMaterial: MeshBasicMaterial;
    metalMaterial: SharedCombatCannonSurfaceMaterial;
    setAccentColor: (value: string) => void;
  };
  cacheVisuals?: Map<number, CacheVisual>;
  createBlackHoleCoreMaterial: () => MeshBasicNodeMaterial;
  createBlackHoleLensMaterial: () => MeshBasicNodeMaterial;
  createBlackHoleRingMaterial: () => MeshBasicNodeMaterial;
  createBoostWakeMaterial: () => SharedCombatBoostWakeMaterialResult;
  createPlanetExplosionVisual: (
    scene: Scene,
    flashGeometry: CircleGeometry,
    ringGeometry: RingGeometry,
    fragmentGeometries: readonly BufferGeometry[],
  ) => TPlanetExplosionVisual;
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
  debrisSampleLimit: number;
  disposeCacheVisual: (visual: CacheVisual) => void;
  disposables: ViewportDisposable[];
  document: Document;
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
  launchBurstInstanceLimits: Record<RocketKind, number>;
  lockRingAccentColor: string;
  planetExplosionLimit: number;
  renderedCacheKeysById?: Map<number, CacheIconKey>;
  rocketKinds: readonly RocketKind[];
  rocketRenderProfiles: Record<RocketKind, SharedCombatRocketRenderProfile>;
  rocketTrailInstanceLimits: Record<RocketKind, number>;
  scene: Scene;
  shieldArcDeg: number;
  shieldColor: string;
  shieldGlowOuterScale: number;
  shieldInnerScale: number;
  shieldOuterScale: number;
  wakeCount: number;
}): SharedCombatViewportVisualResources<TPlanetExplosionVisual> => {
  const cacheSpriteAssets = createCacheSpriteAssets(document);
  const cacheVisuals = providedCacheVisuals ?? new Map<number, CacheVisual>();
  const renderedCacheKeysById =
    providedRenderedCacheKeysById ?? new Map<number, CacheIconKey>();
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
      rocketKinds,
      rocketRenderProfiles,
      rocketTrailInstanceLimits,
      scene,
    });
  registerDisposables(disposables, sharedRocketPoolDisposables);

  const {
    disposables: sharedLaunchBurstDisposables,
    launchBurstPools: rocketLaunchBurstPools,
  } = createSharedCombatLaunchBurstPools({
    createRocketLaunchBurstMaterial,
    launchBurstInstanceLimits,
    rocketKinds,
    rocketRenderProfiles,
    scene,
  });
  registerDisposables(disposables, sharedLaunchBurstDisposables);

  const inactiveBlackHoleSwallowVisuals =
    blackHoleSwallowCapacity <= 0
      ? []
      : createBlackHoleSwallowVisualPool({
          capacity: blackHoleSwallowCapacity,
          disposables,
          document,
          scene,
        });

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
  } = createSharedCombatSceneResources<TPlanetExplosionVisual>({
    blackHoleDepthOffsets,
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
  });
  registerDisposables(disposables, sharedSceneDisposables);

  const { disposables: cannonDisposables, visual: cannonVisual } =
    createSharedCombatCannonVisual({
      accentMaterial: cannon.accentMaterial,
      flashMaterial: cannon.flashMaterial,
      metalMaterial: cannon.metalMaterial,
      scene,
      setAccentColor: cannon.setAccentColor,
    });
  registerDisposables(
    disposables,
    cannon.metalMaterial,
    cannon.accentMaterial,
    cannon.flashMaterial,
    cannonDisposables,
  );

  const { disposables: boostBurstDisposables, visual: boostBurstVisual } =
    createSharedCombatBoostBurstVisual({
      boostColor,
      createBoostWakeMaterial,
      sampleLimit: boostBurstSampleLimit,
      scene,
      wakeCount,
    });
  registerDisposables(disposables, boostBurstDisposables);

  const lockRingVisual = {
    lockedUniform: lockRingLockedUniform,
    mesh: lockRingMesh,
    progressUniform: lockRingProgressUniform,
    timeUniform: lockRingTimeUniform,
  };
  const shieldVisual = {
    arcOpacityUniform: shieldArcOpacityUniform,
    crestOpacityUniform: shieldCrestOpacityUniform,
    glowOpacityUniform: shieldGlowOpacityUniform,
    group: shieldGroup,
    panelOpacityUniform: shieldPanelOpacityUniform,
  };

  return {
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
    lockRingVisual,
    renderedCacheKeysById,
    rocketLaunchBurstPools,
    rocketPools,
    shieldArcOpacityUniform,
    shieldCrestOpacityUniform,
    shieldGlowOpacityUniform,
    shieldGroup,
    shieldPanelOpacityUniform,
    shieldVisual,
  };
};
