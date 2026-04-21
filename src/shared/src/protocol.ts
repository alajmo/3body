import type {
  ArchetypeId,
  BlackHole,
  Cache,
  CacheContents,
  Debris,
  EntityId,
  NeutronStar,
  PlanetPrivateState,
  PlanetPublic,
  PlayerId,
  Rocket,
  RocketKind,
  Sun,
  WildcardKind,
  World,
} from "./entities";
import type { Vec2 } from "./vec2";

export type ProfileToken = string;
export type ResumeToken = string;
export type PlayerName = string;
export type RoomId = string;
export type RoomKind = "private" | "public";
export type PlayerRole = "host" | "player" | "spectator";
export type BotDifficulty = "easy" | "normal" | "hard";
export type AbilitySlot = "q" | "w" | "g";
export type ErrorCode =
  | "invalid_room"
  | "room_full"
  | "server_full"
  | "bad_resume_token"
  | "name_invalid"
  | "not_host"
  | "phase_invalid"
  | "invalid_action"
  | "invalid_message"
  | "rate_limited";

export type JoinRequest =
  | { kind: "createRoom" }
  | { kind: "quickGame" }
  | { kind: "joinRoom"; roomId: RoomId };

export interface RoomRosterEntry {
  playerId: PlayerId;
  name: PlayerName;
  seat: number;
  isBot: boolean;
}

export interface LobbyPlayerSummary {
  playerId: PlayerId;
  name: PlayerName;
  seat: number;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
  archetypeId?: ArchetypeId;
  difficulty?: BotDifficulty;
}

export interface PickEntry {
  playerId: PlayerId;
  archetypeId?: ArchetypeId;
  lockedIn: boolean;
  isBot: boolean;
}

export interface SnapshotDelta {
  suns?: Sun[];
  neutronStars?: NeutronStar[];
  planets?: PlanetPublic[];
  rockets?: Rocket[];
  caches?: Cache[];
  debris?: Debris[];
  blackHole?: BlackHole | null;
}

export interface SnapshotRemoved {
  suns?: EntityId[];
  neutronStars?: EntityId[];
  planets?: EntityId[];
  rockets?: EntityId[];
  caches?: EntityId[];
  debris?: EntityId[];
  blackHole?: true;
}

export type SnapshotEvent =
  | {
      kind: "hit";
      tick: number;
      victimPlanetId: EntityId;
      attackerPlayerId?: PlayerId;
      rocketId: EntityId;
      rocketKind: RocketKind;
      damage: number;
      hpAfter: number;
      absorbedByShield: boolean;
    }
  | {
      kind: "kill";
      tick: number;
      victimPlayerId: PlayerId;
      victimPlanetId: EntityId;
      killerPlayerId?: PlayerId;
      cause:
        | "rocket"
        | "sun"
        | "neutronStar"
        | "planetCollision"
        | "boundaryAsteroid"
        | "boundary"
        | "blackHole";
    }
  | {
      kind: "cachePickup";
      tick: number;
      playerId: PlayerId;
      planetId: EntityId;
      contents: CacheContents;
    }
  | {
      kind: "boost";
      tick: number;
      playerId: PlayerId;
      planetId: EntityId;
    }
  | {
      kind: "wildcardRoll";
      tick: number;
      playerId: PlayerId;
      wildcard: WildcardKind;
    }
  | {
      kind: "wildcardUse";
      tick: number;
      playerId: PlayerId;
      wildcard: WildcardKind;
    }
  | {
      kind: "blackHoleSpawn";
      tick: number;
      blackHoleId: EntityId;
    };

export interface MatchStats {
  playerId: PlayerId;
  kills: number;
  survivalMs: number;
  nearMisses: number;
  damageDealt: number;
}

export interface MatchMvp {
  playerId: PlayerId;
  reason: string;
}

export interface HelloMsg {
  type: "hello";
  name: string;
  join: JoinRequest;
  profileToken?: ProfileToken;
  resumeToken?: ResumeToken;
}

export interface SetBotDifficultyMsg {
  type: "setBotDifficulty";
  difficulty: BotDifficulty;
}

export interface PickArchetypeMsg {
  type: "pickArchetype";
  id: ArchetypeId;
}

export interface ReadyToggleMsg {
  type: "readyToggle";
}

export interface HostStartMsg {
  type: "hostStart";
}

export interface InputMsg {
  type: "input";
  mouseDir: Vec2;
  clientTick: number;
}

export interface AckSnapshotMsg {
  type: "ackSnapshot";
  tick: number;
}

export interface PingMsg {
  type: "ping";
  id: string;
  clientSentAtMs: number;
}

export interface FireRocketMsg {
  type: "fireRocket";
  kind: RocketKind;
  aimDir: Vec2;
  targetId?: EntityId;
  clientTick: number;
}

export interface AbilityMsg {
  type: "ability";
  slot: AbilitySlot;
  aimDir?: Vec2;
}

export interface ShieldAimMsg {
  type: "shieldAim";
  dir: Vec2;
}

export interface ChatMsg {
  type: "chat";
  text: string;
}

export interface VoteRematchMsg {
  type: "voteRematch";
  yes: boolean;
}

export type ClientMsg =
  | HelloMsg
  | SetBotDifficultyMsg
  | PickArchetypeMsg
  | ReadyToggleMsg
  | HostStartMsg
  | InputMsg
  | AckSnapshotMsg
  | PingMsg
  | FireRocketMsg
  | AbilityMsg
  | ShieldAimMsg
  | ChatMsg
  | VoteRematchMsg;

export interface WelcomeMsg {
  type: "welcome";
  playerId: PlayerId;
  profileToken: ProfileToken;
  roomId: RoomId;
  roomKind: RoomKind;
  resumeToken: ResumeToken;
  role: PlayerRole;
  roster: RoomRosterEntry[];
}

export interface ErrorMsg {
  type: "error";
  code: ErrorCode;
  message: string;
}

export interface PongMsg {
  type: "pong";
  id: string;
  clientSentAtMs: number;
  serverSentAtMs: number;
}

export interface LobbyStateMsg {
  type: "lobbyState";
  players: LobbyPlayerSummary[];
  hostPlayerId?: PlayerId;
  autoStartAtMs: number;
  botDifficulty: BotDifficulty;
  roomKind: RoomKind;
}

export interface PickStateMsg {
  type: "pickState";
  picks: PickEntry[];
  deadlineAtMs: number;
}

export interface CountdownMsg {
  type: "countdown";
  endsAtMs: number;
}

export interface FullSnapshotMsg {
  type: "fullSnapshot";
  tick: number;
  world: World;
  self: PlanetPrivateState | null;
}

export interface DeltaSnapshotMsg {
  type: "deltaSnapshot";
  tick: number;
  baseTick: number;
  changed: SnapshotDelta;
  removed: SnapshotRemoved;
  self?: PlanetPrivateState | null;
}

export interface EventMsg {
  type: "event";
  event: SnapshotEvent;
}

export interface ChatMessageMsg {
  type: "chatMessage";
  fromPlayerId: PlayerId;
  text: string;
  atMs: number;
}

export interface RematchStateMsg {
  type: "rematchState";
  yesPlayerIds: PlayerId[];
  neededVotes: number;
  deadlineAtMs: number;
}

export interface MatchEndMsg {
  type: "matchEnd";
  winnerId?: PlayerId;
  reason: "lastAlive" | "mutualKill";
  mvp: MatchMvp;
  stats: MatchStats[];
  rematchDeadlineAtMs: number;
}

export type ServerMsg =
  | WelcomeMsg
  | ErrorMsg
  | PongMsg
  | LobbyStateMsg
  | PickStateMsg
  | CountdownMsg
  | FullSnapshotMsg
  | DeltaSnapshotMsg
  | EventMsg
  | ChatMessageMsg
  | RematchStateMsg
  | MatchEndMsg;

export const PLAYER_NAME_MIN_LENGTH = 1;
export const PLAYER_NAME_MAX_LENGTH = 16;

const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f-\u009f]/u;

export const normalizePlayerName = (value: string): PlayerName | null => {
  if (CONTROL_CHAR_RE.test(value)) {
    return null;
  }

  const normalized = value.trim().replace(/ +/g, " ");
  if (
    normalized.length < PLAYER_NAME_MIN_LENGTH ||
    normalized.length > PLAYER_NAME_MAX_LENGTH
  ) {
    return null;
  }

  return normalized as PlayerName;
};

export const isPlayerNameValid = (value: string): value is PlayerName =>
  normalizePlayerName(value) !== null;
