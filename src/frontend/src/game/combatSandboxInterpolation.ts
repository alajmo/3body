import type { NeutronStar, Vec2 } from "@3body/shared";
import { cloneCacheContents, lerp } from "@3body/shared";
import type {
  CombatSandboxCache,
  CombatSandboxDebris,
  CombatSandboxPlanet,
  CombatSandboxRocket,
  CombatSandboxState,
  CombatSandboxSun,
} from "./combatSandbox";

interface CombatSandboxInterpolationCache {
  previousCacheMap: Map<number, CombatSandboxCache>;
  previousDebrisMap: Map<number, CombatSandboxDebris>;
  previousNeutronStarMap: Map<number, NeutronStar>;
  previousRocketMap: Map<number, CombatSandboxRocket>;
  previousSunMap: Map<number, CombatSandboxSun>;
}

const cloneVec2 = (value: Vec2): Vec2 => ({ x: value.x, y: value.y });

const cloneSun = (sun: CombatSandboxSun): CombatSandboxSun => ({
  ...sun,
  pos: cloneVec2(sun.pos),
  vel: cloneVec2(sun.vel),
});

const cloneNeutronStar = (neutronStar: NeutronStar): NeutronStar => ({
  ...neutronStar,
  pos: cloneVec2(neutronStar.pos),
  vel: cloneVec2(neutronStar.vel),
});

const clonePlanet = (planet: CombatSandboxPlanet): CombatSandboxPlanet => ({
  ...planet,
  pos: cloneVec2(planet.pos),
  vel: cloneVec2(planet.vel),
  shieldAimDir: cloneVec2(planet.shieldAimDir),
  debuffs: { ...planet.debuffs },
});

const cloneRocket = (rocket: CombatSandboxRocket): CombatSandboxRocket => ({
  ...rocket,
  launchPlanetPos: cloneVec2(rocket.launchPlanetPos),
  pos: cloneVec2(rocket.pos),
  vel: cloneVec2(rocket.vel),
});

const cloneCache = (cache: CombatSandboxCache): CombatSandboxCache => ({
  ...cache,
  pos: cloneVec2(cache.pos),
  vel: cloneVec2(cache.vel),
  contents: cloneCacheContents(cache.contents),
});

const cloneDebris = (debris: CombatSandboxDebris): CombatSandboxDebris => ({
  ...debris,
  pos: cloneVec2(debris.pos),
  vel: cloneVec2(debris.vel),
});

export const createSandboxInterpolationCache =
  (): CombatSandboxInterpolationCache => ({
    previousRocketMap: new Map<number, CombatSandboxRocket>(),
    previousCacheMap: new Map<number, CombatSandboxCache>(),
    previousDebrisMap: new Map<number, CombatSandboxDebris>(),
    previousNeutronStarMap: new Map<number, NeutronStar>(),
    previousSunMap: new Map<number, CombatSandboxSun>(),
  });

export const createInterpolatedSandboxState = (
  state: CombatSandboxState,
): CombatSandboxState => ({
  ...state,
  neutronStars: state.neutronStars.slice(),
  suns: state.suns.slice(),
  planets: state.planets.slice(),
  rockets: state.rockets.slice(),
  caches: state.caches.slice(),
  debris: state.debris.slice(),
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

const syncLerpedVec2 = (
  target: Vec2,
  previous: Vec2 | undefined,
  current: Vec2,
  alpha: number,
) => {
  if (previous === undefined) {
    target.x = current.x;
    target.y = current.y;
    return;
  }

  target.x = lerp(previous.x, current.x, alpha);
  target.y = lerp(previous.y, current.y, alpha);
};

const syncPlanetDebuffs = (
  target: CombatSandboxPlanet["debuffs"],
  current: CombatSandboxPlanet["debuffs"],
) => {
  if (current.dragUntilTick === undefined) {
    delete target.dragUntilTick;
    return;
  }

  target.dragUntilTick = current.dragUntilTick;
};

const syncSunInto = (
  target: CombatSandboxSun,
  previous: CombatSandboxSun | undefined,
  current: CombatSandboxSun,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.mass = current.mass;
  target.radius = current.radius;
  target.swallowedAtSec = current.swallowedAtSec;
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
  target: CombatSandboxPlanet,
  previous: CombatSandboxPlanet,
  current: CombatSandboxPlanet,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.displayName = current.displayName;
  target.label = current.label;
  target.color = current.color;
  target.trailColor = current.trailColor;
  target.risk = current.risk;
  target.archetype = current.archetype;
  target.playerId = current.playerId;
  target.alive = current.alive;
  target.hp = current.hp;
  target.radius = current.radius;
  target.deathReason = current.deathReason;
  target.shieldAimDir.x = current.shieldAimDir.x;
  target.shieldAimDir.y = current.shieldAimDir.y;
  target.shieldActive = current.shieldActive;
  target.shieldLoad = current.shieldLoad;
  target.shieldMaxLoad = current.shieldMaxLoad;
  syncPlanetDebuffs(target.debuffs, current.debuffs);
  syncLerpedVec2(
    target.pos,
    previous.alive && current.alive ? previous.pos : undefined,
    current.pos,
    alpha,
  );
  syncLerpedVec2(
    target.vel,
    previous.alive && current.alive ? previous.vel : undefined,
    current.vel,
    alpha,
  );
};

const syncRocketInto = (
  target: CombatSandboxRocket,
  previous: CombatSandboxRocket | undefined,
  current: CombatSandboxRocket,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.ownerId = current.ownerId;
  target.rocketKind = current.rocketKind;
  target.targetId = current.targetId;
  target.ttlUntilTick = current.ttlUntilTick;
  target.radius = current.radius;
  target.damage = current.damage;
  target.color = current.color;
  target.trailColor = current.trailColor;
  target.dragOnHit = current.dragOnHit;
  target.launchPlanetArchetype = current.launchPlanetArchetype;
  target.turnRateMultiplier = current.turnRateMultiplier;
  target.launchPlanetPos.x = current.launchPlanetPos.x;
  target.launchPlanetPos.y = current.launchPlanetPos.y;
  target.launchPlanetRadius = current.launchPlanetRadius;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
};

const syncCacheInto = (
  target: CombatSandboxCache,
  previous: CombatSandboxCache | undefined,
  current: CombatSandboxCache,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.contents = current.contents;
  target.radius = current.radius;
  syncLerpedVec2(target.pos, previous?.pos, current.pos, alpha);
  syncLerpedVec2(target.vel, previous?.vel, current.vel, alpha);
};

const syncDebrisInto = (
  target: CombatSandboxDebris,
  previous: CombatSandboxDebris | undefined,
  current: CombatSandboxDebris,
  alpha: number,
) => {
  target.id = current.id;
  target.kind = current.kind;
  target.ownerPlayerId = current.ownerPlayerId;
  target.radius = current.radius;
  target.ttlUntilTick = current.ttlUntilTick;
  target.color = current.color;
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
    const previousEntity = getPrevious(currentEntity.id);
    let targetEntity = targetEntities[index];

    if (
      targetEntity === undefined ||
      targetEntity.id !== currentEntity.id ||
      targetEntity === currentEntity ||
      targetEntity === previousEntity
    ) {
      targetEntity = cloneEntity(currentEntity);
      targetEntities[index] = targetEntity;
    }

    syncEntity(targetEntity, previousEntity, currentEntity, alpha);
  }

  targetEntities.length = currentEntities.length;
};

export const syncInterpolatedSandboxState = (
  targetState: CombatSandboxState,
  cache: CombatSandboxInterpolationCache,
  previousState: CombatSandboxState,
  currentState: CombatSandboxState,
  alpha: number,
): CombatSandboxState => {
  fillEntityMap(cache.previousRocketMap, previousState.rockets);
  fillEntityMap(cache.previousCacheMap, previousState.caches);
  fillEntityMap(cache.previousDebrisMap, previousState.debris);
  fillEntityMap(cache.previousNeutronStarMap, previousState.neutronStars);
  fillEntityMap(cache.previousSunMap, previousState.suns);

  targetState.tick = currentState.tick;
  targetState.elapsedSec = lerp(
    previousState.elapsedSec,
    currentState.elapsedSec,
    alpha,
  );
  targetState.preset = currentState.preset;
  targetState.starMotion = currentState.starMotion;
  targetState.cacheRespawnAtTicks = currentState.cacheRespawnAtTicks;
  targetState.impactBursts = currentState.impactBursts;
  targetState.launchBursts = currentState.launchBursts;
  targetState.blackHole = currentState.blackHole;
  targetState.player = currentState.player;
  targetState.playerBot = currentState.playerBot;
  targetState.bots = currentState.bots;
  targetState.nextEntityId = currentState.nextEntityId;
  targetState.rng = currentState.rng;

  syncInterpolatedEntityArray(
    targetState.suns,
    currentState.suns,
    (id) => cache.previousSunMap.get(id),
    cloneSun,
    syncSunInto,
    alpha,
  );

  syncInterpolatedEntityArray(
    targetState.neutronStars,
    currentState.neutronStars,
    (id) => cache.previousNeutronStarMap.get(id),
    cloneNeutronStar,
    syncNeutronStarInto,
    alpha,
  );

  for (let index = 0; index < currentState.planets.length; index += 1) {
    const currentPlanet = currentState.planets[index]!;
    const previousPlanet = previousState.planets[index]!;
    let targetPlanet = targetState.planets[index];

    if (
      targetPlanet === undefined ||
      targetPlanet.id !== currentPlanet.id ||
      targetPlanet === currentPlanet ||
      targetPlanet === previousPlanet
    ) {
      targetPlanet = clonePlanet(currentPlanet);
      targetState.planets[index] = targetPlanet;
    }

    syncPlanetInto(targetPlanet, previousPlanet, currentPlanet, alpha);
  }
  targetState.planets.length = currentState.planets.length;

  syncInterpolatedEntityArray(
    targetState.rockets,
    currentState.rockets,
    (id) => cache.previousRocketMap.get(id),
    cloneRocket,
    syncRocketInto,
    alpha,
  );
  syncInterpolatedEntityArray(
    targetState.caches,
    currentState.caches,
    (id) => cache.previousCacheMap.get(id),
    cloneCache,
    syncCacheInto,
    alpha,
  );
  syncInterpolatedEntityArray(
    targetState.debris,
    currentState.debris,
    (id) => cache.previousDebrisMap.get(id),
    cloneDebris,
    syncDebrisInto,
    alpha,
  );

  return targetState;
};

export const interpolateSandboxState = (
  previousState: CombatSandboxState,
  currentState: CombatSandboxState,
  alpha: number,
): CombatSandboxState =>
  syncInterpolatedSandboxState(
    createInterpolatedSandboxState(currentState),
    createSandboxInterpolationCache(),
    previousState,
    currentState,
    alpha,
  );
