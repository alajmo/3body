import {
  type AbilityMsg,
  normalizePlayerName,
  type ArchetypeId,
  type BotDifficulty,
  type ChatMsg,
  type FireRocketMsg,
  type HelloMsg,
  type InputMsg,
  type JoinRequest,
  type PlayerId,
  type ShieldAimMsg,
  type VoteRematchMsg,
} from "@3body/shared";
import type { AppConfig } from "./config";
import { config } from "./config";
import { Connection } from "./connection";
import { newOpaqueToken, newRoomId } from "./ids";
import { log } from "./log";
import type { QueuedCombatMessage, RoomAdvanceEvent } from "./room";
import { Room } from "./room";
import type { DrainStatsWritesResult, StatsStore } from "./stats-store";
import { buildRoomDeltaSnapshot, RoomTicker } from "./tick";

const serializeError = (error: unknown): Record<string, unknown> =>
  error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    : { error: String(error) };

class SlidingWindowLimiter {
  readonly #entries = new Map<string, number[]>();

  consume(
    key: string,
    limit: number,
    windowMs: number,
    nowMs = Date.now(),
  ): boolean {
    const entries = this.#entries.get(key) ?? [];
    const cutoffMs = nowMs - windowMs;

    while (entries.length > 0 && entries[0]! <= cutoffMs) {
      entries.shift();
    }

    if (entries.length >= limit) {
      this.#entries.set(key, entries);
      return false;
    }

    entries.push(nowMs);
    this.#entries.set(key, entries);
    return true;
  }
}

const normalizeOptionalToken = (
  value: string | undefined,
): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

type RoomAdmissionSuccess = {
  ok: true;
  room: Room;
  reclaimed: boolean;
  role: "host" | "player" | "spectator";
  participant?: ReturnType<Room["addPlayer"]>;
  resumeToken: string;
};

type RoomAdmissionFailure = {
  ok: false;
  code:
    | "invalid_room"
    | "room_full"
    | "server_full"
    | "bad_resume_token"
    | "rate_limited";
  message: string;
  closeCode?: number;
};

export class MatchmakingService {
  readonly config: AppConfig;
  readonly #connections = new Map<string, Connection>();
  readonly #rooms = new Map<string, Room>();
  readonly #tickers = new Map<string, RoomTicker>();
  readonly #socketCountsByIp = new Map<string, number>();
  readonly #limiter = new SlidingWindowLimiter();

  #admissionsOpen = true;

  constructor(
    appConfig: AppConfig = config,
    readonly statsStore: StatsStore,
  ) {
    this.config = appConfig;
  }

  createPendingConnection(
    clientIp: string,
  ):
    | { ok: true; connection: Connection }
    | { ok: false; status: number; message: string } {
    if (!this.#admissionsOpen) {
      return { ok: false, status: 503, message: "Server is shutting down" };
    }

    if (
      !this.#limiter.consume(
        `handshake:${clientIp}`,
        this.config.handshakesPerIpPerMin,
        60_000,
      )
    ) {
      log.warn("rate_limited_upgrade", { clientIp });
      return {
        ok: false,
        status: 429,
        message: "Too many websocket handshakes",
      };
    }

    const currentSockets = this.#socketCountsByIp.get(clientIp) ?? 0;
    if (currentSockets >= this.config.maxSocketsPerIp) {
      log.warn("socket_cap_reached", { clientIp, currentSockets });
      return { ok: false, status: 429, message: "Too many sockets for IP" };
    }

    const connection = new Connection(this, crypto.randomUUID(), clientIp);
    this.#connections.set(connection.id, connection);
    this.#socketCountsByIp.set(clientIp, currentSockets + 1);
    return { ok: true, connection };
  }

  disposePendingConnection(connectionId: string): void {
    const connection = this.#connections.get(connectionId);
    if (!connection) {
      return;
    }

    this.#connections.delete(connectionId);
    this.decrementSocketCount(connection.clientIp);
  }

  connectionForId(connectionId: string): Connection | undefined {
    return this.#connections.get(connectionId);
  }

  handleHello(connection: Connection, message: HelloMsg): void {
    const playerName = normalizePlayerName(message.name);
    if (!playerName) {
      connection.sendError("name_invalid", "Player name must be 1-16 chars");
      connection.close(1008, "name_invalid");
      return;
    }

    const profileToken =
      normalizeOptionalToken(message.profileToken) ?? newOpaqueToken();
    let playerIdentity: { playerId: PlayerId; profileTokenHash: string };
    try {
      playerIdentity = this.statsStore.resolvePlayerIdentity(
        profileToken,
        playerName,
      );
    } catch (error) {
      log.error("identity_resolution_failed", {
        clientIp: connection.clientIp,
        connId: connection.id,
        ...serializeError(error),
      });
      connection.close(1011, "identity_resolution_failed");
      return;
    }

    const result = this.admitToRoom({
      connection,
      join: message.join,
      playerId: playerIdentity.playerId,
      playerName,
      profileTokenHash: playerIdentity.profileTokenHash,
      requestedResumeToken: normalizeOptionalToken(message.resumeToken),
    });

    if (!result.ok) {
      connection.sendError(result.code, result.message);
      if (result.closeCode !== undefined) {
        connection.close(result.closeCode, result.code);
      }
      return;
    }

    const { room } = result;
    const transitionEvents = room.advance(Date.now());

    if (result.role === "spectator") {
      room.addSpectator(connection.id);
    }

    connection.setSession({
      playerId: playerIdentity.playerId,
      playerName,
      profileToken,
      profileTokenHash: playerIdentity.profileTokenHash,
      resumeToken: result.resumeToken,
      roomId: room.id,
      role: result.role,
    });

    connection.send({
      type: "welcome",
      playerId: playerIdentity.playerId,
      profileToken,
      roomId: room.id,
      roomKind: room.kind,
      resumeToken: result.resumeToken,
      role: result.role,
      roster: room.roster(),
    });

    if (transitionEvents.length > 0) {
      this.processRoomEvents(room, transitionEvents);
    } else if (room.phase === "lobby") {
      this.broadcastLobbyState(room);
    } else {
      this.sendCurrentPhaseState(connection, room);
    }

    log.info("player_admitted", {
      clientIp: connection.clientIp,
      roomId: room.id,
      roomKind: room.kind,
      phase: room.phase,
      playerId: playerIdentity.playerId,
      reclaimed: result.reclaimed,
      role: result.role,
    });
  }

  handleReadyToggle(connection: Connection): void {
    const resolved = this.resolveRoomParticipant(connection);
    if (!resolved) {
      return;
    }

    const { room, participant } = resolved;
    if (room.phase !== "lobby") {
      connection.sendError(
        "phase_invalid",
        "readyToggle is only valid in lobby",
      );
      return;
    }

    if (participant.isBot) {
      connection.sendError("invalid_action", "Bots cannot toggle ready");
      return;
    }

    room.toggleReady(participant.playerId);
    this.broadcastLobbyState(room);
  }

  handleSetBotDifficulty(
    connection: Connection,
    difficulty: BotDifficulty,
  ): void {
    const resolved = this.resolveRoomParticipant(connection);
    if (!resolved) {
      return;
    }

    const { room, participant } = resolved;
    if (room.phase !== "lobby") {
      connection.sendError(
        "phase_invalid",
        "setBotDifficulty is only valid in lobby",
      );
      return;
    }

    if (room.kind !== "private" || room.hostPlayerId !== participant.playerId) {
      connection.sendError(
        "not_host",
        "Only the host may change bot difficulty",
      );
      return;
    }

    room.setBotDifficulty(difficulty);
    this.broadcastLobbyState(room);
  }

  handleHostStart(connection: Connection): void {
    const resolved = this.resolveRoomParticipant(connection);
    if (!resolved) {
      return;
    }

    const { room, participant } = resolved;
    if (room.phase !== "lobby") {
      connection.sendError("phase_invalid", "hostStart is only valid in lobby");
      return;
    }

    if (room.kind !== "private" || room.hostPlayerId !== participant.playerId) {
      connection.sendError("not_host", "Only the host may start the room");
      return;
    }

    this.processRoomEvents(room, room.hostStart(Date.now()));
  }

  handlePickArchetype(connection: Connection, archetypeId: ArchetypeId): void {
    const resolved = this.resolveRoomParticipant(connection);
    if (!resolved) {
      return;
    }

    const { room, participant } = resolved;
    if (room.phase !== "pick") {
      connection.sendError(
        "phase_invalid",
        "pickArchetype is only valid in pick",
      );
      return;
    }

    if (participant.isBot) {
      connection.sendError("invalid_action", "Bots cannot pick archetypes");
      return;
    }

    room.pickArchetype(participant.playerId, archetypeId);
    const transitionEvents = room.advance(Date.now());

    if (transitionEvents.length > 0) {
      this.processRoomEvents(room, transitionEvents);
      return;
    }

    this.broadcastPickState(room);
  }

  handleAckSnapshot(connection: Connection, tick: number): void {
    if (tick > connection.lastAckTick) {
      connection.lastAckTick = tick;
    }
  }

  private dispatchCombatAction(
    connection: Connection,
    actionName: string,
    spectatorDenial: string,
    buildMessage: (playerId: PlayerId) => QueuedCombatMessage,
  ): void {
    const resolved = this.resolveRoomParticipant(connection);
    if (!resolved) {
      return;
    }

    const { room, participant } = resolved;
    if (room.phase !== "combat") {
      if (room.phase === "countdown" || room.phase === "ended") {
        return;
      }
      connection.sendError(
        "phase_invalid",
        `${actionName} is only valid in combat`,
      );
      return;
    }

    if (!room.privateStates.has(participant.playerId)) {
      connection.sendError("invalid_action", spectatorDenial);
      return;
    }

    room.enqueueCombatMessage(buildMessage(participant.playerId));
  }

  handleCombatInput(connection: Connection, message: InputMsg): void {
    this.dispatchCombatAction(
      connection,
      "input",
      "Spectators cannot control planets",
      (playerId) => ({
        type: "input",
        playerId,
        mouseDir: message.mouseDir,
        clientTick: message.clientTick,
      }),
    );
  }

  handleFireRocket(connection: Connection, message: FireRocketMsg): void {
    this.dispatchCombatAction(
      connection,
      "fireRocket",
      "Spectators cannot fire rockets",
      (playerId) => ({
        type: "fireRocket",
        playerId,
        kind: message.kind,
        aimDir: message.aimDir,
        targetId: message.targetId,
        clientTick: message.clientTick,
      }),
    );
  }

  handleShieldAim(connection: Connection, message: ShieldAimMsg): void {
    this.dispatchCombatAction(
      connection,
      "shieldAim",
      "Spectators cannot aim shields",
      (playerId) => ({ type: "shieldAim", playerId, dir: message.dir }),
    );
  }

  handleAbility(connection: Connection, message: AbilityMsg): void {
    this.dispatchCombatAction(
      connection,
      "ability",
      "Spectators cannot use combat abilities",
      (playerId) => ({
        type: "ability",
        playerId,
        slot: message.slot,
        aimDir: message.aimDir,
      }),
    );
  }

  handleVoteRematch(connection: Connection, message: VoteRematchMsg): void {
    const resolved = this.resolveRoomParticipant(connection);
    if (!resolved) {
      return;
    }

    const { room, participant } = resolved;
    if (room.phase !== "ended") {
      connection.sendError(
        "phase_invalid",
        "voteRematch is only valid after a match",
      );
      return;
    }

    if (participant.isBot) {
      connection.sendError("invalid_action", "Bots cannot vote rematch");
      return;
    }

    const events = room.applyRematchVote(
      participant.playerId,
      message.yes,
      Date.now(),
    );
    if (events.length > 0) {
      this.processRoomEvents(room, events);
    }
  }

  handleChat(connection: Connection, message: ChatMsg): void {
    const resolved = this.resolveRoomParticipant(connection);
    if (!resolved) {
      return;
    }

    const prepared = connection.prepareChatMessage(message.text);
    if (!prepared.ok) {
      connection.sendError(prepared.code, prepared.message);
      return;
    }

    const atMs = Date.now();
    for (const connId of resolved.room.activeConnectionIds()) {
      this.#connections.get(connId)?.send({
        type: "chatMessage",
        fromPlayerId: resolved.participant.playerId,
        text: prepared.text,
        atMs,
      });
    }
  }

  handleClosedConnection(connection: Connection): void {
    if (!this.#connections.delete(connection.id)) {
      return;
    }

    this.decrementSocketCount(connection.clientIp);

    if (!connection.roomId || !connection.playerId) {
      return;
    }

    const room = this.#rooms.get(connection.roomId);
    if (!room) {
      return;
    }

    if (connection.role === "spectator") {
      room.removeSpectator(connection.id);
      return;
    }

    const changed = room.markDisconnected(
      connection.playerId,
      Date.now(),
      this.config.reclaimGraceMs,
    );
    if (changed && room.phase === "lobby") {
      this.broadcastLobbyState(room);
    }
  }

  beginShutdown(): void {
    this.#admissionsOpen = false;
  }

  async drainStatsWrites(timeoutMs: number): Promise<DrainStatsWritesResult> {
    return this.statsStore.drainWrites(timeoutMs);
  }

  activeMatchRoomIds(): string[] {
    return [...this.#rooms.values()]
      .filter((room) => room.phase === "countdown" || room.phase === "combat")
      .map((room) => room.id);
  }

  closeAllConnections(code = 1012, reason = "server_shutdown"): void {
    for (const ticker of this.#tickers.values()) {
      ticker.stop();
    }
    this.#tickers.clear();

    for (const connection of this.#connections.values()) {
      connection.close(code, reason);
    }
  }

  pruneRooms(nowMs = Date.now()): void {
    for (const room of this.#rooms.values()) {
      const changed = room.releaseExpiredReclaims(nowMs);
      if (changed && room.phase === "lobby") {
        this.broadcastLobbyState(room);
      }

      this.processRoomEvents(room, room.advance(nowMs));
      this.syncRoomTicker(room);
      this.enqueueFinishedMatchSummary(room);

      if (room.shouldExpire(nowMs, this.config.roomIdleTimeoutMs)) {
        this.closeRoomConnections(room, 1001, "room_expired");
        this.stopRoomTicker(room.id);
        this.#rooms.delete(room.id);
        log.info("room_expired", { roomId: room.id, roomKind: room.kind });
      }
    }
  }

  private admitToRoom(input: {
    connection: Connection;
    join: JoinRequest;
    playerId: string;
    playerName: Exclude<ReturnType<typeof normalizePlayerName>, null>;
    profileTokenHash: string;
    requestedResumeToken?: string;
  }): RoomAdmissionSuccess | RoomAdmissionFailure {
    switch (input.join.kind) {
      case "createRoom":
        return this.handleCreateRoom({
          connection: input.connection,
          playerId: input.playerId,
          playerName: input.playerName,
          profileTokenHash: input.profileTokenHash,
          requestedResumeToken: input.requestedResumeToken,
        });
      case "quickGame":
        return this.handleQuickGame({
          connection: input.connection,
          playerId: input.playerId,
          playerName: input.playerName,
          profileTokenHash: input.profileTokenHash,
          requestedResumeToken: input.requestedResumeToken,
        });
      case "joinRoom":
        return this.handleJoinRoom({
          connection: input.connection,
          join: input.join,
          playerId: input.playerId,
          playerName: input.playerName,
          profileTokenHash: input.profileTokenHash,
          requestedResumeToken: input.requestedResumeToken,
        });
    }
  }

  private handleCreateRoom(input: {
    connection: Connection;
    playerId: string;
    playerName: Exclude<ReturnType<typeof normalizePlayerName>, null>;
    profileTokenHash: string;
    requestedResumeToken?: string;
  }): RoomAdmissionSuccess | RoomAdmissionFailure {
    if (input.requestedResumeToken !== undefined) {
      return {
        ok: false,
        code: "bad_resume_token",
        message: "Resume token requires an existing room",
      };
    }

    if (
      !this.#limiter.consume(
        `create:${input.connection.clientIp}`,
        this.config.createsPerIpPer10m,
        10 * 60_000,
      )
    ) {
      log.warn("rate_limited", {
        clientIp: input.connection.clientIp,
        connId: input.connection.id,
        scope: "create_room",
      });
      return {
        ok: false,
        code: "rate_limited",
        message: "Too many room creates from this IP",
      };
    }

    if (this.#rooms.size >= this.config.maxRooms) {
      return {
        ok: false,
        code: "server_full",
        message: "Server is already hosting the maximum number of rooms",
      };
    }

    const room = new Room(this.createUniqueRoomId(), "private");
    this.#rooms.set(room.id, room);

    const participant = room.addPlayer({
      playerId: input.playerId,
      name: input.playerName,
      connId: input.connection.id,
      profileTokenHash: input.profileTokenHash,
      resumeToken: newOpaqueToken(),
    });

    return {
      ok: true,
      room,
      participant,
      reclaimed: false,
      role: room.roleForPlayer(participant.playerId),
      resumeToken: participant.resumeToken,
    };
  }

  private handleQuickGame(input: {
    connection: Connection;
    playerId: string;
    playerName: Exclude<ReturnType<typeof normalizePlayerName>, null>;
    profileTokenHash: string;
    requestedResumeToken?: string;
  }): RoomAdmissionSuccess | RoomAdmissionFailure {
    if (input.requestedResumeToken !== undefined) {
      return {
        ok: false,
        code: "bad_resume_token",
        message: "Resume quick-game joins must target a specific room",
      };
    }

    if (
      !this.#limiter.consume(
        `join:${input.connection.clientIp}`,
        this.config.joinsPerIpPerMin,
        60_000,
      )
    ) {
      log.warn("rate_limited", {
        clientIp: input.connection.clientIp,
        connId: input.connection.id,
        scope: "quick_game_join",
      });
      return {
        ok: false,
        code: "rate_limited",
        message: "Too many room joins from this IP",
      };
    }

    let room = [...this.#rooms.values()].find(
      (candidate) =>
        candidate.kind === "public" &&
        candidate.phase === "lobby" &&
        !candidate.isFull(),
    );

    if (!room) {
      if (this.#rooms.size >= this.config.maxRooms) {
        return {
          ok: false,
          code: "server_full",
          message: "Server is already hosting the maximum number of rooms",
        };
      }

      room = new Room(this.createUniqueRoomId(), "public");
      this.#rooms.set(room.id, room);
    }

    const participant = room.addPlayer({
      playerId: input.playerId,
      name: input.playerName,
      connId: input.connection.id,
      profileTokenHash: input.profileTokenHash,
      resumeToken: newOpaqueToken(),
    });

    return {
      ok: true,
      room,
      participant,
      reclaimed: false,
      role: room.roleForPlayer(participant.playerId),
      resumeToken: participant.resumeToken,
    };
  }

  private handleJoinRoom(input: {
    connection: Connection;
    join: Extract<JoinRequest, { kind: "joinRoom" }>;
    playerId: string;
    playerName: Exclude<ReturnType<typeof normalizePlayerName>, null>;
    profileTokenHash: string;
    requestedResumeToken?: string;
  }): RoomAdmissionSuccess | RoomAdmissionFailure {
    if (
      !this.#limiter.consume(
        `join:${input.connection.clientIp}`,
        this.config.joinsPerIpPerMin,
        60_000,
      )
    ) {
      log.warn("rate_limited", {
        clientIp: input.connection.clientIp,
        connId: input.connection.id,
        roomId: input.join.roomId,
        scope: "join_room",
      });
      return {
        ok: false,
        code: "rate_limited",
        message: "Too many room joins from this IP",
      };
    }

    const room = this.#rooms.get(input.join.roomId);
    if (!room) {
      return {
        ok: false,
        code: "invalid_room",
        message: "Room not found",
      };
    }

    if (input.requestedResumeToken !== undefined) {
      const existingParticipant = room.findParticipantByResumeToken(
        input.requestedResumeToken,
      );
      if (
        !existingParticipant ||
        existingParticipant.profileTokenHash !== input.profileTokenHash
      ) {
        return {
          ok: false,
          code: "bad_resume_token",
          message: "Resume token is invalid for this room",
        };
      }

      if (
        existingParticipant.connId &&
        existingParticipant.connId !== input.connection.id
      ) {
        const previousConnection = this.#connections.get(
          existingParticipant.connId,
        );
        previousConnection?.clearRoomSession();
        previousConnection?.close(4001, "session_reclaimed");
      }

      const participant = room.reclaimPlayer(existingParticipant.playerId, {
        connId: input.connection.id,
        name: input.playerName,
        resumeToken: newOpaqueToken(),
      });

      return {
        ok: true,
        room,
        participant,
        reclaimed: true,
        role: room.roleForPlayer(participant.playerId),
        resumeToken: participant.resumeToken,
      };
    }

    if (room.phase !== "lobby") {
      return {
        ok: true,
        room,
        reclaimed: false,
        role: "spectator",
        resumeToken: newOpaqueToken(),
      };
    }

    if (room.isFull()) {
      return {
        ok: false,
        code: "room_full",
        message: "Room is already in progress or full",
      };
    }

    const participant = room.addPlayer({
      playerId: input.playerId,
      name: input.playerName,
      connId: input.connection.id,
      profileTokenHash: input.profileTokenHash,
      resumeToken: newOpaqueToken(),
    });

    return {
      ok: true,
      room,
      participant,
      reclaimed: false,
      role: room.roleForPlayer(participant.playerId),
      resumeToken: participant.resumeToken,
    };
  }

  private resolveRoomParticipant(connection: Connection): {
    room: Room;
    participant: NonNullable<ReturnType<Room["findParticipant"]>>;
  } | null {
    if (!connection.roomId || !connection.playerId) {
      connection.sendError("invalid_action", "Connection is not in a room");
      return null;
    }

    const room = this.#rooms.get(connection.roomId);
    if (!room) {
      connection.sendError("invalid_room", "Room no longer exists");
      return null;
    }

    if (connection.role === "spectator") {
      connection.sendError(
        "invalid_action",
        "Spectators cannot perform this action",
      );
      return null;
    }

    const participant = room.findParticipant(connection.playerId);
    if (!participant) {
      connection.sendError("invalid_action", "Player is not in this room");
      return null;
    }

    return { room, participant };
  }

  private sendCurrentPhaseState(connection: Connection, room: Room): void {
    switch (room.phase) {
      case "lobby":
        connection.send(room.lobbyState());
        break;
      case "pick":
        connection.send(room.pickState());
        break;
      case "countdown": {
        room.recordSnapshotState(this.config.snapshotHistoryTicks);
        const snapshot = room.fullSnapshotFor(
          connection.role === "spectator" ? undefined : connection.playerId,
        );
        if (snapshot) {
          connection.send(snapshot);
          connection.rememberSentSelfState(snapshot.self);
        }
        const countdown = room.countdownMessage();
        if (countdown) {
          connection.send(countdown);
        }
        break;
      }
      case "combat":
      case "ended": {
        this.syncRoomTicker(room);
        room.recordSnapshotState(this.config.snapshotHistoryTicks);
        const snapshot = room.fullSnapshotFor(
          connection.role === "spectator" ? undefined : connection.playerId,
        );
        if (snapshot) {
          connection.send(snapshot);
          connection.rememberSentSelfState(snapshot.self);
        }
        if (room.phase === "ended") {
          const matchEnd = room.matchEndMessage();
          if (matchEnd) {
            connection.send(matchEnd);
          }
          const rematchState = room.rematchStateMessage();
          if (rematchState) {
            connection.send(rematchState);
          }
        }
        break;
      }
    }
  }

  private processRoomEvents(room: Room, events: RoomAdvanceEvent[]): void {
    for (const event of events) {
      switch (event) {
        case "lobbyState":
          this.broadcastLobbyState(room);
          break;
        case "pickState":
          this.broadcastPickState(room);
          break;
        case "countdownStarted":
          this.broadcastFullSnapshots(room);
          this.broadcastCountdown(room);
          break;
        case "rematchState":
          this.broadcastRematchState(room);
          break;
      }
    }
  }

  private syncRoomTicker(room: Room): void {
    if (room.phase !== "combat" || !room.world) {
      this.stopRoomTicker(room.id);
      return;
    }

    let ticker = this.#tickers.get(room.id);
    if (!ticker) {
      ticker = new RoomTicker(room, this.config, (activeRoom, broadcast) => {
        this.broadcastRoomEvents(activeRoom);
        if (broadcast.emitFullSnapshot) {
          this.enqueueFinishedMatchSummary(activeRoom);
          this.broadcastFullSnapshots(activeRoom);
          this.broadcastMatchEnd(activeRoom);
          this.broadcastRematchState(activeRoom);
          return;
        }
        if (broadcast.emitDeltaSnapshot) {
          this.broadcastDeltaSnapshots(activeRoom);
        }
      });
      this.#tickers.set(room.id, ticker);
    }

    if (!ticker.running) {
      ticker.start();
    }
  }

  private broadcastLobbyState(room: Room): void {
    const message = room.lobbyState();

    for (const connId of room.activeConnectionIds()) {
      this.#connections.get(connId)?.send(message);
    }
  }

  private broadcastPickState(room: Room): void {
    const message = room.pickState();

    for (const connId of room.activeConnectionIds()) {
      this.#connections.get(connId)?.send(message);
    }
  }

  private broadcastFullSnapshots(room: Room): void {
    room.recordSnapshotState(this.config.snapshotHistoryTicks);
    for (const connId of room.activeConnectionIds()) {
      const connection = this.#connections.get(connId);
      const snapshot = room.fullSnapshotFor(
        connection?.role === "spectator" ? undefined : connection?.playerId,
      );
      if (connection && snapshot) {
        connection.send(snapshot);
        connection.rememberSentSelfState(snapshot.self);
      }
    }
  }

  private broadcastRoomEvents(room: Room): void {
    const events = room.drainPendingEvents();
    if (events.length === 0) {
      return;
    }

    for (const event of events) {
      for (const connId of room.activeConnectionIds()) {
        this.#connections.get(connId)?.send({
          type: "event",
          event,
        });
      }
    }
  }

  private broadcastMatchEnd(room: Room): void {
    const message = room.matchEndMessage();
    if (!message) {
      return;
    }

    for (const connId of room.activeConnectionIds()) {
      this.#connections.get(connId)?.send(message);
    }
  }

  private broadcastCountdown(room: Room): void {
    const message = room.countdownMessage();
    if (!message) {
      return;
    }

    for (const connId of room.activeConnectionIds()) {
      this.#connections.get(connId)?.send(message);
    }
  }

  private broadcastRematchState(room: Room): void {
    const message = room.rematchStateMessage();
    if (!message) {
      return;
    }

    for (const connId of room.activeConnectionIds()) {
      this.#connections.get(connId)?.send(message);
    }
  }

  private broadcastDeltaSnapshots(room: Room): void {
    room.recordSnapshotState(this.config.snapshotHistoryTicks);
    for (const connId of room.activeConnectionIds()) {
      const connection = this.#connections.get(connId);
      if (!connection) {
        continue;
      }

      const baseTick =
        connection.lastAckTick > 0
          ? Math.min(connection.lastAckTick, room.tick)
          : Math.max(0, room.tick - this.config.snapshotIntervalTicks);
      if (room.snapshotStateFor(baseTick) === null) {
        const snapshot = room.fullSnapshotFor(
          connection.role === "spectator" ? undefined : connection.playerId,
        );
        if (snapshot) {
          connection.send(snapshot);
          connection.rememberSentSelfState(snapshot.self);
        }
        continue;
      }
      const delta = buildRoomDeltaSnapshot(room, baseTick);
      if (!delta) {
        continue;
      }

      const currentSelf =
        connection.role === "spectator" || connection.playerId === undefined
          ? null
          : (room.privateStates.get(connection.playerId) ?? null);
      const currentSelfSignature =
        currentSelf === null ? "null" : JSON.stringify(currentSelf);
      const includeSelf =
        currentSelfSignature !== connection.lastSentSelfStateSignature;

      connection.send({
        ...delta,
        ...(includeSelf ? { self: currentSelf } : {}),
      });
      if (includeSelf) {
        connection.lastSentSelfStateSignature = currentSelfSignature;
      }
    }
  }

  private createUniqueRoomId(): string {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const roomId = newRoomId();
      if (!this.#rooms.has(roomId)) {
        return roomId;
      }
    }

    throw new Error("Unable to allocate a unique room id");
  }

  private decrementSocketCount(clientIp: string): void {
    const currentSockets = this.#socketCountsByIp.get(clientIp) ?? 0;
    if (currentSockets <= 1) {
      this.#socketCountsByIp.delete(clientIp);
      return;
    }

    this.#socketCountsByIp.set(clientIp, currentSockets - 1);
  }

  private stopRoomTicker(roomId: string): void {
    const ticker = this.#tickers.get(roomId);
    if (!ticker) {
      return;
    }

    ticker.stop();
    this.#tickers.delete(roomId);
  }

  private enqueueFinishedMatchSummary(room: Room): void {
    const summary = room.takePendingFinishedMatchSummary();
    if (!summary) {
      return;
    }

    this.statsStore.enqueueFinishedMatch(summary);
  }

  private closeRoomConnections(room: Room, code: number, reason: string): void {
    for (const connId of room.activeConnectionIds()) {
      this.#connections.get(connId)?.close(code, reason);
    }
  }
}
