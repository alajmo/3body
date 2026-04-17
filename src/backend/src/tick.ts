import {
  ARCHETYPES,
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  BOUNDARY_DAMAGE_SPEC,
  CACHE_DROP_SPEED_SCALE,
  CACHE_GRAVITY_SCALE,
  CACHE_RADIUS,
  CACHE_SPEC,
  CACHE_TANGENTIAL_SPEED_MAX,
  CACHE_TANGENTIAL_SPEED_MIN,
  DEBRIS_TTL_SEC,
  DRONE_LAUNCH_SPEED,
  DRONE_SPEC,
  FORESIGHT_EXT_MULTIPLIER,
  FORESIGHT_SPEC,
  GRAVITY_PULSE_IMPULSE,
  GRAVITY_PULSE_RADIUS,
  getBaseShieldLoad,
  OUTER_RING_MAX,
  OUTER_RING_MIN,
  PLANET_HP,
  REPAIR_AMOUNT,
  ROCKET_SPECS,
  SHIELD_EXT_MULTIPLIER,
  SHIELD_SPEC,
  TELEPORT_SWAP_MIN_DOT,
  add,
  clamp,
  clampLen,
  cloneCacheContents,
  dist,
  dot,
  fromAngle,
  len,
  normalize,
  rollCacheContents,
  scale,
  stepBody,
  stepBodyWithGravityScale,
  stepSeeker,
  stepSuns,
  sub,
  type ArchetypeId,
  type BlackHole,
  type Cache,
  type CacheContents,
  type Debris,
  type DeltaSnapshotMsg,
  type Drone,
  type PlanetPrivateState,
  type PlanetPublic,
  type PlayerId,
  type Rocket,
  type RocketKind,
  type SnapshotEvent,
  type Sun,
  type Vec2,
  type WildcardKind,
} from "@3body/shared";
import type { AppConfig } from "./config";
import type { Room, RocketRuntimeState } from "./room";

const TICK_MS_FLOOR = 1;
const DEFAULT_INPUT_DIR: Vec2 = { x: 1, y: 0 };
const SELF_HIT_GRACE_SEC = 0.15;
const PLANET_DEBRIS_PIECES = 20;
const PLANET_DEBRIS_SPEED = 220;
const PLANET_DEBRIS_SPEED_VARIANCE = 170;
const ROCKET_DEBRIS_PIECES = 6;
const ROCKET_DEBRIS_SPEED = 168;
const ROCKET_DEBRIS_SPEED_VARIANCE = 104;
const CACHE_DEBRIS_PIECES = 10;
const CACHE_DEBRIS_SPEED = 140;
const CACHE_DEBRIS_SPEED_VARIANCE = 92;
const DRONE_DEBRIS_PIECES = 12;
const DRONE_DEBRIS_SPEED = 168;
const DRONE_DEBRIS_SPEED_VARIANCE = 104;
const LAG_COMP_MAX_REWIND_MS = 100;
const NEAR_MISS_DISTANCE = 48;

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

const getForesightDurationTicks = (
  archetypeId: ArchetypeId,
  tickHz: number,
  extended: boolean,
): number =>
  Math.max(
    1,
    Math.round(
      FORESIGHT_SPEC.durationSec *
        tickHz *
        ARCHETYPES[archetypeId].foresightDurationMultiplier *
        (extended ? FORESIGHT_EXT_MULTIPLIER : 1),
    ),
  );

const getForesightRechargeTicks = (
  durationTicks: number,
  tickHz: number,
): number =>
  Math.max(
    0,
    getAbilityTicks(FORESIGHT_SPEC.cooldownSec, tickHz) - durationTicks,
  );

const getForesightChargeTicks = ({
  currentTick,
  cooldownUntilTick,
  durationTicks,
  tickHz,
}: {
  currentTick: number;
  cooldownUntilTick: number;
  durationTicks: number;
  tickHz: number;
}): number => {
  const rechargeTicks = getForesightRechargeTicks(durationTicks, tickHz);
  if (currentTick >= cooldownUntilTick || rechargeTicks <= 0) {
    return durationTicks;
  }

  return clamp(
    durationTicks * (1 - (cooldownUntilTick - currentTick) / rechargeTicks),
    0,
    durationTicks,
  );
};

const getBoostRechargeTicks = (tickHz: number): number =>
  getAbilityTicks(BOOST_SPEC.cooldownSec, tickHz);

const getDroneCooldownTicks = (tickHz: number): number =>
  getAbilityTicks(DRONE_SPEC.cooldownSec, tickHz);

const getDroneTtlTicks = (tickHz: number): number =>
  getAbilityTicks(DRONE_SPEC.ttlSec, tickHz);

const getCacheRespawnTicks = (tickHz: number): number =>
  getAbilityTicks(CACHE_SPEC.respawnSec, tickHz);

const getCloakDurationTicks = (tickHz: number): number =>
  getAbilityTicks(5, tickHz);

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

const blackHoleMassForTick = (tick: number, tickHz: number): number => {
  const elapsedSec = tick / tickHz;
  const alpha = clamp(
    (elapsedSec - BLACK_HOLE_SPEC.spawnSec) / BLACK_HOLE_SPEC.rampSec,
    0,
    1,
  );
  return BLACK_HOLE_SPEC.mass * alpha;
};

const selfHitGraceTicks = (tickHz: number): number =>
  Math.max(1, Math.round(SELF_HIT_GRACE_SEC * tickHz));

const lagCompMaxRewindTicks = (tickHz: number): number =>
  Math.max(0, Math.floor((LAG_COMP_MAX_REWIND_MS * tickHz) / 1000));

const lagCompHistoryEntries = (tickHz: number): number =>
  lagCompMaxRewindTicks(tickHz) + 2;

const umbraDragDurationTicks = (tickHz: number): number =>
  getAbilityTicks(2, tickHz);

const umbraDragStepMultiplier = (tickHz: number): number =>
  0.3 ** (1 / umbraDragDurationTicks(tickHz));

const shieldArcDotThreshold = (): number =>
  Math.cos(((SHIELD_SPEC.arcDeg / 2) * Math.PI) / 180);

const normalizeDir = (dir: Vec2, fallback: Vec2 = DEFAULT_INPUT_DIR): Vec2 => {
  const normalized = normalize(dir);
  return len(normalized) === 0 ? { ...fallback } : normalized;
};

const isInsideBlackHole = (
  body: { pos: Vec2; radius: number },
  blackHole: BlackHole | undefined,
): boolean =>
  blackHole !== undefined &&
  dist(body.pos, blackHole.pos) <= body.radius + blackHole.killRadius;

const hasActiveShield = (planet: PlanetPublic, tick: number): boolean =>
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

const findPlanetIndexById = (
  planets: readonly PlanetPublic[],
  planetId: number,
): number => planets.findIndex((planet) => planet.id === planetId);

const findDroneIndexById = (
  drones: readonly Drone[],
  droneId: number,
): number => drones.findIndex((drone) => drone.id === droneId);

const queueCacheRespawn = (room: Room, readyAtTick: number): void => {
  room.cacheRespawnAtTicks.push(readyAtTick);
  room.cacheRespawnAtTicks.sort((left, right) => left - right);
};

const createDebrisBurst = (
  room: Room,
  source: Pick<PlanetPublic | Rocket | Drone | Cache | Debris, "pos" | "vel">,
  pieces: number,
  baseSpeed: number,
  speedVariance: number,
  tick: number,
  ownerPlayerId?: PlayerId,
): Debris[] => {
  const ttlUntilTick = tick + getAbilityTicks(DEBRIS_TTL_SEC, 120);
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

const createOuterRingCache = (room: Room): Cache => {
  const angle = room.rng() * Math.PI * 2 + (room.rng() - 0.5) * 0.24;
  const radius =
    OUTER_RING_MIN + (OUTER_RING_MAX - OUTER_RING_MIN) * room.rng();
  const tangentialDir = fromAngle(
    angle + (Math.PI / 2) * (room.rng() < 0.5 ? -1 : 1),
  );
  const driftSpeed =
    CACHE_TANGENTIAL_SPEED_MIN +
    (CACHE_TANGENTIAL_SPEED_MAX - CACHE_TANGENTIAL_SPEED_MIN) * room.rng();

  return {
    id: room.entityIds.nextEntityId(),
    kind: "cache",
    contents: rollCacheContents(room.rng),
    pos: {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    },
    vel: scale(tangentialDir, driftSpeed),
    radius: CACHE_RADIUS,
  };
};

const rotateVec2 = (dir: Vec2, angleRad: number): Vec2 => {
  const cosAngle = Math.cos(angleRad);
  const sinAngle = Math.sin(angleRad);
  return {
    x: dir.x * cosAngle - dir.y * sinAngle,
    y: dir.x * sinAngle + dir.y * cosAngle,
  };
};

const getDroneForwardDir = (drone: Pick<Drone, "vel">): Vec2 => {
  const forward = normalize(drone.vel);
  return len(forward) > 0 ? forward : { ...DEFAULT_INPUT_DIR };
};

const getDroneTurnInput = (turnLeft: boolean, turnRight: boolean): number => {
  if (turnLeft === turnRight) {
    return 0;
  }

  return turnLeft ? 1 : -1;
};

const diffEntityCollection = <T extends { id: number }>(
  previous: readonly T[],
  current: readonly T[],
): { changed?: T[]; removed?: number[] } => {
  const previousById = new Map(previous.map((entity) => [entity.id, entity]));
  const currentById = new Map(current.map((entity) => [entity.id, entity]));
  const changed: T[] = [];
  const removed: number[] = [];

  for (const entity of current) {
    const previousEntity = previousById.get(entity.id);
    if (previousEntity === undefined || previousEntity !== entity) {
      changed.push(entity);
    }
  }

  for (const entity of previous) {
    if (!currentById.has(entity.id)) {
      removed.push(entity.id);
    }
  }

  return {
    ...(changed.length > 0 ? { changed } : {}),
    ...(removed.length > 0 ? { removed } : {}),
  };
};

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
  const runtime = room.combatRuntimeFor(playerId);
  runtime.deathTick ??= tick;
  runtime.controlMode = "planet";
  runtime.activeDroneId = null;
  runtime.droneTurnLeft = false;
  runtime.droneTurnRight = false;
  room.privateStates.delete(playerId);
};

const refreshBoostCharges = (
  privateState: PlanetPrivateState,
  archetypeId: ArchetypeId,
  tick: number,
  tickHz: number,
): void => {
  const maxBoostCharges = getBoostChargeCapacity(archetypeId);
  if (privateState.boostCharges >= maxBoostCharges) {
    privateState.cooldowns.nextBoostChargeAtTick = undefined;
    return;
  }

  while (
    privateState.cooldowns.nextBoostChargeAtTick !== undefined &&
    privateState.cooldowns.nextBoostChargeAtTick <= tick
  ) {
    privateState.boostCharges = Math.min(
      maxBoostCharges,
      privateState.boostCharges + 1,
    );
    privateState.cooldowns.nextBoostChargeAtTick =
      privateState.boostCharges >= maxBoostCharges
        ? undefined
        : privateState.cooldowns.nextBoostChargeAtTick +
          getBoostRechargeTicks(tickHz);
  }
};

const ensurePlanetPointers = (room: Room, planets: PlanetPublic[]): void => {
  for (let index = 0; index < planets.length; index += 1) {
    const planet = planets[index]!;
    const runtime = room.combatRuntimeFor(planet.playerId);
    planets[index] = {
      ...planet,
      pilotingDroneId:
        runtime.controlMode === "drone"
          ? (runtime.activeDroneId ?? undefined)
          : undefined,
    };
  }
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

  const runtime = room.combatRuntimeFor(playerId);
  if (runtime.controlMode !== "planet") {
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

const findTeleportSwapTarget = (
  planets: readonly PlanetPublic[],
  playerPlanetId: number,
  aimDir: Vec2,
): PlanetPublic | null => {
  if (len(aimDir) === 0) {
    return null;
  }

  const playerPlanet = planets.find((planet) => planet.id === playerPlanetId);
  if (!playerPlanet) {
    return null;
  }

  let bestTarget: PlanetPublic | null = null;
  let bestDot = TELEPORT_SWAP_MIN_DOT;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const planet of planets) {
    if (planet.id === playerPlanetId) {
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
  room: Room,
  playerId: PlayerId,
  wildcard: WildcardKind,
  aimDir: Vec2,
  tickHz: number,
): boolean => {
  if (!room.world) {
    return false;
  }

  const planetIndex = findPlanetIndexByPlayerId(room.world.planets, playerId);
  if (planetIndex < 0) {
    return false;
  }

  const playerPlanet = room.world.planets[planetIndex]!;

  switch (wildcard) {
    case "gravityPulse":
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
        room.world.drones,
        playerPlanet.pos,
        GRAVITY_PULSE_RADIUS,
        GRAVITY_PULSE_IMPULSE * 0.95,
      );
      applyImpulseAwayFromPoint(
        room.world.caches,
        playerPlanet.pos,
        GRAVITY_PULSE_RADIUS,
        GRAVITY_PULSE_IMPULSE * 0.72,
      );
      return true;

    case "cloak":
      room.world.planets[planetIndex] = {
        ...playerPlanet,
        hideTrailUntilTick: room.tick + getCloakDurationTicks(tickHz),
      };
      return true;

    case "teleportSwap": {
      const target = findTeleportSwapTarget(
        room.world.planets,
        playerPlanet.id,
        aimDir,
      );
      if (!target) {
        return false;
      }

      const targetIndex = findPlanetIndexById(room.world.planets, target.id);
      if (targetIndex < 0) {
        return false;
      }

      const currentPlayerPlanet = room.world.planets[planetIndex]!;
      const currentTargetPlanet = room.world.planets[targetIndex]!;
      room.world.planets[planetIndex] = {
        ...currentPlayerPlanet,
        pos: { x: currentTargetPlanet.pos.x, y: currentTargetPlanet.pos.y },
        vel: { x: currentTargetPlanet.vel.x, y: currentTargetPlanet.vel.y },
      };
      room.world.planets[targetIndex] = {
        ...currentTargetPlanet,
        pos: { x: currentPlayerPlanet.pos.x, y: currentPlayerPlanet.pos.y },
        vel: { x: currentPlayerPlanet.vel.x, y: currentPlayerPlanet.vel.y },
      };
      return true;
    }
  }
};

const applyAbilityMessage = (
  room: Room,
  playerId: PlayerId,
  slot: "q" | "w" | "e" | "r",
  aimDir: Vec2 | undefined,
  tickHz: number,
): void => {
  if (!room.world) {
    return;
  }

  const planetIndex = findPlanetIndexByPlayerId(room.world.planets, playerId);
  if (planetIndex < 0) {
    return;
  }

  const runtime = room.combatRuntimeFor(playerId);
  if (runtime.controlMode !== "planet") {
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
      const baseDurationTicks = getForesightDurationTicks(
        planet.archetype,
        tickHz,
        false,
      );
      const cycleComplete =
        room.tick >= privateState.cooldowns.foresightActiveUntilTick &&
        room.tick >= privateState.cooldowns.foresightCooldownUntilTick;
      const storedDurationTicks = cycleComplete
        ? baseDurationTicks
        : Math.max(
            1,
            privateState.cooldowns.foresightDurationTicks || baseDurationTicks,
          );

      if (room.tick < privateState.cooldowns.foresightActiveUntilTick) {
        const remainingTicks = Math.max(
          0,
          privateState.cooldowns.foresightActiveUntilTick - room.tick,
        );
        const rechargeTicks = getForesightRechargeTicks(
          storedDurationTicks,
          tickHz,
        );
        const missingFraction =
          storedDurationTicks > 0
            ? Math.max(0, 1 - remainingTicks / storedDurationTicks)
            : 1;
        privateState.cooldowns.foresightActiveUntilTick = room.tick;
        privateState.cooldowns.foresightCooldownUntilTick =
          room.tick + Math.round(missingFraction * rechargeTicks);
        return;
      }

      const activationDurationTicks = Math.max(
        storedDurationTicks,
        getForesightDurationTicks(
          planet.archetype,
          tickHz,
          privateState.nextForesightExt,
        ),
      );
      let availableTicks =
        room.tick < privateState.cooldowns.foresightCooldownUntilTick
          ? getForesightChargeTicks({
              currentTick: room.tick,
              cooldownUntilTick:
                privateState.cooldowns.foresightCooldownUntilTick,
              durationTicks: storedDurationTicks,
              tickHz,
            })
          : storedDurationTicks;
      if (activationDurationTicks > storedDurationTicks) {
        availableTicks = Math.min(
          activationDurationTicks,
          availableTicks + (activationDurationTicks - storedDurationTicks),
        );
      }
      if (availableTicks <= 0) {
        return;
      }

      const activeTicks = Math.max(1, Math.round(availableTicks));
      privateState.cooldowns.foresightDurationTicks = activationDurationTicks;
      privateState.cooldowns.foresightActiveUntilTick = room.tick + activeTicks;
      privateState.cooldowns.foresightCooldownUntilTick =
        privateState.cooldowns.foresightActiveUntilTick +
        getForesightRechargeTicks(activationDurationTicks, tickHz);
      privateState.nextForesightExt = false;
      return;
    }

    case "w":
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

    case "e": {
      const maxBoostCharges = getBoostChargeCapacity(planet.archetype);
      if (privateState.boostCharges <= 0) {
        return;
      }

      room.world.planets[planetIndex] = {
        ...planet,
        vel: add(
          planet.vel,
          scale(
            resolvedAimDir,
            BOOST_SPEC.magnitude *
              ARCHETYPES[planet.archetype].boostMagnitudeMultiplier,
          ),
        ),
      };
      privateState.boostCharges -= 1;
      if (
        privateState.boostCharges < maxBoostCharges &&
        privateState.cooldowns.nextBoostChargeAtTick === undefined
      ) {
        privateState.cooldowns.nextBoostChargeAtTick =
          room.tick + getBoostRechargeTicks(tickHz);
      }
      room.queueEvent({
        kind: "boost",
        tick: room.tick,
        playerId,
        planetId: planet.id,
      });
      return;
    }

    case "r":
      if (privateState.wildcardSlot === undefined) {
        return;
      }

      if (
        activateWildcard(
          room,
          playerId,
          privateState.wildcardSlot,
          resolvedAimDir,
          tickHz,
        )
      ) {
        room.queueEvent({
          kind: "wildcardUse",
          tick: room.tick,
          playerId,
          wildcard: privateState.wildcardSlot,
        });
        privateState.wildcardSlot = undefined;
      }
  }
};

const launchDrone = (
  room: Room,
  playerId: PlayerId,
  aimDir: Vec2,
  tickHz: number,
): void => {
  if (!room.world) {
    return;
  }

  const planetIndex = findPlanetIndexByPlayerId(room.world.planets, playerId);
  if (planetIndex < 0) {
    return;
  }

  const runtime = room.combatRuntimeFor(playerId);
  const privateState = room.privateStates.get(playerId);
  if (
    runtime.controlMode !== "planet" ||
    runtime.activeDroneId !== null ||
    !privateState ||
    room.tick < privateState.cooldowns.droneCooldownUntilTick
  ) {
    return;
  }

  const planet = room.world.planets[planetIndex]!;
  const dir = normalizeDir(aimDir);
  const drone: Drone = {
    id: room.entityIds.nextEntityId(),
    kind: "drone",
    ownerId: playerId,
    ttlUntilTick: room.tick + getDroneTtlTicks(tickHz),
    pos: add(planet.pos, scale(dir, planet.radius + 18 + 10)),
    vel: add(planet.vel, scale(dir, DRONE_LAUNCH_SPEED)),
    radius: 18,
  };

  room.world.drones.push(drone);
  runtime.activeDroneId = drone.id;
  runtime.controlMode = "drone";
  runtime.droneTurnLeft = false;
  runtime.droneTurnRight = false;
  privateState.cooldowns.droneCooldownUntilTick =
    room.tick + getDroneCooldownTicks(tickHz);
};

const removeDrone = (
  room: Room,
  playerId: PlayerId,
  droneId: number,
  tick: number,
  debrisSink: Debris[],
): void => {
  if (!room.world) {
    return;
  }

  const droneIndex = findDroneIndexById(room.world.drones, droneId);
  if (droneIndex < 0) {
    return;
  }

  const [drone] = room.world.drones.splice(droneIndex, 1);
  if (!drone) {
    return;
  }

  debrisSink.push(
    ...createDebrisBurst(
      room,
      drone,
      DRONE_DEBRIS_PIECES,
      DRONE_DEBRIS_SPEED,
      DRONE_DEBRIS_SPEED_VARIANCE,
      tick,
      playerId,
    ),
  );
  room.queueEvent({
    kind: "droneDown",
    tick,
    ownerPlayerId: playerId,
    droneId,
  });

  const runtime = room.combatRuntimeFor(playerId);
  if (runtime.activeDroneId === droneId) {
    runtime.activeDroneId = null;
    runtime.controlMode = "planet";
    runtime.droneTurnLeft = false;
    runtime.droneTurnRight = false;
  }
};

const syncBlackHole = (room: Room, nextTick: number, tickHz: number): void => {
  if (!room.world) {
    return;
  }

  if (nextTick < blackHoleSpawnTick(tickHz)) {
    return;
  }

  const mass = blackHoleMassForTick(nextTick, tickHz);
  const previousBlackHole = room.world.blackHole;

  if (!previousBlackHole) {
    const blackHole: BlackHole = {
      id: room.entityIds.nextEntityId(),
      kind: "blackHole",
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      radius: BLACK_HOLE_SPEC.killRadius,
      killRadius: BLACK_HOLE_SPEC.killRadius,
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

  room.world.blackHole = {
    ...previousBlackHole,
    mass,
    radius: BLACK_HOLE_SPEC.killRadius,
    killRadius: BLACK_HOLE_SPEC.killRadius,
  };
};

const applyQueuedCombatMessages = (room: Room, config: AppConfig): void => {
  if (!room.world) {
    room.drainCombatMessages();
    return;
  }

  for (const message of room.drainCombatMessages()) {
    const intent = room.intentFor(message.playerId);
    const runtime = room.combatRuntimeFor(message.playerId);

    switch (message.type) {
      case "input":
        if (message.clientTick < intent.lastInputClientTick) {
          continue;
        }
        intent.lastInputClientTick = message.clientTick;
        intent.mouseDir = normalizeDir(message.mouseDir, intent.mouseDir);
        break;

      case "shieldAim": {
        if (runtime.controlMode !== "planet") {
          continue;
        }
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
          config.tickHz,
        );
        break;
    }
  }
};

const enqueueBotCombatMessages = (room: Room, config: AppConfig): void => {
  if (!room.world) {
    return;
  }

  for (const playerId of room.activeBotPlayerIds()) {
    const difficulty = room.botDifficultyFor(playerId);
    if (difficulty === null) {
      continue;
    }

    const self =
      room.world.planets.find((planet) => planet.playerId === playerId) ?? null;
    const privateState = room.privateStates.get(playerId);
    if (!self || !privateState) {
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

  return room.world.planets.map((planet) => {
    const dragActive =
      planet.debuffs.dragUntilTick !== undefined &&
      planet.debuffs.dragUntilTick > nextTick;
    const normalizedDebuffs =
      planet.debuffs.dragUntilTick !== undefined &&
      planet.debuffs.dragUntilTick <= nextTick
        ? {}
        : planet.debuffs;
    const stepped = stepBody(
      {
        ...planet,
        debuffs: normalizedDebuffs,
      },
      nextSuns,
      1 / config.tickHz,
      blackHole,
    );

    return dragActive
      ? {
          ...stepped,
          vel: scale(stepped.vel, umbraDragStepMultiplier(config.tickHz)),
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
  debrisSink: Debris[],
): PlanetPublic[] => {
  const deadPlayerIds = new Set<PlayerId>();

  for (let index = 0; index < planets.length; index += 1) {
    const planet = planets[index]!;

    if (isInsideBlackHole(planet, blackHole)) {
      deadPlayerIds.add(planet.playerId);
      queueKillEvent(room, nextTick, planet, "blackHole");
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
      if (deadPlayerIds.has(other.playerId)) {
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
    return planets;
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
        planet.playerId,
      ),
    );
    markPlayerDeath(room, planet.playerId, nextTick);
  }

  return survivors;
};

const applyBoundaryDamage = (
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

    runtime.boundaryEnteredTick ??= nextTick;
    const outsideSec = (nextTick - runtime.boundaryEnteredTick) / config.tickHz;
    const dps =
      outsideSec >= BOUNDARY_DAMAGE_SPEC.rampAfterSec
        ? BOUNDARY_DAMAGE_SPEC.maxDps
        : BOUNDARY_DAMAGE_SPEC.baseDps;
    const hpAfter = Math.max(0, planet.hp - dps / config.tickHz);
    if (hpAfter > 0) {
      survivors.push({
        ...planet,
        hp: hpAfter,
      });
      continue;
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
        planet.playerId,
      ),
    );
    markPlayerDeath(room, planet.playerId, nextTick);
  }

  return survivors;
};

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

const stepDrones = (
  room: Room,
  planets: readonly PlanetPublic[],
  suns: readonly Sun[],
  blackHole: BlackHole | undefined,
  config: AppConfig,
): Drone[] => {
  if (!room.world) {
    return [];
  }

  const dtSec = 1 / config.tickHz;

  return room.world.drones.map((drone) => {
    const runtime = room.combatRuntimeFor(drone.ownerId);
    let nextDrone = drone;
    if (runtime.activeDroneId === drone.id && runtime.controlMode === "drone") {
      const turnInput = getDroneTurnInput(
        runtime.droneTurnLeft,
        runtime.droneTurnRight,
      );
      const forwardDir = getDroneForwardDir(nextDrone);
      const turnAngleRad =
        ((DRONE_SPEC.turnRateDeg * Math.PI) / 180) * dtSec * turnInput;
      const thrustDir =
        turnInput === 0 ? forwardDir : rotateVec2(forwardDir, turnAngleRad);
      const currentSpeed = Math.max(
        len(nextDrone.vel),
        DRONE_LAUNCH_SPEED * 0.75,
      );
      nextDrone = {
        ...nextDrone,
        vel: clampLen(
          add(
            scale(thrustDir, currentSpeed),
            scale(thrustDir, DRONE_SPEC.thrust * dtSec),
          ),
          DRONE_SPEC.speed,
        ),
      };
    }

    nextDrone = stepBody(nextDrone, suns, dtSec, blackHole);

    return {
      ...nextDrone,
      vel: clampLen(nextDrone.vel, DRONE_SPEC.speed),
    };
  });
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
      cache,
      suns,
      dtSec,
      CACHE_GRAVITY_SCALE,
      blackHole,
    ),
  );
};

const applyRocketCollisions = (
  room: Room,
  planets: PlanetPublic[],
  rockets: Rocket[],
  drones: Drone[],
  caches: Cache[],
  suns: readonly Sun[],
  blackHole: BlackHole | undefined,
  nextTick: number,
  config: AppConfig,
  debrisSink: Debris[],
): {
  planets: PlanetPublic[];
  rockets: Rocket[];
  drones: Drone[];
  caches: Cache[];
} => {
  const survivingRockets: Rocket[] = [];
  const destroyedRocketIds = new Set<number>();
  const destroyedCacheIds = new Set<number>();
  const destroyedDroneIds = new Set<number>();

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

  const scheduleDroneRemoval = (droneId: number): void => {
    destroyedDroneIds.add(droneId);
  };

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
        ),
      );
      continue;
    }

    let consumed = false;

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
        ),
      );
      continue;
    }

    for (const drone of drones) {
      if (destroyedDroneIds.has(drone.id)) {
        continue;
      }

      if (dist(rocket.pos, drone.pos) <= rocket.radius + drone.radius) {
        scheduleDroneRemoval(drone.id);
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
        ),
      );
      continue;
    }

    for (let planetIndex = 0; planetIndex < planets.length; planetIndex += 1) {
      const planet = planets[planetIndex]!;
      const withinSelfHitGrace =
        planet.playerId === rocket.ownerId &&
        nextTick < runtime.spawnedAtTick + selfHitGraceTicks(config.tickHz);
      if (withinSelfHitGrace) {
        continue;
      }

      if (dist(rocket.pos, planet.pos) <= rocket.radius + planet.radius) {
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
                    nextTick + umbraDragDurationTicks(config.tickHz),
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
        ),
      );
      continue;
    }

    for (const planet of planets) {
      const withinSelfHitGrace =
        planet.playerId === rocket.ownerId &&
        nextTick < runtime.spawnedAtTick + selfHitGraceTicks(config.tickHz);
      if (
        withinSelfHitGrace ||
        runtime.nearMissedPlayerIds.has(planet.playerId)
      ) {
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

  for (const droneId of destroyedDroneIds) {
    const drone = drones.find((item) => item.id === droneId);
    if (!drone) {
      continue;
    }
    removeDrone(room, drone.ownerId, droneId, nextTick, debrisSink);
  }

  const survivingDrones = room.world?.drones ?? drones;
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
    drones: survivingDrones,
    caches: survivingCaches,
  };
};

const applyDroneAndCacheCollisions = (
  room: Room,
  planets: PlanetPublic[],
  drones: Drone[],
  caches: Cache[],
  suns: readonly Sun[],
  blackHole: BlackHole | undefined,
  nextTick: number,
  config: AppConfig,
  debrisSink: Debris[],
): {
  drones: Drone[];
  caches: Cache[];
} => {
  if (!room.world) {
    return { drones, caches };
  }

  room.world.drones = drones;
  room.world.caches = caches;

  const destroyedCacheIds = new Set<number>();

  for (const drone of [...room.world.drones]) {
    if (drone.ttlUntilTick <= nextTick || isInsideBlackHole(drone, blackHole)) {
      removeDrone(room, drone.ownerId, drone.id, nextTick, debrisSink);
      continue;
    }

    let removed = false;
    for (const sun of suns) {
      if (dist(drone.pos, sun.pos) <= drone.radius + sun.radius) {
        removeDrone(room, drone.ownerId, drone.id, nextTick, debrisSink);
        removed = true;
        break;
      }
    }
    if (removed) {
      continue;
    }

    for (let planetIndex = 0; planetIndex < planets.length; planetIndex += 1) {
      const planet = planets[planetIndex]!;
      if (dist(drone.pos, planet.pos) > drone.radius + planet.radius) {
        continue;
      }

      if (planet.playerId === drone.ownerId) {
        continue;
      }

      if (shieldProtectsImpact(planet, drone.pos, nextTick)) {
        planets[planetIndex] = applyShieldDamage(planet, DRONE_SPEC.damage);
        removeDrone(room, drone.ownerId, drone.id, nextTick, debrisSink);
        removed = true;
        break;
      }

      const hpAfter = Math.max(0, planet.hp - DRONE_SPEC.damage);
      planets[planetIndex] = {
        ...planet,
        hp: hpAfter,
      };
      if (hpAfter <= 0) {
        room.combatRuntimeFor(drone.ownerId).kills += 1;
        queueKillEvent(room, nextTick, planet, "rocket", drone.ownerId);
        debrisSink.push(
          ...createDebrisBurst(
            room,
            planet,
            PLANET_DEBRIS_PIECES,
            PLANET_DEBRIS_SPEED,
            PLANET_DEBRIS_SPEED_VARIANCE,
            nextTick,
            planet.playerId,
          ),
        );
        markPlayerDeath(room, planet.playerId, nextTick);
        planets.splice(planetIndex, 1);
      }

      removeDrone(room, drone.ownerId, drone.id, nextTick, debrisSink);
      removed = true;
      break;
    }
    if (removed) {
      continue;
    }
  }

  const remainingCaches: Cache[] = [];
  for (const cache of room.world.caches) {
    if (isInsideBlackHole(cache, blackHole)) {
      destroyedCacheIds.add(cache.id);
    } else if (
      suns.some((sun) => dist(cache.pos, sun.pos) <= cache.radius + sun.radius)
    ) {
      destroyedCacheIds.add(cache.id);
    } else if (
      planets.some(
        (planet) => dist(cache.pos, planet.pos) <= cache.radius + planet.radius,
      )
    ) {
      destroyedCacheIds.add(cache.id);
    }

    if (destroyedCacheIds.has(cache.id)) {
      debrisSink.push(
        ...createDebrisBurst(
          room,
          cache,
          CACHE_DEBRIS_PIECES,
          CACHE_DEBRIS_SPEED,
          CACHE_DEBRIS_SPEED_VARIANCE,
          nextTick,
        ),
      );
      queueCacheRespawn(room, nextTick + getCacheRespawnTicks(config.tickHz));
      continue;
    }

    remainingCaches.push(cache);
  }

  while (
    room.cacheRespawnAtTicks.length > 0 &&
    room.cacheRespawnAtTicks[0]! <= nextTick &&
    remainingCaches.length < CACHE_SPEC.count
  ) {
    room.cacheRespawnAtTicks.shift();
    remainingCaches.push(createOuterRingCache(room));
  }

  return {
    drones: room.world.drones,
    caches: remainingCaches,
  };
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
    const planet = room.world.planets[planetIndex]!;
    const privateState = room.privateStates.get(planet.playerId);
    if (!privateState) {
      continue;
    }

    refreshBoostCharges(
      privateState,
      planet.archetype,
      nextTick,
      config.tickHz,
    );

    if (privateState.cooldowns.heavyReloadUntilTick <= nextTick) {
      privateState.cooldowns.heavyReloadUntilTick = 0;
    }
    if (privateState.cooldowns.seekerReloadUntilTick <= nextTick) {
      privateState.cooldowns.seekerReloadUntilTick = 0;
    }
    if (
      privateState.cooldowns.foresightActiveUntilTick <= nextTick &&
      privateState.cooldowns.foresightCooldownUntilTick <= nextTick
    ) {
      privateState.cooldowns.foresightActiveUntilTick = 0;
      privateState.cooldowns.foresightCooldownUntilTick = 0;
      privateState.cooldowns.foresightDurationTicks = getForesightDurationTicks(
        planet.archetype,
        config.tickHz,
        false,
      );
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
  const blackHole = room.world.blackHole;
  const nextSuns = stepSuns(room.world.suns, dtSec, blackHole).filter(
    (sun) => !isInsideBlackHole(sun, blackHole),
  );

  let nextPlanets = stepPlanets(room, nextSuns, blackHole, nextTick, config);
  ensurePlanetPointers(room, nextPlanets);

  const debris: Debris[] = [];

  nextPlanets = applyPlanetCollisions(
    room,
    nextPlanets,
    nextSuns,
    blackHole,
    nextTick,
    debris,
  );
  nextPlanets = applyBoundaryDamage(
    room,
    nextPlanets,
    nextTick,
    config,
    debris,
  );

  const nextRockets = stepRockets(
    room,
    nextPlanets,
    nextSuns,
    blackHole,
    config,
  );
  const nextDrones = stepDrones(room, nextPlanets, nextSuns, blackHole, config);
  const nextCaches = stepCaches(room, nextSuns, blackHole, config);

  const rocketCollisionState = applyRocketCollisions(
    room,
    nextPlanets,
    nextRockets,
    nextDrones,
    nextCaches,
    nextSuns,
    blackHole,
    nextTick,
    config,
    debris,
  );

  const droneAndCacheState = applyDroneAndCacheCollisions(
    room,
    rocketCollisionState.planets,
    rocketCollisionState.drones,
    rocketCollisionState.caches,
    nextSuns,
    blackHole,
    nextTick,
    config,
    debris,
  );

  applyCooldownsAndRegen(room, nextTick, config);

  room.world = {
    ...room.world,
    suns: nextSuns,
    planets: rocketCollisionState.planets,
    rockets: rocketCollisionState.rockets,
    drones: droneAndCacheState.drones,
    caches: droneAndCacheState.caches,
    debris: [
      ...room.world.debris
        .filter((piece) => piece.ttlUntilTick > nextTick)
        .map((piece) => stepBody(piece, nextSuns, dtSec, blackHole)),
      ...debris,
    ],
  };
  ensurePlanetPointers(room, room.world.planets);
  room.tick = nextTick;
  room.recordPlanetPositions(lagCompHistoryEntries(config.tickHz));
  room.recordSnapshotState(config.snapshotHistoryTicks);

  if (room.world.planets.length <= 1) {
    room.finalizeMatch(Date.now(), config.tickHz);
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
  const planets = diffEntityCollection(
    baseState.world.planets,
    room.world.planets,
  );
  const rockets = diffEntityCollection(
    baseState.world.rockets,
    room.world.rockets,
  );
  const drones = diffEntityCollection(
    baseState.world.drones,
    room.world.drones,
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
      ...(planets.changed ? { planets: planets.changed } : {}),
      ...(rockets.changed ? { rockets: rockets.changed } : {}),
      ...(drones.changed ? { drones: drones.changed } : {}),
      ...(caches.changed ? { caches: caches.changed } : {}),
      ...(debris.changed ? { debris: debris.changed } : {}),
      ...(currentBlackHole !== null &&
      JSON.stringify(previousBlackHole) !== JSON.stringify(currentBlackHole)
        ? { blackHole: currentBlackHole }
        : {}),
    },
    removed: {
      ...(suns.removed ? { suns: suns.removed } : {}),
      ...(planets.removed ? { planets: planets.removed } : {}),
      ...(rockets.removed ? { rockets: rockets.removed } : {}),
      ...(drones.removed ? { drones: drones.removed } : {}),
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
    this.#lastLoopAtMs = Date.now();
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
      Math.round(1000 / this.config.tickHz),
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

    const nowMs = Date.now();
    const dtMs = 1000 / this.config.tickHz;
    this.#accumulatorMs += nowMs - this.#lastLoopAtMs;
    this.#lastLoopAtMs = nowMs;

    const steps = Math.max(1, Math.floor(this.#accumulatorMs / dtMs));
    this.#accumulatorMs = Math.max(0, this.#accumulatorMs - steps * dtMs);

    let endedThisLoop = false;
    for (let step = 0; step < steps; step += 1) {
      updateWorld(this.room, this.config);
      if (this.room.phase !== "combat") {
        endedThisLoop = true;
        break;
      }
    }

    this.onBroadcast(this.room, {
      emitDeltaSnapshot:
        !endedThisLoop &&
        this.room.tick > 0 &&
        this.room.tick % this.config.snapshotIntervalTicks === 0,
      emitFullSnapshot: endedThisLoop,
    });

    if (endedThisLoop) {
      this.stop();
      return;
    }

    this.scheduleNextLoop();
  }
}
