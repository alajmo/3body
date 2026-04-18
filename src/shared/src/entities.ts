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
export type WildcardKind = "gravityPulse" | "cloak";

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
  shieldAimDir: Vec2;
  shieldActive: boolean;
  shieldLoad: number;
  shieldMaxLoad: number;
  hideTrailUntilTick: number;
  pilotingDroneId?: EntityId;
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
  foresightActiveUntilTick: number;
  foresightCooldownUntilTick: number;
  foresightDurationTicks: number;
  nextBoostChargeAtTick?: number;
  droneCooldownUntilTick: number;
}

export interface PlanetPrivateState {
  planetId: EntityId;
  ammo: PlanetPrivateAmmo;
  cooldowns: PlanetCooldowns;
  boostCharges: number;
  gravityPulseHeld: boolean;
  cloakHeld: boolean;
  nextShieldExt: boolean;
  nextForesightExt: boolean;
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
  | { kind: "foresightExt" }
  | {
      kind: "wildcard";
      wildcard: { kind: WildcardKind };
    };

export type Drone = EntityBase & {
  kind: "drone";
  ownerId: PlayerId;
  ttlUntilTick: number;
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

export type Debris = EntityBase & {
  kind: "debris";
  ttlUntilTick: number;
  ownerPlayerId?: PlayerId;
};

export interface World {
  suns: Sun[];
  planets: PlanetPublic[];
  rockets: Rocket[];
  drones: Drone[];
  caches: Cache[];
  blackHole?: BlackHole;
  debris: Debris[];
  arenaRadius: number;
}

export type WorldEntity =
  | Sun
  | PlanetPublic
  | Rocket
  | Drone
  | Cache
  | BlackHole
  | Debris;
