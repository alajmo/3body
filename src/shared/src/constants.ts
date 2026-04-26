import { applyCombatAiTuning } from "./ai/runtimeTuning";
import type {
  BlackHole,
  EntityBase,
  RocketKind,
  WildcardKind,
} from "./entities";
import {
  type ArenaAsteroidFieldTuning,
  CURRENT_GAME_TUNING,
  type GameplayTuning,
} from "./tuning";

export interface RocketSpec {
  damage: number;
  lockSec: number;
  speed: number;
  reloadSec: number;
  ttlSec: number;
  radius: number;
  turnRate: number;
  startAmmo: number;
  maxAmmo: number;
}

export interface AbilitySpec {
  cooldownSec: number;
  durationSec: number;
}

export interface BoostSpec {
  charges: number;
  cooldownSec: number;
  depleteSec: number;
  magnitude: number;
}

export interface GravityPulseSpec {
  force: number;
  radius: number;
}

export interface CacheSpec {
  count: number;
  pickupRadius: number;
  respawnSec: number;
  wildcardChance: number;
}

export interface BlackHoleSpec {
  spawnSec: number;
  mass: number;
  killRadius: number;
  rampSec: number;
}

export interface BlackHoleConsumable extends Pick<EntityBase, "radius"> {
  kind: "planet" | "sun" | "neutronStar";
  mass?: number;
}

export interface NeutronStarSpec {
  count: number;
  minMassKg: number;
  maxMassKg: number;
  minSize: number;
  maxSize: number;
  randomizePositionInsidePlayableCircle: boolean;
}

export interface MatchTimerSpec {
  cycleCountdownSec: number;
  cycleSec: number;
  pickSec: number;
  countdownSec: number;
  rematchVoteSec: number;
  spawnInvulnSec: number;
}

export interface ArenaBoundarySpec {
  baseDps: number;
  instantDeath: boolean;
  maxDps: number;
  rampAfterSec: number;
}

const initialGameplay = CURRENT_GAME_TUNING.gameplay;

export const G = 500;
export const EPS2 = 2500;
export const SUN_MASS = 220_000;
export const PLANET_MASS = 1_000;
export const DEFAULT_ARENA_RADIUS = 2_000;
export const ARENA_RADIUS_MIN = 1_400;
export let ARENA_RADIUS = initialGameplay.arena.radius;
export const OUTER_RING_MIN = 1300;
export const OUTER_RING_MAX = 1825;
export const SIM_HZ = 60;
export const FIXED_STEP_SEC = 1 / SIM_HZ;
export const SNAPSHOT_HZ = 60;
export const PLANET_HP = 100;
export const ROOM_CAPACITY = 15;

export const ROCKET_SPECS = {
  light: { ...initialGameplay.rockets.light },
  heavy: { ...initialGameplay.rockets.heavy },
  seeker: { ...initialGameplay.rockets.seeker },
} satisfies Record<RocketKind, RocketSpec>;

export const SHIELD_SPEC: AbilitySpec & { arcDeg: number } = {
  ...initialGameplay.abilities.shield,
};

export const BOOST_SPEC: BoostSpec = {
  ...initialGameplay.abilities.boost,
};

export const GRAVITY_PULSE_SPEC: GravityPulseSpec = {
  ...initialGameplay.abilities.gravityPulse,
};

export const CACHE_SPEC: CacheSpec = {
  ...initialGameplay.cache,
};

const OUTER_RING_MIN_RATIO = OUTER_RING_MIN / DEFAULT_ARENA_RADIUS;
const OUTER_RING_MAX_RATIO = OUTER_RING_MAX / DEFAULT_ARENA_RADIUS;

export const ARENA_ASTEROID_FIELD_SPEC: ArenaAsteroidFieldTuning = {
  large: { ...initialGameplay.arena.asteroidField.large },
  micro: { ...initialGameplay.arena.asteroidField.micro },
  small: { ...initialGameplay.arena.asteroidField.small },
};

export const ARENA_BOUNDARY_SPEC: ArenaBoundarySpec = {
  baseDps: 5,
  instantDeath: initialGameplay.arena.instantDeath,
  maxDps: 20,
  rampAfterSec: initialGameplay.arena.boundaryRampAfterSec,
};

export const BLACK_HOLE_SPEC: BlackHoleSpec = {
  ...initialGameplay.blackHole,
};

export const getBlackHoleCollapseAlpha = (
  elapsedSec: number,
  spec: BlackHoleSpec = BLACK_HOLE_SPEC,
): number =>
  Math.min(
    1,
    Math.max(0, (elapsedSec - spec.spawnSec) / Math.max(spec.rampSec, 0.0001)),
  );

export const getBlackHoleMassAtElapsedSec = (
  elapsedSec: number,
  spec: BlackHoleSpec = BLACK_HOLE_SPEC,
): number => spec.mass * getBlackHoleCollapseAlpha(elapsedSec, spec);

export const getBlackHoleKillRadiusAtElapsedSec = (
  elapsedSec: number,
  spec: BlackHoleSpec = BLACK_HOLE_SPEC,
): number => spec.killRadius * getBlackHoleCollapseAlpha(elapsedSec, spec);

export const getBlackHoleMassAtTick = (
  tick: number,
  tickHz: number,
  spec: BlackHoleSpec = BLACK_HOLE_SPEC,
): number => getBlackHoleMassAtElapsedSec(tick / tickHz, spec);

export const getBlackHoleKillRadiusAtTick = (
  tick: number,
  tickHz: number,
  spec: BlackHoleSpec = BLACK_HOLE_SPEC,
): number => getBlackHoleKillRadiusAtElapsedSec(tick / tickHz, spec);

export const getBlackHoleConsumptionMassGain = (
  body: BlackHoleConsumable,
): number =>
  body.kind === "planet" ? PLANET_MASS : Math.max(0, body.mass ?? 0);

export const getBlackHoleKillRadiusAfterConsumption = (
  currentKillRadius: number,
  consumedRadius: number,
): number => Math.hypot(currentKillRadius, Math.max(0, consumedRadius));

export const consumeBlackHoleBodies = <
  T extends Pick<BlackHole, "killRadius" | "mass" | "radius">,
>(
  blackHole: T,
  bodies: readonly BlackHoleConsumable[],
): T => {
  let nextMass = blackHole.mass;
  let nextKillRadius = blackHole.killRadius;

  for (const body of bodies) {
    nextMass += getBlackHoleConsumptionMassGain(body);
    nextKillRadius = getBlackHoleKillRadiusAfterConsumption(
      nextKillRadius,
      body.radius,
    );
  }

  return {
    ...blackHole,
    killRadius: nextKillRadius,
    mass: nextMass,
    radius: nextKillRadius,
  } as T;
};

export const NEUTRON_STAR_SPEC: NeutronStarSpec = {
  ...initialGameplay.neutronStars,
};

export const MATCH_TIMERS: MatchTimerSpec = {
  ...initialGameplay.timers,
};

export let CACHE_RADIUS = CACHE_SPEC.pickupRadius;
export const CACHE_GRAVITY_SCALE = 0.34;
export const CACHE_DROP_SPEED_SCALE = 0.52;
export const CACHE_TANGENTIAL_SPEED_MIN = 32;
export const CACHE_TANGENTIAL_SPEED_MAX = 58;

export const getOuterRingMin = (arenaRadius = ARENA_RADIUS): number =>
  arenaRadius * OUTER_RING_MIN_RATIO;

export const getOuterRingMax = (arenaRadius = ARENA_RADIUS): number =>
  arenaRadius * OUTER_RING_MAX_RATIO;

export const REPAIR_AMOUNT = 40;
export const SHIELD_EXT_MULTIPLIER = 2;

export let GRAVITY_PULSE_RADIUS = GRAVITY_PULSE_SPEC.radius;
export let GRAVITY_PULSE_IMPULSE = GRAVITY_PULSE_SPEC.force;

export const DEBRIS_TTL_SEC = 1.35;

export const getSeekerLockTicks = (): number =>
  Math.max(0, Math.round(ROCKET_SPECS.seeker.lockSec / FIXED_STEP_SEC));

export const WILDCARD_KINDS = [
  "gravityPulse",
] as const satisfies readonly WildcardKind[];

export const applyGameplayTuning = (gameplay: GameplayTuning) => {
  applyCombatAiTuning(gameplay.ai);
  Object.assign(ROCKET_SPECS.light, gameplay.rockets.light);
  Object.assign(ROCKET_SPECS.heavy, gameplay.rockets.heavy);
  Object.assign(ROCKET_SPECS.seeker, gameplay.rockets.seeker);
  ARENA_RADIUS = gameplay.arena.radius;
  ARENA_BOUNDARY_SPEC.instantDeath = gameplay.arena.instantDeath;
  ARENA_BOUNDARY_SPEC.rampAfterSec = gameplay.arena.boundaryRampAfterSec;
  Object.assign(
    ARENA_ASTEROID_FIELD_SPEC.micro,
    gameplay.arena.asteroidField.micro,
  );
  Object.assign(
    ARENA_ASTEROID_FIELD_SPEC.small,
    gameplay.arena.asteroidField.small,
  );
  Object.assign(
    ARENA_ASTEROID_FIELD_SPEC.large,
    gameplay.arena.asteroidField.large,
  );
  Object.assign(SHIELD_SPEC, gameplay.abilities.shield);
  Object.assign(BOOST_SPEC, gameplay.abilities.boost);
  Object.assign(GRAVITY_PULSE_SPEC, gameplay.abilities.gravityPulse);
  Object.assign(CACHE_SPEC, gameplay.cache);
  CACHE_RADIUS = CACHE_SPEC.pickupRadius;
  Object.assign(BLACK_HOLE_SPEC, gameplay.blackHole);
  Object.assign(NEUTRON_STAR_SPEC, gameplay.neutronStars);
  Object.assign(MATCH_TIMERS, gameplay.timers);
  GRAVITY_PULSE_RADIUS = GRAVITY_PULSE_SPEC.radius;
  GRAVITY_PULSE_IMPULSE = GRAVITY_PULSE_SPEC.force;
};
