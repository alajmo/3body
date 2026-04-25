import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const DB_FILENAME = "3body.sqlite";
const WAL_AUTOCHECKPOINT_PAGES = 1000;

interface Migration {
  version: number;
  sql: string;
}

const migrations: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        profileTokenHash TEXT NOT NULL UNIQUE,
        createdAtMs INTEGER NOT NULL,
        lastSeenAtMs INTEGER NOT NULL,
        lastKnownName TEXT NOT NULL
      );

      CREATE TABLE player_names (
        playerId TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        firstSeenAtMs INTEGER NOT NULL,
        lastSeenAtMs INTEGER NOT NULL,
        PRIMARY KEY (playerId, name)
      );

      CREATE TABLE matches (
        id TEXT PRIMARY KEY,
        seed INTEGER NOT NULL,
        startedAtMs INTEGER NOT NULL,
        endedAtMs INTEGER NOT NULL,
        durationMs INTEGER NOT NULL,
        winnerPlayerId TEXT REFERENCES players(id),
        reason TEXT NOT NULL,
        mvpPlayerId TEXT REFERENCES players(id),
        mvpReason TEXT NOT NULL
      );

      CREATE TABLE match_players (
        matchId TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        playerId TEXT REFERENCES players(id),
        seat INTEGER NOT NULL,
        isBot INTEGER NOT NULL,
        nameAtMatch TEXT NOT NULL,
        archetypeId TEXT,
        placement INTEGER,
        kills INTEGER NOT NULL,
        survivalMs INTEGER NOT NULL,
        nearMisses INTEGER NOT NULL,
        damageDealt INTEGER NOT NULL,
        won INTEGER NOT NULL,
        PRIMARY KEY (matchId, seat)
      );

      CREATE TABLE player_stats (
        playerId TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        matchesPlayed INTEGER NOT NULL,
        wins INTEGER NOT NULL,
        kills INTEGER NOT NULL,
        nearMisses INTEGER NOT NULL,
        damageDealt INTEGER NOT NULL,
        totalSurvivalMs INTEGER NOT NULL,
        bestSurvivalMs INTEGER NOT NULL,
        updatedAtMs INTEGER NOT NULL
      );

      CREATE INDEX idx_match_players_player_id
        ON match_players(playerId);
      CREATE INDEX idx_matches_ended_at
        ON matches(endedAtMs DESC);
      CREATE INDEX idx_player_names_last_seen
        ON player_names(playerId, lastSeenAtMs DESC);
      CREATE INDEX idx_player_stats_wins
        ON player_stats(wins DESC, updatedAtMs DESC);
      CREATE INDEX idx_player_stats_kills
        ON player_stats(kills DESC, updatedAtMs DESC);
      CREATE INDEX idx_player_stats_best_survival
        ON player_stats(bestSurvivalMs DESC, updatedAtMs DESC);
      CREATE INDEX idx_player_stats_damage_dealt
        ON player_stats(damageDealt DESC, updatedAtMs DESC);
    `,
  },
];

const ensureMigrationTable = (db: Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      appliedAtMs INTEGER NOT NULL
    )
  `);
};

const runMigrations = (db: Database): void => {
  ensureMigrationTable(db);

  const appliedVersions = new Set(
    (
      db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all() as Array<{ version: number }>
    ).map((row) => row.version),
  );
  const insertMigration = db.prepare(
    "INSERT INTO schema_migrations (version, appliedAtMs) VALUES (?, ?)",
  );

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    const applyMigration = db.transaction(() => {
      db.exec(migration.sql);
      insertMigration.run(migration.version, Date.now());
    });
    applyMigration();
  }
};

export const openDatabase = (dataDir: string): Database => {
  mkdirSync(dataDir, { recursive: true });

  const db = new Database(join(dataDir, DB_FILENAME));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA wal_autocheckpoint = ${WAL_AUTOCHECKPOINT_PAGES};
  `);
  runMigrations(db);
  return db;
};
