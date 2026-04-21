import { ARCHETYPES } from "./archetypes";
import {
  ARENA_ASTEROID_FIELD_SPEC,
  CACHE_SPEC,
  DEFAULT_ARENA_RADIUS,
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
  EntityBase,
  PlanetPrivateAmmo,
  WildcardKind,
} from "./entities";
import type { ArenaAsteroidFieldTuning } from "./tuning";
import {
  clamp,
  dot,
  fromAngle,
  len,
  lerpVec2,
  normalize,
  rot,
  scale,
  type Vec2,
} from "./vec2";

const SHIELD_LOAD_REFERENCE_DURATION_SEC = 4;
const TAU = Math.PI * 2;
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
const ARENA_ASTEROID_EXIT_DISTANCE_MULTIPLIER = 2.6;
const ARENA_ASTEROID_EXIT_MARGIN = 64;
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
const ARENA_ASTEROID_IMPACT_RADIUS_MULTIPLIER = {
  large: 2.15,
  micro: 1.1,
  small: 1.45,
} as const satisfies Record<AsteroidTier, number>;
const MIN_BOUNDARY_ASTEROID_DAMAGE = 1;

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
): number => Math.max(MIN_BOUNDARY_ASTEROID_DAMAGE, tuning[tier].damage);

export const getBoundaryAsteroidImpactRadius = (
  tier: AsteroidTier,
  radius: number = ARENA_ASTEROID_RADIUS[tier],
): number => radius * ARENA_ASTEROID_IMPACT_RADIUS_MULTIPLIER[tier];

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
  if (tuning[tier].randomization <= 0) {
    return 0;
  }

  const expectedSpawnCount = Math.max(
    0,
    tuning[tier].spawnRatePerSec * dtSec,
  );
  if (expectedSpawnCount <= 0) {
    return 0;
  }

  const wholeSpawns = Math.floor(expectedSpawnCount);
  const fractionalSpawnChance = expectedSpawnCount - wholeSpawns;
  return wholeSpawns + (rng() < fractionalSpawnChance ? 1 : 0);
};

const getBoundaryAsteroidSpeed = (
  arenaRadius: number,
  tier: AsteroidTier,
  rng: () => number,
): number => {
  const radiusScale =
    Math.max(arenaRadius, 1) / Math.max(DEFAULT_ARENA_RADIUS, 1);

  return ARENA_ASTEROID_SPEED[tier] * radiusScale * (0.82 + rng() * 0.36);
};

const getBoundaryAsteroidTtlSec = ({
  arenaRadius,
  speed,
  tier,
}: {
  arenaRadius: number;
  speed: number;
  tier: AsteroidTier;
}): number =>
  Math.max(
    ARENA_ASTEROID_TTL_SEC[tier],
    ((arenaRadius + ARENA_ASTEROID_RADIUS[tier] + ARENA_ASTEROID_EXIT_MARGIN) *
      ARENA_ASTEROID_EXIT_DISTANCE_MULTIPLIER) /
      Math.max(speed, 1e-6),
  );

export const shouldDespawnBoundaryAsteroid = (
  piece: Pick<EntityBase, "pos" | "radius" | "vel"> & {
    asteroidTier?: AsteroidTier;
  },
  arenaRadius: number,
): boolean =>
  piece.asteroidTier !== undefined &&
  len(piece.pos) > arenaRadius + piece.radius + ARENA_ASTEROID_EXIT_MARGIN &&
  dot(piece.pos, piece.vel) > 0;

export const createBoundaryAsteroidSpawn = ({
  arenaRadius,
  rng,
  tier,
  tuning = ARENA_ASTEROID_FIELD_SPEC,
}: BoundaryAsteroidSpawnOptions): BoundaryAsteroidSpawn => {
  const angle = rng() * TAU;
  const spawnRadius = arenaRadius + ARENA_ASTEROID_RADIUS[tier] + rng() * 12;
  const driftStrength = clamp(tuning[tier].randomization, 0, 1);
  const outwardDir = fromAngle(angle);
  const inwardDir = scale(outwardDir, -1);
  const driftSample = rng();
  const tangentDir =
    driftSample < 0.5
      ? {
          x: outwardDir.y,
          y: -outwardDir.x,
        }
      : {
          x: -outwardDir.y,
          y: outwardDir.x,
        };
  const baseTravelDir = normalize(
    lerpVec2(tangentDir, inwardDir, driftStrength),
  );
  const deviationSample =
    driftSample < 0.5 ? driftSample * 2 : (driftSample - 0.5) * 2;
  const deviation =
    (deviationSample - 0.5) *
    2 *
    ARENA_ASTEROID_MAX_ANGLE_DEVIATION_RAD[tier] *
    (1 - driftStrength * 0.8);
  const travelDir = rot(baseTravelDir, deviation);
  const speed = getBoundaryAsteroidSpeed(arenaRadius, tier, rng);

  return {
    asteroidTier: tier,
    pos: {
      x: Math.cos(angle) * spawnRadius,
      y: Math.sin(angle) * spawnRadius,
    },
    radius: ARENA_ASTEROID_RADIUS[tier],
    ttlSec: getBoundaryAsteroidTtlSec({
      arenaRadius,
      speed,
      tier,
    }),
    vel: {
      x: travelDir.x * speed,
      y: travelDir.y * speed,
    },
  };
};
