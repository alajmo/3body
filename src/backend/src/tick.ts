import {
  ARCHETYPES,
  ARENA_BOUNDARY_SPEC,
  type ArchetypeId,
  absorbSunsIntoNeutronStars,
  add,
  advanceWorldOrbitStarMotion,
  BLACK_HOLE_SPEC,
  type BlackHole,
  BOOST_SPEC,
  CACHE_GRAVITY_SCALE,
  CACHE_RADIUS,
  CACHE_SPEC,
  type Cache,
  type CacheContents,
  clamp,
  consumeBlackHoleBodies,
  createBoundaryAsteroidSpawn,
  DEBRIS_TTL_SEC,
  type Debris,
  type DeltaSnapshotMsg,
  dist,
  dot,
  fromAngle,
  GRAVITY_PULSE_IMPULSE,
  GRAVITY_PULSE_RADIUS,
  getBaseShieldLoad,
  getBlackHoleKillRadiusAtTick,
  getBlackHoleMassAtTick,
  getBoundaryAsteroidDamage,
  getBoundaryAsteroidExplosionBaseSpeed,
  getBoundaryAsteroidExplosionPieces,
  getBoundaryAsteroidExplosionSpeedVariance,
  getBoundaryAsteroidImpactRadius,
  getUmbraDragDurationTicks,
  getUmbraDragStepMultiplier,
  hasSweptCircleOverlap,
  hasCrossedBlackHoleHorizon,
  len,
  MATCH_TIMERS,
  type NeutronStar,
  normalize,
  PLANET_HP,
  type PlanetPrivateState,
  type PlanetPublic,
  type PlayerId,
  REPAIR_AMOUNT,
  ROCKET_SPECS,
  type Rocket,
  type RocketKind,
  rollCacheContents,
  SHIELD_EXT_MULTIPLIER,
  SHIELD_SPEC,
  type SnapshotCacheUpdateRow,
  type SnapshotDebrisUpdateRow,
  type SnapshotEvent,
  type SnapshotNeutronStarUpdateRow,
  type SnapshotPlanetUpdateRow,
  type SnapshotRocketUpdateRow,
  type SnapshotSunUpdateRow,
  type SnapshotV2Msg,
  type Sun,
  sampleBoundaryAsteroidSpawnCount,
  sampleCacheSpawnKinematics,
  scale,
  shouldDespawnBoundaryAsteroid,
  SIM_HZ,
  stepBody,
  stepBodyWithGravityScale,
  stepNeutronStars,
  stepSeeker,
  stepSunsWithOrbitMotion,
  sub,
  type Vec2,
  type WildcardKind,
  type WorldOrbitStarMotion,
} from "@3body/shared";
import type { AppConfig } from "./config";
import type { RocketRuntimeState, Room } from "./room";

const TICK_MS_FLOOR = 1;
const MAX_TICK_CATCHUP_STEPS = 5;
const TIMER_EPSILON_MS = 0.001;
const DEFAULT_INPUT_DIR: Vec2 = { x: 1, y: 0 };
const PLANET_DEBRIS_PIECES = 20;
const PLANET_DEBRIS_SPEED = 220;
const PLANET_DEBRIS_SPEED_VARIANCE = 170;
const ROCKET_DEBRIS_PIECES = 6;
const ROCKET_DEBRIS_SPEED = 168;
const ROCKET_DEBRIS_SPEED_VARIANCE = 104;
const CACHE_DEBRIS_PIECES = 10;
const CACHE_DEBRIS_SPEED = 140;
const CACHE_DEBRIS_SPEED_VARIANCE = 92;
const BOUNDARY_ASTEROID_TIERS = ["micro", "small", "large"] as const;
const LAG_COMP_MAX_REWIND_MS = 100;
const ROCKET_OWNER_COLLISION_GRACE_MS = 75;
const NEAR_MISS_DISTANCE = 48;
const AUTHORITATIVE_BOT_ACTIONS_ENABLED = true;

interface RoomTickBroadcast {
  emitDeltaSnapshot: boolean;
  emitFullSnapshot: boolean;
}

const cooldownKeyByRocketKind = {
  light: "lightReloadUntilTick",
  heavy: "heavyReloadUntilTick",
  seeker: "seekerReloadUntilTick",
} as const satisfies Record<
  RocketKind,
  "lightReloadUntilTick" | "heavyReloadUntilTick" | "seekerReloadUntilTick"
>;

const getAbilityTicks = (durationSec: number, tickHz: number): number =>
  Math.max(1, Math.round(durationSec * tickHz));

const getBoostChargeCapacity = (archetypeId: ArchetypeId): number =>
  Math.max(1, BOOST_SPEC.charges + ARCHETYPES[archetypeId].boostChargeBonus);

const getBoostDrainDurationSec = (): number =>
  Math.max(1 / SIM_HZ, BOOST_SPEC.depleteSec);

const getBoostDrainAmount = (
  archetypeId: ArchetypeId,
  tickHz: number,
): number =>
  getBoostChargeCapacity(archetypeId) / getBoostDrainDurationSec() / tickHz;

const getBoostForceDurationSec = (
  archetypeId: ArchetypeId,
  boostLoadBurned: number,
): number =>
  boostLoadBurned /
  (getBoostChargeCapacity(archetypeId) / getBoostDrainDurationSec());

const getBoostRechargeAmount = (
  archetypeId: ArchetypeId,
  tickHz: number,
): number =>
  BOOST_SPEC.cooldownSec <= 0
    ? Number.POSITIVE_INFINITY
    : getBoostChargeCapacity(archetypeId) / (BOOST_SPEC.cooldownSec * tickHz);

const getCacheRespawnTicks = (tickHz: number): number =>
  getAbilityTicks(CACHE_SPEC.respawnSec, tickHz);

const weaponReloadTicks = (
  rocketKind: RocketKind,
  archetypeId: ArchetypeId,
  tickHz: number,
): number =>
  Math.max(
    1,
    Math.round(
      ROCKET_SPECS[rocketKind].reloadSec *
        ARCHETYPES[archetypeId].rocketReloadMultiplier *
        tickHz,
    ),
  );

const rocketTtlTicks = (rocketKind: RocketKind, tickHz: number): number =>
  Math.max(1, Math.round(ROCKET_SPECS[rocketKind].ttlSec * tickHz));

const blackHoleSpawnTick = (tickHz: number): number =>
  Math.max(1, Math.round(BLACK_HOLE_SPEC.spawnSec * tickHz));

const getBlackHoleBonusMass = (
  blackHole: BlackHole,
  tick: number,
  tickHz: number,
): number => Math.max(0, blackHole.mass - getBlackHoleMassAtTick(tick, tickHz));

const getBlackHoleBonusKillRadius = (
  blackHole: BlackHole,
  tick: number,
  tickHz: number,
): number =>
  Math.max(
    0,
    blackHole.killRadius - getBlackHoleKillRadiusAtTick(tick, tickHz),
  );

const lagCompMaxRewindTicks = (tickHz: number): number =>
  Math.max(0, Math.floor((LAG_COMP_MAX_REWIND_MS * tickHz) / 1000));

const lagCompHistoryEntries = (tickHz: number): number =>
  lagCompMaxRewindTicks(tickHz) + 2;

const rocketOwnerCollisionGraceTicks = (tickHz: number): number =>
  Math.max(1, Math.round((ROCKET_OWNER_COLLISION_GRACE_MS * tickHz) / 1000));

const shieldArcDotThreshold = (): number =>
  Math.cos(((SHIELD_SPEC.arcDeg / 2) * Math.PI) / 180);

const normalizeDir = (dir: Vec2, fallback: Vec2 = DEFAULT_INPUT_DIR): Vec2 => {
  const normalized = normalize(dir);
  return len(normalized) === 0 ? { ...fallback } : normalized;
};

const isInsideBlackHole = (
  body: { pos: Vec2; radius: number },
  blackHole: BlackHole | undefined,
): boolean => hasCrossedBlackHoleHorizon(body, blackHole);

const hasActiveShield = (planet: PlanetPublic, _tick: number): boolean =>
  planet.shieldActive && planet.shieldLoad > 0;

const shieldProtectsImpact = (
  planet: PlanetPublic,
  sourcePos: Vec2,
  tick: number,
): boolean => {
  if (!hasActiveShield(planet, tick)) {
    return false;
  }

  const shieldAimDir = normalize(planet.shieldAimDir);
  const hitDir = normalize(sub(sourcePos, planet.pos));
  if (len(shieldAimDir) === 0 || len(hitDir) === 0) {
    return false;
  }

  return dot(shieldAimDir, hitDir) >= shieldArcDotThreshold();
};

const applyShieldDamage = (
  planet: PlanetPublic,
  damage: number,
): PlanetPublic => {
  const nextShieldMaxLoad = Math.max(0, planet.shieldMaxLoad - damage);
  const nextShieldLoad = Math.min(
    nextShieldMaxLoad,
    Math.max(0, planet.shieldLoad - damage),
  );
  return {
    ...planet,
    shieldActive:
      planet.shieldActive && nextShieldLoad > 0 && nextShieldMaxLoad > 0,
    shieldLoad: nextShieldLoad,
    shieldMaxLoad: nextShieldMaxLoad,
  };
};

const getShieldDrainAmount = (tickHz: number): number =>
  SHIELD_SPEC.durationSec <= 0
    ? getBaseShieldLoad()
    : getBaseShieldLoad() / (SHIELD_SPEC.durationSec * tickHz);

const findPlanetIndexByPlayerId = (
  planets: readonly PlanetPublic[],
  playerId: PlayerId,
): number => planets.findIndex((planet) => planet.playerId === playerId);

const queueCacheRespawn = (room: Room, readyAtTick: number): void => {
  room.cacheRespawnAtTicks.push(readyAtTick);
  room.cacheRespawnAtTicks.sort((left, right) => left - right);
};

const createDebrisBurst = (
  room: Room,
  source: Pick<PlanetPublic | Rocket | Cache | Debris, "pos" | "vel">,
  pieces: number,
  baseSpeed: number,
  speedVariance: number,
  tick: number,
  tickHz: number,
  ownerPlayerId?: PlayerId,
): Debris[] => {
  const ttlUntilTick = tick + getAbilityTicks(DEBRIS_TTL_SEC, tickHz);
  const debris: Debris[] = [];

  for (let index = 0; index < pieces; index += 1) {
    const angle = (index / pieces) * Math.PI * 2 + tick * 0.137;
    const speed =
      baseSpeed + speedVariance * Math.sin(tick * 0.23 + index * 1.91);
    debris.push({
      id: room.entityIds.nextEntityId(),
      kind: "debris",
      ownerPlayerId,
      pos: { x: source.pos.x, y: source.pos.y },
      vel: add(source.vel, scale(fromAngle(angle), speed)),
      radius: 5 + ((index % 3) + 1) * 1.2,
      ttlUntilTick,
    });
  }

  return debris;
};

const isBoundaryAsteroidDebris = (
  piece: Debris,
): piece is Debris & {
  asteroidTier: (typeof BOUNDARY_ASTEROID_TIERS)[number];
} => piece.asteroidTier !== undefined;

const createBoundaryAsteroidDebris = (
  room: Room,
  tick: number,
  arenaRadius: number,
  dtSec: number,
  tier: (typeof BOUNDARY_ASTEROID_TIERS)[number],
): Debris => {
  const spawn = createBoundaryAsteroidSpawn({
    arenaRadius,
    rng: room.rng,
    tier,
  });

  return {
    asteroidTier: spawn.asteroidTier,
    id: room.entityIds.nextEntityId(),
    kind: "debris",
    ownerPlayerId: undefined,
    pos: spawn.pos,
    radius: spawn.radius,
    ttlUntilTick: tick + Math.max(1, Math.round(spawn.ttlSec / dtSec)),
    vel: spawn.vel,
  };
};

const spawnBoundaryAsteroidDebris = (
  room: Room,
  tick: number,
  dtSec: number,
): Debris[] => {
  const arenaRadius = room.world?.arenaRadius ?? 0;
  if (arenaRadius <= 0) {
    return [];
  }

  const debris: Debris[] = [];
  for (const tier of BOUNDARY_ASTEROID_TIERS) {
    const spawnCount = sampleBoundaryAsteroidSpawnCount({
      dtSec,
      rng: room.rng,
      tier,
    });
    for (let index = 0; index < spawnCount; index += 1) {
      debris.push(
        createBoundaryAsteroidDebris(room, tick, arenaRadius, dtSec, tier),
      );
    }
  }

  return debris;
};

const createCache = (room: Room): Cache => {
  const arenaRadius = room.world?.arenaRadius ?? undefined;
  const spawn = sampleCacheSpawnKinematics({ arenaRadius, rng: room.rng });

  return {
    id: room.entityIds.nextEntityId(),
    kind: "cache",
    contents: rollCacheContents(room.rng),
    pos: spawn.pos,
    vel: spawn.vel,
    radius: CACHE_RADIUS,
  };
};

const diffEntityCollection = <T extends { id: number }>(
  previous: readonly T[],
  current: readonly T[],
): { changed?: T[]; removed?: number[] } => {
  const previousById = new Map<number, T>();
  for (const entity of previous) {
    previousById.set(entity.id, entity);
  }

  const currentIds = new Set<number>();
  const changed: T[] = [];
  const removed: number[] = [];

  for (const entity of current) {
    currentIds.add(entity.id);
    const previousEntity = previousById.get(entity.id);
    if (previousEntity === undefined || previousEntity !== entity) {
      changed.push(entity);
    }
  }

  for (const entity of previous) {
    if (!currentIds.has(entity.id)) {
      removed.push(entity.id);
    }
  }

  return {
    ...(changed.length > 0 ? { changed } : {}),
    ...(removed.length > 0 ? { removed } : {}),
  };
};

interface CompactEntityDiff<T, TRow extends readonly [number, ...unknown[]]> {
  removed?: number[];
  spawns?: T[];
  updates?: TRow[];
}

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const sameVec2 = (left: Vec2, right: Vec2): boolean =>
  left.x === right.x && left.y === right.y;

const sameBlackHole = (
  left: BlackHole | null,
  right: BlackHole | null,
): boolean =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.id === right.id &&
    left.kind === right.kind &&
    left.mass === right.mass &&
    left.radius === right.radius &&
    left.killRadius === right.killRadius &&
    sameVec2(left.pos, right.pos) &&
    sameVec2(left.vel, right.vel));

const sameCacheContents = (
  left: CacheContents,
  right: CacheContents,
): boolean => {
  if (left === right) {
    return true;
  }
  if (left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case "wildcard":
      return (
        right.kind === "wildcard" && left.wildcard.kind === right.wildcard.kind
      );
    case "heavyAmmo":
    case "repair":
    case "seekerPack":
    case "shieldExt":
      return true;
  }
};

const sameOrbitStarMotion = (
  left: WorldOrbitStarMotion | null,
  right: WorldOrbitStarMotion | null,
): boolean =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.mode === right.mode &&
    left.elapsedSec === right.elapsedSec &&
    left.patternId === right.patternId &&
    left.speed === right.speed &&
    left.baseDistanceScale === right.baseDistanceScale &&
    left.distanceScale === right.distanceScale &&
    left.sunIds[0] === right.sunIds[0] &&
    left.sunIds[1] === right.sunIds[1] &&
    left.sunIds[2] === right.sunIds[2]);

const sameSnapshotRowValue = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }

  if (
    (typeof left === "object" && left !== null) ||
    (typeof right === "object" && right !== null)
  ) {
    return sameJson(left, right);
  }

  return false;
};

const rowChanged = <TRow extends readonly [number, ...unknown[]]>(
  previous: TRow,
  current: TRow,
): boolean => {
  if (previous.length !== current.length) {
    return true;
  }

  for (let index = 0; index < current.length; index += 1) {
    if (!sameSnapshotRowValue(previous[index], current[index])) {
      return true;
    }
  }

  return false;
};

const diffCompactEntityCollection = <
  T extends { id: number },
  TRow extends readonly [number, ...unknown[]],
>(
  previous: readonly T[],
  current: readonly T[],
  options: {
    hasStaticChanged: (previous: T, current: T) => boolean;
    hasUpdateChanged?: (previous: T, current: T) => boolean;
    toUpdateRow: (entity: T) => TRow;
  },
): CompactEntityDiff<T, TRow> => {
  const previousById = new Map<number, T>();
  for (const entity of previous) {
    previousById.set(entity.id, entity);
  }

  const currentIds = new Set<number>();
  const spawns: T[] = [];
  const updates: TRow[] = [];
  const removed: number[] = [];

  for (const entity of current) {
    currentIds.add(entity.id);
    const previousEntity = previousById.get(entity.id);
    if (
      previousEntity === undefined ||
      options.hasStaticChanged(previousEntity, entity)
    ) {
      spawns.push(entity);
      continue;
    }

    const updateChanged =
      options.hasUpdateChanged?.(previousEntity, entity) ??
      rowChanged(
        options.toUpdateRow(previousEntity),
        options.toUpdateRow(entity),
      );
    if (updateChanged) {
      updates.push(options.toUpdateRow(entity));
    }
  }

  for (const entity of previous) {
    if (!currentIds.has(entity.id)) {
      removed.push(entity.id);
    }
  }

  return {
    ...(removed.length > 0 ? { removed } : {}),
    ...(spawns.length > 0 ? { spawns } : {}),
    ...(updates.length > 0 ? { updates } : {}),
  };
};

const sunUpdateRow = (sun: Sun): SnapshotSunUpdateRow => [
  sun.id,
  sun.pos.x,
  sun.pos.y,
  sun.vel.x,
  sun.vel.y,
  sun.mass,
  sun.radius,
];

const neutronStarUpdateRow = (
  neutronStar: NeutronStar,
): SnapshotNeutronStarUpdateRow => [
  neutronStar.id,
  neutronStar.pos.x,
  neutronStar.pos.y,
  neutronStar.vel.x,
  neutronStar.vel.y,
  neutronStar.mass,
  neutronStar.radius,
];

const planetUpdateRow = (planet: PlanetPublic): SnapshotPlanetUpdateRow => [
  planet.id,
  planet.pos.x,
  planet.pos.y,
  planet.vel.x,
  planet.vel.y,
  planet.hp,
  planet.shieldAimDir.x,
  planet.shieldAimDir.y,
  planet.shieldActive ? 1 : 0,
  planet.shieldLoad,
  planet.shieldMaxLoad,
  planet.debuffs,
  planet.invulnerableUntilTick ?? 0,
];

const rocketUpdateRow = (rocket: Rocket): SnapshotRocketUpdateRow => [
  rocket.id,
  rocket.pos.x,
  rocket.pos.y,
  rocket.vel.x,
  rocket.vel.y,
  rocket.ttlUntilTick,
];

const cacheUpdateRow = (cache: Cache): SnapshotCacheUpdateRow => [
  cache.id,
  cache.pos.x,
  cache.pos.y,
  cache.vel.x,
  cache.vel.y,
];

const debrisUpdateRow = (debris: Debris): SnapshotDebrisUpdateRow => [
  debris.id,
  debris.pos.x,
  debris.pos.y,
  debris.vel.x,
  debris.vel.y,
  debris.ttlUntilTick,
];

const hasSunUpdateChanged = (previous: Sun, current: Sun): boolean =>
  !sameVec2(previous.pos, current.pos) ||
  !sameVec2(previous.vel, current.vel) ||
  previous.mass !== current.mass ||
  previous.radius !== current.radius;

const hasNeutronStarUpdateChanged = (
  previous: NeutronStar,
  current: NeutronStar,
): boolean =>
  !sameVec2(previous.pos, current.pos) ||
  !sameVec2(previous.vel, current.vel) ||
  previous.mass !== current.mass ||
  previous.radius !== current.radius;

const hasPlanetUpdateChanged = (
  previous: PlanetPublic,
  current: PlanetPublic,
): boolean =>
  !sameVec2(previous.pos, current.pos) ||
  !sameVec2(previous.vel, current.vel) ||
  previous.hp !== current.hp ||
  !sameVec2(previous.shieldAimDir, current.shieldAimDir) ||
  previous.shieldActive !== current.shieldActive ||
  previous.shieldLoad !== current.shieldLoad ||
  previous.shieldMaxLoad !== current.shieldMaxLoad ||
  previous.debuffs.dragUntilTick !== current.debuffs.dragUntilTick ||
  (previous.invulnerableUntilTick ?? 0) !==
    (current.invulnerableUntilTick ?? 0);

const hasRocketUpdateChanged = (previous: Rocket, current: Rocket): boolean =>
  !sameVec2(previous.pos, current.pos) ||
  !sameVec2(previous.vel, current.vel) ||
  previous.ttlUntilTick !== current.ttlUntilTick;

const hasCacheUpdateChanged = (previous: Cache, current: Cache): boolean =>
  !sameVec2(previous.pos, current.pos) || !sameVec2(previous.vel, current.vel);

const hasDebrisUpdateChanged = (previous: Debris, current: Debris): boolean =>
  !sameVec2(previous.pos, current.pos) ||
  !sameVec2(previous.vel, current.vel) ||
  previous.ttlUntilTick !== current.ttlUntilTick;

const hasSunStaticChanged = (previous: Sun, current: Sun): boolean =>
  previous.kind !== current.kind;

const hasNeutronStarStaticChanged = (
  previous: NeutronStar,
  current: NeutronStar,
): boolean => previous.kind !== current.kind;

const hasPlanetStaticChanged = (
  previous: PlanetPublic,
  current: PlanetPublic,
): boolean =>
  previous.kind !== current.kind ||
  previous.playerId !== current.playerId ||
  previous.archetype !== current.archetype ||
  previous.radius !== current.radius;

const hasRocketStaticChanged = (previous: Rocket, current: Rocket): boolean =>
  previous.kind !== current.kind ||
  previous.radius !== current.radius ||
  previous.rocketKind !== current.rocketKind ||
  previous.ownerId !== current.ownerId ||
  previous.targetId !== current.targetId;

const hasCacheStaticChanged = (previous: Cache, current: Cache): boolean =>
  previous.kind !== current.kind ||
  previous.radius !== current.radius ||
  !sameCacheContents(previous.contents, current.contents);

const hasDebrisStaticChanged = (previous: Debris, current: Debris): boolean =>
  previous.kind !== current.kind ||
  previous.radius !== current.radius ||
  previous.ownerPlayerId !== current.ownerPlayerId ||
  previous.asteroidTier !== current.asteroidTier;

const getRocketRuntime = (room: Room, rocket: Rocket): RocketRuntimeState => {
  const existing = room.rocketRuntime.get(rocket.id);
  if (existing) {
    return existing;
  }

  const runtime: RocketRuntimeState = {
    damage: ROCKET_SPECS[rocket.rocketKind].damage,
    dragOnHit: false,
    turnRateMultiplier: 1,
    spawnedAtTick: Math.max(0, room.tick - 1),
    nearMissedPlayerIds: new Set<PlayerId>(),
  };
  room.rocketRuntime.set(rocket.id, runtime);
  return runtime;
};

const queueKillEvent = (
  room: Room,
  tick: number,
  planet: PlanetPublic,
  cause: Extract<SnapshotEvent, { kind: "kill" }>["cause"],
  killerPlayerId?: PlayerId,
): void => {
  room.queueEvent({
    kind: "kill",
    tick,
    victimPlayerId: planet.playerId,
    victimPlanetId: planet.id,
    killerPlayerId,
    cause,
  });
};

const markPlayerDeath = (
  room: Room,
  playerId: PlayerId,
  tick: number,
): void => {
  room.markPlayerDeath(playerId, tick);
};

const isPlanetInvulnerable = (
  planet: Pick<PlanetPublic, "invulnerableUntilTick">,
  tick: number,
): boolean => (planet.invulnerableUntilTick ?? 0) > tick;

const refreshBoostLoad = (
  privateState: PlanetPrivateState,
  archetypeId: ArchetypeId,
  tickHz: number,
): void => {
  const maxBoostLoad = getBoostChargeCapacity(archetypeId);
  if (privateState.boostCharges >= maxBoostLoad) {
    privateState.boostCharges = maxBoostLoad;
    privateState.cooldowns.nextBoostChargeAtTick = undefined;
    return;
  }

  privateState.boostCharges = Math.min(
    maxBoostLoad,
    privateState.boostCharges + getBoostRechargeAmount(archetypeId, tickHz),
  );
  privateState.cooldowns.nextBoostChargeAtTick =
    privateState.boostCharges >= maxBoostLoad ? undefined : 0;
};

const spawnRocket = (
  room: Room,
  playerId: PlayerId,
  rocketKind: RocketKind,
  aimDir: Vec2,
  targetId: number | undefined,
  clientTick: number,
  tickHz: number,
): void => {
  if (!room.world) {
    return;
  }

  const planetIndex = findPlanetIndexByPlayerId(room.world.planets, playerId);
  if (planetIndex < 0) {
    return;
  }

  const planet = room.world.planets[planetIndex]!;
  const privateState = room.privateStates.get(playerId);
  if (!privateState || hasActiveShield(planet, room.tick)) {
    return;
  }

  const cooldownKey = cooldownKeyByRocketKind[rocketKind];
  if (
    privateState.ammo[rocketKind] <= 0 ||
    room.tick < privateState.cooldowns[cooldownKey]
  ) {
    return;
  }

  const normalizedAimDir = normalizeDir(aimDir);
  const archetype = ARCHETYPES[planet.archetype];
  const oldestAllowedTick = Math.max(
    0,
    room.tick - lagCompMaxRewindTicks(tickHz),
  );
  const rewindTick = clamp(
    Math.trunc(clientTick),
    oldestAllowedTick,
    room.tick,
  );
  const launchSample = room.planetPositionAtOrBefore(planet.id, rewindTick);
  const launchPos = launchSample?.pos ?? planet.pos;
  const launchVel = launchSample?.vel ?? planet.vel;
  const targetPlanet =
    rocketKind === "seeker" && targetId !== undefined
      ? targetId === planet.id
        ? null
        : room.planetPositionAtOrBefore(targetId, rewindTick) !== null
          ? targetId
          : undefined
      : null;

  privateState.ammo[rocketKind] -= 1;
  privateState.cooldowns[cooldownKey] =
    room.tick + weaponReloadTicks(rocketKind, planet.archetype, tickHz);

  if (
    rocketKind === "light" &&
    privateState.ammo.light < ROCKET_SPECS.light.maxAmmo &&
    privateState.cooldowns.lightReloadUntilTick === 0
  ) {
    privateState.cooldowns.lightReloadUntilTick =
      room.tick + weaponReloadTicks("light", planet.archetype, tickHz);
  }

  const spec = ROCKET_SPECS[rocketKind];
  const rocket: Rocket = {
    id: room.entityIds.nextEntityId(),
    kind: "rocket",
    ownerId: playerId,
    rocketKind,
    targetId: targetPlanet ?? undefined,
    ttlUntilTick: room.tick + rocketTtlTicks(rocketKind, tickHz),
    pos: add(
      launchPos,
      scale(normalizedAimDir, planet.radius + spec.radius + 10),
    ),
    vel: add(launchVel, scale(normalizedAimDir, spec.speed)),
    radius: spec.radius,
  };

  room.world.rockets.push(rocket);
  room.rocketRuntime.set(rocket.id, {
    damage: spec.damage * archetype.rocketDamageMultiplier,
    dragOnHit: archetype.umbraDrag,
    turnRateMultiplier:
      rocketKind === "seeker" ? archetype.seekerTurnRateMultiplier : 1,
    spawnedAtTick: room.tick,
    nearMissedPlayerIds: new Set<PlayerId>(),
  });
};

const applyImpulseAwayFromPoint = <T extends { pos: Vec2; vel: Vec2 }>(
  bodies: T[],
  center: Vec2,
  radius: number,
  impulse: number,
  shouldApply: (body: T) => boolean = () => true,
): void => {
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

const activateWildcard = (
  room: Room,
  playerId: PlayerId,
  _wildcard: WildcardKind,
): boolean => {
  if (!room.world) {
    return false;
  }

  const planetIndex = findPlanetIndexByPlayerId(room.world.planets, playerId);
  if (planetIndex < 0) {
    return false;
  }

  const playerPlanet = room.world.planets[planetIndex]!;

  applyImpulseAwayFromPoint(
    room.world.planets,
    playerPlanet.pos,
    GRAVITY_PULSE_RADIUS,
    GRAVITY_PULSE_IMPULSE,
  );
  applyImpulseAwayFromPoint(
    room.world.rockets,
    playerPlanet.pos,
    GRAVITY_PULSE_RADIUS,
    GRAVITY_PULSE_IMPULSE * 1.15,
  );
  applyImpulseAwayFromPoint(
    room.world.debris,
    playerPlanet.pos,
    GRAVITY_PULSE_RADIUS,
    GRAVITY_PULSE_IMPULSE,
    isBoundaryAsteroidDebris,
  );
  applyImpulseAwayFromPoint(
    room.world.caches,
    playerPlanet.pos,
    GRAVITY_PULSE_RADIUS,
    GRAVITY_PULSE_IMPULSE * 0.72,
  );
  return true;
};

const consumeHeldWildcard = (
  privateState: PlanetPrivateState,
  _wildcard: WildcardKind,
): boolean => {
  if (!privateState.gravityPulseHeld) {
    return false;
  }

  privateState.gravityPulseHeld = false;
  return true;
};

const applyAbilityMessage = (
  room: Room,
  playerId: PlayerId,
  slot: "q" | "w" | "g",
  aimDir: Vec2 | undefined,
): void => {
  if (!room.world) {
    return;
  }

  const planetIndex = findPlanetIndexByPlayerId(room.world.planets, playerId);
  if (planetIndex < 0) {
    return;
  }

  const planet = room.world.planets[planetIndex]!;
  const privateState = room.privateStates.get(playerId);
  if (!privateState) {
    return;
  }

  const intent = room.intentFor(playerId);
  const resolvedAimDir = normalizeDir(
    aimDir ?? (slot === "w" ? intent.shieldAimDir : intent.mouseDir),
    intent.mouseDir,
  );

  switch (slot) {
    case "q": {
      if (hasActiveShield(planet, room.tick)) {
        room.world.planets[planetIndex] = {
          ...planet,
          shieldActive: false,
        };
        return;
      }
      if (planet.shieldLoad <= 0) {
        return;
      }
      const activatedMaxLoad = privateState.nextShieldExt
        ? planet.shieldMaxLoad * SHIELD_EXT_MULTIPLIER
        : planet.shieldMaxLoad;
      const activatedLoad = privateState.nextShieldExt
        ? Math.min(
            activatedMaxLoad,
            planet.shieldLoad + (activatedMaxLoad - planet.shieldMaxLoad),
          )
        : Math.min(planet.shieldLoad, activatedMaxLoad);
      intent.shieldAimDir = { ...resolvedAimDir };
      room.world.planets[planetIndex] = {
        ...planet,
        shieldAimDir: { ...resolvedAimDir },
        shieldActive: activatedLoad > 0,
        shieldLoad: activatedLoad,
        shieldMaxLoad: activatedMaxLoad,
      };
      privateState.nextShieldExt = false;
      return;
    }

    case "w": {
      if (privateState.boostCharges <= 0) {
        return;
      }

      intent.mouseDir = { ...resolvedAimDir };
      intent.boostHeld = true;
      return;
    }

    case "g":
      if (!consumeHeldWildcard(privateState, "gravityPulse")) {
        return;
      }

      if (activateWildcard(room, playerId, "gravityPulse")) {
        room.queueEvent({
          kind: "wildcardUse",
          tick: room.tick,
          playerId,
          wildcard: "gravityPulse",
        });
      } else {
        privateState.gravityPulseHeld = true;
      }
      return;
  }
};

const applyCachePickup = (
  room: Room,
  playerId: PlayerId,
  planetId: number,
  privateState: PlanetPrivateState,
  planet: PlanetPublic,
  contents: CacheContents,
  tick: number,
): PlanetPublic => {
  let nextPlanet = planet;

  switch (contents.kind) {
    case "heavyAmmo":
      privateState.ammo.heavy += 1;
      break;
    case "seekerPack":
      privateState.ammo.seeker += 2;
      break;
    case "repair":
      nextPlanet = {
        ...planet,
        hp: Math.min(PLANET_HP, planet.hp + REPAIR_AMOUNT),
      };
      break;
    case "shieldExt":
      privateState.nextShieldExt = true;
      break;
    case "wildcard":
      privateState.gravityPulseHeld = true;
      break;
  }

  room.queueEvent({
    kind: "cachePickup",
    tick,
    playerId,
    planetId,
    contents,
  });

  return nextPlanet;
};

const syncBlackHole = (room: Room, nextTick: number, tickHz: number): void => {
  if (!room.world) {
    return;
  }

  if (nextTick < blackHoleSpawnTick(tickHz)) {
    return;
  }

  const mass = getBlackHoleMassAtTick(nextTick, tickHz);
  const killRadius = getBlackHoleKillRadiusAtTick(nextTick, tickHz);
  const previousBlackHole = room.world.blackHole;

  if (!previousBlackHole) {
    const blackHole: BlackHole = {
      id: room.entityIds.nextEntityId(),
      kind: "blackHole",
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      radius: killRadius,
      killRadius,
      mass,
    };
    room.world.blackHole = blackHole;
    room.queueEvent({
      kind: "blackHoleSpawn",
      tick: nextTick,
      blackHoleId: blackHole.id,
    });
    return;
  }

  const bonusMass = getBlackHoleBonusMass(previousBlackHole, room.tick, tickHz);
  const bonusKillRadius = getBlackHoleBonusKillRadius(
    previousBlackHole,
    room.tick,
    tickHz,
  );

  room.world.blackHole = {
    ...previousBlackHole,
    mass: mass + bonusMass,
    radius: killRadius + bonusKillRadius,
    killRadius: killRadius + bonusKillRadius,
  };
};

const applyQueuedCombatMessages = (room: Room, config: AppConfig): void => {
  if (!room.world) {
    room.drainCombatMessages();
    return;
  }

  for (const message of room.drainCombatMessages()) {
    const intent = room.intentFor(message.playerId);

    switch (message.type) {
      case "input":
        if (message.clientTick < intent.lastInputClientTick) {
          continue;
        }
        intent.lastInputClientTick = message.clientTick;
        intent.mouseDir = normalizeDir(message.mouseDir, intent.mouseDir);
        intent.boostHeld = message.boostHeld === true;
        break;

      case "shieldAim": {
        intent.shieldAimDir = normalizeDir(message.dir, intent.shieldAimDir);
        const planetIndex = findPlanetIndexByPlayerId(
          room.world.planets,
          message.playerId,
        );
        if (planetIndex >= 0) {
          room.world.planets[planetIndex] = {
            ...room.world.planets[planetIndex]!,
            shieldAimDir: { ...intent.shieldAimDir },
          };
        }
        break;
      }

      case "fireRocket":
        if (message.clientTick >= intent.lastInputClientTick) {
          intent.lastInputClientTick = message.clientTick;
          intent.mouseDir = normalizeDir(message.aimDir, intent.mouseDir);
        }
        spawnRocket(
          room,
          message.playerId,
          message.kind,
          message.aimDir,
          message.targetId,
          message.clientTick,
          config.tickHz,
        );
        break;

      case "ability":
        applyAbilityMessage(
          room,
          message.playerId,
          message.slot,
          message.aimDir,
        );
        break;
    }
  }
};

const enqueueBotCombatMessages = (room: Room, config: AppConfig): void => {
  if (!AUTHORITATIVE_BOT_ACTIONS_ENABLED || !room.world) {
    return;
  }

  for (const self of room.world.planets) {
    const playerId = self.playerId;
    const difficulty = room.botDifficultyFor(playerId);
    if (difficulty === null) {
      continue;
    }

    const privateState = room.privateStates.get(playerId);
    if (!privateState) {
      continue;
    }

    const bot =
      room.botControllers.get(playerId) ??
      room.ensureBotController(playerId, difficulty);
    const commands = bot.decide({
      tick: room.tick,
      tickHz: config.tickHz,
      world: room.world,
      self,
      privateState,
      runtime: room.combatRuntimeFor(playerId),
    });
    for (const command of commands) {
      room.enqueueCombatMessage(command);
    }
  }
};

const stepPlanets = (
  room: Room,
  nextSuns: readonly Sun[],
  blackHole: BlackHole | undefined,
  nextTick: number,
  config: AppConfig,
): PlanetPublic[] => {
  if (!room.world) {
    return [];
  }

  const neutronStars = room.world.neutronStars;
  const dragStepMultiplier = getUmbraDragStepMultiplier(config.tickHz);
  return room.world.planets.map((planet) => {
    const privateState = room.privateStates.get(planet.playerId);
    const intent = room.intentFor(planet.playerId);
    const dragActive =
      planet.debuffs.dragUntilTick !== undefined &&
      planet.debuffs.dragUntilTick > nextTick;
    const normalizedDebuffs =
      planet.debuffs.dragUntilTick !== undefined &&
      planet.debuffs.dragUntilTick <= nextTick
        ? {}
        : planet.debuffs;
    const boostActive =
      privateState !== undefined &&
      intent.boostHeld &&
      privateState.boostCharges > 0;
    const boostStarted = boostActive && !intent.boostActive;
    const boostLoadBeforeStep = privateState?.boostCharges ?? 0;
    const boostLoadBurned =
      boostActive && privateState !== undefined
        ? Math.min(
            boostLoadBeforeStep,
            getBoostDrainAmount(planet.archetype, config.tickHz),
          )
        : 0;
    const boostLoadAfterStep =
      privateState === undefined
        ? 0
        : Math.max(0, boostLoadBeforeStep - boostLoadBurned);
    if (privateState !== undefined) {
      privateState.boostCharges = boostLoadAfterStep;
      privateState.cooldowns.nextBoostChargeAtTick =
        boostLoadAfterStep >= getBoostChargeCapacity(planet.archetype)
          ? undefined
          : 0;
    }
    if (boostLoadBurned > 0 && boostStarted) {
      room.queueEvent({
        kind: "boost",
        tick: nextTick,
        playerId: planet.playerId,
        planetId: planet.id,
      });
    }
    intent.boostActive = boostActive && boostLoadAfterStep > 0;
    const stepped = stepBody(
      {
        ...planet,
        debuffs: normalizedDebuffs,
        vel:
          boostLoadBurned > 0
            ? add(
                planet.vel,
                scale(
                  intent.mouseDir,
                  BOOST_SPEC.magnitude *
                    getBoostForceDurationSec(
                      planet.archetype,
                      boostLoadBurned,
                    ) *
                    ARCHETYPES[planet.archetype].boostMagnitudeMultiplier,
                ),
              )
            : planet.vel,
      },
      nextSuns,
      1 / config.tickHz,
      blackHole,
      neutronStars,
    );

    return dragActive
      ? {
          ...stepped,
          vel: scale(stepped.vel, dragStepMultiplier),
        }
      : stepped;
  });
};

const applyPlanetCollisions = (
  room: Room,
  planets: PlanetPublic[],
  suns: readonly Sun[],
  blackHole: BlackHole | undefined,
  nextTick: number,
  tickHz: number,
  debrisSink: Debris[],
): {
  planets: PlanetPublic[];
  swallowedPlanets: PlanetPublic[];
} => {
  const deadPlayerIds = new Set<PlayerId>();
  const swallowedPlanets: PlanetPublic[] = [];
  const neutronStars = room.world?.neutronStars ?? [];

  for (let index = 0; index < planets.length; index += 1) {
    const planet = planets[index]!;

    if (isPlanetInvulnerable(planet, nextTick)) {
      continue;
    }

    if (isInsideBlackHole(planet, blackHole)) {
      deadPlayerIds.add(planet.playerId);
      swallowedPlanets.push(planet);
      queueKillEvent(room, nextTick, planet, "blackHole");
      continue;
    }

    for (const neutronStar of neutronStars) {
      if (
        dist(planet.pos, neutronStar.pos) <=
        planet.radius + neutronStar.radius
      ) {
        deadPlayerIds.add(planet.playerId);
        queueKillEvent(room, nextTick, planet, "neutronStar");
        break;
      }
    }
    if (deadPlayerIds.has(planet.playerId)) {
      continue;
    }

    for (const sun of suns) {
      if (
        dist(planet.pos, sun.pos) <= planet.radius + sun.radius &&
        !shieldProtectsImpact(planet, sun.pos, nextTick)
      ) {
        deadPlayerIds.add(planet.playerId);
        queueKillEvent(room, nextTick, planet, "sun");
        break;
      }
    }
  }

  for (let index = 0; index < planets.length; index += 1) {
    const planet = planets[index]!;
    if (deadPlayerIds.has(planet.playerId)) {
      continue;
    }

    for (
      let otherIndex = index + 1;
      otherIndex < planets.length;
      otherIndex += 1
    ) {
      const other = planets[otherIndex]!;
      if (
        deadPlayerIds.has(other.playerId) ||
        isPlanetInvulnerable(planet, nextTick) ||
        isPlanetInvulnerable(other, nextTick)
      ) {
        continue;
      }

      if (dist(planet.pos, other.pos) <= planet.radius + other.radius) {
        deadPlayerIds.add(planet.playerId);
        deadPlayerIds.add(other.playerId);
        queueKillEvent(room, nextTick, planet, "planetCollision");
        queueKillEvent(room, nextTick, other, "planetCollision");
      }
    }
  }

  if (deadPlayerIds.size === 0) {
    return { planets, swallowedPlanets };
  }

  const survivors: PlanetPublic[] = [];
  for (const planet of planets) {
    if (!deadPlayerIds.has(planet.playerId)) {
      survivors.push(planet);
      continue;
    }

    debrisSink.push(
      ...createDebrisBurst(
        room,
        planet,
        PLANET_DEBRIS_PIECES,
        PLANET_DEBRIS_SPEED,
        PLANET_DEBRIS_SPEED_VARIANCE,
        nextTick,
        tickHz,
        planet.playerId,
      ),
    );
    markPlayerDeath(room, planet.playerId, nextTick);
  }

  return {
    planets: survivors,
    swallowedPlanets,
  };
};

const applyBoundaryEffects = (
  room: Room,
  planets: PlanetPublic[],
  nextTick: number,
  config: AppConfig,
  debrisSink: Debris[],
): PlanetPublic[] => {
  const survivors: PlanetPublic[] = [];

  for (const planet of planets) {
    const runtime = room.combatRuntimeFor(planet.playerId);
    const distanceFromOrigin = len(planet.pos);
    if (distanceFromOrigin <= room.world!.arenaRadius) {
      runtime.boundaryEnteredTick = undefined;
      survivors.push(planet);
      continue;
    }

    if (isPlanetInvulnerable(planet, nextTick)) {
      survivors.push(planet);
      continue;
    }

    if (!ARENA_BOUNDARY_SPEC.instantDeath) {
      runtime.boundaryEnteredTick ??= nextTick;
      const outsideSec =
        (nextTick - runtime.boundaryEnteredTick) / config.tickHz;
      const dps =
        outsideSec >= ARENA_BOUNDARY_SPEC.rampAfterSec
          ? ARENA_BOUNDARY_SPEC.maxDps
          : ARENA_BOUNDARY_SPEC.baseDps;
      const hpAfter = Math.max(0, planet.hp - dps / config.tickHz);
      if (hpAfter > 0) {
        survivors.push({
          ...planet,
          hp: hpAfter,
        });
        continue;
      }
    }

    queueKillEvent(room, nextTick, planet, "boundary");
    debrisSink.push(
      ...createDebrisBurst(
        room,
        planet,
        PLANET_DEBRIS_PIECES,
        PLANET_DEBRIS_SPEED,
        PLANET_DEBRIS_SPEED_VARIANCE,
        nextTick,
        config.tickHz,
        planet.playerId,
      ),
    );
    markPlayerDeath(room, planet.playerId, nextTick);
  }

  return survivors;
};

const isEntityTouchingArenaBoundary = (
  entity: Pick<Rocket, "pos" | "radius">,
  arenaRadius: number,
): boolean => len(entity.pos) + entity.radius >= arenaRadius;

const stepRockets = (
  room: Room,
  planets: readonly PlanetPublic[],
  suns: readonly Sun[],
  blackHole: BlackHole | undefined,
  config: AppConfig,
): Rocket[] => {
  if (!room.world) {
    return [];
  }

  const dtSec = 1 / config.tickHz;
  return room.world.rockets
    .map((rocket) => {
      const runtime = getRocketRuntime(room, rocket);
      const target =
        rocket.targetId === undefined
          ? null
          : (planets.find((planet) => planet.id === rocket.targetId) ?? null);

      return stepSeeker(
        rocket,
        target,
        suns,
        dtSec,
        blackHole,
        rocket.rocketKind === "seeker"
          ? ROCKET_SPECS.seeker.turnRate * runtime.turnRateMultiplier
          : 0,
      );
    })
    .filter((rocket) => rocket.ttlUntilTick > room.tick + 1);
};

const stepCaches = (
  room: Room,
  suns: readonly Sun[],
  blackHole: BlackHole | undefined,
  config: AppConfig,
): Cache[] => {
  if (!room.world) {
    return [];
  }

  const dtSec = 1 / config.tickHz;
  return room.world.caches.map((cache) =>
    stepBodyWithGravityScale(
      cache.radius === CACHE_RADIUS
        ? cache
        : { ...cache, radius: CACHE_RADIUS },
      suns,
      dtSec,
      CACHE_GRAVITY_SCALE,
      blackHole,
    ),
  );
};

const applyBoundaryAsteroidImpacts = ({
  room,
  planets,
  suns,
  blackHole,
  nextTick,
  dtSec,
  tickHz,
  debrisSink,
}: {
  room: Room;
  planets: PlanetPublic[];
  suns: readonly Sun[];
  blackHole: BlackHole | undefined;
  nextTick: number;
  dtSec: number;
  tickHz: number;
  debrisSink: Debris[];
}): {
  debris: Debris[];
  planets: PlanetPublic[];
} => {
  if (!room.world) {
    return {
      debris: [],
      planets,
    };
  }

  const arenaRadius = room.world.arenaRadius;
  const steppedDebris = [
    ...room.world.debris
      .filter((piece) => piece.ttlUntilTick > nextTick)
      .map((piece) => stepBody(piece, suns, dtSec, blackHole))
      .filter((piece) => !shouldDespawnBoundaryAsteroid(piece, arenaRadius)),
    ...spawnBoundaryAsteroidDebris(room, nextTick, dtSec),
  ];
  const nextPlanets = planets.slice();
  const survivingDebris: Debris[] = [];

  for (const piece of steppedDebris) {
    if (!isBoundaryAsteroidDebris(piece)) {
      survivingDebris.push(piece);
      continue;
    }

    let impactedPlanet = false;

    for (
      let planetIndex = 0;
      planetIndex < nextPlanets.length;
      planetIndex += 1
    ) {
      const planet = nextPlanets[planetIndex]!;
      if (
        isPlanetInvulnerable(planet, nextTick) ||
        dist(piece.pos, planet.pos) >
          getBoundaryAsteroidImpactRadius(piece.asteroidTier, piece.radius) +
            planet.radius
      ) {
        continue;
      }

      const damage = getBoundaryAsteroidDamage(piece.asteroidTier);
      const absorbedByShield = shieldProtectsImpact(
        planet,
        piece.pos,
        nextTick,
      );
      const impactBurst = createDebrisBurst(
        room,
        piece,
        getBoundaryAsteroidExplosionPieces(piece.asteroidTier),
        getBoundaryAsteroidExplosionBaseSpeed(piece.asteroidTier),
        getBoundaryAsteroidExplosionSpeedVariance(piece.asteroidTier),
        nextTick,
        tickHz,
      );
      debrisSink.push(...impactBurst);

      if (absorbedByShield) {
        nextPlanets[planetIndex] = applyShieldDamage(planet, damage);
      } else {
        const hpAfter = Math.max(0, planet.hp - damage);
        nextPlanets[planetIndex] = {
          ...planet,
          hp: hpAfter,
        };

        if (hpAfter <= 0) {
          queueKillEvent(room, nextTick, planet, "boundaryAsteroid");
          debrisSink.push(
            ...createDebrisBurst(
              room,
              planet,
              PLANET_DEBRIS_PIECES,
              PLANET_DEBRIS_SPEED,
              PLANET_DEBRIS_SPEED_VARIANCE,
              nextTick,
              tickHz,
              planet.playerId,
            ),
          );
          markPlayerDeath(room, planet.playerId, nextTick);
          nextPlanets.splice(planetIndex, 1);
        }
      }

      impactedPlanet = true;
      break;
    }

    if (!impactedPlanet) {
      survivingDebris.push(piece);
    }
  }

  return {
    debris: survivingDebris,
    planets: nextPlanets,
  };
};

const applyRocketCollisions = (
  room: Room,
  planets: PlanetPublic[],
  rockets: Rocket[],
  caches: Cache[],
  suns: readonly Sun[],
  blackHole: BlackHole | undefined,
  nextTick: number,
  config: AppConfig,
  debrisSink: Debris[],
): {
  planets: PlanetPublic[];
  rockets: Rocket[];
  caches: Cache[];
} => {
  const survivingRockets: Rocket[] = [];
  const destroyedRocketIds = new Set<number>();
  const destroyedCacheIds = new Set<number>();

  for (let index = 0; index < rockets.length; index += 1) {
    const rocket = rockets[index]!;
    if (destroyedRocketIds.has(rocket.id)) {
      continue;
    }

    for (
      let otherIndex = index + 1;
      otherIndex < rockets.length;
      otherIndex += 1
    ) {
      const other = rockets[otherIndex]!;
      if (destroyedRocketIds.has(other.id)) {
        continue;
      }

      if (dist(rocket.pos, other.pos) <= rocket.radius + other.radius) {
        destroyedRocketIds.add(rocket.id);
        destroyedRocketIds.add(other.id);
      }
    }
  }

  for (const rocket of rockets) {
    const runtime = getRocketRuntime(room, rocket);

    if (destroyedRocketIds.has(rocket.id) || rocket.ttlUntilTick <= nextTick) {
      room.rocketRuntime.delete(rocket.id);
      debrisSink.push(
        ...createDebrisBurst(
          room,
          rocket,
          ROCKET_DEBRIS_PIECES,
          ROCKET_DEBRIS_SPEED,
          ROCKET_DEBRIS_SPEED_VARIANCE,
          nextTick,
          config.tickHz,
        ),
      );
      continue;
    }

    if (isInsideBlackHole(rocket, blackHole)) {
      room.rocketRuntime.delete(rocket.id);
      debrisSink.push(
        ...createDebrisBurst(
          room,
          rocket,
          ROCKET_DEBRIS_PIECES,
          ROCKET_DEBRIS_SPEED,
          ROCKET_DEBRIS_SPEED_VARIANCE,
          nextTick,
          config.tickHz,
        ),
      );
      continue;
    }

    let consumed = false;

    const neutronStars = room.world?.neutronStars ?? [];
    for (const neutronStar of neutronStars) {
      if (
        dist(rocket.pos, neutronStar.pos) <=
        rocket.radius + neutronStar.radius
      ) {
        consumed = true;
        break;
      }
    }
    if (consumed) {
      room.rocketRuntime.delete(rocket.id);
      debrisSink.push(
        ...createDebrisBurst(
          room,
          rocket,
          ROCKET_DEBRIS_PIECES,
          ROCKET_DEBRIS_SPEED,
          ROCKET_DEBRIS_SPEED_VARIANCE,
          nextTick,
          config.tickHz,
        ),
      );
      continue;
    }

    const arenaRadius = room.world?.arenaRadius ?? 0;
    if (arenaRadius > 0 && isEntityTouchingArenaBoundary(rocket, arenaRadius)) {
      room.rocketRuntime.delete(rocket.id);
      debrisSink.push(
        ...createDebrisBurst(
          room,
          rocket,
          ROCKET_DEBRIS_PIECES,
          ROCKET_DEBRIS_SPEED,
          ROCKET_DEBRIS_SPEED_VARIANCE,
          nextTick,
          config.tickHz,
        ),
      );
      continue;
    }

    for (const sun of suns) {
      if (dist(rocket.pos, sun.pos) <= rocket.radius + sun.radius) {
        consumed = true;
        break;
      }
    }
    if (consumed) {
      room.rocketRuntime.delete(rocket.id);
      debrisSink.push(
        ...createDebrisBurst(
          room,
          rocket,
          ROCKET_DEBRIS_PIECES,
          ROCKET_DEBRIS_SPEED,
          ROCKET_DEBRIS_SPEED_VARIANCE,
          nextTick,
          config.tickHz,
        ),
      );
      continue;
    }

    for (const cache of caches) {
      if (destroyedCacheIds.has(cache.id)) {
        continue;
      }
      if (dist(rocket.pos, cache.pos) <= rocket.radius + cache.radius) {
        destroyedCacheIds.add(cache.id);
        consumed = true;
        break;
      }
    }
    if (consumed) {
      room.rocketRuntime.delete(rocket.id);
      debrisSink.push(
        ...createDebrisBurst(
          room,
          rocket,
          ROCKET_DEBRIS_PIECES,
          ROCKET_DEBRIS_SPEED,
          ROCKET_DEBRIS_SPEED_VARIANCE,
          nextTick,
          config.tickHz,
        ),
      );
      continue;
    }

    for (let planetIndex = 0; planetIndex < planets.length; planetIndex += 1) {
      const planet = planets[planetIndex]!;
      if (
        planet.playerId === rocket.ownerId &&
        nextTick - runtime.spawnedAtTick <=
          rocketOwnerCollisionGraceTicks(config.tickHz)
      ) {
        continue;
      }

      if (dist(rocket.pos, planet.pos) <= rocket.radius + planet.radius) {
        if (isPlanetInvulnerable(planet, nextTick)) {
          consumed = true;
          break;
        }

        const absorbedByShield = shieldProtectsImpact(
          planet,
          rocket.pos,
          nextTick,
        );
        const hpAfter = absorbedByShield
          ? planet.hp
          : Math.max(0, planet.hp - runtime.damage);

        room.queueEvent({
          kind: "hit",
          tick: nextTick,
          victimPlanetId: planet.id,
          attackerPlayerId: rocket.ownerId,
          rocketId: rocket.id,
          rocketKind: rocket.rocketKind,
          damage: absorbedByShield ? 0 : runtime.damage,
          hpAfter,
          absorbedByShield,
        });

        if (absorbedByShield) {
          planets[planetIndex] = applyShieldDamage(planet, runtime.damage);
        } else {
          room.combatRuntimeFor(rocket.ownerId).damageDealt += runtime.damage;
          planets[planetIndex] = {
            ...planet,
            hp: hpAfter,
            debuffs: runtime.dragOnHit
              ? {
                  ...planet.debuffs,
                  dragUntilTick: Math.max(
                    planet.debuffs.dragUntilTick ?? 0,
                    nextTick + getUmbraDragDurationTicks(config.tickHz),
                  ),
                }
              : planet.debuffs,
          };

          if (hpAfter <= 0) {
            room.combatRuntimeFor(rocket.ownerId).kills += 1;
            queueKillEvent(room, nextTick, planet, "rocket", rocket.ownerId);
            debrisSink.push(
              ...createDebrisBurst(
                room,
                planet,
                PLANET_DEBRIS_PIECES,
                PLANET_DEBRIS_SPEED,
                PLANET_DEBRIS_SPEED_VARIANCE,
                nextTick,
                config.tickHz,
                planet.playerId,
              ),
            );
            markPlayerDeath(room, planet.playerId, nextTick);
            planets.splice(planetIndex, 1);
          }
        }

        consumed = true;
        break;
      }
    }

    if (consumed) {
      room.rocketRuntime.delete(rocket.id);
      debrisSink.push(
        ...createDebrisBurst(
          room,
          rocket,
          ROCKET_DEBRIS_PIECES,
          ROCKET_DEBRIS_SPEED,
          ROCKET_DEBRIS_SPEED_VARIANCE,
          nextTick,
          config.tickHz,
        ),
      );
      continue;
    }

    for (const planet of planets) {
      if (runtime.nearMissedPlayerIds.has(planet.playerId)) {
        continue;
      }

      const nearMissDistance =
        dist(rocket.pos, planet.pos) - rocket.radius - planet.radius;
      if (nearMissDistance < 0 || nearMissDistance > NEAR_MISS_DISTANCE) {
        continue;
      }

      runtime.nearMissedPlayerIds.add(planet.playerId);
      room.combatRuntimeFor(planet.playerId).nearMisses += 1;
    }

    survivingRockets.push(rocket);
  }
  const survivingCaches: Cache[] = [];
  for (const cache of caches) {
    if (destroyedCacheIds.has(cache.id)) {
      debrisSink.push(
        ...createDebrisBurst(
          room,
          cache,
          CACHE_DEBRIS_PIECES,
          CACHE_DEBRIS_SPEED,
          CACHE_DEBRIS_SPEED_VARIANCE,
          nextTick,
          config.tickHz,
        ),
      );
      queueCacheRespawn(room, nextTick + getCacheRespawnTicks(config.tickHz));
      continue;
    }
    survivingCaches.push(cache);
  }

  return {
    planets,
    rockets: survivingRockets,
    caches: survivingCaches,
  };
};

const applyCacheCollisions = (
  room: Room,
  planets: PlanetPublic[],
  caches: Cache[],
  previousPlanetsById: ReadonlyMap<number, Pick<PlanetPublic, "pos">>,
  previousCachesById: ReadonlyMap<number, Pick<Cache, "pos">>,
  suns: readonly Sun[],
  blackHole: BlackHole | undefined,
  nextTick: number,
  config: AppConfig,
  debrisSink: Debris[],
): Cache[] => {
  const remainingCaches: Cache[] = [];
  for (const cache of caches) {
    const consumedByHazard =
      isInsideBlackHole(cache, blackHole) ||
      suns.some((sun) => dist(cache.pos, sun.pos) <= cache.radius + sun.radius);
    if (consumedByHazard) {
      debrisSink.push(
        ...createDebrisBurst(
          room,
          cache,
          CACHE_DEBRIS_PIECES,
          CACHE_DEBRIS_SPEED,
          CACHE_DEBRIS_SPEED_VARIANCE,
          nextTick,
          config.tickHz,
        ),
      );
      queueCacheRespawn(room, nextTick + getCacheRespawnTicks(config.tickHz));
      continue;
    }

    const pickupPlanetIndex = planets.findIndex((planet) =>
      hasSweptCircleOverlap({
        currentA: cache.pos,
        currentB: planet.pos,
        previousA: previousCachesById.get(cache.id)?.pos,
        previousB: previousPlanetsById.get(planet.id)?.pos,
        radius: cache.radius + planet.radius,
      }),
    );
    if (pickupPlanetIndex >= 0) {
      const planet = planets[pickupPlanetIndex]!;
      const privateState = room.privateStates.get(planet.playerId);
      if (privateState !== undefined) {
        planets[pickupPlanetIndex] = applyCachePickup(
          room,
          planet.playerId,
          planet.id,
          privateState,
          planet,
          cache.contents,
          nextTick,
        );
        queueCacheRespawn(room, nextTick + getCacheRespawnTicks(config.tickHz));
        continue;
      }
    }

    remainingCaches.push(cache);
  }

  while (
    room.cacheRespawnAtTicks.length > 0 &&
    room.cacheRespawnAtTicks[0]! <= nextTick &&
    remainingCaches.length < CACHE_SPEC.count
  ) {
    room.cacheRespawnAtTicks.shift();
    remainingCaches.push(createCache(room));
  }

  return remainingCaches;
};

const applyCooldownsAndRegen = (
  room: Room,
  nextTick: number,
  config: AppConfig,
): void => {
  if (!room.world) {
    return;
  }

  for (
    let planetIndex = 0;
    planetIndex < room.world.planets.length;
    planetIndex += 1
  ) {
    let planet = room.world.planets[planetIndex]!;
    if (
      (planet.invulnerableUntilTick ?? 0) > 0 &&
      (planet.invulnerableUntilTick ?? 0) <= nextTick
    ) {
      planet = {
        ...planet,
        invulnerableUntilTick: 0,
      };
      room.world.planets[planetIndex] = planet;
    }
    const privateState = room.privateStates.get(planet.playerId);
    if (!privateState) {
      continue;
    }

    const intent = room.intentFor(planet.playerId);
    if (!intent.boostHeld && !intent.boostActive) {
      refreshBoostLoad(privateState, planet.archetype, config.tickHz);
    }

    if (privateState.cooldowns.heavyReloadUntilTick <= nextTick) {
      privateState.cooldowns.heavyReloadUntilTick = 0;
    }
    if (privateState.cooldowns.seekerReloadUntilTick <= nextTick) {
      privateState.cooldowns.seekerReloadUntilTick = 0;
    }
    if (planet.shieldActive) {
      const shieldLoad = Math.max(
        0,
        Math.min(
          planet.shieldMaxLoad,
          planet.shieldLoad - getShieldDrainAmount(config.tickHz),
        ),
      );
      if (shieldLoad !== planet.shieldLoad) {
        room.world.planets[planetIndex] = {
          ...planet,
          shieldActive: shieldLoad > 0 && planet.shieldMaxLoad > 0,
          shieldLoad,
        };
      }
    } else if (planet.shieldMaxLoad > 0) {
      const shieldLoad =
        SHIELD_SPEC.cooldownSec <= 0
          ? planet.shieldMaxLoad
          : Math.min(
              planet.shieldMaxLoad,
              planet.shieldLoad +
                planet.shieldMaxLoad /
                  (SHIELD_SPEC.cooldownSec * config.tickHz),
            );

      if (shieldLoad !== planet.shieldLoad) {
        room.world.planets[planetIndex] = {
          ...planet,
          shieldLoad,
        };
      }
    }

    if (
      privateState.ammo.light >= ROCKET_SPECS.light.maxAmmo &&
      privateState.cooldowns.lightReloadUntilTick <= nextTick
    ) {
      privateState.cooldowns.lightReloadUntilTick = 0;
    } else if (
      privateState.cooldowns.lightReloadUntilTick > 0 &&
      privateState.cooldowns.lightReloadUntilTick <= nextTick
    ) {
      privateState.ammo.light = Math.min(
        ROCKET_SPECS.light.maxAmmo,
        privateState.ammo.light + 1,
      );
      privateState.cooldowns.lightReloadUntilTick =
        privateState.ammo.light >= ROCKET_SPECS.light.maxAmmo
          ? 0
          : nextTick +
            weaponReloadTicks("light", planet.archetype, config.tickHz);
    } else if (
      privateState.ammo.light < ROCKET_SPECS.light.maxAmmo &&
      privateState.cooldowns.lightReloadUntilTick === 0
    ) {
      privateState.cooldowns.lightReloadUntilTick =
        nextTick + weaponReloadTicks("light", planet.archetype, config.tickHz);
    }
  }
};

const updateWorld = (room: Room, config: AppConfig): void => {
  if (!room.world) {
    return;
  }

  enqueueBotCombatMessages(room, config);
  applyQueuedCombatMessages(room, config);

  const nextTick = room.tick + 1;
  syncBlackHole(room, nextTick, config.tickHz);

  const dtSec = 1 / config.tickHz;
  let blackHole = room.world.blackHole;
  const steppedSuns = stepSunsWithOrbitMotion(
    room.world.suns,
    dtSec,
    blackHole,
    room.world.orbitStarMotion,
  );
  const swallowedSuns =
    blackHole === undefined
      ? []
      : steppedSuns.filter((sun) => isInsideBlackHole(sun, blackHole));
  const nextSuns = steppedSuns.filter(
    (sun) => !isInsideBlackHole(sun, blackHole),
  );

  if (blackHole !== undefined && swallowedSuns.length > 0) {
    blackHole = consumeBlackHoleBodies(blackHole, swallowedSuns);
    room.world.blackHole = blackHole;
  }
  let neutronStars = stepNeutronStars(
    room.world.neutronStars,
    dtSec,
    blackHole,
  );
  const swallowedNeutronStars =
    blackHole === undefined
      ? []
      : neutronStars.filter((neutronStar) =>
          isInsideBlackHole(neutronStar, blackHole),
        );
  if (blackHole !== undefined && swallowedNeutronStars.length > 0) {
    const swallowedNeutronStarIds = new Set(
      swallowedNeutronStars.map((neutronStar) => neutronStar.id),
    );
    blackHole = consumeBlackHoleBodies(blackHole, swallowedNeutronStars);
    room.world.blackHole = blackHole;
    neutronStars = neutronStars.filter(
      (neutronStar) => !swallowedNeutronStarIds.has(neutronStar.id),
    );
  }
  const sunAbsorptionState = absorbSunsIntoNeutronStars(nextSuns, neutronStars);
  neutronStars = sunAbsorptionState.neutronStars;
  const survivingSuns = sunAbsorptionState.suns;
  room.world.neutronStars = neutronStars;
  room.world.orbitStarMotion = advanceWorldOrbitStarMotion(
    room.world.orbitStarMotion,
    dtSec,
    survivingSuns,
  );
  const previousPlanetsById = new Map(
    room.world.planets.map((planet) => [planet.id, planet]),
  );
  const previousCachesById = new Map(
    room.world.caches.map((cache) => [cache.id, cache]),
  );

  let nextPlanets = stepPlanets(
    room,
    survivingSuns,
    blackHole,
    nextTick,
    config,
  );

  const debris: Debris[] = [];

  const planetCollisionState = applyPlanetCollisions(
    room,
    nextPlanets,
    survivingSuns,
    blackHole,
    nextTick,
    config.tickHz,
    debris,
  );
  nextPlanets = planetCollisionState.planets;
  if (
    blackHole !== undefined &&
    planetCollisionState.swallowedPlanets.length > 0
  ) {
    blackHole = consumeBlackHoleBodies(
      blackHole,
      planetCollisionState.swallowedPlanets,
    );
    room.world.blackHole = blackHole;
  }
  nextPlanets = applyBoundaryEffects(
    room,
    nextPlanets,
    nextTick,
    config,
    debris,
  );

  const nextRockets = stepRockets(
    room,
    nextPlanets,
    survivingSuns,
    blackHole,
    config,
  );
  const nextCaches = stepCaches(room, survivingSuns, blackHole, config);

  const rocketCollisionState = applyRocketCollisions(
    room,
    nextPlanets,
    nextRockets,
    nextCaches,
    survivingSuns,
    blackHole,
    nextTick,
    config,
    debris,
  );

  const survivingCaches = applyCacheCollisions(
    room,
    rocketCollisionState.planets,
    rocketCollisionState.caches,
    previousPlanetsById,
    previousCachesById,
    survivingSuns,
    blackHole,
    nextTick,
    config,
    debris,
  );

  const boundaryAsteroidState = applyBoundaryAsteroidImpacts({
    blackHole,
    debrisSink: debris,
    dtSec,
    nextTick,
    planets: rocketCollisionState.planets,
    room,
    suns: survivingSuns,
    tickHz: config.tickHz,
  });

  room.world = {
    ...room.world,
    blackHole,
    neutronStars,
    suns: survivingSuns,
    planets: boundaryAsteroidState.planets,
    rockets: rocketCollisionState.rockets,
    caches: survivingCaches,
    debris: [...boundaryAsteroidState.debris, ...debris],
  };
  applyCooldownsAndRegen(room, nextTick, config);
  room.tick = nextTick;
  room.recordPlanetPositions(lagCompHistoryEntries(config.tickHz));
  room.recordSnapshotState(config.snapshotHistoryTicks);

  const cycleTicks = Math.max(
    config.tickHz,
    Math.round(MATCH_TIMERS.cycleSec * config.tickHz),
  );
  const countdownTicks = Math.max(
    config.tickHz,
    Math.round(MATCH_TIMERS.cycleCountdownSec * config.tickHz),
  );
  const remainingTicks = cycleTicks - room.tick;
  if (remainingTicks > 0 && remainingTicks <= countdownTicks) {
    const remainingSec = Math.ceil(remainingTicks / config.tickHz);
    if (room.lastCycleCountdownRemainingSec !== remainingSec) {
      room.lastCycleCountdownRemainingSec = remainingSec;
      room.queueCycleResetCountdown(remainingSec);
    }
  }

  if (room.tick >= cycleTicks) {
    room.resetCombatCycle(Date.now(), config.tickHz);
  }
};

export const buildRoomDeltaSnapshot = (
  room: Room,
  baseTick: number,
): DeltaSnapshotMsg | null => {
  if (!room.world) {
    return null;
  }

  const baseState = room.snapshotStateFor(baseTick);
  if (!baseState) {
    return null;
  }

  const suns = diffEntityCollection(baseState.world.suns, room.world.suns);
  const neutronStars = diffEntityCollection(
    baseState.world.neutronStars,
    room.world.neutronStars,
  );
  const planets = diffEntityCollection(
    baseState.world.planets,
    room.world.planets,
  );
  const rockets = diffEntityCollection(
    baseState.world.rockets,
    room.world.rockets,
  );
  const caches = diffEntityCollection(
    baseState.world.caches,
    room.world.caches,
  );
  const debris = diffEntityCollection(
    baseState.world.debris,
    room.world.debris,
  );
  const previousBlackHole = baseState.world.blackHole ?? null;
  const currentBlackHole = room.world.blackHole ?? null;

  return {
    type: "deltaSnapshot",
    tick: room.tick,
    baseTick,
    changed: {
      ...(suns.changed ? { suns: suns.changed } : {}),
      ...(neutronStars.changed ? { neutronStars: neutronStars.changed } : {}),
      ...(planets.changed ? { planets: planets.changed } : {}),
      ...(rockets.changed ? { rockets: rockets.changed } : {}),
      ...(caches.changed ? { caches: caches.changed } : {}),
      ...(debris.changed ? { debris: debris.changed } : {}),
      ...(currentBlackHole !== null &&
      !sameBlackHole(previousBlackHole, currentBlackHole)
        ? { blackHole: currentBlackHole }
        : {}),
    },
    removed: {
      ...(suns.removed ? { suns: suns.removed } : {}),
      ...(neutronStars.removed ? { neutronStars: neutronStars.removed } : {}),
      ...(planets.removed ? { planets: planets.removed } : {}),
      ...(rockets.removed ? { rockets: rockets.removed } : {}),
      ...(caches.removed ? { caches: caches.removed } : {}),
      ...(debris.removed ? { debris: debris.removed } : {}),
      ...(previousBlackHole !== null && currentBlackHole === null
        ? { blackHole: true as const }
        : {}),
    },
  };
};

export const buildRoomSnapshotV2 = (
  room: Room,
  baseTick: number,
): SnapshotV2Msg | null => {
  if (!room.world) {
    return null;
  }

  const baseState = room.snapshotStateFor(baseTick);
  if (!baseState) {
    return null;
  }

  const suns = diffCompactEntityCollection(
    baseState.world.suns,
    room.world.suns,
    {
      hasStaticChanged: hasSunStaticChanged,
      hasUpdateChanged: hasSunUpdateChanged,
      toUpdateRow: sunUpdateRow,
    },
  );
  const neutronStars = diffCompactEntityCollection(
    baseState.world.neutronStars,
    room.world.neutronStars,
    {
      hasStaticChanged: hasNeutronStarStaticChanged,
      hasUpdateChanged: hasNeutronStarUpdateChanged,
      toUpdateRow: neutronStarUpdateRow,
    },
  );
  const planets = diffCompactEntityCollection(
    baseState.world.planets,
    room.world.planets,
    {
      hasStaticChanged: hasPlanetStaticChanged,
      hasUpdateChanged: hasPlanetUpdateChanged,
      toUpdateRow: planetUpdateRow,
    },
  );
  const rockets = diffCompactEntityCollection(
    baseState.world.rockets,
    room.world.rockets,
    {
      hasStaticChanged: hasRocketStaticChanged,
      hasUpdateChanged: hasRocketUpdateChanged,
      toUpdateRow: rocketUpdateRow,
    },
  );
  const caches = diffCompactEntityCollection(
    baseState.world.caches,
    room.world.caches,
    {
      hasStaticChanged: hasCacheStaticChanged,
      hasUpdateChanged: hasCacheUpdateChanged,
      toUpdateRow: cacheUpdateRow,
    },
  );
  const debris = diffCompactEntityCollection(
    baseState.world.debris,
    room.world.debris,
    {
      hasStaticChanged: hasDebrisStaticChanged,
      hasUpdateChanged: hasDebrisUpdateChanged,
      toUpdateRow: debrisUpdateRow,
    },
  );
  const previousBlackHole = baseState.world.blackHole ?? null;
  const currentBlackHole = room.world.blackHole ?? null;
  const previousOrbitStarMotion = baseState.world.orbitStarMotion ?? null;
  const currentOrbitStarMotion = room.world.orbitStarMotion ?? null;

  return {
    type: "snapshotV2",
    tick: room.tick,
    baseTick,
    spawns: {
      ...(suns.spawns ? { suns: suns.spawns } : {}),
      ...(neutronStars.spawns ? { neutronStars: neutronStars.spawns } : {}),
      ...(planets.spawns ? { planets: planets.spawns } : {}),
      ...(rockets.spawns ? { rockets: rockets.spawns } : {}),
      ...(caches.spawns ? { caches: caches.spawns } : {}),
      ...(debris.spawns ? { debris: debris.spawns } : {}),
      ...(previousBlackHole === null && currentBlackHole !== null
        ? { blackHole: currentBlackHole }
        : {}),
    },
    updates: {
      ...(suns.updates ? { suns: suns.updates } : {}),
      ...(neutronStars.updates ? { neutronStars: neutronStars.updates } : {}),
      ...(planets.updates ? { planets: planets.updates } : {}),
      ...(rockets.updates ? { rockets: rockets.updates } : {}),
      ...(caches.updates ? { caches: caches.updates } : {}),
      ...(debris.updates ? { debris: debris.updates } : {}),
      ...(previousBlackHole !== null &&
      currentBlackHole !== null &&
      !sameBlackHole(previousBlackHole, currentBlackHole)
        ? { blackHole: currentBlackHole }
        : {}),
      ...(!sameOrbitStarMotion(previousOrbitStarMotion, currentOrbitStarMotion)
        ? { orbitStarMotion: currentOrbitStarMotion }
        : {}),
    },
    removed: {
      ...(suns.removed ? { suns: suns.removed } : {}),
      ...(neutronStars.removed ? { neutronStars: neutronStars.removed } : {}),
      ...(planets.removed ? { planets: planets.removed } : {}),
      ...(rockets.removed ? { rockets: rockets.removed } : {}),
      ...(caches.removed ? { caches: caches.removed } : {}),
      ...(debris.removed ? { debris: debris.removed } : {}),
      ...(previousBlackHole !== null && currentBlackHole === null
        ? { blackHole: true as const }
        : {}),
    },
  };
};

export class RoomTicker {
  #running = false;
  #lastLoopAtMs = 0;
  #nextLoopAtMs = 0;
  #accumulatorMs = 0;
  #timeout?: ReturnType<typeof setTimeout>;

  constructor(
    readonly room: Room,
    readonly config: AppConfig,
    readonly onBroadcast: (room: Room, broadcast: RoomTickBroadcast) => void,
  ) {}

  get running(): boolean {
    return this.#running;
  }

  start(): void {
    if (this.#running) {
      return;
    }

    this.#running = true;
    const nowMs = performance.now();
    const dtMs = 1000 / this.config.tickHz;
    this.#lastLoopAtMs = nowMs;
    this.#nextLoopAtMs = nowMs + dtMs;
    this.#accumulatorMs = 0;
    this.scheduleNextLoop();
  }

  stop(): void {
    this.#running = false;

    if (this.#timeout) {
      clearTimeout(this.#timeout);
      this.#timeout = undefined;
    }
  }

  private scheduleNextLoop(): void {
    if (!this.#running) {
      return;
    }

    const tickMs = Math.max(
      TICK_MS_FLOOR,
      this.#nextLoopAtMs - performance.now(),
    );
    this.#timeout = setTimeout(() => {
      this.loop();
    }, tickMs);
  }

  private loop(): void {
    if (!this.#running) {
      return;
    }

    if (this.room.phase !== "combat" || !this.room.world) {
      this.stop();
      return;
    }

    const dtMs = 1000 / this.config.tickHz;
    const nowMs = performance.now();
    this.#accumulatorMs += nowMs - this.#lastLoopAtMs;
    this.#lastLoopAtMs = nowMs;

    const steps = Math.floor((this.#accumulatorMs + TIMER_EPSILON_MS) / dtMs);
    if (steps <= 0) {
      this.scheduleNextLoop();
      return;
    }

    const stepsToRun = Math.min(steps, MAX_TICK_CATCHUP_STEPS);
    this.#accumulatorMs = Math.max(0, this.#accumulatorMs - steps * dtMs);

    let endedThisLoop = false;
    for (let step = 0; step < stepsToRun; step += 1) {
      updateWorld(this.room, this.config);
      if (this.room.phase !== "combat") {
        endedThisLoop = true;
        this.onBroadcast(this.room, {
          emitDeltaSnapshot: false,
          emitFullSnapshot: true,
        });
        break;
      }

      if (
        this.room.tick > 0 &&
        this.room.tick % this.config.snapshotIntervalTicks === 0
      ) {
        this.onBroadcast(this.room, {
          emitDeltaSnapshot: true,
          emitFullSnapshot: false,
        });
      }
    }

    if (endedThisLoop) {
      this.stop();
      return;
    }

    this.#nextLoopAtMs += stepsToRun * dtMs;
    if (this.#nextLoopAtMs <= nowMs) {
      this.#nextLoopAtMs = nowMs + Math.max(0, dtMs - this.#accumulatorMs);
    }
    this.scheduleNextLoop();
  }
}
