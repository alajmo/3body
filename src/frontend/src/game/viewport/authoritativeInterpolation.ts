import type {
  BlackHole,
  Cache,
  Debris,
  NeutronStar,
  PlanetPublic,
  Rocket,
  Sun,
  Vec2,
  World,
} from "@3body/shared";
import { ARENA_RADIUS, cloneCacheContents, lerp } from "@3body/shared";

interface AuthoritativeInterpolationCache {
  previousCachesById: Map<number, Cache>;
  previousDebrisById: Map<number, Debris>;
  previousNeutronStarsById: Map<number, NeutronStar>;
  previousPlanetsById: Map<number, PlanetPublic>;
  previousRocketsById: Map<number, Rocket>;
  previousSunsById: Map<number, Sun>;
  world: World;
}

const cloneVec2 = (value: Vec2): Vec2 => ({ x: value.x, y: value.y });

const cloneSun = (sun: Sun): Sun => ({
  ...sun,
  pos: cloneVec2(sun.pos),
  vel: cloneVec2(sun.vel),
});

const cloneNeutronStar = (neutronStar: NeutronStar): NeutronStar => ({
  ...neutronStar,
  pos: cloneVec2(neutronStar.pos),
  vel: cloneVec2(neutronStar.vel),
});

const clonePlanet = (planet: PlanetPublic): PlanetPublic => ({
  ...planet,
  pos: cloneVec2(planet.pos),
  vel: cloneVec2(planet.vel),
  shieldAimDir: cloneVec2(planet.shieldAimDir),
  debuffs: { ...planet.debuffs },
});

const cloneRocket = (rocket: Rocket): Rocket => ({
  ...rocket,
  pos: cloneVec2(rocket.pos),
  vel: cloneVec2(rocket.vel),
});

const cloneCache = (cache: Cache): Cache => ({
  ...cache,
  pos: cloneVec2(cache.pos),
  vel: cloneVec2(cache.vel),
  contents: cloneCacheContents(cache.contents),
});

const cloneDebris = (debris: Debris): Debris => ({
  ...debris,
  pos: cloneVec2(debris.pos),
  vel: cloneVec2(debris.vel),
});

const cloneBlackHole = (blackHole: BlackHole): BlackHole => ({
  ...blackHole,
  pos: cloneVec2(blackHole.pos),
  vel: cloneVec2(blackHole.vel),
});

const fillEntityMap = <T extends { id: number }>(
  targetMap: Map<number, T>,
  entities: readonly T[],
) => {
  targetMap.clear();

  for (const entity of entities) {
    targetMap.set(entity.id, entity);
  }
};

const syncVec2 = (target: Vec2, current: Vec2) => {
  target.x = current.x;
  target.y = current.y;
};

const syncLerpedVec2 = (
  target: Vec2,
  previous: Vec2 | undefined,
  current: Vec2,
  alpha: number,
) => {
  if (previous === undefined) {
    syncVec2(target, current);
    return;
  }

  target.x = lerp(previous.x, current.x, alpha);
  target.y = lerp(previous.y, current.y, alpha);
};

const syncPlanetDebuffs = (
  target: PlanetPublic["debuffs"],
  current: PlanetPublic["debuffs"],
) => {
  if (current.dragUntilTick === undefined) {
    delete target.dragUntilTick;
    return;
  }

  target.dragUntilTick = current.dragUntilTick;
};

const syncCacheContents = (
  target: Cache["contents"],
  current: Cache["contents"],
): Cache["contents"] => {
  if (current.kind === "wildcard") {
    if (target.kind !== "wildcard") {
      return cloneCacheContents(current);
    }

    target.wildcard.kind = current.wildcard.kind;
    return target;
  }

  if (target.kind !== current.kind) {
    return cloneCacheContents(current);
  }

  return target;
};

const syncSunInto = (
  target: Sun,
  previous: Sun | undefined,
  current: Sun,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.mass = current.mass;
  target.radius = current.radius;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
};

const syncNeutronStarInto = (
  target: NeutronStar,
  previous: NeutronStar | undefined,
  current: NeutronStar,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.mass = current.mass;
  target.radius = current.radius;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
};

const syncPlanetInto = (
  target: PlanetPublic,
  previous: PlanetPublic | undefined,
  current: PlanetPublic,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.playerId = current.playerId;
  target.archetype = current.archetype;
  target.hp = current.hp;
  target.radius = current.radius;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
  syncVec2(target.shieldAimDir, current.shieldAimDir);
  target.shieldActive = current.shieldActive;
  target.shieldLoad = current.shieldLoad;
  target.shieldMaxLoad = current.shieldMaxLoad;
  syncPlanetDebuffs(target.debuffs, current.debuffs);
};

const syncRocketInto = (
  target: Rocket,
  previous: Rocket | undefined,
  current: Rocket,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.rocketKind = current.rocketKind;
  target.ownerId = current.ownerId;
  target.targetId = current.targetId;
  target.ttlUntilTick = current.ttlUntilTick;
  target.radius = current.radius;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
};

const syncCacheInto = (
  target: Cache,
  previous: Cache | undefined,
  current: Cache,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.contents = syncCacheContents(target.contents, current.contents);
  target.radius = current.radius;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
};

const syncDebrisInto = (
  target: Debris,
  previous: Debris | undefined,
  current: Debris,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.ownerPlayerId = current.ownerPlayerId;
  target.ttlUntilTick = current.ttlUntilTick;
  target.radius = current.radius;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
};

const syncBlackHoleInto = (
  target: BlackHole,
  previous: BlackHole | undefined,
  current: BlackHole,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.mass = current.mass;
  target.killRadius = current.killRadius;
  target.radius = current.radius;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
};

const syncInterpolatedEntityArray = <T extends { id: number }>(
  targetEntities: T[],
  currentEntities: readonly T[],
  getPrevious: (id: number) => T | undefined,
  cloneEntity: (entity: T) => T,
  syncEntity: (
    target: T,
    previous: T | undefined,
    current: T,
    alpha: number,
  ) => void,
  alpha: number,
) => {
  for (let index = 0; index < currentEntities.length; index += 1) {
    const currentEntity = currentEntities[index]!;
    let targetEntity = targetEntities[index];

    if (targetEntity === undefined || targetEntity.id !== currentEntity.id) {
      targetEntity = cloneEntity(currentEntity);
      targetEntities[index] = targetEntity;
    }

    syncEntity(
      targetEntity,
      getPrevious(currentEntity.id),
      currentEntity,
      alpha,
    );
  }

  targetEntities.length = currentEntities.length;
};

export const createAuthoritativeInterpolationCache =
  (): AuthoritativeInterpolationCache => ({
    previousCachesById: new Map<number, Cache>(),
    previousDebrisById: new Map<number, Debris>(),
    previousNeutronStarsById: new Map<number, NeutronStar>(),
    previousPlanetsById: new Map<number, PlanetPublic>(),
    previousRocketsById: new Map<number, Rocket>(),
    previousSunsById: new Map<number, Sun>(),
    world: {
      arenaRadius: ARENA_RADIUS,
      caches: [],
      debris: [],
      neutronStars: [],
      planets: [],
      rockets: [],
      suns: [],
    },
  });

export const syncAuthoritativeInterpolatedWorld = (
  cache: AuthoritativeInterpolationCache,
  previousWorld: World,
  currentWorld: World,
  alpha: number,
): World => {
  fillEntityMap(cache.previousSunsById, previousWorld.suns);
  fillEntityMap(cache.previousNeutronStarsById, previousWorld.neutronStars);
  fillEntityMap(cache.previousPlanetsById, previousWorld.planets);
  fillEntityMap(cache.previousRocketsById, previousWorld.rockets);
  fillEntityMap(cache.previousCachesById, previousWorld.caches);
  fillEntityMap(cache.previousDebrisById, previousWorld.debris);

  const targetWorld = cache.world;
  targetWorld.arenaRadius = currentWorld.arenaRadius;

  syncInterpolatedEntityArray(
    targetWorld.suns,
    currentWorld.suns,
    (id) => cache.previousSunsById.get(id),
    cloneSun,
    syncSunInto,
    alpha,
  );
  syncInterpolatedEntityArray(
    targetWorld.neutronStars,
    currentWorld.neutronStars,
    (id) => cache.previousNeutronStarsById.get(id),
    cloneNeutronStar,
    syncNeutronStarInto,
    alpha,
  );
  syncInterpolatedEntityArray(
    targetWorld.planets,
    currentWorld.planets,
    (id) => cache.previousPlanetsById.get(id),
    clonePlanet,
    syncPlanetInto,
    alpha,
  );
  syncInterpolatedEntityArray(
    targetWorld.rockets,
    currentWorld.rockets,
    (id) => cache.previousRocketsById.get(id),
    cloneRocket,
    syncRocketInto,
    alpha,
  );
  syncInterpolatedEntityArray(
    targetWorld.caches,
    currentWorld.caches,
    (id) => cache.previousCachesById.get(id),
    cloneCache,
    syncCacheInto,
    alpha,
  );
  syncInterpolatedEntityArray(
    targetWorld.debris,
    currentWorld.debris,
    (id) => cache.previousDebrisById.get(id),
    cloneDebris,
    syncDebrisInto,
    alpha,
  );

  if (currentWorld.blackHole === undefined) {
    targetWorld.blackHole = undefined;
  } else {
    let targetBlackHole = targetWorld.blackHole;
    if (targetBlackHole === undefined) {
      targetBlackHole = cloneBlackHole(currentWorld.blackHole);
      targetWorld.blackHole = targetBlackHole;
    }

    syncBlackHoleInto(
      targetBlackHole,
      previousWorld.blackHole,
      currentWorld.blackHole,
      alpha,
    );
  }

  return targetWorld;
};
