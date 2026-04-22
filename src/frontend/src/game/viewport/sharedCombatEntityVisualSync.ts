import type { RocketKind } from "@3body/shared";
import type { getCannonWorldLayout } from "../rocketVisibility";
import type { SharedCombatTrackedCacheBody } from "./cacheVisuals";
import {
  type CacheIconKey,
  type CacheSpriteMaterialMap,
  type CacheVisual,
  type SharedCombatCacheBody,
  syncSharedCombatCacheVisuals,
} from "./cacheVisuals";
import {
  queueSharedCombatRemovedCacheSwallowEffects,
  queueSharedCombatRemovedRocketSwallowEffects,
  type SharedCombatTrackedRocketBody,
  syncSharedCombatTrackedCaches,
  syncSharedCombatTrackedRockets,
} from "./sharedCombatBlackHoleSwallowTracking";
import {
  pruneSharedCombatLaunchBurstStates,
  type SharedCombatLaunchBurstPoolVisual,
  syncSharedCombatLaunchBurstPools,
} from "./sharedCombatLaunchBurstPools";
import type { SharedCombatLaunchBurstState } from "./sharedCombatLaunchBurstVisuals";
import {
  type SharedCombatRocketBody,
  type SharedCombatRocketPoolVisual,
  type SharedCombatRocketTrailState,
  syncSharedCombatRocketPools,
} from "./sharedCombatRocketPools";

export interface SharedCombatCachePresentationArgs<
  CacheBody extends SharedCombatCacheBody,
> {
  activeCacheIds: Set<number>;
  badgeBaseSize: number;
  badgeMaterials: CacheSpriteMaterialMap;
  badgeScale: number;
  blackHole: {
    killRadius: number;
    pos: { x: number; y: number };
  } | null;
  cacheVisuals: Map<number, CacheVisual>;
  caches: readonly CacheBody[];
  createCacheVisual: (
    cache: CacheBody,
    badgeMaterials: CacheSpriteMaterialMap,
  ) => CacheVisual;
  disposeCacheVisual?: ((visual: CacheVisual) => void) | undefined;
  getCacheIconKey: (contents: CacheBody["contents"]) => CacheIconKey;
  nowSec: number;
  previousCachesById: Map<number, SharedCombatTrackedCacheBody>;
  queueSwallowEffect: (cache: SharedCombatTrackedCacheBody) => void;
  renderedCacheKeysById?: Map<number, CacheIconKey> | undefined;
  scene: {
    add: (object: CacheVisual["group"]) => void;
    remove: (object: CacheVisual["group"]) => void;
  };
  updateCacheVisualBadge: (
    visual: CacheVisual,
    badgeMaterials: CacheSpriteMaterialMap,
    key: CacheIconKey,
  ) => void;
}

export const syncSharedCombatCachePresentation = <
  CacheBody extends SharedCombatCacheBody,
>({
  activeCacheIds,
  badgeBaseSize,
  badgeMaterials,
  badgeScale,
  blackHole,
  cacheVisuals,
  caches,
  createCacheVisual,
  disposeCacheVisual,
  getCacheIconKey,
  nowSec,
  previousCachesById,
  queueSwallowEffect,
  renderedCacheKeysById,
  scene,
  updateCacheVisualBadge,
}: SharedCombatCachePresentationArgs<CacheBody>) => {
  syncSharedCombatCacheVisuals({
    activeCacheIds,
    badgeBaseSize,
    badgeMaterials,
    badgeScale,
    cacheVisuals,
    caches,
    createCacheVisual,
    disposeCacheVisual,
    getCacheIconKey,
    nowSec,
    renderedCacheKeysById,
    scene,
    updateCacheVisualBadge,
  });

  queueSharedCombatRemovedCacheSwallowEffects({
    activeCacheIds,
    blackHole,
    previousCachesById,
    queueEffect: queueSwallowEffect,
  });

  syncSharedCombatTrackedCaches({
    caches,
    previousCachesById,
  });
};

export interface SharedCombatRocketPresentationArgs<
  Rocket extends SharedCombatRocketBody & { radius: number },
> {
  blackHole: {
    killRadius: number;
    pos: { x: number; y: number };
  } | null;
  getSwallowMargin: (rocket: SharedCombatTrackedRocketBody) => number;
  maxRocketTrailSamples: number;
  nowSec: number;
  previousRocketsById: Map<number, SharedCombatTrackedRocketBody>;
  queueSwallowEffect: (rocket: SharedCombatTrackedRocketBody) => void;
  rocketKinds: readonly RocketKind[];
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual>;
  rocketTrailBudget: number;
  rocketTrailStates: Map<number, SharedCombatRocketTrailState>;
  rockets: readonly Rocket[];
  rocketsByKind: Record<RocketKind, Rocket[]>;
}

export const syncSharedCombatRocketPresentation = <
  Rocket extends SharedCombatRocketBody & { radius: number },
>({
  blackHole,
  getSwallowMargin,
  maxRocketTrailSamples,
  nowSec,
  previousRocketsById,
  queueSwallowEffect,
  rocketKinds,
  rocketPools,
  rocketTrailBudget,
  rocketTrailStates,
  rockets,
  rocketsByKind,
}: SharedCombatRocketPresentationArgs<Rocket>) => {
  const activeRocketIds = new Set<number>();
  for (const rocketKind of rocketKinds) {
    rocketsByKind[rocketKind].length = 0;
  }

  for (const rocket of rockets) {
    activeRocketIds.add(rocket.id);
    rocketsByKind[rocket.rocketKind].push(rocket);
  }

  syncSharedCombatRocketPools({
    maxRocketTrailSamples,
    nowSec,
    rocketKinds,
    rocketPools,
    rocketTrailBudget,
    rocketTrailStates,
    rocketsByKind,
  });

  queueSharedCombatRemovedRocketSwallowEffects({
    activeRocketIds,
    blackHole,
    getMargin: getSwallowMargin,
    previousRocketsById,
    queueEffect: queueSwallowEffect,
  });

  syncSharedCombatTrackedRockets({
    previousRocketsById,
    rockets,
  });
};

export interface SharedCombatLaunchBurstPresentationArgs {
  burstsByKind: Record<RocketKind, SharedCombatLaunchBurstState[]>;
  cannonLayout: ReturnType<typeof getCannonWorldLayout>;
  currentPlayerId: string | null;
  launchBurstBudget: number;
  launchBurstPools: Record<RocketKind, SharedCombatLaunchBurstPoolVisual>;
  nowSec: number;
  pruneBeforeSync?: boolean;
  rocketKinds: readonly RocketKind[];
  rocketPools: Record<RocketKind, SharedCombatRocketPoolVisual>;
  worldUnitsPerPixel: number;
}

export const syncSharedCombatLaunchBurstPresentation = ({
  burstsByKind,
  cannonLayout,
  currentPlayerId,
  launchBurstBudget,
  launchBurstPools,
  nowSec,
  pruneBeforeSync = false,
  rocketKinds,
  rocketPools,
  worldUnitsPerPixel,
}: SharedCombatLaunchBurstPresentationArgs) => {
  if (pruneBeforeSync) {
    pruneSharedCombatLaunchBurstStates({
      burstsByKind,
      cannonLayout,
      nowSec,
      rocketKinds,
      rocketPools,
      worldUnitsPerPixel,
    });
  }

  syncSharedCombatLaunchBurstPools({
    burstsByKind,
    cannonLayout,
    currentPlayerId,
    launchBurstBudget,
    launchBurstPools,
    nowSec,
    rocketKinds,
    rocketPools,
    worldUnitsPerPixel,
  });
};
