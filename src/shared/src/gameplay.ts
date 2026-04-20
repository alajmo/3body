import { ARCHETYPES } from "./archetypes";
import {
  ARENA_ASTEROID_FIELD_SPEC,
  CACHE_SPEC,
  PLANET_HP,
  ROCKET_SPECS,
  SHIELD_EXT_MULTIPLIER,
  SHIELD_SPEC,
  WILDCARD_KINDS,
} from "./constants";
import type {
  ArchetypeId,
  AsteroidTier,
  CacheContents,
  PlanetPrivateAmmo,
  WildcardKind,
} from "./entities";
import type { ArenaAsteroidFieldTuning } from "./tuning";
import type { Vec2 } from "./vec2";

const SHIELD_LOAD_REFERENCE_DURATION_SEC = 4;
const TAU = Math.PI * 2;
const ARENA_ASTEROID_SPAWN_RATE_PER_SEC = {
  large: 0.12,
  micro: 2.8,
  small: 0.55,
} as const;
const ARENA_ASTEROID_SPEED = {
  large: 132,
  micro: 248,
  small: 184,
} as const;
const ARENA_ASTEROID_RADIUS = {
  large: 16,
  micro: 5,
  small: 10,
} as const;
const ARENA_ASTEROID_TTL_SEC = {
  large: 9,
  micro: 4.5,
  small: 6.25,
} as const;
const ARENA_ASTEROID_MAX_ANGLE_DEVIATION_RAD = {
  large: 0.18,
  micro: 0.42,
  small: 0.28,
} as const;
const ARENA_ASTEROID_EXPLOSION_PIECES = {
  large: 11,
  micro: 4,
  small: 7,
} as const;
const ARENA_ASTEROID_EXPLOSION_BASE_SPEED = {
  large: 126,
  micro: 158,
  small: 142,
} as const;
const ARENA_ASTEROID_EXPLOSION_SPEED_VARIANCE = {
  large: 88,
  micro: 74,
  small: 82,
} as const;

export interface BoundaryAsteroidSpawnBudgetOptions {
  dtSec: number;
  rng: () => number;
  tier: AsteroidTier;
  tuning?: ArenaAsteroidFieldTuning;
}

export interface BoundaryAsteroidSpawnOptions {
  arenaRadius: number;
  rng: () => number;
  tier: AsteroidTier;
  tuning?: ArenaAsteroidFieldTuning;
}

export interface BoundaryAsteroidSpawn {
  asteroidTier: AsteroidTier;
  pos: Vec2;
  radius: number;
  ttlSec: number;
  vel: Vec2;
}

export const createInitialAmmo = (): PlanetPrivateAmmo => ({
  light: ROCKET_SPECS.light.startAmmo,
  heavy: ROCKET_SPECS.heavy.startAmmo,
  seeker: ROCKET_SPECS.seeker.startAmmo,
});

export const cloneCacheContents = (contents: CacheContents): CacheContents =>
  contents.kind === "wildcard"
    ? {
        kind: "wildcard",
        wildcard: { kind: contents.wildcard.kind },
      }
    : { kind: contents.kind };

export const rollWildcardKind = (rng: () => number): WildcardKind =>
  WILDCARD_KINDS[Math.floor(rng() * WILDCARD_KINDS.length)]!;

export const getBaseShieldLoad = (
  durationSec = SHIELD_SPEC.durationSec,
): number =>
  PLANET_HP * Math.max(0, durationSec / SHIELD_LOAD_REFERENCE_DURATION_SEC);

export const getShieldLoadCapacity = (
  archetypeId: ArchetypeId,
  extended = false,
  durationSec = SHIELD_SPEC.durationSec,
): number =>
  getBaseShieldLoad(durationSec) *
  ARCHETYPES[archetypeId].shieldDurationMultiplier *
  (extended ? SHIELD_EXT_MULTIPLIER : 1);

const SIMPLE_CACHE_KINDS: readonly CacheContents[] = [
  { kind: "heavyAmmo" },
  { kind: "seekerPack" },
  { kind: "repair" },
  { kind: "shieldExt" },
  { kind: "foresightExt" },
];

export const rollCacheContents = (rng: () => number): CacheContents => {
  if (rng() < CACHE_SPEC.wildcardChance) {
    return {
      kind: "wildcard",
      wildcard: { kind: rollWildcardKind(rng) },
    };
  }

  return cloneCacheContents(
    SIMPLE_CACHE_KINDS[Math.floor(rng() * SIMPLE_CACHE_KINDS.length)]!,
  );
};

export const getBoundaryAsteroidDamage = (
  tier: AsteroidTier,
  tuning: ArenaAsteroidFieldTuning = ARENA_ASTEROID_FIELD_SPEC,
): number => tuning[tier].damage;

export const getBoundaryAsteroidExplosionPieces = (
  tier: AsteroidTier,
): number => ARENA_ASTEROID_EXPLOSION_PIECES[tier];

export const getBoundaryAsteroidExplosionBaseSpeed = (
  tier: AsteroidTier,
): number => ARENA_ASTEROID_EXPLOSION_BASE_SPEED[tier];

export const getBoundaryAsteroidExplosionSpeedVariance = (
  tier: AsteroidTier,
): number => ARENA_ASTEROID_EXPLOSION_SPEED_VARIANCE[tier];

export const sampleBoundaryAsteroidSpawnCount = ({
  dtSec,
  rng,
  tier,
  tuning = ARENA_ASTEROID_FIELD_SPEC,
}: BoundaryAsteroidSpawnBudgetOptions): number => {
  const expectedSpawnCount =
    Math.max(0, ARENA_ASTEROID_SPAWN_RATE_PER_SEC[tier] * dtSec) *
    tuning[tier].randomization;
  if (expectedSpawnCount <= 0) {
    return 0;
  }

  const wholeSpawns = Math.floor(expectedSpawnCount);
  const fractionalSpawnChance = expectedSpawnCount - wholeSpawns;
  return wholeSpawns + (rng() < fractionalSpawnChance ? 1 : 0);
};

export const createBoundaryAsteroidSpawn = ({
  arenaRadius,
  rng,
  tier,
  tuning = ARENA_ASTEROID_FIELD_SPEC,
}: BoundaryAsteroidSpawnOptions): BoundaryAsteroidSpawn => {
  const angle = rng() * TAU;
  const spawnRadius = arenaRadius + ARENA_ASTEROID_RADIUS[tier] + rng() * 12;
  const inwardAngle = angle + Math.PI;
  const deviation =
    (rng() - 0.5) *
    2 *
    ARENA_ASTEROID_MAX_ANGLE_DEVIATION_RAD[tier] *
    tuning[tier].randomization;
  const travelAngle = inwardAngle + deviation;
  const speed = ARENA_ASTEROID_SPEED[tier] * (0.82 + rng() * 0.36);

  return {
    asteroidTier: tier,
    pos: {
      x: Math.cos(angle) * spawnRadius,
      y: Math.sin(angle) * spawnRadius,
    },
    radius: ARENA_ASTEROID_RADIUS[tier],
    ttlSec: ARENA_ASTEROID_TTL_SEC[tier],
    vel: {
      x: Math.cos(travelAngle) * speed,
      y: Math.sin(travelAngle) * speed,
    },
  };
};
