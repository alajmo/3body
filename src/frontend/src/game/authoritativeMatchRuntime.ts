import type {
  Cache,
  Debris,
  DeltaSnapshotMsg,
  LobbyStateMsg,
  MatchEndMsg,
  NeutronStar,
  PickStateMsg,
  PlanetPrivateState,
  PlayerId,
  PlayerRole,
  RematchStateMsg,
  Rocket,
  RoomRosterEntry,
  SnapshotCacheUpdateRow,
  SnapshotDebrisUpdateRow,
  SnapshotEvent,
  SnapshotNeutronStarUpdateRow,
  SnapshotPlanetUpdateRow,
  SnapshotRocketUpdateRow,
  SnapshotSunUpdateRow,
  SnapshotV2Msg,
  Sun,
  World,
} from "@3body/shared";

export type AuthoritativeMatchPhase =
  | "combat"
  | "connecting"
  | "countdown"
  | "ended"
  | "error"
  | "lobby"
  | "pick"
  | "reconnecting";

export type AuthoritativeConnectionState =
  | "connected"
  | "connecting"
  | "error"
  | "reconnecting";

export interface AuthoritativeEventRecord {
  event: SnapshotEvent;
  id: number;
  receivedAtMs: number;
}

export interface AuthoritativeSnapshot {
  receivedAtMs: number;
  self: PlanetPrivateState | null;
  tick: number;
  world: World;
}

const AUTHORITATIVE_SNAPSHOT_BUFFER_LIMIT = 20;

export interface AuthoritativeMatchRuntimeState {
  connectionError: string | null;
  connectionState: AuthoritativeConnectionState;
  countdownEndsAtMs: number | null;
  lobbyState: LobbyStateMsg | null;
  matchEnd: MatchEndMsg | null;
  nextEventId: number;
  phase: AuthoritativeMatchPhase;
  pickState: PickStateMsg | null;
  playerId: PlayerId | null;
  previousSnapshot: AuthoritativeSnapshot | null;
  recentEvents: AuthoritativeEventRecord[];
  rematchState: RematchStateMsg | null;
  roomId: string | null;
  role: PlayerRole | null;
  roomRoster: RoomRosterEntry[];
  rttMs: number | null;
  snapshot: AuthoritativeSnapshot | null;
  snapshotBuffer: AuthoritativeSnapshot[];
}

export const resetAuthoritativeSnapshotBuffer = (
  runtime: Pick<
    AuthoritativeMatchRuntimeState,
    "previousSnapshot" | "snapshot" | "snapshotBuffer"
  >,
  snapshot: AuthoritativeSnapshot,
): void => {
  runtime.previousSnapshot = runtime.snapshot;
  runtime.snapshot = snapshot;
  runtime.snapshotBuffer.length = 0;
  runtime.snapshotBuffer.push(snapshot);
};

export const appendAuthoritativeSnapshot = (
  runtime: Pick<
    AuthoritativeMatchRuntimeState,
    "previousSnapshot" | "snapshot" | "snapshotBuffer"
  >,
  snapshot: AuthoritativeSnapshot,
): void => {
  runtime.previousSnapshot = runtime.snapshot;
  runtime.snapshot = snapshot;

  const lastSnapshot =
    runtime.snapshotBuffer[runtime.snapshotBuffer.length - 1] ?? null;
  if (lastSnapshot !== null && lastSnapshot.tick === snapshot.tick) {
    runtime.snapshotBuffer[runtime.snapshotBuffer.length - 1] = snapshot;
  } else {
    runtime.snapshotBuffer.push(snapshot);
  }

  while (runtime.snapshotBuffer.length > AUTHORITATIVE_SNAPSHOT_BUFFER_LIMIT) {
    runtime.snapshotBuffer.shift();
  }
};

const mergeEntityCollection = <T extends { id: number }>(
  current: readonly T[],
  changed: readonly T[] | undefined,
  removed: readonly number[] | undefined,
): T[] => {
  if ((changed?.length ?? 0) === 0 && (removed?.length ?? 0) === 0) {
    return current as T[];
  }

  const removedIds = new Set(removed ?? []);
  const changedById = new Map(
    (changed ?? []).map((entity) => [entity.id, entity]),
  );
  const next: T[] = [];
  const retainedIds = new Set<number>();

  for (const entity of current) {
    if (removedIds.has(entity.id)) {
      continue;
    }

    const updated = changedById.get(entity.id);
    next.push(updated ?? entity);
    retainedIds.add(entity.id);
  }

  for (const entity of changed ?? []) {
    if (!retainedIds.has(entity.id)) {
      next.push(entity);
    }
  }

  return next;
};

const mergeCompactEntityCollection = <
  T extends { id: number },
  TRow extends readonly [number, ...unknown[]],
>(
  current: readonly T[],
  spawns: readonly T[] | undefined,
  updates: readonly TRow[] | undefined,
  removed: readonly number[] | undefined,
  applyUpdate: (entity: T, row: TRow) => T,
): T[] => {
  if (
    (spawns?.length ?? 0) === 0 &&
    (updates?.length ?? 0) === 0 &&
    (removed?.length ?? 0) === 0
  ) {
    return current as T[];
  }

  const removedIds = new Set(removed ?? []);
  const spawnsById = new Map(
    (spawns ?? []).map((entity) => [entity.id, entity]),
  );
  const updatesById = new Map((updates ?? []).map((row) => [row[0], row]));
  const next: T[] = [];
  const retainedIds = new Set<number>();

  for (const entity of current) {
    if (removedIds.has(entity.id)) {
      continue;
    }

    const spawned = spawnsById.get(entity.id);
    if (spawned !== undefined) {
      next.push(spawned);
      retainedIds.add(entity.id);
      continue;
    }

    const update = updatesById.get(entity.id);
    next.push(update === undefined ? entity : applyUpdate(entity, update));
    retainedIds.add(entity.id);
  }

  for (const entity of spawns ?? []) {
    if (!retainedIds.has(entity.id) && !removedIds.has(entity.id)) {
      next.push(entity);
    }
  }

  return next;
};

const applySunUpdate = (sun: Sun, row: SnapshotSunUpdateRow): Sun => ({
  ...sun,
  mass: row[5],
  pos: { x: row[1], y: row[2] },
  radius: row[6],
  vel: { x: row[3], y: row[4] },
});

const applyNeutronStarUpdate = (
  neutronStar: NeutronStar,
  row: SnapshotNeutronStarUpdateRow,
): NeutronStar => ({
  ...neutronStar,
  mass: row[5],
  pos: { x: row[1], y: row[2] },
  radius: row[6],
  vel: { x: row[3], y: row[4] },
});

const applyPlanetUpdate = (
  planet: World["planets"][number],
  row: SnapshotPlanetUpdateRow,
): World["planets"][number] => ({
  ...planet,
  debuffs: row[11],
  hp: row[5],
  pos: { x: row[1], y: row[2] },
  shieldActive: row[8] === 1,
  shieldAimDir: { x: row[6], y: row[7] },
  shieldLoad: row[9],
  shieldMaxLoad: row[10],
  vel: { x: row[3], y: row[4] },
});

const applyRocketUpdate = (
  rocket: Rocket,
  row: SnapshotRocketUpdateRow,
): Rocket => ({
  ...rocket,
  pos: { x: row[1], y: row[2] },
  ttlUntilTick: row[5],
  vel: { x: row[3], y: row[4] },
});

const applyCacheUpdate = (
  cache: Cache,
  row: SnapshotCacheUpdateRow,
): Cache => ({
  ...cache,
  pos: { x: row[1], y: row[2] },
  vel: { x: row[3], y: row[4] },
});

const applyDebrisUpdate = (
  debris: Debris,
  row: SnapshotDebrisUpdateRow,
): Debris => ({
  ...debris,
  pos: { x: row[1], y: row[2] },
  ttlUntilTick: row[5],
  vel: { x: row[3], y: row[4] },
});

export const applyDeltaSnapshotToWorld = (
  baseWorld: World,
  deltaSnapshot: DeltaSnapshotMsg,
): World => {
  const nextSuns = mergeEntityCollection(
    baseWorld.suns,
    deltaSnapshot.changed.suns,
    deltaSnapshot.removed.suns,
  );
  const nextNeutronStars = mergeEntityCollection(
    baseWorld.neutronStars,
    deltaSnapshot.changed.neutronStars,
    deltaSnapshot.removed.neutronStars,
  );
  const nextPlanets = mergeEntityCollection(
    baseWorld.planets,
    deltaSnapshot.changed.planets,
    deltaSnapshot.removed.planets,
  );
  const nextRockets = mergeEntityCollection(
    baseWorld.rockets,
    deltaSnapshot.changed.rockets,
    deltaSnapshot.removed.rockets,
  );
  const nextCaches = mergeEntityCollection(
    baseWorld.caches,
    deltaSnapshot.changed.caches,
    deltaSnapshot.removed.caches,
  );
  const nextDebris = mergeEntityCollection(
    baseWorld.debris,
    deltaSnapshot.changed.debris,
    deltaSnapshot.removed.debris,
  );
  const nextBlackHole = deltaSnapshot.removed.blackHole
    ? undefined
    : deltaSnapshot.changed.blackHole === undefined
      ? baseWorld.blackHole
      : (deltaSnapshot.changed.blackHole ?? undefined);

  if (
    nextSuns === baseWorld.suns &&
    nextNeutronStars === baseWorld.neutronStars &&
    nextPlanets === baseWorld.planets &&
    nextRockets === baseWorld.rockets &&
    nextCaches === baseWorld.caches &&
    nextDebris === baseWorld.debris &&
    nextBlackHole === baseWorld.blackHole
  ) {
    return baseWorld;
  }

  return {
    ...baseWorld,
    suns: nextSuns,
    neutronStars: nextNeutronStars,
    planets: nextPlanets,
    rockets: nextRockets,
    caches: nextCaches,
    debris: nextDebris,
    blackHole: nextBlackHole,
  };
};

export const applySnapshotV2ToWorld = (
  baseWorld: World,
  snapshot: SnapshotV2Msg,
): World => {
  const nextSuns = mergeCompactEntityCollection(
    baseWorld.suns,
    snapshot.spawns.suns,
    snapshot.updates.suns,
    snapshot.removed.suns,
    applySunUpdate,
  );
  const nextNeutronStars = mergeCompactEntityCollection(
    baseWorld.neutronStars,
    snapshot.spawns.neutronStars,
    snapshot.updates.neutronStars,
    snapshot.removed.neutronStars,
    applyNeutronStarUpdate,
  );
  const nextPlanets = mergeCompactEntityCollection(
    baseWorld.planets,
    snapshot.spawns.planets,
    snapshot.updates.planets,
    snapshot.removed.planets,
    applyPlanetUpdate,
  );
  const nextRockets = mergeCompactEntityCollection(
    baseWorld.rockets,
    snapshot.spawns.rockets,
    snapshot.updates.rockets,
    snapshot.removed.rockets,
    applyRocketUpdate,
  );
  const nextCaches = mergeCompactEntityCollection(
    baseWorld.caches,
    snapshot.spawns.caches,
    snapshot.updates.caches,
    snapshot.removed.caches,
    applyCacheUpdate,
  );
  const nextDebris = mergeCompactEntityCollection(
    baseWorld.debris,
    snapshot.spawns.debris,
    snapshot.updates.debris,
    snapshot.removed.debris,
    applyDebrisUpdate,
  );
  const nextBlackHole = snapshot.removed.blackHole
    ? undefined
    : (snapshot.spawns.blackHole ??
      snapshot.updates.blackHole ??
      baseWorld.blackHole);
  const nextOrbitStarMotion =
    snapshot.updates.orbitStarMotion === undefined
      ? baseWorld.orbitStarMotion
      : (snapshot.updates.orbitStarMotion ?? undefined);

  if (
    nextSuns === baseWorld.suns &&
    nextNeutronStars === baseWorld.neutronStars &&
    nextPlanets === baseWorld.planets &&
    nextRockets === baseWorld.rockets &&
    nextCaches === baseWorld.caches &&
    nextDebris === baseWorld.debris &&
    nextBlackHole === baseWorld.blackHole &&
    nextOrbitStarMotion === baseWorld.orbitStarMotion
  ) {
    return baseWorld;
  }

  return {
    ...baseWorld,
    blackHole: nextBlackHole,
    caches: nextCaches,
    debris: nextDebris,
    neutronStars: nextNeutronStars,
    orbitStarMotion: nextOrbitStarMotion,
    planets: nextPlanets,
    rockets: nextRockets,
    suns: nextSuns,
  };
};

export const createInitialAuthoritativeMatchRuntimeState =
  (): AuthoritativeMatchRuntimeState => ({
    connectionError: null,
    connectionState: "connecting",
    countdownEndsAtMs: null,
    lobbyState: null,
    matchEnd: null,
    nextEventId: 1,
    phase: "connecting",
    pickState: null,
    playerId: null,
    previousSnapshot: null,
    recentEvents: [],
    rematchState: null,
    roomId: null,
    role: null,
    roomRoster: [],
    rttMs: null,
    snapshot: null,
    snapshotBuffer: [],
  });
