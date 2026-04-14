import type { RocketKind, WildcardKind } from "./entities";

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

export const ROCKET_SPECS = {
  light: {
    damage: 15,
    speed: 950,
    reloadSec: 1.5,
    ttlSec: 8,
    radius: 10,
    turnRate: 0,
    startAmmo: 5,
    maxAmmo: 5,
  },
  heavy: {
    damage: 70,
    speed: 560,
    reloadSec: 6,
    ttlSec: 8,
    radius: 14,
    turnRate: 0,
    startAmmo: 2,
    maxAmmo: 2,
  },
  seeker: {
    damage: 35,
    speed: 760,
    reloadSec: 4,
    ttlSec: 8,
    radius: 12,
    turnRate: Math.PI * 0.75,
    startAmmo: 3,
    maxAmmo: 3,
  },
} satisfies Record<RocketKind, RocketSpec>;

export const FORESIGHT_SPEC: AbilitySpec = {
  cooldownSec: 12,
  durationSec: 4,
};

export const SHIELD_SPEC: AbilitySpec & { arcDeg: number } = {
  cooldownSec: 15,
  durationSec: 4,
  arcDeg: 120,
};

export const BOOST_SPEC: BoostSpec = {
  charges: 1,
  cooldownSec: 5,
  magnitude: 280,
};

export const DRONE_SPEC: DroneSpec = {
  speed: 620,
  thrust: 220,
  fuel: 3,
  ttlSec: 20,
  cooldownSec: 8,
  burstImpulse: 320,
};

export const CACHE_SPEC: CacheSpec = {
  count: 3,
  respawnSec: 15,
  wildcardChance: 0.1,
};

export const BOUNDARY_DAMAGE_SPEC: BoundaryDamageSpec = {
  baseDps: 5,
  maxDps: 20,
  rampAfterSec: 5,
};

export const BLACK_HOLE_SPEC: BlackHoleSpec = {
  spawnSec: 300,
  mass: 8_000_000,
  killRadius: 150,
  rampSec: 30,
};

export const MATCH_TIMERS: MatchTimerSpec = {
  lobbySec: 30,
  pickSec: 30,
  countdownSec: 3,
  rematchVoteSec: 20,
};

export const CACHE_RADIUS = 24;
export const CACHE_GRAVITY_SCALE = 0.34;
export const CACHE_DROP_SPEED_SCALE = 0.52;
export const CACHE_TANGENTIAL_SPEED_MIN = 32;
export const CACHE_TANGENTIAL_SPEED_MAX = 58;

export const DRONE_LAUNCH_SPEED = DRONE_SPEC.speed * 0.48;

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
