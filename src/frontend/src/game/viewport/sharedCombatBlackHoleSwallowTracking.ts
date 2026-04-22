import type { Vec2 } from "@3body/shared";
import type {
  SharedCombatBlackHoleBody,
  SharedCombatTrackedCacheBody,
} from "./cacheVisuals";

export interface SharedCombatTrackedRocketBody {
  pos: Vec2;
  radius: number;
}

export const isWithinSharedCombatBlackHoleSwallowBand = ({
  blackHole,
  margin,
  pos,
}: {
  blackHole: SharedCombatBlackHoleBody;
  margin: number;
  pos: Vec2;
}): boolean =>
  Math.hypot(pos.x - blackHole.pos.x, pos.y - blackHole.pos.y) <=
  blackHole.killRadius + margin;

export const queueSharedCombatRemovedCacheSwallowEffects = ({
  activeCacheIds,
  blackHole,
  previousCachesById,
  queueEffect,
}: {
  activeCacheIds: ReadonlySet<number>;
  blackHole: SharedCombatBlackHoleBody | null;
  previousCachesById: ReadonlyMap<number, SharedCombatTrackedCacheBody>;
  queueEffect: (cache: SharedCombatTrackedCacheBody) => void;
}) => {
  if (blackHole === null) {
    return;
  }

  for (const [cacheId, previousCache] of previousCachesById) {
    if (
      activeCacheIds.has(cacheId) ||
      !isWithinSharedCombatBlackHoleSwallowBand({
        blackHole,
        margin: Math.max(84, previousCache.radius * 5),
        pos: previousCache.pos,
      })
    ) {
      continue;
    }

    queueEffect(previousCache);
  }
};

export const syncSharedCombatTrackedCaches = <
  CacheBody extends {
    id: number;
    pos: Vec2;
    radius: number;
  },
>({
  caches,
  previousCachesById,
}: {
  caches: readonly CacheBody[];
  previousCachesById: Map<number, SharedCombatTrackedCacheBody>;
}) => {
  previousCachesById.clear();
  for (const cache of caches) {
    previousCachesById.set(cache.id, {
      pos: { ...cache.pos },
      radius: cache.radius,
    });
  }
};

export const queueSharedCombatRemovedRocketSwallowEffects = <
  RocketBody extends SharedCombatTrackedRocketBody,
>({
  activeRocketIds,
  blackHole,
  getMargin,
  previousRocketsById,
  queueEffect,
}: {
  activeRocketIds: ReadonlySet<number>;
  blackHole: SharedCombatBlackHoleBody | null;
  getMargin: (rocket: RocketBody) => number;
  previousRocketsById: ReadonlyMap<number, RocketBody>;
  queueEffect: (rocket: RocketBody) => void;
}) => {
  if (blackHole === null) {
    return;
  }

  for (const [rocketId, previousRocket] of previousRocketsById) {
    if (
      activeRocketIds.has(rocketId) ||
      !isWithinSharedCombatBlackHoleSwallowBand({
        blackHole,
        margin: getMargin(previousRocket),
        pos: previousRocket.pos,
      })
    ) {
      continue;
    }

    queueEffect(previousRocket);
  }
};

export const syncSharedCombatTrackedRockets = <
  RocketBody extends {
    id: number;
    pos: Vec2;
    radius: number;
  },
>({
  previousRocketsById,
  rockets,
}: {
  previousRocketsById: Map<number, SharedCombatTrackedRocketBody>;
  rockets: readonly RocketBody[];
}) => {
  previousRocketsById.clear();
  for (const rocket of rockets) {
    previousRocketsById.set(rocket.id, {
      pos: { ...rocket.pos },
      radius: rocket.radius,
    });
  }
};
