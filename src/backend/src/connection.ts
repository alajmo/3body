import {
  type AbilityMsg,
  ARCHETYPE_IDS,
  type ArchetypeId,
  type ChatMsg,
  decodeProtocolMessage,
  type ErrorCode,
  encodeProtocolMessage,
  type FireRocketMsg,
  type HelloMsg,
  type InputMsg,
  type JoinRequest,
  type PingMsg,
  type PlanetPrivateState,
  type PlayerId,
  type PlayerName,
  type PlayerRole,
  type PongMsg,
  type ProfileToken,
  type ResumeToken,
  type ServerMsg,
  type ShieldAimMsg,
  SIM_HZ,
  SNAPSHOT_HZ,
  type VoteRematchMsg,
} from "@3body/shared";
import { log } from "./log";
import type { MatchmakingService } from "./matchmaking";

export interface ConnectionWebSocketData {
  connId: string;
  clientIp: string;
}

interface HandshakeSession {
  playerId: PlayerId;
  playerName: PlayerName;
  profileToken: ProfileToken;
  profileTokenHash: string;
  resumeToken: ResumeToken;
  roomId: string;
  role: PlayerRole;
}

class RateBucket {
  #tokens: number;
  #lastRefillAtMs = Date.now();

  constructor(
    readonly ratePerSec: number,
    readonly burst: number,
  ) {
    this.#tokens = burst;
  }

  consume(nowMs = Date.now(), cost = 1): boolean {
    const elapsedMs = Math.max(0, nowMs - this.#lastRefillAtMs);
    this.#lastRefillAtMs = nowMs;
    this.#tokens = Math.min(
      this.burst,
      this.#tokens + (elapsedMs / 1000) * this.ratePerSec,
    );

    if (this.#tokens < cost) {
      return false;
    }

    this.#tokens -= cost;
    return true;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isVec2 = (value: unknown): value is { x: number; y: number } =>
  isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);

const isJoinRequest = (value: unknown): value is JoinRequest => {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }

  switch (value.kind) {
    case "quickGame":
      return true;
    case "joinRoom":
      return typeof value.roomId === "string";
    default:
      return false;
  }
};

const isHelloMsg = (value: unknown): value is HelloMsg =>
  isRecord(value) &&
  value.type === "hello" &&
  typeof value.name === "string" &&
  isJoinRequest(value.join) &&
  (value.profileToken === undefined ||
    typeof value.profileToken === "string") &&
  (value.resumeToken === undefined || typeof value.resumeToken === "string") &&
  (value.snapshotVersion === undefined ||
    value.snapshotVersion === 1 ||
    value.snapshotVersion === 2);

const isPingMsg = (value: unknown): value is PingMsg =>
  isRecord(value) &&
  value.type === "ping" &&
  typeof value.id === "string" &&
  typeof value.clientSentAtMs === "number";

const isInputMsg = (value: unknown): value is InputMsg =>
  isRecord(value) &&
  value.type === "input" &&
  isVec2(value.mouseDir) &&
  (value.boostHeld === undefined || typeof value.boostHeld === "boolean") &&
  isFiniteNumber(value.clientTick);

const isFireRocketMsg = (value: unknown): value is FireRocketMsg =>
  isRecord(value) &&
  value.type === "fireRocket" &&
  (value.kind === "light" ||
    value.kind === "heavy" ||
    value.kind === "seeker") &&
  isVec2(value.aimDir) &&
  isFiniteNumber(value.clientTick) &&
  (value.targetId === undefined || isFiniteNumber(value.targetId));

const isShieldAimMsg = (value: unknown): value is ShieldAimMsg =>
  isRecord(value) && value.type === "shieldAim" && isVec2(value.dir);

const isAbilitySlot = (value: unknown): value is AbilityMsg["slot"] =>
  value === "q" ||
  value === "w" ||
  value === "e" ||
  value === "g" ||
  value === "c";

const isAbilityMsg = (value: unknown): value is AbilityMsg =>
  isRecord(value) &&
  value.type === "ability" &&
  isAbilitySlot(value.slot) &&
  (value.aimDir === undefined || isVec2(value.aimDir));

const isVoteRematchMsg = (value: unknown): value is VoteRematchMsg =>
  isRecord(value) &&
  value.type === "voteRematch" &&
  typeof value.yes === "boolean";

const isRejoinMsg = (value: unknown): value is { type: "rejoin" } =>
  isRecord(value) && value.type === "rejoin";

const isChatMsg = (value: unknown): value is ChatMsg =>
  isRecord(value) && value.type === "chat" && typeof value.text === "string";

const isArchetypeId = (value: unknown): value is ArchetypeId =>
  typeof value === "string" && ARCHETYPE_IDS.includes(value as ArchetypeId);

const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f-\u009f]/gu;

type PreparedChatMessage =
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      code: "invalid_message" | "rate_limited";
      message: string;
    };

type OutboundEncoding = "json" | "msgpack";
const SNAPSHOT_ACK_RATE_LIMIT_HZ = SNAPSHOT_HZ * 2;

export const getPrivateStateSignature = (
  state: PlanetPrivateState | null,
): string =>
  state === null
    ? "null"
    : [
        state.planetId,
        state.ammo.light,
        state.ammo.heavy,
        state.ammo.seeker,
        state.cooldowns.lightReloadUntilTick,
        state.cooldowns.heavyReloadUntilTick,
        state.cooldowns.seekerReloadUntilTick,
        state.cooldowns.nextBoostChargeAtTick ?? "",
        state.boostCharges,
        state.gravityPulseHeld ? 1 : 0,
        state.nextShieldExt ? 1 : 0,
      ].join("|");

export class Connection {
  ws?: Bun.ServerWebSocket<ConnectionWebSocketData>;
  playerId?: PlayerId;
  playerName?: PlayerName;
  profileToken?: ProfileToken;
  profileTokenHash?: string;
  resumeToken?: ResumeToken;
  roomId?: string;
  role?: PlayerRole;
  outboundEncoding: OutboundEncoding = "msgpack";
  snapshotVersion: 1 | 2 = 1;
  lastAckTick = 0;
  lastSentSelfStateSignature?: string;
  outboundQueuedBytes = 0;
  alive = true;

  #closed = false;
  #helloHandled = false;
  #inputBucket = new RateBucket(SIM_HZ, SIM_HZ);
  #snapshotAckBucket = new RateBucket(
    SNAPSHOT_ACK_RATE_LIMIT_HZ,
    SNAPSHOT_ACK_RATE_LIMIT_HZ,
  );
  #actionBucket = new RateBucket(20, 20);
  #metaBucket = new RateBucket(10, 10);
  #chatSentAtMs: number[] = [];
  #chatMutedUntilMs = 0;
  #lastAcceptedChatText?: string;
  #duplicateChatCount = 0;

  constructor(
    readonly service: MatchmakingService,
    readonly id: string,
    readonly clientIp: string,
  ) {}

  attachSocket(ws: Bun.ServerWebSocket<ConnectionWebSocketData>): void {
    this.ws = ws;
    this.outboundQueuedBytes = ws.getBufferedAmount();
  }

  setSession(session: HandshakeSession): void {
    this.#helloHandled = true;
    this.playerId = session.playerId;
    this.playerName = session.playerName;
    this.profileToken = session.profileToken;
    this.profileTokenHash = session.profileTokenHash;
    this.resumeToken = session.resumeToken;
    this.roomId = session.roomId;
    this.role = session.role;
  }

  markHelloHandled(): void {
    this.#helloHandled = true;
  }

  clearRoomSession(): void {
    this.playerId = undefined;
    this.playerName = undefined;
    this.resumeToken = undefined;
    this.roomId = undefined;
    this.role = undefined;
    this.outboundEncoding = "msgpack";
    this.snapshotVersion = 1;
    this.lastAckTick = 0;
    this.lastSentSelfStateSignature = undefined;
    this.outboundQueuedBytes = 0;
  }

  rememberSentSelfState(state: PlanetPrivateState | null): void {
    this.lastSentSelfStateSignature = getPrivateStateSignature(state);
  }

  #withSendTimestamp(message: ServerMsg): ServerMsg {
    switch (message.type) {
      case "deltaSnapshot":
      case "fullSnapshot":
      case "snapshotV2":
        return {
          ...message,
          sentAtMs: performance.now(),
        };
      default:
        return message;
    }
  }

  send(message: ServerMsg): boolean {
    if (!this.ws) {
      return false;
    }

    const outboundMessage = this.#withSendTimestamp(message);
    const payload =
      this.outboundEncoding === "json"
        ? JSON.stringify(outboundMessage)
        : encodeProtocolMessage(outboundMessage);
    const payloadByteLength =
      typeof payload === "string"
        ? Buffer.byteLength(payload)
        : payload.byteLength;
    const status =
      typeof payload === "string"
        ? this.ws.sendText(payload)
        : this.ws.sendBinary(payload);
    this.outboundQueuedBytes = this.ws.getBufferedAmount();

    if (status === 0) {
      log.warn(
        "outbound_message_dropped",
        this.logContextData({
          messageType: message.type,
        }),
      );
      return false;
    }

    this.service.recordOutboundMessage(outboundMessage, payloadByteLength);

    if (
      status === -1 ||
      this.outboundQueuedBytes >= this.service.config.outboundQueueMaxBytes
    ) {
      log.warn(
        "socket_backpressure",
        this.logContextData({
          messageType: message.type,
          queuedBytes: this.outboundQueuedBytes,
        }),
      );
      if (
        this.outboundQueuedBytes >= this.service.config.outboundQueueMaxBytes
      ) {
        log.warn(
          "slow_consumer_disconnect",
          this.logContextData({
            messageType: message.type,
            queuedBytes: this.outboundQueuedBytes,
          }),
        );
        this.close(1013, "slow_consumer");
        return false;
      }
    }

    return true;
  }

  sendError(code: ErrorCode, message: string): void {
    this.send({
      type: "error",
      code,
      message,
    });
  }

  close(code?: number, reason?: string): void {
    this.ws?.close(code, reason);
  }

  logRateLimited(scope: string, message: string): void {
    log.warn(
      "rate_limited",
      this.logContextData({
        scope,
        message,
      }),
    );
  }

  rejectInvalidMessage(
    message: string,
    closeReason: string,
    extra?: Record<string, unknown>,
  ): void {
    log.warn(
      "invalid_message",
      this.logContextData({
        message,
        closeReason,
        ...extra,
      }),
    );
    this.sendError("invalid_message", message);
    this.close(1003, closeReason);
  }

  consumeInputRateLimit(): boolean {
    return this.#inputBucket.consume();
  }

  consumeSnapshotAckRateLimit(): boolean {
    return this.#snapshotAckBucket.consume();
  }

  consumeActionRateLimit(): boolean {
    return this.#actionBucket.consume();
  }

  consumeMetaRateLimit(): boolean {
    return this.#metaBucket.consume();
  }

  private enforceRateLimit(
    kind: "input" | "action" | "meta",
    scope: string,
    message: string,
  ): boolean {
    const ok =
      kind === "input"
        ? this.consumeInputRateLimit()
        : kind === "action"
          ? this.consumeActionRateLimit()
          : this.consumeMetaRateLimit();
    if (ok) {
      return true;
    }
    this.logRateLimited(scope, message);
    this.sendError("rate_limited", message);
    return false;
  }

  prepareChatMessage(rawText: string): PreparedChatMessage {
    const nowMs = Date.now();
    if (nowMs < this.#chatMutedUntilMs) {
      log.warn(
        "chat_muted",
        this.logContextData({
          reason: "mute_window_active",
        }),
      );
      return {
        ok: false,
        code: "rate_limited",
        message: "Chat is temporarily muted",
      };
    }

    const text = rawText
      .replace(CONTROL_CHAR_RE, "")
      .trim()
      .replace(/\s+/g, " ");
    if (text.length === 0 || text.length > this.service.config.chatMaxChars) {
      log.warn(
        "invalid_message",
        this.logContextData({
          message: "Invalid chat payload",
          closeReason: "chat_validation_rejected",
          textLength: text.length,
        }),
      );
      return {
        ok: false,
        code: "invalid_message",
        message: `Chat must be 1-${this.service.config.chatMaxChars} characters`,
      };
    }

    const cutoffMs = nowMs - this.service.config.chatWindowMs;
    while (
      this.#chatSentAtMs.length > 0 &&
      this.#chatSentAtMs[0]! <= cutoffMs
    ) {
      this.#chatSentAtMs.shift();
    }

    if (this.#chatSentAtMs.length >= this.service.config.chatBurst) {
      this.#chatMutedUntilMs = nowMs + this.service.config.chatWindowMs;
      log.warn(
        "chat_muted",
        this.logContextData({
          reason: "burst_limit_exceeded",
          burstCount: this.#chatSentAtMs.length,
        }),
      );
      return {
        ok: false,
        code: "rate_limited",
        message: "Chat rate limit exceeded",
      };
    }

    if (text === this.#lastAcceptedChatText) {
      this.#duplicateChatCount += 1;
      if (this.#duplicateChatCount >= 2) {
        this.#chatMutedUntilMs = nowMs + this.service.config.chatWindowMs;
      }
      log.warn(
        "chat_muted",
        this.logContextData({
          reason: "duplicate_message",
          duplicateCount: this.#duplicateChatCount,
        }),
      );
      return {
        ok: false,
        code: "rate_limited",
        message: "Duplicate chat messages are suppressed",
      };
    }

    this.#duplicateChatCount = 0;
    this.#lastAcceptedChatText = text;
    this.#chatSentAtMs.push(nowMs);
    return {
      ok: true,
      text,
    };
  }

  onMessage(rawMessage: string | Buffer<ArrayBuffer>): void {
    const byteLength =
      typeof rawMessage === "string"
        ? Buffer.byteLength(rawMessage)
        : rawMessage.byteLength;

    if (byteLength > this.service.config.wsMaxMsgBytes) {
      log.warn(
        "invalid_message",
        this.logContextData({
          message: "WebSocket frame exceeded max size",
          closeReason: "message_too_large",
          byteLength,
        }),
      );
      this.close(1009, "message_too_large");
      return;
    }

    if (!this.#helloHandled) {
      this.outboundEncoding =
        typeof rawMessage === "string" ? "json" : "msgpack";
    }

    let parsed: unknown;
    try {
      parsed = decodeProtocolMessage(rawMessage);
    } catch {
      this.rejectInvalidMessage(
        "Malformed WebSocket payload",
        "invalid_payload_encoding",
      );
      return;
    }

    if (!this.#helloHandled) {
      if (!isHelloMsg(parsed)) {
        this.rejectInvalidMessage(
          "First message must be hello",
          "expected_hello",
        );
        return;
      }

      this.snapshotVersion = parsed.snapshotVersion === 2 ? 2 : 1;
      this.service.handleHello(this, parsed);
      return;
    }

    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      this.rejectInvalidMessage(
        "Message payload must be an object",
        "invalid_payload",
      );
      return;
    }

    switch (parsed.type) {
      case "ping": {
        if (!isPingMsg(parsed)) {
          this.rejectInvalidMessage("Invalid ping payload", "invalid_ping");
          return;
        }
        if (!this.enforceRateLimit("meta", "ping", "Too many ping messages")) {
          return;
        }

        const pong: PongMsg = {
          type: "pong",
          id: parsed.id,
          clientSentAtMs: parsed.clientSentAtMs,
          serverSentAtMs: Date.now(),
        };
        this.send(pong);
        return;
      }

      case "readyToggle":
        if (
          !this.enforceRateLimit("meta", "room_action", "Too many room actions")
        ) {
          return;
        }
        this.service.handleReadyToggle(this);
        return;

      case "pickArchetype":
        if (!isArchetypeId(parsed.id)) {
          this.rejectInvalidMessage("Invalid archetype id", "invalid_pick");
          return;
        }
        if (
          !this.enforceRateLimit("meta", "room_action", "Too many room actions")
        ) {
          return;
        }
        this.service.handlePickArchetype(this, parsed.id);
        return;

      case "ackSnapshot":
        if (typeof parsed.tick !== "number") {
          this.rejectInvalidMessage("Invalid ack tick", "invalid_ack_snapshot");
          return;
        }
        if (!this.consumeSnapshotAckRateLimit()) {
          this.logRateLimited("ack_snapshot", "Too many ackSnapshot messages");
          this.sendError("rate_limited", "Too many ackSnapshot messages");
          return;
        }
        this.service.handleAckSnapshot(this, parsed.tick);
        return;

      case "hello":
        this.sendError("invalid_action", "hello already handled");
        return;

      case "input":
        if (!isInputMsg(parsed)) {
          this.rejectInvalidMessage("Invalid input payload", "invalid_input");
          return;
        }
        if (
          !this.enforceRateLimit("input", "input", "Too many input messages")
        ) {
          return;
        }
        this.service.handleCombatInput(this, parsed);
        return;

      case "fireRocket":
        if (!isFireRocketMsg(parsed)) {
          this.rejectInvalidMessage(
            "Invalid fireRocket payload",
            "invalid_fire_rocket",
          );
          return;
        }
        if (
          !this.enforceRateLimit(
            "action",
            "combat_action",
            "Too many combat actions",
          )
        ) {
          return;
        }
        this.service.handleFireRocket(this, parsed);
        return;

      case "shieldAim":
        if (!isShieldAimMsg(parsed)) {
          this.rejectInvalidMessage(
            "Invalid shieldAim payload",
            "invalid_shield_aim",
          );
          return;
        }
        if (
          !this.enforceRateLimit(
            "input",
            "shield_aim",
            "Too many shieldAim messages",
          )
        ) {
          return;
        }
        this.service.handleShieldAim(this, parsed);
        return;

      case "ability":
        if (!isAbilityMsg(parsed)) {
          this.rejectInvalidMessage(
            "Invalid ability payload",
            "invalid_ability",
          );
          return;
        }
        if (
          !this.enforceRateLimit(
            "action",
            "combat_action",
            "Too many combat actions",
          )
        ) {
          return;
        }
        this.service.handleAbility(this, parsed);
        return;

      case "chat":
        if (!isChatMsg(parsed)) {
          this.rejectInvalidMessage("Invalid chat payload", "invalid_chat");
          return;
        }
        if (!this.enforceRateLimit("meta", "chat", "Too many chat messages")) {
          return;
        }
        this.service.handleChat(this, parsed);
        return;

      case "voteRematch":
        if (!isVoteRematchMsg(parsed)) {
          this.rejectInvalidMessage(
            "Invalid voteRematch payload",
            "invalid_vote_rematch",
          );
          return;
        }
        if (
          !this.enforceRateLimit("meta", "room_action", "Too many room actions")
        ) {
          return;
        }
        this.service.handleVoteRematch(this, parsed);
        return;

      case "rejoin":
        if (!isRejoinMsg(parsed)) {
          this.rejectInvalidMessage("Invalid rejoin payload", "invalid_rejoin");
          return;
        }
        if (
          !this.enforceRateLimit("meta", "room_action", "Too many room actions")
        ) {
          return;
        }
        this.service.handleRejoin(this);
        return;

      default:
        this.rejectInvalidMessage("Unknown message type", "unknown_message", {
          receivedType: parsed.type,
        });
    }
  }

  onClose(code?: number, reason?: string): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.alive = false;
    this.outboundQueuedBytes = 0;
    this.ws = undefined;
    log.info(
      "socket_closed",
      this.logContextData({
        code,
        reason,
      }),
    );
    this.service.handleClosedConnection(this);
  }

  onDrain(): void {
    this.outboundQueuedBytes = this.ws?.getBufferedAmount() ?? 0;
  }

  private logContextData(
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      connId: this.id,
      clientIp: this.clientIp,
      playerId: this.playerId,
      roomId: this.roomId,
      role: this.role,
      queuedBytes: this.outboundQueuedBytes,
      ...(extra ?? {}),
    };
  }
}
