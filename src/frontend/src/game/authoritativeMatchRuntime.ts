import type {
  DeltaSnapshotMsg,
  LobbyStateMsg,
  MatchEndMsg,
  PickStateMsg,
  PlanetPrivateState,
  PlayerId,
  PlayerRole,
  RematchStateMsg,
  RoomRosterEntry,
  SnapshotEvent,
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
}

const mergeEntityCollection = <T extends { id: number }>(
  current: readonly T[],
  changed: readonly T[] | undefined,
  removed: readonly number[] | undefined,
): T[] => {
  if ((changed?.length ?? 0) === 0 && (removed?.length ?? 0) === 0) {
    return current as T[];
  }

  const removedIds = new Set(removed ?? []);
  const changedById = new Map((changed ?? []).map((entity) => [entity.id, entity]));
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
  });
