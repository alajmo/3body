import type {
  ArchetypeId,
  BlackHole,
  BlackHoleSpec,
  Cache,
  CacheContents,
  Debris,
  Drone,
  EntityBase,
  PlanetDebuffs,
  PlanetPrivateAmmo,
  Rocket,
  RocketKind,
  Sun,
  Vec2,
  WildcardKind,
} from "@3body/shared";
import {
  ARCHETYPE_IDS,
  ARCHETYPES,
  add,
  BOOST_SPEC,
  CACHE_DROP_SPEED_SCALE,
  CACHE_GRAVITY_SCALE,
  CACHE_RADIUS,
  CACHE_SPEC,
  CACHE_TANGENTIAL_SPEED_MAX,
  CACHE_TANGENTIAL_SPEED_MIN,
  clamp,
  clampLen,
  cloneCacheContents,
  createInitialAmmo,
  DEBRIS_TTL_SEC,
  DRONE_LAUNCH_SPEED,
  DRONE_SPEC,
  dist,
  dot,
  FIXED_STEP_SEC,
  FORESIGHT_EXT_MULTIPLIER,
  FORESIGHT_SPEC,
  fromAngle,
  GRAVITY_PULSE_IMPULSE,
  GRAVITY_PULSE_RADIUS,
  len,
  lerp,
  lerpVec2,
  mulberry32,
  normalize,
  OUTER_RING_MAX,
  OUTER_RING_MIN,
  PLANET_HP,
  REPAIR_AMOUNT,
  rollCacheContents,
  ROCKET_SPECS,
  SHIELD_EXT_MULTIPLIER,
  SHIELD_SPEC,
  SIM_HZ,
  scale,
  stepBody,
  stepBodyWithGravityScale,
  stepSeeker,
  stepSuns,
  sub,
  TELEPORT_SWAP_MIN_DOT,
} from "@3body/shared";
import {
  DEFAULT_ORBIT_PRESET,
  type OrbitPlanetSeed,
  type OrbitPreset,
  type OrbitRiskProfile,
} from "./orbitPresets";
import { findMinPlanetSunGap, findMinSunSunGap } from "./orbitSandbox";

export const SUN_SWALLOW_FADE_SEC = 2.4;
const LIGHT_RELOCK_DISTANCE = 96;

export const SEEKER_LOCK_DURATION_SEC = 3;
export const SEEKER_LOCK_TICKS = Math.round(
  SEEKER_LOCK_DURATION_SEC / FIXED_STEP_SEC,
);
// Use a calmer outer-orbit body for the local player so combat starts are playable.
const PLAYER_PLANET_INDEX = 4;
// Planets are rendered larger than their simulation bodies in the local viewport,
// so rocket impacts should line up with the visible planet edge.
const ROCKET_PLANET_IMPACT_RADIUS_MULTIPLIER = 2;
const PLANET_IMPACT_TTL_SEC = 0.32;
const DEBRIS_PIECES = 20;
const DEBRIS_BURST_SPEED = 220;
const DEBRIS_BURST_SPEED_VARIANCE = 170;
const ROCKET_DEBRIS_PIECES_LIGHT = 6;
const ROCKET_DEBRIS_PIECES_HEAVY = 10;
const ROCKET_DEBRIS_PIECES_SEEKER = 8;
const ROCKET_DEBRIS_BURST_SPEED = 168;
const ROCKET_DEBRIS_BURST_SPEED_VARIANCE = 104;
const CACHE_DEBRIS_PIECES = 10;
const CACHE_DEBRIS_BURST_SPEED = 140;
const CACHE_DEBRIS_BURST_SPEED_VARIANCE = 92;
const DRONE_DEBRIS_PIECES = 12;
const DRONE_DEBRIS_BURST_SPEED = 168;
const DRONE_DEBRIS_BURST_SPEED_VARIANCE = 104;
const PLAYER_LOST_RESET_DELAY_SEC = 6;
const DEFAULT_AIM_DIR = { x: 1, y: 0 } satisfies Vec2;
const SWALLOWED_SUN_DRIFT_ALPHA = 0.035;
const SWALLOWED_SUN_VELOCITY_DAMPING = 0.08;
const DRONE_RADIUS = 18;
const CLOAK_DURATION_TICKS = Math.max(1, Math.round(5 * SIM_HZ));
const UMBRA_DRAG_DURATION_TICKS = Math.max(1, Math.round(2 * SIM_HZ));
// Interpret the spec's "30% velocity multiplier" as cumulative damping over the drag window.
const UMBRA_DRAG_STEP_MULTIPLIER = 0.3 ** (1 / UMBRA_DRAG_DURATION_TICKS);
const DRONE_COOLDOWN_TICKS = Math.max(
  1,
  Math.round(DRONE_SPEC.cooldownSec * SIM_HZ),
);
const DRONE_TTL_TICKS = Math.max(1, Math.round(DRONE_SPEC.ttlSec * SIM_HZ));
const CACHE_RESPAWN_TICKS = Math.max(
  1,
  Math.round(CACHE_SPEC.respawnSec * SIM_HZ),
);
const getAbilityTicks = (durationSec: number): number =>
  Math.max(1, Math.round(durationSec * SIM_HZ));

const getForesightDurationTicks = (): number =>
  getAbilityTicks(FORESIGHT_SPEC.durationSec);

const getForesightCooldownTicks = (): number =>
  getAbilityTicks(FORESIGHT_SPEC.cooldownSec);

const getShieldDurationTicks = (): number =>
  getAbilityTicks(SHIELD_SPEC.durationSec);

const getShieldCooldownTicks = (): number =>
  getAbilityTicks(SHIELD_SPEC.cooldownSec);

const getBoostRechargeTicks = (): number =>
  getAbilityTicks(BOOST_SPEC.cooldownSec);

const getShieldArcDotThreshold = (): number =>
  Math.cos((SHIELD_SPEC.arcDeg * Math.PI) / 360);
export type CombatPlanetDeathReason =
  | "rocket"
  | "sunCollision"
  | "planetCollision"
  | "boundary"
  | "blackHole";

export type CombatResetReason =
  | "sunCollision"
  | "allPlanetsLost"
  | "playerLost";

export interface CombatSandboxSun extends Sun {
  swallowedAtSec: number | null;
}

export interface CombatSandboxPlanet extends EntityBase {
  kind: "planet";
  label: string;
  color: string;
  trailColor: string;
  risk: OrbitRiskProfile;
  archetype: ArchetypeId;
  playerId: string;
  alive: boolean;
  hp: number;
  deathReason?: CombatPlanetDeathReason;
  hideTrailUntilTick: number;
  pilotingDroneId?: number;
  debuffs: PlanetDebuffs;
}

export interface CombatSandboxRocket extends Rocket {
  damage: number;
  trailColor: string;
  color: string;
  dragOnHit: boolean;
  turnRateMultiplier: number;
}

export type CombatSandboxDrone = Drone;

export type CombatSandboxCache = Cache;

export interface CombatSandboxDebris extends Debris {
  color: string;
}

export interface CombatSandboxImpactBurst {
  id: number;
  planetId: number;
  color: string;
  normal: Vec2;
  startedAtSec: number;
  startedAtTick: number;
  ttlUntilTick: number;
}

export interface CombatSandboxPlayerState {
  planetId: number;
  selectedRocketKind: RocketKind;
  ammo: PlanetPrivateAmmo;
  reloadUntilTick: Record<RocketKind, number>;
  aimWorld: Vec2;
  lockTargetId: number | null;
  seekerLockAcquiredAtTick: number | null;
  foresightActiveUntilTick: number;
  foresightCooldownUntilTick: number;
  shieldAimDir: Vec2;
  shieldActiveUntilTick: number;
  shieldCooldownUntilTick: number;
  boostCharges: number;
  nextBoostChargeAtTick: number | null;
  lastBoostTick: number | null;
  lastBoostAimDir: Vec2;
  droneCooldownUntilTick: number;
  activeDroneId: number | null;
  controlMode: "planet" | "drone";
  wildcardSlot: WildcardKind | null;
  nextShieldExt: boolean;
  nextForesightExt: boolean;
}

export interface CombatSandboxState {
  tick: number;
  elapsedSec: number;
  preset: OrbitPreset;
  suns: CombatSandboxSun[];
  planets: CombatSandboxPlanet[];
  rockets: CombatSandboxRocket[];
  drones: CombatSandboxDrone[];
  caches: CombatSandboxCache[];
  cacheRespawnAtTicks: number[];
  debris: CombatSandboxDebris[];
  impactBursts: CombatSandboxImpactBurst[];
  blackHole: BlackHole | null;
  player: CombatSandboxPlayerState;
  nextEntityId: number;
  playerLostAtSec: number | null;
  rng: () => number;
}

export interface CombatSandboxStepInput {
  aimWorld: Vec2;
  selectedRocketKind: RocketKind;
  fireRequested: boolean;
  foresightRequested: boolean;
  shieldRequested: boolean;
  boostRequested: boolean;
  wildcardRequested: boolean;
  droneLaunchRequested: boolean;
  droneBurstRequested: boolean;
  droneAutoReturnRequested: boolean;
  droneRecallRequested: boolean;
}

export interface CombatSandboxDebugSnapshot {
  elapsedSec: number;
  alivePlanets: number;
  minCurrentPlanetSunGap: number;
  minCurrentSunSunGap: number;
  presetLabel: string;
  playerArchetypeName: string;
  selectedRocketKind: RocketKind;
  lockTargetLabel: string | null;
  playerHp: number;
  lightAmmo: number;
  heavyAmmo: number;
  seekerAmmo: number;
  blackHoleActive: boolean;
  cacheCount: number;
  droneMode: "ready" | "piloting" | "return" | "cooldown";
  droneCooldownRemainingSec: number;
  droneFuel: number | null;
  droneCargoLabel: string | null;
  wildcardLabel: string | null;
}

const ARCHETYPE_VISUALS = {
  terra: {
    color: "#9fc66f",
    trailColor: "#d6ef8a",
  },
  ignis: {
    color: "#ff8550",
    trailColor: "#ffb07c",
  },
  glacius: {
    color: "#8ed8ff",
    trailColor: "#d5f4ff",
  },
  volans: {
    color: "#5fe7da",
    trailColor: "#8ff7ee",
  },
  oculus: {
    color: "#ffd56b",
    trailColor: "#fff1a4",
  },
  umbra: {
    color: "#8c7dff",
    trailColor: "#b3a8ff",
  },
  corvus: {
    color: "#d7e4ff",
    trailColor: "#f3f7ff",
  },
} satisfies Record<ArchetypeId, { color: string; trailColor: string }>;

const getArchetypeStats = (archetype: ArchetypeId) => ARCHETYPES[archetype];

const getBoostChargeCapacity = (_archetype: ArchetypeId): number =>
  BOOST_SPEC.charges;

const clonePlanetSeed = (
  planetSeed: OrbitPlanetSeed,
  index: number,
  playerPlanetId: number,
): CombatSandboxPlanet => {
  const archetype = ARCHETYPE_IDS[index % ARCHETYPE_IDS.length]!;
  const visuals = ARCHETYPE_VISUALS[archetype];

  return {
    ...planetSeed,
    kind: "planet",
    pos: { x: planetSeed.pos.x, y: planetSeed.pos.y },
    vel: { x: planetSeed.vel.x, y: planetSeed.vel.y },
    radius: planetSeed.radius,
    label: planetSeed.label,
    color: visuals.color,
    trailColor: visuals.trailColor,
    archetype,
    playerId:
      planetSeed.id === playerPlanetId ? "player" : `bot-${planetSeed.id}`,
    alive: true,
    hp: PLANET_HP,
    hideTrailUntilTick: 0,
    debuffs: {},
  };
};

const lightRocketTint = {
  core: "#f4f9ff",
  trail: "#b7e6ff",
};

const heavyRocketTint = {
  core: "#ff8d4a",
  trail: "#ff6130",
};

const seekerRocketTint = {
  core: "#f564ff",
  trail: "#ff4dd4",
};

const ROCKET_VISUALS: Record<RocketKind, { core: string; trail: string }> = {
  heavy: heavyRocketTint,
  light: lightRocketTint,
  seeker: seekerRocketTint,
};

const weaponReloadTicks = (
  rocketKind: RocketKind,
  archetype: ArchetypeId,
): number =>
  Math.max(
    1,
    Math.round(
      ROCKET_SPECS[rocketKind].reloadSec *
        getArchetypeStats(archetype).rocketReloadMultiplier *
        SIM_HZ,
    ),
  );

const rocketTtlTicks = (rocketKind: RocketKind): number =>
  Math.max(1, Math.round(ROCKET_SPECS[rocketKind].ttlSec * SIM_HZ));

const debrisTtlTicks = Math.max(1, Math.round(DEBRIS_TTL_SEC * SIM_HZ));
const planetImpactTtlTicks = Math.max(
  1,
  Math.round(PLANET_IMPACT_TTL_SEC * SIM_HZ),
);

const nextRocketIdBase = 10_000;

const hashString = (value: string): number => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
};

const clonePlanet = (planet: CombatSandboxPlanet): CombatSandboxPlanet => ({
  ...planet,
  pos: { x: planet.pos.x, y: planet.pos.y },
  vel: { x: planet.vel.x, y: planet.vel.y },
  debuffs: { ...planet.debuffs },
});

const cloneRocket = (rocket: CombatSandboxRocket): CombatSandboxRocket => ({
  ...rocket,
  pos: { x: rocket.pos.x, y: rocket.pos.y },
  vel: { x: rocket.vel.x, y: rocket.vel.y },
});

const cloneDrone = (drone: CombatSandboxDrone): CombatSandboxDrone => ({
  ...drone,
  pos: { x: drone.pos.x, y: drone.pos.y },
  vel: { x: drone.vel.x, y: drone.vel.y },
  cargo:
    drone.cargo === undefined ? undefined : cloneCacheContents(drone.cargo),
});

const cloneCache = (cache: CombatSandboxCache): CombatSandboxCache => ({
  ...cache,
  pos: { x: cache.pos.x, y: cache.pos.y },
  vel: { x: cache.vel.x, y: cache.vel.y },
  contents: cloneCacheContents(cache.contents),
});

export const describeWildcard = (wildcard: WildcardKind): string => {
  switch (wildcard) {
    case "gravityPulse":
      return "Gravity Pulse";
    case "cloak":
      return "Cloak";
    case "teleportSwap":
      return "Teleport Swap";
  }
};

const getCacheContentsColor = (contents: CacheContents): string => {
  switch (contents.kind) {
    case "heavyAmmo":
      return "#ff8b49";
    case "seekerPack":
      return "#ff5fe8";
    case "repair":
      return "#84f4b0";
    case "boostCharge":
      return "#7ec7ff";
    case "shieldExt":
      return "#86ecff";
    case "foresightExt":
      return "#ffe285";
    case "wildcard":
      return "#ffd679";
  }
};

export const describeCacheContents = (contents: CacheContents): string => {
  switch (contents.kind) {
    case "heavyAmmo":
      return "Heavy +1";
    case "seekerPack":
      return "Seeker +2";
    case "repair":
      return "Repair";
    case "boostCharge":
      return "Boost Reset";
    case "shieldExt":
      return "Shield Ext";
    case "foresightExt":
      return "Foresight Ext";
    case "wildcard":
      return `Wildcard: ${describeWildcard(contents.wildcard.kind)}`;
  }
};

const createSandboxRng = (preset: OrbitPreset): (() => number) =>
  mulberry32(hashString(`phase5:${preset.id}`));

const isSunSwallowed = (
  sun: Pick<CombatSandboxSun, "swallowedAtSec">,
): boolean => sun.swallowedAtSec !== null;

export const getActiveCombatSuns = (
  suns: readonly CombatSandboxSun[],
): CombatSandboxSun[] => suns.filter((sun) => !isSunSwallowed(sun));

const createOuterRingCache = (
  rng: () => number,
  id: number,
  preferredAngleRad?: number,
  contents?: CacheContents,
): CombatSandboxCache => {
  const angle = preferredAngleRad ?? rng() * Math.PI * 2 + (rng() - 0.5) * 0.24;
  const radius = lerp(OUTER_RING_MIN, OUTER_RING_MAX, rng());
  const tangentialDir = fromAngle(
    angle + (Math.PI / 2) * (rng() < 0.5 ? -1 : 1),
  );
  const driftSpeed = lerp(
    CACHE_TANGENTIAL_SPEED_MIN,
    CACHE_TANGENTIAL_SPEED_MAX,
    rng(),
  );

  return {
    id,
    kind: "cache",
    contents: contents === undefined ? rollCacheContents(rng) : contents,
    pos: {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    },
    vel: scale(tangentialDir, driftSpeed),
    radius: CACHE_RADIUS,
  };
};

const createInitialCaches = (
  rng: () => number,
  nextEntityId: number,
): { caches: CombatSandboxCache[]; nextEntityId: number } => {
  const caches: CombatSandboxCache[] = [];
  let nextId = nextEntityId;

  for (let index = 0; index < CACHE_SPEC.count; index += 1) {
    const angle =
      (index / CACHE_SPEC.count) * Math.PI * 2 + (rng() - 0.5) * 0.42;
    caches.push(createOuterRingCache(rng, nextId, angle));
    nextId += 1;
  }

  return {
    caches,
    nextEntityId: nextId,
  };
};

const createDroppedCache = (
  nextEntityId: number,
  drone: CombatSandboxDrone,
  cargo: CacheContents,
): CombatSandboxCache => ({
  id: nextEntityId,
  kind: "cache",
  contents: cloneCacheContents(cargo),
  pos: { x: drone.pos.x, y: drone.pos.y },
  vel: scale(drone.vel, CACHE_DROP_SPEED_SCALE),
  radius: CACHE_RADIUS,
});

const isPlanetInsideBlackHole = (
  planet: Pick<CombatSandboxPlanet, "pos" | "radius">,
  blackHole: BlackHole | null,
): boolean =>
  blackHole !== null &&
  dist(planet.pos, blackHole.pos) <= blackHole.killRadius + planet.radius;

const isEntityInsideBlackHole = (
  entity: Pick<EntityBase, "pos" | "radius">,
  blackHole: BlackHole | null,
): boolean =>
  blackHole !== null &&
  dist(entity.pos, blackHole.pos) <= blackHole.killRadius + entity.radius;

const getBlackHoleCollapseAlpha = (
  elapsedSec: number,
  blackHoleSpec: BlackHoleSpec,
): number =>
  clamp((elapsedSec - blackHoleSpec.spawnSec) / blackHoleSpec.rampSec, 0, 1);

const stepCombatSuns = (
  suns: readonly CombatSandboxSun[],
  blackHole: BlackHole | null,
  swallowedAtSec: number,
): CombatSandboxSun[] => {
  const steppedActiveById = new Map(
    stepSuns(
      getActiveCombatSuns(suns),
      FIXED_STEP_SEC,
      blackHole ?? undefined,
    ).map((sun) => [sun.id, sun] as const),
  );

  return suns.map((sun) => {
    if (isSunSwallowed(sun)) {
      if (blackHole === null) {
        return sun;
      }

      return {
        ...sun,
        mass: 0,
        pos: lerpVec2(sun.pos, blackHole.pos, SWALLOWED_SUN_DRIFT_ALPHA),
        vel: lerpVec2(sun.vel, { x: 0, y: 0 }, SWALLOWED_SUN_VELOCITY_DAMPING),
      };
    }

    const steppedSun = steppedActiveById.get(sun.id)!;
    return isEntityInsideBlackHole(steppedSun, blackHole)
      ? {
          ...steppedSun,
          mass: 0,
          swallowedAtSec,
        }
      : {
          ...steppedSun,
          swallowedAtSec: null,
        };
  });
};

const findPlayerPlanet = (
  planets: readonly CombatSandboxPlanet[],
  playerPlanetId: number,
): CombatSandboxPlanet | null =>
  planets.find((planet) => planet.id === playerPlanetId) ?? null;

const getPlayerArchetypeId = (
  planets: readonly CombatSandboxPlanet[],
  playerPlanetId: number,
): ArchetypeId =>
  findPlayerPlanet(planets, playerPlanetId)?.archetype ?? "terra";

const findOwnerPlanet = (
  planets: readonly CombatSandboxPlanet[],
  ownerId: string,
): CombatSandboxPlanet | null =>
  planets.find((planet) => planet.playerId === ownerId) ?? null;

const findActiveDrone = (
  drones: readonly CombatSandboxDrone[],
  activeDroneId: number | null,
): CombatSandboxDrone | null =>
  activeDroneId === null
    ? null
    : (drones.find((drone) => drone.id === activeDroneId) ?? null);

const findAliveTargetPlanet = (
  planets: readonly CombatSandboxPlanet[],
  playerPlanetId: number,
  aimWorld: Vec2,
): CombatSandboxPlanet | null => {
  let bestTarget: CombatSandboxPlanet | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const planet of planets) {
    if (!planet.alive || planet.id === playerPlanetId) {
      continue;
    }

    const distance = dist(planet.pos, aimWorld) - planet.radius;
    if (distance <= LIGHT_RELOCK_DISTANCE && distance < bestDistance) {
      bestDistance = distance;
      bestTarget = planet;
    }
  }

  return bestTarget;
};

const addLightAmmoCharge = (
  ammo: PlanetPrivateAmmo,
  reloadUntilTick: Record<RocketKind, number>,
  nextTick: number,
  archetype: ArchetypeId,
) => {
  if (
    ammo.light >= ROCKET_SPECS.light.maxAmmo ||
    reloadUntilTick.light === 0 ||
    nextTick < reloadUntilTick.light
  ) {
    return;
  }

  ammo.light += 1;
  reloadUntilTick.light =
    ammo.light >= ROCKET_SPECS.light.maxAmmo
      ? 0
      : nextTick + weaponReloadTicks("light", archetype);
};

const aimDirFromWorldTarget = (
  body: Pick<EntityBase, "pos"> | null,
  aimWorld: Vec2,
  fallback: Vec2 = DEFAULT_AIM_DIR,
): Vec2 => {
  if (body === null) {
    return fallback;
  }

  const aimDir = normalize(sub(aimWorld, body.pos));
  return len(aimDir) === 0 ? fallback : aimDir;
};

const refreshBoostCharges = (
  player: CombatSandboxPlayerState,
  tick: number,
  maxBoostCharges: number,
) => {
  if (player.boostCharges >= maxBoostCharges) {
    player.nextBoostChargeAtTick = null;
    return;
  }

  while (
    player.nextBoostChargeAtTick !== null &&
    player.nextBoostChargeAtTick <= tick
  ) {
    player.boostCharges = Math.min(maxBoostCharges, player.boostCharges + 1);
    player.nextBoostChargeAtTick =
      player.boostCharges >= maxBoostCharges
        ? null
        : player.nextBoostChargeAtTick + getBoostRechargeTicks();
  }
};

const hasActiveShield = (
  player: CombatSandboxPlayerState,
  tick: number,
): boolean => tick < player.shieldActiveUntilTick;

const shieldProtectsImpact = (
  planet: CombatSandboxPlanet,
  player: CombatSandboxPlayerState,
  sourcePos: Vec2,
  tick: number,
): boolean => {
  if (
    planet.id !== player.planetId ||
    !planet.alive ||
    !hasActiveShield(player, tick)
  ) {
    return false;
  }

  const shieldAimDir = normalize(player.shieldAimDir);
  const hitDir = normalize(sub(sourcePos, planet.pos));
  if (len(shieldAimDir) === 0 || len(hitDir) === 0) {
    return false;
  }

  return dot(shieldAimDir, hitDir) >= getShieldArcDotThreshold();
};

interface DebrisBurstOptions {
  pieces: number;
  baseSpeed: number;
  speedVariance: number;
  color: string;
}

const createDebrisBurst = (
  tick: number,
  nextEntityId: number,
  source: Pick<EntityBase, "pos" | "vel">,
  options: DebrisBurstOptions,
): CombatSandboxDebris[] => {
  const pieces: CombatSandboxDebris[] = [];

  for (let index = 0; index < options.pieces; index += 1) {
    const angle = (index / options.pieces) * Math.PI * 2 + tick * 0.137;
    const speed =
      options.baseSpeed +
      options.speedVariance * Math.sin(tick * 0.23 + index * 1.91);
    pieces.push({
      id: nextEntityId + pieces.length,
      kind: "debris",
      ownerPlayerId: undefined,
      pos: { x: source.pos.x, y: source.pos.y },
      radius: 5 + ((index % 3) + 1) * 1.2,
      ttlUntilTick: tick + debrisTtlTicks,
      vel: add(source.vel, scale(fromAngle(angle), speed)),
      color: options.color,
    });
  }

  return pieces;
};

const getPlanetImpactNormal = (
  planet: Pick<EntityBase, "pos">,
  source: Pick<EntityBase, "pos" | "vel">,
): Vec2 => {
  const radial = normalize(sub(source.pos, planet.pos));
  if (len(radial) > 0) {
    return radial;
  }

  return normalize(scale(source.vel, -1));
};

const createPlanetImpactBurst = (
  tick: number,
  nextEntityId: number,
  elapsedSec: number,
  planet: Pick<EntityBase, "id" | "pos">,
  source: Pick<EntityBase, "pos" | "vel">,
  color: string,
): CombatSandboxImpactBurst => ({
  id: nextEntityId,
  planetId: planet.id,
  color,
  normal: getPlanetImpactNormal(planet, source),
  startedAtSec: elapsedSec,
  startedAtTick: tick,
  ttlUntilTick: tick + planetImpactTtlTicks,
});

const normalizePlanetDebuffs = (
  debuffs: PlanetDebuffs,
  tick: number,
): PlanetDebuffs =>
  debuffs.dragUntilTick !== undefined && tick < debuffs.dragUntilTick
    ? {
        dragUntilTick: debuffs.dragUntilTick,
      }
    : {};

const killPlanet = (
  planet: CombatSandboxPlanet,
  reason: CombatPlanetDeathReason,
): CombatSandboxPlanet => ({
  ...planet,
  alive: false,
  hp: 0,
  deathReason: reason,
  pilotingDroneId: undefined,
});

const maybeSpawnBlackHole = (
  state: CombatSandboxState,
  blackHoleSpec: BlackHoleSpec,
): BlackHole | null => {
  if (state.elapsedSec < blackHoleSpec.spawnSec) {
    return null;
  }

  return {
    id: 9_001,
    kind: "blackHole",
    killRadius: blackHoleSpec.killRadius,
    mass: lerp(
      0,
      blackHoleSpec.mass,
      getBlackHoleCollapseAlpha(state.elapsedSec, blackHoleSpec),
    ),
    pos: { x: 0, y: 0 },
    radius: blackHoleSpec.killRadius,
    vel: { x: 0, y: 0 },
  };
};

const maybeFireRocket = (
  state: CombatSandboxState,
  planets: readonly CombatSandboxPlanet[],
): CombatSandboxRocket[] => {
  if (state.player.controlMode !== "planet") {
    return [];
  }

  const playerPlanet = findPlayerPlanet(planets, state.player.planetId);
  if (playerPlanet === null || !playerPlanet.alive) {
    return [];
  }

  if (hasActiveShield(state.player, state.tick)) {
    return [];
  }

  const rocketKind = state.player.selectedRocketKind;
  if (
    state.player.ammo[rocketKind] <= 0 ||
    state.tick < state.player.reloadUntilTick[rocketKind]
  ) {
    return [];
  }

  if (rocketKind === "seeker") {
    const lockStart = state.player.seekerLockAcquiredAtTick;
    if (lockStart === null || state.tick - lockStart < SEEKER_LOCK_TICKS) {
      return [];
    }
    state.player.seekerLockAcquiredAtTick = state.tick;
  }

  const aimDir = normalize(sub(state.player.aimWorld, playerPlanet.pos));
  if (len(aimDir) === 0) {
    return [];
  }

  const spec = ROCKET_SPECS[rocketKind];
  const visuals = ROCKET_VISUALS[rocketKind];
  const archetypeStats = getArchetypeStats(playerPlanet.archetype);
  const lockTarget =
    rocketKind === "seeker"
      ? findAliveTargetPlanet(
          planets,
          state.player.planetId,
          state.player.aimWorld,
        )
      : null;

  console.log(
    "[fire-debug] maybeFireRocket kind=",
    rocketKind,
    "tick=",
    state.tick,
    "ammoBefore=",
    state.player.ammo[rocketKind],
    "reloadUntilBefore=",
    state.player.reloadUntilTick[rocketKind],
  );
  state.player.ammo[rocketKind] -= 1;
  state.player.reloadUntilTick[rocketKind] =
    state.tick + weaponReloadTicks(rocketKind, playerPlanet.archetype);
  if (
    rocketKind === "light" &&
    state.player.ammo.light < ROCKET_SPECS.light.maxAmmo &&
    state.player.reloadUntilTick.light === 0
  ) {
    state.player.reloadUntilTick.light =
      state.tick + weaponReloadTicks("light", playerPlanet.archetype);
  }
  state.player.lockTargetId = lockTarget?.id ?? null;

  return [
    {
      id: state.nextEntityId,
      kind: "rocket",
      ownerId: playerPlanet.playerId,
      rocketKind,
      targetId: lockTarget?.id,
      ttlUntilTick: state.tick + rocketTtlTicks(rocketKind),
      pos: add(
        playerPlanet.pos,
        scale(aimDir, playerPlanet.radius + spec.radius + 10),
      ),
      vel: add(playerPlanet.vel, scale(aimDir, spec.speed)),
      radius: spec.radius,
      damage: spec.damage * archetypeStats.rocketDamageMultiplier,
      color: visuals.core,
      trailColor: visuals.trail,
      dragOnHit: archetypeStats.umbraDrag,
      turnRateMultiplier:
        rocketKind === "seeker" ? archetypeStats.seekerTurnRateMultiplier : 1,
    },
  ];
};

const stepCombatRocket = (
  rocket: CombatSandboxRocket,
  target: Pick<EntityBase, "pos"> | null,
  suns: readonly Sun[],
  blackHole: BlackHole | null,
): CombatSandboxRocket => {
  const turnRateOverride =
    rocket.rocketKind === "seeker"
      ? ROCKET_SPECS.seeker.turnRate * (rocket.turnRateMultiplier ?? 1)
      : 0;
  return stepSeeker(
    rocket,
    target,
    suns,
    FIXED_STEP_SEC,
    blackHole ?? undefined,
    turnRateOverride,
  );
};

const applyPlanetPairCollisions = (
  planets: CombatSandboxPlanet[],
  deathPlanetIds: Set<number>,
) => {
  for (let index = 0; index < planets.length; index += 1) {
    const planet = planets[index]!;
    if (!planet.alive) {
      continue;
    }

    for (
      let otherIndex = index + 1;
      otherIndex < planets.length;
      otherIndex += 1
    ) {
      const other = planets[otherIndex]!;
      if (!other.alive) {
        continue;
      }

      if (dist(planet.pos, other.pos) <= planet.radius + other.radius) {
        planets[index] = killPlanet(planet, "planetCollision");
        planets[otherIndex] = killPlanet(other, "planetCollision");
        deathPlanetIds.add(planet.id);
        deathPlanetIds.add(other.id);
      }
    }
  }
};

const markEnvironmentalPlanetDeaths = (
  planets: CombatSandboxPlanet[],
  suns: readonly Sun[],
  blackHole: BlackHole | null,
  deathPlanetIds: Set<number>,
  player: CombatSandboxPlayerState,
  tick: number,
) => {
  for (let index = 0; index < planets.length; index += 1) {
    const planet = planets[index]!;
    if (!planet.alive) {
      continue;
    }

    if (isPlanetInsideBlackHole(planet, blackHole)) {
      planets[index] = killPlanet(planet, "blackHole");
      deathPlanetIds.add(planet.id);
      continue;
    }

    for (const sun of suns) {
      if (
        dist(planet.pos, sun.pos) <= planet.radius + sun.radius &&
        !shieldProtectsImpact(planet, player, sun.pos, tick)
      ) {
        planets[index] = killPlanet(planet, "sunCollision");
        deathPlanetIds.add(planet.id);
        break;
      }
    }
  }
};

const stepDebris = (
  debris: readonly CombatSandboxDebris[],
  suns: readonly Sun[],
  blackHole: BlackHole | null,
  tick: number,
): CombatSandboxDebris[] =>
  debris
    .filter((piece) => piece.ttlUntilTick > tick)
    .map((piece) =>
      stepBody(piece, suns, FIXED_STEP_SEC, blackHole ?? undefined),
    );

const stepImpactBursts = (
  impactBursts: readonly CombatSandboxImpactBurst[],
  tick: number,
): CombatSandboxImpactBurst[] =>
  impactBursts.filter((burst) => burst.ttlUntilTick > tick);

const queueCacheRespawn = (
  cacheRespawnAtTicks: number[],
  readyAtTick: number,
) => {
  cacheRespawnAtTicks.push(readyAtTick);
  cacheRespawnAtTicks.sort((left, right) => left - right);
};

const applyCacheDelivery = (
  player: CombatSandboxPlayerState,
  planets: CombatSandboxPlanet[],
  contents: CacheContents,
) => {
  const playerPlanet = findPlayerPlanet(planets, player.planetId);
  if (playerPlanet === null) {
    return;
  }

  const maxBoostCharges = getBoostChargeCapacity(playerPlanet.archetype);

  switch (contents.kind) {
    case "heavyAmmo":
      player.ammo.heavy += 1;
      break;
    case "seekerPack":
      player.ammo.seeker += 2;
      break;
    case "repair":
      playerPlanet.hp = Math.min(PLANET_HP, playerPlanet.hp + REPAIR_AMOUNT);
      break;
    case "boostCharge":
      player.boostCharges = maxBoostCharges;
      player.nextBoostChargeAtTick = null;
      break;
    case "shieldExt":
      player.nextShieldExt = true;
      break;
    case "foresightExt":
      player.nextForesightExt = true;
      break;
    case "wildcard":
      player.wildcardSlot = contents.wildcard.kind;
      break;
  }
};

const applyImpulseAwayFromPoint = <T extends EntityBase>(
  bodies: T[],
  center: Vec2,
  radius: number,
  impulse: number,
  shouldApply: (body: T) => boolean = () => true,
) => {
  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index]!;
    if (!shouldApply(body)) {
      continue;
    }

    const delta = sub(body.pos, center);
    const distance = len(delta);
    if (distance === 0 || distance > radius) {
      continue;
    }

    const falloff = 1 - distance / radius;
    bodies[index] = {
      ...body,
      vel: add(body.vel, scale(normalize(delta), impulse * falloff)),
    };
  }
};

const findTeleportSwapTarget = (
  planets: readonly CombatSandboxPlanet[],
  playerPlanetId: number,
  aimDir: Vec2,
): CombatSandboxPlanet | null => {
  if (len(aimDir) === 0) {
    return null;
  }

  let bestTarget: CombatSandboxPlanet | null = null;
  let bestDot = TELEPORT_SWAP_MIN_DOT;
  let bestDistance = Number.POSITIVE_INFINITY;
  const playerPlanet = findPlayerPlanet(planets, playerPlanetId);
  if (playerPlanet === null) {
    return null;
  }

  for (const planet of planets) {
    if (!planet.alive || planet.id === playerPlanetId) {
      continue;
    }

    const dir = normalize(sub(planet.pos, playerPlanet.pos));
    const alignment = dot(aimDir, dir);
    if (alignment < TELEPORT_SWAP_MIN_DOT) {
      continue;
    }

    const distance = dist(playerPlanet.pos, planet.pos);
    if (
      alignment > bestDot + 0.001 ||
      (Math.abs(alignment - bestDot) <= 0.001 && distance < bestDistance)
    ) {
      bestTarget = planet;
      bestDot = alignment;
      bestDistance = distance;
    }
  }

  return bestTarget;
};

const activateWildcard = (
  wildcard: WildcardKind,
  planets: CombatSandboxPlanet[],
  rockets: CombatSandboxRocket[],
  drones: CombatSandboxDrone[],
  caches: CombatSandboxCache[],
  player: CombatSandboxPlayerState,
  aimWorld: Vec2,
  currentTick: number,
): boolean => {
  const playerPlanet = findPlayerPlanet(planets, player.planetId);
  if (playerPlanet === null || !playerPlanet.alive) {
    return false;
  }

  switch (wildcard) {
    case "gravityPulse":
      applyImpulseAwayFromPoint(
        planets,
        playerPlanet.pos,
        GRAVITY_PULSE_RADIUS,
        GRAVITY_PULSE_IMPULSE,
        (planet) => planet.alive,
      );
      applyImpulseAwayFromPoint(
        rockets,
        playerPlanet.pos,
        GRAVITY_PULSE_RADIUS,
        GRAVITY_PULSE_IMPULSE * 1.15,
      );
      applyImpulseAwayFromPoint(
        drones,
        playerPlanet.pos,
        GRAVITY_PULSE_RADIUS,
        GRAVITY_PULSE_IMPULSE * 0.95,
      );
      applyImpulseAwayFromPoint(
        caches,
        playerPlanet.pos,
        GRAVITY_PULSE_RADIUS,
        GRAVITY_PULSE_IMPULSE * 0.72,
      );
      return true;

    case "cloak":
      playerPlanet.hideTrailUntilTick = currentTick + CLOAK_DURATION_TICKS;
      return true;

    case "teleportSwap": {
      const aimDir = aimDirFromWorldTarget(playerPlanet, aimWorld);
      const target = findTeleportSwapTarget(planets, playerPlanet.id, aimDir);
      if (target === null) {
        return false;
      }

      const playerPos = { x: playerPlanet.pos.x, y: playerPlanet.pos.y };
      const playerVel = { x: playerPlanet.vel.x, y: playerPlanet.vel.y };

      playerPlanet.pos = { x: target.pos.x, y: target.pos.y };
      playerPlanet.vel = { x: target.vel.x, y: target.vel.y };
      target.pos = playerPos;
      target.vel = playerVel;
      return true;
    }
  }
};

const createDroneLaunch = (
  nextEntityId: number,
  playerPlanet: CombatSandboxPlanet,
  aimDir: Vec2,
  tick: number,
): CombatSandboxDrone => ({
  id: nextEntityId,
  kind: "drone",
  ownerId: playerPlanet.playerId,
  fuel: DRONE_SPEC.fuel,
  ttlUntilTick: tick + DRONE_TTL_TICKS,
  mode: "piloted",
  pos: add(
    playerPlanet.pos,
    scale(aimDir, playerPlanet.radius + DRONE_RADIUS + 10),
  ),
  vel: add(playerPlanet.vel, scale(aimDir, DRONE_LAUNCH_SPEED)),
  radius: DRONE_RADIUS,
});

const createDroneDebris = (
  tick: number,
  nextEntityId: number,
  drone: CombatSandboxDrone,
): CombatSandboxDebris[] =>
  createDebrisBurst(tick, nextEntityId, drone, {
    color: drone.cargo ? getCacheContentsColor(drone.cargo) : "#9ef3d0",
    pieces: DRONE_DEBRIS_PIECES,
    baseSpeed: DRONE_DEBRIS_BURST_SPEED,
    speedVariance: DRONE_DEBRIS_BURST_SPEED_VARIANCE,
  });

const createRocketDebris = (
  tick: number,
  nextEntityId: number,
  rocket: CombatSandboxRocket,
): CombatSandboxDebris[] =>
  createDebrisBurst(tick, nextEntityId, rocket, {
    color: rocket.color,
    pieces:
      rocket.rocketKind === "heavy"
        ? ROCKET_DEBRIS_PIECES_HEAVY
        : rocket.rocketKind === "light"
          ? ROCKET_DEBRIS_PIECES_LIGHT
          : ROCKET_DEBRIS_PIECES_SEEKER,
    baseSpeed: ROCKET_DEBRIS_BURST_SPEED,
    speedVariance: ROCKET_DEBRIS_BURST_SPEED_VARIANCE,
  });

const createCacheDebris = (
  tick: number,
  nextEntityId: number,
  cache: CombatSandboxCache,
): CombatSandboxDebris[] =>
  createDebrisBurst(tick, nextEntityId, cache, {
    color: getCacheContentsColor(cache.contents),
    pieces: CACHE_DEBRIS_PIECES,
    baseSpeed: CACHE_DEBRIS_BURST_SPEED,
    speedVariance: CACHE_DEBRIS_BURST_SPEED_VARIANCE,
  });

const stepDroneEntity = (
  drone: CombatSandboxDrone,
  ownerPlanet: CombatSandboxPlanet | null,
  player: CombatSandboxPlayerState,
  aimWorld: Vec2,
  burstRequested: boolean,
  suns: readonly Sun[],
  blackHole: BlackHole | null,
): CombatSandboxDrone => {
  let nextDrone = drone;
  const isPiloted =
    player.activeDroneId === drone.id && player.controlMode === "drone";
  let thrustDir: Vec2 | null = null;

  if (drone.mode === "return") {
    thrustDir =
      ownerPlanet === null || !ownerPlanet.alive
        ? null
        : aimDirFromWorldTarget(drone, ownerPlanet.pos, DEFAULT_AIM_DIR);
  } else if (isPiloted) {
    thrustDir = aimDirFromWorldTarget(drone, aimWorld, DEFAULT_AIM_DIR);
  }

  if (thrustDir !== null && len(thrustDir) > 0) {
    nextDrone = {
      ...nextDrone,
      vel: add(
        nextDrone.vel,
        scale(thrustDir, DRONE_SPEC.thrust * FIXED_STEP_SEC),
      ),
    };
  }

  if (burstRequested && isPiloted && nextDrone.fuel > 0) {
    const burstDir =
      thrustDir !== null && len(thrustDir) > 0
        ? thrustDir
        : aimDirFromWorldTarget(
            nextDrone,
            add(nextDrone.pos, nextDrone.vel),
            DEFAULT_AIM_DIR,
          );
    nextDrone = {
      ...nextDrone,
      fuel: nextDrone.fuel - 1,
      vel: add(nextDrone.vel, scale(burstDir, DRONE_SPEC.burstImpulse)),
    };
  }

  nextDrone = {
    ...nextDrone,
    vel: clampLen(nextDrone.vel, DRONE_SPEC.speed),
  };
  nextDrone = stepBody(nextDrone, suns, FIXED_STEP_SEC, blackHole ?? undefined);

  return {
    ...nextDrone,
    vel: clampLen(nextDrone.vel, DRONE_SPEC.speed),
  };
};

export const createSandboxState = (
  preset: OrbitPreset = DEFAULT_ORBIT_PRESET,
): CombatSandboxState => {
  const playerPlanetId = preset.planets[PLAYER_PLANET_INDEX]!.id;
  const planets = preset.planets.map((planetSeed, index) =>
    clonePlanetSeed(planetSeed, index, playerPlanetId),
  );
  const playerArchetype = planets[PLAYER_PLANET_INDEX]!.archetype;
  const rng = createSandboxRng(preset);
  const initialCaches = createInitialCaches(rng, nextRocketIdBase);

  return {
    tick: 0,
    elapsedSec: 0,
    preset,
    suns: preset.suns.map((sunSeed) => ({
      id: sunSeed.id,
      kind: "sun",
      mass: sunSeed.mass,
      radius: sunSeed.radius,
      pos: { x: sunSeed.pos.x, y: sunSeed.pos.y },
      vel: { x: sunSeed.vel.x, y: sunSeed.vel.y },
      swallowedAtSec: null,
    })),
    planets,
    rockets: [],
    drones: [],
    caches: initialCaches.caches,
    cacheRespawnAtTicks: [],
    debris: [],
    impactBursts: [],
    blackHole: null,
    player: {
      planetId: playerPlanetId,
      selectedRocketKind: "light",
      ammo: createInitialAmmo(),
      reloadUntilTick: {
        heavy: 0,
        light: 0,
        seeker: 0,
      },
      aimWorld: {
        x: planets[PLAYER_PLANET_INDEX]!.pos.x + 180,
        y: planets[PLAYER_PLANET_INDEX]!.pos.y,
      },
      lockTargetId: null,
      seekerLockAcquiredAtTick: null,
      foresightActiveUntilTick: 0,
      foresightCooldownUntilTick: 0,
      shieldAimDir: { x: DEFAULT_AIM_DIR.x, y: DEFAULT_AIM_DIR.y },
      shieldActiveUntilTick: 0,
      shieldCooldownUntilTick: 0,
      boostCharges: getBoostChargeCapacity(playerArchetype),
      nextBoostChargeAtTick: null,
      lastBoostTick: null,
      lastBoostAimDir: { x: DEFAULT_AIM_DIR.x, y: DEFAULT_AIM_DIR.y },
      droneCooldownUntilTick: 0,
      activeDroneId: null,
      controlMode: "planet",
      wildcardSlot: null,
      nextShieldExt: false,
      nextForesightExt: false,
    },
    nextEntityId: initialCaches.nextEntityId,
    playerLostAtSec: null,
    rng,
  };
};

export const stepSandbox = (
  state: CombatSandboxState,
  input: CombatSandboxStepInput,
  blackHoleSpec: BlackHoleSpec,
): CombatSandboxState => {
  const blackHole = maybeSpawnBlackHole(state, blackHoleSpec);
  const nextTick = state.tick + 1;
  const nextElapsedSec = state.elapsedSec + FIXED_STEP_SEC;
  const initialPlayerArchetypeId = getPlayerArchetypeId(
    state.planets,
    state.player.planetId,
  );
  const player = {
    ...state.player,
    aimWorld: { x: input.aimWorld.x, y: input.aimWorld.y },
    selectedRocketKind: input.selectedRocketKind,
  };
  refreshBoostCharges(
    player,
    state.tick,
    getBoostChargeCapacity(initialPlayerArchetypeId),
  );

  let planets = state.planets.map(clonePlanet);
  let rockets = state.rockets.map(cloneRocket);
  let drones = state.drones.map(cloneDrone);
  let caches = state.caches.map(cloneCache);
  const cacheRespawnAtTicks = [...state.cacheRespawnAtTicks];
  let nextEntityId = state.nextEntityId;
  const currentPlayerPlanet = findPlayerPlanet(planets, player.planetId);
  const currentPlayerArchetypeId =
    currentPlayerPlanet?.archetype ?? initialPlayerArchetypeId;
  const currentPlayerArchetype = getArchetypeStats(currentPlayerArchetypeId);
  const currentPlayerMaxBoostCharges = getBoostChargeCapacity(
    currentPlayerArchetypeId,
  );
  const currentAimDir = aimDirFromWorldTarget(
    currentPlayerPlanet,
    player.aimWorld,
    player.shieldAimDir,
  );
  const debrisBursts: CombatSandboxDebris[] = [];
  const impactBursts = stepImpactBursts(state.impactBursts, nextTick);

  const removeDrone = (
    droneId: number,
    mode: "dropCargo" | "delivery" | "cleanup",
  ) => {
    const drone = drones.find((item) => item.id === droneId) ?? null;
    if (drone === null) {
      return;
    }

    const nextDrones = drones.filter((item) => item.id !== droneId);
    drones = nextDrones;
    debrisBursts.push(...createDroneDebris(nextTick, nextEntityId, drone));
    nextEntityId += DRONE_DEBRIS_PIECES;

    if (mode === "dropCargo" && drone.cargo !== undefined) {
      caches.push(createDroppedCache(nextEntityId, drone, drone.cargo));
      nextEntityId += 1;
    }

    if (player.activeDroneId === droneId) {
      player.activeDroneId = null;
      player.controlMode = "planet";
    }
  };

  if (input.droneRecallRequested && player.activeDroneId !== null) {
    removeDrone(player.activeDroneId, "dropCargo");
  } else if (input.droneAutoReturnRequested && player.activeDroneId !== null) {
    const activeDrone = findActiveDrone(drones, player.activeDroneId);
    if (activeDrone !== null) {
      activeDrone.mode = "return";
      player.controlMode = "planet";
    }
  }

  if (
    input.droneLaunchRequested &&
    currentPlayerPlanet?.alive &&
    player.controlMode === "planet" &&
    player.activeDroneId === null &&
    state.tick >= player.droneCooldownUntilTick &&
    len(currentAimDir) > 0
  ) {
    const drone = createDroneLaunch(
      nextEntityId,
      currentPlayerPlanet,
      currentAimDir,
      state.tick,
    );
    drones.push(drone);
    player.activeDroneId = drone.id;
    player.controlMode = "drone";
    player.droneCooldownUntilTick = state.tick + DRONE_COOLDOWN_TICKS;
    nextEntityId += 1;
  }

  const playerPlanetBeforeStep = findPlayerPlanet(planets, player.planetId);
  if (playerPlanetBeforeStep !== null) {
    playerPlanetBeforeStep.pilotingDroneId =
      player.controlMode === "drone"
        ? (player.activeDroneId ?? undefined)
        : undefined;
  }

  if (
    input.foresightRequested &&
    player.controlMode === "planet" &&
    playerPlanetBeforeStep?.alive &&
    state.tick >= player.foresightCooldownUntilTick
  ) {
    const durationTicks = Math.max(
      1,
      Math.round(
        getForesightDurationTicks() *
          currentPlayerArchetype.foresightDurationMultiplier *
          (player.nextForesightExt ? FORESIGHT_EXT_MULTIPLIER : 1),
      ),
    );
    player.foresightActiveUntilTick = state.tick + durationTicks;
    player.foresightCooldownUntilTick =
      state.tick + getForesightCooldownTicks();
    player.nextForesightExt = false;
  }

  if (
    input.shieldRequested &&
    player.controlMode === "planet" &&
    playerPlanetBeforeStep?.alive
  ) {
    if (hasActiveShield(player, state.tick)) {
      player.shieldActiveUntilTick = state.tick;
    } else if (state.tick >= player.shieldCooldownUntilTick) {
      const durationTicks = Math.max(
        1,
        Math.round(
          getShieldDurationTicks() *
            currentPlayerArchetype.shieldDurationMultiplier *
            (player.nextShieldExt ? SHIELD_EXT_MULTIPLIER : 1),
        ),
      );
      player.shieldActiveUntilTick = state.tick + durationTicks;
      player.shieldCooldownUntilTick = state.tick + getShieldCooldownTicks();
      player.shieldAimDir = currentAimDir;
      player.nextShieldExt = false;
    }
  }

  if (
    input.wildcardRequested &&
    player.controlMode === "planet" &&
    playerPlanetBeforeStep?.alive &&
    player.wildcardSlot !== null
  ) {
    const wildcard = player.wildcardSlot;
    const consumed = activateWildcard(
      wildcard,
      planets,
      rockets,
      drones,
      caches,
      player,
      player.aimWorld,
      state.tick,
    );
    if (consumed) {
      player.wildcardSlot = null;
    }
  }

  const boostRequested =
    input.boostRequested &&
    player.controlMode === "planet" &&
    playerPlanetBeforeStep?.alive &&
    player.boostCharges > 0 &&
    len(currentAimDir) > 0;
  const boostAimDir = boostRequested ? currentAimDir : null;
  if (boostRequested && boostAimDir !== null) {
    player.boostCharges -= 1;
    player.lastBoostTick = nextTick;
    player.lastBoostAimDir = boostAimDir;
    if (
      player.boostCharges < currentPlayerMaxBoostCharges &&
      player.nextBoostChargeAtTick === null
    ) {
      player.nextBoostChargeAtTick = state.tick + getBoostRechargeTicks();
    }
  }

  const suns = stepCombatSuns(state.suns, blackHole, nextElapsedSec);
  const activeSuns = getActiveCombatSuns(suns);
  planets = planets.map((planet) => {
    if (!planet.alive) {
      return planet;
    }

    const debuffs = normalizePlanetDebuffs(planet.debuffs, state.tick);
    const boostedPlanet =
      boostAimDir !== null && planet.id === player.planetId
        ? {
            ...planet,
            debuffs,
            vel: add(
              planet.vel,
              scale(
                boostAimDir,
                BOOST_SPEC.magnitude *
                  currentPlayerArchetype.boostMagnitudeMultiplier,
              ),
            ),
          }
        : {
            ...planet,
            debuffs,
          };
    const dragActive = debuffs.dragUntilTick !== undefined;

    const steppedPlanet = stepBody(
      boostedPlanet,
      activeSuns,
      FIXED_STEP_SEC,
      blackHole ?? undefined,
    );

    return dragActive
      ? {
          ...steppedPlanet,
          vel: scale(steppedPlanet.vel, UMBRA_DRAG_STEP_MULTIPLIER),
        }
      : steppedPlanet;
  });
  const deathPlanetIds = new Set<number>();
  const steppedPlayerPlanet = findPlayerPlanet(planets, player.planetId);
  if (steppedPlayerPlanet?.alive) {
    steppedPlayerPlanet.pilotingDroneId =
      player.controlMode === "drone"
        ? (player.activeDroneId ?? undefined)
        : undefined;
    player.shieldAimDir = aimDirFromWorldTarget(
      steppedPlayerPlanet,
      player.aimWorld,
      player.shieldAimDir,
    );
  }

  markEnvironmentalPlanetDeaths(
    planets,
    activeSuns,
    blackHole,
    deathPlanetIds,
    player,
    nextTick,
  );
  applyPlanetPairCollisions(planets, deathPlanetIds);

  const nextLockTargetId =
    player.controlMode === "planet"
      ? (findAliveTargetPlanet(planets, player.planetId, player.aimWorld)?.id ??
        null)
      : null;
  if (nextLockTargetId === null) {
    player.seekerLockAcquiredAtTick = null;
  } else if (player.lockTargetId !== nextLockTargetId) {
    player.seekerLockAcquiredAtTick = nextTick;
  }
  player.lockTargetId = nextLockTargetId;

  addLightAmmoCharge(
    player.ammo,
    player.reloadUntilTick,
    nextTick,
    currentPlayerArchetypeId,
  );
  if (player.reloadUntilTick.heavy <= nextTick) {
    player.reloadUntilTick.heavy = 0;
  }
  if (player.reloadUntilTick.seeker <= nextTick) {
    player.reloadUntilTick.seeker = 0;
  }
  if (
    player.ammo.light >= ROCKET_SPECS.light.maxAmmo &&
    player.reloadUntilTick.light <= nextTick
  ) {
    player.reloadUntilTick.light = 0;
  }

  const stateForSpawn: CombatSandboxState = {
    ...state,
    tick: nextTick,
    elapsedSec: nextElapsedSec,
    suns,
    planets,
    rockets,
    drones,
    caches,
    cacheRespawnAtTicks,
    player,
    blackHole,
    debris: state.debris,
    impactBursts: state.impactBursts,
    nextEntityId,
  };
  const spawnedRockets = input.fireRequested
    ? maybeFireRocket(stateForSpawn, planets)
    : [];
  nextEntityId += spawnedRockets.length;

  rockets = [...rockets, ...spawnedRockets]
    .map((rocket) => {
      if (rocket.ttlUntilTick <= nextTick) {
        return null;
      }

      const target =
        rocket.targetId === undefined
          ? null
          : (planets.find(
              (planet) => planet.id === rocket.targetId && planet.alive,
            ) ?? null);
      return stepCombatRocket(rocket, target, activeSuns, blackHole);
    })
    .filter((rocket): rocket is CombatSandboxRocket => rocket !== null);

  drones = drones
    .map((drone) => {
      if (drone.ttlUntilTick <= nextTick) {
        removeDrone(drone.id, "dropCargo");
        return null;
      }

      const ownerPlanet = findOwnerPlanet(planets, drone.ownerId);
      return stepDroneEntity(
        drone,
        ownerPlanet,
        player,
        player.aimWorld,
        input.droneBurstRequested,
        activeSuns,
        blackHole,
      );
    })
    .filter((drone): drone is CombatSandboxDrone => drone !== null);

  caches = caches.map((cache) =>
    stepBodyWithGravityScale(
      cache,
      activeSuns,
      FIXED_STEP_SEC,
      CACHE_GRAVITY_SCALE,
      blackHole ?? undefined,
    ),
  );

  const survivingRockets: CombatSandboxRocket[] = [];
  const destroyedDroneModes = new Map<
    number,
    "dropCargo" | "delivery" | "cleanup"
  >();
  const destroyedCacheIds = new Set<number>();
  const scheduleDroneRemoval = (
    droneId: number,
    mode: "dropCargo" | "delivery" | "cleanup",
  ) => {
    const existing = destroyedDroneModes.get(droneId);
    if (
      existing === "dropCargo" ||
      (existing === "delivery" && mode === "cleanup")
    ) {
      return;
    }

    destroyedDroneModes.set(droneId, mode);
  };
  const emitRocketImpact = (rocket: CombatSandboxRocket) => {
    const burst = createRocketDebris(nextTick, nextEntityId, rocket);
    debrisBursts.push(...burst);
    nextEntityId += burst.length;
  };
  const emitPlanetImpact = (
    planet: CombatSandboxPlanet,
    rocket: CombatSandboxRocket,
  ) => {
    impactBursts.push(
      createPlanetImpactBurst(
        nextTick,
        nextEntityId,
        nextElapsedSec,
        planet,
        rocket,
        rocket.color,
      ),
    );
    nextEntityId += 1;
  };

  for (const rocket of rockets) {
    if (rocket.ttlUntilTick <= 0) {
      continue;
    }

    if (isEntityInsideBlackHole(rocket, blackHole)) {
      continue;
    }

    let consumed = false;

    for (const sun of activeSuns) {
      if (dist(rocket.pos, sun.pos) <= rocket.radius + sun.radius) {
        emitRocketImpact(rocket);
        consumed = true;
        break;
      }
    }
    if (consumed) {
      continue;
    }

    for (const drone of drones) {
      if (destroyedDroneModes.has(drone.id)) {
        continue;
      }

      if (dist(rocket.pos, drone.pos) <= rocket.radius + drone.radius) {
        emitRocketImpact(rocket);
        scheduleDroneRemoval(drone.id, "dropCargo");
        consumed = true;
        break;
      }
    }
    if (consumed) {
      continue;
    }

    for (const cache of caches) {
      if (destroyedCacheIds.has(cache.id)) {
        continue;
      }

      if (dist(rocket.pos, cache.pos) <= rocket.radius + cache.radius) {
        emitRocketImpact(rocket);
        destroyedCacheIds.add(cache.id);
        consumed = true;
        break;
      }
    }
    if (consumed) {
      continue;
    }

    for (let index = 0; index < planets.length; index += 1) {
      const planet = planets[index]!;
      if (!planet.alive || planet.playerId === rocket.ownerId) {
        continue;
      }

      if (
        dist(rocket.pos, planet.pos) <=
        rocket.radius + planet.radius * ROCKET_PLANET_IMPACT_RADIUS_MULTIPLIER
      ) {
        emitPlanetImpact(planet, rocket);
        if (shieldProtectsImpact(planet, player, rocket.pos, nextTick)) {
          emitRocketImpact(rocket);
          consumed = true;
          break;
        }

        emitRocketImpact(rocket);
        const hp = planet.hp - rocket.damage;
        const dragUntilTick = rocket.dragOnHit
          ? Math.max(
              planet.debuffs.dragUntilTick ?? 0,
              nextTick + UMBRA_DRAG_DURATION_TICKS,
            )
          : planet.debuffs.dragUntilTick;
        planets[index] =
          hp <= 0
            ? killPlanet(
                {
                  ...planet,
                  hp,
                },
                "rocket",
              )
            : {
                ...planet,
                debuffs:
                  dragUntilTick === undefined
                    ? planet.debuffs
                    : {
                        ...planet.debuffs,
                        dragUntilTick,
                      },
                hp,
              };

        if (hp <= 0) {
          deathPlanetIds.add(planet.id);
        }

        consumed = true;
        break;
      }
    }

    if (!consumed) {
      survivingRockets.push(rocket);
    }
  }
  rockets = survivingRockets;

  if (destroyedDroneModes.size > 0) {
    for (const [droneId, mode] of destroyedDroneModes) {
      removeDrone(droneId, mode);
    }
    destroyedDroneModes.clear();
  }

  if (destroyedCacheIds.size > 0) {
    const survivingCaches: CombatSandboxCache[] = [];

    for (const cache of caches) {
      if (!destroyedCacheIds.has(cache.id)) {
        survivingCaches.push(cache);
        continue;
      }

      debrisBursts.push(...createCacheDebris(nextTick, nextEntityId, cache));
      nextEntityId += CACHE_DEBRIS_PIECES;
      queueCacheRespawn(cacheRespawnAtTicks, nextTick + CACHE_RESPAWN_TICKS);
    }

    caches = survivingCaches;
  }

  const remainingCaches: CombatSandboxCache[] = [];
  const cacheIdsPickedUp = new Set<number>();

  for (const drone of drones) {
    if (isEntityInsideBlackHole(drone, blackHole)) {
      scheduleDroneRemoval(drone.id, "dropCargo");
      continue;
    }

    let destroyedBySunOrPlanet = false;

    for (const sun of activeSuns) {
      if (dist(drone.pos, sun.pos) <= drone.radius + sun.radius) {
        scheduleDroneRemoval(drone.id, "dropCargo");
        destroyedBySunOrPlanet = true;
        break;
      }
    }
    if (destroyedBySunOrPlanet) {
      continue;
    }

    for (const planet of planets) {
      if (!planet.alive) {
        continue;
      }

      if (dist(drone.pos, planet.pos) > drone.radius + planet.radius) {
        continue;
      }

      if (planet.playerId === drone.ownerId) {
        if (drone.cargo !== undefined) {
          applyCacheDelivery(player, planets, drone.cargo);
          scheduleDroneRemoval(drone.id, "delivery");
          destroyedBySunOrPlanet = true;
          break;
        }

        if (drone.mode === "return") {
          scheduleDroneRemoval(drone.id, "cleanup");
          destroyedBySunOrPlanet = true;
          break;
        }

        continue;
      }

      scheduleDroneRemoval(drone.id, "dropCargo");
      destroyedBySunOrPlanet = true;
      break;
    }
    if (destroyedBySunOrPlanet) {
      continue;
    }

    if (drone.cargo === undefined) {
      for (const cache of caches) {
        if (cacheIdsPickedUp.has(cache.id)) {
          continue;
        }

        if (dist(drone.pos, cache.pos) <= drone.radius + cache.radius) {
          drone.cargo = cloneCacheContents(cache.contents);
          cacheIdsPickedUp.add(cache.id);
          queueCacheRespawn(
            cacheRespawnAtTicks,
            nextTick + CACHE_RESPAWN_TICKS,
          );
          break;
        }
      }
    }
  }

  if (destroyedDroneModes.size > 0) {
    for (const [droneId, mode] of destroyedDroneModes) {
      removeDrone(droneId, mode);
    }
    destroyedDroneModes.clear();
  }

  for (const cache of caches) {
    if (cacheIdsPickedUp.has(cache.id)) {
      continue;
    }

    if (isEntityInsideBlackHole(cache, blackHole)) {
      debrisBursts.push(...createCacheDebris(nextTick, nextEntityId, cache));
      nextEntityId += CACHE_DEBRIS_PIECES;
      queueCacheRespawn(cacheRespawnAtTicks, nextTick + CACHE_RESPAWN_TICKS);
      continue;
    }

    let destroyed = false;
    let pickedUpByPlanet = false;

    for (const sun of activeSuns) {
      if (dist(cache.pos, sun.pos) <= cache.radius + sun.radius) {
        destroyed = true;
        break;
      }
    }
    if (!destroyed) {
      for (const planet of planets) {
        if (
          planet.alive &&
          dist(cache.pos, planet.pos) <= cache.radius + planet.radius
        ) {
          pickedUpByPlanet = true;
          if (planet.id === player.planetId) {
            applyCacheDelivery(player, planets, cache.contents);
          }
          cacheIdsPickedUp.add(cache.id);
          queueCacheRespawn(
            cacheRespawnAtTicks,
            nextTick + CACHE_RESPAWN_TICKS,
          );
          break;
        }
      }
    }

    if (pickedUpByPlanet) {
      continue;
    }

    if (destroyed) {
      debrisBursts.push(...createCacheDebris(nextTick, nextEntityId, cache));
      nextEntityId += CACHE_DEBRIS_PIECES;
      queueCacheRespawn(cacheRespawnAtTicks, nextTick + CACHE_RESPAWN_TICKS);
      continue;
    }

    remainingCaches.push(cache);
  }
  caches = remainingCaches;

  while (
    cacheRespawnAtTicks.length > 0 &&
    cacheRespawnAtTicks[0]! <= nextTick &&
    caches.length < CACHE_SPEC.count
  ) {
    cacheRespawnAtTicks.shift();
    caches.push(createOuterRingCache(state.rng, nextEntityId));
    nextEntityId += 1;
  }

  for (const planet of planets) {
    if (!deathPlanetIds.has(planet.id)) {
      continue;
    }

    const burst = createDebrisBurst(nextTick, nextEntityId, planet, {
      color: planet.color,
      pieces: DEBRIS_PIECES,
      baseSpeed: DEBRIS_BURST_SPEED,
      speedVariance: DEBRIS_BURST_SPEED_VARIANCE,
    });
    debrisBursts.push(...burst);
    nextEntityId += burst.length;
  }

  const debris = [
    ...stepDebris(state.debris, activeSuns, blackHole, nextTick),
    ...debrisBursts,
  ];
  const nextPlayerPlanet = findPlayerPlanet(planets, player.planetId);

  if (
    player.activeDroneId !== null &&
    findActiveDrone(drones, player.activeDroneId) === null
  ) {
    player.activeDroneId = null;
    player.controlMode = "planet";
    const playerPlanet = findPlayerPlanet(planets, player.planetId);
    if (playerPlanet !== null) {
      playerPlanet.pilotingDroneId = undefined;
    }
  }

  const playerLostAtSec =
    nextPlayerPlanet === null || !nextPlayerPlanet.alive
      ? (state.playerLostAtSec ?? nextElapsedSec)
      : null;

  return {
    tick: nextTick,
    elapsedSec: nextElapsedSec,
    preset: state.preset,
    suns,
    planets,
    rockets,
    drones,
    caches,
    cacheRespawnAtTicks,
    debris,
    impactBursts,
    blackHole,
    player,
    nextEntityId,
    playerLostAtSec,
    rng: state.rng,
  };
};

export const getSandboxResetReason = (
  state: CombatSandboxState,
): CombatResetReason | null => {
  if (
    state.blackHole === null &&
    findMinSunSunGap(getActiveCombatSuns(state.suns)) <= 0
  ) {
    return "sunCollision";
  }

  const alivePlanets = state.planets.filter((planet) => planet.alive).length;
  if (alivePlanets === 0) {
    return "allPlanetsLost";
  }

  if (
    state.playerLostAtSec !== null &&
    state.elapsedSec - state.playerLostAtSec >= PLAYER_LOST_RESET_DELAY_SEC
  ) {
    return "playerLost";
  }

  return null;
};

const interpolateEntity = <T extends EntityBase>(
  previousEntity: T | undefined,
  currentEntity: T,
  alpha: number,
): T =>
  previousEntity === undefined
    ? currentEntity
    : {
        ...currentEntity,
        pos: lerpVec2(previousEntity.pos, currentEntity.pos, alpha),
        vel: lerpVec2(previousEntity.vel, currentEntity.vel, alpha),
      };

export const interpolateSandboxState = (
  previousState: CombatSandboxState,
  currentState: CombatSandboxState,
  alpha: number,
): CombatSandboxState => {
  const previousRocketMap = new Map(
    previousState.rockets.map((rocket) => [rocket.id, rocket]),
  );
  const previousDroneMap = new Map(
    previousState.drones.map((drone) => [drone.id, drone]),
  );
  const previousCacheMap = new Map(
    previousState.caches.map((cache) => [cache.id, cache]),
  );
  const previousDebrisMap = new Map(
    previousState.debris.map((piece) => [piece.id, piece]),
  );

  return {
    ...currentState,
    elapsedSec: lerp(previousState.elapsedSec, currentState.elapsedSec, alpha),
    suns: currentState.suns.map((sun, index) => ({
      ...sun,
      pos: lerpVec2(previousState.suns[index]!.pos, sun.pos, alpha),
      vel: lerpVec2(previousState.suns[index]!.vel, sun.vel, alpha),
    })),
    planets: currentState.planets.map((planet, index) => {
      const previousPlanet = previousState.planets[index]!;

      return {
        ...planet,
        pos:
          previousPlanet.alive && planet.alive
            ? lerpVec2(previousPlanet.pos, planet.pos, alpha)
            : { x: planet.pos.x, y: planet.pos.y },
        vel:
          previousPlanet.alive && planet.alive
            ? lerpVec2(previousPlanet.vel, planet.vel, alpha)
            : { x: planet.vel.x, y: planet.vel.y },
      };
    }),
    rockets: currentState.rockets.map((rocket) =>
      interpolateEntity(previousRocketMap.get(rocket.id), rocket, alpha),
    ),
    drones: currentState.drones.map((drone) =>
      interpolateEntity(previousDroneMap.get(drone.id), drone, alpha),
    ),
    caches: currentState.caches.map((cache) =>
      interpolateEntity(previousCacheMap.get(cache.id), cache, alpha),
    ),
    debris: currentState.debris.map((piece) =>
      interpolateEntity(previousDebrisMap.get(piece.id), piece, alpha),
    ),
    impactBursts: currentState.impactBursts,
  };
};

export const getSandboxDebugSnapshot = (
  state: CombatSandboxState,
): CombatSandboxDebugSnapshot => {
  const activeSuns = getActiveCombatSuns(state.suns);
  const playerPlanet = findPlayerPlanet(state.planets, state.player.planetId);
  const lockTarget =
    state.player.lockTargetId === null
      ? null
      : (state.planets.find(
          (planet) => planet.id === state.player.lockTargetId,
        ) ?? null);
  const activeDrone = findActiveDrone(state.drones, state.player.activeDroneId);
  const droneCooldownRemainingSec =
    Math.max(0, state.player.droneCooldownUntilTick - state.tick) *
    FIXED_STEP_SEC;
  const droneMode =
    activeDrone !== null
      ? activeDrone.mode === "return"
        ? "return"
        : "piloting"
      : droneCooldownRemainingSec > 0
        ? "cooldown"
        : "ready";

  return {
    elapsedSec: state.elapsedSec,
    alivePlanets: state.planets.filter((planet) => planet.alive).length,
    minCurrentPlanetSunGap: findMinPlanetSunGap(state.planets, activeSuns),
    minCurrentSunSunGap: findMinSunSunGap(activeSuns),
    presetLabel: state.preset.label,
    playerArchetypeName:
      playerPlanet === null
        ? "--"
        : getArchetypeStats(playerPlanet.archetype).name,
    selectedRocketKind: state.player.selectedRocketKind,
    lockTargetLabel: lockTarget?.label ?? null,
    playerHp: Math.max(0, Math.round(playerPlanet?.hp ?? 0)),
    lightAmmo: state.player.ammo.light,
    heavyAmmo: state.player.ammo.heavy,
    seekerAmmo: state.player.ammo.seeker,
    blackHoleActive: state.blackHole !== null,
    cacheCount: state.caches.length,
    droneMode,
    droneCooldownRemainingSec,
    droneFuel: activeDrone?.fuel ?? null,
    droneCargoLabel:
      activeDrone?.cargo === undefined
        ? null
        : describeCacheContents(activeDrone.cargo),
    wildcardLabel:
      state.player.wildcardSlot === null
        ? null
        : describeWildcard(state.player.wildcardSlot),
  };
};
