import type { Vec2 } from "./vec2";

export type EntityId = number;
export type PlayerId = string;
export type ArchetypeId =
  | "terra"
  | "ignis"
  | "glacius"
  | "volans"
  | "oculus"
  | "umbra"
  | "corvus";
export type RocketKind = "light" | "heavy" | "seeker";
export type WildcardKind = "gravityPulse";
export type AsteroidTier = "micro" | "small" | "large";

export interface EntityBase {
  id: EntityId;
  pos: Vec2;
  vel: Vec2;
  radius: number;
}

export type Sun = EntityBase & {
  kind: "sun";
  mass: number;
};

export interface PlanetDebuffs {
  dragUntilTick?: number;
}

export type PlanetPublic = EntityBase & {
  kind: "planet";
  playerId: PlayerId;
  archetype: ArchetypeId;
  hp: number;
  invulnerableUntilTick?: number;
  shieldAimDir: Vec2;
  shieldActive: boolean;
  shieldLoad: number;
  shieldMaxLoad: number;
  debuffs: PlanetDebuffs;
};

export interface PlanetPrivateAmmo {
  light: number;
  heavy: number;
  seeker: number;
}

export interface PlanetCooldowns {
  lightReloadUntilTick: number;
  heavyReloadUntilTick: number;
  seekerReloadUntilTick: number;
  nextBoostChargeAtTick?: number;
}

export interface SeekerLockState {
  targetId: EntityId;
  startedAtTick: number;
}

export interface PlanetPrivateState {
  planetId: EntityId;
  ammo: PlanetPrivateAmmo;
  cooldowns: PlanetCooldowns;
  boostCharges: number;
  gravityPulseHeld: boolean;
  nextShieldExt: boolean;
  seekerLock: SeekerLockState | null;
}

export type PlanetState = PlanetPublic & PlanetPrivateState;

export type Rocket = EntityBase & {
  kind: "rocket";
  rocketKind: RocketKind;
  ownerId: PlayerId;
  targetId?: EntityId;
  ttlUntilTick: number;
};

export type CacheContents =
  | { kind: "heavyAmmo" }
  | { kind: "seekerPack" }
  | { kind: "repair" }
  | { kind: "shieldExt" }
  | {
      kind: "wildcard";
      wildcard: { kind: WildcardKind };
    };

export type Cache = EntityBase & {
  kind: "cache";
  contents: CacheContents;
};

export type BlackHole = EntityBase & {
  kind: "blackHole";
  mass: number;
  killRadius: number;
};

export type NeutronStar = EntityBase & {
  kind: "neutronStar";
  mass: number;
};

export type Debris = EntityBase & {
  kind: "debris";
  ttlUntilTick: number;
  ownerPlayerId?: PlayerId;
  asteroidTier?: AsteroidTier;
};

export interface FixedPatternWorldOrbitStarMotion {
  mode: "fixedPattern";
  elapsedSec: number;
  patternId: string;
  speed: number;
  baseDistanceScale: number;
  distanceScale: number;
  sunIds: [EntityId, EntityId, EntityId];
}

export type WorldOrbitStarMotion = FixedPatternWorldOrbitStarMotion;

export interface World {
  suns: Sun[];
  neutronStars: NeutronStar[];
  planets: PlanetPublic[];
  rockets: Rocket[];
  caches: Cache[];
  blackHole?: BlackHole;
  debris: Debris[];
  arenaRadius: number;
  orbitStarMotion?: WorldOrbitStarMotion;
}

export type WorldEntity =
  | Sun
  | NeutronStar
  | PlanetPublic
  | Rocket
  | Cache
  | BlackHole
  | Debris;
