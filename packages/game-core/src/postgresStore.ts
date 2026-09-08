// Postgres implementations of every store contract, selected only when
// DATABASE_URL is set. `pg` is an optional runtime dependency: it is loaded
// through a lazy dynamic import so that `npm run check` typechecks and runs with
// no database and without the driver installed. The tables come from the numbered
// migration in migrations/.

import type { EventStore, GameEvent, EventInput } from './eventStore.ts';
import type {
  OutcomeStore,
  AchievementStore,
  SnapshotStore,
  GameOutcome,
  LeaderboardEntry,
  PlayerAchievement,
  GameSnapshot,
} from './stores.ts';

// A structural subset of node-postgres' Pool, so this module needs no `pg` types.
export interface Pool {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
}

// The indirect specifier stops TypeScript from resolving `pg` at build time, so a
// missing driver is only an error at run time when DATABASE_URL is actually set.
async function loadPg(): Promise<{ Pool: new (config: { connectionString: string }) => Pool }> {
  const spec = 'pg';
  const mod = (await import(spec)) as { default?: unknown; Pool?: unknown };
  const root = (mod.default ?? mod) as { Pool: new (config: { connectionString: string }) => Pool };
  return root;
}

export function createPostgresPool(databaseUrl: string): Pool {
  let real: Pool | undefined;
  async function ensure(): Promise<Pool> {
    if (!real) {
      const pg = await loadPg();
      real = new pg.Pool({ connectionString: databaseUrl });
    }
    return real;
  }
  return {
    async query(text, params) {
      return (await ensure()).query(text, params);
    },
    async end() {
      if (real) await real.end();
    },
  };
}

export function createPostgresEventStore(pool: Pool): EventStore {
  return {
    async append(gameId: string, event: EventInput): Promise<GameEvent> {
      const timestamp = Date.now();
      const { rows } = await pool.query(
        `INSERT INTO game_events (game_id, sequence, type, payload, timestamp, state_hash)
         VALUES ($1,
                 COALESCE((SELECT MAX(sequence) + 1 FROM game_events WHERE game_id = $1), 0),
                 $2, $3::jsonb, $4, $5)
         RETURNING game_id AS "gameId", sequence, type, payload, timestamp, state_hash AS "stateHash"`,
        [gameId, event.type, JSON.stringify(event.payload), timestamp, event.stateHash],
      );
      const r = rows[0];
      return {
        gameId: r.gameId as string,
        sequence: Number(r.sequence),
        type: r.type as string,
        payload: r.payload,
        timestamp: Number(r.timestamp),
        stateHash: r.stateHash as string,
      };
    },
    async readLog(gameId: string): Promise<GameEvent[]> {
      const { rows } = await pool.query(
        `SELECT game_id AS "gameId", sequence, type, payload, timestamp, state_hash AS "stateHash"
         FROM game_events WHERE game_id = $1 ORDER BY sequence ASC`,
        [gameId],
      );
      return rows.map((r) => ({
        gameId: r.gameId as string,
        sequence: Number(r.sequence),
        type: r.type as string,
        payload: r.payload,
        timestamp: Number(r.timestamp),
        stateHash: r.stateHash as string,
      }));
    },
  };
}

export function createPostgresOutcomeStore(pool: Pool): OutcomeStore {
  return {
    async recordOutcome(outcome: GameOutcome): Promise<void> {
      await pool.query(`INSERT INTO games (game_id) VALUES ($1) ON CONFLICT (game_id) DO NOTHING`, [
        outcome.gameId,
      ]);
      for (const p of outcome.players) {
        await pool.query(
          `INSERT INTO game_players (game_id, player_id, win, score) VALUES ($1, $2, $3, $4)`,
          [outcome.gameId, p.playerId, p.win, p.score],
        );
      }
    },
    async queryLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
      const { rows } = await pool.query(
        `SELECT player_id AS "playerId",
                COUNT(*) FILTER (WHERE win) AS wins,
                COALESCE(SUM(score), 0) AS "totalScore"
         FROM game_players
         GROUP BY player_id
         ORDER BY wins DESC, "totalScore" DESC, player_id ASC
         LIMIT $1`,
        [limit],
      );
      return rows.map((r) => ({
        playerId: r.playerId as string,
        wins: Number(r.wins),
        totalScore: Number(r.totalScore),
      }));
    },
  };
}

export function createPostgresAchievementStore(pool: Pool): AchievementStore {
  return {
    async grant(playerId: string, achievement: PlayerAchievement): Promise<void> {
      await pool.query(
        `INSERT INTO game_achievements (player_id, achievement_id, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (player_id, achievement_id) DO NOTHING`,
        [playerId, achievement.id, achievement.name],
      );
    },
    async list(playerId: string): Promise<PlayerAchievement[]> {
      const { rows } = await pool.query(
        `SELECT achievement_id AS "id", name FROM game_achievements WHERE player_id = $1 ORDER BY achievement_id ASC`,
        [playerId],
      );
      return rows.map((r) => ({ id: r.id as string, name: r.name as string }));
    },
  };
}

export function createPostgresSnapshotStore(pool: Pool): SnapshotStore {
  return {
    async save(gameId: string, snapshot: GameSnapshot): Promise<void> {
      await pool.query(
        `INSERT INTO game_snapshots (game_id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (game_id) DO UPDATE SET data = EXCLUDED.data`,
        [gameId, JSON.stringify(snapshot)],
      );
    },
    async load(gameId: string): Promise<GameSnapshot | undefined> {
      const { rows } = await pool.query(`SELECT data FROM game_snapshots WHERE game_id = $1`, [
        gameId,
      ]);
      if (rows.length === 0) return undefined;
      return rows[0].data as GameSnapshot;
    },
  };
}
