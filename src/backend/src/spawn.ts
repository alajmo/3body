import {
  ARCHETYPES,
  ARENA_RADIUS,
  BOOST_SPEC,
  CACHE_RADIUS,
  CACHE_SPEC,
  CACHE_TANGENTIAL_SPEED_MAX,
  CACHE_TANGENTIAL_SPEED_MIN,
  createInitialAmmo,
  fromAngle,
  G,
  getShieldLoadCapacity,
  mulberry32,
  nextFloat,
  OUTER_RING_MAX,
  OUTER_RING_MIN,
  PLANET_HP,
  rollCacheContents,
  scale,
  SUN_MASS,
  type ArchetypeId,
  type Cache,
  type PlanetPrivateState,
  type PlanetPublic,
  type PlayerId,
  type Sun,
  type World,
} from "@3body/shared";
import type { EntityIdSequence } from "./ids";

interface SpawnPlayer {
  playerId: PlayerId;
  archetypeId: ArchetypeId;
}

const SUN_RADIUS = 96;
const SUN_RING_RADIUS = 360;
const SUN_TANGENTIAL_SPEED = 78;
const PLANET_RADIUS = 34;
const PLANET_RING_RADIUS = 900;

const createSun = (
  index: number,
  entityIds: EntityIdSequence,
  rng: () => number,
): Sun => {
  const angle = (index / 3) * Math.PI * 2;
  const tangent = fromAngle(angle + Math.PI / 2);
  const speed = SUN_TANGENTIAL_SPEED * (0.92 + rng() * 0.16);

  return {
    id: entityIds.nextEntityId(),
    kind: "sun",
    mass: SUN_MASS,
    radius: SUN_RADIUS,
    pos: {
      x: Math.cos(angle) * SUN_RING_RADIUS,
      y: Math.sin(angle) * SUN_RING_RADIUS,
    },
    vel: scale(tangent, speed),
  };
};

const createPlanet = (
  index: number,
  count: number,
  player: SpawnPlayer,
  entityIds: EntityIdSequence,
): { planet: PlanetPublic; privateState: PlanetPrivateState } => {
  const angle = (index / count) * Math.PI * 2;
  const tangent = fromAngle(angle + Math.PI / 2);
  const orbitalSpeed = Math.sqrt((G * (SUN_MASS * 3)) / PLANET_RING_RADIUS);
  const planetId = entityIds.nextEntityId();
  const boostCharges = Math.max(
    1,
    BOOST_SPEC.charges + ARCHETYPES[player.archetypeId].boostChargeBonus,
  );

  return {
    planet: {
      id: planetId,
      kind: "planet",
      playerId: player.playerId,
      archetype: player.archetypeId,
      hp: PLANET_HP,
      radius: PLANET_RADIUS,
      pos: {
        x: Math.cos(angle) * PLANET_RING_RADIUS,
        y: Math.sin(angle) * PLANET_RING_RADIUS,
      },
      vel: scale(tangent, orbitalSpeed),
      shieldAimDir: { x: 1, y: 0 },
      shieldActive: false,
      shieldLoad: getShieldLoadCapacity(player.archetypeId),
      shieldMaxLoad: getShieldLoadCapacity(player.archetypeId),
      hideTrailUntilTick: 0,
      debuffs: {},
    },
    privateState: {
      planetId,
      ammo: createInitialAmmo(),
      cooldowns: {
        lightReloadUntilTick: 0,
        heavyReloadUntilTick: 0,
        seekerReloadUntilTick: 0,
        foresightActiveUntilTick: 0,
        foresightCooldownUntilTick: 0,
        foresightDurationTicks: 0,
        droneCooldownUntilTick: 0,
      },
      boostCharges,
      nextShieldExt: false,
      nextForesightExt: false,
    },
  };
};

const createCache = (entityIds: EntityIdSequence, rng: () => number): Cache => {
  const angle = rng() * Math.PI * 2 + (rng() - 0.5) * 0.24;
  const radius = nextFloat(rng, OUTER_RING_MIN, OUTER_RING_MAX);
  const tangent = fromAngle(angle + (Math.PI / 2) * (rng() < 0.5 ? -1 : 1));
  const speed = nextFloat(
    rng,
    CACHE_TANGENTIAL_SPEED_MIN,
    CACHE_TANGENTIAL_SPEED_MAX,
  );

  return {
    id: entityIds.nextEntityId(),
    kind: "cache",
    contents: rollCacheContents(rng),
    radius: CACHE_RADIUS,
    pos: {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    },
    vel: scale(tangent, speed),
  };
};

export const createInitialMatchState = (
  seed: number,
  players: SpawnPlayer[],
  entityIds: EntityIdSequence,
): {
  world: World;
  privateStates: Map<PlayerId, PlanetPrivateState>;
} => {
  const rng = mulberry32(seed);
  const suns = [0, 1, 2].map((index) => createSun(index, entityIds, rng));
  const privateStates = new Map<PlayerId, PlanetPrivateState>();
  const planets = players.map((player, index) => {
    const { planet, privateState } = createPlanet(
      index,
      players.length,
      player,
      entityIds,
    );
    privateStates.set(player.playerId, privateState);
    return planet;
  });
  const caches = Array.from({ length: CACHE_SPEC.count }, () =>
    createCache(entityIds, rng),
  );

  return {
    world: {
      suns,
      planets,
      rockets: [],
      drones: [],
      caches,
      debris: [],
      arenaRadius: ARENA_RADIUS,
    },
    privateStates,
  };
};
