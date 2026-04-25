import {
  ARCHETYPE_IDS,
  MATCH_TIMERS,
  mulberry32,
  type AbilityMsg,
  type ArchetypeId,
  type BotDifficulty,
  type EntityId,
  type FireRocketMsg,
  type FullSnapshotMsg,
  type InputMsg,
  type LobbyPlayerSummary,
  type LobbyStateMsg,
  type MatchEndMsg,
  type MatchMvp,
  type MatchStats,
  type PickEntry,
  type PickStateMsg,
  type PlanetPrivateState,
  type PlayerId,
  type PlayerName,
  type RematchStateMsg,
  type ResumeToken,
  type RoomRosterEntry,
  type ShieldAimMsg,
  type SnapshotEvent,
  type Vec2,
  type VoteRematchMsg,
  type World,
  ROOM_CAPACITY,
} from "@3body/shared";
import { Bot } from "./bot";
import { EntityIdSequence, newOpaqueToken } from "./ids";
import { createInitialMatchState } from "./spawn";

const snapshotWorld = (world: World): World => ({
  ...world,
  suns: world.suns.slice(),
  neutronStars: world.neutronStars.slice(),
  planets: world.planets.slice(),
  rockets: world.rockets.slice(),
  caches: world.caches.slice(),
  debris: world.debris.slice(),
});

type RoomPhase = "lobby" | "pick" | "combat" | "ended";

export type RoomAdvanceEvent =
  | "lobbyState"
  | "pickState"
  | "combatStarted"
  | "rematchState";

const DEFAULT_INPUT_DIR: Vec2 = { x: 1, y: 0 };

interface CombatIntentState {
  mouseDir: Vec2;
  shieldAimDir: Vec2;
  boostHeld: boolean;
  boostActive: boolean;
  lastInputClientTick: number;
}

export interface RocketRuntimeState {
  damage: number;
  dragOnHit: boolean;
  turnRateMultiplier: number;
  spawnedAtTick: number;
  nearMissedPlayerIds: Set<PlayerId>;
}

export interface CombatPlayerRuntime {
  boundaryEnteredTick?: number;
  deathTick?: number;
  kills: number;
  nearMisses: number;
  damageDealt: number;
}

interface SnapshotHistoryEntry {
  tick: number;
  world: World;
}

interface PlanetPositionHistoryEntry {
  tick: number;
  pos: Vec2;
  vel: Vec2;
}

export interface FinishedMatchPlayerSummary {
  playerId?: PlayerId;
  profileTokenHash?: string;
  seat: number;
  isBot: boolean;
  nameAtMatch: PlayerName;
  archetypeId?: ArchetypeId;
  placement?: number;
  kills: number;
  survivalMs: number;
  nearMisses: number;
  damageDealt: number;
  won: boolean;
}

export interface FinishedMatchSummary {
  id: string;
  roomId: string;
  seed: number;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  winnerPlayerId?: PlayerId;
  reason: MatchEndMsg["reason"];
  mvpPlayerId?: PlayerId;
  mvpReason: string;
  players: FinishedMatchPlayerSummary[];
}

export type QueuedCombatMessage =
  | {
      type: "input";
      playerId: PlayerId;
      mouseDir: InputMsg["mouseDir"];
      boostHeld?: InputMsg["boostHeld"];
      clientTick: InputMsg["clientTick"];
    }
  | {
      type: "shieldAim";
      playerId: PlayerId;
      dir: ShieldAimMsg["dir"];
    }
  | {
      type: "fireRocket";
      playerId: PlayerId;
      kind: FireRocketMsg["kind"];
      aimDir: FireRocketMsg["aimDir"];
      targetId: FireRocketMsg["targetId"];
      clientTick: FireRocketMsg["clientTick"];
    }
  | {
      type: "ability";
      playerId: PlayerId;
      slot: AbilityMsg["slot"];
      aimDir?: AbilityMsg["aimDir"];
    };

interface RoomParticipant {
  playerId: PlayerId;
  name: PlayerName;
  seat: number;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
  connId?: string;
  resumeToken: ResumeToken;
  profileTokenHash: string;
  reclaimDeadlineAtMs?: number;
  difficulty?: BotDifficulty;
  botHandoffDifficulty?: BotDifficulty;
  archetypeId?: ArchetypeId;
  lockedIn: boolean;
}

const bySeat = (left: RoomParticipant, right: RoomParticipant): number =>
  left.seat - right.seat;

const HUMAN_AUTOFILL_SEED_SALT = 0x51a77e1d;
const BOT_PICK_SEED_SALT = 0x3a5391c5;

const botNameForSeat = (seat: number): PlayerName =>
  `Bot ${seat + 1}` as PlayerName;

export class Room {
  readonly entityIds = new EntityIdSequence();
  readonly autoStartAtMs: number;
  readonly participants = new Map<PlayerId, RoomParticipant>();
  readonly botControllers = new Map<PlayerId, Bot>();
  readonly spectatorConnIds = new Set<string>();
  readonly rng: () => number;
  readonly seed: number;
  readonly snapshotHistory: SnapshotHistoryEntry[] = [];
  readonly planetPositionHistory = new Map<
    EntityId,
    PlanetPositionHistoryEntry[]
  >();

  phase: RoomPhase = "lobby";
  tick = 0;
  botDifficulty: BotDifficulty = "easy";
  idleSinceMs?: number;
  pickDeadlineAtMs?: number;
  combatStartedAtMs?: number;
  currentMatchId?: string;
  matchEnd?: MatchEndMsg;
  pendingFinishedMatchSummary?: FinishedMatchSummary;
  rematchDeadlineAtMs?: number;
  world?: World;
  privateStates = new Map<PlayerId, PlanetPrivateState>();
  readonly combatInputQueue: QueuedCombatMessage[] = [];
  readonly combatIntents = new Map<PlayerId, CombatIntentState>();
  readonly combatPlayerRuntime = new Map<PlayerId, CombatPlayerRuntime>();
  readonly pendingEvents: SnapshotEvent[] = [];
  readonly rocketRuntime = new Map<EntityId, RocketRuntimeState>();
  readonly cacheRespawnAtTicks: number[] = [];
  readonly rematchYesPlayerIds = new Set<PlayerId>();

  constructor(
    readonly id: string,
    readonly createdAtMs = Date.now(),
  ) {
    this.autoStartAtMs = createdAtMs + MATCH_TIMERS.lobbySec * 1000;
    this.seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);
  }

  get size(): number {
    return this.participants.size;
  }

  isFull(): boolean {
    return this.size >= ROOM_CAPACITY;
  }

  findParticipant(playerId: PlayerId): RoomParticipant | undefined {
    return this.participants.get(playerId);
  }

  findParticipantByResumeToken(
    resumeToken: ResumeToken,
  ): RoomParticipant | undefined {
    return this.sortedParticipants().find(
      (participant) => participant.resumeToken === resumeToken,
    );
  }

  addPlayer(input: {
    playerId: PlayerId;
    name: PlayerName;
    connId: string;
    profileTokenHash: string;
    resumeToken: ResumeToken;
  }): RoomParticipant {
    const seat = this.nextOpenSeat();
    if (seat === null) {
      throw new Error(`Room ${this.id} is full`);
    }

    const participant: RoomParticipant = {
      playerId: input.playerId,
      name: input.name,
      seat,
      isBot: false,
      connected: true,
      ready: false,
      connId: input.connId,
      resumeToken: input.resumeToken,
      profileTokenHash: input.profileTokenHash,
      lockedIn: false,
    };

    this.participants.set(participant.playerId, participant);
    this.idleSinceMs = undefined;
    return participant;
  }

  reclaimPlayer(
    playerId: PlayerId,
    input: {
      connId: string;
      name: PlayerName;
      resumeToken: ResumeToken;
    },
  ): RoomParticipant {
    const participant = this.participants.get(playerId);
    if (!participant) {
      throw new Error(`Player ${playerId} is not in room ${this.id}`);
    }

    participant.connected = true;
    participant.connId = input.connId;
    participant.name = input.name;
    participant.resumeToken = input.resumeToken;
    participant.reclaimDeadlineAtMs = undefined;
    participant.botHandoffDifficulty = undefined;
    this.botControllers.delete(playerId);
    this.idleSinceMs = undefined;
    return participant;
  }

  markDisconnected(
    playerId: PlayerId,
    nowMs: number,
    reclaimGraceMs: number,
  ): boolean {
    const participant = this.participants.get(playerId);
    if (!participant?.connected) {
      return false;
    }

    participant.connected = false;
    participant.connId = undefined;
    participant.reclaimDeadlineAtMs = nowMs + reclaimGraceMs;
    if (!participant.isBot && this.phase !== "lobby" && this.phase !== "pick") {
      participant.botHandoffDifficulty = "normal";
      this.ensureBotController(participant.playerId, "normal");
    }
    this.refreshIdleState(nowMs);
    return true;
  }

  releaseExpiredReclaims(nowMs: number): boolean {
    let changed = false;

    for (const participant of this.sortedParticipants()) {
      if (
        participant.isBot ||
        participant.connected ||
        this.phase === "combat" ||
        this.phase === "ended" ||
        participant.reclaimDeadlineAtMs === undefined ||
        participant.reclaimDeadlineAtMs > nowMs
      ) {
        continue;
      }

      this.participants.delete(participant.playerId);
      this.privateStates.delete(participant.playerId);
      this.botControllers.delete(participant.playerId);
      changed = true;
    }

    if (changed) {
      this.refreshIdleState(nowMs);
    }

    return changed;
  }

  hasConnectedHumans(): boolean {
    return this.sortedParticipants().some(
      (participant) => !participant.isBot && participant.connected,
    );
  }

  hasActiveReclaim(nowMs: number): boolean {
    return this.sortedParticipants().some(
      (participant) =>
        !participant.isBot &&
        !participant.connected &&
        participant.reclaimDeadlineAtMs !== undefined &&
        participant.reclaimDeadlineAtMs > nowMs,
    );
  }

  shouldExpire(nowMs: number, idleTimeoutMs: number): boolean {
    if (this.hasConnectedHumans() || this.hasActiveReclaim(nowMs)) {
      this.idleSinceMs = undefined;
      return false;
    }

    this.idleSinceMs ??= nowMs;
    return nowMs - this.idleSinceMs >= idleTimeoutMs;
  }

  roster(): RoomRosterEntry[] {
    return this.sortedParticipants().map((participant) => ({
      playerId: participant.playerId,
      name: participant.name,
      seat: participant.seat,
      isBot: participant.isBot,
    }));
  }

  lobbyState(): LobbyStateMsg {
    const players: LobbyPlayerSummary[] = this.sortedParticipants().map(
      (participant) => ({
        playerId: participant.playerId,
        name: participant.name,
        seat: participant.seat,
        isBot: participant.isBot,
        connected: participant.connected,
        ready: participant.ready,
        archetypeId: participant.archetypeId,
        difficulty: participant.difficulty,
      }),
    );

    return {
      type: "lobbyState",
      players,
      autoStartAtMs: this.autoStartAtMs,
      botDifficulty: this.botDifficulty,
    };
  }

  pickState(): PickStateMsg {
    const picks: PickEntry[] = this.sortedParticipants().map((participant) => ({
      playerId: participant.playerId,
      archetypeId: participant.archetypeId,
      lockedIn: participant.lockedIn,
      isBot: participant.isBot,
    }));

    return {
      type: "pickState",
      picks,
      deadlineAtMs:
        this.pickDeadlineAtMs ?? Date.now() + MATCH_TIMERS.pickSec * 1000,
    };
  }

  matchEndMessage(): MatchEndMsg | null {
    return this.matchEnd ?? null;
  }

  takePendingFinishedMatchSummary(): FinishedMatchSummary | null {
    const summary = this.pendingFinishedMatchSummary ?? null;
    this.pendingFinishedMatchSummary = undefined;
    return summary;
  }

  rematchStateMessage(): RematchStateMsg | null {
    if (this.phase !== "ended" || this.rematchDeadlineAtMs === undefined) {
      return null;
    }

    return {
      type: "rematchState",
      yesPlayerIds: [...this.rematchYesPlayerIds],
      neededVotes: this.neededRematchVotes(),
      deadlineAtMs: this.rematchDeadlineAtMs,
    };
  }

  fullSnapshotFor(playerId?: PlayerId): FullSnapshotMsg | null {
    if (!this.world) {
      return null;
    }

    return {
      type: "fullSnapshot",
      tick: this.tick,
      world: this.world,
      self:
        playerId === undefined
          ? null
          : (this.privateStates.get(playerId) ?? null),
    };
  }

  activeConnectionIds(): string[] {
    return [
      ...this.sortedParticipants()
        .filter((participant) => participant.connected && participant.connId)
        .map((participant) => participant.connId!),
      ...this.spectatorConnIds,
    ];
  }

  addSpectator(connId: string): void {
    this.spectatorConnIds.add(connId);
    this.idleSinceMs = undefined;
  }

  removeSpectator(connId: string, nowMs = Date.now()): void {
    if (!this.spectatorConnIds.delete(connId)) {
      return;
    }

    this.refreshIdleState(nowMs);
  }

  recordSnapshotState(maxEntries: number): void {
    if (!this.world) {
      return;
    }

    const last = this.snapshotHistory[this.snapshotHistory.length - 1];
    if (last?.tick === this.tick) {
      return;
    }

    this.snapshotHistory.push({
      tick: this.tick,
      world: snapshotWorld(this.world),
    });

    while (this.snapshotHistory.length > maxEntries) {
      this.snapshotHistory.shift();
    }
  }

  snapshotStateFor(tick: number): SnapshotHistoryEntry | null {
    return this.snapshotHistory.find((entry) => entry.tick === tick) ?? null;
  }

  recordPlanetPositions(maxEntries?: number): void {
    if (!this.world) {
      return;
    }

    for (const planet of this.world.planets) {
      let history = this.planetPositionHistory.get(planet.id);
      if (!history) {
        history = [];
        this.planetPositionHistory.set(planet.id, history);
      }

      const sample: PlanetPositionHistoryEntry = {
        tick: this.tick,
        pos: { x: planet.pos.x, y: planet.pos.y },
        vel: { x: planet.vel.x, y: planet.vel.y },
      };
      const last = history[history.length - 1];
      if (last?.tick === this.tick) {
        history[history.length - 1] = sample;
      } else {
        history.push(sample);
      }

      if (maxEntries !== undefined) {
        while (history.length > maxEntries) {
          history.shift();
        }
      }
    }
  }

  planetPositionAtOrBefore(
    planetId: EntityId,
    tick: number,
  ): PlanetPositionHistoryEntry | null {
    const history = this.planetPositionHistory.get(planetId);
    if (!history) {
      return null;
    }

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const sample = history[index]!;
      if (sample.tick <= tick) {
        return sample;
      }
    }

    return null;
  }

  enqueueCombatMessage(message: QueuedCombatMessage): void {
    this.combatInputQueue.push(message);
  }

  drainCombatMessages(): QueuedCombatMessage[] {
    const drained = [...this.combatInputQueue];
    this.combatInputQueue.length = 0;
    return drained;
  }

  queueEvent(event: SnapshotEvent): void {
    this.pendingEvents.push(event);
  }

  drainPendingEvents(): SnapshotEvent[] {
    const drained = [...this.pendingEvents];
    this.pendingEvents.length = 0;
    return drained;
  }

  intentFor(playerId: PlayerId): CombatIntentState {
    let intent = this.combatIntents.get(playerId);
    if (intent) {
      return intent;
    }

    intent = {
      mouseDir: { ...DEFAULT_INPUT_DIR },
      shieldAimDir: { ...DEFAULT_INPUT_DIR },
      boostHeld: false,
      boostActive: false,
      lastInputClientTick: -1,
    };
    this.combatIntents.set(playerId, intent);
    return intent;
  }

  combatRuntimeFor(playerId: PlayerId): CombatPlayerRuntime {
    let runtime = this.combatPlayerRuntime.get(playerId);
    if (runtime) {
      return runtime;
    }

    runtime = {
      kills: 0,
      nearMisses: 0,
      damageDealt: 0,
    };
    this.combatPlayerRuntime.set(playerId, runtime);
    return runtime;
  }

  ensureBotController(playerId: PlayerId, difficulty: BotDifficulty): Bot {
    const participant = this.participants.get(playerId);
    if (!participant?.archetypeId) {
      throw new Error(
        `Cannot create bot controller without archetype for ${playerId}`,
      );
    }

    const existing = this.botControllers.get(playerId);
    if (existing) {
      existing.updateDifficulty(difficulty);
      existing.updateArchetype(participant.archetypeId);
      return existing;
    }

    const bot = new Bot(playerId, difficulty, participant.archetypeId);
    this.botControllers.set(playerId, bot);
    return bot;
  }

  removeBotController(playerId: PlayerId): void {
    this.botControllers.delete(playerId);
  }

  botDifficultyFor(playerId: PlayerId): BotDifficulty | null {
    const participant = this.participants.get(playerId);
    if (!participant) {
      return null;
    }

    if (participant.isBot) {
      return participant.difficulty ?? this.botDifficulty;
    }

    return participant.botHandoffDifficulty ?? null;
  }

  activeBotPlayerIds(): PlayerId[] {
    const activePlayers = new Set(
      (this.world?.planets ?? []).map((planet) => planet.playerId),
    );

    return this.sortedParticipants()
      .filter((participant) => {
        const difficulty = this.botDifficultyFor(participant.playerId);
        return difficulty !== null && activePlayers.has(participant.playerId);
      })
      .map((participant) => participant.playerId);
  }

  toggleReady(playerId: PlayerId): boolean {
    const participant = this.participants.get(playerId);
    if (!participant || participant.isBot) {
      return false;
    }

    participant.ready = !participant.ready;
    return true;
  }

  finalizeMatch(nowMs: number, tickHz: number): boolean {
    if (this.matchEnd !== undefined) {
      return false;
    }

    const alivePlanets = this.world?.planets ?? [];
    const reason = alivePlanets.length === 1 ? "lastAlive" : "mutualKill";
    const winnerId =
      reason === "lastAlive" ? alivePlanets[0]?.playerId : undefined;
    const stats = this.sortedParticipants().map<MatchStats>((participant) => {
      const runtime = this.combatRuntimeFor(participant.playerId);
      const survivalTick = runtime.deathTick ?? this.tick;
      return {
        playerId: participant.playerId,
        kills: runtime.kills,
        survivalMs: Math.round((survivalTick * 1000) / tickHz),
        nearMisses: runtime.nearMisses,
        damageDealt: Math.round(runtime.damageDealt),
      };
    });

    const mvp = pickMatchMvp(stats, winnerId);
    const placements = rankMatchPlacements(stats);
    const startedAtMs =
      this.combatStartedAtMs ??
      Math.max(
        this.createdAtMs,
        nowMs - Math.round((this.tick * 1000) / tickHz),
      );
    const winnerParticipant =
      winnerId === undefined ? undefined : this.findParticipant(winnerId);
    const mvpParticipant = this.findParticipant(mvp.playerId);
    this.phase = "ended";
    this.rematchYesPlayerIds.clear();
    this.rematchDeadlineAtMs = nowMs + MATCH_TIMERS.rematchVoteSec * 1000;
    this.matchEnd = {
      type: "matchEnd",
      winnerId,
      reason,
      mvp,
      stats,
      rematchDeadlineAtMs: this.rematchDeadlineAtMs,
    };
    this.pendingFinishedMatchSummary = {
      id: this.currentMatchId ?? newOpaqueToken(),
      roomId: this.id,
      seed: this.seed,
      startedAtMs,
      endedAtMs: nowMs,
      durationMs: Math.max(0, nowMs - startedAtMs),
      winnerPlayerId:
        winnerParticipant && !winnerParticipant.isBot
          ? winnerParticipant.playerId
          : undefined,
      reason,
      mvpPlayerId:
        mvpParticipant && !mvpParticipant.isBot
          ? mvpParticipant.playerId
          : undefined,
      mvpReason: mvp.reason,
      players: this.sortedParticipants().map((participant) => {
        const runtime = this.combatRuntimeFor(participant.playerId);
        const survivalTick = runtime.deathTick ?? this.tick;
        return {
          playerId: participant.isBot ? undefined : participant.playerId,
          profileTokenHash: participant.isBot
            ? undefined
            : participant.profileTokenHash,
          seat: participant.seat,
          isBot: participant.isBot,
          nameAtMatch: participant.name,
          archetypeId: participant.archetypeId,
          placement: placements.get(participant.playerId),
          kills: runtime.kills,
          survivalMs: Math.round((survivalTick * 1000) / tickHz),
          nearMisses: runtime.nearMisses,
          damageDealt: Math.round(runtime.damageDealt),
          won: participant.playerId === winnerId,
        } satisfies FinishedMatchPlayerSummary;
      }),
    };
    return true;
  }

  applyRematchVote(
    playerId: PlayerId,
    yes: VoteRematchMsg["yes"],
    nowMs: number,
  ): RoomAdvanceEvent[] {
    if (
      this.phase !== "ended" ||
      this.rematchDeadlineAtMs === undefined ||
      nowMs > this.rematchDeadlineAtMs
    ) {
      return [];
    }

    if (yes) {
      this.rematchYesPlayerIds.add(playerId);
    } else {
      this.rematchYesPlayerIds.delete(playerId);
    }

    if (this.rematchYesPlayerIds.size >= this.neededRematchVotes()) {
      this.restartForRematch(nowMs);
      return ["pickState"];
    }

    return ["rematchState"];
  }

  pickArchetype(playerId: PlayerId, archetypeId: ArchetypeId): boolean {
    const participant = this.participants.get(playerId);
    if (!participant || participant.isBot) {
      return false;
    }

    participant.archetypeId = archetypeId;
    participant.lockedIn = true;
    return true;
  }

  advance(nowMs: number): RoomAdvanceEvent[] {
    if (
      this.phase === "lobby" &&
      this.hasHumanParticipants() &&
      (this.isFull() || nowMs >= this.autoStartAtMs)
    ) {
      return this.transitionToPick(nowMs);
    }

    if (
      this.phase === "pick" &&
      ((this.pickDeadlineAtMs !== undefined &&
        nowMs >= this.pickDeadlineAtMs) ||
        this.allParticipantsPicked())
    ) {
      return this.transitionToCombat(nowMs);
    }

    return [];
  }

  private transitionToPick(nowMs: number): RoomAdvanceEvent[] {
    if (this.phase !== "lobby") {
      return [];
    }

    this.fillBots();
    this.assignBotPicks();
    this.phase = "pick";
    this.pickDeadlineAtMs = nowMs + MATCH_TIMERS.pickSec * 1000;
    return ["lobbyState", "pickState"];
  }

  private transitionToCombat(nowMs: number): RoomAdvanceEvent[] {
    if (this.phase !== "pick") {
      return [];
    }

    this.assignMissingHumanPicks();
    const matchState = createInitialMatchState(
      this.seed,
      this.sortedParticipants().map((participant) => ({
        playerId: participant.playerId,
        archetypeId: participant.archetypeId!,
      })),
      this.entityIds,
    );

    this.world = matchState.world;
    this.privateStates = matchState.privateStates;
    this.currentMatchId = newOpaqueToken();
    this.matchEnd = undefined;
    this.pendingFinishedMatchSummary = undefined;
    this.rematchDeadlineAtMs = undefined;
    this.rematchYesPlayerIds.clear();
    this.combatInputQueue.length = 0;
    this.pendingEvents.length = 0;
    this.combatIntents.clear();
    this.combatPlayerRuntime.clear();
    this.rocketRuntime.clear();
    this.cacheRespawnAtTicks.length = 0;
    this.snapshotHistory.length = 0;
    this.planetPositionHistory.clear();
    this.botControllers.clear();
    for (const participant of this.sortedParticipants()) {
      this.combatIntents.set(participant.playerId, {
        mouseDir: { ...DEFAULT_INPUT_DIR },
        shieldAimDir: { ...DEFAULT_INPUT_DIR },
        boostHeld: false,
        boostActive: false,
        lastInputClientTick: -1,
      });
      this.combatPlayerRuntime.set(participant.playerId, {
        kills: 0,
        nearMisses: 0,
        damageDealt: 0,
      });
      const difficulty = this.botDifficultyFor(participant.playerId);
      if (difficulty !== null) {
        this.ensureBotController(participant.playerId, difficulty);
      }
    }
    this.tick = 0;
    this.recordPlanetPositions();
    this.phase = "combat";
    this.combatStartedAtMs = nowMs;
    return ["pickState", "combatStarted"];
  }

  private restartForRematch(nowMs: number): void {
    this.world = undefined;
    this.privateStates.clear();
    this.currentMatchId = undefined;
    this.matchEnd = undefined;
    this.pendingFinishedMatchSummary = undefined;
    this.combatStartedAtMs = undefined;
    this.rematchDeadlineAtMs = undefined;
    this.rematchYesPlayerIds.clear();
    this.combatInputQueue.length = 0;
    this.pendingEvents.length = 0;
    this.combatIntents.clear();
    this.combatPlayerRuntime.clear();
    this.rocketRuntime.clear();
    this.cacheRespawnAtTicks.length = 0;
    this.snapshotHistory.length = 0;
    this.planetPositionHistory.clear();
    this.botControllers.clear();
    this.tick = 0;
    this.phase = "pick";
    this.pickDeadlineAtMs = nowMs + MATCH_TIMERS.pickSec * 1000;

    for (const participant of this.sortedParticipants()) {
      participant.ready = false;
      participant.lockedIn = false;
      participant.archetypeId = undefined;
    }

    this.assignBotPicks();
  }

  private fillBots(): void {
    while (this.size < ROOM_CAPACITY) {
      const seat = this.nextOpenSeat();
      if (seat === null) {
        return;
      }

      const playerId = `bot:${this.id}:${seat}` as PlayerId;

      this.participants.set(playerId, {
        playerId,
        name: botNameForSeat(seat),
        seat,
        isBot: true,
        connected: false,
        ready: true,
        resumeToken: `bot:${playerId}` as ResumeToken,
        profileTokenHash: `bot:${playerId}`,
        difficulty: this.botDifficulty,
        lockedIn: true,
      });
    }
  }

  private assignBotPicks(): void {
    const bots = this.sortedParticipants().filter(
      (participant) => participant.isBot,
    );
    this.assignArchetypes(bots, BOT_PICK_SEED_SALT);
  }

  private assignMissingHumanPicks(): void {
    const humansMissingPicks = this.sortedParticipants().filter(
      (participant) =>
        !participant.isBot && participant.archetypeId === undefined,
    );
    this.assignArchetypes(humansMissingPicks, HUMAN_AUTOFILL_SEED_SALT);
  }

  private assignArchetypes(targets: RoomParticipant[], seedSalt: number): void {
    if (targets.length === 0) {
      return;
    }

    const usedArchetypes = new Set<ArchetypeId>(
      this.sortedParticipants()
        .map((participant) => participant.archetypeId)
        .filter(
          (archetypeId): archetypeId is ArchetypeId =>
            archetypeId !== undefined,
        ),
    );
    const available = ARCHETYPE_IDS.filter(
      (archetypeId) => !usedArchetypes.has(archetypeId),
    );
    const rng = createRoomRng(this.seed ^ seedSalt);

    for (const participant of targets.sort(bySeat)) {
      const nextPool = available.length > 0 ? available : [...ARCHETYPE_IDS];
      const index = Math.floor(rng() * nextPool.length);
      const archetypeId = nextPool[index]!;

      participant.archetypeId = archetypeId;
      participant.lockedIn = true;

      const availableIndex = available.indexOf(archetypeId);
      if (availableIndex >= 0) {
        available.splice(availableIndex, 1);
      }
    }
  }

  private hasHumanParticipants(): boolean {
    return this.sortedParticipants().some((participant) => !participant.isBot);
  }

  private allParticipantsPicked(): boolean {
    return this.sortedParticipants().every(
      (participant) => participant.archetypeId !== undefined,
    );
  }

  private nextOpenSeat(): number | null {
    for (let seat = 0; seat < ROOM_CAPACITY; seat += 1) {
      const occupied = this.sortedParticipants().some(
        (participant) => participant.seat === seat,
      );
      if (!occupied) {
        return seat;
      }
    }

    return null;
  }

  private sortedParticipants(): RoomParticipant[] {
    return [...this.participants.values()].sort(bySeat);
  }

  private neededRematchVotes(): number {
    const humanCount = this.sortedParticipants().filter(
      (participant) => !participant.isBot,
    ).length;
    return Math.max(1, Math.floor(humanCount / 2) + 1);
  }

  private refreshIdleState(nowMs: number): void {
    if (this.hasConnectedHumans() || this.hasActiveReclaim(nowMs)) {
      this.idleSinceMs = undefined;
      return;
    }

    this.idleSinceMs ??= nowMs;
  }
}

const pickMatchMvp = (stats: MatchStats[], winnerId?: PlayerId): MatchMvp => {
  const best = [...stats].sort((left, right) => {
    if (left.kills !== right.kills) {
      return right.kills - left.kills;
    }
    if (left.damageDealt !== right.damageDealt) {
      return right.damageDealt - left.damageDealt;
    }
    return right.survivalMs - left.survivalMs;
  })[0] ?? {
    playerId: winnerId ?? ("unknown" as PlayerId),
    kills: 0,
    survivalMs: 0,
    nearMisses: 0,
    damageDealt: 0,
  };

  if (best.kills > 0) {
    return {
      playerId: best.playerId,
      reason: `${best.kills} kill${best.kills === 1 ? "" : "s"}`,
    };
  }

  if (winnerId !== undefined) {
    return {
      playerId: winnerId,
      reason: "Last alive",
    };
  }

  return {
    playerId: best.playerId,
    reason: "Longest survival",
  };
};

const rankMatchPlacements = (stats: MatchStats[]): Map<PlayerId, number> => {
  const placements = new Map<PlayerId, number>();
  const ordered = [...stats].sort((left, right) => {
    if (left.survivalMs !== right.survivalMs) {
      return right.survivalMs - left.survivalMs;
    }
    if (left.kills !== right.kills) {
      return right.kills - left.kills;
    }
    if (left.damageDealt !== right.damageDealt) {
      return right.damageDealt - left.damageDealt;
    }
    return right.nearMisses - left.nearMisses;
  });

  ordered.forEach((entry, index) => {
    placements.set(entry.playerId, index + 1);
  });

  return placements;
};

const createRoomRng = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};
