import type { RocketKind, WildcardKind } from "./entities";
import { CURRENT_GAME_TUNING, type GameplayTuning } from "./tuning";

export interface RocketSpec {
  damage: number;
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
  magnitude: number;
}

export interface DroneSpec {
  speed: number;
  thrust: number;
  fuel: number;
  ttlSec: number;
  cooldownSec: number;
  burstImpulse: number;
}

export interface CacheSpec {
  count: number;
  respawnSec: number;
  wildcardChance: number;
}

export interface BoundaryDamageSpec {
  baseDps: number;
  maxDps: number;
  rampAfterSec: number;
}

export interface BlackHoleSpec {
  spawnSec: number;
  mass: number;
  killRadius: number;
  rampSec: number;
}

export interface MatchTimerSpec {
  lobbySec: number;
  pickSec: number;
  countdownSec: number;
  rematchVoteSec: number;
}

export const G = 500;
export const EPS2 = 2500;
export const SUN_MASS = 220_000;
export const PLANET_MASS = 1_000;
export const ARENA_RADIUS = 2000;
export const OUTER_RING_MIN = 1300;
export const OUTER_RING_MAX = 1825;
export const SIM_HZ = 120;
export const FIXED_STEP_SEC = 1 / SIM_HZ;
export const SNAPSHOT_HZ = 30;
export const PLANET_HP = 100;
export const ROOM_CAPACITY = 7;

const initialGameplay = CURRENT_GAME_TUNING.gameplay;

export const ROCKET_SPECS = {
  light: { ...initialGameplay.rockets.light },
  heavy: { ...initialGameplay.rockets.heavy },
  seeker: { ...initialGameplay.rockets.seeker },
} satisfies Record<RocketKind, RocketSpec>;

export const FORESIGHT_SPEC: AbilitySpec = {
  ...initialGameplay.abilities.foresight,
};

export const SHIELD_SPEC: AbilitySpec & { arcDeg: number } = {
  ...initialGameplay.abilities.shield,
};

export const BOOST_SPEC: BoostSpec = {
  ...initialGameplay.abilities.boost,
};

export const DRONE_SPEC: DroneSpec = {
  ...initialGameplay.drone,
};

export const CACHE_SPEC: CacheSpec = {
  ...initialGameplay.cache,
};

export const BOUNDARY_DAMAGE_SPEC: BoundaryDamageSpec = {
  baseDps: 5,
  maxDps: 20,
  rampAfterSec: 5,
};

export const BLACK_HOLE_SPEC: BlackHoleSpec = {
  ...initialGameplay.blackHole,
};

export const MATCH_TIMERS: MatchTimerSpec = {
  ...initialGameplay.timers,
};

export const CACHE_RADIUS = 24;
export const CACHE_GRAVITY_SCALE = 0.34;
export const CACHE_DROP_SPEED_SCALE = 0.52;
export const CACHE_TANGENTIAL_SPEED_MIN = 32;
export const CACHE_TANGENTIAL_SPEED_MAX = 58;

export let DRONE_LAUNCH_SPEED = DRONE_SPEC.speed * 0.48;

export const REPAIR_AMOUNT = 40;
export const SHIELD_EXT_MULTIPLIER = 2;
export const FORESIGHT_EXT_MULTIPLIER = 2;

export const GRAVITY_PULSE_RADIUS = 480;
export const GRAVITY_PULSE_IMPULSE = 440;
export const TELEPORT_SWAP_MIN_DOT = Math.cos(Math.PI / 5);

export const DEBRIS_TTL_SEC = 1.35;

export const WILDCARD_KINDS = [
  "gravityPulse",
  "cloak",
  "teleportSwap",
] as const satisfies readonly WildcardKind[];

export const applyGameplayTuning = (gameplay: GameplayTuning) => {
  Object.assign(ROCKET_SPECS.light, gameplay.rockets.light);
  Object.assign(ROCKET_SPECS.heavy, gameplay.rockets.heavy);
  Object.assign(ROCKET_SPECS.seeker, gameplay.rockets.seeker);
  Object.assign(FORESIGHT_SPEC, gameplay.abilities.foresight);
  Object.assign(SHIELD_SPEC, gameplay.abilities.shield);
  Object.assign(BOOST_SPEC, gameplay.abilities.boost);
  Object.assign(DRONE_SPEC, gameplay.drone);
  Object.assign(CACHE_SPEC, gameplay.cache);
  Object.assign(BLACK_HOLE_SPEC, gameplay.blackHole);
  Object.assign(MATCH_TIMERS, gameplay.timers);
  DRONE_LAUNCH_SPEED = DRONE_SPEC.speed * 0.48;
};
