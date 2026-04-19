import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import type { PlayerId, PlayerName } from "@3body/shared";
import { newPlayerId } from "./ids";
import { log } from "./log";
import type { FinishedMatchSummary } from "./room";
import { openDatabase } from "./db";

const LEADERBOARD_LIMIT_MIN = 1;
const LEADERBOARD_LIMIT_MAX = 50;

const clampLeaderboardLimit = (limit: number): number =>
  Math.min(
    LEADERBOARD_LIMIT_MAX,
    Math.max(LEADERBOARD_LIMIT_MIN, Math.trunc(limit) || LEADERBOARD_LIMIT_MAX),
  );

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const serializeError = (error: unknown): Record<string, unknown> =>
  error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    : { error: String(error) };

const hashProfileToken = (profileToken: string): string =>
  createHash("sha256").update(profileToken).digest("hex");

const leaderboardMetricOrderBy = {
  wins: "stats.wins DESC, stats.updatedAtMs DESC, stats.playerId ASC",
  kills: "stats.kills DESC, stats.updatedAtMs DESC, stats.playerId ASC",
  bestSurvivalMs:
    "stats.bestSurvivalMs DESC, stats.updatedAtMs DESC, stats.playerId ASC",
  damageDealt:
    "stats.damageDealt DESC, stats.updatedAtMs DESC, stats.playerId ASC",
} as const;

type LeaderboardMetric = keyof typeof leaderboardMetricOrderBy;

export const isLeaderboardMetric = (
  value: string,
): value is LeaderboardMetric => value in leaderboardMetricOrderBy;

interface ResolvedPlayerIdentity {
  playerId: PlayerId;
  profileTokenHash: string;
}

interface LeaderboardEntry {
  playerId: PlayerId;
  name: PlayerName;
  matchesPlayed: number;
  wins: number;
  kills: number;
  nearMisses: number;
  damageDealt: number;
  totalSurvivalMs: number;
  bestSurvivalMs: number;
  updatedAtMs: number;
}

interface PlayerStatsView {
  player: {
    playerId: PlayerId;
    lastKnownName: PlayerName;
    createdAtMs: number;
    lastSeenAtMs: number;
  };
  stats: {
    matchesPlayed: number;
    wins: number;
    kills: number;
    nearMisses: number;
    damageDealt: number;
    totalSurvivalMs: number;
    bestSurvivalMs: number;
    updatedAtMs: number;
  };
  names: Array<{
    name: PlayerName;
    firstSeenAtMs: number;
    lastSeenAtMs: number;
  }>;
}

export interface DrainStatsWritesResult {
  drained: boolean;
  pendingMatchIds: string[];
}

interface LeaderboardRow extends LeaderboardEntry {}

interface PlayerSummaryRow {
  playerId: PlayerId;
  lastKnownName: PlayerName;
  createdAtMs: number;
  lastSeenAtMs: number;
  matchesPlayed: number | null;
  wins: number | null;
  kills: number | null;
  nearMisses: number | null;
  damageDealt: number | null;
  totalSurvivalMs: number | null;
  bestSurvivalMs: number | null;
  updatedAtMs: number | null;
}

interface PlayerNameRow {
  name: PlayerName;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
}

export class StatsStore {
  readonly #db: Database;
  readonly #selectPlayerIdByProfileHash;
  readonly #insertPlayerIdentity;
  readonly #updatePlayerIdentity;
  readonly #upsertPlayerName;
  readonly #selectMatchById;
  readonly #insertMatch;
  readonly #insertMatchPlayer;
  readonly #upsertPlayerStats;
  readonly #selectPlayerStats;
  readonly #selectPlayerNames;
  readonly #leaderboardQueries: Record<
    LeaderboardMetric,
    ReturnType<Database["prepare"]>
  >;
  readonly #resolvePlayerIdentityTx;
  readonly #persistFinishedMatchTx;

  readonly #pendingJobs: FinishedMatchSummary[] = [];
  readonly #queuedMatchIds = new Set<string>();
  readonly #failedJobs = new Map<string, FinishedMatchSummary>();

  #processing = false;
  #closed = false;

  constructor(dataDir: string) {
    this.#db = openDatabase(dataDir);
    this.#selectPlayerIdByProfileHash = this.#db.prepare(
      "SELECT id FROM players WHERE profileTokenHash = ?",
    );
    this.#insertPlayerIdentity = this.#db.prepare(`
      INSERT INTO players (
        id,
        profileTokenHash,
        createdAtMs,
        lastSeenAtMs,
        lastKnownName
      ) VALUES (?, ?, ?, ?, ?)
    `);
    this.#updatePlayerIdentity = this.#db.prepare(`
      INSERT INTO players (
        id,
        profileTokenHash,
        createdAtMs,
        lastSeenAtMs,
        lastKnownName
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        profileTokenHash = excluded.profileTokenHash,
        lastSeenAtMs = excluded.lastSeenAtMs,
        lastKnownName = excluded.lastKnownName
    `);
    this.#upsertPlayerName = this.#db.prepare(`
      INSERT INTO player_names (
        playerId,
        name,
        firstSeenAtMs,
        lastSeenAtMs
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(playerId, name) DO UPDATE SET
        lastSeenAtMs = excluded.lastSeenAtMs
    `);
    this.#selectMatchById = this.#db.prepare(
      "SELECT id FROM matches WHERE id = ?",
    );
    this.#insertMatch = this.#db.prepare(`
      INSERT INTO matches (
        id,
        roomKind,
        seed,
        startedAtMs,
        endedAtMs,
        durationMs,
        winnerPlayerId,
        reason,
        mvpPlayerId,
        mvpReason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.#insertMatchPlayer = this.#db.prepare(`
      INSERT INTO match_players (
        matchId,
        playerId,
        seat,
        isBot,
        nameAtMatch,
        archetypeId,
        placement,
        kills,
        survivalMs,
        nearMisses,
        damageDealt,
        won
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.#upsertPlayerStats = this.#db.prepare(`
      INSERT INTO player_stats (
        playerId,
        matchesPlayed,
        wins,
        kills,
        nearMisses,
        damageDealt,
        totalSurvivalMs,
        bestSurvivalMs,
        updatedAtMs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(playerId) DO UPDATE SET
        matchesPlayed = player_stats.matchesPlayed + excluded.matchesPlayed,
        wins = player_stats.wins + excluded.wins,
        kills = player_stats.kills + excluded.kills,
        nearMisses = player_stats.nearMisses + excluded.nearMisses,
        damageDealt = player_stats.damageDealt + excluded.damageDealt,
        totalSurvivalMs = player_stats.totalSurvivalMs + excluded.totalSurvivalMs,
        bestSurvivalMs = MAX(player_stats.bestSurvivalMs, excluded.bestSurvivalMs),
        updatedAtMs = excluded.updatedAtMs
    `);
    this.#selectPlayerStats = this.#db.prepare(`
      SELECT
        players.id AS playerId,
        players.lastKnownName AS lastKnownName,
        players.createdAtMs AS createdAtMs,
        players.lastSeenAtMs AS lastSeenAtMs,
        stats.matchesPlayed AS matchesPlayed,
        stats.wins AS wins,
        stats.kills AS kills,
        stats.nearMisses AS nearMisses,
        stats.damageDealt AS damageDealt,
        stats.totalSurvivalMs AS totalSurvivalMs,
        stats.bestSurvivalMs AS bestSurvivalMs,
        stats.updatedAtMs AS updatedAtMs
      FROM players
      LEFT JOIN player_stats AS stats ON stats.playerId = players.id
      WHERE players.id = ?
    `);
    this.#selectPlayerNames = this.#db.prepare(`
      SELECT
        name,
        firstSeenAtMs,
        lastSeenAtMs
      FROM player_names
      WHERE playerId = ?
      ORDER BY lastSeenAtMs DESC, name ASC
      LIMIT 16
    `);
    this.#leaderboardQueries = {
      wins: this.#db.prepare(`
        SELECT
          stats.playerId AS playerId,
          players.lastKnownName AS name,
          stats.matchesPlayed AS matchesPlayed,
          stats.wins AS wins,
          stats.kills AS kills,
          stats.nearMisses AS nearMisses,
          stats.damageDealt AS damageDealt,
          stats.totalSurvivalMs AS totalSurvivalMs,
          stats.bestSurvivalMs AS bestSurvivalMs,
          stats.updatedAtMs AS updatedAtMs
        FROM player_stats AS stats
        JOIN players ON players.id = stats.playerId
        ORDER BY ${leaderboardMetricOrderBy.wins}
        LIMIT ?
      `),
      kills: this.#db.prepare(`
        SELECT
          stats.playerId AS playerId,
          players.lastKnownName AS name,
          stats.matchesPlayed AS matchesPlayed,
          stats.wins AS wins,
          stats.kills AS kills,
          stats.nearMisses AS nearMisses,
          stats.damageDealt AS damageDealt,
          stats.totalSurvivalMs AS totalSurvivalMs,
          stats.bestSurvivalMs AS bestSurvivalMs,
          stats.updatedAtMs AS updatedAtMs
        FROM player_stats AS stats
        JOIN players ON players.id = stats.playerId
        ORDER BY ${leaderboardMetricOrderBy.kills}
        LIMIT ?
      `),
      bestSurvivalMs: this.#db.prepare(`
        SELECT
          stats.playerId AS playerId,
          players.lastKnownName AS name,
          stats.matchesPlayed AS matchesPlayed,
          stats.wins AS wins,
          stats.kills AS kills,
          stats.nearMisses AS nearMisses,
          stats.damageDealt AS damageDealt,
          stats.totalSurvivalMs AS totalSurvivalMs,
          stats.bestSurvivalMs AS bestSurvivalMs,
          stats.updatedAtMs AS updatedAtMs
        FROM player_stats AS stats
        JOIN players ON players.id = stats.playerId
        ORDER BY ${leaderboardMetricOrderBy.bestSurvivalMs}
        LIMIT ?
      `),
      damageDealt: this.#db.prepare(`
        SELECT
          stats.playerId AS playerId,
          players.lastKnownName AS name,
          stats.matchesPlayed AS matchesPlayed,
          stats.wins AS wins,
          stats.kills AS kills,
          stats.nearMisses AS nearMisses,
          stats.damageDealt AS damageDealt,
          stats.totalSurvivalMs AS totalSurvivalMs,
          stats.bestSurvivalMs AS bestSurvivalMs,
          stats.updatedAtMs AS updatedAtMs
        FROM player_stats AS stats
        JOIN players ON players.id = stats.playerId
        ORDER BY ${leaderboardMetricOrderBy.damageDealt}
        LIMIT ?
      `),
    };

    this.#resolvePlayerIdentityTx = this.#db.transaction(
      (
        profileTokenHash: string,
        lastKnownName: PlayerName,
        nowMs: number,
      ): ResolvedPlayerIdentity => {
        const existing = this.#selectPlayerIdByProfileHash.get(
          profileTokenHash,
        ) as { id: PlayerId } | null;
        if (existing) {
          this.#updatePlayerIdentity.run(
            existing.id,
            profileTokenHash,
            nowMs,
            nowMs,
            lastKnownName,
          );
          this.#upsertPlayerName.run(existing.id, lastKnownName, nowMs, nowMs);
          return {
            playerId: existing.id,
            profileTokenHash,
          };
        }

        const playerId = newPlayerId() as PlayerId;
        this.#insertPlayerIdentity.run(
          playerId,
          profileTokenHash,
          nowMs,
          nowMs,
          lastKnownName,
        );
        this.#upsertPlayerName.run(playerId, lastKnownName, nowMs, nowMs);
        return {
          playerId,
          profileTokenHash,
        };
      },
    );
    this.#persistFinishedMatchTx = this.#db.transaction(
      (summary: FinishedMatchSummary): boolean => {
        const existing = this.#selectMatchById.get(summary.id) as {
          id: string;
        } | null;
        if (existing) {
          return false;
        }

        this.#insertMatch.run(
          summary.id,
          summary.roomKind,
          summary.seed,
          summary.startedAtMs,
          summary.endedAtMs,
          summary.durationMs,
          summary.winnerPlayerId ?? null,
          summary.reason,
          summary.mvpPlayerId ?? null,
          summary.mvpReason,
        );

        for (const player of summary.players) {
          if (!player.isBot && player.playerId && player.profileTokenHash) {
            this.#updatePlayerIdentity.run(
              player.playerId,
              player.profileTokenHash,
              summary.startedAtMs,
              summary.endedAtMs,
              player.nameAtMatch,
            );
            this.#upsertPlayerName.run(
              player.playerId,
              player.nameAtMatch,
              summary.startedAtMs,
              summary.endedAtMs,
            );
            this.#upsertPlayerStats.run(
              player.playerId,
              1,
              player.won ? 1 : 0,
              player.kills,
              player.nearMisses,
              player.damageDealt,
              player.survivalMs,
              player.survivalMs,
              summary.endedAtMs,
            );
          }

          this.#insertMatchPlayer.run(
            summary.id,
            player.isBot ? null : (player.playerId ?? null),
            player.seat,
            player.isBot ? 1 : 0,
            player.nameAtMatch,
            player.archetypeId ?? null,
            player.placement ?? null,
            player.kills,
            player.survivalMs,
            player.nearMisses,
            player.damageDealt,
            player.won ? 1 : 0,
          );
        }

        return true;
      },
    );
  }

  resolvePlayerIdentity(
    profileToken: string,
    lastKnownName: PlayerName,
    nowMs = Date.now(),
  ): ResolvedPlayerIdentity {
    return this.#resolvePlayerIdentityTx(
      hashProfileToken(profileToken),
      lastKnownName,
      nowMs,
    );
  }

  enqueueFinishedMatch(summary: FinishedMatchSummary): void {
    if (this.#closed) {
      log.warn("stats_write_skipped", {
        matchId: summary.id,
        roomId: summary.roomId,
        reason: "stats_store_closed",
      });
      this.#failedJobs.set(summary.id, summary);
      return;
    }

    if (
      this.#queuedMatchIds.has(summary.id) ||
      this.#failedJobs.has(summary.id)
    ) {
      return;
    }

    this.#queuedMatchIds.add(summary.id);
    this.#pendingJobs.push(summary);
    this.processJobsSoon();
  }

  getLeaderboard(
    metric: LeaderboardMetric,
    limit = LEADERBOARD_LIMIT_MAX,
  ): LeaderboardEntry[] {
    const statement = this.#leaderboardQueries[metric];
    return statement.all(clampLeaderboardLimit(limit)) as LeaderboardRow[];
  }

  getPlayerStats(playerId: PlayerId): PlayerStatsView | null {
    const player = this.#selectPlayerStats.get(
      playerId,
    ) as PlayerSummaryRow | null;
    if (!player) {
      return null;
    }

    const names = this.#selectPlayerNames.all(playerId) as PlayerNameRow[];
    return {
      player: {
        playerId: player.playerId,
        lastKnownName: player.lastKnownName,
        createdAtMs: player.createdAtMs,
        lastSeenAtMs: player.lastSeenAtMs,
      },
      stats: {
        matchesPlayed: player.matchesPlayed ?? 0,
        wins: player.wins ?? 0,
        kills: player.kills ?? 0,
        nearMisses: player.nearMisses ?? 0,
        damageDealt: player.damageDealt ?? 0,
        totalSurvivalMs: player.totalSurvivalMs ?? 0,
        bestSurvivalMs: player.bestSurvivalMs ?? 0,
        updatedAtMs: player.updatedAtMs ?? player.lastSeenAtMs,
      },
      names,
    };
  }

  pendingMatchIds(): string[] {
    return [
      ...new Set([
        ...this.#pendingJobs.map((job) => job.id),
        ...this.#queuedMatchIds,
        ...this.#failedJobs.keys(),
      ]),
    ];
  }

  async drainWrites(timeoutMs: number): Promise<DrainStatsWritesResult> {
    if (this.#failedJobs.size > 0 && this.#pendingJobs.length === 0) {
      this.requeueFailedJobs();
    }

    const deadlineAtMs = Date.now() + Math.max(0, timeoutMs);
    while (Date.now() <= deadlineAtMs) {
      if (!this.#processing && this.#pendingJobs.length === 0) {
        if (this.#failedJobs.size === 0) {
          return {
            drained: true,
            pendingMatchIds: [],
          };
        }

        break;
      }

      await sleep(25);
    }

    return {
      drained: false,
      pendingMatchIds: this.pendingMatchIds(),
    };
  }

  close(): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#db.close();
  }

  private processJobsSoon(): void {
    if (this.#processing) {
      return;
    }

    this.#processing = true;
    queueMicrotask(() => {
      try {
        while (this.#pendingJobs.length > 0) {
          const summary = this.#pendingJobs.shift()!;
          try {
            const persisted = this.#persistFinishedMatchTx(summary);
            this.#failedJobs.delete(summary.id);
            if (persisted) {
              log.info("stats_write_succeeded", {
                matchId: summary.id,
                roomId: summary.roomId,
              });
            }
          } catch (error) {
            this.#failedJobs.set(summary.id, summary);
            log.error("stats_write_failed", {
              matchId: summary.id,
              roomId: summary.roomId,
              ...serializeError(error),
            });
          } finally {
            this.#queuedMatchIds.delete(summary.id);
          }
        }
      } finally {
        this.#processing = false;
      }
    });
  }

  private requeueFailedJobs(): void {
    for (const [matchId, summary] of this.#failedJobs) {
      this.#failedJobs.delete(matchId);
      if (this.#queuedMatchIds.has(matchId)) {
        continue;
      }
      this.#queuedMatchIds.add(matchId);
      this.#pendingJobs.push(summary);
    }
    this.processJobsSoon();
  }
}
